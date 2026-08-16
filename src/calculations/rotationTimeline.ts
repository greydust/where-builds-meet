import type { WeaponId } from "../types";
import { resolveSegmentValue } from "./dynamicValues";

export type EditableObject = Record<string, unknown>;
export type SkillRecord = {
  [key: string]: unknown;
  name?: string;
  shortName?: string;
  castTime?: number;
  cooldown?: number;
  tick?: number;
  duration?: number;
  action?: unknown[];
  modifier?: unknown[];
  tags?: string[];
};
export type AttachedEventTarget = { action: number | "start"; trigger?: number };
export type RotationStep =
  | { type: "skill"; skill?: string; causesBreak?: boolean; condition?: string }
  | { type: "event"; event: "Exhausted"; after: AttachedEventTarget; duration?: number }
  | { type: "event"; event: "Exhausted"; before: AttachedEventTarget; duration?: number }
  | { type: "event"; event: "Move"; before: AttachedEventTarget; distance: number }
  | { type: "event"; event: "HP"; before: AttachedEventTarget; currentHPRatio: number }
  | { type: "event"; event: "Buff"; before: AttachedEventTarget; buff: string; stack?: number }
  | { type: "event"; event: "Debuff"; before: AttachedEventTarget; debuff: string; stack?: number }
  | { type: "event"; event: "Delay"; duration: number }
  | { type: "event"; event: "Controlled" | "BattleEnd" | "ShieldBroken"; startTime: number; duration?: number }
  | { type: "event"; event: "Exhausted"; startTime: number; duration?: number }
  | { type: "event"; event: "Move"; startTime: number; distance: number };
export type RotationRecord = {
  name: string;
  steps: RotationStep[];
  start?: { step: number; action?: number };
  eventTimeReference?: "battleStart";
};
export type TrackedEffect = {
  name: string;
  expiresAt?: number;
  stack?: number;
  maxStack?: number;
  persistent?: boolean;
  sourceRowId?: string;
};
export type InnerWayEffectRule = {
  requirement?: unknown;
  effect: EditableObject;
  trigger?: EditableObject;
  target?: string;
  modify?: EditableObject;
  source: string;
  tier: number;
};
export type TimelineRowKind = "rotation" | "trigger" | "dot";
export type TimelineRow = {
  id: string;
  kind: TimelineRowKind;
  sourceRowId?: string;
  triggerSource?: "skill" | "setup" | "innerWay";
  rotationIndex?: number;
  order: number;
  step: RotationStep;
  startTime: number;
  distance: number;
  currentHPRatio: number;
  effectiveCastTime: number;
  skill?: SkillRecord;
  actions: EditableObject[];
  buffs: TrackedEffect[];
  debuffs: TrackedEffect[];
  modifierEffects: EditableObject[];
  actionStates: Record<
    number,
    { buffs: TrackedEffect[]; debuffs: TrackedEffect[]; distance: number; currentHPRatio: number }
  >;
  skipped?: boolean;
};

export type EffectDefinition = {
  name?: string;
  description?: string;
  refresh?: boolean;
  duration?: number;
  cooldown?: number;
  maxStack?: number;
  damageAttribution?: "sourceCast";
  effect?: unknown[];
  stackEffects?: unknown[][];
};

export type TimelineBuildInput = {
  rotation: RotationRecord;
  skills: Record<string, SkillRecord>;
  eventDefinitions: Record<string, SkillRecord>;
  dots: Record<string, SkillRecord>;
  effectDefinitions: Record<string, EffectDefinition>;
  innerWayConditions: string[];
  innerWayRules: InnerWayEffectRule[];
  setupEffects: EditableObject[];
  weapons: WeaponId[];
  initialBuffs?: TrackedEffect[];
  initialDebuffs?: TrackedEffect[];
};

export const TIMELINE_TIME_EPSILON = 1e-4;

export function compareTimelineTime(left: number, right: number): number {
  const difference = left - right;
  return Math.abs(difference) <= TIMELINE_TIME_EPSILON ? 0 : difference;
}

export function mergeEffectDefinition(definition: EffectDefinition, modify: EditableObject): EffectDefinition {
  const appendedEffects = Array.isArray(modify.effect)
    ? [...(Array.isArray(definition.effect) ? definition.effect : []), ...modify.effect]
    : definition.effect;
  return {
    ...definition,
    ...modify,
    ...(appendedEffects === undefined ? {} : { effect: appendedEffects }),
  };
}

