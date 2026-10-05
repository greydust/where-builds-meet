import { assert, describe, it } from "vitest"

import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { EditableObject, EffectDefinition, PeriodicEffect } from "@/calculations/rotationTimeline"
import type { EditorCategory, SkillCategory, SkillMap, SkillOverrides } from "@/skillOverrides"

import { castStep } from "./helpers/rotationSteps"
import { rowCasting } from "./helpers/timelineRows"

// Ported from script/probe/check-skill-override-calculation.mjs.
describe("skill-override-calculation", () => {
  it("Skill override calculation and fingerprint checks passed", async () => {
    const { resolveSkillCalculationDefinitions } = await import("@/skillOverrides.ts")
    const { deserializeSkillOverrides, serializeSkillOverrides } = await import("@/skillOverrides.ts")
    // Overrides nest by category, skill and field, and every level is optional, so
    // the readers below say which level was missing rather than reading through it.
    const overrideSkill = (overrides: SkillOverrides, category: EditorCategory, skill: string): SkillMap[number] => {
      const entry = overrides[category]?.[skill]
      assert(entry, `Expected a ${category} override for ${skill}.`)
      return entry
    }
    const overridePeriodic = (overrides: SkillOverrides, skill: string) => {
      const periodic = overrideSkill(overrides, "DOT", skill).periodic
      assert(periodic, `Expected the ${skill} override to carry its cadence.`)
      // A cadence carries untyped actions, and the legacy schema also had a
      // stack-damage flag this spec asserts is gone.
      return periodic as PeriodicEffect & { stackDamage?: unknown; action?: EditableObject[] }
    }
    const migrated = deserializeSkillOverrides({
      General: {
        Legacy: {
          action: [
            { type: "damage", phyCoef: 2 },
            { type: "heal", phyCoef: 3 },
            { type: "damage", phyCoef: 4, attrCoef: 0 },
          ],
        },
      },
    })
    const migratedActions = overrideSkill(migrated, "General", "Legacy").action as EditableObject[]
    assert(
      !(
        migratedActions[0].attrCoef !== 2 ||
        migratedActions[1].silkbindCoef !== 3 ||
        migratedActions[2].attrCoef !== 0
      ),
      "Legacy overrides must preserve old coefficients without overwriting explicit zero.",
    )
    const physicalOnly: SkillOverrides = {
      DOT: { Bleed: { periodic: { action: [{ type: "damage", phyCoef: 0.02 }] } } },
    }
    const reloaded = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(physicalOnly)))
    assert(
      overridePeriodic(reloaded, "Bleed").action?.[0].attrCoef === undefined,
      "New physical-only overrides must remain physical-only after saving and reloading.",
    )
    const oldStacked = deserializeSkillOverrides({
      version: 2,
      overrides: {
        DOT: { Bleed: { periodic: { stackDamage: true, interval: 1, action: [{ type: "damage", phyCoef: 0.02 }] } } },
      },
    })
    assert(
      !(
        overridePeriodic(oldStacked, "Bleed").stackDamage !== undefined ||
        overridePeriodic(oldStacked, "Bleed").tickOnExpire !== false ||
        overridePeriodic(oldStacked, "Bleed").action?.[0].attrCoef !== undefined
      ),
      "Old stack-damage overrides must preserve expiration behavior and physical-only coefficients, but drop stack scaling.",
    )
    const { buildRotationTimeline } = await import("@/calculations/rotationTimeline.ts")
    const { rotationBundleFingerprint } = await import("@/calculations/calculationFingerprint.ts")
    const { emptyAttunementStats } = await import("@/calculations/attunementStats.ts")
    const { calculateDerivedStats } = await import("@/calculations/effectiveStats.ts")
    const { emptyStats } = await import("@/data/statDefinitions.ts")
    // Only the categories this probe overrides carry skills; the rest are the empty
    // maps the calculator takes, which is what the app supplies for them too.
    const defaults: Record<SkillCategory, SkillMap> = {
      Snowparting: { Attack: { name: "Attack", castTime: 1, action: [{ type: "damage", time: 1 }] } },
      Phalanxbane: {},
      Thundercry: {},
      Stormbreaker: {},
      Heavenwill: {},
      Skygrasp: {},
      Panacea: {},
      Soulshade: {},
      Infernal: {},
      Mortal: {},
      Everspring: {},
      Unfettered: {},
      NamelessSword: {},
      NamelessSpear: {},
      Mystic: {},
      General: {},
      Mechanism: {},
    }
    const defaultDots: SkillMap = { Burning: { duration: 4, periodic: { interval: 1 } } }
    const defaultEffects: Record<string, EffectDefinition> = {
      Power: { duration: 5, effect: [{ stat: { minPhys: 1 } }] },
      Weakness: { duration: 5, effect: [{ dmgBonus: 0.01 }] },
      ...defaultDots,
    }
    const baseline = resolveSkillCalculationDefinitions(defaults, defaultEffects, defaultDots, {})
    const modified = resolveSkillCalculationDefinitions(defaults, defaultEffects, defaultDots, {
      Snowparting: { Attack: { name: "Attack", castTime: 2, action: [{ type: "damage", time: 2 }] } },
      Buff: { Power: { duration: 10, effect: [{ stat: { minPhys: 2 } }] } },
      Debuff: { Weakness: { duration: 8, effect: [{ dmgBonus: 0.02 }] } },
      DOT: { Burning: { duration: 8, periodic: { interval: 2 } } },
    })
    assert(modified.skills.Attack.castTime === 2, "Skill overrides did not reach calculation skills.")
    assert(modified.effectDefinitions.Power.duration === 10, "Buff overrides did not reach calculation effects.")
    assert(modified.effectDefinitions.Weakness.duration === 8, "Debuff overrides did not reach calculation effects.")
    assert(
      !(modified.dots.Burning.duration !== 8 || modified.effectDefinitions.Burning.duration !== 8),
      "DOT overrides did not reach both calculation maps.",
    )

    const probeSteps = () => [castStep("Attack")]
    type ResolvedDefinitions = ReturnType<typeof resolveSkillCalculationDefinitions>
    const timelineFor = (definitions: ResolvedDefinitions) =>
      buildRotationTimeline({
        rotation: { name: "Probe", steps: probeSteps() },
        skills: definitions.skills,
        dots: definitions.dots,
        effectDefinitions: definitions.effectDefinitions,
        eventDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["snowparting"],
      })
    assert(
      !(
        rowCasting(timelineFor(baseline), "Attack").effectiveCastTime !== 1 ||
        rowCasting(timelineFor(modified), "Attack").effectiveCastTime !== 2
      ),
      "Skill overrides did not change the generated calculation timeline.",
    )

    const bundleFor = (definitions: ResolvedDefinitions): RotationSimulationBundle => ({
      weapons: ["snowparting"],
      startAnchor: { rowId: "rotation-0" },
      stats: emptyStats,
      derivedStats: calculateDerivedStats(emptyStats, 0, {}, ["snowparting"]),
      attunement: emptyAttunementStats,
      enemy: {
        name: "Fingerprint probe",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
      timeline: {
        rotation: { name: "Probe", steps: probeSteps() },
        skills: definitions.skills,
        dots: definitions.dots,
        effectDefinitions: definitions.effectDefinitions,
        eventDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      },
    })
    assert(
      rotationBundleFingerprint(bundleFor(baseline)) !== rotationBundleFingerprint(bundleFor(modified)),
      "Skill definition changes did not invalidate the calculation fingerprint.",
    )
  })
})
