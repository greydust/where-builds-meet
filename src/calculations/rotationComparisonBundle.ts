import {
  attunementAvailableForSettings,
  characterStatAvailableForSettings,
  innerWayAvailableForPath,
  innerWayConditionsFor,
  innerWayEffectRulesFor,
  selectedSetupEffects,
  setAvailableForSettings,
  setupConditionsFor,
} from "@/application/characterComposition"
import type { SetupSelections } from "@/application/contracts"
import {
  breakthroughProfile,
  foodAvailableForPath,
  foodSelectionForPath,
  typedArmorSetDefinitions,
  typedArsenalDefinitions,
  typedBowRingSetDefinitions,
  typedDivinecraftDefinitions,
  typedFoodDefinitions,
  typedScriptDefinitions,
  typedWeaponSetDefinitions,
} from "@/application/gameData/setup"
import { percentageAttunementKeys } from "@/application/persistence/attunements"
import { innerWayDefinitions } from "@/data/innerWayDefinitions"
import { setupSelectionChangesTimeline } from "@/data/scriptDefinitions"
import { allStatDefinitions } from "@/data/statDefinitions"
import { attunementData, maxGearRoll, selectSetTier, setSelectionChangesTimeline, statRollsForLevel } from "@/gear"
import type { BuildSetup } from "@/gear"
import { globalDebuffRows } from "@/globalDebuffs"
import type { CharacterStats } from "@/types"

import type { AttunementStats } from "./damage"
import {
  buildRotationCalculationBundle,
  buildRotationTimeline,
  type CalculationSubject,
  type TimelineOverrides,
} from "./rotationCalculationBundle"
import type { RotationSimulationBundle, RotationSimulationVariant } from "./rotationCalculator"
import type { RotationRecord, TimelineBuildInput } from "./rotationTimeline"

/**
 * The bundle a worker calculates a rotation's comparisons from: the subject's own bundle plus one
 * variant per difference worth measuring.
 *
 * A comparison is the same rotation measured against a single change — a stat at its maximum
 * roll, the other weapon set, the next tier of a relic — so a category is a set of variants rather
 * than a result of its own. Building them needs the calculation subject and the static definitions
 * and nothing else, which is what lets the application resolve them without the rotation editor
 * being mounted: they are data about a rotation, not a view of one.
 *
 * `includeDiffs: false` yields the subject's baseline bundle, which is what a caller showing a
 * total rather than a comparison reads, so it never pays to construct a variant it will not use.
 */
