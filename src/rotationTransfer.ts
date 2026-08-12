import type { RotationRecord, RotationStep } from "./calculations/rotationTimeline";

export const rotationExportFormat = "where-builds-meet-rotations";

export type RotationEntry = {
  id: string;
  rotation: RotationRecord;
  isDefault?: boolean;
};

export function serializeRotationEntries(entries: RotationEntry[]) {
  return JSON.stringify(entries.filter((entry) => !entry.isDefault).map(({ id, rotation }) => ({ id, rotation })));
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
  if (step.type === "event" && (step.event === "Exhausted" || step.event === "Controlled" || step.event === "BattleEnd") && typeof step.startTime === "number" && Number.isFinite(step.startTime)) {
    return {
      type: "event",
      event: step.event,
      startTime: step.startTime,
      ...(typeof step.duration === "number" && Number.isFinite(step.duration) ? { duration: Math.max(0, step.duration) } : {}),
    };
  }
  if (step.type === "event" && step.event === "Move" && typeof step.startTime === "number" && Number.isFinite(step.startTime) && typeof step.distance === "number" && Number.isFinite(step.distance)) {
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
  const candidate = value as { name?: unknown; steps?: unknown; start?: unknown; eventTimeReference?: unknown };
  if (typeof candidate.name !== "string" || !candidate.name.trim() || !Array.isArray(candidate.steps)) return undefined;
  const steps = candidate.steps.map(parseRotationStep);
  if (steps.some((step) => !step)) return undefined;
  const parsedSteps = steps.filter((step): step is RotationStep => Boolean(step));
  const startValue = candidate.start && typeof candidate.start === "object" && !Array.isArray(candidate.start)
    ? candidate.start as { step?: unknown; action?: unknown }
    : undefined;
  const validStartStep = startValue
    && typeof startValue.step === "number" && Number.isInteger(startValue.step) && startValue.step >= 0 && startValue.step < parsedSteps.length;
  const validStartAction = startValue?.action === undefined
    || typeof startValue.action === "number" && Number.isInteger(startValue.action) && startValue.action >= 0;
  const start = validStartStep && validStartAction
    ? { step: startValue.step as number, ...(typeof startValue.action === "number" ? { action: startValue.action } : {}) }
    : undefined;
  return { name: candidate.name, steps: parsedSteps, ...(start ? { start } : {}), ...(candidate.eventTimeReference === "battleStart" ? { eventTimeReference: "battleStart" as const } : {}) };
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
  return JSON.stringify({
    format: rotationExportFormat,
    version: 1,
    exportedAt: new Date().toISOString(),
    rotations: entries.filter((entry) => !entry.isDefault).map(({ id, rotation }) => ({ id, rotation })),
  }, null, 2);
}

export function mergeImportedRotationEntries(current: RotationEntry[], value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This is not a Where Builds Meet rotation export file.");
  const source = value as { format?: unknown; version?: unknown; rotations?: unknown };
  if (source.format !== rotationExportFormat || source.version !== 1 || !Array.isArray(source.rotations)) {
    throw new Error("This file uses an unsupported rotation export format.");
  }

  const usedIds = new Set(current.map((entry) => entry.id));
  const importedEntries = source.rotations.flatMap((value): RotationEntry[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const candidate = value as { id?: unknown; rotation?: unknown; isDefault?: unknown };
    if (candidate.isDefault === true || typeof candidate.id !== "string" || !candidate.id) return [];
    const rotation = parseRotation(candidate.rotation);
    return rotation ? [{ id: importedId(candidate.id, usedIds), rotation }] : [];
  });

  return {
    entries: [...current, ...importedEntries],
    importedCount: importedEntries.length,
    importedIds: importedEntries.map((entry) => entry.id),
  };
}
