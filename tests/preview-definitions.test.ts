import { assert, describe, expect, it } from "vitest"

import { innerWayEffectRulesFor } from "@/application/characterComposition"
import {
  combatDefinitionsFor,
  currentCombatDefinitions,
  isPreviewId,
  previewCatalog,
} from "@/application/gameData/previews"
import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import type { SkillRecord, TrackedEffect } from "@/calculations/rotationTimeline"
import { resolveSkillCalculationDefinitions } from "@/skillOverrides"

import { skillActions } from "./helpers/shippedData"

/**
 * A preview is an overlay on the shipped data. What is worth pinning is that it changes only
 * the records it names, that it reaches calculation rather than merely existing in the data,
 * and that every no-selection path resolves to the shipped data. The assertions read the
 * resolved definitions and the timeline built from them, not the JSON files.
 */
const previewId = "cn-2.8.5"
const preview = combatDefinitionsFor(previewId)
const shipped = currentCombatDefinitions

function timelineFor(definitions: typeof shipped, rotation: TimelineBuildInput["rotation"]): TimelineBuildInput {
  return {
    rotation,
    skills: Object.assign({}, ...Object.values(definitions.skillMaps)),
    dots: definitions.dotDefinitions,
    effectDefinitions: definitions.effectDefinitions,
    eventDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting", "phalanxbane"],
  }
}