export function buildRotationComparisonBundle(
  subject: CalculationSubject,
  includeDiffs = true,
): RotationSimulationBundle {
  const { settings, setupSelections, pathId } = subject
  const { buildSetup, gearStatEffect, baseStats: rawCharacterStats, attunement: attunementStats } = subject.build
  const currentGlobalDebuffs = subject.globalDebuffs
  const { food: currentFood, script: currentScript, divinecraft: currentDivinecraft } = setupSelections
  const innerWayEffectRules = innerWayEffectRulesFor(
    buildSetup.innerWays,
    breakthroughProfile(settings).soloLevel,
    pathId,
  )
  const makeTimelineInput = (_rotation: RotationRecord, overrides: TimelineOverrides = {}): TimelineBuildInput =>
    buildRotationTimeline(subject, overrides)
  const applyPriorityStatLine = (key: keyof CharacterStats, amount: number) => {
    return { ...rawCharacterStats, [key]: rawCharacterStats[key] + amount }
  }
  const priorityLevelData = statRollsForLevel(subject.enemy.level)
  const priorityCharacter = Object.fromEntries(
    Object.entries(priorityLevelData?.affix ?? {}).filter(([key]) =>
      characterStatAvailableForSettings(key as keyof CharacterStats, settings, pathId),
    ),
  ) as Partial<Record<keyof CharacterStats, number>>
  const priorityAttunement = Object.keys(attunementData)
    .filter(key => attunementAvailableForSettings(key, pathId, settings))
    .flatMap(key => {
      const amount = maxGearRoll(key, "attunement", false, subject.enemy.level)
      return typeof amount === "number" ? [[key, amount] as const] : []
    })
  const selectedInnerWays = buildSetup.innerWays.filter(
    row => row.innerWay && innerWayAvailableForPath(row.innerWay, pathId),
  )
  // Every setup variant compared for a rotation inherits that rotation's
  // Divinecraft damage flag, so a comparison delta isolates the varying option.
  const setupEffectsForRotation = (overrides: Partial<BuildSetup & SetupSelections> = {}) =>
    selectedSetupEffects(settings, gearStatEffect, buildSetup, setupSelections, pathId, {
      ...overrides,
      divinecraftDamage: subject.rotation.divinecraftDamage,
    })
  const baselineSetupEffects = setupEffectsForRotation()
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
                  const setupEffects = setupEffectsForRotation({ [key]: selections })
                  const rebuildTimeline = setSelectionChangesTimeline(buildSetup[key], selections, definitions)
                  return Object.assign(
                    { label: String(tier), setupEffects },
                    rebuildTimeline ? { timeline: makeTimelineInput(subject.rotation, { setupEffects }) } : {},
                  )
                }),
            ]),
        ),
      )
    : {}
  const selectedFood = foodSelectionForPath(currentFood, pathId)
  const selectedScript = currentScript
  const selectedDivinecraft = currentDivinecraft
  return {
    ...buildRotationCalculationBundle(subject),
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
              ? {
                  timeline: makeTimelineInput(subject.rotation, {
                    innerWayConditions: variantConditions,
                    innerWayRules: variantRules,
                    setupEffects,
                  }),
                }
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
            .map(value => ({ label: value, setupEffects: setupEffectsForRotation({ arsenal: value }) })),
          bowRingSet: Object.keys(typedBowRingSetDefinitions)
            .filter(value => value !== buildSetup.bowRingSet)
            .map(value => ({ label: value, setupEffects: setupEffectsForRotation({ bowRingSet: value }) })),
          food: Object.keys(typedFoodDefinitions)
            .filter(value => value !== selectedFood && foodAvailableForPath(value, pathId))
            .map(value => {
              const setupEffects = setupEffectsForRotation({ food: value })
              const rebuildTimeline = setupSelectionChangesTimeline(selectedFood, value, typedFoodDefinitions)
              return Object.assign(
                { label: value, setupEffects },
                rebuildTimeline ? { timeline: makeTimelineInput(subject.rotation, { setupEffects }) } : {},
              )
            }),
          script: Object.entries(typedScriptDefinitions)
            .filter(([value]) => value !== selectedScript)
            .map(([value]) => {
              const setupEffects = setupEffectsForRotation({ script: value })
              const rebuildTimeline = setupSelectionChangesTimeline(selectedScript, value, typedScriptDefinitions)
              return Object.assign(
                { label: value, setupEffects },
                rebuildTimeline ? { timeline: makeTimelineInput(subject.rotation, { setupEffects }) } : {},
              )
            }),
          divinecraft: Object.entries(typedDivinecraftDefinitions)
            .filter(([value, definition]) => definition.available !== false && value !== selectedDivinecraft)
            .map(([value]) => {
              const setupEffects = setupEffectsForRotation({ divinecraft: value })
              const rebuildTimeline = setupSelectionChangesTimeline(
                selectedDivinecraft,
                value,
                typedDivinecraftDefinitions,
              )
              return Object.assign(
                { label: value, setupEffects },
                rebuildTimeline ? { timeline: makeTimelineInput(subject.rotation, { setupEffects }) } : {},
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
                    timeline: makeTimelineInput(subject.rotation, {
                      setupEffects: baselineSetupEffects,
                      globalDebuffs: globalDebuffs,
                    }),
                  }
                }),
            ]),
          ),
          "debuff:draught": (["none", "strayhunt", "both"] as const)
            .filter(value => value !== currentGlobalDebuffs.draught)
            .map(value => ({
              label: value,
              timeline: makeTimelineInput(subject.rotation, {
                setupEffects: baselineSetupEffects,
                globalDebuffs: { ...currentGlobalDebuffs, draught: value },
              }),
            })),
          "debuff:qingyisCharm": (["none", "T1", "T6"] as const)
            .filter(value => value !== currentGlobalDebuffs.qingyisCharm)
            .map(value => {
              const globalDebuffs = { ...currentGlobalDebuffs, qingyisCharm: value }
              return {
                label: value,
                timeline: makeTimelineInput(subject.rotation, {
                  setupEffects: baselineSetupEffects,
                  globalDebuffs: globalDebuffs,
                }),
              }
            }),
          "buff:floatingGrace": (["none", "mixed", "deluge"] as const)
            .filter(value => value !== currentGlobalDebuffs.floatingGrace)
            .map(value => {
              const globalDebuffs = { ...currentGlobalDebuffs, floatingGrace: value }
              return {
                label: value,
                timeline: makeTimelineInput(subject.rotation, {
                  setupEffects: baselineSetupEffects,
                  globalDebuffs: globalDebuffs,
                }),
              }
            }),
          ...setComparisonGroups,
        }
      : ({} as Record<string, RotationSimulationVariant[]>),
  }
}
