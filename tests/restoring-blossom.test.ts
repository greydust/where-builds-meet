import sets from "@gamedata/gear-set.json"
import delugeRotation from "@gamedata/rotation/silkbind-deluge/dummy-1-min-wts-team.json"
import { describe, expect, it } from "vitest"

import { innerWayEffectRulesFor } from "@/application/characterComposition"
import { buildPresetRotationBundle } from "@/application/graduation"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  calculateRotationBaseline,
  calculateRotationSimulation,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { effectForSoloLevel } from "@/data/soloLevelEffects"
import { emptyStats } from "@/data/statDefinitions"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

import { asEffectDefinitions } from "./helpers/shippedData"

function bundle(tier = 4, times = [0.1, 1, 2], groupSize: 1 | 5 | 10 = 1): RotationSimulationBundle {
  return {
    timeline: {
      rotation: { name: "Restoring Blossom", ping: 0, groupSize, steps: [{ type: "skill", skill: "Heal" }] },
      skills: {
        Heal: {
          castTime: Math.max(...times) + 1,
          group: true,
          action: times.map(time => ({ type: "heal", phyCoef: 1, time })),
        },
      },
      setupEffects: [],
      effectDefinitions: {},
      eventDefinitions: {},
      dots: {},
      innerWayRules: innerWayEffectRulesFor([{ innerWay: "RestoringBlossom", tier: `T${tier}` }], 17, "silkbindDeluge"),
      innerWayConditions: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      maxHP: 10000,
    },
    startAnchor: { rowId: "rotation-0" },
    stats: { ...emptyStats, minPhys: 100, maxPhys: 100, maxHp: 10000, crit: 0.8, directCrit: 0.2 },
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
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    attunement: emptyAttunementStats,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}

function heals(input: RotationSimulationBundle) {
  return Object.values(calculateRotationBaseline(input).actionBreakdowns).filter(value => value.healing)
}

describe("Restoring Blossom", () => {
  it("applies Nurturing after the triggering heal, caps it, and expires exactly at the deadline", () => {
    const actual = heals(bundle(0, [0.1, 1, 2, 3, 4, 10]))
    expect(actual.map(value => value.healing!.total)).toEqual([100, 102, 104, 106, 106, 100])
    expect(actual[0].expectedBuffStacks!.RestoringBlossomNurturing).toBe(0)
    expect(actual[4].expectedBuffStacks!.RestoringBlossomNurturing).toBe(3)
  })

  it("extends the refreshed duration to ten seconds at T1", () => {
    expect(heals(bundle(0, [0.1, 7]))[1].healing!.total).toBe(100)
    expect(heals(bundle(1, [0.1, 7]))[1].healing!.total).toBe(102)
  })

  it("adds Concentration to existing outgoing bonuses, then multiplies received healing", () => {
    const input = bundle(3)
    input.timeline.setupEffects = [{ healingBonus: 0.2 }]
    const actual = heals(input)
    expect(actual[0].healing!.total).toBeCloseTo(120, 12)
    expect(actual[1].healing!.total).toBeCloseTo(100 * 1.22 * 1.02, 12)
    expect(actual[2].healing!.total).toBeCloseTo(100 * 1.24 * 1.04, 12)
  })

  it.each([3, 4])("caps both stack types at the selected tier T%s and refreshes at the cap", tier => {
    const actual = heals(bundle(tier, [0.1, 1, 2, 3, 4, 5, 6, 15, 25]))
    const cap = tier === 3 ? 3 : 6
    expect(actual[7].expectedBuffStacks!.RestoringBlossomConcentration).toBe(cap)
    expect(actual[7].expectedBuffStacks!.RestoringBlossomNurturing).toBe(cap)
    expect(actual[7].healing!.total).toBeCloseTo(100 * (1 + cap * 0.02) ** 2, 12)
    expect(actual[8].healing!.total).toBeCloseTo(100, 12)
  })

  it("preserves the expected product of correlated incoming and outgoing stacks", () => {
    const input = bundle()
    input.stats.crit = 0.3
    const actual = heals(input)
    expect(actual[1].healing!.total).toBeCloseTo(100 * (0.5 + 0.5 * 1.02 ** 2), 12)
    expect(actual[2].healing!.total).toBeCloseTo(100 * (0.25 + 0.5 * 1.02 ** 2 + 0.25 * 1.04 ** 2), 12)
  })

  it("keeps per-recipient Nurturing separate while every critical recipient grants Concentration", () => {
    const input = bundle(4, [0.1, 1], 5)
    input.stats.crit = 0.3
    const actual = heals(input)
    expect(actual[1].expectedBuffStacks!.RestoringBlossomConcentration).toBeCloseTo(2.5, 12)
    expect(actual[1].expectedBuffStacks!.RestoringBlossomNurturing).toBeCloseTo(0.5, 12)
    // E[C]=2.5, E[N]=0.5, E[CN]=1.5 (one recipient's critical contributes to both).
    expect(actual[1].healing!.total).toBeCloseTo(500 * (1 + 0.02 * 2.5 + 0.02 * 0.5 + 0.0004 * 1.5), 12)
  })

  it("samples critical recipients individually and does not apply their new stacks retroactively", () => {
    const input = bundle(4, [0.1, 1], 5)
    input.stats.crit = 0.3
    let rolls = 0
    const result = calculateSimulatedRotationRun(input, () => (rolls++ === 2 ? 0.1 : 0.5))
    const actual = result.resolvedSequence.filter(value => value.breakdown.healing)
    expect(actual[0].breakdown.recipientHealing![1].outcome).toBe("critical")
    expect(actual[0].breakdown.healing!.total).toBeCloseTo(500, 12)
    expect(actual[1].expectedBuffStacks!.RestoringBlossomConcentration).toBe(1)
    expect(actual[1].expectedBuffStacks!.RestoringBlossomNurturing).toBe(0)
    actual[1].breakdown.recipientHealing!.forEach((value, index) =>
      expect(value.total).toBeCloseTo(index === 1 ? 104.04 : 102, 12),
    )
  })

  it.each([0.299, 0.3])("checks T6 against pre-heal Self HP (%s), while omitting ally low-HP procs", ratio => {
    const input = bundle(6, [0.1, 1], 5)
    input.timeline.skills.Heal.action!.unshift({ type: "takeDamage", damage: 10000 * (1 - ratio), time: 0 })
    const actual = heals(input)
    const selfStacks = ratio < 0.3 ? 3 : 1
    const casterStacks = Math.min(6, selfStacks + 4)
    expect(actual[1].expectedBuffStacks!.RestoringBlossomNurturing).toBe(selfStacks)
    expect(actual[1].expectedBuffStacks!.RestoringBlossomConcentration).toBe(casterStacks)
    const criticalMultiplier = 1.04 // Existing T5 raw-stat bonus.
    expect(actual[1].recipientHealing![0].total).toBeCloseTo(
      100 * criticalMultiplier * (1 + casterStacks * 0.02) * (1 + selfStacks * 0.02),
      10,
    )
    expect(actual[1].recipientHealing![1].total).toBeCloseTo(
      100 * criticalMultiplier * (1 + casterStacks * 0.02) * 1.02,
      10,
    )
  })

  it("does not grant stacks on normal heals", () => {
    const input = bundle()
    input.stats.crit = 0
    input.stats.directCrit = 0
    expect(heals(input).map(value => value.healing!.total)).toEqual([100, 100, 100])
  })

  it("credits player-target HOT stacks only to the assigned recipient", () => {
    const input = bundle(4, [1], 5)
    input.timeline.skills.Heal.action!.unshift(
      { type: "apply", target: "player", value: "PlayerHeal", time: 0.1 },
      { type: "apply", target: "player", value: "PlayerHeal", time: 0.1 },
    )
    input.timeline.effectDefinitions = asEffectDefinitions({
      PlayerHeal: {
        duration: 0.1,
        maxStack: 1,
        refresh: true,
        periodic: { interval: 1, firstTick: 0, action: [{ type: "heal", phyCoef: 1 }] },
      },
    })
    const result = calculateRotationBaseline(input)
    const groupHeal = result.actionBreakdowns["rotation-0:2"]
    expect(groupHeal.expectedBuffStacks!.RestoringBlossomConcentration).toBe(2)
    const expected = [106.08, 106.08, 104, 104, 104]
    groupHeal.recipientHealing!.forEach((value, index) => expect(value.total).toBeCloseTo(expected[index], 12))
  })

  it("feeds increased healing into live World to Sword collectors in a full ten-player Deluge rotation", () => {
    const input = buildPresetRotationBundle(
      {
        pathId: "silkbindDeluge",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: { ...(delugeRotation as RotationRecord), groupSize: 10, ping: 40 },
        breakthrough: "19",
        food: "SimmeringFishSlices",
        divinecraft: "Fire",
        script: "None",
        globalDebuffs: defaultGlobalDebuffs,
        skillOverrides: {},
        previewId: null,
      },
      "deluge-full-max-ib",
    )!
    const baseline = calculateRotationBaseline(input)
    input.timeline.innerWayRules.push(
      ...innerWayEffectRulesFor([{ innerWay: "RestoringBlossom", tier: "T6" }], 19, "silkbindDeluge"),
    )
    const actual = calculateRotationBaseline(input)
    expect(actual.duration).toBeCloseTo(60, 0)
    expect(actual.metrics.hps).toBeGreaterThan(baseline.metrics.hps)
    expect(actual.metrics.totalDamage).toBeGreaterThanOrEqual(baseline.metrics.totalDamage)
    expect(
      Object.values(actual.actionBreakdowns).some(
        value => (value.expectedBuffStacks?.RestoringBlossomConcentration ?? 0) > 5.9,
      ),
    ).toBe(true)
  })

  it("rebuilds comparisons with the candidate's own critical chances and selected Inner Ways", () => {
    const input = bundle()
    const weaker = { ...input.stats, crit: 0.3 }
    input.statPriority = [{ label: "Less critical", stats: weaker }]
    input.innerWayPriority = [{ label: "Without Blossom", innerWayRules: [] }]
    const actual = calculateRotationSimulation(input)
    const candidate = calculateRotationBaseline({ ...input, stats: weaker, statPriority: [], innerWayPriority: [] })
    const without = calculateRotationBaseline({
      ...input,
      timeline: { ...input.timeline, innerWayRules: [] },
      statPriority: [],
      innerWayPriority: [],
    })
    expect(actual.metrics.statPriority[0].hpsDifference).toBeCloseTo(candidate.metrics.hps - actual.metrics.hps, 10)
    expect(actual.metrics.innerWayPriority[0].hpsDifference).toBeCloseTo(without.metrics.hps - actual.metrics.hps, 10)
  })

  it("matches enumerated critical outcomes with Ivorybloom retention, refresh, and expiry", () => {
    const input = bundle(4, [0.1, 1, 4.1, 12])
    input.stats.crit = 0.3
    input.stats.criticalHealingBonus = 0.5
    input.timeline.skills.Heal.action!.unshift({ type: "takeDamage", damage: 9000, time: 0 })
    input.timeline.setupEffects = sets.Ivorybloom.options["4"].effect.map(effect =>
      effectForSoloLevel(effect, 17, "Ivorybloom"),
    )
    const actual = heals(input)
    const totals = [0, 0, 0, 0]
    // Enumerate all 16 sampled critical histories, keeping fluctuation exactly one.
    for (let mask = 0; mask < 16; mask++) {
      let calls = 0
      const sample = calculateSimulatedRotationRun(input, () => {
        const call = calls++
        if (call % 2) return 0.5
        return mask & (1 << (call / 2)) ? 0 : 0.999
      }).resolvedSequence.filter(value => value.breakdown.healing)
      let weight = 1
      sample.forEach((value, index) => {
        const chance = value.breakdown.recipientHealing![0].criticalRate!
        const critical = Boolean(mask & (1 << index))
        weight *= critical ? chance : 1 - chance
      })
      sample.forEach((value, index) => {
        totals[index] += weight * value.breakdown.healing!.total
      })
    }
    actual.forEach((value, index) => expect(value.healing!.total).toBeCloseTo(totals[index], 10))
  })
})
