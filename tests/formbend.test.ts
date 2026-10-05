import { describe, expect, it } from "vitest"

import type { SkillRecord, TimelineRow } from "@/calculations/rotationTimeline"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { actionStateAt } from "./helpers/timelineRows"

/** The row the builder scheduled at `index`. */
function rowAt(rows: TimelineRow[], index: number) {
  const row = rows[index]
  expect(row, `Expected the builder to schedule a row at index ${index}.`).toBeTruthy()
  return row
}

// Ported from script/probe/check-formbend.mjs.
describe("formbend", () => {
  it("Art of Resistance and Formbend duration checks passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { defaultBuildSetup, normalizeBuildSetup } = await import("../src/gear.ts")
    const thundercrySkills = asSkillRecords((await import("../data/skill/thundercry-blade.json")).default)
    const stormbreakerSkills = asSkillRecords((await import("../data/skill/stormbreaker-spear.json")).default)
    const generalSkills = asSkillRecords((await import("../data/skill/general.json")).default)
    const generalBuffs = (await import("../data/buff/general.json")).default
    const mightBuffs = (await import("../data/buff/stonesplit-might.json")).default
    const migrated = normalizeBuildSetup(
      { gearSets: { Cleftpeak: 2, RainWhisper: 2 }, bowRingSet: "Precision", arsenal: "Stonesplit" },
      defaultBuildSetup,
    )
    expect(
      migrated.weaponSets.Cleftpeak === 2 && migrated.weaponSets.RainWhisper === 2 && migrated.armorSets.Formbend === 0,
      "Legacy gearSets must migrate without losing the new armor-set default.",
    ).toBeTruthy()
    const vulnerableDefinitions = asEffectDefinitions((await import("../data/debuff/stonesplit-might.json")).default)
    const thunderShockTimeline = buildRotationTimeline({
      rotation: { name: "Thunder Shock ordering probe", steps: [{ type: "skill", skill: "ThunderShock" }] },
      skills: { ThunderShock: stormbreakerSkills.ThunderShock },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: vulnerableDefinitions,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    })
    expect(
      !actionStateAt(rowAt(thunderShockTimeline, 0), 0).debuffs.has("Vulnerable"),
      "Thunder Shock hit 1 must deal damage before applying Vulnerable.",
    ).toBeTruthy()
    expect(
      actionStateAt(rowAt(thunderShockTimeline, 0), 2).debuffs.has("Vulnerable"),
      "Thunder Shock hit 2 must benefit from Vulnerable applied after hit 1.",
    ).toBeTruthy()
    const probeHit = { type: "damage", phyCoef: 0, attrCoef: 0, time: 9 }
    const probeSkill: SkillRecord = { name: "Probe", castTime: 9, action: [probeHit], tags: [] }
    /** The same inert hit, landing at `time`. */
    const probeAt = (time: number): SkillRecord => ({
      name: "Probe",
      castTime: time,
      action: [{ ...probeHit, time }],
      tags: [],
    })
    const shieldAtProbe = (conditions: string[]) => {
      const timeline = buildRotationTimeline({
        rotation: {
          name: "Formbend probe",
          steps: [
            { type: "skill", skill: "PredatorsShield" },
            { type: "skill", skill: "Probe" },
          ],
        },
        skills: { PredatorsShield: thundercrySkills.PredatorsShield, Probe: probeSkill },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: asEffectDefinitions({ ...generalBuffs, ...mightBuffs }),
        innerWayConditions: conditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: ["thundercry", "stormbreaker"],
      })
      return actionStateAt(rowAt(timeline, 1), 0).buffs.has("Shield")
    }
    expect(!shieldAtProbe([]), "The base eight-second Shield must expire before the probe hit.").toBeTruthy()
    expect(shieldAtProbe(["FormBend4"]), "Formbend four-piece must extend Shield by two seconds.").toBeTruthy()
    const aoRShieldAtProbe = (conditions: string[]) => {
      const timeline = buildRotationTimeline({
        rotation: {
          name: "AoR T4 Shield probe",
          steps: [
            { type: "skill", skill: "AoRT4Shield" },
            { type: "skill", skill: "Probe" },
          ],
        },
        skills: { AoRT4Shield: generalSkills.AoRT4Shield, Probe: probeAt(12) },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: asEffectDefinitions(generalBuffs),
        innerWayConditions: conditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: ["thundercry", "stormbreaker"],
      })
      expect(
        rowAt(timeline, 0).effectiveCastTime === 3,
        "AoR T4 Shield must retain its three-second timeline duration.",
      ).toBeTruthy()
      return actionStateAt(rowAt(timeline, 1), 0).buffs.has("Shield")
    }
    expect(!aoRShieldAtProbe([]), "AoR T4 Shield must expire after its 14-second duration.").toBeTruthy()
    expect(
      aoRShieldAtProbe(["FormBend4"]),
      "Formbend four-piece must extend AoR T4 Shield by two seconds.",
    ).toBeTruthy()
    const durationTimeline = buildRotationTimeline({
      rotation: {
        name: "Independent duration probe",
        steps: [
          { type: "skill", skill: "StormRoar" },
          { type: "skill", skill: "PredatorsShield" },
          { type: "skill", skill: "LateProbe" },
        ],
      },
      skills: {
        StormRoar: stormbreakerSkills.StormRoar,
        PredatorsShield: thundercrySkills.PredatorsShield,
        LateProbe: probeAt(13),
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: asEffectDefinitions({ ...generalBuffs, ...mightBuffs }),
      innerWayConditions: ["ArtOfResistanceT0", "ArtOfResistanceT4", "FormBend4"],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    })
    const lateBuffs = actionStateAt(rowAt(durationTimeline, 2), 0).buffs
    expect(lateBuffs.has("Shield"), "AoR and Formbend must extend Shield at the late probe.").toBeTruthy()
    expect(
      lateBuffs.get("Breakthrough")?.expiresAt === 22,
      "Art of Resistance T0/T4 and Formbend must extend Breakthrough from 12 to 20 seconds.",
    ).toBeTruthy()
    expect(
      lateBuffs.get("Shield")?.expiresAt === 18,
      "Art of Resistance and Formbend must extend Shield from 8 to 16 seconds.",
    ).toBeTruthy()
  })
})
