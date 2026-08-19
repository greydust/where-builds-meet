import type { RotationRecord, RotationStep } from "./calculations/rotationTimeline";
import { weaponIds, type WeaponId } from "./types";

export const rotationExportFormat = "where-builds-meet-rotations";

export type RotationEntry = {
  id: string;
  rotation: RotationRecord;
  martialArts: WeaponId[];
  isDefault?: boolean;
  test?: boolean;
};

const weaponIdSet = new Set<WeaponId>(weaponIds);
const parseMartialArts = (value: unknown) => {
  const parsed = Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is WeaponId => typeof item === "string" && weaponIdSet.has(item as WeaponId)),
        ),
      ]
    : [];
  return parsed.length ? parsed : [...weaponIds];
};

export function serializeRotationEntries(entries: RotationEntry[]) {
  return JSON.stringify(
    entries
      .filter((entry) => !entry.isDefault)
      .map(({ id, rotation, martialArts }) => ({ id, rotation, martialArts: parseMartialArts(martialArts) })),
  );
}

function parseRotationStep(value: unknown): RotationStep | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const step = value as Record<string, unknown>;
  if (step.type === "skill" && typeof step.skill === "string" && step.skill) {
    return {
      type: "skill",
      skill: step.skill,
      ...(typeof step.causesBreak === "boolean" ? { causesBreak: step.causesBreak } : {}),
      ...(typeof step.condition === "string" ? { condition: step.condition } : {}),
    };
  }
  const parseAttachment = (value: unknown) => {
    const attachment =
      value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    const action = attachment?.action;
    const trigger = attachment?.trigger;
    if (
      !attachment ||
      !(action === "start" || (typeof action === "number" && Number.isInteger(action) && action >= 0)) ||
      !(trigger === undefined || (typeof trigger === "number" && Number.isInteger(trigger) && trigger >= 0))
    )
      return undefined;
    return { action: action as number | "start", ...(typeof trigger === "number" ? { trigger } : {}) };
  };
  const before = parseAttachment(step.before);
  const after = parseAttachment(step.after);
  if (step.type === "event" && step.event === "Exhausted" && (after || before)) {
    return {
      type: "event",
      event: "Qi",
      after: after ?? before!,
      targetQiRatio: 0,
    };
  }
  if (
    step.type === "event" &&
    step.event === "Move" &&
    before &&
    typeof step.distance === "number" &&
    Number.isFinite(step.distance)
  ) {
    return { type: "event", event: "Move", before, distance: Math.max(1, Math.floor(step.distance)) };
  }
  if (
    step.type === "event" &&
    step.event === "SelfHP" &&
    before &&
    ((typeof step.currentHP === "number" && Number.isFinite(step.currentHP)) ||
      (typeof step.currentHPRatio === "number" && Number.isFinite(step.currentHPRatio)))
  ) {
    return typeof step.currentHP === "number"
      ? { type: "event", event: "SelfHP", before, currentHP: Math.max(0, step.currentHP) }
      : {
          type: "event",
          event: "SelfHP",
          before,
          currentHPRatio: Math.min(1, Math.max(0, step.currentHPRatio as number)),
        };
  }
  if (
    step.type === "event" &&
    step.event === "TakeDamage" &&
    before &&
    typeof step.damage === "number" &&
    Number.isFinite(step.damage)
  ) {
    return { type: "event", event: "TakeDamage", before, damage: Math.max(0, step.damage) };
  }
  if (
    step.type === "event" &&
    step.event === "HP" &&
    before &&
    typeof step.targetHPRatio === "number" &&
    Number.isFinite(step.targetHPRatio)
  ) {
    return { type: "event", event: "HP", before, targetHPRatio: Math.min(1, Math.max(0, step.targetHPRatio)) };
  }
  if (
    step.type === "event" &&
    step.event === "Qi" &&
    (before || after) &&
    typeof step.targetQiRatio === "number" &&
    Number.isFinite(step.targetQiRatio)
  ) {
    return {
      type: "event",
      event: "Qi",
      ...(before ? { before } : { after: after! }),
      targetQiRatio: Math.min(1, Math.max(0, step.targetQiRatio)),
    };
  }
  if (step.type === "event" && step.event === "Buff" && before && typeof step.buff === "string" && step.buff) {
    const stack =
      typeof step.stack === "number" && Number.isFinite(step.stack) ? Math.max(1, Math.floor(step.stack)) : undefined;
    return { type: "event", event: "Buff", before, buff: step.buff, ...(stack === undefined ? {} : { stack }) };
  }
  if (step.type === "event" && step.event === "Debuff" && before && typeof step.debuff === "string" && step.debuff) {
    if (step.debuff === "Exhausted") return { type: "event", event: "Qi", before, targetQiRatio: 0 };
    const stack =
      typeof step.stack === "number" && Number.isFinite(step.stack) ? Math.max(1, Math.floor(step.stack)) : undefined;
    return { type: "event", event: "Debuff", before, debuff: step.debuff, ...(stack === undefined ? {} : { stack }) };
  }
  if (
    step.type === "event" &&
    step.event === "Delay" &&
    typeof step.duration === "number" &&
    Number.isFinite(step.duration)
  ) {
    return { type: "event", event: "Delay", duration: Math.max(0, step.duration) };
  }
  if (
    step.type === "event" &&
    step.event === "Exhausted" &&
    typeof step.startTime === "number" &&
    Number.isFinite(step.startTime)
  ) {
    return {
      type: "event",
      event: "Exhausted",
      startTime: step.startTime,
      ...(typeof step.duration === "number" && Number.isFinite(step.duration)
        ? { duration: Math.max(0, step.duration) }
        : {}),
    };
  }
  if (
    step.type === "event" &&
    (step.event === "Controlled" || step.event === "BattleEnd") &&
    typeof step.startTime === "number" &&
    Number.isFinite(step.startTime)
  ) {
    return {
      type: "event",
      event: step.event,
      startTime: step.startTime,
      ...(typeof step.duration === "number" && Number.isFinite(step.duration)
        ? { duration: Math.max(0, step.duration) }
        : {}),
    };
  }
  if (
    step.type === "event" &&
    step.event === "Move" &&
    typeof step.startTime === "number" &&
    Number.isFinite(step.startTime) &&
    typeof step.distance === "number" &&
    Number.isFinite(step.distance)
  ) {
    return {
      type: "event",
      event: "Move",
      startTime: step.startTime,
      distance: Math.max(1, Math.floor(step.distance)),
    };
  }
  return undefined;
}

