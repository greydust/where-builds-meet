import { allSkillDefinitions } from "./application/gameData/skills"
import { normalizeEnemyCount, normalizePing, resolveTargetType } from "./calculations/combatDefaults"
import {
  editableCastTimeRequired,
  expandedSkillActionCount,
  type RotationRecord,
  type RotationStep,
} from "./calculations/rotationTimeline"
import { migrateVendettaTokenStep } from "./rotationEditing"
import {
  migrateAutomaticDelays,
  migrateDefenseActionAnchors,
  migrateGeneralsBaneSlides,
  normalizeRotationStart,
} from "./rotationEditing"
import { validateUnknown } from "./schemas/json"
import { rotationExportInputSchema, rotationInputSchema, rotationStepInputSchema } from "./schemas/rotation"
import { normalizeStoredWeaponIds, weaponIds, type WeaponId } from "./types"

export const rotationExportFormat = "where-builds-meet-rotations"
export const rotationExportVersion = 10

export type RotationEntry = {
  id: string
  rotation: RotationRecord
  martialArts: WeaponId[]
  isDefault?: boolean
  test?: boolean
}

const weaponIdSet = new Set<WeaponId>(weaponIds)
const parseMartialArts = (value: unknown) => {
  const parsed = normalizeStoredWeaponIds(value)
  return parsed.length ? parsed : [...weaponIds]
}

export function serializeRotationEntries(entries: RotationEntry[]) {
  return JSON.stringify(
    entries
      .filter(entry => !entry.isDefault)
      .map(({ id, rotation, martialArts }) => ({ id, rotation, martialArts: parseMartialArts(martialArts) })),
  )
}

