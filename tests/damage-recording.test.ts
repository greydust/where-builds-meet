import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, InnerWayEffectRule, RotationStep } from "@/calculations/rotationTimeline"
import type { WeaponId } from "@/types"

import type {
  ResolvedRotationDamage,
  RotationDamageEntry,
  RotationSimulationBaseline,
  RotationSimulationBundle,
} from "../src/calculations/rotationCalculator.ts"
import { assertClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

// Ported from script/probe/check-damage-recording.mjs.
describe("damage-recording", () => {
  it("Rodent Hunt recording, reapply/expiry, boundary, cutoff, HP, and sampled-damage checks passed", async () => {
    const close = (actual: number | undefined, expected: number, message: string) =>
      assertClose(actual, expected, 1e-7, message)
    const mortal = asSkillRecords((await import("../data/skill/mortal-rope-dart.json")).default)
    const infernal = asSkillRecords((await import("../data/skill/infernal-twinblades.json")).default)
    const buffs = asEffectDefinitions((await import("../data/buff/bamboocut-wind.json")).default)
    const debuffs = asEffectDefinitions((await import("../data/debuff/bamboocut-wind.json")).default)
    const vendettaTiers = Object.entries((await import("../data/innerway/vendetta.json")).default.effect).sort(
      ([left], [right]) => Number(left.slice("VendettaT".length)) - Number(right.slice("VendettaT".length)),
    ) as Array<[string, { effect?: EditableObject[] }]>
    // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
    const noEffect: EditableObject = {}
    const { calculateRotationBaseline, calculateSimulatedRotationRun, calculateRotationComparisons } =
      await import("../src/calculations/rotationCalculator.ts")
    const { simulateRotation } = await import("../src/calculations/simulationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 300,
      minBamboocut: 80,
      maxBamboocut: 180,
      precision: 1,
      criticalRate: 0.4,
    }
    const weapons: WeaponId[] = ["mortalRopeDart", "infernalTwinblades"]
    const bundle = (steps: RotationStep[]): RotationSimulationBundle => ({
      timeline: {
        rotation: { name: "Rodent Hunt probe", targetHP: 100000, steps },
        skills: {
          ...mortal,
          ...infernal,
          Extend: {
            castTime: 0,
            action: [{ type: "extend", target: "target", value: "RodentHunt", duration: 10, time: 0 }],
          },
          Token: { castTime: 0, action: [{ type: "apply", target: "target", value: "VendettaToken", time: 0 }] },
        },
        effectDefinitions: { ...buffs, ...debuffs },
        dots: {},
        eventDefinitions: {},
        weapons,
        innerWayConditions: ["VendettaT3", "Flamelash", "EchoesOfOblivionT6"],
        innerWayRules: [0, 1].flatMap(tier =>
          (vendettaTiers[tier]?.[1].effect ?? []).map((effect): InnerWayEffectRule =>
            Object.assign({ effect: noEffect }, effect, { source: "Vendetta", tier }),
          ),
        ),
        setupEffects: [],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy: {
        name: "Recording target",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      weapons,
      attunement: emptyAttunementStats,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const at = (entry: RotationDamageEntry) => {
      assert(entry.id, "A resolved damage action must have an id.")
      return entry.id
    }
    const timeOf = (entry: RotationDamageEntry) => {
      assert(typeof entry.timelineTime === "number", "A resolved damage action must carry its timeline time.")
      return entry.timelineTime
    }
    const payouts = (result: RotationSimulationBaseline) => result.baseline.filter(entry => entry.replay)
    const rodents = (result: RotationSimulationBaseline) =>
      result.baseline.filter(entry => entry.context.skillTags.includes("Rodent"))
    const damage = (result: RotationSimulationBaseline, entries: RotationDamageEntry[]) =>
      entries.reduce((sum, entry) => sum + result.actionBreakdowns[at(entry)].total, 0)
    const recordedHits = (result: RotationSimulationBaseline, payout: RotationDamageEntry) => {
      const index = payouts(result).indexOf(payout)
      const previous = index > 0 ? payouts(result)[index - 1] : undefined
      const start = previous ? timeOf(previous) : -Infinity
      return rodents(result).filter(hit => timeOf(hit) >= start && timeOf(hit) < timeOf(payout))
    }
    const checkPayouts = (result: RotationSimulationBaseline) => {
      for (const entry of payouts(result)) {
        const expected = damage(result, recordedHits(result, entry)) * 0.3
        const breakdown = result.actionBreakdowns[at(entry)]
        close(breakdown.total, expected, "Payout copies the final damage of recorded hits")
        assert.equal(breakdown.outcomeRates, undefined, "Payout cannot roll a new outcome")
      }
    }
    const steps = [
      castStep("BladeboundThreadCancel"),
      castStep("RodentRampage"),
      castStep("InfernalLight1"),
      castStep("InfernalFlamelashLight5"),
      // Land a direct Rodent after Hunt expires at 20.385s.
      // Its delayed hit lands after Rampage expiry, outside the recording window.
      delayStep(17.5),
      castStep("Rodent"),
      delayStep(0.5),
    ]
    const result = calculateRotationBaseline(bundle(steps))
    assert.equal(payouts(result).length, 1, "Expiry settles one window")
    assert.equal(
      recordedHits(result, payouts(result)[0]).length,
      4,
      "One ordinary Rodent plus all three FA5 Rodents are recorded",
    )
    close(payouts(result)[0].timelineTime, 20.385, "Hunt uses its base 20-second window without a T4 duration modifier")
    checkPayouts(result)
    assert.equal(rodents(result).length, 5, "A later Rodent still attacks but is outside the recording window")
    const enhanced = calculateRotationBaseline(
      bundle([
        castStep("BladeboundThreadCancel"),
        castStep("RodentsResilienceCharge"),
        castStep("RodentRampage"),
        delayStep(20),
      ]),
    )
    assert.equal(rodents(enhanced).length, 15, "Vendetta ERR supplies fifteen automatic Rodents")
    assert.equal(
      recordedHits(enhanced, payouts(enhanced)[0]).length,
      15,
      "The 20-second Hunt records all fifteen automatic Rodents",
    )
    checkPayouts(enhanced)
    assert.ok(damage(enhanced, rodents(enhanced)) > 0, "Automatic Rodents contribute calculated damage")
    const later = result.baseline.find(entry => at(entry) === "rotation-5:0")
    assert(later, "The baseline must record the anchored hit.")
    const earlier = result.baseline.filter(entry => timeOf(entry) < timeOf(later))
    close(
      later.context.targetHPRatio,
      1 - damage(result, earlier) / 100000,
      "Settlement reduces HP before a subsequent hit",
    )

    const comparisonBundle = bundle(steps)
    const higherStats = { ...stats, minPhys: 200, maxPhys: 500 }
    comparisonBundle.statPriority = [{ label: "Higher attack", stats: higherStats }]
    const comparison = calculateRotationComparisons(comparisonBundle, result)
    const higherBundle = bundle(steps)
    higherBundle.stats = higherStats
    higherBundle.derivedStats = calculateDerivedStats(higherStats, 0)
    const higher = calculateRotationBaseline(higherBundle)
    close(
      comparison.statPriority[0].dpsDifference,
      higher.metrics.dps - result.metrics.dps,
      "Stat comparisons recalculate both source damage and the recording payout",
    )
    assert.ok(
      damage(higher, payouts(higher)) > damage(result, payouts(result)),
      "Payout increases with variant source damage",
    )

    const reapply = calculateRotationBaseline(
      bundle([
        castStep("BladeboundThreadCancel"),
        castStep("Rodent"),
        castStep("BladeboundThreadCancel"),
        castStep("Rodent"),
        delayStep(20),
      ]),
    )
    assert.equal(payouts(reapply).length, 2, "Reapply settles old hits and expiry settles new hits once")
    close(payouts(reapply)[0].timelineTime, 8.385, "Reapplication settles immediately")
    close(payouts(reapply)[1].timelineTime, 28.385, "Old expiry does not settle the replacement window")
    assert.deepEqual(
      payouts(reapply).map(entry => recordedHits(reapply, entry).length),
      [1, 1],
    )
    checkPayouts(reapply)

    const boundary = calculateRotationBaseline(
      bundle([
        castStep("BladeboundThreadCancel"),
        castStep("Rodent"),
        delayStep(19.615),
        castStep("BladeboundThreadCancel"),
        castStep("Rodent"),
        delayStep(21),
      ]),
    )
    assert.equal(payouts(boundary).length, 2, "Same-time expiry and reapplication settle each activation once")
    close(payouts(boundary)[0].timelineTime, 20.385, "Old activation settles at the boundary")
    close(payouts(boundary)[1].timelineTime, 40.385, "New activation retains its full window")
    checkPayouts(boundary)
    const exact = calculateRotationBaseline(
      bundle([
        castStep("BladeboundThreadCancel"),
        castStep("Rodent"),
        delayStep(19.5),
        castStep("Rodent"),
        delayStep(1),
      ]),
    )
    assert.equal(
      recordedHits(exact, payouts(exact)[0]).length,
      1,
      "Hit at the exclusive expiration boundary is not recorded",
    )
    checkPayouts(exact)
    const fixed = calculateRotationBaseline(
      bundle([
        castStep("BladeboundThreadCancel"),
        castStep("Rodent"),
        delayStep(5),
        castStep("Extend"),
        castStep("Token"),
        delayStep(21),
      ]),
    )
    close(payouts(fixed)[0].timelineTime, 20.385, "Extension and Token refresh do not delay settlement")
    assert.equal(
      payouts(calculateRotationBaseline(bundle([castStep("BladeboundThreadCancel"), delayStep(21)]))).length,
      0,
      "Empty window emits no damage",
    )
    const zeroBundle = bundle([castStep("BladeboundThreadCancel"), castStep("Rodent"), delayStep(21)])
    zeroBundle.timeline.skills.Rodent = {
      castTime: 0,
      tags: ["Rodent"],
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, time: 0 }],
    }
    const zero = calculateRotationBaseline(zeroBundle)
    assert.equal(payouts(zero).length, 1, "Matched zero-damage hits still settle")
    close(damage(zero, payouts(zero)), 0, "Zero source damage produces a zero payout")
    const short = calculateRotationBaseline(
      bundle([castStep("BladeboundThreadCancel"), castStep("Rodent"), delayStep(1)]),
    )
    assert.equal(payouts(short).length, 0, "Recording does not extend combat")
    close(short.duration, 1.385, "Combat ends at the final explicit Delay")
    const ended = bundle([
      castStep("BladeboundThreadCancel"),
      castStep("Rodent"),
      { type: "event", event: "BattleEnd", startTime: 20.385 },
    ])
    ended.timeline.eventDefinitions.BattleEnd = { name: "Battle End", action: [] }
    assert.equal(
      payouts(calculateRotationBaseline(ended)).length,
      0,
      "Battle End excludes a settlement at its timestamp",
    )
    // A prepull cast cannot put Hunt on the target, so the anchoring cast is the
    // one that opens the window. The Rodents it then records still pay out, and
    // the anchor must not change the settled amount.
    const anchoredSteps = [
      castStep("Rodent"),
      delayStep(5),
      castStep("Rodent"),
      castStep("BladeboundThreadCancel"),
      castStep("Rodent"),
      delayStep(21),
    ]
    const precombat = bundle(anchoredSteps)
    precombat.startAnchor = { rowId: "rotation-3" }
    const anchored = calculateRotationBaseline(precombat)
    const full = calculateRotationBaseline(bundle(anchoredSteps))
    assert.equal(payouts(anchored).length, 1, "A Hunt opened at the anchor still settles one window")
    assert.equal(
      recordedHits(anchored, payouts(anchored)[0]).length,
      2,
      "Hunt records the Rodent at the anchor and the one after it",
    )
    close(
      damage(anchored, payouts(anchored)),
      damage(full, payouts(full)),
      "Payout is unchanged by where the fight is anchored",
    )
    const resolvedPayoutTotal = (run: { resolvedSequence: ResolvedRotationDamage[] }) => {
      const payout = run.resolvedSequence.find(item => item.entry.replay)
      assert(payout, "The sampled run must resolve at least one payout.")
      return payout.breakdown.total
    }
    const precombatSample = calculateSimulatedRotationRun(precombat, () => 0.7)
    const fullSample = calculateSimulatedRotationRun(bundle(anchoredSteps), () => 0.7)
    close(
      resolvedPayoutTotal(precombatSample),
      resolvedPayoutTotal(fullSample),
      "Sampled payout retains its source hits",
    )
    const disabled = bundle(steps)
    disabled.timeline.innerWayConditions = []
    assert.equal(payouts(calculateRotationBaseline(disabled)).length, 0, "Tiers below T3 do not record")

    for (const roll of [0.1, 0.9]) {
      const sampled = calculateSimulatedRotationRun(bundle(steps), () => roll)
      const settlements = sampled.resolvedSequence.filter(item => item.entry.replay)
      assert.equal(settlements.length, 1)
      for (const { entry, breakdown } of settlements)
        close(
          breakdown.total,
          sampled.resolvedSequence
            .filter(item => item.entry.context.skillTags.includes("Rodent") && timeOf(item.entry) < timeOf(entry))
            .reduce((sum, item) => sum + item.breakdown.total, 0) * 0.3,
          "Sampled payout uses this run's source outcomes",
        )
      const total = sampled.resolvedSequence.reduce((sum, item) => sum + item.breakdown.total, 0)
      close(
        simulateRotation(bundle(steps), 1, () => roll).runs[0].totalDamage,
        total,
        "Public simulation uses the same chronological recording calculation",
      )
    }
  })
})
