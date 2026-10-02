import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type {
  RotationDamageEntry,
  RotationSimulationBaseline,
  RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import type { EditableObject, InnerWayEffectRule } from "@/calculations/rotationTimeline"

import { isClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"

// Ported from script/probe/check-damage-replay.mjs.
describe("damage-replay", () => {
  it("Damage-event replay checks passed", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { simulateRotation } = await import("../src/calculations/simulationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const closeTo = (actual: number | undefined, expected: number) => isClose(actual, expected, 1e-7)
    // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
    const noEffect: EditableObject = {}
    // Every resolved action carries the time it landed at; the replay windows compare against it.
    const timelineTimeOf = (entry: RotationDamageEntry) => {
      assert(typeof entry.timelineTime === "number", "A resolved damage action must carry its timeline time.")
      return entry.timelineTime
    }
    // A resolved action's id, which is how its breakdown is looked up.
    const at = (entry: RotationDamageEntry) => {
      assert(entry.id, "A resolved damage action must have an id.")
      return entry.id
    }
    // A resolved action's breakdown total, which every comparison here divides or sums.
    const totalOf = (result: RotationSimulationBaseline, entry: RotationDamageEntry) =>
      result.actionBreakdowns[at(entry)].total
    // A replay entry is the nested action a delayed trigger resolved.
    const replayOf = (entry: RotationDamageEntry) => {
      assert(entry.replay, "A replayed action must carry the replay it came from.")
      return entry.replay
    }
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Replay probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const replaySkill = {
      name: "Replay Probe",
      castTime: 0,
      action: [
        { type: "replay", coef: 0.1, time: 1 },
        { type: "replay", coef: 0.1, time: 2 },
        { type: "replay", coef: 0.2, time: 3 },
      ],
      modifier: [],
      tags: ["Triggered", "DOT", "Replayed"],
    }
    const skills = {
      ApplyHeavensMight: {
        name: "Apply Heaven's Might",
        castTime: 0,
        action: [{ type: "apply", target: "target", value: "HeavensMight", time: 0 }],
        modifier: [],
        tags: ["General"],
      },
      ChargedProbe: {
        name: "Charged Probe",
        castTime: 0.2,
        action: [
          { type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 },
          { type: "damage", phyCoef: 2, attrCoef: 2, time: 0.2 },
        ],
        modifier: [],
        tags: ["DirectDamage", "Charged"],
      },
      Wait: { name: "Wait", castTime: 18, action: [], modifier: [], tags: ["General"] },
      ReplayProbe: replaySkill,
    }
    const listenerRule: InnerWayEffectRule = {
      requirement: [
        { target: "skillTag", value: "Charged" },
        { target: "target", value: "HeavensMight" },
      ],
      listen: {
        event: "damage",
        cooldown: 18,
        requirement: [
          { target: "skillTag", value: "Charged" },
          { target: "target", value: "HeavensMight" },
        ],
        action: { type: "trigger", value: "ReplayProbe", parameter: { damage: "event.damage" } },
      },
      // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
      effect: noEffect,
      source: "ReplayProbeInnerWay",
      tier: 6,
    }
    const createBundle = (withHeavensMight = true): RotationSimulationBundle => {
      const timeline = {
        rotation: {
          name: "Damage replay probe",
          targetHP: 10000,
          steps: [
            ...(withHeavensMight ? [castStep("ApplyHeavensMight")] : []),
            castStep("ChargedProbe"),
            castStep("Wait"),
            castStep("ChargedProbe"),
            delayStep(5),
          ],
        },
        skills,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: { HeavensMight: { name: "Heaven's Might", duration: 100, maxStack: 1, refresh: true } },
        innerWayConditions: ["ReplayProbeInnerWayT6"],
        innerWayRules: [listenerRule],
        setupEffects: [],
        weapons: [],
      }
      return {
        timeline,
        startAnchor: { rowId: withHeavensMight ? "rotation-0" : "rotation-0" },
        stats,
        attunement: emptyAttunementStats,
        enemy,
        derivedStats: calculateDerivedStats(stats, 0),
        weapons: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }
    }

    const sourceDamage = (result: RotationSimulationBaseline, replay: RotationDamageEntry) => {
      const source = result.baseline
        .filter(entry => !entry.replay && entry.action.type === "damage")
        .find(
          entry =>
            (entry.timelineTime ?? 0) > timelineTimeOf(replay) - 4 &&
            (entry.timelineTime ?? 0) < timelineTimeOf(replay),
        )
      assert(source, "Every replay must have a source damage action in the preceding four seconds.")
      return totalOf(result, source)
    }
    const result = calculateRotationBaseline(createBundle())
    const healingBundle = createBundle()
    healingBundle.timeline.skills = {
      ...skills,
      ChargedProbe: {
        ...skills.ChargedProbe,
        action: [...skills.ChargedProbe.action, { type: "heal", phyBonus: 1, time: 0.2 }],
      },
    }
    const withHealing = calculateRotationBaseline(healingBundle)
    assert(
      closeTo(withHealing.metrics.totalDamage, result.metrics.totalDamage),
      "Live healing resolution must preserve captured source damage for every delayed replay.",
    )
    const normalEntries = result.baseline.filter(entry => !entry.replay)
    const replayEntries = result.baseline.filter(entry => entry.replay)
    assert(normalEntries.length === 4, "The probe must retain all four ordinary damage actions.")
    assert(
      replayEntries.length === 6,
      "The 18-second listener cooldown must allow only the first hit of each separated Charged cast to replay.",
    )
    const firstSource = totalOf(result, normalEntries[0])
    const firstReplayTotal = replayEntries.slice(0, 3).reduce((total, entry) => total + totalOf(result, entry), 0)
    assert(closeTo(firstReplayTotal, firstSource * 0.4), "Replay actions must deal exactly 40% of the source hit.")
    const firstCastDamage = totalOf(result, normalEntries[0]) + totalOf(result, normalEntries[1])
    assert(
      closeTo(normalEntries[2].context.targetHPRatio, 1 - (firstCastDamage + firstReplayTotal) / 10000),
      "Delayed replay ticks must reduce target HP before later ordinary damage is evaluated.",
    )
    assert(
      replayEntries.every(entry => {
        const breakdown = result.actionBreakdowns[at(entry)]
        return !breakdown.outcomeRates && breakdown.physical === breakdown.total
      }),
      "Replay damage must bypass outcomes and every normal damage channel calculation.",
    )
    assert(
      result.timeline.filter(row => row.step.type === "skill" && row.step.skill === "ReplayProbe").length === 2,
      "Each accepted damage event must spawn one visible replay-skill invocation.",
    )
    assert(closeTo(result.duration, 23.4), "The explicit trailing Delay, not replay ticks, defines combat duration.")
    const shortBundle = createBundle()
    shortBundle.timeline.rotation.steps.pop()
    const shortResult = calculateRotationBaseline(shortBundle)
    assert(closeTo(shortResult.duration, 18.4), "Without a trailing Delay combat ends at the final cast completion.")
    assert(
      shortResult.baseline.filter(entry => entry.replay).length === 3,
      "The final cast's delayed replays must be dropped after combat ends.",
    )

    const withoutDebuff = calculateRotationBaseline(createBundle(false))
    assert(
      withoutDebuff.baseline.every(entry => !entry.replay),
      "A Charged hit without Heaven's Might must not spawn replay damage.",
    )

    const draughtDebuffs = (await import("../data/debuff/bamboocut-draught.json")).default
    const { defaultGlobalDebuffs, globalDebuffTimelineEffects } = await import("../src/globalDebuffs.ts")
    for (const active of [[], ["Wildstride"], ["Strayhunt"], ["Wildstride", "Strayhunt"]]) {
      const bundle = createBundle()
      bundle.timeline.effectDefinitions = { ...bundle.timeline.effectDefinitions, ...draughtDebuffs }
      bundle.timeline.skills = {
        ...skills,
        ApplyHeavensMight: {
          ...skills.ApplyHeavensMight,
          action: [
            ...skills.ApplyHeavensMight.action,
            ...active.map(value => ({ type: "apply", target: "target", value, stack: 2, time: 0 })),
          ],
        },
      }
      // A normal bonus restricted to the replay skill must never enter its payout.
      bundle.timeline.setupEffects = [
        { requirement: [{ target: "skillTag", value: "Replayed" }], effect: { dmgBonus: 9, globalDmgBonus: 9 } },
      ]
      const actual = calculateRotationBaseline(bundle)
      for (const entry of actual.baseline.filter(entry => entry.replay)) {
        const source = sourceDamage(actual, entry)
        const enabled = active.length === 2 && timelineTimeOf(entry) < 20
        assert(
          closeTo(totalOf(actual, entry), source * replayOf(entry).coef * (enabled ? 1.2 : 1)),
          "Wildstride requires both debuffs at replay time, caps at one stack, and ignores normal multipliers.",
        )
      }
      const normal = actual.baseline.find(entry => !entry.replay)
      assert(normal, "The probe must resolve at least one ordinary damage action.")
      assert(
        closeTo(totalOf(actual, normal), firstSource * (active.includes("Strayhunt") ? 1.02 : 1)),
        "Wildstride must not amplify ordinary source damage.",
      )
      const sampled = simulateRotation(bundle, 2, () => 0.5)
      assert(
        sampled.runs.every(run => closeTo(run.totalDamage, actual.metrics.totalDamage)),
        "Expected and sampled replay payouts must share Wildstride resolution.",
      )
    }
    const globalBundle = createBundle()
    globalBundle.timeline.effectDefinitions = { ...globalBundle.timeline.effectDefinitions, ...draughtDebuffs }
    globalBundle.timeline.initialDebuffs = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, draught: "both" })
    const maintained = calculateRotationBaseline(globalBundle)
    for (const entry of maintained.baseline.filter(entry => entry.replay)) {
      const source = sourceDamage(maintained, entry)
      assert(
        closeTo(totalOf(maintained, entry), source * replayOf(entry).coef * 1.2),
        "Global Wildstride and Strayhunt remain active beyond their manual durations.",
      )
    }
    const simulation = simulateRotation(createBundle(), 3, () => 0.5)
    assert(
      simulation.runs.every(
        run =>
          run.normalPercentage === 100 &&
          run.abrasionPercentage + run.criticalPercentage + run.affinityPercentage === 0,
      ),
      "Replay payouts must count inside the damage total and be credited to normal, not drop the share.",
    )
  })
})