function parseRotationStep(value: unknown): RotationStep | undefined {
  const validated = validateUnknown(rotationStepInputSchema, value)
  if (!validated.success) return undefined
  const step = value as Record<string, unknown>
  if (step.type === "skill" && typeof step.skill === "string" && step.skill) {
    const duration = typeof step.duration === "number" && Number.isFinite(step.duration) ? step.duration : undefined
    if (editableCastTimeRequired(allSkillDefinitions[step.skill]) && duration === undefined) return undefined
    return {
      type: "skill",
      skill: step.skill,
      ...(duration === undefined ? {} : { duration: Math.max(0, duration) }),
      ...(typeof step.causesBreak === "boolean" ? { causesBreak: step.causesBreak } : {}),
      ...(typeof step.condition === "string" ? { condition: step.condition } : {}),
    }
  }
  const parseAttachment = (value: unknown) => {
    const attachment =
      value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
    const action = attachment?.action
    const trigger = attachment?.trigger
    if (
      !attachment ||
      !(action === "start" || (typeof action === "number" && Number.isInteger(action) && action >= 0)) ||
      !(trigger === undefined || (typeof trigger === "number" && Number.isInteger(trigger) && trigger >= 0))
    )
      return undefined
    return { action: action as number | "start", ...(typeof trigger === "number" ? { trigger } : {}) }
  }
  const before = parseAttachment(step.before)
  const after = parseAttachment(step.after)
  const startTime = typeof step.startTime === "number" && Number.isFinite(step.startTime) ? step.startTime : undefined
  const optionalStartTime = startTime === undefined ? {} : { startTime }
  const duration =
    typeof step.duration === "number" && Number.isFinite(step.duration) ? Math.max(0, step.duration) : undefined
  const optionalDuration = duration === undefined ? {} : { duration }
  const event = (fields: Record<string, unknown>) => ({ type: "event", ...fields }) as RotationStep
  if (
    step.type === "event" &&
    step.event === "BossGeneralDamageBoost" &&
    (before || startTime !== undefined) &&
    duration !== undefined &&
    typeof step.damageBonus === "number" &&
    Number.isFinite(step.damageBonus)
  ) {
    return event({
      event: "BossGeneralDamageBoost",
      ...(before ? { before, ...optionalStartTime } : { startTime }),
      duration,
      damageBonus: Math.max(0, step.damageBonus),
    })
  }
  const stackValue =
    typeof step.stack === "number" && Number.isFinite(step.stack) ? Math.max(1, Math.floor(step.stack)) : undefined
  const optionalStack = stackValue === undefined ? {} : { stack: stackValue }

  if (
    step.type === "event" &&
    (step.event === "Hellfire" || step.event === "Blossoms") &&
    typeof step.amount === "number" &&
    Number.isFinite(step.amount) &&
    (before || startTime !== undefined)
  ) {
    return event({
      event: step.event,
      ...(before ? { before } : { startTime: startTime! }),
      amount: step.amount,
      ...(before ? optionalStartTime : {}),
    })
  }
  if (step.type === "event" && step.event === "Exhausted" && (after || before)) {
    if (startTime !== undefined) {
      return event({ event: "Exhausted", ...(after ? { after } : { before: before! }), startTime, ...optionalDuration })
    }
    return event({ event: "Qi", after: after ?? before!, targetQiRatio: 0 })
  }
  if (
    step.type === "event" &&
    step.event === "Move" &&
    typeof step.distance === "number" &&
    Number.isFinite(step.distance) &&
    (before || startTime !== undefined)
  ) {
    return event({
      event: "Move",
      ...(before ? { before } : { startTime: startTime! }),
      distance: Math.max(0, Math.floor(step.distance)),
      ...(before ? optionalStartTime : {}),
    })
  }
  if (
    step.type === "event" &&
    step.event === "SelfHP" &&
    ((typeof step.currentHP === "number" && Number.isFinite(step.currentHP)) ||
      (typeof step.currentHPRatio === "number" && Number.isFinite(step.currentHPRatio))) &&
    (before || startTime !== undefined)
  ) {
    return event({
      event: "SelfHP",
      ...(before ? { before } : { startTime: startTime! }),
      ...(typeof step.currentHP === "number"
        ? { currentHP: Math.max(0, step.currentHP) }
        : { currentHPRatio: Math.min(1, Math.max(0, step.currentHPRatio as number)) }),
      ...(before ? optionalStartTime : {}),
    })
  }
  if (
    step.type === "event" &&
    step.event === "TakeDamage" &&
    typeof step.damage === "number" &&
    Number.isFinite(step.damage) &&
    (before || startTime !== undefined)
  ) {
    return event({
      event: "TakeDamage",
      ...(before ? { before } : { startTime: startTime! }),
      damage: Math.max(0, step.damage),
      ...(before ? optionalStartTime : {}),
    })
  }
  if (
    step.type === "event" &&
    step.event === "HP" &&
    typeof step.targetHPRatio === "number" &&
    Number.isFinite(step.targetHPRatio) &&
    (before || startTime !== undefined)
  ) {
    return event({
      event: "HP",
      ...(before ? { before } : { startTime: startTime! }),
      targetHPRatio: Math.min(1, Math.max(0, step.targetHPRatio)),
      ...(before ? optionalStartTime : {}),
      ...(!before && step.automatic === true ? { automatic: true } : {}),
    })
  }
  if (
    step.type === "event" &&
    step.event === "Qi" &&
    typeof step.targetQiRatio === "number" &&
    Number.isFinite(step.targetQiRatio) &&
    (before || after || startTime !== undefined)
  ) {
    return event({
      event: "Qi",
      ...(before ? { before } : after ? { after } : { startTime: startTime! }),
      targetQiRatio: Math.min(1, Math.max(0, step.targetQiRatio)),
      ...(before || after ? optionalStartTime : {}),
    })
  }
  if (
    step.type === "event" &&
    step.event === "Buff" &&
    typeof step.buff === "string" &&
    step.buff &&
    (before || startTime !== undefined)
  ) {
    return migrateVendettaTokenStep(
      event({
        event: "Buff",
        ...(before ? { before } : { startTime: startTime! }),
        buff: step.buff,
        ...optionalStack,
        ...(before ? optionalStartTime : {}),
      }),
    )
  }
  if (
    step.type === "event" &&
    step.event === "Debuff" &&
    typeof step.debuff === "string" &&
    step.debuff &&
    (before || startTime !== undefined)
  ) {
    if (step.debuff === "Exhausted") {
      return event({
        event: "Qi",
        ...(before ? { before } : { startTime: startTime! }),
        targetQiRatio: 0,
        ...(before ? optionalStartTime : {}),
      })
    }
    return event({
      event: "Debuff",
      ...(before ? { before } : { startTime: startTime! }),
      debuff: step.debuff,
      ...optionalStack,
      ...(before ? optionalStartTime : {}),
    })
  }
  if (
    step.type === "event" &&
    step.event === "MartialArt" &&
    before?.action === "start" &&
    before.trigger === undefined &&
    startTime === undefined &&
    typeof step.martialArt === "string" &&
    weaponIdSet.has(step.martialArt as WeaponId)
  ) {
    return event({ event: "MartialArt", before: { action: "start" }, martialArt: step.martialArt as WeaponId })
  }
  if (
    step.type === "event" &&
    step.event === "Delay" &&
    startTime === undefined &&
    typeof step.duration === "number" &&
    Number.isFinite(step.duration)
  ) {
    return event({
      event: "Delay",
      duration: Math.max(0, step.duration),
      ...(step.automatic === "cooldown" || step.automatic === "attack" || step.automatic === "requirement"
        ? { automatic: step.automatic }
        : {}),
    })
  }
  if (step.type === "event" && step.event === "Exhausted" && startTime !== undefined) {
    return event({ event: "Exhausted", startTime, ...optionalDuration })
  }
  if (
    step.type === "event" &&
    (step.event === "Controlled" || step.event === "BattleEnd" || step.event === "ShieldBroken") &&
    (before || startTime !== undefined)
  ) {
    return event({
      event: step.event,
      ...(before ? { before } : { startTime: startTime! }),
      ...optionalDuration,
      ...(before ? optionalStartTime : {}),
    })
  }
  return undefined
}

