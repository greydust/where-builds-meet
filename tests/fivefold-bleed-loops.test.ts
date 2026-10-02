import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type {
  EditableObject,
  EffectDefinition,
  InnerWayEffectRule,
  SkillRecord,
  TimelineBuildInput,
  RotationStep,
  TimelineRow,
} from "@/calculations/rotationTimeline"

import { assertClose } from "./helpers/floatEquality"
import { actionNumber } from "./helpers/timelineRows"

// Ported from script/probe/check-fivefold-bleed-loops.mjs.
describe("fivefold-bleed-loops", () => {
  it("fivefold-bleed-loops checks", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { innerWayDefinitionForSoloLevel } = await import("../src/data/innerWayDefinitions.ts")
    const way = innerWayDefinitionForSoloLevel((await import("../data/innerway/fivefold-bleed.json")).default, 17)
    const dots = (await import("../data/dot/innerway.json")).default as Record<string, SkillRecord & EffectDefinition>
    const { PiercingDamage } = (await import("../data/skill/general.json")).default
    // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
    const noEffect: EditableObject = {}
    const rules = (tier: number): InnerWayEffectRule[] =>
      Array.from({ length: tier + 1 }, (_, index) => {
        const definition = way.effect[`FivefoldBleedT${index}`]
        return (definition.effect ?? [])
          .map((effect): InnerWayEffectRule =>
            Object.assign({}, effect, {
              effect: (effect.effect ?? effect) as EditableObject,
              source: "FivefoldBleed",
              tier: index,
            }),
          )
          .concat(
            (definition.trigger ?? []).map((trigger): InnerWayEffectRule => ({
              trigger,
              effect: noEffect,
              source: "FivefoldBleed",
              tier: index,
            })),
          )
      }).flat()
    const inputFor = (times: number[], end = 12, tier = 6): TimelineBuildInput => ({
      rotation: {
        name: "Feedback",
        steps: [
          { type: "skill", skill: "Hits" },
          ...(end === undefined ? [] : [{ type: "event", event: "BattleEnd", startTime: end } satisfies RotationStep]),
        ],
      },
      skills: {
        PiercingDamage,
        Hits: {
          name: "Hits",
          castTime: 30,
          tags: ["DirectDamage"],
          action: times.map(time => ({ type: "damage", phyCoef: 1, time })),
        },
      },
      dots,
      effectDefinitions: dots,
      eventDefinitions: { BattleEnd: { name: "Battle End", action: [], tags: ["Event"] } },
      innerWayRules: rules(tier),
      innerWayConditions: Array.from({ length: tier + 1 }, (_, index) => `FivefoldBleedT${index}`),
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    })
    const tickRows = (rows: TimelineRow[]) => rows.filter(row => row.kind === "dot")
    const bursts = (rows: TimelineRow[]) => rows.filter(row => row.step.skill === "PiercingDamage")
    const close = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-8, message)
    const input = inputFor(Array(5).fill(0))
    const allSuccess = buildRotationTimeline(input, () => 0)
    assert.deepEqual(
      bursts(allSuccess).map(row => row.startTime),
      [0, 5, 10],
    )
    assert.ok(
      tickRows(allSuccess).every(
        row =>
          row.actions[0].damageScale === 1 &&
          row.actionStates[0].debuffs.get("WeepingBlood")?.stack === (row.startTime < 5 ? 2 : 1),
      ),
      "Only the threshold burst gets a T6 stack; every burst retains the independent Direct Damage roll",
    )
    const failPiercingApplication = (key: string) =>
      key.includes(":PiercingDamage:") && key.includes(":innerWay:WeepingBlood:") ? 0.99 : 0
    const onlyGuaranteed = buildRotationTimeline(input, failPiercingApplication)
    assert.ok(
      tickRows(onlyGuaranteed).every(row => row.actions[0].damageScale === 1),
      "Failed optional rolls retain the guaranteed T6 stack",
    )
    assert.deepEqual(
      bursts(onlyGuaranteed).map(row => row.startTime),
      [0, 5],
    )
    assert.ok(
      tickRows(onlyGuaranteed).every(row => row.startTime < 5),
      "An expiration burst with a failed Direct Damage roll does not reapply a T6 stack",
    )
    const expirationOnly = buildRotationTimeline(inputFor([0]), failPiercingApplication)
    assert.deepEqual(
      bursts(expirationOnly).map(row => row.startTime),
      [5],
    )
    assert.ok(
      tickRows(expirationOnly).every(row => row.startTime < 5),
      "T6 does not guarantee a stack on an initial natural-expiration burst either",
    )
    assert.ok(
      bursts(onlyGuaranteed).every(row => !row.debuffs.has("WeepingBlood")),
      "The burst deals damage before applying its new stack",
    )
    const tier5 = buildRotationTimeline(inputFor(Array(5).fill(0), 12, 5), () => 0)
    assert.ok(
      tickRows(tier5).every(row => row.actions[0].damageScale === 1),
      "Piercing Damage has its Direct Damage proc even below T6",
    )
    assert.ok(
      allSuccess.every(row => row.startTime <= 12),
      "Feedback cannot pass Battle End",
    )

    const noEnd = inputFor([0])
    noEnd.rotation.steps = [{ type: "skill", skill: "Hits" }]
    const bounded = buildRotationTimeline(noEnd, () => 0)
    assert.deepEqual(
      bursts(bounded).map(row => row.startTime),
      [5, 10, 15, 20, 25, 30],
      "Without Battle End, feedback runs through final cast completion but not afterward",
    )
    assert.ok(tickRows(bounded).every(row => row.startTime <= 30))
    const dummy = inputFor([0, 14])
    dummy.rotation.steps = [
      { type: "skill", skill: "Hits" },
      { type: "event", event: "Delay", duration: 50 },
    ]
    dummy.rotation.targetType = "DummyAttack"
    dummy.eventDefinitions.Delay = { name: "Delay", action: [], tags: ["Event"] }
    const dummyRows = buildRotationTimeline(dummy)
    assert.deepEqual(
      dummyRows
        .filter(
          row =>
            row.kind === "rotation" &&
            row.step.type === "event" &&
            row.step.event === "TakeDamage" &&
            "automatic" in row.step &&
            row.step.automatic === "targetAttack",
        )
        .map(row => row.startTime),
      Array.from({ length: 13 }, (_, i) => 5.5 + i * 6).flatMap(time => [time, time]),
      "Dummy attacks continue through the explicit trailing Delay, stopping at ordered completion",
    )

    // Explore the concrete random decision tree, including decisions caused by
    // earlier procs. This independently checks correlation and expiration renewal.
    const verifyProbabilityHistories = (input: TimelineBuildInput) => {
      const oracle = new Map<string, { hits: number; damage: number }>()
      const explore = (decisions: boolean[], mass: number) => {
        let index = 0
        let rows: TimelineRow[]
        try {
          rows = buildRotationTimeline(input, key => {
            if (index === decisions.length)
              throw { decisionChance: key.includes(":trigger:PiercingDamage") ? 0.2 : 0.15 }
            return decisions[index++] ? 0 : 0.99
          })
        } catch (thrown) {
          // The probe throws the chance it drew on, so the tree can branch on both outcomes.
          const { decisionChance } = thrown as { decisionChance?: number }
          if (decisionChance === undefined) throw thrown
          explore([...decisions, false], mass * (1 - decisionChance))
          explore([...decisions, true], mass * decisionChance)
          return
        }
        for (const row of rows) {
          if (row.kind !== "dot" && row.step.skill !== "PiercingDamage") continue
          const key = `${row.step.skill}:${Math.round(row.startTime * 10000)}`
          const entry = oracle.get(key) ?? { hits: 0, damage: 0 }
          entry.hits += mass
          // An action with no damage scale is unscaled, which is what the oracle counts.
          entry.damage += mass * Number(row.actions[0]?.damageScale ?? 1)
          oracle.set(key, entry)
        }
      }
      explore([], 1)
      const expected = new Map<string, { hits: number; damage: number }>()
      const exactDots = structuredClone(input.dots ?? {}) as Record<string, SkillRecord & EffectDefinition>
      const weepingBlood = exactDots.WeepingBlood
      assert(weepingBlood?.periodic, "Weeping Blood must declare its tick cadence.")
      delete weepingBlood.periodic.expectedTickAlignment
      for (const row of buildRotationTimeline({ ...input, dots: exactDots, effectDefinitions: exactDots })) {
        if (row.kind !== "dot" && row.step.skill !== "PiercingDamage") continue
        const key = `${row.step.skill}:${Math.round(row.startTime * 10000)}`
        const entry = expected.get(key) ?? { hits: 0, damage: 0 }
        entry.hits += actionNumber(row, "hitProbability")
        entry.damage += actionNumber(row, "damageScale")
        expected.set(key, entry)
      }
      assert.equal(expected.size, oracle.size)
      for (const [key, result] of oracle) {
        const wanted = expected.get(key)
        assert(wanted, `Every explored branch must appear in the exact history for ${key}.`)
        close(wanted.hits, result.hits, `${key} correlated hit probability`)
        close(wanted.damage, result.damage, `${key} correlated tick damage`)
      }
      const gridBursts = new Map<string, number>()
      for (const row of bursts(buildRotationTimeline(input))) {
        const key = `${row.step.skill}:${Math.round(row.startTime * 10000)}`
        gridBursts.set(key, (gridBursts.get(key) ?? 0) + actionNumber(row, "damageScale"))
      }
      const oracleBursts = [...oracle].filter(([key]) => key.startsWith("PiercingDamage:"))
      assert.equal(gridBursts.size, oracleBursts.length)
      for (const [key, result] of oracleBursts) {
        const gridBurst = gridBursts.get(key)
        assert(gridBurst !== undefined, `Every explored burst must appear on the battle grid for ${key}.`)
        close(gridBurst, result.damage, `${key} battle-grid burst probability remains exact`)
      }
    }
    verifyProbabilityHistories(input)
    verifyProbabilityHistories(inputFor([0, 4, 5, 6], 12))
  })
})
