import buffs from "@gamedata/buff/bellstrike-bolt.json"
import moon from "@gamedata/innerway/yue-yong-fang-yuan.json"
import { expect, it } from "vitest"

import { OutcomeMachine, type OutcomeMachineDefinition } from "@/calculations/outcomeMachine"
import { effectsForTrackedEffect, requirementsPass, type EffectDefinition } from "@/calculations/rotationTimeline"

const definitions = Object.values(moon.effect).flatMap(tier =>
  "effect" in tier
    ? tier.effect.flatMap(effect =>
        "effect" in effect && "outcomeMachine" in effect.effect
          ? [effect.effect.outcomeMachine as OutcomeMachineDefinition]
          : [],
      )
    : [],
)
const effects = (name: string, stack: number) =>
  effectsForTrackedEffect(stack, (buffs as Record<string, EffectDefinition>)[name]) as Record<string, unknown>[]
function harness(chance: number | (() => number) = 1, sampled = false) {
  const machine = new OutcomeMachine(definitions, sampled)
  const hit = (time: number, tags = ["DirectDamage"], token?: string, outcome = "affinity") => {
    machine.advance(time)
    return machine.settle(
      time,
      "source",
      requirement => requirementsPass(requirement, new Map(), new Map(), tags, new Set()),
      effects,
      () => (typeof chance === "function" ? chance() : chance),
      sampled ? outcome : undefined,
      token,
    )
  }
  return { machine, hit }
}

it("retains native first-delay and refresh cadence in sampled combat", () => {
  const { machine, hit } = harness(1, true)
  for (let index = 0; index < 4; index++) expect(hit(index * 0.1)).toBe(0)
  expect(hit(0.4)).toBe(0.05)
  expect(machine.drainEmissions()).toEqual([])
  // The pre-hit listener requires four existing Dark stacks and excludes the proc tag.
  for (let index = 5; index < 9; index++) hit(index * 0.1)
  expect(machine.drainEmissions()).toEqual([])
  hit(0.9)
  const burst = machine.drainEmissions()
  expect(burst.map(item => item.skill)).toEqual(["BoltMoonBurst"])
  hit(0.9, ["DirectDamage", "MoonDamage"], burst[0].token)
  expect(machine.drainEmissions()).toEqual([])
  expect(machine.nextTime()).toBe(1.9)
  hit(1)
  expect(machine.nextTime()).toBe(1.9)
  machine.advance(1.9)
  expect(machine.drainEmissions().map(item => item.skill)).toEqual(["BoltMoonTide"])
})

const pullProbability = (machine: OutcomeMachine) =>
  machine
    .distribution(effects)
    .reduce((sum, state) => sum + (state.effects.some(effect => effect.hpDMGBonus === 0.05) ? state.probability : 0), 0)

it("extends active Moon Pull by expected Affinity without branching its expiry", () => {
  let chance = 1
  const { machine, hit } = harness(() => chance)
  for (let index = 0; index < 5; index++) hit(index * 0.1)
  chance = 0.25
  hit(1)
  // Initial expiry 5.4 plus 2 × 0.25 = 5.9, with all active mass sharing the deadline.
  machine.advance(5.89)
  expect(pullProbability(machine)).toBe(1)
  machine.advance(5.9)
  expect(pullProbability(machine)).toBe(0)
})

it.each([0, 0.1])("allows Moon Pull to expire on sparse hits at Affinity %s", chanceAfterActivation => {
  let chance = 1
  const { machine, hit } = harness(() => chance)
  for (let index = 0; index < 5; index++) hit(index * 0.1)
  chance = chanceAfterActivation
  hit(1)
  hit(6)
  expect(pullProbability(machine)).toBe(0)
})

it("does not extend Moon Pull from DOTs or fractionalize sampled extensions", () => {
  const expected = harness()
  for (let index = 0; index < 5; index++) expected.hit(index * 0.1)
  expected.hit(1, ["DOT"])
  expected.machine.advance(5.4)
  expect(pullProbability(expected.machine)).toBe(0)

  for (const outcome of ["normal", "affinity"]) {
    const sampled = harness(0.25, true)
    for (let index = 0; index < 5; index++) sampled.hit(index * 0.1)
    sampled.hit(1, undefined, undefined, outcome)
    sampled.machine.advance(5.4)
    expect(pullProbability(sampled.machine)).toBe(Number(outcome === "affinity"))
    sampled.machine.advance(7.4)
    expect(pullProbability(sampled.machine)).toBe(0)
  }
})

it("promotes a rare phase tail without losing probability and applies its conversion HP cost", () => {
  const { machine, hit } = harness(1e-6)
  expect(hit(0)).toBeCloseTo(0.05 * 1e-6, 14)
  expect(pullProbability(machine)).toBeCloseTo(1e-6, 14)
  expect(machine.distribution(effects).reduce((sum, state) => sum + state.probability, 0)).toBeCloseTo(1, 14)
  machine.advance(5)
  expect(pullProbability(machine)).toBe(0)
})

