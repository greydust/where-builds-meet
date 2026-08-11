import type { WeaponId } from "../types";

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
export type RotationStep = { type: "skill"; skill?: string; causesBreak?: boolean; condition?: string }
  | { type: "event"; event: "Exhausted" | "Controlled" | "BattleEnd"; startTime: number; duration?: number };
export type RotationRecord = { name: string; steps: RotationStep[]; start?: { step: number; action?: number }; eventTimeReference?: "battleStart" };
export type TrackedEffect = { name: string; expiresAt?: number; stack?: number; maxStack?: number };
export type InnerWayEffectRule = { requirement?: unknown; effect: EditableObject; trigger?: EditableObject; target?: string; modify?: EditableObject; source: string; tier: number };
export type TimelineRowKind = "rotation" | "trigger" | "dot";
export type TimelineRow = {
  id: string;
  kind: TimelineRowKind;
  sourceRowId?: string;
  rotationIndex?: number;
  order: number;
  step: RotationStep;
  startTime: number;
  effectiveCastTime: number;
  skill?: SkillRecord;
  actions: EditableObject[];
  buffs: TrackedEffect[];
  debuffs: TrackedEffect[];
  modifierEffects: EditableObject[];
  actionStates: Record<number, { buffs: TrackedEffect[]; debuffs: TrackedEffect[] }>;
  skipped?: boolean;
};

export type EffectDefinition = {
  name?: string;
  description?: string;
  duration?: number;
  cooldown?: number;
  maxStack?: number;
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
};

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

