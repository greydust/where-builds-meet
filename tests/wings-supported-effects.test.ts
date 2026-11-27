import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor, setupConditionsFor } from "@/application/characterComposition"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline, type RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EditableObject, RotationRecord } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"
import type { BuildSetup } from "@/gear"

function calculate(
  innerWays: BuildSetup["innerWays"],
  actions: EditableObject[],
  options: {
    tags?: string[]
    enemyCount?: number
    rank?: number
    rotation?: RotationRecord
    stats?: Partial<typeof emptyStats>
  } = {},
) {
  const stats = {
    ...emptyStats,
    maxHp: 10000,
    minPhys: 1000,
    maxPhys: 1000,
    agility: 100,
    minSilkbind: 100,
    maxSilkbind: 100,
    precision: 1,
    ...options.stats,
  }
  const weapons = ["museflowWaistDrum", "willowbendFan"] as const
  const setupEffects =
    options.rank === undefined ? [] : martialArtEffectsForRank(martialArtDefinitions, weapons, options.rank)
  const bundle: RotationSimulationBundle = {
    timeline: {
      rotation: options.rotation ?? {
        name: "Supported effects",
        enemyCount: options.enemyCount ?? 1,
        ping: 0,
        steps: [{ type: "skill", skill: "Probe" }],
      },
      skills: {
        ...allSkillDefinitions,
        Probe: { castTime: 20, tags: options.tags ?? ["DirectDamage"], action: actions },
      },
      effectDefinitions,
      dots: {},
      eventDefinitions: {},
      setupEffects,
      weapons: [...weapons],
      maxHP: stats.maxHp,
      initialResources: { NobleWill: 0 },
      resourceMaximums: { NobleWill: 100 },
      innerWayConditions: [...innerWayConditionsFor(innerWays, undefined), ...setupConditionsFor(setupEffects)],
      innerWayRules: innerWayEffectRulesFor(innerWays, 21),
    },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    enemy: {
      name: "Target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: [...weapons],
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
  return calculateRotationBaseline(bundle)
}
const hit = (time: number) => ({ type: "damage", phyCoef: 1, attrCoef: 1, time })
const grant = (value: string) => ({ type: "apply", target: "self", value, time: 0 })

describe("Wings supported Inner Way effects", () => {
  it.each([undefined, 0])("applies Tailwind attack bonuses additively after Void conversion at Fan rank %s", rank => {
    const innerWays = [{ innerWay: "ZephyrWhispers", tier: "T6" }]
    const options = { rank, stats: { minSilkbind: 0, maxSilkbind: 0, minVoidAttack: 100, maxVoidAttack: 100 } }
    const action = { type: "damage", phyCoef: 0, attrCoef: 1, time: 1 }
    const plain = calculate(innerWays, [action], options).metrics.totalDamage
    const boosted = calculate(innerWays, [grant("Tailwind"), action], options).metrics.totalDamage
    expect(boosted / plain).toBeCloseTo(rank === undefined ? 1.06 : 1.12, 12)
  })

  it.each([undefined, 0])("buffs converted Void and native Silkbind equally with Fan rank %s", rank => {
    for (const tier of ["T5", "T6"] as const) {
      const innerWays = [{ innerWay: "ZephyrWhispers", tier }]
      const native = calculate(innerWays, [grant("Tailwind"), hit(1)], { rank }).metrics.totalDamage
      for (const voidAttack of [50, 100]) {
        const converted = calculate(innerWays, [grant("Tailwind"), hit(1)], {
          rank,
          stats: {
            minSilkbind: 100 - voidAttack,
            maxSilkbind: 100 - voidAttack,
            minVoidAttack: voidAttack,
            maxVoidAttack: voidAttack,
          },
        }).metrics.totalDamage
        expect(converted).toBeCloseTo(native, 9)
      }
    }
  })

  it.each([1, 2, 4])("applies Ink Rhyme after the final hit with %s targets", enemyCount => {
    const result = calculate([{ innerWay: "ZephyrWhispers", tier: "T4" }], [], {
      rotation: { name: "Ink timing", enemyCount, ping: 0, steps: [{ type: "skill", skill: "EndOfGale" }] },
    })
    const row = result.timeline.find(row => row.step.skill === "EndOfGale")!
    const hits = Object.entries(row.actionStates).filter(
      ([index, state]) => row.actions[Number(index)].type === "damage" && state.combatOrder !== undefined,
    )
    expect(hits).toHaveLength(2)
    for (const [, state] of hits) expect(state.debuffs.has("InkRhyme")).toBe(false)
    // Check the live state through a later cast, separately from the applying hit snapshots.
    const observed = calculate([{ innerWay: "ZephyrWhispers", tier: "T4" }], [], {
      rotation: {
        name: "Ink expiry",
        enemyCount,
        ping: 0,
        steps: [
          { type: "skill", skill: "EndOfGale" },
          { type: "skill", skill: "Probe" },
        ],
      },
    }).timeline.find(row => row.step.skill === "Probe")!
    expect(observed.debuffs.get("InkRhyme")!.expiresAt).toBeCloseTo(1.816 + 0.4 * (enemyCount - 1) + 18)
  })
  it.each(["WillowbendFan", "DrumSeries", "Heavy"])("limits T4 Ink Rhyme bonus to its skill scope (%s)", tag => {
    const actions = [{ type: "apply", target: "target", value: "InkRhyme", time: 0 }, hit(1)]
    const boosted = calculate([{ innerWay: "ZephyrWhispers", tier: "T4" }], actions, { tags: ["DirectDamage", tag] })
    const plain = calculate([{ innerWay: "ZephyrWhispers", tier: "T4" }], [hit(1)], { tags: ["DirectDamage", tag] })
    expect(boosted.metrics.totalDamage / plain.metrics.totalDamage).toBeCloseTo(tag === "Heavy" ? 1 : 1.1)
  })
  it.each([1, 2, 4])("limits 雅意 recovery to two target procs per 15s (%s targets)", enemyCount => {
    const result = calculate([{ innerWay: "ZephyrWhispers", tier: "T3" }], [], {
      rotation: {
        name: "Noble window",
        enemyCount,
        ping: 0,
        steps: [
          { type: "skill", skill: "EndOfGale" },
          { type: "skill", skill: "EndOfGale" },
          { type: "skill", skill: "Probe" },
        ],
      },
    })
    const procs = result.timeline.filter(row => row.step.skill === "ZephyrWhispersNobleRecovery")
    expect(procs).toHaveLength(2)
    expect(result.timeline.find(row => row.step.skill === "Probe")!.resources.NobleWill).toBe(60)
  })
  it.each([0, 1, 4, 6])("disables Envigorated Warrior for five seconds and recovers at T%s", tier => {
    const result = calculate(
      [{ innerWay: "EnvigoratedWarrior", tier: `T${tier}` }],
      [{ type: "takeDamage", time: 0, damage: 100 }, hit(1), hit(5)],
    )
    const row = result.timeline.find(row => row.step.skill === "Probe")!
    expect(row.actionStates[1].buffs.has("EnvigoratedDisabled")).toBe(true)
    expect(row.actionStates[2].buffs.has("EnvigoratedDisabled")).toBe(false)
    expect(result.actionBreakdowns[`${row.id}:2`].total).toBeGreaterThan(result.actionBreakdowns[`${row.id}:1`].total)
  })
  it("keeps the T6 Warrior bonus against its marked target", () => {
    const result = calculate(
      [{ innerWay: "EnvigoratedWarrior", tier: "T6" }],
      [hit(0), { type: "takeDamage", time: 1, damage: 100 }, hit(2)],
    )
    const row = result.timeline.find(row => row.step.skill === "Probe")!
    expect(row.actionStates[2].buffs.has("EnvigoratedDisabled")).toBe(false)
    expect(result.actionBreakdowns[`${row.id}:0`].total).toBe(result.actionBreakdowns[`${row.id}:2`].total)
  })
  it.each(["DirectDamage", "DrumSeries"])("uses replacement Xianmo T6 penetration for %s", tag => {
    const withWay = calculate([{ innerWay: "InkAndStrings", tier: "T6" }], [grant("Tailwind"), hit(1)], {
      tags: ["DirectDamage", "MuseflowWaistDrum", tag],
    })
    const penetration = tag === "DrumSeries" ? 20 : 8
    const expected = calculate([{ innerWay: "InkAndStrings", tier: "T5" }], [grant("Tailwind"), hit(1)], {
      tags: ["DirectDamage", "MuseflowWaistDrum", tag],
      stats: { physicalPenetration: penetration, formlessPenetration: penetration - 8 },
    })
    expect(withWay.metrics.totalDamage).toBeCloseTo(expected.metrics.totalDamage, 10)
    const t4 = calculate(
      [{ innerWay: "InkAndStrings", tier: "T4" }],
      [grant("Tailwind"), { type: "setHP", time: 0, currentHP: 5000 }, hit(1)],
    )
    const t3 = calculate(
      [{ innerWay: "InkAndStrings", tier: "T3" }],
      [grant("Tailwind"), { type: "setHP", time: 0, currentHP: 5000 }, hit(1)],
    )
    expect(t4.metrics.totalDamage).toBeGreaterThan(t3.metrics.totalDamage)
  })
  it("applies Cloudshear to flat skill damage as well as coefficient damage", () => {
    const actions = [{ type: "damage", phyCoef: 0, phyBonus: 1000, time: 1 }]
    const plain = calculate([], actions)
    const boosted = calculate([], [grant("Cloudshear"), ...actions])
    expect(boosted.metrics.totalDamage / plain.metrics.totalDamage).toBeCloseTo(1.06)
  })
  it("adds Cloudshear to each channel scale alongside existing channel bonuses", () => {
    const actions = [{ type: "damage", phyCoef: 1, attrCoef: 1, phyBonus: 100, attrBonus: 50, time: 1 }]
    const stats = { physDmgBonus: 0.2, silkbindDmgBonus: 0.2, allMartialArts: 0.3 }
    const options = { stats, tags: ["MartialArts", "DirectDamage"] }
    const plain = calculate([], actions, options)
    const boosted = calculate([], [grant("Cloudshear"), ...actions], options)
    expect(boosted.metrics.totalDamage / plain.metrics.totalDamage).toBeCloseTo(1.26 / 1.2, 10)
  })
  it("adds End of Gale T3 to Category 1 rather than its base ratio", () => {
    const rotation: RotationRecord = { name: "End of Gale", ping: 0, steps: [{ type: "skill", skill: "EndOfGale" }] }
    const stats = { allMartialArts: 0.2 }
    const plain = calculate([{ innerWay: "ZephyrWhispers", tier: "T2" }], [], { rotation, stats })
    const boosted = calculate([{ innerWay: "ZephyrWhispers", tier: "T3" }], [], { rotation, stats })
    expect(boosted.metrics.totalDamage / plain.metrics.totalDamage).toBeCloseTo(1.4 / 1.2, 10)
  })
  it.each(["T0", "T3", "T6"])("adds Blade of Grass to Category 1 at %s with existing hit eligibility", tier => {
    for (const [tags, eligible] of [
      [["Light", "VariedCombo", "DrumSeries"], true],
      [["Heavy", "VariedCombo", "DrumSeries"], true],
      [["Light", "DrumSeries"], false],
      [["VariedCombo", "DrumSeries"], false],
    ] as const) {
      const options = { tags: ["MartialArts", ...tags], stats: { allMartialArts: 0.2 } }
      const innerWays = [{ innerWay: "BladesWill", tier }]
      const actions = [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 1 }]
      const plain = calculate(innerWays, actions, options)
      const boosted = calculate(
        innerWays,
        [{ type: "apply", target: "target", value: "Cuncao", stack: 5, time: 0 }, ...actions],
        options,
      )
      let bonus = tier === "T6" ? 0.05 : 0
      if (eligible) {
        switch (tier) {
          case "T0":
            bonus = 0.1
            break
          case "T3":
            bonus = 0.2
            break
          case "T6":
            bonus = 0.25
            break
        }
      }
      expect(boosted.metrics.totalDamage / plain.metrics.totalDamage).toBeCloseTo((1.2 + bonus) / 1.2, 10)
    }
  })
  it("reduces incoming damage against an Ink Rhyme target at T4", () => {
    const result = calculate(
      [{ innerWay: "ZephyrWhispers", tier: "T4" }],
      [
        { type: "apply", target: "target", value: "InkRhyme", time: 0 },
        { type: "takeDamage", damage: 100, time: 1 },
        hit(2),
      ],
    )
    expect(result.timeline.find(row => row.step.skill === "Probe")!.actionStates[2].currentHP).toBe(9910)
  })
  it.each([0, 1, 3])("models Cage vulnerability and the T3 escape at T%s", tier => {
    const result = calculate(
      [{ innerWay: "EnvigoratedWarrior", tier: `T${tier}` }],
      [{ type: "takeDamage", damage: 100, time: 0 }, hit(0.5), { type: "takeDamage", damage: 100, time: 1 }, hit(2)],
    )
    const expected = tier === 0 ? 9795 : tier === 1 ? 9797 : 9800
    expect(result.timeline.find(row => row.step.skill === "Probe")!.actionStates[3].currentHP).toBe(expected)
  })
  it("adds Yi River stacks from healing, gates penetration at T1, and shares the T6 proc cooldown", () => {
    const heal = (time: number) => ({ type: "heal", phyCoef: 1, silkbindCoef: 1, time })
    const actions = [heal(0), heal(2), heal(4), heal(6), heal(8), hit(9), heal(10)]
    const result = calculate([{ innerWay: "MoraleChant", tier: "T6" }], actions)
    const procs = result.timeline.filter(
      row =>
        row.kind !== "damageGroup" && (row.step.skill === "MoraleChant" || row.step.skill === "MoraleChantHealing"),
    )
    expect(procs.map(row => row.step.skill)).toEqual(["MoraleChantHealing"])
    expect(result.metrics.totalHealing).toBeGreaterThan(calculate([], actions).metrics.totalHealing)
    const stacked = [grant("YiRiver"), hit(1)]
    expect(calculate([{ innerWay: "MoraleChant", tier: "T1" }], stacked).metrics.totalDamage).toBeGreaterThan(
      calculate([{ innerWay: "MoraleChant", tier: "T0" }], stacked).metrics.totalDamage,
    )
  })
  it("adds base Yi River to Category 1 for both physical and attribute damage before T1", () => {
    for (const action of [{ phyCoef: 1 }, { attrCoef: 1 }]) {
      const actions = [{ type: "damage", time: 1, ...action }]
      const options = { tags: ["MartialArts", "DirectDamage"], stats: { allMartialArts: 0.2 } }
      const plain = calculate([{ innerWay: "MoraleChant", tier: "T0" }], actions, options)
      const boosted = calculate([{ innerWay: "MoraleChant", tier: "T0" }], [grant("YiRiver"), ...actions], options)
      expect(boosted.metrics.totalDamage / plain.metrics.totalDamage).toBeCloseTo(1.21 / 1.2, 10)
    }
  })
  it.each(["RippleJadebreaker", "RippleDawnsun", "RippleFlourishingNotes"])(
    "applies %s equally on every supported PvE target",
    skill => {
      const damage = (["Dummy", "DummyAttack", "Boss"] as const).map(
        targetType =>
          calculate([], [], {
            rotation: { name: "PvE correction", targetType, ping: 0, steps: [{ type: "skill", skill }] },
          }).metrics.totalDamage,
      )
      expect(damage[0]).toBeGreaterThan(0)
      expect(damage[1]).toBeCloseTo(damage[0], 10)
      expect(damage[2]).toBeCloseTo(damage[0], 10)
    },
  )
  it("applies Harmony's cast reduction and Dawnsun shield state using existing effects", () => {
    const result = calculate(
      [{ innerWay: "HarmonySong", tier: "T6" }],
      [{ type: "takeDamage", damage: 100, time: 1 }, hit(2)],
      {
        rotation: {
          name: "Dawnsun defense",
          ping: 0,
          steps: [
            { type: "skill", skill: "VerdantGust" },
            { type: "skill", skill: "RippleDawnsun" },
            { type: "skill", skill: "Probe" },
          ],
        },
      },
    )
    const probe = result.timeline.find(row => row.step.skill === "Probe")!
    expect(probe.buffs.has("Shield")).toBe(true)
    expect(probe.actionStates[1].currentHP).toBe(9910)
  })
  it.each([
    [["Light", "VariedCombo"], true],
    [["Heavy", "VariedCombo"], true],
    [["Light"], false],
    [["Heavy"], false],
    [["VariedCombo"], false],
    [["RhythmOfAccord"], false],
    [["EndOfGale"], false],
    [["LightVariedCombo"], false],
    [["HeavyVariedCombo"], false],
  ] as const)("matches Blade's Will by category tags %j: %s", (tags, eligible) => {
    const result = calculate(
      [{ innerWay: "BladesWill", tier: "T6" }],
      [
        { type: "damage", phyCoef: 1, time: 0 },
        { type: "damage", phyCoef: 1, time: 1 },
      ],
      { tags: ["DirectDamage", ...tags], enemyCount: 3 },
    )
    const actions = result.timeline[0].actionStates
    expect(actions[1].debuffs.has("Cuncao")).toBe(eligible)
    const damageActions = [
      { type: "damage", phyCoef: 1, time: 0 },
      { type: "damage", phyCoef: 1, time: 1 },
    ]
    const options = { tags: ["DirectDamage", ...tags], enemyCount: 3 }
    const withStacks = calculate([{ innerWay: "BladesWill", tier: "T0" }], damageActions, options)
    const withoutStacks = calculate([], damageActions, options)
    expect(withStacks.metrics.totalDamage).toBeGreaterThanOrEqual(withoutStacks.metrics.totalDamage)
    expect(withStacks.metrics.totalDamage > withoutStacks.metrics.totalDamage).toBe(eligible)
  })
  it("excludes Drum Specials from Cuncao's eligible attack categories", () => {
    const result = calculate([{ innerWay: "BladesWill", tier: "T6" }], [], {
      rotation: {
        name: "Cuncao special",
        enemyCount: 3,
        ping: 0,
        steps: [
          { type: "skill", skill: "RippleJadebreaker" },
          { type: "skill", skill: "Probe" },
        ],
      },
    })
    expect(result.timeline.find(row => row.step.skill === "Probe")!.debuffs.has("Cuncao")).toBe(false)
  })
  it("retains lower-rank stat growth", () => {
    const run = (rank: number) =>
      calculate([], [], {
        rank,
        rotation: { name: "Talent rank", ping: 0, steps: [{ type: "skill", skill: "VerdantGust" }] },
      })
    expect(run(1).metrics.totalDamage).toBeGreaterThan(run(0).metrics.totalDamage)
  })
})
