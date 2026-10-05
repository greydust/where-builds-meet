import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EffectiveStatEffectContainer, StatEffectContainer } from "@/calculations/statEffects"
import type { EnemyProfile } from "@/types"

import { probeLoad } from "./helpers/probe-loader.js"
import { asTalentEffects, type TalentEffect } from "./helpers/shippedData"

/** The timeline row a simulated damage entry was dealt on. */
function rowIdOf(entryId: string | undefined) {
  assert(entryId, "Every simulated damage entry must carry the timeline row it was dealt on.")
  return entryId
}

// Ported from script/probe/check-stat-stages.mjs.
describe("stat-stages", () => {
  it("preserves source and dependent overrides across baseline changes and comparison deltas", async () => {
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { calculateStatsWithEffects, calculateStatsWithOverrides } =
      await import("../src/calculations/statEffects.ts")
    const baselineEffects = [{ stat: { agility: 20, minPhys: { formula: { source: "agility", multiplier: 0.9 } } } }]
    const locked = calculateStatsWithOverrides(emptyStats, baselineEffects, 0, { agility: 100, minPhys: 150 })
    assert(
      Math.abs(locked.stats.agility - 100) < 1e-9,
      "A modified source stat must resolve to its requested final value.",
    )
    assert(Math.abs(locked.stats.minPhys - 150) < 1e-9, "A modified dependent stat must resolve after formula effects.")

    const changedBaseline = calculateStatsWithOverrides(
      emptyStats,
      [{ stat: { agility: 30, minPhys: { formula: { source: "agility", multiplier: 0.9 } } } }],
      0,
      { agility: 100, minPhys: 150 },
    )
    assert(
      Math.abs(changedBaseline.stats.agility - 100) < 1e-9 && Math.abs(changedBaseline.stats.minPhys - 150) < 1e-9,
      "Baseline input changes must not move modified stats.",
    )

    const comparison = calculateStatsWithEffects(
      locked.baseStats,
      [{ stat: { agility: 30, minPhys: { formula: { source: "agility", multiplier: 0.9 } } } }],
      0,
    )
    assert(
      Math.abs(comparison.stats.agility - 110) < 1e-9,
      "Comparison variants must still apply their stat delta to a modified stat.",
    )
    assert(
      Math.abs(comparison.stats.minPhys - 159) < 1e-9,
      "Comparison variants must preserve dependent formula deltas.",
    )
  })

  it("Stat stages passed: raw talent inputs, order independence, food retention, global baseline, expiration, caps, overrides, cache reuse, comparison deltas, healing and actual Kite talents", async () => {
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { calculateStatsWithEffects, calculateStatsWithOverrides, calculateActionStats } = await probeLoad<
      typeof import("../src/calculations/statEffects")
    >("/src/calculations/statEffects.ts")
    const { calculateRotationBaseline, calculateRotationComparisons } = await probeLoad<
      typeof import("../src/calculations/rotationCalculator")
    >("/src/calculations/rotationCalculator.ts")
    const { resolveActionStatContext } = await import("../src/calculations/actionStats.ts")
    const { calculateHealingAttackSnapshot } = await import("../src/calculations/healing.ts")
    const food: StatEffectContainer & EffectiveStatEffectContainer = {
      effectiveStat: { minPhys: 120, maxPhys: 240 },
      statStage: "food",
    }
    const talent: StatEffectContainer = {
      statStage: "talent",
      stat: { minPhys: { formula: { source: "minPhys", multiplier: 0.1 } } },
    }
    const base = { ...emptyStats, minPhys: 1000, maxPhys: 2000, precision: 1 }
    const rawBonus: StatEffectContainer = { rawStat: { minPhys: 100 } }
    const rawFirst = calculateStatsWithEffects(base, [talent, food, rawBonus], 0, [])
    assert.equal(rawFirst.rawStats.minPhys, 1100)
    assert.equal(rawFirst.stats.minPhys, 1210, "Raw bonus feeds the talent without food changing ordinary stats")
    assert.equal(rawFirst.stats.effectiveMinPhys, 1330)
    assert.deepEqual(rawFirst, calculateStatsWithEffects(base, [rawBonus, food, talent], 0, []))
    const lateBonus = calculateStatsWithEffects(base, [talent, { stat: { minPhys: 100 } }], 0, [])
    assert.equal(lateBonus.rawStats.minPhys, 1000, "Ordinary stat additions do not enter rawStats")
    assert.equal(lateBonus.stats.minPhys, 1200, "Later stat additions do not feed talent formulas")
    const sheet = calculateStatsWithEffects(base, [talent, food], 0, [])
    assert.equal(sheet.rawStats.minPhys, 1000)
    assert.equal(sheet.stats.minPhys, 1100)
    assert.equal(sheet.stats.maxPhys, 2000)
    assert.equal(sheet.stats.effectiveMinPhys, 1220)
    assert.equal(sheet.stats.effectiveMaxPhys, 2240)
    assert.equal(sheet.stats, sheet.derivedStats, "Derived fields live in the same object")
    assert.deepEqual(sheet, calculateStatsWithEffects(base, [food, talent], 0, []))
    const invertedBase = { ...base, minPhys: 2000, maxPhys: 1900 }
    const invertedSheet = calculateStatsWithEffects(invertedBase, [food], 0, [])
    assert.equal(invertedSheet.stats.minPhys, 2000)
    assert.equal(invertedSheet.stats.maxPhys, 1900)
    assert.equal(invertedSheet.stats.effectiveMinPhys, 2120)
    assert.equal(invertedSheet.stats.effectiveMaxPhys, 2140, "Food is added before min/max normalization")
    const effectiveFormula = { effectiveStat: { minPhys: { formula: { source: "minPhys", multiplier: 0.1 } } } }
    const combinedEffective = calculateStatsWithEffects(invertedBase, [food, effectiveFormula], 0, [])
    assert.equal(combinedEffective.stats.effectiveMinPhys, 2320, "Effective formulas read ordinary stats")
    assert.equal(combinedEffective.stats.effectiveMaxPhys, 2320, "All effective entries precede normalization")
    assert.deepEqual(combinedEffective, calculateStatsWithEffects(invertedBase, [effectiveFormula, food], 0, []))
    const enemy: EnemyProfile = {
      name: "Stat stage probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const restored = calculateActionStats(structuredClone(invertedSheet.stats), [], 0, [])
    assert.deepEqual(restored, invertedSheet.stats, "Worker cloning and later derivation preserve effective inputs")
    const raisedMinimum = calculateActionStats(restored, [{ stat: { minPhys: 100 } }], 0, [])
    assert.equal(raisedMinimum.minPhys, 2100)
    assert.equal(raisedMinimum.maxPhys, 1900)
    assert.equal(raisedMinimum.effectiveMaxPhys, 2220)
    const raisedMaximum = calculateActionStats(raisedMinimum, [{ effectiveStat: { maxPhys: 50 } }], 0, [])
    assert.equal(
      raisedMaximum.effectiveMaxPhys,
      2220,
      "Re-derivation uses uncapped inputs, not the previous 2220 maximum",
    )
    assert.equal(
      calculateHealingAttackSnapshot({
        stats: restored,
        attunement: emptyAttunementStats,
        skillTags: [],
        derivedStats: restored,
        weapons: [],
        buffs: [],
        effects: [],
        enemy,
      }).averagePhysicalAttack,
      2130,
    )
    const twoTalents = calculateStatsWithEffects(base, [talent, talent], 0, [])
    assert.equal(twoTalents.stats.minPhys, 1200, "Both talents must read raw 1000, not each other's output")
    const capped = calculateStatsWithEffects({ ...base, directCrit: 0.25 }, [], 0, [])
    assert.equal(capped.rawStats.directCrit, 0.25)
    assert.equal(capped.stats.directCrit, 0.2)
    assert.equal(calculateActionStats(capped.stats, [{ stat: { directCrit: -0.02 } }], 0, []).directCrit, 0.2)
    assert.equal(calculateActionStats(capped.stats, [{ stat: { directCrit: -0.1 } }], 0, []).directCrit, 0.15)
    const override = calculateStatsWithOverrides(base, [talent, food], 0, { minPhys: 1500 }, [])
    assert.ok(Math.abs(override.stats.minPhys - 1500) < 1e-5, "Stored final-value overrides remain honored")
    assert.ok(Math.abs(override.stats.effectiveMinPhys - 1620) < 1e-5, "Food remains above an ordinary stat override")
    const definitions = {
      Global: { duration: 5, maxStack: 1, effect: [{ effect: { stat: { minPhys: 50, maxPhys: 50 } } }] },
      Temporary: {
        duration: 0.5,
        maxStack: 1,
        effect: [{ effect: { effectiveStat: { minPhys: 100, maxPhys: 100 } } }],
      },
    }
    const setupEffects = [
      food,
      { requirement: [{ target: "skillTag", value: "Charged" }], stat: { minPhys: 10, maxPhys: 10 } },
    ]
    const plainSheet = calculateStatsWithEffects(base, [food], 0, [])
    const bundle: RotationSimulationBundle = {
      stats: plainSheet.stats,
      rawStats: plainSheet.rawStats,
      baseStats: base,
      derivedStats: plainSheet.stats,
      enemy,
      weapons: [],
      attunement: emptyAttunementStats,
      startAnchor: { rowId: "rotation-0" },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
      timeline: {
        rotation: { name: "Stat stages", steps: [{ type: "skill", skill: "Hit" }] },
        skills: {
          Hit: {
            name: "Hit",
            castTime: 1,
            tags: ["DirectDamage", "Charged"],
            modifier: [],
            action: [
              { type: "damage", phyCoef: 1, time: 0 },
              { type: "apply", target: "self", value: "Temporary", time: 0.1 },
              { type: "damage", phyCoef: 1, time: 0.2 },
              { type: "damage", phyCoef: 1, time: 0.8 },
              { type: "heal", phyCoef: 1, time: 1 },
            ],
          },
        },
        setupEffects,
        eventDefinitions: {},
        dots: {},
        effectDefinitions: definitions,
        innerWayRules: [],
        innerWayConditions: [],
        weapons: [],
        initialBuffs: [{ name: "Global", stack: 1 }],
      },
    }
    const result = calculateRotationBaseline(bundle)
    const entries = result.baseline
    const [firstHit, secondHit] = entries
    assert(firstHit && secondHit, "The bundle must deal damage on both of its hits.")
    const damages = entries
      .filter(entry => entry.action.type === "damage")
      .map(entry => result.actionBreakdowns[rowIdOf(entry.id)].total)
    assert.deepEqual(damages, [1740, 1840, 1740], "Food survives skill/global/action stages and temporary expiration")
    assert.equal(
      firstHit.context.stats.minPhys,
      1060,
      "Skill baseline includes the ordinary global contribution exactly once",
    )
    const healed = entries.find(entry => entry.action.type === "heal")
    assert(healed, "The bundle must heal once, so its healing total is observable.")
    const healedBreakdown = result.actionBreakdowns[rowIdOf(healed.id)]
    assert(healedBreakdown.healing, "The healing action must resolve a healing breakdown.")
    assert.equal(healedBreakdown.healing.total, 1740)
    const during = resolveActionStatContext(secondHit.context)
    assert.equal(during.stats.minPhys, 1060, "Tracked effective bonuses do not increase ordinary stats")
    assert.equal(during.derivedStats.effectiveMinPhys, 1280)
    const repeat = resolveActionStatContext({ ...secondHit.context, effects: [...secondHit.context.effects] })
    assert.equal(during.stats, repeat.stats, "Unchanged numerical combat contributions reuse the resolved action stats")
    const variants = { ...bundle, setupComparisons: { food: [{ label: "None", setupEffects: setupEffects.slice(1) }] } }
    const compared = calculateRotationComparisons(variants, result)
    const rawSetup = [talent, rawBonus]
    const rawSheet = calculateStatsWithEffects(base, rawSetup, 0, [])
    const rawBundle: RotationSimulationBundle = {
      ...bundle,
      stats: rawSheet.stats,
      rawStats: rawSheet.rawStats,
      timeline: { ...bundle.timeline, setupEffects: rawSetup },
      setupComparisons: { arsenal: [{ label: "Remove raw bonus", setupEffects: [talent] }] },
    }
    const rawBaseline = calculateRotationBaseline(rawBundle)
    const rawComparison = calculateRotationComparisons(rawBundle, rawBaseline)
    const removedSheet = calculateStatsWithEffects(base, [talent], 0, [])
    const removedBaseline = calculateRotationBaseline({
      ...rawBundle,
      stats: removedSheet.stats,
      rawStats: removedSheet.rawStats,
      timeline: { ...rawBundle.timeline, setupEffects: [talent] },
      setupComparisons: {},
    })
    const totalDamage = (output: RotationSimulationBaseline) =>
      output.baseline
        .filter(entry => entry.action.type === "damage")
        .reduce((sum, entry) => sum + output.actionBreakdowns[rowIdOf(entry.id)].total, 0)
    assert.equal(
      rawComparison.setupComparisons.arsenal[0].dpsDifference,
      totalDamage(removedBaseline) - totalDamage(rawBaseline),
      "Copied-sheet raw variants must match rebuilding the sheet, including changed talent amounts",
    )
    assert.equal(
      compared.setupComparisons.food[0].dpsDifference,
      -540,
      "Food removal adjusts a copied sheet without losing skill/global bonuses",
    )
    assert.equal(bundle.stats.minPhys, 1000, "Baseline sheet remains immutable")
    const effectiveGlobal = calculateRotationBaseline({
      ...bundle,
      timeline: {
        ...bundle.timeline,
        effectDefinitions: {
          ...definitions,
          Global: { ...definitions.Global, effect: [{ effect: { effectiveStat: { minPhys: 50, maxPhys: 50 } } }] },
        },
      },
    })
    assert.equal(totalDamage(effectiveGlobal), totalDamage(result), "Global effective contributions apply exactly once")
    assert.equal(effectiveGlobal.baseline[0].context.stats.minPhys, 1010)
    const invertedBundle = {
      ...bundle,
      stats: invertedSheet.stats,
      rawStats: invertedSheet.rawStats,
      baseStats: invertedBase,
      derivedStats: invertedSheet.stats,
      timeline: {
        ...bundle.timeline,
        setupEffects: [food],
        initialBuffs: [],
        skills: { Hit: { ...bundle.timeline.skills.Hit, action: [{ type: "damage", phyCoef: 1, time: 0 }] } },
      },
      setupComparisons: { food: [{ label: "None", setupEffects: [] }] },
    }
    const invertedBaseline = calculateRotationBaseline(invertedBundle)
    assert.equal(totalDamage(invertedBaseline), 2130)
    assert.equal(
      calculateRotationComparisons(invertedBundle, invertedBaseline).setupComparisons.food[0].dpsDifference,
      -130,
      "Food removal recalculates the inverted range from ordinary inputs",
    )
    // Real Kite talent formulas: resource-conditioned modifiers must not erase food or skill bonuses.
    const gauntlets = JSON.parse(await readFile("data/martial-art/heavenwill-gauntlets.json", "utf8")) as {
      talent: Array<{ effect: object[] }>[]
    }
    const rope = JSON.parse(await readFile("data/martial-art/skygrasp-rope-dart.json", "utf8")) as {
      talent: Array<{ effect: object[] }>[]
    }
    const martial = asTalentEffects(
      [...gauntlets.talent[13], ...rope.talent[13]].flatMap(talent =>
        talent.effect.map(effect => ({ ...effect, statStage: "talent" as const })),
      ),
    )
    const attributeBase = { ...base, minBamboocut: 100, maxBamboocut: 200, minVoidAttack: 50, maxVoidAttack: 100 }
    const unconditionalMartial = martial.filter(effect => !effect.requirement)
    const attributes = calculateStatsWithEffects(attributeBase, unconditionalMartial, 0, ["heavenwill", "skygrasp"])
    assert.equal(
      attributes.rawStats.minBamboocut,
      296,
      "Both martial arts contribute flat attribute attack before scaling",
    )
    assert.equal(attributes.stats.minBamboocut, 296, "Raw attribute bonuses are not applied twice")
    assert.equal(attributes.stats.effectiveMinBamboocut, 346, "Formless is still folded into final attack")
    assert.ok(Math.abs(attributes.stats.bamboocutDmgBonus - 296 * 0.000336) < 1e-9)
    assert.ok(Math.abs(attributes.stats.bamboocutPenetration - 296 * 0.0672) < 1e-9)
    assert.deepEqual(
      attributes,
      calculateStatsWithEffects(attributeBase, [...unconditionalMartial].reverse(), 0, ["heavenwill", "skygrasp"]),
    )
    for (const withFood of [false, true]) {
      const setup: TalentEffect[] = [...martial, ...(withFood ? [food] : [])]
      const prepared = calculateStatsWithEffects(
        base,
        setup.filter(effect => !effect.requirement),
        0,
        [],
      )
      const kiteBundle = {
        ...bundle,
        stats: prepared.stats,
        rawStats: prepared.rawStats,
        derivedStats: prepared.stats,
        timeline: {
          ...bundle.timeline,
          setupEffects: setup,
          initialResources: { HeavensWill: 1 },
          skills: { Hit: { ...bundle.timeline.skills.Hit, tags: ["DirectDamage", "Falcon"] } },
        },
      }
      const kite = calculateRotationBaseline(kiteBundle)
      const context = resolveActionStatContext(kite.baseline[0].context)
      assert.equal(context.stats.minPhys, 1050)
      assert.equal(context.derivedStats.effectiveMinPhys, 1050 + (withFood ? 120 : 0))
      assert.equal(
        context.derivedStats.effectiveCritDmgBonus,
        0.3,
        "Talent source remains raw, independent of food and buffs",
      )
    }
  })
})