function parseRotation(value: unknown): RotationRecord | undefined {
  const validated = validateUnknown(rotationInputSchema, value)
  if (!validated.success) return undefined
  const candidate = value as {
    name?: unknown
    steps?: unknown
    targetHP?: unknown
    targetType?: unknown
    dummyAttack?: unknown
    groupSize?: unknown
    enemyCount?: unknown
    ping?: unknown
    infiniteVitality?: unknown
    divinecraftDamage?: unknown
    start?: unknown
    eventTimeReference?: unknown
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim() || !Array.isArray(candidate.steps)) return undefined
  const steps = candidate.steps.map(parseRotationStep)
  if (steps.some(step => !step)) return undefined
  // Legacy autoHP is ignored; preserve authored HP events and their anchors.
  const parsedSteps = steps.filter((step): step is RotationStep => Boolean(step))
  const startValue =
    candidate.start && typeof candidate.start === "object" && !Array.isArray(candidate.start)
      ? (candidate.start as { step?: unknown; action?: unknown })
      : undefined
  const validStartStep =
    startValue &&
    typeof startValue.step === "number" &&
    Number.isInteger(startValue.step) &&
    startValue.step >= 0 &&
    startValue.step < parsedSteps.length
  const validStartAction =
    startValue?.action === undefined ||
    (typeof startValue.action === "number" && Number.isInteger(startValue.action) && startValue.action >= 0)
  const start =
    validStartStep && validStartAction
      ? {
          step: startValue.step as number,
          ...(typeof startValue.action === "number" ? { action: startValue.action } : {}),
        }
      : undefined
  const normalizedStart = normalizeRotationStart(start, parsedSteps)
  const startStep = normalizedStart ? parsedSteps[normalizedStart.step] : undefined
  const actionCount =
    normalizedStart?.action !== undefined && startStep?.type === "skill"
      ? expandedSkillActionCount(startStep.skill ?? "", allSkillDefinitions)
      : 0
  const boundedStart =
    normalizedStart?.action !== undefined && normalizedStart.action >= actionCount
      ? { step: normalizedStart.step }
      : normalizedStart
  return migrateGeneralsBaneSlides(
    migrateDefenseActionAnchors(
      migrateAutomaticDelays({
        name: candidate.name,
        steps: parsedSteps,
        ...(typeof candidate.targetHP === "number" && Number.isFinite(candidate.targetHP) && candidate.targetHP > 0
          ? { targetHP: candidate.targetHP }
          : {}),
        targetType: resolveTargetType(candidate),
        ...(normalizePing(candidate.ping) !== undefined ? { ping: normalizePing(candidate.ping) } : {}),
        enemyCount: normalizeEnemyCount(candidate.enemyCount),
        groupSize: candidate.groupSize === 5 || candidate.groupSize === 10 ? candidate.groupSize : 1,
        ...(typeof candidate.infiniteVitality === "boolean"
          ? { infiniteVitality: candidate.infiniteVitality }
          : /\bIV\b|infinite vitality/i.test(candidate.name)
            ? { infiniteVitality: true }
            : {}),
        ...(typeof candidate.divinecraftDamage === "boolean" ? { divinecraftDamage: candidate.divinecraftDamage } : {}),
        ...(boundedStart ? { start: boundedStart } : {}),
        ...(candidate.eventTimeReference === "battleStart" ? { eventTimeReference: "battleStart" as const } : {}),
      }),
    ),
  )
}

