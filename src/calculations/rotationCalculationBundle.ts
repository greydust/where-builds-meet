import { resolveBuildStatState, type BuildStatState } from "@/application/buildStatState"
import {
  innerWayConditionsFor,
  innerWayEffectRulesFor,
  selectedSetupEffects,
  setupConditionsFor,
} from "@/application/characterComposition"
import type { CalculatorSettings, PathId, SetupSelections } from "@/application/contracts"
import { combatDefinitionsFor, type PreviewId } from "@/application/gameData/previews"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { breakthroughProfile, typedSystemStats } from "@/application/gameData/setup"
import type { BuildEntry, BuildSetupOverrides, GearItem } from "@/gear"
import { globalBuffTimelineEffects, globalDebuffTimelineEffects, type GlobalDebuffState } from "@/globalDebuffs"
import { resolveSkillCalculationDefinitions, type SkillOverrides } from "@/skillOverrides"
import type { EnemyProfile } from "@/types"

import type { AttunementOverrides } from "./attunementStats"
import { rotationBundleFingerprint } from "./calculationFingerprint"
import { resolvePing } from "./combatDefaults"
import type { RotationSimulationBundle } from "./rotationCalculator"
import type { EditableObject, InnerWayEffectRule, RotationRecord, TimelineBuildInput } from "./rotationTimeline"
import type { CharacterStatOverrides } from "./statEffects"

/**
 * The part of a resolved build a calculation reads. Narrower than a `BuildStatState` on
 * purpose: the sheet also needs what it shows, which a worker is never told about.
 */
export type BuildMeasurement = Pick<
  BuildStatState,
  "buildSetup" | "gearStatEffect" | "stats" | "rawStats" | "baseStats" | "attunement"
>

/**
 * Everything a calculation needs that is not a build's own gear.
 *
 * The split is between this and a `BuildMeasurement` because those are the only two things a
 * calculation is a function of: the sheet and the rotation, and the build being measured. A
 * caller holding both can produce a bundle without knowing which tab it is on, which is what
 * lets the build list and the rotation editor measure the same build and reach the same
 * cached result instead of each calculating their own.
 */
export type CalculationSubject = {
  pathId: PathId
  settings: CalculatorSettings
  skillOverrides: SkillOverrides
  previewId: PreviewId | null
  globalDebuffs: GlobalDebuffState
  enemy: EnemyProfile
  rotation: RotationRecord
  setupSelections: SetupSelections
  /** The build to measure. Every field the worker reads from it is resolved here. */
  build: BuildMeasurement
}

/**
 * What a variant of the same rotation changes. A field left out is resolved from the subject,
 * so a caller overrides only the part its variant is about.
 */
export type TimelineOverrides = {
  setupEffects?: EditableObject[]
  globalDebuffs?: GlobalDebuffState
  /** Iterable, because a variant that swaps one Inner Way in or out resolves to a set. */
  innerWayConditions?: Iterable<string>
  innerWayRules?: InnerWayEffectRule[]
}

/**
 * The timeline input a worker builds a rotation from.
 *
 * The Inner Way conditions and rules are resolved here rather than passed in, because they
 * come from the build's own Inner Way selection and so are as build-dependent as the stats. A
 * variant that changed them without saying so would be measured against a rotation that is
 * not the one it claims to be.
 */
export function buildRotationTimeline(
  subject: CalculationSubject,
  overrides: TimelineOverrides = {},
): TimelineBuildInput {
  const { pathId, settings, skillOverrides, previewId, setupSelections, build } = subject
  const weapons = settings.weapons
  const definitions = combatDefinitionsFor(previewId)
  const { innerWays } = build.buildSetup
  const innerWayConditions = overrides.innerWayConditions ?? innerWayConditionsFor(innerWays, undefined, pathId)
  const innerWayEffectRules =
    overrides.innerWayRules ??
    innerWayEffectRulesFor(innerWays, breakthroughProfile(settings).soloLevel, pathId, definitions)
  // A rotation carries its own Divinecraft damage flag, so a variant that changes a setup
  // option is measured against the flag it is being compared under.
  const setupEffects =
    overrides.setupEffects ??
    selectedSetupEffects(
      settings,
      build.gearStatEffect,
      build.buildSetup,
      setupSelections,
      pathId,
      { divinecraftDamage: subject.rotation.divinecraftDamage },
      definitions,
    )
  const globalDebuffs = overrides.globalDebuffs ?? subject.globalDebuffs
  const overridden = resolveSkillCalculationDefinitions(
    definitions.skillMaps,
    definitions.effectDefinitions,
    definitions.dotDefinitions,
    skillOverrides,
  )
  const rotation = { ...subject.rotation, ping: resolvePing(subject.rotation.ping, settings.ping) }

  return {
    rotation,
    skills: overridden.skills,
    eventDefinitions: rotationEventDefinitions,
    dots: overridden.dots,
    effectDefinitions: overridden.effectDefinitions,
    innerWayConditions: [...innerWayConditions, ...setupConditionsFor(setupEffects)],
    innerWayRules: innerWayEffectRules,
    setupEffects,
    weapons,
    martialArtState: Object.fromEntries(
      weapons.map(martialArt => [martialArt, { weapon: definitions.martialArtDefinitions[martialArt].weapon }]),
    ),
    initialBuffs: globalBuffTimelineEffects(globalDebuffs),
    initialDebuffs: globalDebuffTimelineEffects(globalDebuffs),
    initialResources: {
      ...typedSystemStats.initialResources,
      Vitality: build.stats.maxVitality,
      Endurance: build.stats.maxEndurance,
    },
    resourceRegeneration: { HeavensWill: build.stats.heavensWillRegen, ...typedSystemStats.resourceRegeneration },
    resourceRegenerationOutOfCombat: typedSystemStats.resourceRegenerationOutOfCombat,
    resourceSpendRegenDelay: typedSystemStats.resourceSpendRegenDelay,
    resourceMaximums: {
      ...typedSystemStats.resourceMaximums,
      Vitality: build.stats.maxVitality,
      Endurance: build.stats.maxEndurance,
    },
    resourceEvents: typedSystemStats.resourceEvents,
    maxHP: build.stats.maxHp,
  }
}

