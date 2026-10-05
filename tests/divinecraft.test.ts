import { existsSync } from "node:fs"

import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import type { EditableObject } from "@/calculations/rotationTimeline"

/**
 * One Divinecraft as the shipped file carries it.
 *
 * Each Divinecraft's effect is a different shape — an HP bonus, a trigger list, a
 * resource grant — so TypeScript infers a union no single consumer declares. The
 * damage pipeline and the timeline both take the effect as an untyped object.
 */
type Divinecraft = { name: string; description: string; image?: string; effect: EditableObject }

// Ported from script/probe/check-divinecraft.mjs.
describe("divinecraft", () => {
  it("Divinecraft damage and healing-triggered Vitality checks passed", async () => {
    const definitions = (await import("../data/divinecraft.json")).default as Record<string, Divinecraft>

    /** The Divinecraft with `id`, named when the shipped file has no such entry. */
    function divinecraftOf(id: string) {
      const definition = definitions[id]
      assert(definition, `Expected the shipped file to declare Divinecraft ${id}.`)
      return definition
    }

    const damage = await import("../src/calculations/damage.ts")
    const timelineCalculation = await import("../src/calculations/rotationTimeline.ts")
    const statDefinitions = await import("../src/data/statDefinitions.ts")
    const effectiveStats = await import("../src/calculations/effectiveStats.ts")

    for (const definition of Object.values(definitions)) {
      if (definition.image)
        assert(existsSync(`public/divinecraft/${definition.image}`), `Missing Divinecraft image: ${definition.image}`)
    }

    const stats = { ...statDefinitions.emptyStats, minPhys: 100, maxPhys: 100 }
    const context: DamageContext = {
      stats,
      attunement: emptyAttunementStats,
      weapons: ["snowparting"],
      skillTags: [],
      buffs: [],
      enemy: {
        name: "Probe",
        level: 1,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      derivedStats: effectiveStats.calculateDerivedStats(stats, 0),
      effects: [],
    }
    const damageFor = (id: string) =>
      damage.calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...context, effects: [divinecraftOf(id).effect] })
        .total
    const baseline = damage.calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, context).total
    assert(
      Math.abs(damageFor("Fire") / baseline - 1.015) < 1e-9,
      "Fire HP damage must apply as a 1.5% Category 1 bonus.",
    )
    assert(
      Math.abs(damageFor("WaterFire") / baseline - 1.014) < 1e-9,
      "Water-Fire HP damage must apply as a 1.4% Category 1 bonus.",
    )
    assert(
      Math.abs(damageFor("WaterPoison") / baseline - 1.01) < 1e-9,
      "Water-Poison HP damage must apply as a 1% Category 1 bonus.",
    )
    assert(
      Math.abs(damageFor("PoisonFire") / baseline - 1.014) < 1e-9,
      "Poison-Fire HP damage must apply as a 1.4% Category 1 bonus.",
    )
    assert(
      Math.abs(damageFor("PoisonWater") / baseline - 1.01) < 1e-9,
      "Poison-Water HP damage must apply as a 1% Category 1 bonus.",
    )
    assert(
      Math.abs(damageFor("FireWater") - damageFor("Fire")) < 1e-9,
      "A healing-triggered resource effect must not alter direct damage.",
    )
    assert(
      Math.abs(damageFor("FirePoison") - damageFor("Fire")) < 1e-9,
      "Stored Qi damage must remain inert until implemented.",
    )

    const vitalityAfterHeals = (id: string) => {
      const timeline = timelineCalculation.buildRotationTimeline({
        rotation: {
          name: `${id} healing trigger probe`,
          steps: [
            { type: "skill", skill: "HealingSequence" },
            { type: "skill", skill: "Observe" },
          ],
        },
        skills: {
          HealingSequence: {
            name: "Healing Sequence",
            castTime: 6.1,
            action: [
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 0 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 2.9 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 3 },
              { type: "heal", phyCoef: 1, silkbindCoef: 1, time: 6 },
            ],
          },
          Observe: { name: "Observe", castTime: 0, action: [] },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [divinecraftOf(id).effect],
        weapons: [],
        initialResources: { Vitality: 0 },
        resourceMaximums: { Vitality: 100 },
      })
      const observe = timeline.find(row => row.step.type === "skill" && row.step.skill === "Observe")
      assert(observe, `${id} must schedule the observing skill the Vitality grant lands on.`)
      return observe.resources.Vitality
    }

    const healingTriggered: Array<[string, number]> = [
      ["FireWater", 2.4],
      ["WaterFire", 3],
      ["WaterPoison", 3],
      ["PoisonWater", 2.4],
    ]
    healingTriggered.forEach(([id, expected]) => {
      assert(
        Math.abs(vitalityAfterHeals(id) - expected) < 1e-9,
        `${id} must grant Vitality on the first heal and again at each three-second cooldown boundary.`,
      )
    })
    assert(vitalityAfterHeals("Fire") === 0, "Divinecraft without a healing trigger must not grant Vitality.")
  })
})
