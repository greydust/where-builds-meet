import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconClockPin,
  IconEdit,
  IconPlus,
  IconPointFilled,
  IconX,
} from "@tabler/icons-react"
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type SetStateAction,
} from "react"

import {
  attunementAvailableForSettings,
  characterStatAvailableForSettings,
  innerWayAvailableForPath,
  innerWayConditionsFor,
  innerWayEffectRulesFor,
  selectableRotationSkillGroups,
  selectedSetupEffects,
  setAvailableForSettings,
  setupConditionsFor,
} from "../../application/characterComposition"
import {
  baselineMetricsWithPreviousComparisons,
  combineComparisonVariantMetrics,
  comparisonCategoryOrder,
  comparisonVariantRequests,
  mergeComparisonCategory,
  type ComparisonVariantRequest,
} from "../../application/comparison"
import type { CharacterState, PathId } from "../../application/contracts"
import {
  formatDamageNumber,
  formatNumber,
  formatResourceRange,
  skillCategoryLabel,
  skillDisplayName,
} from "../../application/formatting"
import { martialArtDefinitions } from "../../application/gameData/martialArts"
import { typedPathDefinitions } from "../../application/gameData/paths"
import { rotationEventDefinitions, rotationEventDisplayName } from "../../application/gameData/rotationEffects"
import {
  breakthroughProfile,
  typedArmorSetDefinitions,
  typedArsenalDefinitions,
  typedBowRingSetDefinitions,
  typedDivinecraftDefinitions,
  typedFoodDefinitions,
  typedScriptDefinitions,
  typedSystemStats,
  typedWeaponSetDefinitions,
} from "../../application/gameData/setup"
import {
  defaultSkillMaps,
  dotDefinitions,
  dotEffectIds,
  effectDefinitions,
  manualBuffDefinitions,
  manualDebuffDefinitions,
  rotationActionOptionIds,
  rotationEventOptionIds,
  withExpectedOutcomeBuffPlates,
} from "../../application/gameData/skills"
import {
  buildGraduationBundleSet,
  selectHighestGraduationResult,
  type GraduationPresetEnvironment,
} from "../../application/graduation"
import { percentageAttunementKeys } from "../../application/persistence/attunements"
import { rotationListStorageKey } from "../../application/persistence/keys"
import { initialRotationEditorState } from "../../application/persistence/rotations"
import { RotationActionBreakdownValue } from "../../application/results/DamageBreakdownValue"
import { RotationSkillName } from "../../application/results/RotationSkillName"
import {
  baseSkillCastTime,
  createRotationId,
  eventDefaultDuration,
  migrateRotation,
  normalizeStartAction,
  rotationAvailableForWeapons,
  rotationRecordForEntry,
} from "../../application/rotationCatalog"
import {
  bossDefinitionFor,
  bossDefinitions,
  normalizeEnemyCount,
  resolvePing,
  resolveTargetType,
  type TargetType,
} from "../../calculations/combatDefaults"
import { type AttunementStats } from "../../calculations/damage"
import type { EditorTimelineResult } from "../../calculations/editorTimeline"
import {
  RotationCalculationCache,
  calculationFingerprint,
  rotationBundleFingerprint,
} from "../../calculations/rotationCalculationCache"
import {
  type RotationActionBreakdown,
  type RotationSimulationBundle,
  type RotationSimulationResult,
  type RotationSimulationVariant,
} from "../../calculations/rotationCalculator"
import {
  beginRotationCalculation,
  completeRotationCalculationCategory,
  emptyRotationBreakdown,
  endRotationCalculation,
  getRotationMetrics,
  publishRotationCategoryProgress,
  type RotationCalculationCategory,
  type RotationMetrics,
  type RotationPriority,
} from "../../calculations/rotationMetrics"
import {
  durationInputMaximum,
  durationInputRequired,
  isFixedTimeEvent,
  mergeEffectDefinition,
  type RotationRecord,
  type RotationStep,
  type TimelineBuildInput,
  type TimelineRow,
} from "../../calculations/rotationTimeline"
import {
  requestRotationBaseline,
  requestEditorTimeline,
  cancelEditorTimelineRequest,
  requestRotationComparisons,
  supersedeRotationCalculationRequests,
} from "../../calculations/rotationWorkerClient"
import { innerWayDefinitions } from "../../data/innerWayDefinitions"
import { setupSelectionChangesTimeline } from "../../data/scriptDefinitions"
import { allStatDefinitions } from "../../data/statDefinitions"
import { sameEditorRevision, type EditorRevision } from "../../editorTimelinePreview"
import { attunementData, maxGearRoll, selectSetTier, setSelectionChangesTimeline, statRollsForLevel } from "../../gear"
import {
  globalDebuffRows,
  globalBuffTimelineEffects,
  globalDebuffTimelineEffects,
  loadGlobalDebuffs,
} from "../../globalDebuffs"
import { gameText, t } from "../../i18n"
import { publishNotice, dismissNotice } from "../../notices"
import { setPersistentItem } from "../../persistentStorage"
import { displayEntryKey, visibleTimelineEffects } from "../../rotationDisplay"
import {
  attachedEventPhase,
  attachedEventSiblingIndex,
  attachedTargetForStep,
  canUseRotationStart,
  canUseRotationStartAction,
  canUseRotationStartAt,
  isAutomaticDelay,
  isRuntimeAttachedEvent,
  moveEventToAttachmentTarget,
  normalizeRotationStart,
  reorderAttachedEventWithinTarget,
  resolveAttachmentTargetIndex,
  supportsEventStartTime,
  type RotationAttachmentTarget,
} from "../../rotationEditing"
import {
  exportRotationEntries,
  mergeImportedRotationEntries,
  serializeRotationEntries,
  type RotationEntry,
} from "../../rotationTransfer"
import { resolveSkillCalculationDefinitions, type SkillOverrides } from "../../skillOverrides"
import { type CharacterStats, type WeaponId } from "../../types"
import { Button } from "../../ui/Button"

function rotationEntryDisplayName(entry: RotationEntry) {
  const name = entry.rotation.name || "Unnamed Rotation"
  return entry.isDefault ? gameText(name) : name
}
import { Chip } from "../../ui/Chip"
import { Panel } from "../../ui/Panel"
import { Tooltip } from "../../ui/Tooltip"
import { RotationEnemyCountField } from "./RotationEnemyCountField"
import { RotationPingField } from "./RotationPingField"
import { useRotationTimelineDisplay } from "./useRotationTimelineDisplay"
import { useVirtualRowWindow } from "./useVirtualRowWindow"

/**
 * Finds a currently rendered row by its window key, without building a CSS selector.
 * The windowing wrapper carries the key, but the inner row is what scroll anchoring
 * measures, so that is what is returned.
 */
function renderedRowFor(container: HTMLElement, key: string): HTMLElement | null {
  for (const node of container.querySelectorAll<HTMLElement>("[data-window-key]")) {
    if (node.dataset.windowKey !== key) continue
    return node.querySelector<HTMLElement>(".rotation-table-row") ?? node
  }
  return null
}