/**
 * Everything a build is measured against except the build itself: the sheet, the enemy and
 * the environment, which no build chooses. Held as one value so a caller measuring a build it
 * did not activate has everything the sheet the active build was resolved from.
 */
export type MeasurementContext = {
  environment: Omit<CalculationSubject, "rotation" | "build">
  statOverrides: CharacterStatOverrides
  attunementOverrides: AttunementOverrides
  /**
   * Unsaved setup edits, and the build they were made on.
   *
   * They are applied only to that build. They belong to the build whose sheet is on screen, and
   * measuring some other build with them would compare it against a setup nobody chose for it.
   * Carrying the build's identity here rather than leaving it to each caller to remember is
   * what keeps that from being a rule someone has to know.
   */
  buildSetupOverrides?: { buildId: string; overrides: BuildSetupOverrides }
}

/**
 * The subject a build is measured against: the sheet it sits on, the enemy, and everything about
 * the environment that no build chooses.
 *
 * Split out from `buildMeasurement` so a caller needing the comparison variants of the same build
 * resolves the same subject, and therefore the same baseline fingerprint, instead of assembling a
 * second one that would miss the cache the first populated.
 */

/**
 * The bundle a build is measured with, and the key its result is held under.
 *
 * The key is the bundle's own fingerprint, which is the same key the rotation editor's baseline
 * for that build is held under. That is what lets the active build's reading be answered from
 * that baseline instead of running the rotation a second time.
 */
export function measurementSubject(input: {
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord
}): CalculationSubject {
  const { environment, statOverrides, attunementOverrides, buildSetupOverrides: unsaved } = input.context
  const build = resolveBuildStatState({
    build: input.build,
    gearItems: input.gearItems,
    pathId: environment.pathId,
    settings: environment.settings,
    setupSelections: environment.setupSelections,
    statOverrides,
    attunementOverrides,
    // Compared with an explicit guard rather than `unsaved?.buildId === build?.id`, because
    // that reads as equal when both are absent and would apply edits that do not exist.
    buildSetupOverrides: unsaved && unsaved.buildId === input.build?.id ? unsaved.overrides : undefined,
  })
  return { ...environment, rotation: input.rotation, build }
}

export function buildMeasurement(input: {
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord
}): { bundle: RotationSimulationBundle; cacheKey: string } {
  const bundle = buildRotationCalculationBundle(measurementSubject(input))
  return { bundle, cacheKey: rotationBundleFingerprint(bundle) }
}

/**
 * The bundle a worker calculates a rotation from.
 *
 * This is the only place a bundle is assembled for a build, so a bundle measured from the
 * build list is the same bundle the rotation editor would produce for that build, byte for
 * byte. That matters because a bundle's fingerprint is its cache key: two assemblies that
 * differed anywhere would silently stop sharing a result and calculate the same rotation
 * twice.
 */
export function buildRotationCalculationBundle(subject: CalculationSubject): RotationSimulationBundle {
  const { enemy, settings } = subject
  const start = subject.rotation.start

  return {
    timeline: buildRotationTimeline(subject),
    startAnchor: start ? { rowId: `rotation-${start.step}`, actionIndex: start.action } : { rowId: "rotation-0" },
    stats: subject.build.stats,
    rawStats: subject.build.rawStats,
    baseStats: subject.build.baseStats,
    attunement: subject.build.attunement,
    enemy,
    weapons: settings.weapons,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}