export function requirementsPass(requirement: unknown, buffs: TrackedEffect[], debuffs: TrackedEffect[], skillTags: string[], innerWayConditions: Set<string>, weapons: WeaponId[] = []): boolean {
  if (!Array.isArray(requirement)) return true;
  const hasEffect = (target: unknown, value: unknown, requiredStack?: unknown) => {
    if (typeof value !== "string") return false;
    if (target === "skillTag") return skillTags.includes(value);
    if (target === "martialArt") return weapons.includes(value as WeaponId);
    const trackedEffect = (target === "target" ? debuffs : buffs).find((effect) => effect.name === value);
    if (requiredStack === "max") return Boolean(trackedEffect?.maxStack !== undefined && (trackedEffect.stack ?? 0) >= trackedEffect.maxStack);
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

function applyTrackedEffect(effects: TrackedEffect[], name: string, stack: number | undefined, duration: number | undefined, time: number, maxStackOverride?: number) {
  const existing = effects.find((effect) => effect.name === name);
  const nextStack = Math.min(maxStackOverride ?? Number.POSITIVE_INFINITY, (existing?.stack ?? 0) + (stack ?? 1));
  const nextEffect: TrackedEffect = { name, stack: nextStack, maxStack: maxStackOverride, expiresAt: duration === undefined ? undefined : time + duration };
  return [...effects.filter((effect) => effect.name !== name), nextEffect];
}

function extendTrackedEffect(effects: TrackedEffect[], name: string, duration: number, time: number) {
  return effects.map((effect) => effect.name !== name || effect.expiresAt === undefined || effect.expiresAt <= time ? effect : { ...effect, expiresAt: effect.expiresAt + duration });
}

function consumeTrackedEffect(effects: TrackedEffect[], name: string, stack: number | undefined) {
  const amount = Math.max(1, stack ?? 1);
  return effects.flatMap((effect) => {
    if (effect.name !== name) return [effect];
    const remaining = (effect.stack ?? 1) - amount;
    return remaining > 0 ? [{ ...effect, stack: remaining }] : [];
  });
}

export function buildRotationTimeline(input: TimelineBuildInput): TimelineRow[] {
  type TimelineEvent = { time: number; sortOrder: number[]; kind: "start" | "action"; row: TimelineRow; actionIndex?: number };
  const compareSortOrder = (left: number[], right: number[]) => {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
      if (left[index] !== right[index]) return left[index] - right[index];
    }
    return left.length - right.length;
  };
  const { rotation, skills, eventDefinitions, dots, effectDefinitions, innerWayRules, setupEffects, weapons } = input;
  const innerWayConditions = new Set(input.innerWayConditions);
  const rows: TimelineRow[] = [];
  const events: TimelineEvent[] = [];
  const startStepIndex = rotation.start?.step ?? 0;
  const initialAnchorTime = (() => {
    let time = 0;
    for (const [stepIndex, step] of rotation.steps.entries()) {
      if (stepIndex === startStepIndex) {
        if (step.type !== "skill") return time;
        const skill = skills[step.skill ?? ""];
        const actionIndex = rotation.start?.action;
        return time + (actionIndex === undefined || !Array.isArray(skill?.action) ? 0 : Number((skill.action[actionIndex] as EditableObject | undefined)?.time ?? 0));
      }
      if (step.type === "skill") time += typeof skills[step.skill ?? ""]?.castTime === "number" ? skills[step.skill ?? ""].castTime! : 0;
    }
    return 0;
  })();
  let elapsed = 0;
  for (const [rowIndex, step] of rotation.steps.entries()) {
    const skill = step.type === "skill" ? skills[step.skill ?? ""] : eventDefinitions[step.event];
    const castTime = step.type === "skill" && typeof skill?.castTime === "number" ? skill.castTime : 0;
    const startTime = step.type === "event" ? step.startTime + (rotation.eventTimeReference === "battleStart" ? initialAnchorTime : 0) : elapsed;
    const actions: EditableObject[] = Array.isArray(skill?.action) ? (skill.action as EditableObject[]).map((action) => ({ ...action, ...(step.type === "event" && step.event === "Controlled" && action.type === "apply" ? { duration: step.duration ?? skill?.castTime ?? 3 } : {}) })) : [];
    const row: TimelineRow = { id: `rotation-${rowIndex}`, kind: "rotation", rotationIndex: rowIndex, order: rowIndex * 1000, step, startTime, effectiveCastTime: castTime, skill, actions, buffs: [], debuffs: [], modifierEffects: [], actionStates: {} };
    rows.push(row);
    events.push({ time: startTime, sortOrder: [rowIndex, 0], kind: "start", row });
    actions.forEach((action, actionIndex) => events.push({ time: startTime + (typeof action.time === "number" ? action.time : 0), sortOrder: [rowIndex, 1, actionIndex], kind: "action", row, actionIndex }));
    if (step.type === "skill") elapsed += castTime;
  }

  let buffs: TrackedEffect[] = [];
  let debuffs: TrackedEffect[] = [];
  const cooldowns: Record<string, number> = {};
  const prune = (effects: TrackedEffect[], time: number) => effects.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > time);
  const getModifiedEffectDefinition = (name: string, currentBuffs: TrackedEffect[], currentDebuffs: TrackedEffect[], skillTags: string[]) => {
    const setupModifiers = setupEffects.filter((effect) => effect.target === name && effect.modify && typeof effect.modify === "object" && !Array.isArray(effect.modify) && requirementsPass(effect.requirement, currentBuffs, currentDebuffs, skillTags, innerWayConditions, weapons))
      .map((effect) => effect.modify as EditableObject);
    const innerWayModifiers = innerWayRules.filter((rule) => rule.target === name && rule.modify && requirementsPass(rule.requirement, currentBuffs, currentDebuffs, skillTags, innerWayConditions, weapons))
      .map((rule) => rule.modify!);
    return [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, { ...(effectDefinitions[name] ?? {}) });
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
    const pendingRows = new Set(activeDot.rows.filter((row) => row.startTime > afterTime + 1e-6 && Object.keys(row.actionStates).length === 0));
    if (pendingRows.size === 0) return;
    activeDot.rows = activeDot.rows.filter((row) => !pendingRows.has(row));
    for (let index = rows.length - 1; index >= 0; index -= 1) if (pendingRows.has(rows[index])) rows.splice(index, 1);
    for (let index = events.length - 1; index >= 0; index -= 1) if (pendingRows.has(events[index].row)) events.splice(index, 1);
  };
  const scheduleDotTicks = (name: string, activeDot: ActiveDot, afterTime: number, causalSortOrder: number[], sourceOrder: number) => {
    const tick = typeof activeDot.dot.tick === "number" && activeDot.dot.tick > 0 ? activeDot.dot.tick : undefined;
    const baseActions = Array.isArray(activeDot.dot.action) ? activeDot.dot.action as EditableObject[] : [];
    if (!tick || baseActions.length === 0) return;
    const firstTickIndex = Math.max(1, Math.floor((afterTime - activeDot.appliedAt + 1e-6) / tick) + 1);
    for (let tickIndex = firstTickIndex; ; tickIndex += 1) {
      const tickTime = activeDot.appliedAt + tickIndex * tick;
      if (tickTime > activeDot.expiresAt + 1e-6) break;
      const derivedId = nextDerivedOrder++;
      const derivedSortOrder = [...causalSortOrder, derivedId];
      const actions = baseActions.map((action) => ({ ...action, time: 0 }));
      const row: TimelineRow = { id: `dot-${derivedId}`, kind: "dot", sourceRowId: activeDot.sourceRowId, order: sourceOrder + 10 + tickIndex / 1000, step: { type: "skill", skill: name }, startTime: tickTime, effectiveCastTime: 0, skill: activeDot.dot, actions, buffs: [], debuffs: [], modifierEffects: [], actionStates: {} };
      activeDot.rows.push(row);
      rows.push(row);
      events.push({ time: tickTime, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
      actions.forEach((_action, actionIndex) => events.push({ time: tickTime, sortOrder: [...derivedSortOrder, 1, actionIndex], kind: "action", row, actionIndex }));
    }
  };
  const transferAndRescheduleDot = (name: string, expiresAt: number, eventTime: number, sourceRowId: string, causalSortOrder: number[], sourceOrder: number) => {
    const activeDot = activeDots[name];
    if (!activeDot) return;
    removePendingDotRows(activeDot, eventTime);
    activeDot.expiresAt = expiresAt;
    activeDot.sourceRowId = sourceRowId;
    scheduleDotTicks(name, activeDot, eventTime, causalSortOrder, sourceOrder);
  };
  const shiftFightRelativeEvents = (shift: number) => {
    if (!shift || rotation.eventTimeReference !== "battleStart") return;
    rows.forEach((row) => {
      if (row.kind !== "rotation" || row.step.type !== "event") return;
      row.startTime += shift;
      events.forEach((queued) => { if (queued.row === row) queued.time += shift; });
    });
  };
  let processedEvents = 0;
  const applyCastTimingModifiers = (row: TimelineRow, baseCastTime: number) => {
    const modifier = row.modifierEffects.reduce((total, effect) => total + (typeof effect.castTimeModifier === "number" ? effect.castTimeModifier : 0), 0);
    const multiplier = row.modifierEffects.reduce((total, effect) => total * (typeof effect.castTimeMultiplier === "number" ? effect.castTimeMultiplier : 1), 1);
    const adjust = (time: number) => Math.max(0, time + modifier) * multiplier;
    row.effectiveCastTime = adjust(baseCastTime);
    row.actions = row.actions.map((action) => ({ ...action, ...(typeof action.time === "number" ? { time: adjust(action.time) } : {}) }));
    events.forEach((queued) => { if (queued.row === row && queued.kind === "action") queued.time = row.startTime + (typeof row.actions[queued.actionIndex ?? -1]?.time === "number" ? row.actions[queued.actionIndex ?? -1].time as number : 0); });
    return row.effectiveCastTime;
  };

  while (events.length && processedEvents < 2000) {
    events.sort((left, right) => left.time - right.time || compareSortOrder(left.sortOrder, right.sortOrder));
    const event = events.shift()!;
    processedEvents += 1;
    buffs = prune(buffs, event.time);
    debuffs = prune(debuffs, event.time);
    if (event.kind === "start") {
      const skillId = event.row.step.type === "skill" ? event.row.step.skill ?? "" : "";
      if (event.row.kind === "rotation" && event.row.step.type === "skill" && typeof event.row.skill?.cooldown === "number" && (cooldowns[`skill:${skillId}`] ?? 0) > event.time) {
        const skippedCastTime = event.row.effectiveCastTime;
        event.row.skipped = true;
        event.row.actions = [];
        event.row.effectiveCastTime = 0;
        rows.forEach((row) => {
          if (row.kind !== "rotation" || (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) || row.step.type !== "skill") return;
          row.startTime -= skippedCastTime;
          events.forEach((queued) => { if (queued.row === row) queued.time -= skippedCastTime; });
        });
        if ((event.row.rotationIndex ?? Number.POSITIVE_INFINITY) < startStepIndex) shiftFightRelativeEvents(-skippedCastTime);
        continue;
      }
      if (event.row.kind === "rotation" && event.row.step.type === "skill" && typeof event.row.skill?.cooldown === "number") cooldowns[`skill:${skillId}`] = event.time + event.row.skill.cooldown;
      event.row.buffs = [...buffs];
      event.row.debuffs = [...debuffs];
      const modifiers = Array.isArray(event.row.skill?.modifier) ? event.row.skill.modifier as EditableObject[] : [];
      event.row.modifierEffects = modifiers.filter((item) => requirementsPass(item.requirement, buffs, debuffs, event.row.skill?.tags ?? [], innerWayConditions, weapons)).map((item) => item.effect && typeof item.effect === "object" && !Array.isArray(item.effect) ? item.effect as EditableObject : {});
      const previousCastTime = event.row.effectiveCastTime;
      const previousAnchorActionTime = event.row.rotationIndex === startStepIndex && rotation.start?.action !== undefined
        ? Number(event.row.actions[rotation.start.action]?.time ?? 0)
        : 0;
      const adjustedCastTime = applyCastTimingModifiers(event.row, typeof event.row.skill?.castTime === "number" ? event.row.skill.castTime : 0);
      if (event.row.kind === "rotation" && event.row.step.type === "skill") {
        const shift = adjustedCastTime - previousCastTime;
        if (shift) rows.forEach((row) => {
          if (row.kind !== "rotation" || (row.rotationIndex ?? -1) <= (event.row.rotationIndex ?? -1) || row.step.type !== "skill") return;
          row.startTime += shift;
          events.forEach((queued) => { if (queued.row === row) queued.time += shift; });
        });
        const anchorShift = (event.row.rotationIndex ?? Number.POSITIVE_INFINITY) < startStepIndex
          ? shift
          : event.row.rotationIndex === startStepIndex && rotation.start?.action !== undefined
            ? Number(event.row.actions[rotation.start.action]?.time ?? 0) - previousAnchorActionTime
            : 0;
        shiftFightRelativeEvents(anchorShift);
      }
      continue;
    }

    const action = event.row.actions[event.actionIndex ?? -1];
    if (!action) continue;
    event.row.actionStates[event.actionIndex ?? -1] = { buffs: [...buffs], debuffs: [...debuffs] };
    const skillTags = event.row.skill?.tags ?? [];
    if (!requirementsPass(action.requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)) continue;
    const skillKey = event.row.step.type === "skill" ? event.row.step.skill ?? "" : event.row.step.event;
    const actionCooldownKey = `action:${skillKey}:${event.actionIndex ?? -1}`;
    if (typeof action.cooldown === "number" && (cooldowns[actionCooldownKey] ?? 0) > event.time) continue;
    if (action.type === "apply" && typeof action.value === "string" && (cooldowns[action.value] ?? 0) > event.time) continue;
    if (action.type === "clearCD" && typeof action.value === "string") { cooldowns[action.value] = event.time; continue; }
    if (action.type === "consume") {
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const valueObject = action.value && typeof action.value === "object" && !Array.isArray(action.value) ? action.value as EditableObject : undefined;
      const value = valueObject?.operator === "first" && Array.isArray(valueObject.operand) ? valueObject.operand.find((candidate) => typeof candidate === "string" && targetEffects.some((effect) => effect.name === candidate)) : action.value;
      if (typeof value === "string") {
        const next = consumeTrackedEffect(targetEffects, value, typeof action.stack === "number" ? action.stack : undefined);
        if (action.target === "target") debuffs = next; else buffs = next;
      }
    }
    const enqueueTriggeredSkill = (skillId: string, sourceRowId?: string) => {
      const triggeredSkill = skills[skillId];
      const key = `skill:${skillId}`;
      if (!triggeredSkill || (cooldowns[key] ?? 0) > event.time) return;
      const actions = Array.isArray(triggeredSkill.action) ? triggeredSkill.action as EditableObject[] : [];
      const derivedId = nextDerivedOrder++;
      const derivedSortOrder = [...event.sortOrder, derivedId];
      const rowOrder = event.row.order + 10 + (event.actionIndex ?? 0) + 0.5;
      const row: TimelineRow = { id: `trigger-${derivedId}`, kind: "trigger", sourceRowId, order: rowOrder, step: { type: "skill", skill: skillId }, startTime: event.time, effectiveCastTime: typeof triggeredSkill.castTime === "number" ? triggeredSkill.castTime : 0, skill: triggeredSkill, actions: actions.map((item) => ({ ...item })), buffs: [...buffs], debuffs: [...debuffs], modifierEffects: [], actionStates: {} };
      rows.push(row);
      events.push({ time: event.time, sortOrder: [...derivedSortOrder, 0], kind: "start", row });
      actions.forEach((item, index) => events.push({ time: event.time + (typeof item.time === "number" ? item.time : 0), sortOrder: [...derivedSortOrder, 1, index], kind: "action", row, actionIndex: index }));
      if (typeof triggeredSkill.cooldown === "number") cooldowns[key] = event.time + triggeredSkill.cooldown;
    };
    const applyTriggerAction = (triggerAction: EditableObject) => {
      if (triggerAction.type === "trigger" && typeof triggerAction.value === "string") {
        enqueueTriggeredSkill(triggerAction.value, event.row.sourceRowId ?? event.row.id);
        return;
      }
      if (triggerAction.type !== "apply" || typeof triggerAction.value !== "string" || (cooldowns[triggerAction.value] ?? 0) > event.time) return;
      const targetEffects = triggerAction.target === "target" ? debuffs : buffs;
      const definition = getModifiedEffectDefinition(triggerAction.value, buffs, debuffs, skillTags);
      const duration = typeof triggerAction.duration === "number" ? triggerAction.duration : definition.duration;
      const baseStack = typeof triggerAction.stack === "number" ? triggerAction.stack : 1;
      const additional = triggerAction.additionalStack && typeof triggerAction.additionalStack === "object" && !Array.isArray(triggerAction.additionalStack) ? triggerAction.additionalStack as EditableObject : undefined;
      const additionalStack = additional && requirementsPass(additional.requirement, buffs, debuffs, skillTags, innerWayConditions, weapons) ? (typeof additional.stack === "number" ? additional.stack : 1) : 0;
      const next = applyTrackedEffect(targetEffects, triggerAction.value, baseStack + additionalStack, duration, event.time, definition.maxStack);
      if (triggerAction.target === "target") debuffs = next; else buffs = next;
      if (definition.cooldown !== undefined) cooldowns[triggerAction.value] = event.time + definition.cooldown;
    };
    if (action.type === "damage") {
      setupEffects.forEach((setup) => {
        const trigger = setup.trigger && typeof setup.trigger === "object" && !Array.isArray(setup.trigger) ? setup.trigger as EditableObject : undefined;
        if (trigger?.event !== "damage" || !requirementsPass(trigger.requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)) return;
        if (trigger.action && typeof trigger.action === "object" && !Array.isArray(trigger.action)) applyTriggerAction(trigger.action as EditableObject);
      });
      innerWayRules.filter((rule) => rule.trigger?.event === "damage" || rule.trigger?.target === "self").forEach((rule) => {
        const requirement = rule.requirement ?? rule.trigger?.requirement;
        if (!requirementsPass(requirement, buffs, debuffs, skillTags, innerWayConditions, weapons)) return;
        const triggerActions = Array.isArray(rule.trigger?.action) ? rule.trigger.action : rule.trigger?.action && typeof rule.trigger.action === "object" ? [rule.trigger.action] : [];
        triggerActions.filter((triggerAction): triggerAction is EditableObject => Boolean(triggerAction) && typeof triggerAction === "object" && !Array.isArray(triggerAction)).forEach(applyTriggerAction);
      });
    }
    if (action.type === "trigger" && typeof action.value === "string") {
      enqueueTriggeredSkill(action.value, event.row.sourceRowId ?? event.row.id);
    }
    if (action.type === "apply" && action.target === "target" && typeof action.value === "string" && dots[action.value]) {
      const dot = dots[action.value];
      const existing = debuffs.find((effect) => effect.name === action.value);
      if (!existing || action.reapply !== false) {
        const definition = getModifiedEffectDefinition(action.value, buffs, debuffs, skillTags);
        const duration = typeof action.duration === "number" ? action.duration : typeof dot.duration === "number" ? dot.duration : definition.duration;
        if (typeof duration === "number") {
          debuffs = applyTrackedEffect(debuffs, action.value, typeof action.stack === "number" ? action.stack : undefined, duration, event.time, definition.maxStack);
          const sourceRowId = event.row.sourceRowId ?? event.row.id;
          const expiresAt = event.time + duration;
          if (existing && activeDots[action.value]) {
            transferAndRescheduleDot(action.value, expiresAt, event.time, sourceRowId, event.sortOrder, event.row.order + (event.actionIndex ?? 0));
          } else {
            const activeDot: ActiveDot = { dot, appliedAt: event.time, expiresAt, sourceRowId, rows: [] };
            activeDots[action.value] = activeDot;
            scheduleDotTicks(action.value, activeDot, event.time, event.sortOrder, event.row.order + (event.actionIndex ?? 0));
          }
        }
      }
    }
    if ((action.type === "apply" || action.type === "extend") && typeof action.value === "string") {
      const targetEffects = action.target === "target" ? debuffs : buffs;
      const modifierDuration = event.row.modifierEffects.find((effect) => typeof effect.duration === "number");
      const definition = getModifiedEffectDefinition(action.value, buffs, debuffs, skillTags);
      const duration = typeof action.duration === "number" ? action.duration : typeof modifierDuration?.duration === "number" ? modifierDuration.duration : definition.duration;
      const existing = targetEffects.find((effect) => effect.name === action.value);
      const next = action.type === "extend" && typeof duration === "number" ? extendTrackedEffect(targetEffects, action.value, duration, event.time) : action.type === "apply" && !dots[action.value] ? applyTrackedEffect(targetEffects, action.value, typeof action.stack === "number" ? action.stack : undefined, duration, event.time, definition.maxStack) : targetEffects;
      if (action.target === "target") debuffs = next; else buffs = next;
      if (action.type === "extend" && action.target === "target" && typeof duration === "number" && existing?.expiresAt !== undefined && existing.expiresAt > event.time && dots[action.value]) {
        transferAndRescheduleDot(action.value, existing.expiresAt + duration, event.time, event.row.sourceRowId ?? event.row.id, event.sortOrder, event.row.order + (event.actionIndex ?? 0));
      }
      if (action.type === "apply" && effectDefinitions[action.value]?.cooldown !== undefined) cooldowns[action.value] = event.time + effectDefinitions[action.value].cooldown!;
    }
    if (typeof action.cooldown === "number") cooldowns[actionCooldownKey] = event.time + action.cooldown;
  }
  return rows.sort((left, right) => left.startTime - right.startTime || (left.kind === "rotation" ? -1 : right.kind === "rotation" ? 1 : 0));
}