function parseRotation(value: unknown): RotationRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as {
    name?: unknown;
    steps?: unknown;
    targetHP?: unknown;
    start?: unknown;
    eventTimeReference?: unknown;
  };
  if (typeof candidate.name !== "string" || !candidate.name.trim() || !Array.isArray(candidate.steps)) return undefined;
  const steps = candidate.steps.map(parseRotationStep);
  if (steps.some((step) => !step)) return undefined;
  const parsedSteps = steps.filter((step): step is RotationStep => Boolean(step));
  const startValue =
    candidate.start && typeof candidate.start === "object" && !Array.isArray(candidate.start)
      ? (candidate.start as { step?: unknown; action?: unknown })
      : undefined;
  const validStartStep =
    startValue &&
    typeof startValue.step === "number" &&
    Number.isInteger(startValue.step) &&
    startValue.step >= 0 &&
    startValue.step < parsedSteps.length;
  const validStartAction =
    startValue?.action === undefined ||
    (typeof startValue.action === "number" && Number.isInteger(startValue.action) && startValue.action >= 0);
  const start =
    validStartStep && validStartAction
      ? {
          step: startValue.step as number,
          ...(typeof startValue.action === "number" ? { action: startValue.action } : {}),
        }
      : undefined;
  return {
    name: candidate.name,
    steps: parsedSteps,
    ...(typeof candidate.targetHP === "number" && Number.isFinite(candidate.targetHP) && candidate.targetHP > 0
      ? { targetHP: candidate.targetHP }
      : {}),
    ...(start ? { start } : {}),
    ...(candidate.eventTimeReference === "battleStart" ? { eventTimeReference: "battleStart" as const } : {}),
  };
}

function importedId(originalId: string, usedIds: Set<string>) {
  if (!usedIds.has(originalId)) {
    usedIds.add(originalId);
    return originalId;
  }
  const baseId = `${originalId}:imported`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}:${suffix++}`;
  usedIds.add(id);
  return id;
}

export function exportRotationEntries(entries: RotationEntry[]) {
  return JSON.stringify(
    {
      format: rotationExportFormat,
      version: 7,
      exportedAt: new Date().toISOString(),
      rotations: entries
        .filter((entry) => !entry.isDefault)
        .map(({ id, rotation, martialArts }) => ({ id, rotation, martialArts: parseMartialArts(martialArts) })),
    },
    null,
    2,
  );
}

export function mergeImportedRotationEntries(current: RotationEntry[], value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("This is not a Where Builds Meet rotation export file.");
  const source = value as { format?: unknown; version?: unknown; rotations?: unknown };
  if (
    source.format !== rotationExportFormat ||
    (source.version !== 1 &&
      source.version !== 2 &&
      source.version !== 3 &&
      source.version !== 4 &&
      source.version !== 5 &&
      source.version !== 6 &&
      source.version !== 7) ||
    !Array.isArray(source.rotations)
  ) {
    throw new Error("This file uses an unsupported rotation export format.");
  }

  const usedIds = new Set(current.map((entry) => entry.id));
  const importedEntries = source.rotations.flatMap((value): RotationEntry[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const candidate = value as { id?: unknown; rotation?: unknown; martialArts?: unknown; isDefault?: unknown };
    if (candidate.isDefault === true || typeof candidate.id !== "string" || !candidate.id) return [];
    const rotation = parseRotation(candidate.rotation);
    return rotation
      ? [{ id: importedId(candidate.id, usedIds), rotation, martialArts: parseMartialArts(candidate.martialArts) }]
      : [];
  });

  return {
    entries: [...current, ...importedEntries],
    importedCount: importedEntries.length,
    importedIds: importedEntries.map((entry) => entry.id),
  };
}