it("uses aggregate phase-stack probability rather than the size of individual histories", () => {
  const gated = structuredClone(definitions)
  for (const definition of gated)
    if (definition.expectedStackPromotion)
      definition.expectedStackPromotion.requires!.push({ cell: "TestEnable", minimum: 1 })
  const machine = new OutcomeMachine([
    ...gated,
    {
      cells: { TestCoin: { duration: -1 }, TestEnable: { duration: -1 } },
      rules: {
        coin: {
          order: 100,
          outcome: "affinity",
          requirement: [{ target: "skillTag", value: "Coin" }],
          operations: [{ type: "add", cell: "TestCoin" }],
        },
        enable: {
          order: 100,
          requirement: [{ target: "skillTag", value: "Enable" }],
          operations: [{ type: "add", cell: "TestEnable" }],
        },
      },
    },
  ])
  const hit = (time: number, tags: string[], chance: number) => {
    machine.advance(time)
    machine.settle(
      time,
      "source",
      requirement => requirementsPass(requirement, new Map(), new Map(), tags, new Set()),
      effects,
      () => chance,
    )
  }
  hit(0, ["DirectDamage"], 1.2e-5)
  hit(0.1, ["Coin"], 0.5)
  // Two distinct one-stack histories each carry 6e-6, but their total exceeds the cutoff.
  hit(0.2, ["Enable"], 0)
  expect(pullProbability(machine)).toBe(0)
  const phase = machine.distribution(effects).find(state => state.effects.some(effect => effect.hpDMGBonus === 0.01))
  expect(phase?.probability).toBeCloseTo(1.2e-5, 14)
})

it("retains chance mass and applies phase damage only after its triggering hit", () => {
  const { machine, hit } = harness(0.5)
  expect(machine.distribution(effects)).toEqual([{ probability: 1, effects: [] }])
  hit(0)
  const distribution = machine.distribution(effects)
  expect(distribution.reduce((sum, state) => sum + state.probability, 0)).toBeCloseTo(1, 14)
  expect(distribution.find(state => state.effects.length)?.probability).toBe(0.5)
  machine.advance(5)
  expect(machine.distribution(effects)).toEqual([{ probability: 1, effects: [] }])
})

it("adds a repeat burst after ten real tide contacts without replacing the tenth tick", () => {
  const { machine, hit } = harness(1, true)
  for (let index = 0; index < 10; index++) hit(index * 0.1)
  for (const burst of machine.drainEmissions()) hit(0.9, ["DirectDamage", "MoonDamage"], burst.token)
  for (let index = 0; index < 9; index++) {
    hit(1 + index * 0.01, ["DOT", "MoonDamage", "MoonTide"])
    expect(machine.drainEmissions()).toEqual([])
  }
  hit(1.1, ["DOT", "MoonDamage", "MoonTide"])
  expect(machine.drainEmissions().map(item => item.skill)).toEqual(["BoltMoonBurst"])
})

it("uses one battle-aligned expected tick with only the active probability mass", () => {
  const machine = new OutcomeMachine([
    {
      cells: {
        carrier: {
          duration: 2.5,
          periodic: { skill: "Tick", firstDelay: 1, interval: 1, expectedTickAlignment: "battle" },
        },
      },
      rules: {
        apply: {
          order: 0,
          outcome: "affinity",
          read: "before",
          requires: [{ cell: "carrier", maximum: 0 }],
          operations: [{ type: "add", cell: "carrier" }],
        },
      },
    },
  ])
  machine.startBattle(10)
  const hit = (time: number, token?: string) => {
    machine.advance(time)
    machine.settle(
      time,
      "source",
      () => true,
      () => [],
      () => 0.5,
      undefined,
      token,
    )
  }
  hit(10.2)
  hit(10.6)
  expect(machine.nextTime()).toBe(11)
  hit(11)
  const first = machine.drainEmissions()
  expect(first).toHaveLength(1)
  expect(first[0].probability).toBe(0.75)
  expect(machine.nextTime()).toBe(12)
  // The newly activated 0.125 mass at t=11 waits until t=12.
  machine.advance(12)
  expect(machine.drainEmissions()[0].probability).toBe(0.875)
  machine.advance(13)
  expect(machine.drainEmissions()[0].probability).toBe(0.375)
})

it("caps Moon Pull extensions and restores the full chain through the surviving mark", () => {
  const { machine, hit } = harness()
  for (let index = 0; index <= 10; index++) hit(index * 0.1)
  // The extension cap is fifteen seconds remaining at the last contact (t = 1).
  machine.advance(15.99)
  expect(machine.distribution(effects)[0].effects).toContainEqual({ hpDMGBonus: 0.05, stat: { directAffinity: 0.015 } })
  machine.advance(16)
  expect(machine.distribution(effects)[0].effects).toEqual([])
  // 潮信 outlives 暗潮; an affinity contact restores five stacks and a fresh carrier.
  expect(hit(16)).toBe(0)
  expect(machine.nextTime()).toBe(17)
  expect(machine.distribution(effects)[0].effects).toContainEqual({ stat: { directAffinity: 0.015 } })
})
