import { nanoid } from "nanoid"

import { normalizeEnemyCount, normalizePing, resolveTargetType } from "@/calculations/combatDefaults"
import { resolveSwitchValue } from "@/calculations/dynamicValues"
import {
  buildRotationTimeline,
  editableCastTimeRequired,
  expandedSkillActionCount,
  expandedSkillActionLayout,
  isFixedTimeEvent,
  resolveSkillStepDuration,
  type AttachedEventTarget,
  type EditableObject,
  type RotationRecord,
  type RotationStep,
  type SkillRecord,
  type TimelineRow,
} from "@/calculations/rotationTimeline"
import {
  migrateAutomaticDelays,
  migrateDefenseActionAnchors,
  migrateDrunkenPoetSequences,
  migrateGeneralsBaneSlides,
  migrateVendettaTokenStep,
  normalizeRotationStart,
} from "@/rotationEditing"
import type { RotationEntry } from "@/rotationTransfer"
import { migrateSkillId } from "@/skillIdMigrations"
import { normalizeStoredWeaponIds, weaponIds as allWeaponIds, type WeaponId } from "@/types"

import { rotationEventDefinitions } from "./gameData/rotationEffects"
import { allSkillDefinitions, dotDefinitions, effectDefinitions, martialArtBySkillId } from "./gameData/skills"

export function normalizeStartAction(start: RotationRecord["start"], steps: RotationStep[]): RotationRecord["start"] {
  if (!start || start.action === undefined) return start
  const step = steps[start.step]
  if (step?.type !== "skill") return { step: start.step }
  const actionCount = expandedSkillActionCount(step.skill ?? "", allSkillDefinitions)
  if (start.action < 0 || start.action >= actionCount) return { step: start.step }
  return start
}

export function normalizeRotation(rotation: RotationRecord): RotationRecord {
  // Reconstruct supported fields: discard legacy autoHP, preserving manual HP events and anchors.
  const steps: RotationStep[] = (rotation.steps as Array<RotationStep & { repeat?: number }>).flatMap(
    (step): RotationStep[] => {
      if (step.type === "event") return [migrateVendettaTokenStep(step)]
      step = { ...step, skill: step.skill ? migrateSkillId(step.skill) : step.skill }
      if (
        editableCastTimeRequired(allSkillDefinitions[step.skill ?? ""]) &&
        (typeof step.duration !== "number" || !Number.isFinite(step.duration))
      )
        return []
      const repeat = Math.max(1, step.repeat ?? 1)
      const { repeat: _repeat, ...stepWithoutRepeat } = step
      return Array.from({ length: repeat }, (_, index) => ({
        ...stepWithoutRepeat,
        causesBreak: index === repeat - 1 ? step.causesBreak : undefined,
      })) as RotationStep[]
    },
  )
  const start = normalizeStartAction(normalizeRotationStart(rotation.start, steps), steps)
  return {
    name: rotation.name,
    steps,
    ...(typeof rotation.targetHP === "number" && rotation.targetHP > 0 ? { targetHP: rotation.targetHP } : {}),
    ...(normalizePing(rotation.ping) !== undefined ? { ping: normalizePing(rotation.ping) } : {}),
    targetType: resolveTargetType(rotation),
    enemyCount: normalizeEnemyCount(rotation.enemyCount),
    groupSize: rotation.groupSize === 5 || rotation.groupSize === 10 ? rotation.groupSize : 1,
    infiniteVitality:
      typeof rotation.infiniteVitality === "boolean"
        ? rotation.infiniteVitality
        : /\bIV\b|infinite vitality/i.test(rotation.name),
    ...(typeof rotation.divinecraftDamage === "boolean" ? { divinecraftDamage: rotation.divinecraftDamage } : {}),
    start,
    ...(rotation.eventTimeReference === "battleStart" ? { eventTimeReference: "battleStart" as const } : {}),
  }
}

export function eventDefaultDuration(event: "Exhausted" | "Controlled") {
  return effectDefinitions[event]?.duration ?? 0
}

export function baseSkillCastTime(skill: SkillRecord | undefined) {
  if (typeof skill?.castTime === "number" && Number.isFinite(skill.castTime)) return skill.castTime
  const fallback = resolveSwitchValue(skill?.castTime, {})
  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0
}

