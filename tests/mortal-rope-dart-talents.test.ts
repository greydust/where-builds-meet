import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, TimelineRow } from "@/calculations/rotationTimeline"
import type { EffectiveStatEffectContainer, StatEffectContainer } from "@/calculations/statEffects"
import type { MartialArtTalent } from "@/data/martialArtTalents"
import type { WeaponId } from "@/types"

import { assertClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"

// Ported from script/probe/check-mortal-rope-dart-talents.mjs.
describe("mortal-rope-dart-talents", () => {
  it("Mortal Rope Dart: rank-13 stats, Rodent damage, raw-stat isolation, and Bone Corrosion refresh/expiration passed", async () => {
    const close = (actual: number | undefined, expected: number, message: string) =>
      assertClose(actual, expected, 1e-8, message)

    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const definitions: Partial<Record<WeaponId, { talent: Array<Array<MartialArtTalent<EditableObject>>> }>> = {
      mortalRopeDart: JSON.parse(await readFile("data/martial-art/mortal-rope-dart.json", "utf8")),
      infernalTwinblades: JSON.parse(await readFile("data/martial-art/infernal-twinblades.json", "utf8")),
    }
    const weapons: WeaponId[] = ["mortalRopeDart"]
    // The paired probe runs Infernal alongside it, so it names both.
    const pairedWeapons: WeaponId[] = ["mortalRopeDart", "infernalTwinblades"]
    const setupEffects = martialArtEffectsForRank(definitions, weapons, 13)
    // The unconditional talents are the ones that apply without a requirement.
    const unconditional = setupEffects.filter(effect => !("requirement" in effect && effect.requirement))
    for (const [agility, crit] of [
      [0, 0],
      [140, 0.04256],
      [280, 0.08512],
      [560, 0.08512],
    ] as Array<[number, number]>) {
      const sheet = calculateStatsWithEffects({ ...emptyStats, agility }, unconditional, 0, weapons)
      close(sheet.stats.crit, crit, "Agility conversion scales and stops at its cap")
    }
    for (const [baseMin, bonus] of [
      [0, 0.032928],
      [102, 0.0672],
      [230, 0.11],
      [500, 0.11],
    ] as Array<[number, number]>) {
      const sheet = calculateStatsWithEffects(
        { ...emptyStats, minBamboocut: baseMin, maxBamboocut: 1000 },
        [
          ...unconditional,
          { statStage: "food", effectiveStat: { minBamboocut: 100 } } satisfies StatEffectContainer &
            EffectiveStatEffectContainer,
        ],
        0,
        weapons,
      )
      close(sheet.stats.bamboocutDmgBonus, bonus, "Attribute conversion includes flat talents but excludes later food")
    }

    const calculate = (
      minPhys: number,
      rodent: boolean,
      extraEffects: Array<StatEffectContainer & EffectiveStatEffectContainer> = [],
      selectedWeapons: WeaponId[] = weapons,
    ) => {
      const stats = {
        ...emptyStats,
        minPhys,
        maxPhys: 2000,
        precision: 1,
        minBamboocut: 102,
        maxBamboocut: 804,
        minBellstrike: 100,
        maxBellstrike: 100,
        minStonesplit: 100,
        maxStonesplit: 100,
        minSilkbind: 100,
        maxSilkbind: 100,
      }
      const result = calculateRotationBaseline({
        timeline: {
          rotation: { name: "Rodent talent probe", steps: [{ type: "skill", skill: "Hit" }] },
          skills: {
            Hit: {
              castTime: 1,
              tags: ["MartialArts", "MortalRopeDart", ...(rodent ? ["Rodent"] : [])],
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
            },
          },
          setupEffects: [...martialArtEffectsForRank(definitions, selectedWeapons, 13), ...extraEffects],
          weapons: selectedWeapons,
          effectDefinitions: {},
          eventDefinitions: {},
          dots: {},
          innerWayConditions: [],
          innerWayRules: [],
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy: {
          name: "Probe",
          level: 96,
          defense: 0,
          physicalResistance: 0,
          bellstrikeResistance: 0,
          stonesplitResistance: 0,
          silkbindResistance: 0,
          bamboocutResistance: 0,
          judgementResistance: 0,
        },
        attunement: emptyAttunementStats,
        weapons: selectedWeapons,
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
      return Object.values(result.actionBreakdowns)[0]
    }
    for (const [minPhys, bonus] of [
      [0, 0.09],
      [375, 0.15],
      [750, 0.21],
      [1500, 0.21],
    ]) {
      const ordinary = calculate(minPhys, false)
      const rodent = calculate(minPhys, true)
      close(ordinary.physical, (minPhys + 2000) / 2, "Ordinary attacks have no Rodent bonus")
      close(
        rodent.physical - ordinary.physical,
        ((minPhys + 2000) / 2) * bonus,
        "Rodent Physical bonus has a fixed base and capped scaling",
      )
      close(
        ordinary.bamboocut,
        600 * 1.5 * 1.0672,
        "Flat attribute stats, converted bonus, and primary multiplier each apply once",
      )
      close(
        rodent.bamboocut - ordinary.bamboocut,
        600 * 1.5 * bonus,
        "Rodent Bamboocut bonus adds to the attribute talent",
      )
      for (const channel of ["bellstrike", "stonesplit", "silkbind"] as const) {
        close(rodent[channel], 100, `${channel} receives no Rodent bonus or primary multiplier`)
      }
    }
    const food: Array<StatEffectContainer & EffectiveStatEffectContainer> = [
      { statStage: "food", effectiveStat: { minPhys: 500 } },
    ]
    close(
      calculate(375, true, food).physical / calculate(375, false, food).physical,
      1.15,
      "Food attack does not feed the talent formula",
    )
    const agility: Array<StatEffectContainer & EffectiveStatEffectContainer> = [{ rawStat: { agility: 280 } }]
    close(
      calculate(375, true, agility, pairedWeapons).physical / calculate(375, false, agility, pairedWeapons).physical,
      1.15,
      "Infernal's Agility-to-attack talent does not feed Rodent scaling",
    )
    const debuffs = JSON.parse(await readFile("data/debuff/bamboocut-wind.json", "utf8"))
    const rows = buildRotationTimeline({
      rotation: {
        name: "Bone Corrosion refresh",
        steps: [
          castStep("Apply"),
          castStep("Observe"),
          delayStep(4),
          castStep("Apply"),
          castStep("Observe"),
          delayStep(1),
          castStep("Observe"),
          delayStep(4),
          castStep("Observe"),
        ],
      },
      skills: {
        Apply: { castTime: 0, action: [{ type: "apply", target: "target", value: "BoneCorrosion", time: 0 }] },
        Observe: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      },
      effectDefinitions: debuffs,
      eventDefinitions: {},
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects,
      weapons,
    })
    const observed = (rows: TimelineRow[]) => rows.filter(row => row.step.skill === "Observe")
    /** The Bone Corrosion a cast left on the target, if it applied any. */
    const corrosionOf = (row: TimelineRow | undefined) => row?.debuffs.get("BoneCorrosion")
    /** The expiry of the Bone Corrosion a cast left on the target. */
    const corrosionExpiresAt = (row: TimelineRow | undefined) => {
      const tracked = corrosionOf(row)
      assert(tracked, "Every observed cast must leave Bone Corrosion on the target.")
      return tracked.expiresAt
    }
    close(corrosionExpiresAt(observed(rows)[0]), 5, "Bone Corrosion starts with a five-second lifetime")
    close(corrosionExpiresAt(observed(rows)[1]), 9, "Reapplication refreshes its expiration")
    const reapplied = observed(rows)[1]
    assert.equal(corrosionOf(reapplied)?.stack, 1, "Reapplication cannot add a second stack")
    assert(observed(rows)[2]?.debuffs.get("BoneCorrosion"), "Refreshed Bone Corrosion survives the original expiration")
    assert(!observed(rows)[3]?.debuffs.get("BoneCorrosion"), "Bone Corrosion expires at the refreshed boundary")
  })
})
