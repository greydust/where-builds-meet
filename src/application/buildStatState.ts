import { breakthroughProfile } from "@/application/gameData/setup"
import { resolveAttunementStats, type AttunementOverrides } from "@/calculations/attunementStats"
import type { AttunementStats } from "@/calculations/damage"
import type { CharacterStatOverrides, StatEffectContainer } from "@/calculations/statEffects"
import {
  calculateEquippedGearEffects,
  resolveBuildInventory,
  resolveBuildSetup,
  type BuildSetup,
  type BuildSetupOverrides,
} from "@/gear"
import type { CharacterStats } from "@/types"

import { calculateGlobalStatState } from "./characterComposition"
import type { CalculatorSettings, PathId, SetupSelections } from "./contracts"
import { defaultAttunementStats } from "./persistence/attunements"

/**
 * The part of a character sheet that a build decides.
 *
 * Everything here is a pure function of the build's own gear and setup against the sheet
 * inputs, so the same chain that produces the active build's numbers produces any other
 * build's. That is what lets a build be measured without being activated: nothing in the
 * chain depends on which build is selected, only on which build is being resolved.
 *
 * The bundle and stat fields a calculation needs are the output, rather than the
 * intermediate `equippedGearEffects`, so a caller cannot read a half-resolved build.
 */
export type BuildStatState = {
  buildSetup: BuildSetup
  gearStatEffect: StatEffectContainer
  /** The effective sheet, after gear, setup and overrides. */
  stats: CharacterStats
  rawStats: CharacterStats
  baseStats: CharacterStats
  derivedStats: ReturnType<typeof calculateGlobalStatState>["derivedStats"]
  /**
   * The attunement a calculation resolves against, and the one shown on the sheet. They
   * differ where a stat override hides the gear's contribution, so a build measured off
   * screen must carry both or its reading would not match the sheet it came from.
   */
  attunement: AttunementStats
  displayedAttunement: AttunementStats
}

export type BuildStatStateInput = {
  build: Parameters<typeof resolveBuildSetup>[0]
  gearItems: Parameters<typeof resolveBuildInventory>[1]
  settings: CalculatorSettings
  statOverrides: CharacterStatOverrides
  attunementOverrides: AttunementOverrides
  setupSelections: SetupSelections
  pathId: PathId
  /**
   * Setup edits made on top of a build without saving them. They belong to the build being
   * edited, so a build measured other than the one on screen has none.
   */
  buildSetupOverrides?: BuildSetupOverrides
}

export function resolveBuildSetupWithOverrides(
  build: BuildStatStateInput["build"],
  overrides: BuildSetupOverrides | undefined,
): BuildSetup {
  const stored = resolveBuildSetup(build)
  if (!overrides) return stored
  return {
    innerWays: (overrides.innerWays ?? stored.innerWays).map(row => Object.assign({}, row)),
    weaponSets: { ...(overrides.weaponSets ?? stored.weaponSets) },
    armorSets: { ...(overrides.armorSets ?? stored.armorSets) },
    bowRingSet: overrides.bowRingSet ?? stored.bowRingSet,
    arsenal: overrides.arsenal ?? stored.arsenal,
  }
}

export function resolveBuildStatState(input: BuildStatStateInput): BuildStatState {
  const { build, gearItems, settings, statOverrides, attunementOverrides, setupSelections, pathId } = input
  const buildSetup = resolveBuildSetupWithOverrides(build, input.buildSetupOverrides)
  const inventory = build
    ? resolveBuildInventory(build, gearItems, settings.weapons, breakthroughProfile(settings).gearTier)
    : { items: [], equipped: {} }
  // A default build is the path's own preset, so its gear is not a player's choice and does
  // not earn the scaling a hand-picked one does.
  const equipped = calculateEquippedGearEffects(inventory, settings.weapons, build?.isDefault !== true)
  const gearStatEffect: StatEffectContainer = { rawStat: equipped.stats }
  const globalStatState = calculateGlobalStatState(
    statOverrides,
    settings,
    gearStatEffect,
    buildSetup,
    setupSelections,
    pathId,
  )
  const attunement = resolveAttunementStats(defaultAttunementStats, equipped.attunement, attunementOverrides, {
    physicalPenetration: globalStatState.stats.physicalPenetration,
    formlessPenetration: globalStatState.stats.formlessPenetration,
  })

  return {
    buildSetup,
    gearStatEffect,
    stats: globalStatState.stats,
    rawStats: globalStatState.rawStats,
    baseStats: globalStatState.baseStats,
    derivedStats: globalStatState.derivedStats,
    attunement: attunement.calculation,
    displayedAttunement: attunement.displayed,
  }
}
