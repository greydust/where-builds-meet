import riven from "@gamedata/martial-art/riven-twinblades.json"
import skystrike from "@gamedata/martial-art/skystrike-gauntlets.json"
import rotation from "@gamedata/rotation/bamboocut-draught/draught-dummy-1-min.json"
import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { resolveRawStatFormulas } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"

import { dpsSnapshotEnvironment } from "./helpers/dps-snapshot-fixtures"
import { asTalentEffects } from "./helpers/shippedData"

function bundle() {
  return buildPresetRotationBundle(
    {
      ...dpsSnapshotEnvironment,
      breakthrough: "18",
      script: "Wraithstrike",
      pathId: "bamboocutDraught",
      martialArts: ["skystrikeGauntlets", "rivenTwinblades"],
      rotation: rotation as RotationRecord,
      skillOverrides: {},
      previewId: null,
    },
    "draught-fully-relayed-min",
  )!
}

describe("Draught enhancement eligibility", () => {
  it.each([false, true])("restricts the flat-free coefficient exception to source-marked effects: %s", eligible => {
    const original = bundle()
    const falcon = original.timeline.skills.FalconsPursuit
    original.timeline.rotation = { name: "Coefficient flag", steps: [{ type: "skill", skill: "Probe" }] }
    original.startAnchor = { rowId: "rotation-0" }
    original.timeline.skills = {
      ...original.timeline.skills,
      Probe: {
        ...falcon,
        castTime: 0.6,
        tags: falcon.tags!.filter(tag => eligible || tag !== "SkystrikeCoefficientEnhanced"),
      },
    }
    const stripped = structuredClone(original)
    const remove = (value: unknown): void => {
      if (!value || typeof value !== "object") return
      if (Array.isArray(value)) {
        value.forEach(remove)
        return
      }
      const object = value as Record<string, unknown>
      delete object.coefficientBonusWithoutFlatAttack
      Object.values(object).forEach(remove)
    }
    remove(stripped.timeline.setupEffects)
    const actual = calculateRotationBaseline(original).actionBreakdowns["rotation-0:0"].total
    const without = calculateRotationBaseline(stripped).actionBreakdowns["rotation-0:0"].total
    expect(actual).toBeGreaterThanOrEqual(without)
    expect(actual === without).toBe(!eligible)
  })

  it.each([0, 0.5])("multiplies Deepdaze hits by Eonpour independently of %s ordinary damage bonus", bonus => {
    const original = bundle()
    original.timeline.setupEffects.push({ effect: { dmgBonus: bonus } })
    const active = calculateRotationBaseline(original)
    const stripped = structuredClone(original)
    for (const rule of stripped.timeline.innerWayRules) {
      if (rule.source === "Eonpour") delete rule.effect.baseDMGBonus
    }
    const without = calculateRotationBaseline(stripped)
    const hits = active.baseline.filter(
      entry =>
        entry.context.skillTags.includes("DragonquenchInebriate") ||
        entry.context.skillTags.includes("HeroesBloodInebriate"),
    )
    expect(hits).toHaveLength(117)
    for (const hit of hits) {
      expect(active.actionBreakdowns[hit.id!].total / without.actionBreakdowns[hit.id!].total).toBeCloseTo(1.4, 12)
    }
  })

  it("applies enhanced bonuses to both Nightwick hits and records their increased damage", () => {
    const original = bundle()
    const enhanced = calculateRotationBaseline(original)
    const stripped = structuredClone(original)
    for (const id of ["NightwickTipsylay", "NightwickPrimepick"]) {
      stripped.timeline.skills[id].tags = stripped.timeline.skills[id].tags!.filter(tag => tag !== "InebriateEnhanced")
    }
    const ordinary = calculateRotationBaseline(stripped)
    for (const id of ["NightwickTipsylay", "NightwickPrimepick", "DrunkslayDamage"]) {
      const damage = (result: typeof enhanced) => result.metrics.breakdown.skills.find(row => row.id === id)!.damage
      expect(damage(enhanced)).toBeGreaterThan(damage(ordinary))
    }
  })
})

describe("Draught dynamic combat talents", () => {
  for (const [attack, critical, channel] of [
    [49, 0, 0],
    [50, 0.02, 0],
    [83.32, 0.02, 0],
    [83.33, 0.02, 0.01],
    [749, 0.28, 0.08],
    [750, 0.3, 0.09],
    [999, 0.3, 0.09],
  ]) {
    it(`uses complete source pieces at ${attack} combat minimum Physical Attack`, () => {
      const raw = { ...emptyStats, minPhys: 10 }
      const stats = {
        ...raw,
        minPhys: attack,
        maxPhys: attack,
        precision: 1,
        crit: 1,
        minBamboocut: 100,
        maxBamboocut: 100,
      }
      const context = {
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        attunement: emptyAttunementStats,
        weapons: [],
        buffs: ["Inebriate"],
        skillTags: ["InebriateEnhanced"],
        enemy: {
          name: "Talent target",
          level: 96,
          defense: 0,
          physicalResistance: 0,
          bellstrikeResistance: 0,
          stonesplitResistance: 0,
          silkbindResistance: 0,
          bamboocutResistance: 0,
          judgementResistance: 0,
        },
      }
      const sky = resolveRawStatFormulas(asTalentEffects(skystrike.talent[14][2].effect)[0].effect!, raw)
      const blade = resolveRawStatFormulas(asTalentEffects(riven.talent[14][2].effect)[0].effect!, raw)
      const hit = { type: "damage", phyCoef: 1, attrCoef: 1 }
      const actual = calculateDamageBreakdown(hit, { ...context, effects: [sky, blade] })
      const expected = calculateDamageBreakdown(hit, {
        ...context,
        effects: [{ critDmgBonus: critical }, { stat: { physDmgBonus: channel, bamboocutDmgBonus: channel } }],
      })
      expect(actual.total).toBeCloseTo(expected.total, 10)
    })
  }
})
