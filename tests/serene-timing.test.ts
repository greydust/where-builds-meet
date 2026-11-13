import { describe, expect, it } from "vitest"

import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"
import type { WeaponFamily } from "@/types"

const timings: [WeaponFamily, number, number][] = [
  ["Spear", 0.315, 0.452],
  ["Sword", 0.342, 0.475],
  ["Fan", 0.403, 0.412],
  ["DualBlades", 0.4, 0.721],
  ["MoBlade", 0.351, 0.475],
  ["Umbrella", 0.35, 0.721],
  ["RopeDart", 0.351, 0.475],
  ["HengBlade", 0.342, 0.721],
  ["Gauntlet", 0.342, 0.721],
]
function run(weapon: WeaponFamily, buff?: string, duration = 5) {
  return buildRotationTimeline({
    rotation: {
      name: "Serene timing",
      ping: 0,
      steps: [
        { type: "skill", skill: "Setup" },
        { type: "skill", skill: "SereneBreeze" },
        { type: "skill", skill: "Observe" },
      ],
    },
    skills: {
      ...allSkillDefinitions,
      Setup: {
        castTime: 0,
        martialArt: "vernalUmbrella",
        weapon,
        tags: ["MartialArts"],
        action: [
          { type: "apply", target: "self", value: "FuryHarvestT6", time: 0 },
          ...(buff ? [{ type: "apply", target: "self", value: buff, duration, time: 0 }] : []),
        ],
      },
      Observe: { castTime: 0, action: [] },
    },
    initialResources: { Blossoms: 100 },
    resourceMaximums: { Blossoms: 100 },
    effectDefinitions,
    eventDefinitions: {},
    dots: {},
    setupEffects: [],
    innerWayRules: [],
    innerWayConditions: [],
    weapons: [],
  })
}
describe("Serene Breeze timing", () => {
  it.each([false, true])(
    "freezes switched action timing before modifiers across weapon switches (composite=%s)",
    composite => {
      const rows = buildRotationTimeline({
        rotation: {
          name: "Switched hit",
          ping: 0,
          start: { step: 0, action: 0 },
          steps: [
            { type: "skill", skill: composite ? "Composite" : "Probe" },
            { type: "skill", skill: "Switch" },
            { type: "skill", skill: "Observe" },
            { type: "skill", skill: "Observe" },
          ],
        },
        skills: {
          Composite: { subAction: ["Probe"] },
          Probe: {
            castTime: 0.1,
            action: [
              {
                type: "apply",
                target: "self",
                value: "Marker",
                time: { function: "switch", param1: "currentWeapon", param2: { Fan: 0.6, Sword: 0.9 }, fallback: 0.3 },
              },
            ],
            modifier: [{ effect: { castTimeMultiplier: 0.5 } }],
          },
          Switch: { castTime: 0.1, martialArt: "namelessSword", weapon: "Sword", tags: ["MartialArts"], action: [] },
          Observe: { castTime: 0.2, action: [] },
        },
        weapons: ["inkwellFan"],
        martialArtState: { inkwellFan: { weapon: "Fan" } },
        effectDefinitions: { Marker: { duration: 5 } },
        eventDefinitions: {},
        dots: {},
        setupEffects: [],
        innerWayRules: [],
        innerWayConditions: [],
      })
      const probe = rows.find(row => row.step.skill === (composite ? "Composite" : "Probe"))!
      expect(probe.actions[0].time).toBe(0.3)
      const observations = rows.filter(row => row.step.skill === "Observe")
      expect(observations[0].buffs.has("Marker")).toBe(false)
      expect(observations[1].buffs.has("Marker")).toBe(true)
      expect(observations[1].currentWeapon).toBe("Sword")
    },
  )
  it.each(timings)("uses %s hit and interrupt times", (weapon, hit, cast) => {
    const rows = run(weapon)
    const serene = rows.find(row => row.step.skill === "SereneBreeze")!
    expect(serene.effectiveCastTime).toBeCloseTo(cast, 12)
    expect(
      serene.actions
        .filter(action => action.type === "damage" || action.value === "Turnaround")
        .map(action => action.time),
    ).toEqual([expect.closeTo(hit, 12), expect.closeTo(hit, 12)])
    expect(rows.find(row => row.step.skill === "Observe")!.startTime).toBeCloseTo(cast, 12)
    expect(rows.find(row => row.step.skill === "Observe")!.buffs.has("Turnaround")).toBe(true)
  })
  it.each(["UnfadingFlowerMode", "EchoesOfAThousandPlants"])("uses the active umbrella sword branch for %s", buff => {
    const row = run("Umbrella", buff, 0.1).find(row => row.step.skill === "SereneBreeze")!
    expect(row.effectiveCastTime).toBeCloseTo(0.475, 12)
    expect(row.actions[0].time).toBeCloseTo(0.342, 12)
    const fan = run("Fan", buff).find(row => row.step.skill === "SereneBreeze")!
    expect(fan.effectiveCastTime).toBeCloseTo(0.412, 12)
    expect(fan.actions[0].time).toBe(0.403)
  })
})