function baseStepCastTime(step: RotationStep) {
  if (step.type !== "skill") return 0
  const skill = allSkillDefinitions[step.skill ?? ""]
  return resolveSkillStepDuration(step, skill) ?? baseSkillCastTime(skill)
}

export function baseRotationAnchorTime(rotation: RotationRecord) {
  if (!rotation.start) return 0
  let time = 0
  for (const [stepIndex, step] of rotation.steps.entries()) {
    if (stepIndex === rotation.start.step) {
      if (step.type !== "skill") return time
      const actionTimes = expandedSkillActionLayout(step.skill ?? "", allSkillDefinitions).actionTimes
      return time + (rotation.start.action === undefined ? 0 : Number(actionTimes[rotation.start.action] ?? 0))
    }
    if (step.type === "skill") time += baseStepCastTime(step)
    else if (step.event === "Delay") time += Math.max(0, step.duration)
  }
  return 0
}

export function baseAttachedEventTime(rotation: RotationRecord, eventStepIndex: number, target: AttachedEventTarget) {
  let elapsed = 0
  for (const [stepIndex, step] of rotation.steps.entries()) {
    if (step.type === "skill") {
      const skill = allSkillDefinitions[step.skill ?? ""]
      if (stepIndex > eventStepIndex) {
        if (target.action === "start") return elapsed
        const actions = Array.isArray(skill?.action) ? (skill.action as EditableObject[]) : []
        if (target.trigger === undefined) return elapsed + Number(actions[target.action]?.time ?? 0)
        const triggerAction = actions.filter(action => action.type === "trigger")[target.trigger]
        if (!triggerAction || typeof triggerAction.value !== "string") return elapsed
        const triggeredSkill = allSkillDefinitions[triggerAction.value]
        const triggeredActions = Array.isArray(triggeredSkill?.action)
          ? (triggeredSkill.action as EditableObject[])
          : []
        return elapsed + Number(triggerAction.time ?? 0) + Number(triggeredActions[target.action]?.time ?? 0)
      }
      elapsed += baseStepCastTime(step)
    } else if (step.event === "Delay") {
      elapsed += Math.max(0, step.duration)
    }
  }
  return elapsed
}

export function timelineAnchorTime(timeline: TimelineRow[], startAnchor: { rowId: string; actionIndex?: number }) {
  if (timeline[0]?.battleStartTime !== undefined) return Math.max(0, timeline[0].battleStartTime)
  const anchorRow = timeline.find(row => row.id === startAnchor.rowId)
  if (!anchorRow) return 0
  if (startAnchor.actionIndex === undefined) return anchorRow.startTime
  return anchorRow.startTime + Number(anchorRow.actions[startAnchor.actionIndex]?.time ?? 0)
}

