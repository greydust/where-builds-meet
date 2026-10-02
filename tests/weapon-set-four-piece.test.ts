import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EffectDefinition, EditableObject, RotationStep, SkillRecord } from "@/calculations/rotationTimeline"
import { weaponSetDefinitions } from "@/gear"
import type { CharacterStats, WeaponId } from "@/types"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader"
import { castStep, delayStep } from "./helpers/rotationSteps"
import { rowCasting } from "./helpers/timelineRows"
const close = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-8, message)

describe("weapon-set-four-piece", () => {
  it("checks conditional set behavior and simulation", async () => {
    const load = async <T>(path: string): Promise<T> => (await probeLoad<{ default: T }>(path)).default
    const sets = weaponSetDefinitions
    const general = await load<Record<string, SkillRecord>>("/data/skill/general.json")
    const generalBuffs = await load<Record<string, EffectDefinition>>("/data/buff/general.json")
    const strengthBuffs = await load<Record<string, EffectDefinition>>("/data/buff/stonesplit-strength.json")
    const { calculateRotationBaseline, calculateSimulatedRotationRun } = await probeLoad<
      typeof import("../src/calculations/rotationCalculator")
    >("/src/calculations/rotationCalculator.ts")
    const { buildRotationTimeline } = await probeLoad<typeof import("../src/calculations/rotationTimeline")>(
      "/src/calculations/rotationTimeline.ts",
    )
    const { calculateStatsWithEffects } = await probeLoad<typeof import("../src/calculations/statEffects")>(
      "/src/calculations/statEffects.ts",
    )
    const { calculateDerivedStats } = await probeLoad<typeof import("../src/calculations/effectiveStats")>(
      "/src/calculations/effectiveStats.ts",
    )
    const { emptyStats } = await probeLoad<typeof import("../src/data/statDefinitions")>("/src/data/statDefinitions.ts")
    const weapons: WeaponId[] = ["infernalTwinblades", "mortalRopeDart"]
    const baseStats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 200,
      minBamboocut: 100,
      maxBamboocut: 100,
      precision: 1,
      maxHp: 1000,
      criticalHealingBonus: 0.5,
    }
    const enemy = {
      name: "Set probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    type BundleOptions = {
      tags?: string[]
      prep?: EditableObject[]
      action?: EditableObject
      steps?: RotationStep[]
      stats?: Partial<CharacterStats>
      castTime?: number
    }
    const effectsFor = (name: string, tier: number) => {
      const value = sets[name].options[tier].effect
      return Array.isArray(value) ? value : [value]
    }
    const bundle = (
      name: string,
      tier: number,
      {
        tags = ["DirectDamage"],
        prep = [],
        action = { type: "damage", phyCoef: 1, attrCoef: 1 },
        steps = [castStep("Probe")],
        stats: override = {},
        castTime = 1,
      }: BundleOptions = {},
    ): RotationSimulationBundle => {
      const setupEffects = effectsFor(name, tier)
      const stats = calculateStatsWithEffects({ ...baseStats, ...override }, setupEffects, 0).stats
      return {
        timeline: {
          rotation: { name: "Four-piece probe", steps },
          skills: {
            ...general,
            Probe: { name: "Probe", castTime, action: [...prep, { ...action, time: castTime }], tags },
          },
          effectDefinitions: {
            ...generalBuffs,
            ...strengthBuffs,
            BoneCorrosion: { duration: 10, maxStack: 1 },
            QiImbalance: { duration: 10, maxStack: 1 },
          },
          dots: {},
          eventDefinitions: { TakeDamage: { action: [{ type: "takeDamage", time: 0 }] } },
          weapons,
          innerWayConditions: setupEffects.flatMap(effect => (effect.condition ? [effect.condition] : [])),
          innerWayRules: [],
          setupEffects,
          maxHP: stats.maxHp,
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons,
        attunement: emptyAttunementStats,
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }
    }
    const run = (name: string, tier: number, options?: BundleOptions): RotationSimulationBaseline =>
      calculateRotationBaseline(bundle(name, tier, options))
    const damage = (result: RotationSimulationBaseline) => {
      const last = Object.values(result.actionBreakdowns).at(-1)
      assert(last, "A rotation that cast must have an action breakdown.")
      return last
    }
    const hp = (ratio: number): EditableObject => ({ type: "setTargetHP", targetHPRatio: ratio, time: 0 })
    const qi = (ratio: number): EditableObject => ({ type: "setQi", targetQiRatio: ratio, time: 0 })
    const debuff = (value: string): EditableObject => ({ type: "apply", target: "target", value, time: 0 })
    for (const [ratio, bonus] of [
      [0.5, 0],
      [0.5001, 0.05],
      [0.5499, 0.05],
      [0.55, 0.06],
      [0.6, 0.07],
      [0.65, 0.08],
      [0.7, 0.09],
      [0.7499, 0.09],
      [0.75, 0.1],
      [1, 0.1],
    ]) {
      const options: BundleOptions = { prep: [hp(ratio)] }
      close(
        damage(run("SwayingHeights", 4, options)).total / damage(run("SwayingHeights", 2, options)).total,
        1 + bonus,
        `Swaying Heights at ${ratio * 100}% HP`,
      )
    }
    for (const tags of [
      ["DirectDamage", "Light"],
      ["DirectDamage", "Rodent"],
      ["DirectDamage", "Light", "Rodent"],
      ["DirectDamage", "Heavy"],
      ["DirectDamage", "MartialArt"],
    ]) {
      const matches = tags.includes("Light") || tags.includes("Rodent")
      for (const [prep, lowQi] of [
        [[qi(0.4)], false],
        [[qi(0.3999)], true],
        [[qi(0.8), debuff("BoneCorrosion")], true],
        [[qi(0.8), debuff("QiImbalance")], true],
        [[qi(0.3999), debuff("BoneCorrosion"), debuff("QiImbalance")], true],
      ] as Array<[EditableObject[], boolean]>) {
        const options: BundleOptions = { tags, prep }
        const before = damage(run("Swallowcall", 2, options))
        const after = damage(run("Swallowcall", 4, options))
        const multiplier = matches ? 1.12 * (lowQi ? 1.06 : 1) : 1
        close(after.physical / before.physical, multiplier, "Swallowcall Physical channel and eligibility")
        close(after.bamboocut / before.bamboocut, multiplier, "Swallowcall Bamboocut channel and eligibility")
      }
    }
    const crossing = {
      tags: ["DirectDamage", "Light"],
      prep: [qi(0.39), { type: "damage", phyCoef: 1, time: 0.2 }, { ...qi(0.4), time: 0.5 }],
      action: { type: "damage", phyCoef: 1 },
    }
    const before = run("Swallowcall", 2, crossing).actionBreakdowns
    const after = run("Swallowcall", 4, crossing).actionBreakdowns
    close(
      after["rotation-0:1"].total / before["rotation-0:1"].total,
      1.12 * 1.06,
      "Low-Qi bonus applies before state change",
    )
    close(after["rotation-0:3"].total / before["rotation-0:3"].total, 1.12, "Low-Qi bonus stops at exactly 40%")
    for (const shield of [false, true]) {
      const options = {
        tags: ["Heal"],
        stats: { crit: 0.5 },
        action: { type: "heal", phyCoef: 1 },
        prep: shield ? [{ type: "apply", target: "self", value: "Shield", time: 0 }] : [],
      }
      const before = run("RainWhisper", 2, options).metrics.totalHealing
      const after = run("RainWhisper", 4, options).metrics.totalHealing
      close(
        after / before,
        (1 + 0.5 * (shield ? 0.75 : 0.6)) / 1.25,
        "Rain Whisper adds critical healing with the shield condition",
      )
      close(
        run("RainWhisper", 4, { ...options, stats: { crit: 0 } }).metrics.totalHealing,
        run("RainWhisper", 2, { ...options, stats: { crit: 0 } }).metrics.totalHealing,
        "Rain Whisper does not boost noncritical healing",
      )
    }
    const deflectOptions: BundleOptions = {
      steps: [
        castStep("DeflectSuccessful"),
        castStep("Probe"),
        { type: "event", event: "TakeDamage", startTime: 0.1, damage: 200 },
      ],
    }
    for (const roll of [undefined, () => 0.5]) {
      const selected = buildRotationTimeline(bundle("Cleftpeak", 4, deflectOptions).timeline, roll)
      const hit = rowCasting(selected, "Probe").actionStates[0]
      const deflectBuff = hit.buffs.get("Cleftpeak")
      assert(deflectBuff, "A successful Deflect must apply the set buff.")
      assert.equal(deflectBuff.stack, 5, "Successful Deflect immediately grants five stacks")
      for (const [tier, skill] of [
        [2, "DeflectSuccessful"],
        [4, "Deflect"],
      ] as Array<[number, string]>) {
        const rows = buildRotationTimeline(
          bundle("Cleftpeak", tier, { steps: [castStep(skill), castStep("Probe")] }).timeline,
          roll,
        )
        assert.ok(
          !rowCasting(rows, "Probe").actionStates[0].buffs.has("Cleftpeak"),
          "Ordinary Deflect and two-piece selection grant no stacks before damage",
        )
      }
      const expired = buildRotationTimeline(
        bundle("Cleftpeak", 4, {
          steps: [
            castStep("DeflectSuccessful"),
            delayStep(5),
            castStep("Probe"),
            { type: "event", event: "TakeDamage", startTime: 0.1, damage: 200 },
          ],
        }).timeline,
        roll,
      )
      assert.ok(
        !rowCasting(expired, "Probe").actionStates[0].buffs.has("Cleftpeak"),
        "Deflect stacks expire after five seconds",
      )
    }
    for (const [tag, bonus] of [
      ["SnowpartingBlade", 0.13],
      ["ThundercryBlade", 0.13],
      ["VernalUmbrella", 0.13],
      ["HeavenwillGauntlets", 0.05],
    ] as Array<[string, number]>) {
      const options: BundleOptions = { ...deflectOptions, tags: ["DirectDamage", "Light", "VariedCombo", tag] }
      close(
        damage(run("Cleftpeak", 4, options)).total / damage(run("Cleftpeak", 2, options)).total,
        1 + bonus,
        "Cleftpeak varied-combo bonus is limited to the named martial arts",
      )
    }
    const simulatedOptions: BundleOptions = { tags: ["DirectDamage", "Light"], prep: [qi(0.39)] }
    const finalSampledTotal = (tier: number) => {
      const last = sampled(tier).resolvedSequence.at(-1)
      assert(last, "A sampled run must resolve at least one action.")
      return last.breakdown.total
    }
    const sampled = (tier: number) =>
      calculateSimulatedRotationRun(bundle("Swallowcall", tier, simulatedOptions), () => 0.5)
    close(
      finalSampledTotal(4) / finalSampledTotal(2),
      1.12 * 1.06,
      "Simulation applies the same Swallowcall multipliers",
    )
    console.log(
      "Weapon four-piece checks passed: HP/Qi boundaries, damage channels, critical healing, Deflect selection/expiry, martial-art scope, and simulation.",
    )
  })
})
