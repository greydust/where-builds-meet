import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const empiricalEdge = (await viteServer.ssrLoadModule("/data/innerway/empirical-edge.json")).default;
  const kiteBuffs = (await viteServer.ssrLoadModule("/data/buff/bamboocut-kite.json")).default;
  const { innerWayDefinitions } = await viteServer.ssrLoadModule("/src/data/innerWayDefinitions.ts");
  const { buildRotationTimeline, requirementsPass } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  assert(innerWayDefinitions.EmpiricalEdge === empiricalEdge, "Empirical Edge must be registered as an Inner Way.");
  assert(
    empiricalEdge.altersTimeline === true && empiricalEdge.tags.includes("BamboocutKite"),
    "Empirical Edge must rebuild the timeline and be available to Bamboocut Kite.",
  );
  const trigger = empiricalEdge.effect.EmpiricalEdgeT0.trigger[0];
  assert(
    trigger.requirement.some(
      (requirement) => requirement.target === "skillTag" && requirement.value === "MartialArtEffect",
    ) &&
      trigger.action[0]?.type === "apply" &&
      trigger.action[0]?.value === "Cognition",
    "Empirical Edge T0 must apply Cognition after Martial Art Effect damage.",
  );

  const cognition = kiteBuffs.Cognition;
  assert(
    cognition.duration === 5 && cognition.cooldown === 1 && cognition.maxStack === 5 && cognition.refresh === true,
    "Cognition's complete definition must last five seconds, support five stacks, refresh, and have a one-second cooldown.",
  );
  assert(cognition.stackEffects.length === 5, "Cognition must define all five cumulative stack states.");
  assert(
    empiricalEdge.effect.EmpiricalEdgeT0.effect[0].modify.maxStack === 3 &&
      empiricalEdge.effect.EmpiricalEdgeT1.effect[0].modify.duration === 8 &&
      empiricalEdge.effect.EmpiricalEdgeT3.effect[0].modify.maxStack === 5 &&
      empiricalEdge.effect.EmpiricalEdgeT4.effect[0].modify.cooldown === 0,
    "Empirical Edge must apply the Cognition duration, stack-cap, and cooldown tier modifiers.",
  );
  assert(
    empiricalEdge.effect.EmpiricalEdgeT2.effect[0].stat.minPhys === 22.3 &&
      empiricalEdge.effect.EmpiricalEdgeT2.effect[0].stat.maxPhys === 44.7 &&
      empiricalEdge.effect.EmpiricalEdgeT5.effect[0].effect.physDmgBonus === 0.025,
    "Empirical Edge must define its T2 attack and T5 Physical DMG bonuses as stat effects.",
  );

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
  for (const field of penetrationFields.slice(1))
    assert(
      martialArtPenetration[field] === 10,
      "Five Cognition stacks must grant Martial Art Effects 10 of every attribute penetration.",
    );
  for (const tags of [
    ["MartialArtEffect", "HeavenwillGauntlets", "Falcon"],
    ["MartialArtEffect", "VileCondemned"],
  ]) {
    const penetration = resolvedPenetration(tags);
    assert(
      penetration.physicalPenetration === 0,
      "Qualifying Cognition effects must not gain Physical Penetration before T6.",
    );
    for (const field of penetrationFields.slice(1))
      assert(
        penetration[field] === 20,
        "A qualifying Cognition effect must gain another 10 of every attribute penetration at max stacks.",
      );
    const t6Penetration = resolvedPenetration(tags, ["EmpiricalEdgeT6"]);
    assert(
      t6Penetration.physicalPenetration === 20,
      "Empirical Edge T6 must grant Physical Penetration equal to qualifying attribute penetration.",
    );
  }
  const falconOnly = resolvedPenetration(["MartialArtEffect", "Falcon"], ["EmpiricalEdgeT6"]);
  for (const value of Object.values(falconOnly))
    assert(value === 10, "Falcon alone must not receive Cognition's Heavenwill Gauntlets bonus.");

  const probeSkill = {
    name: "Cognition probe",
    castTime: 2,
    tags: ["DirectDamage", "MartialArtEffect"],
    action: [0, 0.5, 1, 2].map((time) => ({ type: "damage", time, phyCoef: 0 })),
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

  console.log("Empirical Edge tiers, trigger, cooldown, stacking, and penetration checks passed.");
} finally {
  await viteServer.close();
}