export function requirementsPass(
  requirement: unknown,
  buffs: TrackedEffect[],
  debuffs: TrackedEffect[],
  skillTags: string[],
  innerWayConditions: Set<string>,
  weapons: WeaponId[] = [],
): boolean {
  if (!Array.isArray(requirement)) return true;
  const hasEffect = (target: unknown, value: unknown, requiredStack?: unknown) => {
    if (typeof value !== "string") return false;
    if (target === "skillTag") return skillTags.includes(value);
    if (target === "martialArt") return skillTags.includes(value);
    const trackedEffect = (target === "target" ? debuffs : buffs).find((effect) => effect.name === value);
    if (requiredStack === "max")
      return Boolean(trackedEffect?.maxStack !== undefined && (trackedEffect.stack ?? 0) >= trackedEffect.maxStack);
    if (typeof requiredStack === "number") return Boolean(trackedEffect && (trackedEffect.stack ?? 0) >= requiredStack);
    if (target === "target") return Boolean(trackedEffect);
    return Boolean(trackedEffect) || innerWayConditions.has(value);
  };
  const evaluate = (condition: unknown): boolean => {
    if (Array.isArray(condition)) return condition.every(evaluate);
    if (!condition || typeof condition !== "object") return false;
    const item = condition as EditableObject;
    if (item.operator === "or" && Array.isArray(item.operand)) return item.operand.some(evaluate);
    return hasEffect(item.target, item.value, item.stack);
  };
  return requirement.every(evaluate);
}

function applyTrackedEffect(
  effects: TrackedEffect[],
  name: string,
  stack: number | undefined,
  duration: number | undefined,
  time: number,
  maxStackOverride?: number,
  refresh = true,
  sourceRowId?: string,
) {
  const existing = effects.find((effect) => effect.name === name);
  const nextStack = Math.min(maxStackOverride ?? Number.POSITIVE_INFINITY, (existing?.stack ?? 0) + (stack ?? 1));
  const persistent = existing?.persistent === true;
  const expiresAt =
    persistent || duration === undefined ? undefined : existing && !refresh ? existing.expiresAt : time + duration;
  const nextEffect: TrackedEffect = {
    name,
    stack: nextStack,
    maxStack: maxStackOverride,
    expiresAt,
    ...(persistent ? { persistent: true } : {}),
    ...(sourceRowId ? { sourceRowId } : existing?.sourceRowId ? { sourceRowId: existing.sourceRowId } : {}),
  };
  return [...effects.filter((effect) => effect.name !== name), nextEffect];
}

function extendTrackedEffect(effects: TrackedEffect[], name: string, duration: number, time: number) {
  return effects.map((effect) =>
    effect.name !== name || effect.expiresAt === undefined || effect.expiresAt <= time
      ? effect
      : { ...effect, expiresAt: effect.expiresAt + duration },
  );
}

function consumeTrackedEffect(effects: TrackedEffect[], name: string, stack: number | "all" | undefined) {
  if (stack === "all") return effects.filter((effect) => effect.name !== name);
  const amount = Math.max(1, stack ?? 1);
  return effects.flatMap((effect) => {
    if (effect.name !== name || effect.persistent) return [effect];
    const remaining = (effect.stack ?? 1) - amount;
    return remaining > 0 ? [{ ...effect, stack: remaining }] : [];
  });
}

