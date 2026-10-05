import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { emptyStats } from "../src/data/statDefinitions"
import { isClose } from "./helpers/floatEquality"

const weaponIds = ["namelessSword", "namelessSpear"] as never[]

const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
const enemy = {
  name: "Vagrant Sword probe",
  level: 96,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}

describe("vagrant-sword-charge-variants", () => {
  it("runs the three charge phases and swaps the shooting variant under Sword Morph", async () => {
    const { defaultSkillMaps, defaultEditorMaps } = await import("../src/application/gameData/skills")
    const run = (tiers: string[], shielded: boolean, holdSeconds = 5) =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Vagrant Sword",
            steps: shielded
              ? [
                  { type: "skill", skill: "RaiseShield" },
                  { type: "skill", skill: "VagrantSword2" },
                  { type: "event", event: "Delay", duration: holdSeconds },
                ]
              : [
                  { type: "skill", skill: "VagrantSword2" },
                  { type: "event", event: "Delay", duration: holdSeconds },
                ],
          },
          skills: {
            ...(defaultSkillMaps.NamelessSword as Record<string, unknown>),
            RaiseShield: {
              castTime: 0,
              tags: ["General"],
              action: [{ type: "apply", target: "self", value: "Shield", duration: 30, time: 0 }],
            },
          },
          effectDefinitions: { ...defaultEditorMaps.Buff, ...defaultEditorMaps.Debuff },
          initialResources: { Endurance: 100 },
          resourceMaximums: { Endurance: 100 },
          resourceRegeneration: { Endurance: 10 },
          resourceSpendRegenDelay: { Endurance: 1.2 },
          dots: {},
          eventDefinitions: {},
          innerWayRules: [],
          innerWayConditions: tiers,
          setupEffects: [],
          weapons: weaponIds,
        },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons: weaponIds,
        attunement: emptyAttunementStats,
        startAnchor: { rowId: "rotation-0" },
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })

    // Sub-actions land on the same row, so discriminate by each action's own tags.
    // The three-wave variant is the only one tagged SwordEnergy.
    const singleWave = (result: ReturnType<typeof run>) =>
      result.timeline.flatMap(row =>
        row.actions.flatMap((action, index) => {
          const breakdown = result.actionBreakdowns[`${row.id}:${index}`]
          const tags = row.actionSkillTags?.[index] ?? []
          return action.type === "damage" && breakdown && !tags.includes("SwordEnergy") ? [breakdown.total] : []
        }),
      )
    const threeWaves = (result: ReturnType<typeof run>) =>
      result.timeline.flatMap(row =>
        row.actions.flatMap((action, index) => {
          const breakdown = result.actionBreakdowns[`${row.id}:${index}`]
          const tags = row.actionSkillTags?.[index] ?? []
          return action.type === "damage" && breakdown && tags.includes("SwordEnergy") ? [breakdown.total] : []
        }),
      )

    const plain = run([], false)
    const plainWaves = singleWave(plain)
    assert.equal(plainWaves.length, 1, "Without Sword Morph the shooting phase is a single wave")
    assert.equal(threeWaves(plain).length, 0, "No sword energy without Sword Morph")

    // The three phases are the whole cast: 0.2 pre-charge, 1.0 charge, 0.85 shoot.
    // Identify the row by its own skill tag rather than a display name.
    const cast = plain.timeline.find(row =>
      Object.values(row.actionSkillTags ?? {}).some(tags => tags.includes("VagrantSword")),
    )
    assert.equal(cast?.effectiveCastTime, 2.05, "The three sub-actions must total the full 2.05s cast")

    // An unshielded release stays on the single wave even with the Inner Way selected.
    assert.equal(threeWaves(run(["SwordMorphT0"], false)).length, 0, "Sword Morph needs the Qi shield active")

    const morphed = run(["SwordMorphT0"], true)
    assert.equal(
      singleWave(morphed).length,
      0,
      "The three-wave variant replaces the single wave rather than adding to it",
    )
    const energies = threeWaves(morphed)
    assert.equal(energies.length, 3, "Sword Morph must unleash all three sword energies")
    assert.ok(
      energies[0] < energies[1] && energies[1] < energies[2],
      `Sword energy damage must grow per wave, got ${energies}`,
    )
    assert.ok(
      energies[0] + energies[1] + energies[2] > plainWaves[0],
      "The three waves together must out-damage the single wave",
    )
  })

  it("drains and regenates Endurance across the authored charge phases", async () => {
    const { defaultSkillMaps, defaultEditorMaps } = await import("../src/application/gameData/skills")
    const endurance = (tiers: string[], shielded: boolean) => {
      const result = calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Endurance",
            steps: [
              ...(shielded ? [{ type: "skill" as const, skill: "RaiseShield" }] : []),
              { type: "skill", skill: "VagrantSword2" },
              // A short hold keeps the meter below its cap, so the post-release
              // suppression is observable instead of being refilled away.
              { type: "event", event: "Delay", duration: 2 },
            ],
          },
          skills: {
            ...(defaultSkillMaps.NamelessSword as Record<string, unknown>),
            RaiseShield: {
              castTime: 0,
              tags: ["General"],
              action: [{ type: "apply", target: "self", value: "Shield", duration: 30, time: 0 }],
            },
          },
          effectDefinitions: { ...defaultEditorMaps.Buff, ...defaultEditorMaps.Debuff },
          initialResources: { Endurance: 100 },
          resourceMaximums: { Endurance: 100 },
          resourceRegeneration: { Endurance: 10 },
          resourceSpendRegenDelay: { Endurance: 1.2 },
          dots: {},
          eventDefinitions: {},
          innerWayRules: [],
          innerWayConditions: tiers,
          setupEffects: [],
          weapons: weaponIds,
        },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons: weaponIds,
        attunement: emptyAttunementStats,
        startAnchor: { rowId: "rotation-0" },
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
      return { end: result.timeline[0].timelineResourceSummary?.Endurance }
    }
    /** The authored charge phases land on half-second boundaries, so a tenth is enough slack. */
    const close = (actual: number | undefined, expected: number, message: string) =>
      assert.ok(isClose(actual, expected, 0.05), `${message}: ${actual} != ${expected}`)

    // Only the charging phase drains, at 20/s for its 1.0s cast. Nothing else
    // spends Endurance, so the meter refills at the base 10/s from 2.05s.
    const plain = endurance([], false)
    close(plain.end?.consumed, 20, "The charging phase drains 20 Endurance")
    close(plain.end?.final, 100, "An unspent release refills at the base 10/s")

    // Sword Morph spends 20 more at the release, and that direct spend suppresses
    // the 10/s for 1.2 seconds: 60 Endurance, idle until 2.4, then 10/s to 4.05.
    const morphed = endurance(["SwordMorphT0"], true)
    close(morphed.end?.consumed, 40, "Sword Morph adds 20 Endurance at the release")
    close(morphed.end?.final, 76.5, "The 1.2s suppression leaves the meter 1.5s short of a full refill")
  })
})
