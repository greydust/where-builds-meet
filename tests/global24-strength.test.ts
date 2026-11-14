import { assert, describe, expect, it } from "vitest"

import { combatDefinitionsFor } from "@/application/gameData/previews"
import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import type { TrackedEffect } from "@/calculations/rotationTimeline"
import { resolveSkillCalculationDefinitions } from "@/skillOverrides"

const current = combatDefinitionsFor(null)

function timelineFor(definitions: typeof current, rotation: TimelineBuildInput["rotation"]): TimelineBuildInput {
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

describe("Global 2.4 shipped combat behavior", () => {
  it("refreshes Iron Guard to 40 seconds under Steadfast Devotion and 30 without it", () => {
    // Both applies are always present in the row's action list, so neither the actions nor the
    // casting row can show which one ran: a row snapshots the buff as it resolves, and the
    // re-application happens on the sub-action row. A second cast waits out QQ's cooldown, so
    // a later row observes the refreshed window.
    const ironGuardWindow = (innerWayConditions: string[]) => {
      const timeline = buildRotationTimeline({
        ...timelineFor(current, {
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
    const timeline = buildRotationTimeline(timelineFor(current, rotation))
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

  it("picks the soldier from Inner Passion at cast start, not after VC consumes it", () => {
    // VC consumes Inner Passion at 0.565 and its triggers land on that same timestamp, so a
    // live requirement would read the stack the consume just spent. One stack is what separates
    // the two readings: the consume empties it, so a live check finds nothing and dispatches
    // the plain soldier instead. The trigger also needs Frost-Clad Night and Iron Guard.
    const dispatched = buildRotationTimeline({
      ...timelineFor(current, {
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

  it("still resolves a current record through the skill-override merge used by the editor", () => {
    const merged = resolveSkillCalculationDefinitions(
      current.skillMaps,
      current.effectDefinitions,
      current.dotDefinitions,
      {},
    )
    expect(merged.skills.PhalanxbaneQSoul).toBeDefined()
    expect(merged.effectDefinitions.Dread.effect).toEqual([{ stat: { physDmgBonus: 0.12, stonesplitDmgBonus: 0.12 } }])
    // A user override still wins over the shipped data, which is the documented precedence.
    const overridden = resolveSkillCalculationDefinitions(
      current.skillMaps,
      current.effectDefinitions,
      current.dotDefinitions,
      { Debuff: { Dread: { name: "Dread", effect: [{ hpDMGBonus: 0.5 }] } } },
    )
    expect(overridden.effectDefinitions.Dread.effect).toEqual([{ hpDMGBonus: 0.5 }])
  })
})
