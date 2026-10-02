import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, InnerWayEffectRule, TrackedEffect } from "@/calculations/rotationTimeline"

import buffs from "../data/buff/bamboocut-wind.json"
import debuffs from "../data/debuff/bamboocut-wind.json"
import echoes from "../data/innerway/echoes-of-oblivion.json"
import { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } from "../src/calculations/damage"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { emptyStats } from "../src/data/statDefinitions"
import type { WeaponId } from "../src/types"
import { asEffectDefinitions } from "./helpers/shippedData"

const weapons: WeaponId[] = ["infernalTwinblades", "mortalRopeDart"]
const stats = {
  ...emptyStats,
  minPhys: 1000,
  maxPhys: 1000,
  minBamboocut: 500,
  maxBamboocut: 500,
  precision: 0.95,
  crit: 0.4,
  affinity: 0.15,
  critDmgBonus: 0.5,
  affinityDmgBonus: 0.2,
}
const enemy = {
  name: "Karma test",
  level: 96,
  defense: 100,
  physicalResistance: 20,
  bellstrikeResistance: 20,
  stonesplitResistance: 20,
  silkbindResistance: 20,
  bamboocutResistance: 20,
  judgementResistance: 0.2,
}
/** A rule that only carries a trigger: the empty sheet the app's own builder gives it. */
const noEffect: EditableObject = {}

function entry(
  tier: number,
  resistance: number,
  karma = true,
  tags: string[] = ["DirectDamage", "InfernalTwinblades", "Light"],
) {
  const tiers = Object.values(echoes.effect).slice(0, tier + 1)
  const rules = tiers.flatMap((definition, index) =>
    ((definition as { effect?: Record<string, unknown>[] }).effect ?? [])
      .filter(effect => !effect.rawStat)
      .map<InnerWayEffectRule>(effect =>
        Object.assign({}, effect, {
          effect: (effect.effect as EditableObject | undefined) ?? effect,
          source: "EchoesOfOblivion",
          tier: index,
        }),
      )
      .concat(
        ((definition as { trigger?: Record<string, unknown>[] }).trigger ?? []).map<InnerWayEffectRule>(trigger => ({
          trigger,
          effect: noEffect,
          source: "EchoesOfOblivion",
          tier: index,
        })),
      ),
  )
  const result = calculateRotationBaseline({
    timeline: {
      rotation: { name: "Karma scope", ping: 0, steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: { castTime: 0.2, tags, action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 }] } },
      effectDefinitions: asEffectDefinitions({ ...buffs, ...debuffs }),
      dots: {},
      eventDefinitions: {},
      innerWayRules: rules,
      innerWayConditions: Object.keys(echoes.effect).slice(0, tier + 1),
      setupEffects: [],
      weapons,
      initialDebuffs: karma ? [{ name: "Karma", stack: 1 } satisfies TrackedEffect] : [],
    },
    stats,
    derivedStats: calculateDerivedStats(stats, enemy.judgementResistance, undefined, weapons),
    enemy: { ...enemy, bamboocutResistance: resistance },
    weapons,
    attunement: emptyAttunementStats,
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  })
  return result.baseline[0]
}

describe("Echoes Karma resistance ignore", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])(
    "ignores ten flat Bamboocut resistance at T%s without changing other channels or Judgment rates",
    tier => {
      for (const resistance of [5, 20, 60]) {
        const active = entry(tier, resistance)
        const plain = entry(tier, resistance, false)
        const reference = entry(tier, resistance - 10, false)
        const damage = calculateDamageBreakdown(active.action, active.context)
        const base = calculateDamageBreakdown(plain.action, plain.context)
        const expected = calculateDamageBreakdown(reference.action, reference.context)
        expect(damage.bamboocut).toBeCloseTo(expected.bamboocut, 9)
        expect(damage.bamboocut).toBeGreaterThan(base.bamboocut)
        for (const channel of ["physical", "bellstrike", "stonesplit", "silkbind"] as const)
          expect(damage[channel]).toBeCloseTo(base[channel], 9)
        expect(damage.outcomeRates).toEqual(base.outcomeRates)
        expect(active.context.enemy.judgementResistance).toBe(0.2)
        const sampled = calculateSimulatedDamageBreakdown(active.action, active.context, () => 0.5)
        const sampledReference = calculateSimulatedDamageBreakdown(reference.action, reference.context, () => 0.5)
        expect(sampled.total).toBeCloseTo(sampledReference.total, 9)
        expect(sampled.outcome).toBe(sampledReference.outcome)
      }
    },
  )

  it.each([
    ["DirectDamage", "InfernalTwinblades", "Heavy"],
    ["DirectDamage", "MortalRopeDart", "Light"],
    ["DirectDamage", "Mystic", "GhostlySteps", "DualBlades"],
    ["DirectDamage", "MortalRopeDart", "Rodent", "Triggered"],
  ])("does not apply Karma resistance ignore outside Twinblades Light Attacks (%s)", (...tags) => {
    const active = entry(6, 20, true, tags)
    const plain = entry(6, 20, false, tags)
    expect(calculateDamageBreakdown(active.action, active.context)).toEqual(
      calculateDamageBreakdown(plain.action, plain.context),
    )
  })
})