function resolveCastModifierEffect(effect: EditableObject, buffs: TrackedEffect[], debuffs: TrackedEffect[]) {
  return Object.fromEntries(
    Object.entries(effect).map(([field, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [field, value];
      const dynamicValue = value as EditableObject;
      if (
        dynamicValue.function !== "byStack" ||
        typeof dynamicValue.param1 !== "string" ||
        typeof dynamicValue.param2 !== "number"
      )
        return [field, value];
      const trackedEffects = dynamicValue.target === "target" ? debuffs : buffs;
      const stack = trackedEffects.find((trackedEffect) => trackedEffect.name === dynamicValue.param1)?.stack ?? 0;
      return [field, stack * dynamicValue.param2];
    }),
  );
}

function buildRotationTimelinePass(input: TimelineBuildInput, resolvedAnchorTime?: number): TimelineRow[] {
  type TimelineEvent = {
    time: number;
    sortOrder: number[];
    kind: "start" | "action";
    row: TimelineRow;
    actionIndex?: number;
  };
  const compareSortOrder = (left: number[], right: number[]) => {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
  };
  const { rotation, skills, eventDefinitions, dots, effectDefinitions, innerWayRules, setupEffects, weapons } = input;
  const isSequentialStep = (step: RotationStep) => step.type === "skill" || step.event === "Delay";
  const sequentialCastTime = (step: RotationStep) =>
    step.type === "skill"
      ? Number(skills[step.skill ?? ""]?.castTime ?? 0)
      : step.event === "Delay"
        ? Math.max(0, step.duration)
        : 0;
  const innerWayConditions = new Set(input.innerWayConditions);
  const rows: TimelineRow[] = [];
  const events: TimelineEvent[] = [];
  const attachedEvent = (step: RotationStep) => {
    if (step.type !== "event") return undefined;
    if (
      (step.event === "Move" || step.event === "HP" || step.event === "Buff" || step.event === "Debuff") &&
      "before" in step
    )
      return { target: step.before, placement: "before" as const };
    if (step.event === "Exhausted") {
      if ("after" in step) return { target: step.after, placement: "after" as const };
      if ("before" in step) return { target: step.before, placement: "after" as const };
    }
    return undefined;
  };
  const startStepIndex = rotation.start?.step ?? 0;
  const initialAnchorTime = (() => {
    let time = 0;
    for (const [stepIndex, step] of rotation.steps.entries()) {
      if (stepIndex === startStepIndex) {
        if (step.type !== "skill") return time;
        const skill = skills[step.skill ?? ""];
        const actionIndex = rotation.start?.action;
        return (
          time +
          (actionIndex === undefined || !Array.isArray(skill?.action)
            ? 0
            : Number((skill.action[actionIndex] as EditableObject | undefined)?.time ?? 0))
        );
      }
      if (isSequentialStep(step)) time += sequentialCastTime(step);
    }
    return 0;
  })();
  let elapsed = 0;
  for (const [rowIndex, step] of rotation.steps.entries()) {
    const skill = step.type === "skill" ? skills[step.skill ?? ""] : eventDefinitions[step.event];
    const castTime = sequentialCastTime(step);
    const startTime =
      step.type === "event"
        ? step.event === "Delay"
          ? elapsed
          : "startTime" in step
            ? step.startTime +
              (rotation.eventTimeReference === "battleStart" ? (resolvedAnchorTime ?? initialAnchorTime) : 0)
            : 0
        : elapsed;
    const actions: EditableObject[] = Array.isArray(skill?.action)
      ? (skill.action as EditableObject[]).map((action) => ({
          ...action,
          ...(step.type === "event" &&
          (step.event === "Controlled" || step.event === "Exhausted") &&
          action.type === "apply" &&
          step.duration !== undefined
            ? { duration: step.duration }
            : {}),
          ...(step.type === "event" && step.event === "Move" && action.type === "move"
            ? { distance: step.distance }
            : {}),
          ...(step.type === "event" && step.event === "HP" && action.type === "setHP"
            ? { currentHPRatio: step.currentHPRatio }
            : {}),
          ...(step.type === "event" && step.event === "Buff" && action.type === "apply"
            ? { value: step.buff, stack: step.stack ?? 1 }
            : {}),
          ...(step.type === "event" && step.event === "Debuff" && action.type === "apply"
            ? { value: step.debuff, stack: step.stack ?? 1 }
            : {}),
        }))
      : [];
    // Fixed-time and Move events resolve before other rows at an equal timestamp.
    // Exhausted attachments receive a causal order after their target action below.
    const rowOrder = step.type === "event" ? -((rotation.steps.length - rowIndex) * 1000) : rowIndex * 1000;
    const sortPrefix = step.type === "event" ? [-1, rowIndex] : [0, rowIndex];
    const row: TimelineRow = {
      id: `rotation-${rowIndex}`,
      kind: "rotation",
      rotationIndex: rowIndex,
      order: rowOrder,
      step,
      startTime,
      distance: 1,
      currentHPRatio: 1,
      effectiveCastTime: castTime,
      skill,
      actions,
      buffs: [],
      debuffs: [],
      modifierEffects: [],
      actionStates: {},
    };
    rows.push(row);
    if (!attachedEvent(step)) {
      events.push({ time: startTime, sortOrder: [...sortPrefix, 0], kind: "start", row });
      actions.forEach((action, actionIndex) =>
        events.push({
          time: startTime + (typeof action.time === "number" ? action.time : 0),
          sortOrder: [...sortPrefix, 1, actionIndex],
          kind: "action",
          row,
          actionIndex,
        }),
      );
    }
    if (isSequentialStep(step)) elapsed += castTime;
  }

  type ResolvedAttachment = { eventRow: TimelineRow; target: AttachedEventTarget; placement: "before" | "after" };
  const directAttachments = new Map<string, ResolvedAttachment[]>();
  const triggeredAttachments = new Map<string, ResolvedAttachment[]>();
  const queueAttachedEvent = (
    attachment: ResolvedAttachment,
    targetTime: number,
    targetSortOrder: number[],
    targetDisplayOrder: number,
  ) => {
    const { eventRow } = attachment;
    eventRow.startTime = targetTime;
    if (attachment.placement === "after") eventRow.order = targetDisplayOrder + 0.5;
    const prefix = attachment.placement === "before" ? [-1, eventRow.rotationIndex ?? 0] : [...targetSortOrder, 1];
    events.push({ time: targetTime, sortOrder: [...prefix, 0], kind: "start", row: eventRow });
    eventRow.actions.forEach((action, actionIndex) =>
      events.push({
        time: targetTime + Number(action.time ?? 0),
        sortOrder: [...prefix, 1, actionIndex],
        kind: "action",
        row: eventRow,
        actionIndex,
      }),
    );
  };
  rows.forEach((eventRow) => {
    const resolved = attachedEvent(eventRow.step);
    if (!resolved) return;
    const targetRow = rows.find(
      (candidate) =>
        candidate.kind === "rotation" &&
        candidate.step.type === "skill" &&
        (candidate.rotationIndex ?? -1) > (eventRow.rotationIndex ?? -1),
    );
    if (!targetRow) {
      eventRow.skipped = true;
      return;
    }
    eventRow.sourceRowId = targetRow.id;
    const attachment = { eventRow, ...resolved };
    const collection = attachment.target.trigger === undefined ? directAttachments : triggeredAttachments;
    collection.set(targetRow.id, [...(collection.get(targetRow.id) ?? []), attachment]);
    if (attachment.target.trigger !== undefined) return;
    const targetTime =
      attachment.target.action === "start"
        ? targetRow.startTime
        : targetRow.startTime + Number(targetRow.actions[attachment.target.action]?.time ?? 0);
    const targetSortOrder =
      attachment.target.action === "start"
        ? [0, targetRow.rotationIndex ?? 0, 0]
        : [0, targetRow.rotationIndex ?? 0, 1, attachment.target.action];
    const targetDisplayOrder =
      attachment.target.action === "start" ? targetRow.order : targetRow.order + 10 + attachment.target.action;
    queueAttachedEvent(attachment, targetTime, targetSortOrder, targetDisplayOrder);
  });

  const shiftRotationRowAndAttachments = (targetRow: TimelineRow, shift: number) => {
    targetRow.startTime += shift;
    const attachedRows = new Set((directAttachments.get(targetRow.id) ?? []).map(({ eventRow }) => eventRow));
    attachedRows.forEach((eventRow) => {
      eventRow.startTime += shift;
    });
    events.forEach((queued) => {
      if (queued.row === targetRow || attachedRows.has(queued.row)) queued.time += shift;
    });
  };

  let buffs: TrackedEffect[] = (input.initialBuffs ?? []).map((effect) => ({
    ...effect,
    persistent: true,
    expiresAt: undefined,
  }));
  let debuffs: TrackedEffect[] = (input.initialDebuffs ?? []).map((effect) => ({
    ...effect,
    persistent: true,
    expiresAt: undefined,
  }));
  let distance = 1;
  let currentHPRatio = 1;
  const cooldowns: Record<string, number> = {};
  const prune = (effects: TrackedEffect[], time: number) =>
    effects.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > time);
  const getModifiedEffectDefinition = (
    name: string,
    currentBuffs: TrackedEffect[],
    currentDebuffs: TrackedEffect[],
    skillTags: string[],
  ) => {
    const setupModifiers = setupEffects
      .filter(
        (effect) =>
          effect.target === name &&
          effect.modify &&
          typeof effect.modify === "object" &&
          !Array.isArray(effect.modify) &&
          requirementsPass(effect.requirement, currentBuffs, currentDebuffs, skillTags, innerWayConditions, weapons),
      )
      .map((effect) => effect.modify as EditableObject);
    const innerWayModifiers = innerWayRules
      .filter(
        (rule) =>
          rule.target === name &&
          rule.modify &&
          requirementsPass(rule.requirement, currentBuffs, currentDebuffs, skillTags, innerWayConditions, weapons),
      )
      .map((rule) => rule.modify!);
    return [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, {
      ...(effectDefinitions[name] ?? {}),
    });
  };
  let nextDerivedOrder = rotation.steps.length * 1000 + 1;
  type ActiveDot = {
    dot: SkillRecord;
    appliedAt: number;
    expiresAt: number;
    sourceRowId: string;
    rows: TimelineRow[];
  };
  const activeDots: Record<string, ActiveDot> = {};
  const removePendingDotRows = (activeDot: ActiveDot, afterTime: number) => {
    const pendingRows = new Set(
      activeDot.rows.filter((row) => row.startTime > afterTime + 1e-6 && Object.keys(row.actionStates).length === 0),
    );
    if (pendingRows.size === 0) return;
    activeDot.rows = activeDot.rows.filter((row) => !pendingRows.has(row));
    for (let index = rows.length - 1; index >= 0; index -= 1) if (pendingRows.has(rows[index])) rows.splice(index, 1);
    for (let index = events.length - 1; index >= 0; index -= 1)
      if (pendingRows.has(events[index].row)) events.splice(index, 1);
  };
  const scheduleDotTicks = (
    name: string,
    activeDot: ActiveDot,
    afterTime: number,
    causalSortOrder: number[],
    sourceOrder: number,
  ) => {
    const tick = typeof activeDot.dot.tick === "number" && activeDot.dot.tick > 0 ? activeDot.dot.tick : undefined;
    const baseActions = Array.isArray(activeDot.dot.action) ? (activeDot.dot.action as EditableObject[]) : [];
    if (!tick || baseActions.length === 0) return;
    const firstTickIndex = Math.max(1, Math.floor((afterTime - activeDot.appliedAt + 1e-6) / tick) + 1);
    for (let tickIndex = firstTickIndex; ; tickIndex += 1) {
      const tickTime = activeDot.appliedAt + tickIndex * tick;
      if (tickTime > activeDot.expiresAt + 1e-6) break;
      const derivedId = nextDerivedOrder++;
      const derivedSortOrder = [...causalSortOrder, derivedId];
      const actions = baseActions.map((action) => ({ ...action, time: 0 }));
      const row: TimelineRow = {
        id: `dot-${derivedId}`,
        kind: "dot",
        sourceRowId: activeDot.sourceRowId,
        order: sourceOrder + 10 + tickIndex / 1000,
        step: { type: "skill", skill: name },
        startTime: tickTime,
        distance,
        currentHPRatio,
        effectiveCastTime: 0,
        skill: activeDot.dot,
        actions,
        buffs: [],
        debuffs: [],
        modifierEffects: [],
        actionStates: {},
      };
      activeDot.rows.push(row);
      rows.push(row);
      events.push({ time: tickTime, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
      actions.forEach((_action, actionIndex) =>
        events.push({
          time: tickTime,
          sortOrder: [...derivedSortOrder, 1, actionIndex],
          kind: "action",
          row,
          actionIndex,
        }),
      );
    }
  };
  const transferAndRescheduleDot = (
    name: string,
    expiresAt: number,
    eventTime: number,
    sourceRowId: string,
    causalSortOrder: number[],
    sourceOrder: number,
  ) => {
    const activeDot = activeDots[name];
    if (!activeDot) return;
    removePendingDotRows(activeDot, eventTime);
    activeDot.expiresAt = expiresAt;
    activeDot.sourceRowId = sourceRowId;
    scheduleDotTicks(name, activeDot, eventTime, causalSortOrder, sourceOrder);
  };
  let processedEvents = 0;
  const applyCastTimingModifiers = (row: TimelineRow, baseCastTime: number) => {
    const timingValue = (value: unknown, actionTime: number, fallback: number) =>
      typeof value === "number" && Number.isFinite(value)
        ? value
        : (resolveSegmentValue(value, { actionTime }) ?? fallback);
    const adjust = (time: number) => {
      const modifier = row.modifierEffects.reduce(
        (total, effect) => total + timingValue(effect.castTimeModifier, time, 0),
        0,
      );
      const multiplier = row.modifierEffects.reduce(
        (total, effect) => total * timingValue(effect.castTimeMultiplier, time, 1),
        1,
      );
      return Math.max(0, time + modifier) * multiplier;
    };
    row.effectiveCastTime = adjust(baseCastTime);
    row.actions = row.actions.map((action) => ({
      ...action,
      ...(typeof action.time === "number" ? { time: adjust(action.time) } : {}),
    }));
    events.forEach((queued) => {
      if (queued.row === row && queued.kind === "action")
        queued.time =
          row.startTime +
          (typeof row.actions[queued.actionIndex ?? -1]?.time === "number"
            ? (row.actions[queued.actionIndex ?? -1].time as number)
            : 0);
    });
    (directAttachments.get(row.id) ?? []).forEach((attachment) => {
      const targetTime =
        attachment.target.action === "start"
          ? row.startTime
          : row.startTime + Number(row.actions[attachment.target.action]?.time ?? 0);
      attachment.eventRow.startTime = targetTime;
      events.forEach((queued) => {
        if (queued.row !== attachment.eventRow) return;
        queued.time =
          targetTime +
          (queued.kind === "action" ? Number(attachment.eventRow.actions[queued.actionIndex ?? -1]?.time ?? 0) : 0);
      });
    });
    return row.effectiveCastTime;
  };

  while (events.length && processedEvents < 2000) {
    events.sort(
      (left, right) => compareTimelineTime(left.time, right.time) || compareSortOrder(left.sortOrder, right.sortOrder),
    );
    const event = events.shift()!;
    processedEvents += 1;
    buffs = prune(buffs, event.time);
    debuffs = prune(debuffs, event.time);
    if (event.kind === "start") {
      const skillId = event.row.step.type === "skill" ? (event.row.step.skill ?? "") : "";
      if (
        event.row.kind === "rotation" &&
        event.row.step.type === "skill" &&
        typeof event.row.skill?.cooldown === "number" &&
        (cooldowns[`skill:${skillId}`] ?? 0) > event.time
      ) {
        const skippedCastTime = event.row.effectiveCastTime;
        event.row.skipped = true;
        event.row.actions = [];
        event.row.effectiveCastTime = 0;
        [...(directAttachments.get(event.row.id) ?? []), ...(triggeredAttachments.get(event.row.id) ?? [])].forEach(
          ({ eventRow }) => {
            eventRow.skipped = true;
            for (let index = events.length - 1; index >= 0; index -= 1)
              if (events[index].row === eventRow) events.splice(index, 1);
          },
        );
        rows.forEach((row) => {
          if (
            row.kind !== "rotation" ||
            (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) ||
            !isSequentialStep(row.step)
          )
            return;
          shiftRotationRowAndAttachments(row, -skippedCastTime);
        });
        continue;
      }
      if (
        event.row.kind === "rotation" &&
        event.row.step.type === "skill" &&
        typeof event.row.skill?.cooldown === "number"
      )
        cooldowns[`skill:${skillId}`] = event.time + event.row.skill.cooldown;
      event.row.buffs = [...buffs];
      event.row.debuffs = [...debuffs];
      event.row.distance = distance;
      event.row.currentHPRatio = currentHPRatio;
      const modifiers = Array.isArray(event.row.skill?.modifier) ? (event.row.skill.modifier as EditableObject[]) : [];
      event.row.modifierEffects = modifiers
        .filter((item) =>
          requirementsPass(item.requirement, buffs, debuffs, event.row.skill?.tags ?? [], innerWayConditions, weapons),
        )
        .map((item) =>
          item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
            ? resolveCastModifierEffect(item.effect as EditableObject, buffs, debuffs)
            : {},
        );
      const previousCastTime = event.row.effectiveCastTime;
      const baseCastTime =
        event.row.step.type === "event" && event.row.step.event === "Delay"
          ? Math.max(0, event.row.step.duration)
          : typeof event.row.skill?.castTime === "number"
            ? event.row.skill.castTime
            : 0;
      const adjustedCastTime = applyCastTimingModifiers(event.row, baseCastTime);
      if (event.row.kind === "rotation" && event.row.step.type === "skill") {
        const shift = adjustedCastTime - previousCastTime;
        if (shift)
          rows.forEach((row) => {
            if (
              row.kind !== "rotation" ||
              (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) ||
              !isSequentialStep(row.step)
            )
              return;
            shiftRotationRowAndAttachments(row, shift);
          });
      }
      continue;
    }

    const action = event.row.actions[event.actionIndex ?? -1];
    if (!action) continue;
    event.row.actionStates[event.actionIndex ?? -1] = {
      buffs: [...buffs],
      debuffs: [...debuffs],
      distance,
      currentHPRatio,
    };
    const skillTags = event.row.skill?.tags ?? [];
    if (!requirementsPass(action.requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)) continue;
    const skillKey = event.row.step.type === "skill" ? (event.row.step.skill ?? "") : event.row.step.event;
    const actionCooldownKey = `action:${skillKey}:${event.actionIndex ?? -1}`;
    if (typeof action.cooldown === "number" && (cooldowns[actionCooldownKey] ?? 0) > event.time) continue;
    if (action.type === "apply" && typeof action.value === "string" && (cooldowns[action.value] ?? 0) > event.time)
      continue;
    if (action.type === "clearCD" && typeof action.value === "string") {
      cooldowns[action.value] = event.time;
      continue;
    }
    if (action.type === "move" && typeof action.distance === "number" && Number.isFinite(action.distance)) {
      distance = Math.max(1, Math.floor(action.distance));
      continue;
    }
    if (
      action.type === "setHP" &&
      typeof action.currentHPRatio === "number" &&
      Number.isFinite(action.currentHPRatio)
    ) {
      currentHPRatio = Math.min(1, Math.max(0, action.currentHPRatio));
      continue;
    }
    if (action.type === "consume") {
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const valueObject =
        action.value && typeof action.value === "object" && !Array.isArray(action.value)
          ? (action.value as EditableObject)
          : undefined;
      const value =
        valueObject?.operator === "first" && Array.isArray(valueObject.operand)
          ? valueObject.operand.find(
              (candidate) => typeof candidate === "string" && targetEffects.some((effect) => effect.name === candidate),
            )
          : action.value;
      if (typeof value === "string") {
        const next = consumeTrackedEffect(
          targetEffects,
          value,
          action.stack === "all" ? "all" : typeof action.stack === "number" ? action.stack : undefined,
        );
        if (action.target === "target") debuffs = next;
        else buffs = next;
      }
    }
    const enqueueTriggeredSkill = (
      skillId: string,
      sourceRowId?: string,
      attachedTriggerOrdinal?: number,
      triggerSource: "skill" | "setup" | "innerWay" = "skill",
    ) => {
      const triggeredSkill = skills[skillId];
      const key = `skill:${skillId}`;
      if (!triggeredSkill || (cooldowns[key] ?? 0) > event.time) return;
      const actions = Array.isArray(triggeredSkill.action) ? (triggeredSkill.action as EditableObject[]) : [];
      const derivedId = nextDerivedOrder++;
      const derivedSortOrder = [...event.sortOrder, derivedId];
      const rowOrder = event.row.order + 10 + (event.actionIndex ?? 0) + 0.5;
      const row: TimelineRow = {
        id: `trigger-${derivedId}`,
        kind: "trigger",
        sourceRowId,
        triggerSource,
        order: rowOrder,
        step: { type: "skill", skill: skillId },
        startTime: event.time,
        distance,
        currentHPRatio,
        effectiveCastTime: typeof triggeredSkill.castTime === "number" ? triggeredSkill.castTime : 0,
        skill: triggeredSkill,
        actions: actions.map((item) => ({ ...item })),
        buffs: [...buffs],
        debuffs: [...debuffs],
        modifierEffects: [],
        actionStates: {},
      };
      rows.push(row);
      events.push({ time: event.time, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
      actions.forEach((item, index) =>
        events.push({
          time: event.time + (typeof item.time === "number" ? item.time : 0),
          sortOrder: [...derivedSortOrder, 1, index],
          kind: "action",
          row,
          actionIndex: index,
        }),
      );
      if (sourceRowId && attachedTriggerOrdinal !== undefined) {
        (triggeredAttachments.get(sourceRowId) ?? [])
          .filter((attachment) => attachment.target.trigger === attachedTriggerOrdinal)
          .forEach((attachment) => {
            directAttachments.set(row.id, [...(directAttachments.get(row.id) ?? []), attachment]);
            const targetTime =
              attachment.target.action === "start"
                ? row.startTime
                : row.startTime + Number(row.actions[attachment.target.action]?.time ?? 0);
            const targetSortOrder =
              attachment.target.action === "start"
                ? [...derivedSortOrder, 0]
                : [...derivedSortOrder, 1, attachment.target.action];
            const targetDisplayOrder =
              attachment.target.action === "start" ? row.order : row.order + 10 + attachment.target.action;
            queueAttachedEvent(attachment, targetTime, targetSortOrder, targetDisplayOrder);
          });
      }
      if (typeof triggeredSkill.cooldown === "number") cooldowns[key] = event.time + triggeredSkill.cooldown;
    };
    const applyTriggerAction = (triggerAction: EditableObject, triggerSource: "setup" | "innerWay") => {
      if (triggerAction.type === "trigger" && typeof triggerAction.value === "string") {
        enqueueTriggeredSkill(triggerAction.value, event.row.sourceRowId ?? event.row.id, undefined, triggerSource);
        return;
      }
      if (
        triggerAction.type !== "apply" ||
        typeof triggerAction.value !== "string" ||
        (cooldowns[triggerAction.value] ?? 0) > event.time
      )
        return;
      const targetEffects = triggerAction.target === "target" ? debuffs : buffs;
      const definition = getModifiedEffectDefinition(triggerAction.value, buffs, debuffs, skillTags);
      const duration = typeof triggerAction.duration === "number" ? triggerAction.duration : definition.duration;
      const baseStack = typeof triggerAction.stack === "number" ? triggerAction.stack : 1;
      const additional =
        triggerAction.additionalStack &&
        typeof triggerAction.additionalStack === "object" &&
        !Array.isArray(triggerAction.additionalStack)
          ? (triggerAction.additionalStack as EditableObject)
          : undefined;
      const additionalStack =
        additional && requirementsPass(additional.requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)
          ? typeof additional.stack === "number"
            ? additional.stack
            : 1
          : 0;
      const sourceRowId = event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id);
      const next = applyTrackedEffect(
        targetEffects,
        triggerAction.value,
        baseStack + additionalStack,
        duration,
        event.time,
        definition.maxStack,
        definition.refresh !== false,
        sourceRowId,
      );
      if (triggerAction.target === "target") debuffs = next;
      else buffs = next;
      if (definition.cooldown !== undefined) cooldowns[triggerAction.value] = event.time + definition.cooldown;
    };
    if (action.type === "damage") {
      setupEffects.forEach((setup) => {
        const trigger =
          setup.trigger && typeof setup.trigger === "object" && !Array.isArray(setup.trigger)
            ? (setup.trigger as EditableObject)
            : undefined;
        if (
          trigger?.event !== "damage" ||
          !requirementsPass(trigger.requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)
        )
          return;
        if (trigger.action && typeof trigger.action === "object" && !Array.isArray(trigger.action))
          applyTriggerAction(trigger.action as EditableObject, "setup");
      });
      innerWayRules
        .filter((rule) => rule.trigger?.event === "damage" || rule.trigger?.target === "self")
        .forEach((rule) => {
          const requirement = rule.requirement ?? rule.trigger?.requirement;
          if (!requirementsPass(requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)) return;
          const triggerActions = Array.isArray(rule.trigger?.action)
            ? rule.trigger.action
            : rule.trigger?.action && typeof rule.trigger.action === "object"
              ? [rule.trigger.action]
              : [];
          triggerActions
            .filter(
              (triggerAction): triggerAction is EditableObject =>
                Boolean(triggerAction) && typeof triggerAction === "object" && !Array.isArray(triggerAction),
            )
            .forEach((triggerAction) => applyTriggerAction(triggerAction, "innerWay"));
        });
    }
    if (action.type === "trigger" && typeof action.value === "string") {
      const triggerOrdinal =
        event.row.kind === "rotation"
          ? event.row.actions.slice(0, (event.actionIndex ?? 0) + 1).filter((candidate) => candidate.type === "trigger")
              .length - 1
          : undefined;
      enqueueTriggeredSkill(action.value, event.row.sourceRowId ?? event.row.id, triggerOrdinal);
    }
    if (
      action.type === "apply" &&
      action.target === "target" &&
      typeof action.value === "string" &&
      dots[action.value]
    ) {
      const dot = dots[action.value];
      const existing = debuffs.find((effect) => effect.name === action.value);
      if (!existing || action.reapply !== false) {
        const definition = getModifiedEffectDefinition(action.value, buffs, debuffs, skillTags);
        const duration =
          typeof action.duration === "number"
            ? action.duration
            : typeof dot.duration === "number"
              ? dot.duration
              : definition.duration;
        if (typeof duration === "number") {
          const effectSourceRowId =
            event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id);
          debuffs = applyTrackedEffect(
            debuffs,
            action.value,
            typeof action.stack === "number" ? action.stack : undefined,
            duration,
            event.time,
            definition.maxStack,
            definition.refresh !== false,
            effectSourceRowId,
          );
          const sourceRowId = event.row.sourceRowId ?? event.row.id;
          const expiresAt = event.time + duration;
          if (existing && activeDots[action.value] && definition.refresh !== false) {
            transferAndRescheduleDot(
              action.value,
              expiresAt,
              event.time,
              sourceRowId,
              event.sortOrder,
              event.row.order + (event.actionIndex ?? 0),
            );
          } else {
            const activeDot: ActiveDot = { dot, appliedAt: event.time, expiresAt, sourceRowId, rows: [] };
            activeDots[action.value] = activeDot;
            scheduleDotTicks(
              action.value,
              activeDot,
              event.time,
              event.sortOrder,
              event.row.order + (event.actionIndex ?? 0),
            );
          }
        }
      }
    }
    if ((action.type === "apply" || action.type === "extend") && typeof action.value === "string") {
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const modifierDuration = event.row.modifierEffects.find((effect) => typeof effect.duration === "number");
      const definition = getModifiedEffectDefinition(action.value, buffs, debuffs, skillTags);
      const duration =
        typeof action.duration === "number"
          ? action.duration
          : typeof modifierDuration?.duration === "number"
            ? modifierDuration.duration
            : definition.duration;
      const existing = targetEffects.find((effect) => effect.name === action.value);
      const sourceRowId = event.row.step.type === "event" ? event.row.id : (event.row.sourceRowId ?? event.row.id);
      const next =
        action.type === "extend" && typeof duration === "number"
          ? extendTrackedEffect(targetEffects, action.value, duration, event.time)
          : action.type === "apply" && !dots[action.value]
            ? applyTrackedEffect(
                targetEffects,
                action.value,
                typeof action.stack === "number" ? action.stack : undefined,
                duration,
                event.time,
                definition.maxStack,
                definition.refresh !== false,
                sourceRowId,
              )
            : targetEffects;
      if (action.target === "target") debuffs = next;
      else buffs = next;
      if (
        action.type === "extend" &&
        action.target === "target" &&
        typeof duration === "number" &&
        existing?.expiresAt !== undefined &&
        existing.expiresAt > event.time &&
        dots[action.value]
      ) {
        transferAndRescheduleDot(
          action.value,
          existing.expiresAt + duration,
          event.time,
          event.row.sourceRowId ?? event.row.id,
          event.sortOrder,
          event.row.order + (event.actionIndex ?? 0),
        );
      }
      if (action.type === "apply" && effectDefinitions[action.value]?.cooldown !== undefined)
        cooldowns[action.value] = event.time + effectDefinitions[action.value].cooldown!;
    }
    if (typeof action.cooldown === "number") cooldowns[actionCooldownKey] = event.time + action.cooldown;
  }
  return rows.sort(
    (left, right) =>
      compareTimelineTime(left.startTime, right.startTime) ||
      left.order - right.order ||
      (left.kind === "rotation" ? -1 : right.kind === "rotation" ? 1 : 0),
  );
}

export function buildRotationTimeline(input: TimelineBuildInput): TimelineRow[] {
  if (input.rotation.eventTimeReference !== "battleStart") return buildRotationTimelinePass(input);
  let anchorTime: number | undefined;
  let rows: TimelineRow[] = [];
  for (let pass = 0; pass < 8; pass += 1) {
    rows = buildRotationTimelinePass(input, anchorTime);
    const anchorRow = rows.find((row) => row.id === `rotation-${input.rotation.start?.step ?? 0}`);
    const actionIndex = input.rotation.start?.action;
    const nextAnchorTime = anchorRow
      ? anchorRow.startTime + (actionIndex === undefined ? 0 : Number(anchorRow.actions[actionIndex]?.time ?? 0))
      : 0;
    if (anchorTime !== undefined && compareTimelineTime(nextAnchorTime, anchorTime) === 0) return rows;
    anchorTime = nextAnchorTime;
  }
  return buildRotationTimelinePass(input, anchorTime);
}