function importedId(originalId: string, usedIds: Set<string>) {
  if (!usedIds.has(originalId)) {
    usedIds.add(originalId)
    return originalId
  }
  const baseId = `${originalId}:imported`
  let id = baseId
  let suffix = 2
  while (usedIds.has(id)) id = `${baseId}:${suffix++}`
  usedIds.add(id)
  return id
}

export function exportRotationEntries(entries: RotationEntry[]) {
  return JSON.stringify(
    {
      format: rotationExportFormat,
      version: rotationExportVersion,
      exportedAt: new Date().toISOString(),
      rotations: entries
        .filter(entry => !entry.isDefault)
        .map(({ id, rotation, martialArts }) => ({ id, rotation, martialArts: parseMartialArts(martialArts) })),
    },
    null,
    2,
  )
}

export function mergeImportedRotationEntries(current: RotationEntry[], value: unknown) {
  const validated = validateUnknown(rotationExportInputSchema, value)
  if (!validated.success) throw new Error("This is not a Where Builds Meet rotation export file.")
  const source = value as { format?: unknown; version?: unknown; rotations?: unknown }
  if (
    source.format !== rotationExportFormat ||
    typeof source.version !== "number" ||
    !Number.isInteger(source.version) ||
    source.version < 1 ||
    source.version > rotationExportVersion ||
    !Array.isArray(source.rotations)
  ) {
    throw new Error("This file uses an unsupported rotation export format.")
  }

  const usedIds = new Set(current.map(entry => entry.id))
  const importedEntries = source.rotations.flatMap((value): RotationEntry[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const candidate = value as { id?: unknown; rotation?: unknown; martialArts?: unknown; isDefault?: unknown }
    if (candidate.isDefault === true || typeof candidate.id !== "string" || !candidate.id) return []
    const rotation = parseRotation(candidate.rotation)
    return rotation
      ? [{ id: importedId(candidate.id, usedIds), rotation, martialArts: parseMartialArts(candidate.martialArts) }]
      : []
  })

  return {
    entries: [...current, ...importedEntries],
    importedCount: importedEntries.length,
    importedIds: importedEntries.map(entry => entry.id),
  }
}