export function RotationEditorTab({
  character,
  pathId,
  devMode,
  defaultRotationId,
  selectedRotationId,
  calculationCache,
  skillOverrides,
  onSelectRotationWeapons,
  onActiveRotationChange,
  onMetricsChange,
  onActiveSimulationBundleChange,
  onGraduationDpsChange,
}: {
  character: CharacterState
  pathId: PathId
  devMode: boolean
  defaultRotationId: string
  selectedRotationId: string
  calculationCache: RotationCalculationCache
  skillOverrides: SkillOverrides
  onSelectRotationWeapons: (weapons: [WeaponId, WeaponId], rotationId: string) => boolean
  onActiveRotationChange: (id: string) => void
  onMetricsChange: (metrics: RotationMetrics, isActive: boolean) => void
  onActiveSimulationBundleChange: (
    bundle: RotationSimulationBundle,
    rotationName: string,
    bundleKey: string,
    isDefault: boolean,
    graduation?: { fingerprint: string; dps?: number },
  ) => void
  onGraduationDpsChange: (fingerprint: string, dps: number) => void
}) {
  const {
    stats: displayedCharacterStats,
    baseStats: rawCharacterStats,
    rawStats: talentFormulaStats,
    attunementStats,
    settings,
    enemy,
    innerWayRevision: _innerWayRevision,
    setupSelections,
    gearStatEffect,
    buildSetup,
  } = character
  const rotationSkillGroups = useMemo(() => selectableRotationSkillGroups(settings.weapons), [settings.weapons])
  const rotationSkillIds = useMemo(() => rotationSkillGroups.flatMap(group => group.skillIds), [rotationSkillGroups])
  const innerWayConditions = useMemo(
    () => innerWayConditionsFor(buildSetup.innerWays, undefined, pathId),
    [buildSetup.innerWays, pathId],
  )
  const soloLevel = breakthroughProfile(settings).soloLevel
  const innerWayEffectRules = useMemo(
    () => innerWayEffectRulesFor(buildSetup.innerWays, soloLevel, pathId),
    [buildSetup.innerWays, soloLevel, pathId],
  )
  const calculationDefinitions = useMemo(
    () => resolveSkillCalculationDefinitions(defaultSkillMaps, effectDefinitions, dotDefinitions, skillOverrides),
    [skillOverrides],
  )
  const manualEffectMaxStacks = useMemo(() => {
    const maxStacks = new Map<string, number>()
    for (const [id, definition] of Object.entries(calculationDefinitions.effectDefinitions)) {
      const modifiedDefinition = innerWayEffectRules.reduce((current, rule) => {
        if (rule.target !== id || !rule.modify || rule.requirement !== undefined) return current
        return mergeEffectDefinition(current, rule.modify)
      }, definition)
      maxStacks.set(id, modifiedDefinition.maxStack ?? 1)
    }
    return maxStacks
  }, [calculationDefinitions.effectDefinitions, innerWayEffectRules])
  const [initialState] = useState(() =>
    initialRotationEditorState(devMode, selectedRotationId || defaultRotationId, settings.weapons),
  )
  const [rotationEntries, setRotationEntries] = useState<RotationEntry[]>(initialState.entries)
  const savedRotationSnapshotsRef = useRef<Map<string, RotationRecord> | null>(null)
  if (savedRotationSnapshotsRef.current === null)
    savedRotationSnapshotsRef.current = new Map(
      initialState.entries.map(entry => [entry.id, JSON.parse(JSON.stringify(entry.rotation)) as RotationRecord]),
    )
  const [editingRotationId, setEditingRotationId] = useState(initialState.activeId)
  const rotationNameInputRef = useRef<HTMLInputElement>(null)
  const [rotation, setRotation] = useState<RotationRecord>(() => migrateRotation(initialState.rotation))
  const [editorStepReplacements] = useState(() => new WeakMap<RotationStep, RotationStep>())
  const [startAnchor, setStartAnchor] = useState<{ rowId: string; actionIndex?: number }>(initialState.startAnchor)
  const [expandedSkillRows, setExpandedSkillRows] = useState<Set<string>>(() => new Set())
  const [editingName, setEditingName] = useState(false)
  const setStatus = (message: string) => {
    if (message) publishNotice({ id: "rotation-save", message })
    else dismissNotice("rotation-save")
  }
  const [error, setError] = useState("")
  const [eventTimeDrafts, setEventTimeDrafts] = useState<Record<string, string>>({})
  const [eventDurationDrafts, setEventDurationDrafts] = useState<Record<string, string>>({})
  const [eventDistanceDrafts, setEventDistanceDrafts] = useState<Record<string, string>>({})
  const [eventHPDrafts, setEventHPDrafts] = useState<Record<string, string>>({})
  const [rotationResults, setRotationResults] = useState<
    Record<string, { key: string; result: RotationSimulationResult }>
  >({})
  const rotationResultsRef = useRef(rotationResults)
  const calculationCacheRef = useRef(calculationCache)
  const editorPreviewRequestSequenceRef = useRef(0)
  const diffRequestSequenceRef = useRef(0)
  const scheduledRefreshTargetRef = useRef<string | null>(null)
  const runningRefreshTargetRef = useRef<string | null>(null)
  const graduationFingerprintRef = useRef<string | null>(null)
  const [refreshRetryRevision, setRefreshRetryRevision] = useState(0)
  const [readableDialogOpen, setReadableDialogOpen] = useState(false)
  const [readableCopyStatus, setReadableCopyStatus] = useState("")
  const readableDialogRef = useRef<HTMLDialogElement>(null)
  const readableTextRef = useRef<HTMLTextAreaElement>(null)
  const rotationImportInputRef = useRef<HTMLInputElement>(null)
  const rotationScrollRef = useRef<HTMLDivElement>(null)
  const rotationStepListRef = useRef<HTMLDivElement>(null)
  const pendingEventScrollRef = useRef<{
    stepIndex: number
    top: number
    step?: RotationStep
    rotationId?: string
  } | null>(null)
  const pendingSkillFocusRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      editorPreviewRequestSequenceRef.current += 1
      diffRequestSequenceRef.current += 1
      scheduledRefreshTargetRef.current = null
      runningRefreshTargetRef.current = null
    },
    [],
  )
  const listedRotationEntries = useMemo(
    () =>
      rotationEntries
        .filter(
          entry =>
            (devMode || !entry.test) && (!entry.isDefault || rotationAvailableForWeapons(entry, settings.weapons)),
        )
        .sort((left, right) => Number(left.isDefault === true) - Number(right.isDefault === true)),
    [devMode, rotationEntries, settings.weapons],
  )
  const compatibleRotationEntries = useMemo(
    () => listedRotationEntries.filter(entry => rotationAvailableForWeapons(entry, settings.weapons)),
    [listedRotationEntries, settings.weapons],
  )
  const editingEntry =
    listedRotationEntries.find(entry => entry.id === editingRotationId) ?? compatibleRotationEntries[0]
  const activeRotationId =
    compatibleRotationEntries.find(entry => entry.id === selectedRotationId)?.id ??
    compatibleRotationEntries.find(entry => entry.id === defaultRotationId)?.id ??
    compatibleRotationEntries[0]?.id
  const resolvedActiveRotationIdRef = useRef(activeRotationId)
  useEffect(() => {
    resolvedActiveRotationIdRef.current = activeRotationId
  }, [activeRotationId])
  const rotationLocked = editingEntry?.isDefault === true
  const editingRotationDisplayName = (rotationLocked ? gameText(rotation.name) : rotation.name) || "Unnamed Rotation"
  const currentGlobalDebuffs = loadGlobalDebuffs()
  const { food: currentFood, script: currentScript, divinecraft: currentDivinecraft } = setupSelections
  const calculationContextKey = useMemo(
    () =>
      calculationFingerprint({
        characterStats: rawCharacterStats,
        attunementStats,
        settings,
        enemy,
        innerWayConditions: [...innerWayConditions],
        innerWayEffectRules,
        innerWayRevision: _innerWayRevision,
        gearStatEffect,
        buildSetup,
        food: currentFood,
        script: currentScript,
        divinecraft: currentDivinecraft,
        globalDebuffs: currentGlobalDebuffs,
        skillOverrides,
      }),
    [
      rawCharacterStats,
      attunementStats,
      settings,
      enemy,
      innerWayConditions,
      innerWayEffectRules,
      _innerWayRevision,
      gearStatEffect,
      buildSetup,
      currentFood,
      currentScript,
      currentDivinecraft,
      currentGlobalDebuffs,
      skillOverrides,
    ],
  )
  const calculationContextKeyRef = useRef(calculationContextKey)
  useEffect(() => {
    calculationContextKeyRef.current = calculationContextKey
  }, [calculationContextKey])
  useEffect(() => {
    rotationResultsRef.current = rotationResults
  }, [rotationResults])

  function persistRotationEntries(entries: RotationEntry[]) {
    setPersistentItem(rotationListStorageKey, serializeRotationEntries(entries))
  }

  useEffect(() => {
    if (activeRotationId && selectedRotationId !== activeRotationId) onActiveRotationChange(activeRotationId)
  }, [activeRotationId, onActiveRotationChange, selectedRotationId])

  const expansionAnchor = `${editingRotationId}:${startAnchor.rowId}:${startAnchor.actionIndex ?? "start"}`
  const [previousExpansionAnchor, setPreviousExpansionAnchor] = useState<string>()
  if (previousExpansionAnchor !== expansionAnchor) {
    setPreviousExpansionAnchor(expansionAnchor)
    // Reveal newly selected action anchors without overriding a later manual collapse.
    const anchorKey = `${editingRotationId}:${startAnchor.rowId}`
    if (startAnchor.actionIndex !== undefined && !expandedSkillRows.has(anchorKey)) {
      const nextExpandedSkillRows = new Set(expandedSkillRows)
      nextExpandedSkillRows.add(anchorKey)
      setExpandedSkillRows(nextExpandedSkillRows)
    }
  }

  useEffect(() => {
    const dialog = readableDialogRef.current
    if (!dialog) return
    if (readableDialogOpen && !dialog.open) dialog.showModal()
    else if (!readableDialogOpen && dialog.open) dialog.close()
  }, [readableDialogOpen])

  useEffect(() => {
    if (editingName) rotationNameInputRef.current?.focus()
  }, [editingName])

  function createEditorSkillStep(skillId: string): RotationStep {
    const skill = calculationDefinitions.skills[skillId]
    const maximum = durationInputMaximum(skill)
    return {
      type: "skill",
      skill: skillId,
      ...(durationInputRequired(skill) ? { duration: maximum ?? baseSkillCastTime(skill) } : {}),
    }
  }

  function updateStep(index: number, changes: Record<string, unknown>) {
    if (rotationLocked) return
    const step = rotation.steps[index]
    if (!step || isAutomaticDelay(step)) return
    const replacement = { ...step, ...changes } as RotationStep
    editorStepReplacements.set(step, replacement)
    setRotation({
      ...rotation,
      steps: rotation.steps.map((candidate, stepIndex) => (stepIndex === index ? replacement : candidate)),
    })
  }
  function updateRotationCalculationSetting(value: SetStateAction<RotationRecord>) {
    scheduledRefreshTargetRef.current = null
    setRotation(value)
  }
  function selectRotationItem(index: number, value: string, control: HTMLSelectElement) {
    if (rotationLocked) return
    if (isAutomaticDelay(rotation.steps[index])) return
    if (
      [
        "__event:Move",
        "__event:SelfHP",
        "__event:HP",
        "__event:Qi",
        "__event:Buff",
        "__event:Debuff",
        "__event:MartialArt",
      ].includes(value)
    ) {
      const scrollContainer = rotationScrollRef.current
      const row = control.closest<HTMLElement>("[data-rotation-step-index]")
      if (scrollContainer && row)
        pendingEventScrollRef.current = {
          stepIndex: index,
          top: row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
        }
    }
    const rowId = `rotation-${index}`
    setEventDistanceDrafts(current => {
      if (!(rowId in current)) return current
      const next = { ...current }
      delete next[rowId]
      return next
    })
    const previousSkills = timeline.filter(
      row => row.kind === "rotation" && (row.rotationIndex ?? -1) < index && row.step.type === "skill",
    )
    const previousSkill = previousSkills[previousSkills.length - 1]
    const current = rotation
    const nextRotation = (() => {
      const requiresFollowingAnchor = [
        "__event:Move",
        "__event:SelfHP",
        "__event:HP",
        "__event:Qi",
        "__event:Buff",
        "__event:Debuff",
        "__event:MartialArt",
      ]
      if (
        requiresFollowingAnchor.includes(value) &&
        current.steps[index]?.type === "skill" &&
        current.steps.filter(step => step.type === "skill").length <= 1
      )
        return current
      let steps = current.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step
        switch (value) {
          case "__event:Hellfire":
            return {
              type: "event",
              event: "Hellfire",
              startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
              amount: 0,
            }
          case "__event:Delay":
            return { type: "event", event: "Delay", duration: 1 }
          case "__event:Controlled":
            return {
              type: "event",
              event: "Controlled",
              startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
              duration: eventDefaultDuration("Controlled"),
            }
          case "__event:ShieldBroken":
            return {
              type: "event",
              event: "ShieldBroken",
              startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
            }
          case "__event:BattleEnd":
            return {
              type: "event",
              event: "BattleEnd",
              startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
            }
          case "__event:Move":
            return { type: "event", event: "Move", before: { action: "start" }, distance: 1 }
          case "__event:SelfHP":
            return {
              type: "event",
              event: "SelfHP",
              before: { action: "start" },
              currentHP: displayedCharacterStats.maxHp,
            }
          case "__event:TakeDamage":
            return {
              type: "event",
              event: "TakeDamage",
              startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
              damage: 0,
            }
          case "__event:HP":
            return { type: "event", event: "HP", before: { action: "start" }, targetHPRatio: 1 }
          case "__event:Qi":
            return { type: "event", event: "Qi", before: { action: "start" }, targetQiRatio: 1 }
          case "__event:Buff":
            return {
              type: "event",
              event: "Buff",
              before: { action: "start" },
              buff: Object.keys(manualBuffDefinitions)[0],
              stack: 1,
            }
          case "__event:Debuff":
            return {
              type: "event",
              event: "Debuff",
              before: { action: "start" },
              debuff: Object.keys(manualDebuffDefinitions)[0],
              stack: 1,
            }
          case "__event:MartialArt":
            return { type: "event", event: "MartialArt", before: { action: "start" }, martialArt: settings.weapons[0] }
          default:
            return createEditorSkillStep(value)
        }
      }) as RotationStep[]
      const hasOrderedStep = steps.some(
        step => step.type === "skill" || (step.type === "event" && step.event === "Delay"),
      )
      const hasBattleEnd = steps.some(step => step.type === "event" && step.event === "BattleEnd")
      if (
        current.steps[index]?.type === "skill" &&
        current.steps.filter(step => step.type === "skill").length <= 1 &&
        !hasOrderedStep &&
        !hasBattleEnd
      )
        return current
      const attached = [
        "__event:Move",
        "__event:SelfHP",
        "__event:HP",
        "__event:Qi",
        "__event:Buff",
        "__event:Debuff",
        "__event:MartialArt",
      ].includes(value)
      if (attached && !steps.slice(index + 1).some(step => step.type === "skill"))
        steps.push(createEditorSkillStep(rotationSkillIds[0]))
      const start = normalizeStartAction(normalizeRotationStart(current.start, steps), steps)
      return { ...current, steps, ...(start ? { start } : current.start ? { start: undefined } : {}) }
    })()
    if (nextRotation !== current) {
      editorStepReplacements.set(current.steps[index], nextRotation.steps[index])
      if (
        current.start &&
        (nextRotation.start?.step !== current.start.step || nextRotation.start?.action !== current.start.action)
      )
        setStartAnchor(
          nextRotation.start
            ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action }
            : { rowId: "rotation-0" },
        )
      setRotation(nextRotation)
    }
  }
  function commitEventTime(rowId: string, stepIndex: number) {
    const draft = eventTimeDrafts[rowId]
    if (draft === undefined) return
    const step = rotation.steps[stepIndex]
    const time = Number(draft)
    if (supportsEventStartTime(step) && Number.isFinite(time)) updateStep(stepIndex, { startTime: time })
    setEventTimeDrafts(current => {
      const next = { ...current }
      delete next[rowId]
      return next
    })
  }
  function commitEventDuration(rowId: string, stepIndex: number) {
    const draft = eventDurationDrafts[rowId]
    if (draft === undefined) return
    const duration = Number(draft)
    const step = rotation.steps[stepIndex]
    const maximum =
      step?.type === "skill" ? durationInputMaximum(calculationDefinitions.skills[step.skill ?? ""]) : undefined
    if (Number.isFinite(duration))
      updateStep(stepIndex, { duration: Math.max(0, maximum === undefined ? duration : Math.min(duration, maximum)) })
    setEventDurationDrafts(current => {
      const next = { ...current }
      delete next[rowId]
      return next
    })
  }
  function commitEventDistance(rowId: string, stepIndex: number) {
    const draft = eventDistanceDrafts[rowId]
    if (draft === undefined) return
    const distance = Number(draft)
    if (Number.isFinite(distance)) updateStep(stepIndex, { distance: Math.max(0, Math.floor(distance)) })
    setEventDistanceDrafts(current => {
      const next = { ...current }
      delete next[rowId]
      return next
    })
  }
  function commitEventHP(rowId: string, stepIndex: number) {
    const draft = eventHPDrafts[rowId]
    if (draft === undefined) return
    const value = Number(draft)
    const step = rotation.steps[stepIndex]
    if (Number.isFinite(value) && step?.type === "event") {
      switch (step.event) {
        case "Hellfire":
          updateStep(stepIndex, { amount: value })
          break
        case "SelfHP":
          updateStep(stepIndex, {
            currentHP: (Math.min(100, Math.max(0, value)) / 100) * displayedCharacterStats.maxHp,
            currentHPRatio: undefined,
          })
          break
        case "TakeDamage":
          updateStep(stepIndex, { damage: Math.max(0, value) })
          break
        case "HP":
          updateStep(stepIndex, { targetHPRatio: Math.min(1, Math.max(0, value / 100)) })
          break
        case "Qi":
          updateStep(stepIndex, { targetQiRatio: Math.min(1, Math.max(0, value / 100)) })
          break
      }
    }
    setEventHPDrafts(current => {
      const next = { ...current }
      delete next[rowId]
      return next
    })
  }
  function availableAttachmentTargetsForEvent(step: RotationStep): RotationAttachmentTarget[] {
    if (step.type !== "event") return []
    if (step.event === "MartialArt") return attachmentTargets.filter(target => target.target.action === "start")
    return attachmentTargets
  }
  function attachmentTargetIndexForEvent(
    stepIndex: number,
    eventRow: TimelineRow | undefined,
    availableTargets: RotationAttachmentTarget[],
  ) {
    return resolveAttachmentTargetIndex(rotation.steps, stepIndex, availableTargets, eventRow?.startTime)
  }
  function moveAttachedEvent(stepIndex: number, direction: -1 | 1, control: HTMLButtonElement) {
    if (rotationLocked) return
    const eventStep = rotation.steps[stepIndex]
    if (eventStep?.type !== "event" || eventStep.event === "Delay") return
    const eventAfterAction = attachedEventPhase(eventStep) === "after"
    const availableTargets = availableAttachmentTargetsForEvent(eventStep)
    const eventRow = timeline.find(row => row.rotationIndex === stepIndex)
    const fixedTime = isFixedTimeEvent(eventStep)
    if (!fixedTime) {
      const reordered = reorderAttachedEventWithinTarget(rotation.steps, stepIndex, direction)
      if (reordered) {
        const scrollContainer = rotationScrollRef.current
        const eventElement = control.closest<HTMLElement>("[data-rotation-step-index]")
        if (scrollContainer && eventElement)
          pendingEventScrollRef.current = {
            stepIndex: reordered.movedIndex,
            top: eventElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
          }
        const startStep = rotation.start ? rotation.steps[rotation.start.step] : undefined
        const nextStartStep = startStep ? reordered.steps.indexOf(startStep) : -1
        setRotation({
          ...rotation,
          steps: reordered.steps,
          ...(rotation.start && nextStartStep >= 0 ? { start: { ...rotation.start, step: nextStartStep } } : {}),
        })
        if (nextStartStep >= 0 && rotation.start)
          setStartAnchor({ rowId: `rotation-${nextStartStep}`, actionIndex: rotation.start.action })
        return
      }
    }
    const fixedStartTime =
      isFixedTimeEvent(eventStep) && "startTime" in eventStep && typeof eventStep.startTime === "number"
        ? eventStep.startTime
        : undefined
    const eventFallbackTime =
      fixedStartTime === undefined
        ? eventRow?.startTime
        : rotation.eventTimeReference === "battleStart"
          ? anchorTime + fixedStartTime
          : fixedStartTime
    const currentTargetIndex = resolveAttachmentTargetIndex(
      rotation.steps,
      stepIndex,
      availableTargets,
      eventFallbackTime,
    )
    const nextTarget = availableTargets[currentTargetIndex + direction]
    if (!nextTarget) return
    const currentTarget = availableTargets[currentTargetIndex]
    const currentTargetStep = currentTarget ? rotation.steps[currentTarget.sourceStepIndex] : undefined
    const currentTargetRow = currentTarget
      ? timeline.find(row => row.rotationIndex === currentTarget.sourceStepIndex)
      : undefined
    const targetStep = rotation.steps[nextTarget.sourceStepIndex]
    const moved = moveEventToAttachmentTarget(
      rotation.steps,
      stepIndex,
      nextTarget,
      eventAfterAction ? "after" : "before",
    )
    if (!moved) return
    const startStep = rotation.start ? rotation.steps[rotation.start.step] : undefined
    const nextStartStep =
      rotation.start?.step === stepIndex ? moved.movedIndex : startStep ? moved.steps.indexOf(startStep) : -1
    const movedEvent = moved.steps[moved.movedIndex]
    editorStepReplacements.set(eventStep, movedEvent)
    const scrollContainer = rotationScrollRef.current
    const eventElement = control.closest<HTMLElement>("[data-rotation-step-index]")
    if (scrollContainer && eventElement)
      pendingEventScrollRef.current = {
        stepIndex: moved.movedIndex,
        top: eventElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
      }
    setRotation({
      ...rotation,
      steps: moved.steps,
      ...(rotation.start && nextStartStep >= 0 ? { start: { ...rotation.start, step: nextStartStep } } : {}),
    })
    if (nextStartStep >= 0 && rotation.start)
      setStartAnchor({ rowId: `rotation-${nextStartStep}`, actionIndex: rotation.start.action })
    const movedTargetIndex = moved.steps.indexOf(targetStep)
    const previousTargetIndex = currentTargetStep ? moved.steps.indexOf(currentTargetStep) : -1
    setExpandedSkillRows(current => {
      const next = new Set(current)
      if (currentTargetStep !== targetStep) {
        if (currentTargetRow) next.delete(`${editingRotationId}:${currentTargetRow.id}`)
        if (previousTargetIndex >= 0) next.delete(`${editingRotationId}:rotation-${previousTargetIndex}`)
      }
      if (targetStep?.type === "skill" && nextTarget.target.action !== "start")
        next.add(`${editingRotationId}:rotation-${movedTargetIndex}`)
      return next
    })
  }
  function addStepBelow(index: number) {
    if (rotationLocked) return
    pendingSkillFocusRef.current = index + 1
    setRotation(current => ({
      ...current,
      steps: [
        ...current.steps.slice(0, index + 1),
        createEditorSkillStep(rotationSkillIds[0]),
        ...current.steps.slice(index + 1),
      ],
    }))
  }
  function moveStep(index: number, direction: number) {
    if (rotationLocked) return
    const current = rotation
    if (isAutomaticDelay(current.steps[index])) return
    const movable = (step: RotationStep | undefined) =>
      step?.type === "skill" || (step?.type === "event" && step.event === "Delay" && !isAutomaticDelay(step))
    if (!movable(current.steps[index])) return
    const attached = (step: RotationStep | undefined) => isRuntimeAttachedEvent(step)
    let blockStart = index
    if (current.steps[index]?.type === "skill")
      while (blockStart > 0 && attached(current.steps[blockStart - 1])) blockStart -= 1
    const currentBlock = current.steps.slice(blockStart, index + 1)
    let steps: RotationStep[] | undefined
    if (direction < 0) {
      let previousSkill = blockStart - 1
      while (previousSkill >= 0 && !movable(current.steps[previousSkill])) previousSkill -= 1
      if (previousSkill >= 0) {
        let previousStart = previousSkill
        if (current.steps[previousSkill]?.type === "skill")
          while (previousStart > 0 && attached(current.steps[previousStart - 1])) previousStart -= 1
        steps = [
          ...current.steps.slice(0, previousStart),
          ...currentBlock,
          ...current.steps.slice(previousStart, blockStart),
          ...current.steps.slice(index + 1),
        ]
      }
    } else {
      let nextSkill = index + 1
      while (nextSkill < current.steps.length && !movable(current.steps[nextSkill])) nextSkill += 1
      if (nextSkill < current.steps.length)
        steps = [
          ...current.steps.slice(0, blockStart),
          ...current.steps.slice(index + 1, nextSkill + 1),
          ...currentBlock,
          ...current.steps.slice(nextSkill + 1),
        ]
    }
    if (!steps) return
    const startStep = current.start ? current.steps[current.start.step] : undefined
    const nextStartStep = startStep ? steps.indexOf(startStep) : -1
    setRotation({
      ...current,
      steps,
      ...(current.start && nextStartStep >= 0 ? { start: { ...current.start, step: nextStartStep } } : {}),
    })
    if (nextStartStep >= 0 && current.start)
      setStartAnchor({ rowId: `rotation-${nextStartStep}`, actionIndex: current.start.action })
  }
  function removeStep(index: number) {
    if (rotationLocked) return
    const step = rotation.steps[index]
    if (!step || isAutomaticDelay(step)) return
    let start = index
    if (step.type === "skill") {
      if (rotation.steps.filter(candidate => candidate.type === "skill").length <= 1) return
      while (start > 0 && isRuntimeAttachedEvent(rotation.steps[start - 1])) start -= 1
    }
    const steps = rotation.steps.filter((_, stepIndex) => stepIndex < start || stepIndex > index)
    const previousStart = rotation.start ? rotation.steps[rotation.start.step] : undefined
    let nextStartStep =
      previousStart && rotation.start && canUseRotationStartAt(rotation.steps, rotation.start.step)
        ? steps.indexOf(previousStart)
        : -1
    const startSurvived = nextStartStep >= 0
    if (nextStartStep < 0 && rotation.start) {
      const nextOriginal = rotation.steps.findIndex(
        (candidate, originalIndex) =>
          originalIndex > index && steps.includes(candidate) && canUseRotationStartAt(rotation.steps, originalIndex),
      )
      const previousOriginal = rotation.steps.findIndex(
        (candidate, originalIndex) =>
          originalIndex < start && steps.includes(candidate) && canUseRotationStartAt(rotation.steps, originalIndex),
      )
      const replacement = nextOriginal >= 0 ? nextOriginal : previousOriginal
      if (replacement >= 0) nextStartStep = steps.indexOf(rotation.steps[replacement])
    }
    const nextStart =
      rotation.start && nextStartStep >= 0
        ? {
            step: nextStartStep,
            ...(startSurvived && previousStart?.type === "skill" && rotation.start.action !== undefined
              ? { action: rotation.start.action }
              : {}),
          }
        : undefined
    const scrollContainer = rotationScrollRef.current
    pendingEventScrollRef.current = null
    pendingSkillFocusRef.current = null
    if (scrollContainer) {
      const rows = [...scrollContainer.querySelectorAll<HTMLElement>(".rotation-table-row[data-rotation-step-index]")]
      const deletedPosition = rows.findIndex(row => Number(row.dataset.rotationStepIndex) === index)
      const surviving = (row: HTMLElement) => steps.includes(rotation.steps[Number(row.dataset.rotationStepIndex)])
      const anchor =
        rows.slice(0, deletedPosition).reverse().find(surviving) ?? rows.slice(deletedPosition + 1).find(surviving)
      if (anchor) {
        const anchorStep = rotation.steps[Number(anchor.dataset.rotationStepIndex)]
        pendingEventScrollRef.current = {
          stepIndex: steps.indexOf(anchorStep),
          step: anchorStep,
          rotationId: editingRotationId,
          top: anchor.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
        }
      }
    }
    if (rotation.start && (nextStart?.step !== rotation.start.step || nextStart?.action !== rotation.start.action))
      setStartAnchor(
        nextStart ? { rowId: `rotation-${nextStart.step}`, actionIndex: nextStart.action } : { rowId: "rotation-0" },
      )
    setRotation({ ...rotation, steps, ...(rotation.start ? { start: nextStart } : {}) })
  }
  function selectStart(step: number, action?: number) {
    if (rotationLocked) return
    const target = rotation.steps[step]
    if (
      !canUseRotationStartAt(rotation.steps, step) ||
      (action !== undefined && !canUseRotationStartAction(target, action))
    )
      return
    setStartAnchor({ rowId: `rotation-${step}`, actionIndex: action })
    setRotation(current => ({ ...current, start: { step, ...(action === undefined ? {} : { action }) } }))
  }
  function save() {
    if (rotationLocked) return
    if (!rotation.name.trim()) {
      setError(t("ui.app.rotationNameRequired"))
      setStatus("")
      return
    }
    const normalized = migrateRotation(rotation)
    const nextEntries = rotationEntries.map(entry =>
      entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: normalized } : entry,
    )
    setRotationEntries(nextEntries)
    setRotation(normalized)
    savedRotationSnapshotsRef.current?.set(editingRotationId, JSON.parse(JSON.stringify(normalized)) as RotationRecord)
    persistRotationEntries(nextEntries)
    setError("")
    setStatus(t("ui.app.savedForThisSession"))
    if (editingRotationId === activeRotationId && editorTimelineReady)
      void calculateDiffsForRotation(editingRotationId, normalized)
  }
  function resetRotation() {
    if (rotationLocked) return
    const saved = savedRotationSnapshotsRef.current?.get(editingRotationId)
    if (!saved) return
    const restored = JSON.parse(JSON.stringify(saved)) as RotationRecord
    setRotation(restored)
    setStartAnchor(
      restored.start
        ? { rowId: `rotation-${restored.start.step}`, actionIndex: restored.start.action }
        : { rowId: "rotation-0" },
    )
    setEventTimeDrafts({})
    setEventDurationDrafts({})
    setEventDistanceDrafts({})
    setEventHPDrafts({})
    setEditingName(false)
    setStatus("")
    setError("")
  }
  function activateRotation(id: string) {
    if (id === activeRotationId) return
    const current = migrateRotation(rotation)
    const nextEntries = rotationEntries.map(entry =>
      entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: current } : entry,
    )
    const nextEntry = nextEntries.find(entry => entry.id === id)
    if (!nextEntry) return
    const nextRotation = rotationRecordForEntry(nextEntry)
    setRotationEntries(nextEntries)
    onActiveRotationChange(id)
    setEditingRotationId(id)
    setRotation(JSON.parse(JSON.stringify(nextRotation)) as RotationRecord)
    setStartAnchor(
      nextRotation.start
        ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action }
        : { rowId: "rotation-0" },
    )
    setEventTimeDrafts({})
    persistRotationEntries(nextEntries)
  }
  function editRotation(id: string) {
    if (id === editingRotationId) return
    const current = migrateRotation(rotation)
    const nextEntries = rotationEntries.map(entry =>
      entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: current } : entry,
    )
    const nextEntry = nextEntries.find(entry => entry.id === id)
    if (!nextEntry) return
    const nextRotation = rotationRecordForEntry(nextEntry)
    setRotationEntries(nextEntries)
    setEditingRotationId(id)
    setRotation(JSON.parse(JSON.stringify(nextRotation)) as RotationRecord)
    setStartAnchor(
      nextRotation.start
        ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action }
        : { rowId: "rotation-0" },
    )
    setEventTimeDrafts({})
    persistRotationEntries(nextEntries)
  }
  function selectRotation(entry: RotationEntry) {
    if (!rotationAvailableForWeapons(entry, settings.weapons)) {
      const entryMartialArts = [...new Set(entry.martialArts)]
      if (entryMartialArts.length !== 2) return
      persistRotationEntries(currentRotationEntries())
      onSelectRotationWeapons([entryMartialArts[0], entryMartialArts[1]], entry.id)
      return
    }
    editRotation(entry.id)
  }
  function addRotation() {
    const current = migrateRotation(rotation)
    const id = createRotationId()
    const nextRotation: RotationRecord = {
      name: t("ui.app.newRotation"),
      steps: [createEditorSkillStep(rotationSkillIds[0])],
      groupSize: 1,
      enemyCount: 1,
      eventTimeReference: "battleStart",
    }
    const nextEntries = [
      ...rotationEntries.map(entry =>
        entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: current } : entry,
      ),
      { id, rotation: nextRotation, martialArts: [...new Set(settings.weapons)] },
    ]
    setRotationEntries(nextEntries)
    setEditingRotationId(id)
    setRotation(nextRotation)
    savedRotationSnapshotsRef.current?.set(id, JSON.parse(JSON.stringify(nextRotation)) as RotationRecord)
    setStartAnchor({ rowId: "rotation-0" })
    setEventTimeDrafts({})
    persistRotationEntries(nextEntries)
  }
  function duplicateRotation() {
    const id = createRotationId()
    const source = migrateRotation(rotation)
    const duplicate: RotationRecord = JSON.parse(
      JSON.stringify({ ...source, name: `${source.name || "Rotation"} Copy` }),
    ) as RotationRecord
    const sourceEntry = rotationEntries.find(entry => entry.id === editingRotationId)
    const nextEntries = [
      ...rotationEntries,
      { id, rotation: duplicate, martialArts: [...(sourceEntry?.martialArts ?? new Set(settings.weapons))] },
    ]
    setRotationEntries(nextEntries)
    setEditingRotationId(id)
    setRotation(duplicate)
    savedRotationSnapshotsRef.current?.set(id, JSON.parse(JSON.stringify(duplicate)) as RotationRecord)
    setStartAnchor(
      duplicate.start
        ? { rowId: `rotation-${duplicate.start.step}`, actionIndex: duplicate.start.action }
        : { rowId: "rotation-0" },
    )
    setEventTimeDrafts({})
    setEventDurationDrafts({})
    setEditingName(false)
    setStatus("")
    setError("")
    persistRotationEntries(nextEntries)
  }
  function removeRotation(id: string) {
    const entry = rotationEntries.find(candidate => candidate.id === id)
    if (
      !entry ||
      entry.isDefault ||
      !window.confirm(t("ui.app.deleteNamedRotationConfirmation", { name: rotationEntryDisplayName(entry) }))
    )
      return
    if (listedRotationEntries.length <= 1) return
    const nextEntries = rotationEntries.filter(entry => entry.id !== id)
    savedRotationSnapshotsRef.current?.delete(id)
    if (id !== editingRotationId && id !== activeRotationId) {
      setRotationEntries(nextEntries)
      persistRotationEntries(nextEntries)
      return
    }
    const nextVisibleEntries = nextEntries.filter(entry => rotationAvailableForWeapons(entry, settings.weapons))
    const nextActive =
      nextVisibleEntries[Math.max(0, listedRotationEntries.findIndex(entry => entry.id === id) - 1)] ??
      nextVisibleEntries[0]
    if (!nextActive) return
    setRotationEntries(nextEntries)
    if (id === activeRotationId) {
      onActiveRotationChange(nextActive.id)
    }
    if (id === editingRotationId) {
      setEditingRotationId(nextActive.id)
      setRotation(JSON.parse(JSON.stringify(nextActive.rotation)) as RotationRecord)
      setStartAnchor(
        nextActive.rotation.start
          ? { rowId: `rotation-${nextActive.rotation.start.step}`, actionIndex: nextActive.rotation.start.action }
          : { rowId: "rotation-0" },
      )
    }
    setEventTimeDrafts({})
    persistRotationEntries(nextEntries)
  }

  function currentRotationEntries() {
    const current = migrateRotation(rotation)
    return rotationEntries.map(entry =>
      entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: current } : entry,
    )
  }

  function exportRotations() {
    const entries = currentRotationEntries()
    const exportedCount = entries.filter(entry => !entry.isDefault).length
    const blob = new Blob([exportRotationEntries(entries)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `where-builds-meet-rotations-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    publishNotice({ id: "rotation-transfer", message: t("ui.app.rotationsExported", { count: exportedCount }) })
  }

  async function importRotations(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    try {
      const result = mergeImportedRotationEntries(currentRotationEntries(), JSON.parse(await file.text()) as unknown)
      const migratedEntries = result.entries.map(entry =>
        result.importedIds.includes(entry.id) ? { ...entry, rotation: migrateRotation(entry.rotation) } : entry,
      )
      result.importedIds.forEach(id => {
        const imported = migratedEntries.find(entry => entry.id === id)
        if (imported)
          savedRotationSnapshotsRef.current?.set(id, JSON.parse(JSON.stringify(imported.rotation)) as RotationRecord)
      })
      setRotationEntries(migratedEntries)
      persistRotationEntries(migratedEntries)
      const importedEntry = migratedEntries.find(entry => entry.id === result.importedIds[0])
      if (importedEntry) {
        setEditingRotationId(importedEntry.id)
        setRotation(JSON.parse(JSON.stringify(importedEntry.rotation)) as RotationRecord)
        setStartAnchor(
          importedEntry.rotation.start
            ? {
                rowId: `rotation-${importedEntry.rotation.start.step}`,
                actionIndex: importedEntry.rotation.start.action,
              }
            : { rowId: "rotation-0" },
        )
        setEventTimeDrafts({})
        setEventDurationDrafts({})
        setEditingName(false)
        setStatus("")
        setError("")
      }
      publishNotice({
        id: "rotation-transfer",
        message: t("ui.app.rotationsImported", { count: result.importedCount }),
      })
    } catch (error) {
      publishNotice({
        id: "rotation-transfer",
        message: error instanceof Error ? error.message : t("ui.app.rotationImportError"),
        error: true,
      })
    }
  }

  const currentCachedResult = rotationResults[editingRotationId]?.result
  const editorRevision: EditorRevision = { id: editingRotationId, context: calculationContextKey, rotation }

  const [editorTimelineState, setEditorTimelineState] = useState<EditorTimelineResult & { revision: EditorRevision }>()
  const editorTimelineReady = Boolean(
    editorTimelineState && sameEditorRevision(editorTimelineState.revision, editorRevision),
  )
  const {
    timeline,
    anchorTime,
    damageRowsByOwner,
    attachmentTargets,
    displayEntries,
    readableRotation,
    displayedCalculation,
  } = useRotationTimelineDisplay({
    rotation,
    calculationDefinitions,
    editingRotationId,
    editorTimelineReady,
    editorTimelineState,
    rotationResults,
    editorStepReplacements,
    startAnchor,
    expandedSkillRows,
    readableDialogOpen,
  })
  const rotationSkillCount = useMemo(
    () => rotation.steps.filter(step => step.type === "skill").length,
    [rotation.steps],
  )
  const workerActionBreakdowns = displayedCalculation?.actionBreakdowns ?? {}
  const displayTime = (time: number) => time - anchorTime
  const calculateTimelineActionBreakdown = (row: TimelineRow, actionIndex: number): RotationActionBreakdown =>
    workerActionBreakdowns[`${row.id}:${actionIndex}`] ?? {
      physical: 0,
      bellstrike: 0,
      stonesplit: 0,
      silkbind: 0,
      bamboocut: 0,
      total: 0,
    }
  const skillExpansionKey = (rowId: string) => `${editingRotationId}:${rowId}`
  const skillActionsExpanded = (rowId: string) => expandedSkillRows.has(skillExpansionKey(rowId))
  const toggleSkillActions = (rowId: string) =>
    setExpandedSkillRows(current => {
      const next = new Set(current)
      const key = skillExpansionKey(rowId)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const showDistanceColumn = useMemo(
    () =>
      rotation.steps.some(
        step =>
          (step.type === "event" && step.event === "Move") ||
          (step.type === "skill" && calculationDefinitions.skills[step.skill ?? ""]?.tags?.includes("Distance")),
      ),
    [calculationDefinitions, rotation.steps],
  )
  const practiceTarget = resolveTargetType(rotation)
  // A target whose declared attack pattern deals Self HP damage, so that target needs
  // the column. Reading the pattern keeps this a property of `data/boss.json` instead of
  // a target-ID special case, and it resolves without touching the timeline.
  const showSelfHPColumn = useMemo(
    () =>
      bossDefinitionFor(practiceTarget).attackPattern.length > 0 ||
      rotation.steps.some(
        step =>
          (step.type === "event" && (step.event === "SelfHP" || step.event === "TakeDamage")) ||
          (step.type === "skill" && calculationDefinitions.skills[step.skill ?? ""]?.tags?.includes("HP")),
      ),
    [calculationDefinitions, practiceTarget, rotation.steps],
  )
  const showTargetHPColumn = useMemo(
    () => rotation.targetHP !== undefined || rotation.steps.some(step => step.type === "event" && step.event === "HP"),
    [rotation.steps, rotation.targetHP],
  )
  const showQiColumn = useMemo(
    () => rotation.steps.some(step => step.type === "event" && step.event === "Qi"),
    [rotation.steps],
  )
  const showHellfireColumn =
    settings.weapons.includes("infernalTwinblades") ||
    rotation.steps.some(step => step.type === "event" && step.event === "Hellfire")
  const showHeavensWillColumn = settings.weapons.includes("heavenwill") && settings.weapons.includes("skygrasp")
  const showVitalityColumn = useMemo(
    () =>
      rotation.steps.some(step => {
        if (step.type !== "skill") return false
        const skill = calculationDefinitions.skills[step.skill ?? ""]
        return skill?.tags?.includes("Mystic") === true && skill.tags.includes("Triggered") === false
      }),
    [calculationDefinitions, rotation.steps],
  )
  const stateColumns = useMemo(
    () =>
      [
        showDistanceColumn ? "minmax(0, 0.7fr)" : "",
        showSelfHPColumn ? "minmax(0, 0.65fr)" : "",
        showTargetHPColumn ? "minmax(0, 0.65fr)" : "",
        showQiColumn ? "minmax(0, 0.65fr)" : "",
        showHellfireColumn ? "minmax(0, 0.7fr)" : "",
        showHeavensWillColumn ? "minmax(0, 0.9fr)" : "",
        showVitalityColumn ? "minmax(0, 0.7fr)" : "",
      ]
        .filter(Boolean)
        .join(" "),
    [
      showDistanceColumn,
      showSelfHPColumn,
      showTargetHPColumn,
      showQiColumn,
      showHellfireColumn,
      showHeavensWillColumn,
      showVitalityColumn,
    ],
  )
  const rotationTableStyle = useMemo(
    () => ({ "--rotation-state-columns": stateColumns }) as CSSProperties,
    [stateColumns],
  )
  // Only the rows near the viewport are rendered, and only once every row has been
  // measured; see useVirtualRowWindow. The rest are represented by padding on the list,
  // which keeps every row's scroll position and the total height intact.
  const displayEntryKeys = useMemo(() => displayEntries.map(displayEntryKey), [displayEntries])
  const rowWindow = useVirtualRowWindow({
    keys: displayEntryKeys,
    containerRef: rotationScrollRef,
    listRef: rotationStepListRef,
    layoutKey: stateColumns,
  })
  const { start: windowStart, end: windowEnd, scrollToKey: scrollToRow } = rowWindow
  const visibleEntries = useMemo(
    () => displayEntries.slice(windowStart, windowEnd),
    [displayEntries, windowStart, windowEnd],
  )
  const stepListStyle = useMemo(
    () => ({ paddingBlockStart: rowWindow.paddingTop, paddingBlockEnd: rowWindow.paddingBottom }),
    [rowWindow.paddingTop, rowWindow.paddingBottom],
  )
  // Scroll targets are recorded as authored step indexes, so resolve them to display keys.
  const displayKeyByStepIndex = useMemo(() => {
    const byStepIndex = new Map<number, string>()
    for (const [index, entry] of displayEntries.entries()) {
      const stepIndex = entry.row.rotationIndex
      if (stepIndex === undefined || byStepIndex.has(stepIndex)) continue
      byStepIndex.set(stepIndex, displayEntryKeys[index])
    }
    return byStepIndex
  }, [displayEntries, displayEntryKeys])
  useLayoutEffect(() => {
    if (!editorTimelineReady) return
    const scrollContainer = rotationScrollRef.current
    const pendingScroll = pendingEventScrollRef.current
    if (scrollContainer && pendingScroll) {
      let stepIndex = pendingScroll.stepIndex
      if (pendingScroll.step) {
        let step = pendingScroll.step
        while (editorStepReplacements.has(step)) step = editorStepReplacements.get(step)!
        stepIndex = rotation.steps.indexOf(step)
      }
      const sameRotation = pendingScroll.rotationId === undefined || pendingScroll.rotationId === editingRotationId
      const key = sameRotation ? displayKeyByStepIndex.get(stepIndex) : undefined
      // The target row may sit outside the rendered window, so bring it into view first.
      if (key) scrollToRow(key)
      const row = key ? renderedRowFor(scrollContainer, key) : null
      if (row) {
        const currentTop = row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top
        scrollContainer.scrollTop += currentTop - pendingScroll.top
      }
      pendingEventScrollRef.current = null
    }
    const pendingFocus = pendingSkillFocusRef.current
    if (scrollContainer && pendingFocus !== null) {
      const focusKey = displayKeyByStepIndex.get(pendingFocus)
      if (focusKey) scrollToRow(focusKey)
      const select = scrollContainer.querySelector<HTMLSelectElement>(
        `select[data-rotation-step-index="${pendingFocus}"]`,
      )
      if (select) {
        select.focus({ preventScroll: true })
        select.scrollIntoView({ block: "nearest" })
        pendingSkillFocusRef.current = null
      }
    }
  }, [
    timeline,
    editorTimelineReady,
    rotation.steps,
    editorStepReplacements,
    editingRotationId,
    scrollToRow,
    displayKeyByStepIndex,
  ])
  const totalRotationTime = currentCachedResult?.duration ?? 0
  const totalRotationDamage = currentCachedResult?.metrics.totalDamage ?? 0
  const rotationDps = currentCachedResult?.metrics.dps ?? 0
  const totalRotationHealing = currentCachedResult?.metrics.totalHealing ?? 0
  const rotationHps = currentCachedResult?.metrics.hps ?? 0
  const applyPriorityStatLine = (key: keyof CharacterStats, amount: number) => {
    return { ...rawCharacterStats, [key]: rawCharacterStats[key] + amount }
  }
  const priorityLevelData = statRollsForLevel(enemy.level)
  const priorityCharacter = Object.fromEntries(
    Object.entries(priorityLevelData?.affix ?? {}).filter(([key]) =>
      characterStatAvailableForSettings(key as keyof CharacterStats, settings, pathId),
    ),
  ) as Partial<Record<keyof CharacterStats, number>>
  const priorityAttunement = Object.keys(attunementData)
    .filter(key => attunementAvailableForSettings(key, pathId, settings))
    .flatMap(key => {
      const amount = maxGearRoll(key, "attunement", false, enemy.level)
      return typeof amount === "number" ? [[key, amount] as const] : []
    })
  const selectedInnerWays = buildSetup.innerWays.filter(
    row => row.innerWay && innerWayAvailableForPath(row.innerWay, pathId),
  )
  const priorityStats: RotationPriority[] = []
  const priorityAttunementRows: RotationPriority[] = []
  const priorityInnerWays: RotationPriority[] = []
  const setupComparisons: Record<string, RotationPriority[]> = {}
  function openReadableRotation() {
    setReadableCopyStatus("")
    setReadableDialogOpen(true)
  }
  async function copyReadableRotation() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(readableRotation)
      else {
        readableTextRef.current?.focus()
        readableTextRef.current?.select()
        if (!document.execCommand("copy")) throw new Error("Copy is unavailable")
      }
      setReadableCopyStatus(t("ui.app.copied"))
    } catch {
      readableTextRef.current?.focus()
      readableTextRef.current?.select()
      setReadableCopyStatus(t("ui.app.manualCopyInstruction"))
    }
  }
  function makeTimelineInput(
    rotationRecord: RotationRecord,
    conditions = innerWayConditions,
    rules = innerWayEffectRules,
    setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, setupSelections, pathId),
    globalDebuffs = currentGlobalDebuffs,
  ): TimelineBuildInput {
    return {
      rotation: { ...rotationRecord, ping: resolvePing(rotationRecord.ping, settings.ping) },
      skills: calculationDefinitions.skills,
      eventDefinitions: rotationEventDefinitions,
      dots: calculationDefinitions.dots,
      effectDefinitions: calculationDefinitions.effectDefinitions,
      innerWayConditions: [...conditions, ...setupConditionsFor(setupEffects)],
      innerWayRules: rules,
      setupEffects,
      weapons: settings.weapons,
      martialArtState: Object.fromEntries(
        settings.weapons.map(martialArt => [martialArt, { weapon: martialArtDefinitions[martialArt].weapon }]),
      ),
      initialBuffs: globalBuffTimelineEffects(globalDebuffs),
      initialDebuffs: globalDebuffTimelineEffects(globalDebuffs),
      initialResources: { ...typedSystemStats.initialResources, Vitality: displayedCharacterStats.maxVitality },
      resourceRegeneration: { HeavensWill: displayedCharacterStats.heavensWillRegen },
      resourceMaximums: { ...typedSystemStats.resourceMaximums, Vitality: displayedCharacterStats.maxVitality },
      resourceEvents: typedSystemStats.resourceEvents,
      maxHP: displayedCharacterStats.maxHp,
    }
  }
  const calculationBundleFor = useEffectEvent(
    (rotationRecord: RotationRecord, includeDiffs: boolean): RotationSimulationBundle => {
      const rotationAnchor = rotationRecord.start
        ? { rowId: `rotation-${rotationRecord.start.step}`, actionIndex: rotationRecord.start.action }
        : { rowId: "rotation-0" }
      const baselineSetupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, setupSelections, pathId)
      const setComparisonGroups = includeDiffs
        ? Object.fromEntries(
            (
              [
                ["weaponSets", typedWeaponSetDefinitions],
                ["armorSets", typedArmorSetDefinitions],
              ] as const
            ).flatMap(([key, definitions]) =>
              Object.entries(definitions)
                .filter(([, definition]) => setAvailableForSettings(definition, settings, pathId))
                .map(([setName]) => [
                  `${key}:${setName}`,
                  [0, 2, 4]
                    .filter(tier => tier !== buildSetup[key][setName])
                    .map(tier => {
                      const selections = selectSetTier(buildSetup[key], setName, tier as 0 | 2 | 4, definitions)
                      const setupEffects = selectedSetupEffects(
                        settings,
                        gearStatEffect,
                        buildSetup,
                        setupSelections,
                        pathId,
                        { [key]: selections },
                      )
                      const rebuildTimeline = setSelectionChangesTimeline(buildSetup[key], selections, definitions)
                      return Object.assign(
                        { label: String(tier), setupEffects },
                        rebuildTimeline
                          ? {
                              timeline: makeTimelineInput(
                                rotationRecord,
                                innerWayConditions,
                                innerWayEffectRules,
                                setupEffects,
                              ),
                            }
                          : {},
                      )
                    }),
                ]),
            ),
          )
        : {}
      const selectedFood = currentFood
      const selectedScript = currentScript
      const selectedDivinecraft = currentDivinecraft
      return {
        timeline: makeTimelineInput(rotationRecord, innerWayConditions, innerWayEffectRules, baselineSetupEffects),
        startAnchor: rotationAnchor,
        stats: displayedCharacterStats,
        rawStats: talentFormulaStats,
        baseStats: rawCharacterStats,
        attunement: attunementStats,
        enemy,
        weapons: settings.weapons,
        statPriority: includeDiffs
          ? Object.entries(priorityCharacter).map(([key, amount]) => {
              const variantStats = applyPriorityStatLine(key as keyof CharacterStats, Number(amount))
              const definition = allStatDefinitions.find(candidate => candidate.key === key)
              return {
                label: definition?.label ?? key,
                maxRoll: Number(amount) * (definition?.unit === "%" ? 100 : 1),
                stats: variantStats,
              }
            })
          : [],
        attunementPriority: includeDiffs
          ? priorityAttunement.map(([key, amount]) => {
              const variantAttunement = {
                ...attunementStats,
                [key]: attunementStats[key as keyof AttunementStats] + Number(amount),
              }
              return {
                label: attunementData[key]?.name ?? key,
                maxRoll: Number(amount) * (percentageAttunementKeys.has(key as keyof AttunementStats) ? 100 : 1),
                attunement: variantAttunement,
              }
            })
          : [],
        innerWayPriority: includeDiffs
          ? selectedInnerWays.map(selected => {
              const definition = innerWayDefinitions[selected.innerWay as keyof typeof innerWayDefinitions]
              const variantRules = innerWayEffectRules.filter(rule => rule.source !== selected.innerWay)
              const variantConditions = innerWayConditionsFor(buildSetup.innerWays, selected.innerWay, pathId)
              const setupEffects = baselineSetupEffects
              return Object.assign(
                { label: definition?.name ?? selected.innerWay },
                definition?.altersTimeline
                  ? { timeline: makeTimelineInput(rotationRecord, variantConditions, variantRules, setupEffects) }
                  : {},
                {
                  innerWayRules: variantRules,
                  innerWayConditions: [...variantConditions, ...setupConditionsFor(setupEffects)],
                },
              )
            })
          : [],
        setupComparisons: includeDiffs
          ? {
              arsenal: Object.keys(typedArsenalDefinitions)
                .filter(value => value !== buildSetup.arsenal)
                .map(value => ({
                  label: value,
                  setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, setupSelections, pathId, {
                    arsenal: value,
                  }),
                })),
              bowRingSet: Object.keys(typedBowRingSetDefinitions)
                .filter(value => value !== buildSetup.bowRingSet)
                .map(value => ({
                  label: value,
                  setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, setupSelections, pathId, {
                    bowRingSet: value,
                  }),
                })),
              food: Object.keys(typedFoodDefinitions)
                .filter(value => value !== selectedFood)
                .map(value => ({
                  label: value,
                  setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, setupSelections, pathId, {
                    food: value,
                  }),
                })),
              script: Object.entries(typedScriptDefinitions)
                .filter(([value]) => value !== selectedScript)
                .map(([value]) => {
                  const setupEffects = selectedSetupEffects(
                    settings,
                    gearStatEffect,
                    buildSetup,
                    setupSelections,
                    pathId,
                    { script: value },
                  )
                  const rebuildTimeline = setupSelectionChangesTimeline(selectedScript, value, typedScriptDefinitions)
                  return Object.assign(
                    { label: value, setupEffects },
                    rebuildTimeline
                      ? {
                          timeline: makeTimelineInput(
                            rotationRecord,
                            innerWayConditions,
                            innerWayEffectRules,
                            setupEffects,
                          ),
                        }
                      : {},
                  )
                }),
              divinecraft: Object.entries(typedDivinecraftDefinitions)
                .filter(([value, definition]) => definition.available !== false && value !== selectedDivinecraft)
                .map(([value]) => {
                  const setupEffects = selectedSetupEffects(
                    settings,
                    gearStatEffect,
                    buildSetup,
                    setupSelections,
                    pathId,
                    { divinecraft: value },
                  )
                  const rebuildTimeline = setupSelectionChangesTimeline(
                    selectedDivinecraft,
                    value,
                    typedDivinecraftDefinitions,
                  )
                  return Object.assign(
                    { label: value, setupEffects },
                    rebuildTimeline
                      ? {
                          timeline: makeTimelineInput(
                            rotationRecord,
                            innerWayConditions,
                            innerWayEffectRules,
                            setupEffects,
                          ),
                        }
                      : {},
                  )
                }),
              ...Object.fromEntries(
                globalDebuffRows.map(({ key }) => [
                  `debuff:${key}`,
                  [false, true]
                    .filter(enabled => enabled !== currentGlobalDebuffs[key])
                    .map(enabled => {
                      const globalDebuffs = { ...currentGlobalDebuffs, [key]: enabled }
                      return {
                        label: enabled ? "on" : "off",
                        timeline: makeTimelineInput(
                          rotationRecord,
                          innerWayConditions,
                          innerWayEffectRules,
                          baselineSetupEffects,
                          globalDebuffs,
                        ),
                      }
                    }),
                ]),
              ),
              "debuff:draught": (["none", "strayhunt", "both"] as const)
                .filter(value => value !== currentGlobalDebuffs.draught)
                .map(value => ({
                  label: value,
                  timeline: makeTimelineInput(
                    rotationRecord,
                    innerWayConditions,
                    innerWayEffectRules,
                    baselineSetupEffects,
                    { ...currentGlobalDebuffs, draught: value },
                  ),
                })),
              "debuff:qingyisCharm": (["none", "T1", "T6"] as const)
                .filter(value => value !== currentGlobalDebuffs.qingyisCharm)
                .map(value => {
                  const globalDebuffs = { ...currentGlobalDebuffs, qingyisCharm: value }
                  return {
                    label: value,
                    timeline: makeTimelineInput(
                      rotationRecord,
                      innerWayConditions,
                      innerWayEffectRules,
                      baselineSetupEffects,
                      globalDebuffs,
                    ),
                  }
                }),
              "buff:floatingGrace": (["none", "mixed", "deluge"] as const)
                .filter(value => value !== currentGlobalDebuffs.floatingGrace)
                .map(value => {
                  const globalDebuffs = { ...currentGlobalDebuffs, floatingGrace: value }
                  return {
                    label: value,
                    timeline: makeTimelineInput(
                      rotationRecord,
                      innerWayConditions,
                      innerWayEffectRules,
                      baselineSetupEffects,
                      globalDebuffs,
                    ),
                  }
                }),
              ...setComparisonGroups,
            }
          : ({} as Record<string, RotationSimulationVariant[]>),
      }
    },
  )
  // Requests the structural editor timeline for the current revision. Declared after
  // calculationBundleFor so the effect only references initialized bindings.
  useEffect(() => {
    if (editorTimelineReady) return
    const requested: EditorRevision = { id: editingRotationId, context: calculationContextKey, rotation }
    let cancelled = false
    let timer: ReturnType<typeof window.setTimeout>
    const current = () => !cancelled
    const run = async () => {
      try {
        const result = await requestEditorTimeline(calculationBundleFor(requested.rotation, false), {
          key: `editor:${requested.id}`,
          priority: 450,
        })
        if (!current()) return
        setEditorTimelineState({ ...result, rotation: requested.rotation, revision: requested })
      } catch (error) {
        if (!current()) return
        if (error instanceof Error && error.message.includes("superseded")) {
          timer = window.setTimeout(() => void run(), 150)
          return
        }
        publishNotice({
          id: "editor-timeline",
          error: true,
          message: error instanceof Error ? error.message : t("ui.notices.calculationError"),
        })
      }
    }
    timer = window.setTimeout(() => void run(), 100)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      cancelEditorTimelineRequest(`editor:${requested.id}`)
    }
  }, [calculationContextKey, editingRotationId, rotation, editorTimelineReady])

  const prepareBaselineCalculation = useEffectEvent((rotationRecord: RotationRecord) => {
    const bundle = calculationBundleFor(rotationRecord, false)
    return { bundle, fingerprint: rotationBundleFingerprint(bundle) }
  })
  const prepareGraduationCalculation = useEffectEvent((rotationRecord: RotationRecord) => {
    const environment: GraduationPresetEnvironment = {
      pathId,
      martialArts: [...settings.weapons],
      rotation: { ...rotationRecord, ping: resolvePing(rotationRecord.ping, settings.ping) },
      breakthrough: settings.breakthrough,
      globalDebuffs: currentGlobalDebuffs,
      food: currentFood,
      script: currentScript,
      divinecraft: currentDivinecraft,
      graduatedBuildIds: typedPathDefinitions[pathId].graduated,
      skillOverrides,
    }
    return buildGraduationBundleSet(environment)
  })
  // Publishes the active rotation's simulation bundle. Declared after
  // prepareGraduationCalculation so the effect only references initialized bindings.
  useEffect(() => {
    if (!activeRotationId) return
    const activeEntry = rotationEntries.find(entry => entry.id === activeRotationId)
    const activeRotation =
      activeRotationId === editingRotationId ? rotation : activeEntry ? rotationRecordForEntry(activeEntry) : undefined
    if (activeRotation) {
      const graduation = prepareGraduationCalculation(activeRotation)
      graduationFingerprintRef.current = graduation?.fingerprint ?? null
      let cachedGraduation: number | undefined
      if (graduation) {
        const cachedBaselines = graduation.candidates.flatMap(candidate => {
          const baseline = calculationCacheRef.current.baseline(candidate.fingerprint)
          return baseline ? [baseline] : []
        })
        if (cachedBaselines.length === graduation.candidates.length)
          cachedGraduation = selectHighestGraduationResult(cachedBaselines)?.metrics.dps
      }
      onActiveSimulationBundleChange(
        calculationBundleFor(activeRotation, false),
        activeRotation.name || "Active rotation",
        `${activeRotationId}:${calculationContextKey}:${JSON.stringify(activeRotation)}`,
        activeEntry?.isDefault === true,
        graduation ? { fingerprint: graduation.fingerprint, dps: cachedGraduation } : undefined,
      )
    }
  }, [
    editingRotationId,
    rotation,
    rotationEntries,
    calculationContextKey,
    pathId,
    defaultRotationId,
    activeRotationId,
    onActiveSimulationBundleChange,
  ])

  const workerCacheKeyFor = (fingerprint: string) => `rotation:${fingerprint}`

  function storeBaselineResult(id: string, key: string, result: RotationSimulationResult) {
    const next = { ...rotationResultsRef.current, [id]: { key, result } }
    rotationResultsRef.current = next
    setRotationResults(next)
  }

  async function calculateBaselineForRotation(
    id: string,
    rotationRecord: RotationRecord,
    priority = 100,
    prepared = prepareBaselineCalculation(rotationRecord),
  ) {
    const resultKey = prepared.fingerprint
    const displayed = rotationResultsRef.current[id]
    if (displayed?.key === resultKey) {
      const cachedBaseline = calculationCacheRef.current.baseline(resultKey)
      if (cachedBaseline) return cachedBaseline
    }
    const cachedBaseline = calculationCacheRef.current.baseline(resultKey)
    if (cachedBaseline) {
      storeBaselineResult(id, resultKey, cachedBaseline)
      return cachedBaseline
    }
    const result = await requestRotationBaseline(prepared.bundle, workerCacheKeyFor(resultKey), {
      key: `baseline:${id}`,
      priority,
    })
    calculationCacheRef.current.storeBaseline(resultKey, result)
    storeBaselineResult(id, resultKey, result)
    return result
  }

  const calculateEditorPreview = useEffectEvent(
    async (id: string, rotationRecord: RotationRecord, requestSequence: number) => {
      const prepared = prepareBaselineCalculation(rotationRecord)
      const resultKey = prepared.fingerprint
      const refreshTarget = `${id}:${resultKey}`
      const cachedBaseline = calculationCacheRef.current.baseline(resultKey)
      if (cachedBaseline) {
        if (editorPreviewRequestSequenceRef.current === requestSequence)
          storeBaselineResult(id, resultKey, cachedBaseline)
        return
      }
      if (runningRefreshTargetRef.current === refreshTarget) return
      const result = await requestRotationBaseline(prepared.bundle, workerCacheKeyFor(resultKey), {
        key: `preview:${id}`,
        priority: 200,
      })
      calculationCacheRef.current.storeBaseline(resultKey, result)
      if (editorPreviewRequestSequenceRef.current === requestSequence) storeBaselineResult(id, resultKey, result)
    },
  )

  async function calculateGraduationDps(rotationRecord: RotationRecord) {
    const prepared = prepareGraduationCalculation(rotationRecord)
    if (!prepared) return
    const baselines = await Promise.all(
      prepared.candidates.map(async candidate => {
        const cachedBaseline = calculationCacheRef.current.baseline(candidate.fingerprint)
        if (cachedBaseline) return cachedBaseline
        const baseline = await requestRotationBaseline(candidate.bundle, workerCacheKeyFor(candidate.fingerprint), {
          key: `graduation:${candidate.fingerprint}`,
          priority: 390,
        })
        calculationCacheRef.current.storeBaseline(candidate.fingerprint, baseline)
        return baseline
      }),
    )
    const highest = selectHighestGraduationResult(baselines)
    if (highest && graduationFingerprintRef.current === prepared.fingerprint)
      onGraduationDpsChange(prepared.fingerprint, highest.metrics.dps)
  }

  const calculateDiffsForRotation = useEffectEvent(
    async (id: string, rotationRecord: RotationRecord, prepared = prepareBaselineCalculation(rotationRecord)) => {
      const requestSequence = ++diffRequestSequenceRef.current
      supersedeRotationCalculationRequests()
      beginRotationCalculation()
      const contextKey = calculationContextKey
      const resultKey = prepared.fingerprint
      const refreshTarget = `${id}:${resultKey}`
      scheduledRefreshTargetRef.current = refreshTarget
      runningRefreshTargetRef.current = refreshTarget
      try {
        const baseline = await calculateBaselineForRotation(id, rotationRecord, 400, prepared)
        if (calculationContextKeyRef.current !== contextKey) {
          if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const
          endRotationCalculation()
          return "discarded" as const
        }
        if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const
        if (resolvedActiveRotationIdRef.current !== id) {
          endRotationCalculation()
          return "discarded" as const
        }

        let metrics = baselineMetricsWithPreviousComparisons(baseline.metrics, getRotationMetrics())
        onMetricsChange(metrics, true)
        completeRotationCalculationCategory("baseline")

        try {
          await calculateGraduationDps(rotationRecord)
        } catch (graduationError) {
          if (diffRequestSequenceRef.current === requestSequence)
            publishNotice({
              id: "graduation-calculation",
              error: true,
              message: graduationError instanceof Error ? graduationError.message : t("ui.notices.calculationError"),
            })
        }
        if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const

        const comparisonBundle = calculationBundleFor(rotationRecord, true)
        const calculateComparisonCategory = async (
          category: RotationCalculationCategory,
          previousMetrics: RotationMetrics,
        ): Promise<RotationMetrics | "superseded" | "discarded"> => {
          const variants = comparisonVariantRequests(comparisonBundle, category)
          if (variants.length === 0) return mergeComparisonCategory(previousMetrics, baseline.metrics, category)
          const variantMetrics: RotationMetrics[] = []
          const calculateComparisonVariant = async (variant: ComparisonVariantRequest, index: number) => {
            let calculated = calculationCacheRef.current.variant(resultKey, variant.key)
            if (!calculated) {
              calculated = await requestRotationComparisons(variant.bundle, workerCacheKeyFor(resultKey), baseline, {
                key: `diff:${id}:${category}:${variant.key}`,
                priority: 350,
                onProgress: progress => {
                  if (diffRequestSequenceRef.current === requestSequence)
                    publishRotationCategoryProgress(category, (index + progress) / variants.length)
                },
              })
              calculationCacheRef.current.storeVariant(resultKey, variant.key, calculated)
            }
            variantMetrics.push(calculated)
            if (diffRequestSequenceRef.current === requestSequence)
              publishRotationCategoryProgress(category, (index + 1) / variants.length)
          }
          await variants.reduce(
            (previous, variant, index) => previous.then(() => calculateComparisonVariant(variant, index)),
            Promise.resolve(),
          )
          if (calculationContextKeyRef.current !== contextKey) {
            if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const
            endRotationCalculation()
            return "discarded" as const
          }
          if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const
          if (resolvedActiveRotationIdRef.current !== id) {
            endRotationCalculation()
            return "discarded" as const
          }
          return combineComparisonVariantMetrics(previousMetrics, variantMetrics, category)
        }
        type ComparisonProgress = { status: "published" | "superseded" | "discarded"; metrics: RotationMetrics }
        const comparisonOutcome = await comparisonCategoryOrder.reduce(
          async (previous, category): Promise<ComparisonProgress> => {
            const state = await previous
            if (state.status !== "published") return state
            const result = await calculateComparisonCategory(category, state.metrics)
            if (result === "superseded" || result === "discarded") return { status: result, metrics: state.metrics }
            onMetricsChange(result, true)
            completeRotationCalculationCategory(category)
            return { status: "published" as const, metrics: result }
          },
          Promise.resolve({ status: "published" as const, metrics }),
        )
        if (comparisonOutcome.status !== "published") return comparisonOutcome.status
        metrics = comparisonOutcome.metrics
        return "published" as const
      } catch (calculationError) {
        if (diffRequestSequenceRef.current === requestSequence) endRotationCalculation()
        if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const
        publishNotice({
          id: "rotation-calculation",
          error: true,
          message: calculationError instanceof Error ? calculationError.message : t("ui.notices.calculationError"),
        })
        return "failed" as const
      } finally {
        if (diffRequestSequenceRef.current === requestSequence) runningRefreshTargetRef.current = null
      }
    },
  )

  const localRotationCalculation: RotationMetrics = {
    totalDamage: totalRotationDamage,
    dps: rotationDps,
    unscaledTotalDamage: currentCachedResult?.metrics.unscaledTotalDamage ?? totalRotationDamage,
    unscaledDps: currentCachedResult?.metrics.unscaledDps ?? rotationDps,
    totalHealing: totalRotationHealing,
    hps: rotationHps,
    breakdown: currentCachedResult?.metrics.breakdown ?? emptyRotationBreakdown(),
    statPriority: priorityStats,
    attunementPriority: priorityAttunementRows,
    innerWayPriority: priorityInnerWays,
    setupComparisons,
  }
  const rotationCalculation = currentCachedResult?.metrics ?? localRotationCalculation

  useEffect(() => {
    const requestSequence = ++editorPreviewRequestSequenceRef.current
    if (!editorTimelineReady) return
    const timer = window.setTimeout(() => {
      void calculateEditorPreview(editingRotationId, rotation, requestSequence).catch(calculationError => {
        if (editorPreviewRequestSequenceRef.current !== requestSequence) return
        if (calculationError instanceof Error && calculationError.message.includes("superseded")) return
        publishNotice({
          id: "rotation-preview",
          error: true,
          message: calculationError instanceof Error ? calculationError.message : t("ui.notices.calculationError"),
        })
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      if (editorPreviewRequestSequenceRef.current === requestSequence) editorPreviewRequestSequenceRef.current += 1
    }
  }, [calculationContextKey, editingRotationId, rotation, editorTimelineReady])

  useEffect(() => {
    const entries = rotationEntries.filter(entry => rotationAvailableForWeapons(entry, settings.weapons))
    const activeEntry =
      entries.find(entry => entry.id === activeRotationId) ??
      entries.find(entry => entry.id === defaultRotationId) ??
      entries[0]
    if (!activeEntry) return
    if (activeEntry.id === editingRotationId && !editorTimelineReady) return
    const activeRotation = activeEntry.id === editingRotationId ? rotation : rotationRecordForEntry(activeEntry)
    const prepared = prepareBaselineCalculation(activeRotation)
    const refreshTarget = `${activeEntry.id}:${prepared.fingerprint}`
    if (scheduledRefreshTargetRef.current === refreshTarget) return
    void (async () => {
      const outcome = await calculateDiffsForRotation(activeEntry.id, activeRotation, prepared)
      if (outcome === "discarded") {
        setRefreshRetryRevision(current => current + 1)
        return
      }
      if (outcome !== "published") return
      if (calculationContextKeyRef.current !== calculationContextKey) return
      const refreshEntryBaseline = async (entry: RotationEntry) => {
        if (entry.id === activeEntry.id) return
        try {
          await calculateBaselineForRotation(entry.id, rotationRecordForEntry(entry), 100)
        } catch {
          /* Superseded by newer work. */
        }
      }
      await entries.reduce((previous, entry) => previous.then(() => refreshEntryBaseline(entry)), Promise.resolve())
    })()
  }, [
    activeRotationId,
    calculationContextKey,
    defaultRotationId,
    editingRotationId,
    refreshRetryRevision,
    editorTimelineReady,
    rotation,
    rotationEntries,
    settings.weapons,
  ])
  return (
    <Panel className="rotation-editor-panel">
      <div className="rotation-editor-layout">
        <aside className="rotation-list">
          <div className="rotation-list-heading">
            <span>{t("ui.app.rotations")}</span>
          </div>
          <div className="rotation-list-entries">
            <Button
              className="rotation-list-create"
              variant="secondary"
              size="small"
              type="button"
              onClick={addRotation}
            >
              <IconPlus size="1em" aria-hidden />
              <span>{t("ui.app.newRotation")}</span>
            </Button>
            {listedRotationEntries.map(entry => {
              const incompatible = !rotationAvailableForWeapons(entry, settings.weapons)
              return (
                <div
                  className={`rotation-list-item ${entry.id === activeRotationId ? "active" : ""} ${entry.id === editingRotationId ? "editing" : ""} ${incompatible ? "incompatible" : ""}`}
                  key={entry.id}
                >
                  <button
                    className="rotation-select-button"
                    type="button"
                    title={incompatible ? t("ui.app.selectThisRotationAndSwitchToItsMartial") : undefined}
                    onClick={() => selectRotation(entry)}
                  >
                    <strong>
                      {entry.id === activeRotationId && (
                        <span className="active-rotation-icon" title={t("ui.app.activeRotation")}>
                          <IconPointFilled size="1em" aria-hidden />
                        </span>
                      )}
                      {rotationEntryDisplayName(entry)}
                    </strong>
                  </button>
                  {!entry.isDefault && (
                    <span className="rotation-list-actions">
                      <button
                        className="rotation-remove-button"
                        type="button"
                        aria-label={t("ui.app.removeNamedRotation", {
                          name: entry.rotation.name || t("ui.app.rotation"),
                        })}
                        title={t("ui.app.removeRotation")}
                        disabled={listedRotationEntries.length <= 1}
                        onClick={event => {
                          event.stopPropagation()
                          removeRotation(entry.id)
                        }}
                      >
                        <IconX size="1em" aria-hidden />
                      </button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="rotation-transfer-actions">
            <div>
              <Button variant="secondary" size="small" type="button" onClick={exportRotations}>
                {t("ui.app.export")}
              </Button>
              <Button
                variant="secondary"
                size="small"
                type="button"
                onClick={() => rotationImportInputRef.current?.click()}
              >
                {t("ui.app.import")}
              </Button>
              <input
                ref={rotationImportInputRef}
                type="file"
                accept="application/json,.json"
                aria-label={t("ui.app.importRotations")}
                onChange={importRotations}
                hidden
              />
            </div>
          </div>
        </aside>
        {editingEntry ? (
          <div className="rotation-editor-content">
            <div className="skill-detail-heading">
              <div>
                {editingName && !rotationLocked ? (
                  <input
                    ref={rotationNameInputRef}
                    className="rotation-name-input"
                    value={rotation.name}
                    onChange={event => setRotation({ ...rotation, name: event.target.value })}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={event => {
                      if (event.key === "Enter") setEditingName(false)
                    }}
                  />
                ) : (
                  <h3>
                    {editingRotationDisplayName}
                    {!rotationLocked && (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("ui.app.editRotationName")}
                        onClick={() => setEditingName(true)}
                      >
                        <IconEdit size="1em" aria-hidden />
                      </button>
                    )}
                  </h3>
                )}
                {rotationLocked && (
                  <p className="rotation-default-note">{t("ui.app.thisIsAPrebuiltDefaultRotationAndCannot")}</p>
                )}
                <div className="rotation-target-controls">
                  <label className="rotation-target-hp">
                    <span>{t("ui.app.targetHp")}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={rotationLocked}
                      placeholder={t("ui.app.notSpecified")}
                      value={rotation.targetHP ?? ""}
                      onChange={event => {
                        const value = event.target.value
                        const parsed = Number(value)
                        if (value !== "" && !Number.isFinite(parsed)) return
                        updateRotationCalculationSetting(current => ({
                          ...current,
                          ...(value === "" ? { targetHP: undefined } : { targetHP: Math.max(1, parsed) }),
                        }))
                      }}
                    />
                  </label>
                  <label className="rotation-target-select">
                    <span>{t("ui.app.target")}</span>
                    <select
                      disabled={rotationLocked}
                      value={practiceTarget}
                      onChange={event =>
                        updateRotationCalculationSetting(current => ({
                          ...current,
                          targetType: event.target.value as TargetType,
                        }))
                      }
                    >
                      {bossDefinitions.map(definition => (
                        <option key={definition.id} value={definition.id}>
                          {gameText(definition.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rotation-option-toggle">
                    <input
                      type="checkbox"
                      disabled={rotationLocked}
                      checked={rotation.infiniteVitality === true}
                      onChange={event =>
                        updateRotationCalculationSetting(current => ({
                          ...current,
                          infiniteVitality: event.target.checked,
                        }))
                      }
                    />
                    <span>{t("ui.app.infiniteVitality")}</span>
                  </label>
                  <label className="rotation-group-size">
                    <span>{t("ui.app.groupType")}</span>
                    <select
                      disabled={rotationLocked}
                      value={rotation.groupSize ?? 1}
                      onChange={event => {
                        const groupSize = Number(event.target.value)
                        if (groupSize !== 1 && groupSize !== 5 && groupSize !== 10) return
                        updateRotationCalculationSetting(current => ({ ...current, groupSize }))
                      }}
                    >
                      <option value={1}>{t("ui.app.solo")}</option>
                      <option value={5}>{t("ui.app.team")}</option>
                      <option value={10}>{t("ui.app.group")}</option>
                    </select>
                  </label>
                  <RotationEnemyCountField
                    key={`enemy-count-${editingRotationId}`}
                    value={normalizeEnemyCount(rotation.enemyCount)}
                    disabled={rotationLocked}
                    onCommit={enemyCount => updateRotationCalculationSetting(current => ({ ...current, enemyCount }))}
                  />
                  <RotationPingField
                    key={editingRotationId}
                    value={rotation.ping}
                    inheritedValue={settings.ping}
                    disabled={rotationLocked}
                    onCommit={ping => updateRotationCalculationSetting(current => ({ ...current, ping }))}
                  />
                </div>
              </div>
              <div className="detail-active-actions">
                <span className="rotation-heading-actions">
                  <Button
                    variant="secondary"
                    size="small"
                    type="button"
                    disabled={timeline.length === 0}
                    onClick={openReadableRotation}
                  >
                    {t("ui.app.readableFormat")}
                  </Button>
                  {!rotationLocked && (
                    <>
                      <Button variant="secondary" size="small" type="button" onClick={resetRotation}>
                        {t("ui.app.reset")}
                      </Button>
                      <Button variant="primary" size="small" type="button" onClick={save}>
                        {t("ui.app.save")}
                      </Button>
                    </>
                  )}
                  <span className="rotation-activation-actions">
                    <Button variant="secondary" size="small" type="button" onClick={duplicateRotation}>
                      {t("ui.app.duplicate")}
                    </Button>
                    <Button
                      className="detail-active-button"
                      size="small"
                      type="button"
                      disabled={editingRotationId === activeRotationId}
                      onClick={() => activateRotation(editingRotationId)}
                    >
                      {editingRotationId === activeRotationId ? t("ui.app.active") : t("ui.app.makeActive")}
                    </Button>
                  </span>
                </span>
              </div>
            </div>
            <div className="rotation-toolbar">
              <span>
                {rotation.steps.filter(step => step.type === "skill").length} {t("ui.app.steps")}{" "}
                {formatNumber(totalRotationTime)}
                {t("ui.app.sTotalTime")}
              </span>
              <span className="rotation-results">
                <span>
                  {t("system.totalDamage")}: {formatDamageNumber(rotationCalculation.unscaledTotalDamage)}
                </span>
                {rotationCalculation.totalHealing > 0 ? (
                  <span className="healing-value">
                    {t("system.totalHealing")}: +{formatDamageNumber(rotationCalculation.totalHealing)}
                  </span>
                ) : null}
                <span>
                  {t("system.dps")}: {formatDamageNumber(rotationCalculation.unscaledDps)}
                  {rotationCalculation.hps > 0 ? (
                    <span className="healing-value">
                      {" / "}
                      {t("system.hps")}: {formatDamageNumber(rotationCalculation.hps)}
                    </span>
                  ) : null}
                </span>
              </span>
            </div>
            <div className="rotation-scroll-content" ref={rotationScrollRef}>
              <div className="rotation-table" style={rotationTableStyle}>
                <div className="rotation-table-header">
                  <span></span>
                  <span>#</span>
                  <span>{t("ui.app.startTime")}</span>
                  <span>{t("ui.app.castTime")}</span>
                  <span>{t("ui.app.skill")}</span>
                  {showDistanceColumn && <span>{t("ui.app.distance")}</span>}
                  {showSelfHPColumn && <span>{t("ui.app.selfHp")}</span>}
                  {showTargetHPColumn && <span>{t("ui.app.hp")}</span>}
                  {showQiColumn && <span>{t("ui.app.qi")}</span>}
                  {showHellfireColumn && <span>{t("system.resource.hellfire")}</span>}
                  {showHeavensWillColumn && <span>{t("system.resource.heavensWill")}</span>}
                  {showVitalityColumn && <span>{t("system.resource.vitality")}</span>}
                  <span className="rotation-damage-heading">{t("ui.app.damage")}</span>
                  <span>{t("ui.app.buff")}</span>
                  <span>{t("ui.app.debuff")}</span>
                  <span>{t("ui.app.actions")}</span>
                </div>
                <div className="rotation-step-list" ref={rotationStepListRef} style={stepListStyle}>
                  {visibleEntries.map((entry, visibleIndex) => {
                    const row = entry.row
                    if (row.kind === "damageGroup") {
                      const groupSkillId = row.step.type === "skill" ? row.step.skill : undefined
                      const damage =
                        currentCachedResult?.metrics.breakdown.casts.find(cast => cast.skillId === groupSkillId)
                          ?.damage ?? 0
                      return (
                        <div
                          className="rotation-row-group"
                          key={`${row.id}-summary`}
                          data-window-key={`${row.id}-summary`}
                          ref={rowWindow.measure(`${row.id}-summary`)}
                        >
                          <div className="rotation-table-row">
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span className="rotation-skill-name">
                              <RotationSkillName skill={row.skill} fallback={groupSkillId ?? ""} />
                            </span>
                            {showDistanceColumn && <span aria-hidden="true" />}
                            {showSelfHPColumn && <span aria-hidden="true" />}
                            {showTargetHPColumn && <span aria-hidden="true" />}
                            {showQiColumn && <span aria-hidden="true" />}
                            {showHellfireColumn && <span aria-hidden="true" />}
                            {showHeavensWillColumn && <span aria-hidden="true" />}
                            {showVitalityColumn && <span aria-hidden="true" />}
                            <span className="rotation-damage-value" data-mobile-label={t("ui.app.damage")}>
                              {formatDamageNumber(damage)}
                            </span>
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                            <span aria-hidden="true" />
                          </div>
                        </div>
                      )
                    }
                    const isAction = entry.kind === "action"
                    const { step: timelineStep, startTime, skill: timelineSkill } = row
                    const authoredStep =
                      row.rotationIndex === undefined || !editorTimelineReady
                        ? timelineStep
                        : (rotation.steps[row.rotationIndex] ?? timelineStep)
                    const step = authoredStep
                    const skill =
                      authoredStep.type === "skill"
                        ? (calculationDefinitions.skills[authoredStep.skill ?? ""] ?? timelineSkill)
                        : timelineSkill
                    const castTime = row.effectiveCastTime
                    const effectNames = (
                      effects: Array<{
                        name: string
                        stack?: number
                        maxStack?: number
                        remainingTriggers?: number
                        expiresAt?: number
                        hideRemainingTime?: boolean
                        averageStackOnly?: boolean
                      }>,
                      atTime: number,
                    ) => {
                      const shown = visibleTimelineEffects(effects, calculationDefinitions.effectDefinitions)
                      return shown.length === 0 ? (
                        ""
                      ) : (
                        <span className="effect-plates">
                          {shown.map(effect => {
                            const definition = calculationDefinitions.effectDefinitions[effect.name]
                            const description = gameText(definition?.description?.trim())
                            const name = gameText(definition?.name ?? effect.name)
                            const showStack =
                              effect.stack !== undefined &&
                              (effect.maxStack === undefined ||
                                effect.maxStack > 1 ||
                                (effect.averageStackOnly && Math.abs(effect.stack - 1) > 1e-9))
                            const label = `${gameText(definition?.shortName) || name}${showStack ? ` ×${formatNumber(effect.stack ?? 0)}` : ""}`
                            const timeLeft =
                              effect.expiresAt === undefined ? "∞" : Math.max(0, effect.expiresAt - atTime).toFixed(2)
                            const finiteListener = definition?.listen?.find(
                              listener =>
                                typeof listener.maxTriggers === "number" &&
                                Number.isFinite(listener.maxTriggers) &&
                                listener.action?.type === "trigger" &&
                                typeof listener.action.value === "string",
                            )
                            const triggerSkillId = finiteListener?.action?.value
                            const remainingTriggerName =
                              typeof triggerSkillId === "string"
                                ? gameText(calculationDefinitions.skills[triggerSkillId]?.name ?? triggerSkillId)
                                : ""
                            let plateKind = ""
                            switch (true) {
                              case dotEffectIds.has(effect.name):
                                plateKind = " effect-plate-dot"
                                break
                              case definition?.badgeColor === "red":
                                plateKind = " effect-plate-general-debuff"
                                break
                            }
                            return (
                              <Chip className={`effect-plate${plateKind}`} key={`${effect.name}-${effect.stack ?? 1}`}>
                                <Tooltip
                                  className="effect-plate-tooltip"
                                  align="end"
                                  content={
                                    <>
                                      {effect.averageStackOnly ? (
                                        <span>
                                          {t("ui.app.averageStack")}: {formatNumber(effect.stack ?? 0)}
                                        </span>
                                      ) : (
                                        <>
                                          {effect.remainingTriggers !== undefined && remainingTriggerName ? (
                                            <>
                                              <strong>{name}</strong>
                                              <span>
                                                {t("ui.app.remainingTriggerCount", {
                                                  name: remainingTriggerName,
                                                  number: effect.remainingTriggers,
                                                })}
                                              </span>
                                              {!effect.hideRemainingTime ? (
                                                <span>{t("ui.app.sLeft", { number: timeLeft })}</span>
                                              ) : null}
                                            </>
                                          ) : (
                                            <strong>
                                              {effect.hideRemainingTime
                                                ? name
                                                : `${name} - ${t("ui.app.sLeft", { number: timeLeft })}`}
                                            </strong>
                                          )}
                                          {description ? <span>{description}</span> : null}
                                        </>
                                      )}
                                    </>
                                  }
                                >
                                  {label}
                                </Tooltip>
                              </Chip>
                            )
                          })}
                        </span>
                      )
                    }
                    const actionIndex = entry.actionIndex
                    const actionTime = entry.time
                    const isManualEvent = step.type === "event"
                    const isDelayEvent = isManualEvent && step.event === "Delay"
                    const isFixedTime = isFixedTimeEvent(authoredStep)
                    const canStartAtRow =
                      row.rotationIndex === undefined
                        ? canUseRotationStart(authoredStep)
                        : canUseRotationStartAt(rotation.steps, row.rotationIndex)
                    const isEventMovable = authoredStep.type === "event" && authoredStep.event !== "Delay"
                    const isEventTimeEditable = supportsEventStartTime(authoredStep)
                    const isProtectedDelay = isAutomaticDelay(step)
                    const isGeneratedEvent =
                      step.type === "event" &&
                      step.event === "TakeDamage" &&
                      "automatic" in step &&
                      step.automatic === "targetAttack"
                    const rowReadOnly = rotationLocked || isGeneratedEvent || row.rotationIndex === undefined
                    const resolvedTakeDamage =
                      step.type === "event" && step.event === "TakeDamage"
                        ? Number(row.actions.find(action => action.type === "takeDamage")?.damage ?? step.damage)
                        : 0
                    const skillNumber =
                      step.type === "skill" && row.rotationIndex !== undefined
                        ? rotation.steps.slice(0, row.rotationIndex).filter(candidate => candidate.type === "skill")
                            .length
                        : ""
                    const isAttachedEvent = Boolean(attachedTargetForStep(authoredStep))
                    const availableAttachmentTargets = isEventMovable
                      ? availableAttachmentTargetsForEvent(authoredStep)
                      : []
                    const attachedTargetIndex =
                      isEventMovable && row.rotationIndex !== undefined
                        ? attachmentTargetIndexForEvent(row.rotationIndex, row, availableAttachmentTargets)
                        : -1
                    const attachedSiblingAbove =
                      isAttachedEvent && !isFixedTime && row.rotationIndex !== undefined
                        ? attachedEventSiblingIndex(rotation.steps, row.rotationIndex, -1)
                        : -1
                    const attachedSiblingBelow =
                      isAttachedEvent && !isFixedTime && row.rotationIndex !== undefined
                        ? attachedEventSiblingIndex(rotation.steps, row.rotationIndex, 1)
                        : -1
                    const eventStartTime =
                      isFixedTime && "startTime" in authoredStep && typeof authoredStep.startTime === "number"
                        ? authoredStep.startTime
                        : isAttachedEvent && attachedTargetIndex >= 0
                          ? (availableAttachmentTargets[attachedTargetIndex]?.time ?? startTime) - anchorTime
                          : displayTime(startTime)
                    const stepSkill = step.type === "skill" ? step.skill : undefined
                    const actionsExpanded = skillActionsExpanded(row.id)
                    const actionState =
                      actionIndex === undefined
                        ? undefined
                        : (row.actionStates[actionIndex] ?? {
                            buffs: row.buffs,
                            debuffs: row.debuffs,
                            distance: row.distance,
                            currentHPRatio: row.currentHPRatio,
                            targetHPRatio: row.targetHPRatio,
                            targetQiRatio: row.targetQiRatio,
                            resources: row.resources,
                          })
                    const selfHPMaximum = Math.max(1, displayedCharacterStats.maxHp)
                    const selfHPPercentage = (actionState?.currentHPRatio ?? row.currentHPRatio) * 100
                    const selfHPEventPercentage =
                      step.type === "event" && step.event === "SelfHP"
                        ? ("currentHP" in step && typeof step.currentHP === "number"
                            ? step.currentHP / selfHPMaximum
                            : (step.currentHPRatio ?? 1)) * 100
                        : selfHPPercentage
                    const durationEvent =
                      isManualEvent && (step.event === "Controlled" || step.event === "Delay") ? step.event : undefined
                    const editableCastTime =
                      step.type === "skill" &&
                      (row.skill?.editableCastTime === true || row.skill?.durationInput !== undefined)
                    const durationMaximum = step.type === "skill" ? durationInputMaximum(row.skill) : undefined
                    const durationLabel =
                      step.type === "skill" && row.skill?.durationInput !== undefined
                        ? t("ui.app.duration")
                        : t("ui.app.castTime")
                    let durationValue = 0
                    switch (step.type) {
                      case "skill":
                        durationValue = Math.min(
                          step.duration ?? durationMaximum ?? baseSkillCastTime(row.skill),
                          durationMaximum ?? Number.POSITIVE_INFINITY,
                        )
                        break
                      case "event":
                        if (durationEvent)
                          durationValue =
                            ("duration" in step ? step.duration : undefined) ??
                            (durationEvent === "Delay" ? 1 : eventDefaultDuration(durationEvent))
                        break
                    }
                    const actionBuffs =
                      Array.from(actionState?.buffs.values() ?? []).filter(
                        effect => effect.expiresAt === undefined || effect.expiresAt > actionTime,
                      ) ?? []
                    const actionDebuffs =
                      Array.from(actionState?.debuffs.values() ?? []).filter(
                        effect => effect.expiresAt === undefined || effect.expiresAt > actionTime,
                      ) ?? []
                    const skillDamageRows =
                      !isAction && row.kind === "rotation" ? (damageRowsByOwner.get(row.id) ?? [row]) : [row]
                    const skillExpectedBuffStacks = skillDamageRows.reduce<
                      { time: number; stacks: Record<string, number> } | undefined
                    >((earliest, damageRow) => {
                      let next = earliest
                      damageRow.actions.forEach((action, damageIndex) => {
                        if (action.type !== "damage") return
                        const expectedBuffStacks =
                          workerActionBreakdowns[`${damageRow.id}:${damageIndex}`]?.expectedBuffStacks
                        if (!expectedBuffStacks) return
                        const time = damageRow.startTime + Number(action.time ?? 0)
                        if (!next || time < next.time) next = { time, stacks: expectedBuffStacks }
                      })
                      return next
                    }, undefined)
                    const displayedSkillBuffs = withExpectedOutcomeBuffPlates(
                      Array.from(row.buffs.values()),
                      skillExpectedBuffStacks?.stacks,
                    )
                    const skillBreakdown = skillDamageRows.reduce<RotationActionBreakdown>(
                      (skillTotal, damageRow) =>
                        damageRow.actions.reduce<RotationActionBreakdown>((total, action, damageIndex) => {
                          if (action.type !== "damage" && action.type !== "replay" && action.type !== "heal")
                            return total
                          const breakdown = calculateTimelineActionBreakdown(damageRow, damageIndex)
                          const physicalHealing = (total.healing?.physical ?? 0) + (breakdown.healing?.physical ?? 0)
                          const silkbindHealing = (total.healing?.silkbind ?? 0) + (breakdown.healing?.silkbind ?? 0)
                          const totalHealing = (total.healing?.total ?? 0) + (breakdown.healing?.total ?? 0)
                          return {
                            physical: total.physical + breakdown.physical,
                            bellstrike: total.bellstrike + breakdown.bellstrike,
                            stonesplit: total.stonesplit + breakdown.stonesplit,
                            silkbind: total.silkbind + breakdown.silkbind,
                            bamboocut: total.bamboocut + breakdown.bamboocut,
                            total: total.total + breakdown.total,
                            ...(totalHealing > 0
                              ? {
                                  healing: {
                                    physical: physicalHealing,
                                    silkbind: silkbindHealing,
                                    total: totalHealing,
                                  },
                                }
                              : {}),
                          }
                        }, skillTotal),
                      {
                        physical: 0,
                        bellstrike: 0,
                        stonesplit: 0,
                        silkbind: 0,
                        bamboocut: 0,
                        total: 0,
                      } as RotationActionBreakdown,
                    )
                    return (
                      <div
                        className="rotation-row-group"
                        key={displayEntryKey(entry)}
                        data-window-key={displayEntryKey(entry)}
                        data-window-last={windowStart + visibleIndex === displayEntries.length - 1 ? "" : undefined}
                        ref={rowWindow.measure(displayEntryKey(entry))}
                      >
                        {!isAction && (
                          <div
                            className={`rotation-table-row ${isManualEvent ? "rotation-event-row" : ""} ${isManualEvent && step.event === "Move" ? "rotation-move-event-row" : ""} ${isManualEvent && step.event === "TakeDamage" ? "rotation-take-damage-event-row" : ""} ${isFixedTime ? "rotation-fixed-time-event" : ""}`}
                            data-rotation-step-index={row.rotationIndex}
                          >
                            {row.kind === "rotation" ? (
                              <button
                                className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "active" : ""}`}
                                type="button"
                                aria-label={t("ui.app.setFightStartHere")}
                                disabled={rowReadOnly || isProtectedDelay || !canStartAtRow}
                                onClick={() => selectStart(row.rotationIndex ?? 0)}
                              >
                                {startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "→" : "•"}
                              </button>
                            ) : (
                              <span aria-hidden="true" />
                            )}
                            <span className="rotation-index">{skillNumber}</span>
                            <span className="rotation-mobile-field" data-mobile-label={t("ui.app.startTime")}>
                              {isManualEvent ? (
                                !isEventTimeEditable || rowReadOnly ? (
                                  <span>
                                    {formatNumber(eventStartTime)}
                                    {t("ui.app.s")}
                                  </span>
                                ) : (
                                  <span className={`rotation-event-time-control ${isFixedTime ? "fixed" : ""}`}>
                                    <input
                                      className="rotation-event-time"
                                      data-fixed-time={isFixedTime || undefined}
                                      aria-label={t("ui.app.startTime")}
                                      title={isFixedTime ? t("ui.app.fixedTime") : undefined}
                                      type="number"
                                      step="0.01"
                                      value={eventTimeDrafts[row.id] ?? formatNumber(eventStartTime)}
                                      onChange={event =>
                                        setEventTimeDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                      }
                                      onBlur={() => commitEventTime(row.id, row.rotationIndex ?? 0)}
                                      onKeyDown={event => {
                                        if (event.key === "Enter") event.currentTarget.blur()
                                      }}
                                    />
                                    {isFixedTime ? <IconClockPin size="1em" aria-hidden /> : null}
                                  </span>
                                )
                              ) : !row.skipped ? (
                                <span>
                                  {formatNumber(displayTime(startTime))}
                                  {t("ui.app.s")}
                                </span>
                              ) : null}
                            </span>
                            <span className="rotation-mobile-field" data-mobile-label={durationLabel}>
                              {durationEvent || editableCastTime ? (
                                rowReadOnly || isProtectedDelay ? (
                                  <span>
                                    {formatNumber(durationValue)}
                                    {t("ui.app.s")}
                                  </span>
                                ) : (
                                  <input
                                    className="rotation-event-time"
                                    type="number"
                                    min="0"
                                    max={durationMaximum}
                                    step="0.01"
                                    value={eventDurationDrafts[row.id] ?? String(durationValue)}
                                    onChange={event =>
                                      setEventDurationDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                    }
                                    onBlur={() => commitEventDuration(row.id, row.rotationIndex ?? 0)}
                                    onKeyDown={event => {
                                      if (event.key === "Enter") event.currentTarget.blur()
                                    }}
                                  />
                                )
                              ) : isEventMovable ? null : (
                                <span>
                                  {isManualEvent ? "" : row.kind === "rotation" ? `${formatNumber(castTime)}s` : "—"}
                                </span>
                              )}
                            </span>
                            {row.kind === "rotation" ? (
                              rowReadOnly || isProtectedDelay ? (
                                <span className="rotation-skill-name">
                                  {isManualEvent ? (
                                    <span>{rotationEventDisplayName(step.event)}</span>
                                  ) : (
                                    <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />
                                  )}
                                </span>
                              ) : (
                                <span className="rotation-skill-select-wrap">
                                  <RotationSkillName
                                    skill={isManualEvent ? undefined : skill}
                                    fallback={isManualEvent ? rotationEventDisplayName(step.event) : (stepSkill ?? "")}
                                  />
                                  <select
                                    className="rotation-skill-select"
                                    data-rotation-step-index={row.rotationIndex}
                                    aria-label={t("ui.app.skillOrEvent")}
                                    value={isManualEvent ? `__event:${step.event}` : (stepSkill ?? "")}
                                    onChange={event =>
                                      selectRotationItem(
                                        row.rotationIndex ?? 0,
                                        event.target.value,
                                        event.currentTarget,
                                      )
                                    }
                                  >
                                    {stepSkill && !rotationSkillIds.includes(stepSkill) && (
                                      <option value={stepSkill} disabled>
                                        {skillDisplayName(calculationDefinitions.skills[stepSkill], stepSkill)}{" "}
                                        {t("ui.app.unavailable")}
                                      </option>
                                    )}
                                    {rotationSkillGroups.map(group => (
                                      <optgroup key={group.category} label={skillCategoryLabel(group.category)}>
                                        {group.skillIds.map(id => (
                                          <option key={id} value={id}>
                                            {skillDisplayName(calculationDefinitions.skills[id], id)}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                    <optgroup label={t("ui.app.events")}>
                                      {rotationEventOptionIds.map(id => (
                                        <option key={id} value={id}>
                                          {rotationEventDisplayName(id.slice(8))}
                                        </option>
                                      ))}
                                    </optgroup>
                                    <optgroup label={t("ui.app.action")}>
                                      {rotationActionOptionIds.map(id => (
                                        <option key={id} value={id}>
                                          {rotationEventDisplayName(id.slice(8))}
                                        </option>
                                      ))}
                                    </optgroup>
                                  </select>
                                </span>
                              )
                            ) : (
                              <span className="rotation-skill-name">
                                <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />
                              </span>
                            )}
                            {showDistanceColumn && (
                              <span data-mobile-label={t("ui.app.distance")}>
                                {isManualEvent && step.event === "Move" ? (
                                  rowReadOnly ? (
                                    <span>
                                      {step.distance}
                                      {t("ui.app.m")}
                                    </span>
                                  ) : (
                                    <span className="rotation-distance-input-wrap">
                                      <input
                                        className="rotation-event-time"
                                        aria-label={t("ui.app.distanceAfterMove")}
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={eventDistanceDrafts[row.id] ?? String(step.distance)}
                                        onChange={event =>
                                          setEventDistanceDrafts(current => ({
                                            ...current,
                                            [row.id]: event.target.value,
                                          }))
                                        }
                                        onBlur={() => commitEventDistance(row.id, row.rotationIndex ?? 0)}
                                        onKeyDown={event => {
                                          if (event.key === "Enter") event.currentTarget.blur()
                                        }}
                                      />
                                      <span>{t("ui.app.m")}</span>
                                    </span>
                                  )
                                ) : (
                                  <span>
                                    {formatNumber(row.distance)}
                                    {t("ui.app.m")}
                                  </span>
                                )}
                              </span>
                            )}
                            {showSelfHPColumn && (
                              <span data-mobile-label={t("ui.app.selfHp")}>
                                {isManualEvent && step.event === "TakeDamage" ? (
                                  rowReadOnly ? (
                                    <span>{formatDamageNumber(resolvedTakeDamage)}</span>
                                  ) : (
                                    <span className="rotation-distance-input-wrap">
                                      <input
                                        className="rotation-event-time"
                                        aria-label={t("ui.app.damageTaken")}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={eventHPDrafts[row.id] ?? String(step.damage)}
                                        onChange={event =>
                                          setEventHPDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                        }
                                        onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                        onKeyDown={event => {
                                          if (event.key === "Enter") event.currentTarget.blur()
                                        }}
                                      />
                                    </span>
                                  )
                                ) : isManualEvent && step.event === "SelfHP" ? (
                                  rotationLocked ? (
                                    <span>{formatNumber(selfHPEventPercentage)}%</span>
                                  ) : (
                                    <span className="rotation-distance-input-wrap">
                                      <input
                                        className="rotation-event-time"
                                        aria-label={t("ui.app.currentSelfHp")}
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={eventHPDrafts[row.id] ?? String(selfHPEventPercentage)}
                                        onChange={event =>
                                          setEventHPDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                        }
                                        onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                        onKeyDown={event => {
                                          if (event.key === "Enter") event.currentTarget.blur()
                                        }}
                                      />
                                      <span>%</span>
                                    </span>
                                  )
                                ) : (
                                  <span>{formatNumber(row.currentHPRatio * 100)}%</span>
                                )}
                              </span>
                            )}
                            {showTargetHPColumn && (
                              <span data-mobile-label={t("ui.app.hp")}>
                                {isManualEvent && step.event === "HP" ? (
                                  rotationLocked ? (
                                    <span>{formatNumber(step.targetHPRatio * 100)}%</span>
                                  ) : (
                                    <span className="rotation-distance-input-wrap">
                                      <input
                                        className="rotation-event-time"
                                        aria-label={t("ui.app.targetHpPercentage")}
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={eventHPDrafts[row.id] ?? String(step.targetHPRatio * 100)}
                                        onChange={event =>
                                          setEventHPDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                        }
                                        onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                        onKeyDown={event => {
                                          if (event.key === "Enter") event.currentTarget.blur()
                                        }}
                                      />
                                      <span>%</span>
                                    </span>
                                  )
                                ) : (
                                  <span>{formatNumber(row.targetHPRatio * 100)}%</span>
                                )}
                              </span>
                            )}
                            {showQiColumn && (
                              <span data-mobile-label={t("ui.app.qi")}>
                                {isManualEvent && step.event === "Qi" ? (
                                  rotationLocked ? (
                                    <span>{formatNumber(step.targetQiRatio * 100)}%</span>
                                  ) : (
                                    <span className="rotation-distance-input-wrap">
                                      <input
                                        className="rotation-event-time"
                                        aria-label={t("ui.app.targetQiPercentage")}
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={eventHPDrafts[row.id] ?? String(step.targetQiRatio * 100)}
                                        onChange={event =>
                                          setEventHPDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                        }
                                        onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                        onKeyDown={event => {
                                          if (event.key === "Enter") event.currentTarget.blur()
                                        }}
                                      />
                                      <span>%</span>
                                    </span>
                                  )
                                ) : (
                                  <span>{formatNumber(row.targetQiRatio * 100)}%</span>
                                )}
                              </span>
                            )}
                            {showHellfireColumn && (
                              <span
                                className="rotation-hellfire-value"
                                data-full={(row.resources.Hellfire ?? 0) >= typedSystemStats.resourceMaximums.Hellfire}
                                data-flamelash={row.buffs.has("Flamelash")}
                                data-mobile-label={t("system.resource.hellfire")}
                              >
                                {isManualEvent && step.event === "Hellfire" ? (
                                  rowReadOnly ? (
                                    <span>
                                      {step.amount > 0 ? "+" : ""}
                                      {formatNumber(step.amount)}
                                    </span>
                                  ) : (
                                    <input
                                      className="rotation-event-time"
                                      aria-label={t("ui.app.hellfireChange")}
                                      title={t("ui.app.hellfireChange")}
                                      type="number"
                                      step="0.01"
                                      value={eventHPDrafts[row.id] ?? String(step.amount)}
                                      onChange={event =>
                                        setEventHPDrafts(current => ({ ...current, [row.id]: event.target.value }))
                                      }
                                      onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                      onKeyDown={event => {
                                        if (event.key === "Enter") event.currentTarget.blur()
                                      }}
                                    />
                                  )
                                ) : (
                                  formatNumber(row.resources.Hellfire ?? 0)
                                )}
                              </span>
                            )}
                            {showHeavensWillColumn && (
                              <span data-mobile-label={t("system.resource.heavensWill")}>
                                {formatNumber(row.resources.HeavensWill ?? 0)}
                              </span>
                            )}
                            {showVitalityColumn && (
                              <span data-mobile-label={t("system.resource.vitality")}>
                                {rotation.infiniteVitality
                                  ? "∞"
                                  : formatResourceRange(row.resources.Vitality ?? 0, row.resourceRanges?.Vitality)}
                              </span>
                            )}
                            <span className="rotation-damage-value" data-mobile-label={t("ui.app.damage")}>
                              {isManualEvent ? (
                                step.event === "MartialArt" ? (
                                  rotationLocked ? (
                                    <span>{gameText(martialArtDefinitions[step.martialArt].name)}</span>
                                  ) : (
                                    <select
                                      className="rotation-martial-art-select"
                                      aria-label={t("ui.app.martialArtToSwitchTo")}
                                      value={step.martialArt}
                                      onChange={event =>
                                        updateStep(row.rotationIndex ?? 0, {
                                          martialArt: event.target.value as WeaponId,
                                        })
                                      }
                                    >
                                      {!settings.weapons.includes(step.martialArt) && (
                                        <option value={step.martialArt} disabled>
                                          {gameText(martialArtDefinitions[step.martialArt].name)}{" "}
                                          {t("ui.app.unavailable")}
                                        </option>
                                      )}
                                      {settings.weapons.map(martialArt => (
                                        <option value={martialArt} key={martialArt}>
                                          {gameText(martialArtDefinitions[martialArt].name)}
                                        </option>
                                      ))}
                                    </select>
                                  )
                                ) : (
                                  ""
                                )
                              ) : step.type === "skill" &&
                                (skillBreakdown.total > 0 || (skillBreakdown.healing?.total ?? 0) > 0) ? (
                                <RotationActionBreakdownValue breakdown={skillBreakdown} />
                              ) : (
                                ""
                              )}
                            </span>
                            <span className="rotation-buff-cell" data-mobile-label={t("ui.app.buff")}>
                              {isManualEvent && step.event === "Buff" ? (
                                rotationLocked ? (
                                  <span>
                                    {calculationDefinitions.effectDefinitions[step.buff]?.name ?? step.buff}
                                    {(step.stack ?? 1) > 1 ? ` ×${step.stack}` : ""}
                                  </span>
                                ) : (
                                  <span
                                    className={`rotation-effect-event-control ${(manualEffectMaxStacks.get(step.buff) ?? 1) <= 1 ? "single" : ""}`}
                                  >
                                    <select
                                      className="rotation-effect-select"
                                      aria-label={t("ui.app.buffToApply")}
                                      value={step.buff}
                                      onChange={event => {
                                        const buff = event.target.value
                                        updateStep(row.rotationIndex ?? 0, {
                                          buff,
                                          stack: Math.min(step.stack ?? 1, manualEffectMaxStacks.get(buff) ?? 1),
                                        })
                                      }}
                                    >
                                      {Object.keys(manualBuffDefinitions).map(id => (
                                        <option value={id} key={id}>
                                          {calculationDefinitions.effectDefinitions[id]?.name ?? id}
                                        </option>
                                      ))}
                                    </select>
                                    {(manualEffectMaxStacks.get(step.buff) ?? 1) > 1 && (
                                      <input
                                        className="rotation-effect-stack"
                                        aria-label={t("ui.app.buffStacks")}
                                        type="number"
                                        min="1"
                                        max={manualEffectMaxStacks.get(step.buff) ?? 1}
                                        step="1"
                                        value={step.stack ?? 1}
                                        onChange={event => {
                                          const stack = Number(event.target.value)
                                          if (Number.isFinite(stack))
                                            updateStep(row.rotationIndex ?? 0, {
                                              stack: Math.max(
                                                1,
                                                Math.min(manualEffectMaxStacks.get(step.buff) ?? 1, Math.floor(stack)),
                                              ),
                                            })
                                        }}
                                      />
                                    )}
                                  </span>
                                )
                              ) : isManualEvent ? (
                                ""
                              ) : (
                                effectNames(displayedSkillBuffs, startTime)
                              )}
                            </span>
                            <span className="rotation-debuff-cell" data-mobile-label={t("ui.app.debuff")}>
                              {isManualEvent && step.event === "Debuff" ? (
                                rotationLocked ? (
                                  <span>
                                    {calculationDefinitions.effectDefinitions[step.debuff]?.name ?? step.debuff}
                                    {(step.stack ?? 1) > 1 ? ` ×${step.stack}` : ""}
                                  </span>
                                ) : (
                                  <span
                                    className={`rotation-effect-event-control ${(manualEffectMaxStacks.get(step.debuff) ?? 1) <= 1 ? "single" : ""}`}
                                  >
                                    <select
                                      className="rotation-effect-select"
                                      aria-label={t("ui.app.debuffToApply")}
                                      value={step.debuff}
                                      onChange={event => {
                                        const debuff = event.target.value
                                        updateStep(row.rotationIndex ?? 0, {
                                          debuff,
                                          stack: Math.min(step.stack ?? 1, manualEffectMaxStacks.get(debuff) ?? 1),
                                        })
                                      }}
                                    >
                                      {Object.keys(manualDebuffDefinitions).map(id => (
                                        <option value={id} key={id}>
                                          {calculationDefinitions.effectDefinitions[id]?.name ?? id}
                                        </option>
                                      ))}
                                    </select>
                                    {(manualEffectMaxStacks.get(step.debuff) ?? 1) > 1 && (
                                      <input
                                        className="rotation-effect-stack"
                                        aria-label={t("ui.app.debuffStacks")}
                                        type="number"
                                        min="1"
                                        max={manualEffectMaxStacks.get(step.debuff) ?? 1}
                                        step="1"
                                        value={step.stack ?? 1}
                                        onChange={event => {
                                          const stack = Number(event.target.value)
                                          if (Number.isFinite(stack))
                                            updateStep(row.rotationIndex ?? 0, {
                                              stack: Math.max(
                                                1,
                                                Math.min(
                                                  manualEffectMaxStacks.get(step.debuff) ?? 1,
                                                  Math.floor(stack),
                                                ),
                                              ),
                                            })
                                        }}
                                      />
                                    )}
                                  </span>
                                )
                              ) : isManualEvent ? (
                                ""
                              ) : (
                                effectNames(Array.from(row.debuffs.values()), startTime)
                              )}
                            </span>
                            <span className="rotation-controls">
                              {isEventMovable && (
                                <>
                                  <span className="rotation-control-placeholder" aria-hidden="true" />
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveEventToPreviousAction")}
                                    disabled={rowReadOnly || (attachedSiblingAbove < 0 && attachedTargetIndex <= 0)}
                                    onClick={event =>
                                      moveAttachedEvent(row.rotationIndex ?? 0, -1, event.currentTarget)
                                    }
                                  >
                                    <IconChevronUp size="1em" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveEventToNextAction")}
                                    disabled={
                                      rowReadOnly ||
                                      (attachedSiblingBelow < 0 &&
                                        (attachedTargetIndex < 0 ||
                                          attachedTargetIndex >= availableAttachmentTargets.length - 1))
                                    }
                                    onClick={event => moveAttachedEvent(row.rotationIndex ?? 0, 1, event.currentTarget)}
                                  >
                                    <IconChevronDown size="1em" aria-hidden />
                                  </button>
                                </>
                              )}
                              {row.kind === "rotation" && !isManualEvent && (
                                <button
                                  className="rotation-expand-button"
                                  type="button"
                                  aria-label={t("ui.app.toggleNamedSkillActions", {
                                    action: actionsExpanded ? t("ui.app.collapse") : t("ui.app.expand"),
                                    name: skillDisplayName(skill, stepSkill ?? t("ui.app.skillFallback")),
                                  })}
                                  aria-expanded={actionsExpanded}
                                  onClick={() => toggleSkillActions(row.id)}
                                >
                                  {actionsExpanded ? (
                                    <IconChevronDown size="1em" aria-hidden />
                                  ) : (
                                    <IconChevronRight size="1em" aria-hidden />
                                  )}
                                </button>
                              )}
                              {row.kind === "rotation" && (!isManualEvent || isDelayEvent) && !isProtectedDelay && (
                                <>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveUp")}
                                    disabled={rowReadOnly || (row.rotationIndex ?? 0) === 0}
                                    onClick={() => moveStep(row.rotationIndex ?? 0, -1)}
                                  >
                                    <IconChevronUp size="1em" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveDown")}
                                    disabled={rowReadOnly || (row.rotationIndex ?? 0) === rotation.steps.length - 1}
                                    onClick={() => moveStep(row.rotationIndex ?? 0, 1)}
                                  >
                                    <IconChevronDown size="1em" aria-hidden />
                                  </button>
                                </>
                              )}{" "}
                              {row.kind === "rotation" && !isProtectedDelay && !isGeneratedEvent && (
                                <>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.deleteStep")}
                                    disabled={rowReadOnly || (!isManualEvent && rotationSkillCount <= 1)}
                                    onClick={() => removeStep(row.rotationIndex ?? 0)}
                                  >
                                    <IconX size="1em" aria-hidden />
                                  </button>
                                  {(!isManualEvent || isDelayEvent) && (
                                    <button
                                      type="button"
                                      aria-label={t("ui.app.addStepBelow")}
                                      disabled={rowReadOnly}
                                      onClick={() => addStepBelow(row.rotationIndex ?? 0)}
                                    >
                                      <IconPlus size="1em" aria-hidden />
                                    </button>
                                  )}
                                </>
                              )}
                              {isEventMovable && <span className="rotation-control-placeholder" aria-hidden="true" />}
                            </span>
                          </div>
                        )}
                        {isAction &&
                          (() => {
                            const actionKey = `${row.id}:${actionIndex ?? 0}`
                            const actionCalculated = Object.prototype.hasOwnProperty.call(
                              workerActionBreakdowns,
                              actionKey,
                            )
                            const actionBreakdown = workerActionBreakdowns[actionKey]
                            const expectedBuffStacks = actionBreakdown?.expectedBuffStacks
                            const displayedActionBuffs = withExpectedOutcomeBuffPlates(actionBuffs, expectedBuffStacks)
                            return (
                              <div
                                className={`rotation-action-row ${row.kind === "trigger" ? "rotation-action-trigger" : row.kind === "dot" ? "rotation-action-dot" : ""}`}
                              >
                                {row.kind === "rotation" ? (
                                  <button
                                    className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex ? "active" : ""}`}
                                    type="button"
                                    aria-label={t("ui.app.setFightStartHere")}
                                    disabled={
                                      rowReadOnly || !canUseRotationStartAction(authoredStep, actionIndex ?? -1)
                                    }
                                    onClick={() => selectStart(row.rotationIndex ?? 0, actionIndex)}
                                  >
                                    {startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex
                                      ? "→"
                                      : "•"}
                                  </button>
                                ) : (
                                  <span aria-hidden="true" />
                                )}
                                <span aria-hidden="true" />
                                <span className="rotation-mobile-field" data-mobile-label={t("ui.app.startTime")}>
                                  {formatNumber(displayTime(actionTime))}
                                  {t("ui.app.s")}
                                </span>
                                <span aria-hidden="true" />
                                <span>
                                  <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />
                                </span>
                                {showDistanceColumn && (
                                  <span data-mobile-label={t("ui.app.distance")}>
                                    {formatNumber(actionState?.distance ?? row.distance)}
                                    {t("ui.app.m")}
                                  </span>
                                )}
                                {showSelfHPColumn && (
                                  <span data-mobile-label={t("ui.app.selfHp")}>{formatNumber(selfHPPercentage)}%</span>
                                )}
                                {showTargetHPColumn && (
                                  <span data-mobile-label={t("ui.app.hp")}>
                                    {formatNumber((actionState?.targetHPRatio ?? row.targetHPRatio) * 100)}%
                                  </span>
                                )}
                                {showQiColumn && (
                                  <span data-mobile-label={t("ui.app.qi")}>
                                    {formatNumber((actionState?.targetQiRatio ?? row.targetQiRatio) * 100)}%
                                  </span>
                                )}
                                {showHellfireColumn && (
                                  <span
                                    className="rotation-hellfire-value"
                                    data-full={
                                      (actionState?.resources.Hellfire ?? row.resources.Hellfire ?? 0) >=
                                      typedSystemStats.resourceMaximums.Hellfire
                                    }
                                    data-flamelash={(actionState?.buffs ?? row.buffs).has("Flamelash")}
                                    data-mobile-label={t("system.resource.hellfire")}
                                  >
                                    {formatNumber(actionState?.resources.Hellfire ?? row.resources.Hellfire ?? 0)}
                                  </span>
                                )}
                                {showHeavensWillColumn && (
                                  <span data-mobile-label={t("system.resource.heavensWill")}>
                                    {formatNumber(actionState?.resources.HeavensWill ?? row.resources.HeavensWill ?? 0)}
                                  </span>
                                )}
                                {showVitalityColumn && (
                                  <span data-mobile-label={t("system.resource.vitality")}>
                                    {rotation.infiniteVitality
                                      ? "∞"
                                      : formatResourceRange(
                                          actionState?.resources.Vitality ?? row.resources.Vitality ?? 0,
                                          actionState?.resourceRanges?.Vitality ?? row.resourceRanges?.Vitality,
                                        )}
                                  </span>
                                )}
                                <span className="rotation-action-damage" data-mobile-label={t("ui.app.damage")}>
                                  {actionCalculated ? (
                                    <RotationActionBreakdownValue
                                      breakdown={calculateTimelineActionBreakdown(row, actionIndex ?? 0)}
                                    />
                                  ) : null}
                                </span>
                                <span className="rotation-buff-cell" data-mobile-label={t("ui.app.buff")}>
                                  {effectNames(displayedActionBuffs, actionTime)}
                                </span>
                                <span className="rotation-debuff-cell" data-mobile-label={t("ui.app.debuff")}>
                                  {effectNames(actionDebuffs, actionTime)}
                                </span>
                                <span aria-hidden="true" />
                              </div>
                            )
                          })()}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {error && <p className="editor-error">{error}</p>}
          </div>
        ) : (
          <div className="rotation-editor-content">
            <p className="array-editor-empty">{t("ui.app.noRotationsMatchTheSelectedMartialArtsAdd")}</p>
          </div>
        )}
      </div>
      <dialog className="rotation-readable-dialog" ref={readableDialogRef} onClose={() => setReadableDialogOpen(false)}>
        <div className="rotation-readable-heading">
          <div>
            <span className="detail-kicker">{t("ui.app.readableFormat")}</span>
            <h3>{editingRotationDisplayName}</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t("ui.app.closeReadableRotation")}
            onClick={() => readableDialogRef.current?.close()}
          >
            <IconX size="1em" aria-hidden />
          </button>
        </div>
        <p>{t("ui.app.skillsBeforeTheStartUseARoundedPre")}</p>
        <textarea
          ref={readableTextRef}
          readOnly
          value={readableRotation}
          aria-label={t("ui.app.readableRotation")}
          onFocus={event => event.currentTarget.select()}
        />
        <div className="rotation-readable-actions">
          <output>{readableCopyStatus}</output>
          <Button variant="secondary" type="button" onClick={() => readableDialogRef.current?.close()}>
            {t("ui.app.close")}
          </Button>
          <Button variant="primary" type="button" onClick={copyReadableRotation}>
            {t("ui.app.copy")}
          </Button>
        </div>
      </dialog>
    </Panel>
  )
}
