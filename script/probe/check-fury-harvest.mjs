import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const generalSkills = JSON.parse(await readFile("data/skill/general.json", "utf8"));
  const mysticSkills = JSON.parse(await readFile("data/skill/mystic.json", "utf8"));
  const generalBuffs = JSON.parse(await readFile("data/buff/general.json", "utf8"));
  const furyHarvest = JSON.parse(await readFile("data/innerway/fury-harvest.json", "utf8"));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const activeTier = 5;
  const activeTiers = Array.from({ length: activeTier + 1 }, (_, tier) => furyHarvest.effect[`FuryHarvestT${tier}`]);
  const statEffects = activeTiers.flatMap((definition) =>
    (definition.effect ?? []).filter((effect) => effect.stat).map((effect) => ({ stat: effect.stat })),
  );
  const stats = calculateStatsWithEffects(emptyStats, statEffects, 0).stats;
  assert(stats.physicalDefense === 33.5, "Fury Harvest T2 must increase Physical Defense through the stat pipeline.");
  assert(
    stats.physicalResistance === 5.1,
    "Fury Harvest T5 must retain its hidden Physical Resistance in the stat pipeline.",
  );

  const innerWayRules = activeTiers.flatMap((definition, tier) =>
    (definition.trigger ?? []).map((trigger) => ({
      trigger: { ...trigger, target: trigger.target ?? "self", action: trigger.action ?? [] },
      effect: {},
      source: "FuryHarvest",
      tier,
    })),
  );
  const innerWayConditions = Array.from({ length: activeTier + 1 }, (_, tier) => `FuryHarvestT${tier}`);
  const timeline = buildRotationTimeline({
    rotation: {
      name: "Fury Harvest vitality probe",
      steps: [
        { type: "skill", skill: "PerfectDodgeCancel" },
        { type: "skill", skill: "DeflectSuccessful" },
        { type: "skill", skill: "Exchange" },
        { type: "skill", skill: "Observe" },
      ],
    },
    skills: {
      PerfectDodgeCancel: generalSkills.PerfectDodgeCancel,
      DeflectSuccessful: generalSkills.DeflectSuccessful,
      Exchange: {
        name: "Exchange",
        castTime: 0,
        action: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "takeDamage", damage: 100, time: 0 },
        ],
        modifier: [],
        tags: ["General"],
      },
      Observe: {
        name: "Observe",
        castTime: 0,
        action: [{ type: "setResource", value: "Observed", amount: 1, time: 0 }],
        modifier: [],
        tags: ["General"],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions,
    innerWayRules,
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 0 },
    resourceMaximums: { Vitality: 40 },
    maxHP: 1000,
  });

  assert(
    timeline.at(-1).actionStates[0].resources.Vitality === 8.2,
    "Fury Harvest must add one Vitality to successful dodge and deflect gains, then 0.1 to outgoing and incoming damage events.",
  );

  const turnaroundTimeline = buildRotationTimeline({
    rotation: {
      name: "Fury Harvest Turnaround probe",
      steps: [
        { type: "skill", skill: "SereneBreeze" },
        { type: "skill", skill: "DragonHeadTide" },
        { type: "skill", skill: "Wait" },
        { type: "skill", skill: "BurstingNine" },
        { type: "skill", skill: "Observe" },
      ],
    },
    skills: {
      SereneBreeze: mysticSkills.SereneBreeze,
      DragonHeadTide: mysticSkills.DragonHeadTide,
      BurstingNine: mysticSkills.BurstingNine,
      Wait: { name: "Wait", castTime: 5.1, action: [], modifier: [], tags: ["General"] },
      Observe: {
        name: "Observe",
        castTime: 0,
        action: [{ type: "setResource", value: "Observed", amount: 1, time: 0 }],
        modifier: [],
        tags: ["General"],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: generalBuffs,
    innerWayConditions: ["FuryHarvestT6"],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 100 },
    resourceMaximums: { Vitality: 100 },
  });
  const dragonHead = turnaroundTimeline.find((row) => row.step.type === "skill" && row.step.skill === "DragonHeadTide");
  const burstingNine = turnaroundTimeline.find((row) => row.step.type === "skill" && row.step.skill === "BurstingNine");
  assert(
    dragonHead.actionStates[2].resources.Vitality === 30,
    "Turnaround from the preceding Mystic must cap an 80-Vitality skill's refund at 10.",
  );
  assert(
    burstingNine.actionStates[2].resources.Vitality === 10 && turnaroundTimeline.at(-1).resources.Vitality === 10,
    "Turnaround must expire five seconds after its last refresh and stop refunding later Mystic casts.",
  );

  console.log("Fury Harvest T1-T6 behavior checks passed.");
} finally {
  await viteServer.close();
}
