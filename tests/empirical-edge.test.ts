import { assert, describe, expect, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-empirical-edge.mjs.
describe("empirical-edge", () => {
  it("Empirical Edge tiers, trigger, cooldown, stacking, and penetration checks passed", async () => {
    const empiricalEdge = (await import("../data/innerway/empirical-edge.json")).default;
    const kiteBuffs = (await import("../data/buff/bamboocut-kite.json")).default;
    const { innerWayDefinitions } = await import("../src/data/innerWayDefinitions.ts");
    const { buildRotationTimeline, requirementsPass } = await probeLoad("/src/calculations/rotationTimeline.ts");

    assert(innerWayDefinitions.EmpiricalEdge === empiricalEdge, "Empirical Edge must be registered as an Inner Way.");
    const trigger = empiricalEdge.effect.EmpiricalEdgeT0.trigger[0];

    const cognition = kiteBuffs.Cognition;

    const penetrationFields = [
      "physicalPenetration",
      "bellstrikePenetration",
      "stonesplitPenetration",
      "silkbindPenetration",
      "bamboocutPenetration",
    ];
    const resolvedPenetration = (tags, conditions = []) =>
      cognition.stackEffects[4]
        .filter((effect) => requirementsPass(effect.requirement, [], [], tags, new Set(conditions)))
        .reduce(
          (total, effect) => {
            for (const field of penetrationFields) total[field] += effect.effect[field] ?? 0;
            return total;
          },
          Object.fromEntries(penetrationFields.map((field) => [field, 0])),
        );
    const martialArtPenetration = resolvedPenetration(["MartialArtEffect"]);
    assert(
      martialArtPenetration.physicalPenetration === 0,
      "Cognition must not grant Physical Penetration before Empirical Edge T6.",
    );
    for (const tags of [
      ["MartialArtEffect", "HeavenwillGauntlets", "Falcon"],
      ["MartialArtEffect", "VileCondemned"],
    ]) {
      const penetration = resolvedPenetration(tags);
      expect(penetration.bamboocutPenetration).toBeGreaterThan(martialArtPenetration.bamboocutPenetration);
      const t6Penetration = resolvedPenetration(tags, ["EmpiricalEdgeT6"]);
      expect(t6Penetration.physicalPenetration).toBe(t6Penetration.bamboocutPenetration);

      assert(
        penetration.physicalPenetration === 0,
        "Qualifying Cognition effects must not gain Physical Penetration before T6.",
      );
    }

    const probeSkill = {
      name: "Cognition probe",
      castTime: 2,
      tags: ["DirectDamage", "MartialArtEffect"],
      action: [0, 0.5, 1, 2].map((time) => ({ type: "damage", time, phyCoef: 0, attrCoef: 0 })),
    };
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
    });
    const row = timeline.find((candidate) => candidate.id === "rotation-0");
    const cognitionStackAt = (actionIndex) =>
      row.actionStates[actionIndex].buffs.find((buff) => buff.name === "Cognition")?.stack ?? 0;
    assert(
      [0, 1, 1, 2].every((stack, index) => cognitionStackAt(index) === stack),
      "Cognition must apply after damage and reject reapplications during its one-second cooldown.",
    );
  });
});