export function migrateRotation(rotation: RotationRecord): RotationRecord {
  const migrated = migrateDefenseActionAnchors(
    migrateAutomaticDelays(migrateDrunkenPoetSequences(migrateGeneralsBaneSlides(normalizeRotation(rotation)))),
  )
  // Attached Take Damage from pre-battle-start records is a legacy fixed-time form.
  // Once a rotation has the explicit reference, preserve an attached event so it can
  // round-trip through the editor after a user reattaches it.
  const migrateAttachedDamage = migrated.eventTimeReference !== "battleStart"
  const attachedDamageIndexes = migrateAttachedDamage
    ? migrated.steps.flatMap((step, index) =>
        step.type === "event" && step.event === "TakeDamage" && "before" in step && !isFixedTimeEvent(step)
          ? [index]
          : [],
      )
    : []
  const migrationTimeline = attachedDamageIndexes.length
    ? buildRotationTimeline({
        rotation: migrated,
        skills: allSkillDefinitions,
        eventDefinitions: rotationEventDefinitions,
        dots: dotDefinitions,
        effectDefinitions,
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      })
    : []
  const anchorTime = migrationTimeline.length
    ? timelineAnchorTime(migrationTimeline, {
        rowId: `rotation-${migrated.start?.step ?? 0}`,
        actionIndex: migrated.start?.action,
      })
    : baseRotationAnchorTime(migrated)
  migrated.steps = migrated.steps.map((step, stepIndex) => {
    const legacyStep = step as unknown as Record<string, unknown>
    if (step.type !== "event") return step
    if (migrateAttachedDamage && step.event === "TakeDamage" && "before" in step && !isFixedTimeEvent(step)) {
      const targetTime =
        migrationTimeline.find(row => row.id === `rotation-${stepIndex}`)?.startTime ??
        baseAttachedEventTime(migrated, stepIndex, step.before)
      return {
        type: "event",
        event: "TakeDamage",
        startTime: migrated.eventTimeReference === "battleStart" ? targetTime - anchorTime : targetTime,
        damage: step.damage,
      }
    }
    if (step.event === "HP" && !isFixedTimeEvent(step) && typeof legacyStep.currentHPRatio === "number")
      return {
        type: "event",
        event: "SelfHP",
        before: legacyStep.before as AttachedEventTarget,
        currentHPRatio: legacyStep.currentHPRatio,
      }
    if (step.event === "Debuff" && step.debuff === "Exhausted" && "before" in step && !isFixedTimeEvent(step))
      return { type: "event", event: "Qi", before: step.before, targetQiRatio: 0 }
    if (
      step.event === "Debuff" &&
      step.debuff === "Exhausted" &&
      "startTime" in step &&
      typeof step.startTime === "number" &&
      Number.isFinite(step.startTime)
    )
      return { type: "event", event: "Qi", startTime: step.startTime, targetQiRatio: 0 }
    if (legacyStep.event === "Exhausted" && (legacyStep.after || legacyStep.before) && !isFixedTimeEvent(step))
      return {
        type: "event",
        event: "Qi",
        after: (legacyStep.after ?? legacyStep.before) as AttachedEventTarget,
        targetQiRatio: 0,
      }
    return step
  })
  if (migrated.eventTimeReference !== "battleStart") {
    const previousAnchorTime = baseRotationAnchorTime(migrated)
    migrated.steps = migrated.steps.map(step =>
      step.type === "event" && "startTime" in step && typeof step.startTime === "number"
        ? { ...step, startTime: step.startTime - previousAnchorTime }
        : step,
    )
    migrated.eventTimeReference = "battleStart"
  }
  const legacyEvents = migrated.steps.flatMap((step, index) =>
    step.type === "event" &&
    (step.event === "Move" || (step as unknown as { event: string }).event === "Exhausted") &&
    isFixedTimeEvent(step) &&
    !("before" in step) &&
    !("after" in step)
      ? [{ step, index }]
      : [],
  )
  if (legacyEvents.length) {
    const anchor = baseRotationAnchorTime(migrated)
    let elapsed = 0
    const candidates = migrated.steps.flatMap((step, index) => {
      if (step.type !== "skill") return []
      const skill = allSkillDefinitions[step.skill ?? ""]
      const castStart = elapsed
      elapsed += baseStepCastTime(step)
      const actions = Array.isArray(skill?.action) ? (skill.action as EditableObject[]) : []
      return [{ index, time: castStart - anchor, before: { action: "start" } as AttachedEventTarget }].concat(
        actions.flatMap((action, actionIndex) => {
          const time = castStart + Number(action.time ?? 0) - anchor
          const direct = { index, time, before: { action: actionIndex } as AttachedEventTarget }
          if (action.type !== "trigger" || typeof action.value !== "string") return [direct]
          const triggered = allSkillDefinitions[action.value]
          const triggeredActions = Array.isArray(triggered?.action) ? (triggered.action as EditableObject[]) : []
          const triggerOrdinal =
            actions.slice(0, actionIndex + 1).filter(candidate => candidate.type === "trigger").length - 1
          return [direct].concat(
            triggeredActions.map((triggeredAction, triggeredActionIndex) => ({
              index,
              time: time + Number(triggeredAction.time ?? 0),
              before: { trigger: triggerOrdinal, action: triggeredActionIndex } as AttachedEventTarget,
            })),
          )
        }),
      )
    })
    const attachments = new Map<number, RotationStep[]>()
    const legacyStartTargets = new Map<number, number>()
    const convertedLegacyIndexes = new Set<number>()
    legacyEvents.forEach(({ step, index }) => {
      if (!candidates.length) return
      const target = candidates.reduce(
        (best, candidate) =>
          Math.abs(candidate.time - step.startTime) < Math.abs(best.time - step.startTime) ? candidate : best,
        candidates[0],
      )
      if (!target) return
      const attached =
        step.event === "Move"
          ? ({ type: "event", event: "Move", before: target.before, distance: step.distance } as RotationStep)
          : ({ type: "event", event: "Qi", after: target.before, targetQiRatio: 0 } as RotationStep)
      attachments.set(target.index, [...(attachments.get(target.index) ?? []), attached])
      convertedLegacyIndexes.add(index)
      legacyStartTargets.set(index, target.index)
    })
    const originalStart = migrated.start ? { ...migrated.start } : undefined
    const originalStartStep = originalStart ? migrated.steps[originalStart.step] : undefined
    const originalStartWasConverted = originalStart ? convertedLegacyIndexes.has(originalStart.step) : false
    const flattened: Array<{ oldIndex: number; step: RotationStep }> = []
    migrated.steps.forEach((step, index) => {
      if (convertedLegacyIndexes.has(index)) return
      if (step.type === "skill") {
        for (const attached of attachments.get(index) ?? []) flattened.push({ oldIndex: -1, step: attached })
        flattened.push({ oldIndex: index, step })
      } else flattened.push({ oldIndex: index, step })
    })
    migrated.steps = flattened.map(entry => entry.step)
    const newIndexByOldIndex = new Map<number, number>()
    flattened.forEach((entry, index) => {
      if (entry.oldIndex >= 0) newIndexByOldIndex.set(entry.oldIndex, index)
    })
    for (const [oldIndex, targetIndex] of legacyStartTargets)
      newIndexByOldIndex.set(oldIndex, newIndexByOldIndex.get(targetIndex) ?? -1)
    if (originalStart) {
      const nextStartStep = newIndexByOldIndex.get(originalStart.step) ?? -1
      if (nextStartStep >= 0)
        migrated.start = {
          step: nextStartStep,
          ...(!originalStartWasConverted && originalStartStep?.type === "skill" && originalStart.action !== undefined
            ? { action: originalStart.action }
            : {}),
        }
      else {
        const fallback = migrated.steps.findIndex(
          step => step.type === "skill" || (step.type === "event" && step.event === "Delay"),
        )
        migrated.start = fallback >= 0 ? { step: fallback } : undefined
      }
    }
  }
  migrated.start = normalizeStartAction(normalizeRotationStart(migrated.start, migrated.steps), migrated.steps)
  return migrated
}