describe("preview definitions", () => {
  it("resolves the shipped data for no selection and for an id this build does not ship", () => {
    expect(combatDefinitionsFor(null)).toBe(shipped)
    expect(combatDefinitionsFor("a-preview-that-was-removed")).toBe(shipped)
    expect(isPreviewId("a-preview-that-was-removed")).toBe(false)
  })

  it("lists the preview so a selector can offer it, and caches one set per id", () => {
    expect(previewCatalog.map(entry => entry.id)).toContain(previewId)
    expect(isPreviewId(previewId)).toBe(true)
    expect(combatDefinitionsFor(previewId)).toBe(preview)
  })

  it("changes only the skill categories it names and keeps every record in them", () => {
    const changed = (Object.keys(preview.skillMaps) as Array<keyof typeof preview.skillMaps>).filter(
      category => preview.skillMaps[category] !== shipped.skillMaps[category],
    )
    expect(changed.sort()).toEqual(["Phalanxbane", "Snowparting"])
    // The records a preview restates, and the skills it introduces beside them.
    const restated = new Set(["AnxiSoldierSnowbreakSpring", "SnowpartingHeavyVC", "SnowpartingQStab", "PhalanxbaneQ"])
    for (const category of changed) {
      const previewed = preview.skillMaps[category]
      const altered = Object.entries(shipped.skillMaps[category])
        .filter(([id, record]) => !restated.has(id) && previewed[id] !== record)
        .map(([id]) => id)
      expect({ category, altered }).toEqual({ category, altered: [] })
      expect(Object.keys(shipped.skillMaps[category]).every(id => previewed[id] !== undefined)).toBe(true)
    }
    expect(Object.keys(preview.skillMaps.Snowparting)).toEqual(
      expect.arrayContaining(["AnxiSoldierSnowbreakSpringEnhanced"]),
    )
    expect(Object.keys(preview.skillMaps.Phalanxbane)).toEqual(
      expect.arrayContaining(["PhalanxbaneQBase", "PhalanxbaneQSoul"]),
    )
  })

  it("leaves the registries a preview does not name identical to the shipped ones", () => {
    for (const category of Object.keys(shipped.skillMaps) as Array<keyof typeof shipped.skillMaps>) {
      if (category === "Phalanxbane" || category === "Snowparting") continue
      expect(preview.skillMaps[category]).toBe(shipped.skillMaps[category])
    }
    expect(preview.martialArtDefinitions).toBe(shipped.martialArtDefinitions)
    expect(preview.dotDefinitions).toBe(shipped.dotDefinitions)
  })

  it("moves Dread from a flat HP damage bonus onto the two channel bonuses", () => {
    expect(shipped.effectDefinitions.Dread.effect).toEqual([{ hpDMGBonus: 0.12 }])
    expect(preview.effectDefinitions.Dread.effect).toEqual([{ stat: { physDmgBonus: 0.12, stonesplitDmgBonus: 0.12 } }])
    expect(JSON.stringify(preview.effectDefinitions.Dread)).not.toContain("hpDMGBonus")
  })

  it("overlays one Inner Way tier and leaves the definition and its other tiers alone", () => {
    const previewed = preview.innerWayDefinitions.FrostCladNight
    expect(previewed.name).toBe(shipped.innerWayDefinitions.FrostCladNight.name)
    expect(previewed.tags).toEqual(shipped.innerWayDefinitions.FrostCladNight.tags)
    for (const tier of ["FrostCladNightT0", "FrostCladNightT2", "FrostCladNightT5", "FrostCladNightT6"]) {
      expect({ tier, effect: previewed.effect[tier] }).toEqual({
        tier,
        effect: shipped.innerWayDefinitions.FrostCladNight.effect[tier],
      })
    }
    expect(Object.keys(preview.innerWayDefinitions).sort()).toEqual(Object.keys(shipped.innerWayDefinitions).sort())
  })

  it("keeps Frost-Clad Night T4's Inner Passion gate and adds the soldier as an alternative tag", () => {
    // The T4 entry's effect sheet and requirement groups, which is what carries the Inner Passion gate.
    const t4Entry = (definitions: typeof shipped) => {
      const tier = definitions.innerWayDefinitions.FrostCladNight?.effect.FrostCladNightT4
      const [entry] = tier?.effect ?? []
      const gate = entry?.requirement as { operand?: unknown[] }[] | undefined
      assert(gate, "Frost-Clad Night T4 must declare its Inner Passion gate.")
      return entry
    }
    const shippedT4 = t4Entry(shipped)
    const previewT4 = t4Entry(preview)
    expect(previewT4.effect).toEqual(shippedT4.effect)
    const shippedGate = shippedT4.requirement as { operand?: unknown[] }[]
    const previewGate = previewT4.requirement as { operand?: unknown[] }[]
    expect(previewGate[0]?.operand).toEqual([
      { target: "skillTag", value: "SnowbreakSpring" },
      { target: "skillTag", value: "AnxiSoldierSnowbreakSpring" },
    ])
    // The second AND group is the Inner Passion / T6-and-Exhausted gate and is unchanged, so
    // the enhanced soldier's own 40% is not granted a second time through the Inner Way.
    expect(previewGate[1]).toEqual(shippedGate[1])
  })

  it("routes the previewed Inner Way into the rules a calculation reads", () => {
    const innerWays = [{ innerWay: "FrostCladNight", tier: "T4" }]
    const rulesFor = (definitions: typeof shipped) =>
      JSON.stringify(innerWayEffectRulesFor(innerWays, 17, "stonesplitStrength", definitions))
    expect(rulesFor(preview)).toContain("AnxiSoldierSnowbreakSpring")
    expect(rulesFor(shipped)).not.toContain("AnxiSoldierSnowbreakSpring")
  })

  it("gives Total Annihilation a Soul sub-action selected by Iron Guard", () => {
    const qq = preview.skillMaps.Phalanxbane.PhalanxbaneQ
    expect(shipped.skillMaps.Phalanxbane.PhalanxbaneQ.subAction).toBeUndefined()
    expect(qq.subAction).toEqual([
      {
        value: "PhalanxbaneQSoul",
        requirement: [{ target: "self", value: "IronGuard" }],
        fallback: "PhalanxbaneQBase",
      },
    ])
    // The parent keeps only the soldier trigger, so the hit itself belongs to the sub-action.
    expect(skillActions(qq).every(action => action.type === "trigger")).toBe(true)
    const soul = preview.skillMaps.Phalanxbane.PhalanxbaneQSoul as SkillRecord
    const damage = skillActions(soul).find(action => action.type === "damage") as {
      phyCoef: number
      phyBonus: number
      attrCoef: number
      attrBonus: number
    }
    expect([damage.phyCoef, damage.phyBonus, damage.attrCoef, damage.attrBonus]).toEqual([3.5256, 975, 3.5256, 532])
    // The Soul re-applies Iron Guard rather than extending it, so the buff's own duration
    // decides its window instead of accumulating on whatever was left. The duration is a
    // property of the action, so the Steadfast Devotion condition sits on the action as two
    // complementary applies; exactly one of them can pass.
    const guardApplies = skillActions(soul).filter(
      action => action.type === "apply" && action.value === "IronGuard",
    ) as Array<{ duration: number; stack?: number }>
    expect(guardApplies.map(apply => apply.duration).sort((a, b) => a - b)).toEqual([30, 40])
    expect(guardApplies.every(apply => apply.stack === 1)).toBe(true)
    expect(soul.modifier).toEqual([])
  })

  it("refreshes Iron Guard to 40 seconds under Steadfast Devotion and 30 without it", () => {
    // Both applies are always present in the row's action list, so neither the actions nor the
    // casting row can show which one ran: a row snapshots the buff as it resolves, and the
    // re-application happens on the sub-action row. A second cast waits out QQ's cooldown, so
    // a later row observes the refreshed window.
    const ironGuardWindow = (innerWayConditions: string[]) => {
      const timeline = buildRotationTimeline({
        ...timelineFor(combatDefinitionsFor(previewId), {
          name: "Preview",
          steps: [
            // Legion Summon puts Iron Guard up first, which is what lets the Soul resolve.
            { type: "skill", skill: "PhalanxbaneSpecial" },
            { type: "skill", skill: "PhalanxbaneQ" },
            // A second cast waits out QQ's cooldown, so a later row observes the window the
            // Soul's re-application left behind rather than the one Legion Summon opened.
            { type: "skill", skill: "PhalanxbaneQ" },
          ],
        }),
        innerWayConditions,
      })
      let widest = 0
      for (const row of timeline) {
        const guard = (row.buffs.get("IronGuard") ?? {}) as { appliedAt?: number; expiresAt?: number }
        if (guard?.appliedAt === undefined || guard.expiresAt === undefined) continue
        widest = Math.max(widest, guard.expiresAt - guard.appliedAt)
      }
      assert(widest > 0, "Iron Guard must be tracked.")
      return widest
    }
    const withoutDevotion = ["FrostCladNightT0", "FrostCladNightT1"]
    const withDevotion = [...withoutDevotion, "SteadfastDevotionT0", "SteadfastDevotionT1"]
    // The Soul re-applies the buff outright, so the window is the applied duration rather
    // than 30 seconds plus an extension.
    expect(ironGuardWindow(withoutDevotion)).toBe(30)
    expect(ironGuardWindow(withDevotion)).toBe(40)
  })

  it("resolves Total Annihilation to the base hit without Iron Guard and the Soul hit with it", () => {
    const rotation = {
      name: "Preview",
      steps: [
        { type: "skill" as const, skill: "PhalanxbaneQ" },
        { type: "skill" as const, skill: "PhalanxbaneSpecial" },
        { type: "skill" as const, skill: "PhalanxbaneQ" },
      ],
    }
    const timeline = buildRotationTimeline(timelineFor(preview, rotation))
    const qq = timeline.filter(row => row.step.skill === "PhalanxbaneQ")
    assert(qq.length === 2, "Both Total Annihilation casts must produce a row.")
    // The first cast has no Iron Guard, so it falls back to the shipped coefficients; Legion
    // Summon then applies Iron Guard, so the second cast resolves the Soul sub-action.
    const coefficientsOf = (row: (typeof qq)[number]) =>
      row.actions
        .filter(action => action.type === "damage")
        .map(action => (action as { phyCoef?: number }).phyCoef)
        .filter(value => typeof value === "number")
    expect(coefficientsOf(qq[0])).toContain(1.8948)
    expect(coefficientsOf(qq[1])).toContain(3.5256)
    expect(coefficientsOf(qq[1])).not.toContain(1.8948)
  })

  it("selects the enhanced Snowbreak Spring soldier only while Inner Passion is active", () => {
    // A trigger dispatches one skill, so the choice is made by two trigger actions on VC
    // rather than by a sub-action: the enhanced soldier carries the 40% itself, and only the
    // plain one carries the tag Frost-Clad Night T4 matches, so the two cannot both apply.
    // Both requirements are frozen at skill start, because VC consumes Inner Passion on the
    // same timestamp its triggers land on and would otherwise read the state it just changed.
    const vc = preview.skillMaps.Snowparting.SnowpartingHeavyVC as SkillRecord
    const triggers = skillActions(vc).filter(action => action.type === "trigger") as Array<{
      value: string
      requirement: { resolveAt?: string; operand?: unknown[] }
    }>
    expect(triggers.map(trigger => trigger.value)).toEqual([
      "AnxiSoldierSnowbreakSpringEnhanced",
      "AnxiSoldierSnowbreakSpring",
    ])
    for (const trigger of triggers) expect(trigger.requirement.resolveAt).toBe("skillStart")
    expect(JSON.stringify(triggers[0].requirement.operand)).toContain("InnerPassion")
    expect(JSON.stringify(triggers[1].requirement.operand)).toContain('"operator":"not"')
    // The consume that would otherwise resolve first is still the shipped one.
    expect(vc.action?.[1]).toEqual((shipped.skillMaps.Snowparting.SnowpartingHeavyVC as SkillRecord).action?.[1])
    expect(preview.skillMaps.Snowparting.AnxiSoldierSnowbreakSpringEnhanced.modifier).toEqual([
      { effect: { baseDMGBonus: 0.4 } },
    ])
    expect(preview.skillMaps.Snowparting.AnxiSoldierSnowbreakSpring.modifier).toEqual([])
    expect(preview.skillMaps.Snowparting.AnxiSoldierSnowbreakSpring.tags).toContain("AnxiSoldierSnowbreakSpring")
    expect(preview.skillMaps.Snowparting.AnxiSoldierSnowbreakSpringEnhanced.tags).not.toContain(
      "AnxiSoldierSnowbreakSpring",
    )
    // VC's own unconditional 0.36 is unchanged, so only the soldier's share moved.
    expect(vc.modifier).toEqual([{ effect: { baseDMGBonus: 0.36 } }])
  })

  it("picks the soldier from Inner Passion at cast start, not after VC consumes it", () => {
    // VC consumes Inner Passion at 0.565 and its triggers land on that same timestamp, so a
    // live requirement would read the stack the consume just spent. One stack is what separates
    // the two readings: the consume empties it, so a live check finds nothing and dispatches
    // the plain soldier instead. The trigger also needs Frost-Clad Night and Iron Guard.
    const dispatched = buildRotationTimeline({
      ...timelineFor(combatDefinitionsFor(previewId), {
        name: "Preview",
        steps: [
          { type: "skill", skill: "PhalanxbaneSpecial" },
          { type: "skill", skill: "SnowpartingHeavyVC" },
        ],
      }),
      innerWayConditions: ["FrostCladNightT0", "FrostCladNightT1", "SteadfastDevotionT0", "SteadfastDevotionT1"],
      // An initial buff is applied persistent with no expiry, so a partial lifetime is
      // expressed as an apply action carrying the remaining seconds, not as a field on
      // the initial buff.
      initialBuffs: [{ name: "InnerPassion", stack: 1, maxStack: 4 } satisfies TrackedEffect],
      setupEffects: [
        {
          trigger: {
            event: "battleStart",
            action: { type: "apply", target: "self", value: "InnerPassion", duration: 12, time: 0 },
          },
        },
      ],
    })
      .filter(row => /AnxiSoldierSnowbreakSpring/.test(String(row.step.skill ?? "")))
      .map(row => String(row.step.skill))
    expect(dispatched).toEqual(["AnxiSoldierSnowbreakSpringEnhanced"])
  })

  it("gives the enhanced soldier the same four hits as the plain one", () => {
    const enhanced = preview.skillMaps.Snowparting.AnxiSoldierSnowbreakSpringEnhanced as SkillRecord
    expect(enhanced.action).toEqual(shipped.skillMaps.Snowparting.AnxiSoldierSnowbreakSpring.action)
  })

  it("extends Dread by ten seconds from General's Bane: Stab", () => {
    // The extend belongs to SnowpartingQStab, the castable named "General's Bane: Stab",
    // which is a different record from AnxiSoldierGeneralsBaneStab — the soldier it triggers,
    // which shares that display name and touches no Dread effect at all.
    const extendOf = (record: SkillRecord) =>
      skillActions(record).find(action => action.type === "extend" && action.value === "Dread") as
        | { duration: number }
        | undefined
    const shippedStab = shipped.skillMaps.Snowparting.SnowpartingQStab as SkillRecord
    const previewStab = preview.skillMaps.Snowparting.SnowpartingQStab as SkillRecord
    expect(extendOf(shippedStab)?.duration).toBe(6)
    expect(extendOf(previewStab)?.duration).toBe(10)
    // Only the duration moved, so the hits the castable deals are unchanged.
    expect(skillActions(previewStab).filter(action => action.type === "damage")).toEqual(
      skillActions(shippedStab).filter(action => action.type === "damage"),
    )
    expect(extendOf(shipped.skillMaps.Snowparting.AnxiSoldierGeneralsBaneStab as SkillRecord)).toBeUndefined()
    expect(extendOf(preview.skillMaps.Snowparting.AnxiSoldierGeneralsBaneStab as SkillRecord)).toBeUndefined()
  })

  it("still resolves a previewed record through the skill-override merge used by the editor", () => {
    const merged = resolveSkillCalculationDefinitions(
      preview.skillMaps,
      preview.effectDefinitions,
      preview.dotDefinitions,
      {},
    )
    expect(merged.skills.PhalanxbaneQSoul).toBeDefined()
    expect(merged.effectDefinitions.Dread.effect).toEqual([{ stat: { physDmgBonus: 0.12, stonesplitDmgBonus: 0.12 } }])
    // A user override still wins over the preview, which is the documented precedence.
    const overridden = resolveSkillCalculationDefinitions(
      preview.skillMaps,
      preview.effectDefinitions,
      preview.dotDefinitions,
      { Debuff: { Dread: { name: "Dread", effect: [{ hpDMGBonus: 0.5 }] } } },
    )
    expect(overridden.effectDefinitions.Dread.effect).toEqual([{ hpDMGBonus: 0.5 }])
  })
})
