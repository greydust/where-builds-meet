import { describe, expect, it } from "vitest"

import type { TimelineRow } from "@/calculations/rotationTimeline"

import { effectState } from "../src/calculations/trackedEffectState"
import { probeLoad } from "./helpers/probe-loader.js"

// Ported from script/probe/check-empirical-edge.mjs.
describe("empirical-edge", () => {
  it("Empirical Edge tiers, trigger, cooldown, stacking, and penetration checks passed", async () => {
    const empiricalEdge = (await import("../data/innerway/empirical-edge.json")).default
    const kiteBuffs = (await import("../data/buff/bamboocut-kite.json")).default
    const { innerWayDefinitions } = await import("../src/data/innerWayDefinitions.ts")
    const { buildRotationTimeline, requirementsPass } = await probeLoad<
      typeof import("../src/calculations/rotationTimeline")
    >("/src/calculations/rotationTimeline.ts")

    expect(
      innerWayDefinitions.EmpiricalEdge === empiricalEdge,
      "Empirical Edge must be registered as an Inner Way.",
    ).toBeTruthy()
    const trigger = empiricalEdge.effect.EmpiricalEdgeT0.trigger[0]

    /** One Cognition stack entry: a gate plus the sheet it unlocks. */
    type CognitionStack = { requirement?: unknown; effect: Record<string, number> }
    const cognition = kiteBuffs.Cognition as unknown as { stackEffects: CognitionStack[][] }

    const penetrationFields = [
      "physicalPenetration",
      "bellstrikePenetration",
      "stonesplitPenetration",
      "silkbindPenetration",
      "bamboocutPenetration",
    ]
    const resolvedPenetration = (tags: string[], conditions: string[] = []) =>
      cognition.stackEffects[4]
        .filter(effect =>
          requirementsPass(effect.requirement, effectState([]), effectState([]), tags, new Set(conditions)),
        )
        .reduce(
          (total, effect) => {
            for (const field of penetrationFields) total[field] += effect.effect[field] ?? 0
            return total
          },
          Object.fromEntries(penetrationFields.map(field => [field, 0])),
        )
    const martialArtPenetration = resolvedPenetration(["MartialArtEffect"])
    expect(
      martialArtPenetration.physicalPenetration === 0,
      "Cognition must not grant Physical Penetration before Empirical Edge T6.",
    ).toBeTruthy()
    for (const tags of [
      ["MartialArtEffect", "HeavenwillGauntlets", "Falcon"],
      ["MartialArtEffect", "VileCondemned"],
    ] as string[][]) {
      const penetration = resolvedPenetration(tags)
      expect(penetration.bamboocutPenetration).toBeGreaterThan(martialArtPenetration.bamboocutPenetration)
      const t6Penetration = resolvedPenetration(tags, ["EmpiricalEdgeT6"])
      expect(t6Penetration.physicalPenetration).toBe(t6Penetration.bamboocutPenetration)

      expect(
        penetration.physicalPenetration === 0,
        "Qualifying Cognition effects must not gain Physical Penetration before T6.",
      ).toBeTruthy()
    }

    const probeSkill = {
      name: "Cognition probe",
      castTime: 2,
      tags: ["DirectDamage", "MartialArtEffect"],
      action: [0, 0.5, 1, 2].map(time => ({ type: "damage", time, phyCoef: 0, attrCoef: 0 })),
    }
    const timeline = buildRotationTimeline({
      rotation: { name: "Cognition probe", steps: [{ type: "skill", skill: "Probe" }] },
      skills: { Probe: probeSkill },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Cognition: cognition },
      innerWayConditions: ["EmpiricalEdgeT0"],
      innerWayRules: [
        {
          source: "EmpiricalEdge",
          tier: 0,
          requirement: trigger.requirement,
          trigger: { target: trigger.target, action: trigger.action },
          effect: {},
        },
      ],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
    })
    const row = timeline.find(candidate => candidate.id === "rotation-0")
    expect(row, "The Cognition probe must schedule its rotation row.").toBeTruthy()
    const cognitionStackAt = (actionIndex: number) =>
      (row as TimelineRow).actionStates[actionIndex]?.buffs.get("Cognition")?.stack ?? 0
    expect(
      [0, 1, 1, 2].every((stack, index) => cognitionStackAt(index) === stack),
      "Cognition must apply after damage and reject reapplications during its one-second cooldown.",
    ).toBeTruthy()
  })
})