export type RotationPresetRecord = RotationRecord & { martialArts?: WeaponId[]; test?: boolean }
export const rotationPresetModules = import.meta.glob("../../data/rotation/**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, RotationPresetRecord>
export function rotationMartialArts(rotation: RotationRecord, explicit?: unknown) {
  const configured = normalizeStoredWeaponIds(explicit)
  if (configured.length) return configured
  const inferred = [
    ...new Set(
      rotation.steps.flatMap(step => (step.type === "skill" ? (martialArtBySkillId.get(step.skill ?? "") ?? []) : [])),
    ),
  ]
  return inferred.length ? inferred : [...allWeaponIds]
}
export function rotationAvailableForWeapons(entry: RotationEntry, weapons: [WeaponId, WeaponId]) {
  if (allWeaponIds.every(weapon => entry.martialArts.includes(weapon))) return true
  const selected = [...new Set(weapons)]
  const tagged = [...new Set(entry.martialArts)]
  return tagged.length === selected.length && selected.every(weapon => tagged.includes(weapon))
}
export const defaultRotationEntries = Object.entries(rotationPresetModules)
  .sort(
    ([leftPath, left], [rightPath, right]) =>
      Number(left.test === true) - Number(right.test === true) || leftPath.localeCompare(rightPath),
  )
  .map(([path, rotation]): RotationEntry => ({
    id:
      path
        .split("/")
        .pop()
        ?.replace(/\.json$/, "") ?? path,
    rotation: migrateRotation(rotation),
    martialArts: rotationMartialArts(rotation, rotation.martialArts),
    isDefault: true,
    test: rotation.test === true,
  }))
export const defaultRotation = defaultRotationEntries[0]?.rotation ?? { name: "Default Rotation", steps: [] }
export const defaultRotationId = defaultRotationEntries[0]?.id ?? "default-rotation"
export const formerDefaultRotationIds = new Set(["dummy-1-min"])

export function rotationRecordForEntry(entry: RotationEntry) {
  if (!entry.isDefault) return entry.rotation
  return defaultRotationEntries.find(preset => preset.id === entry.id)?.rotation ?? entry.rotation
}

export function createRotationId() {
  return `rotation-${nanoid()}`
}
