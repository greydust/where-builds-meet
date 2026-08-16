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
  const { armorSetDefinitions, defaultBuildSetup, normalizeBuildSetup, setAvailableForTags } =
    await viteServer.ssrLoadModule("/src/gear.ts");
  const thundercrySkills = (await viteServer.ssrLoadModule("/data/skill/thundercry-blade.json")).default;
  const stormbreakerSkills = (await viteServer.ssrLoadModule("/data/skill/stormbreaker-spear.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const mightBuffs = (await viteServer.ssrLoadModule("/data/buff/stonesplit-might.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  assert(
    setAvailableForTags(armorSetDefinitions.Formbend, ["SnowpartingBlade", "PhalanxbaneBlade"], "StonesplitStrength"),
    "Formbend must be available to Stonesplit Strength.",
  );
  assert(
    setAvailableForTags(armorSetDefinitions.Formbend, ["ThundercryBlade", "StormbreakerSpear"], "StonesplitMight"),
    "Formbend must be available to Stonesplit Might.",
  );
  assert(
    !setAvailableForTags(armorSetDefinitions.Formbend, ["EverspringUmbrella", "UnfetteredRopeDart"], "BamboocutDust"),
    "Formbend must remain hidden for paths without an eligible armor set.",
  );
  const migrated = normalizeBuildSetup(
    { gearSets: { Cleftpeak: 2, RainWhisper: 2 }, bowRingSet: "Precision", arsenal: "Stonesplit" },
    defaultBuildSetup,
  );
  assert(
    migrated.weaponSets.Cleftpeak === 2 && migrated.weaponSets.RainWhisper === 2 && migrated.armorSets.Formbend === 0,
    "Legacy gearSets must migrate without losing the new armor-set default.",
  );
  assert(
    mightBuffs.Drumbeat.effect[0].effect.dmgBonus === 0.15 &&
      mightBuffs.Drumbeat.effect[0].requirement[0].value === "Charged",
    "Drumbeat must grant 15% Charged Skill damage.",
  );
  const vulnerableDefinitions = (await viteServer.ssrLoadModule("/data/debuff/stonesplit-might.json")).default;
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
  });
  assert(
    !thunderShockTimeline[0].actionStates[0].debuffs.some((effect) => effect.name === "Vulnerable"),
    "Thunder Shock hit 1 must deal damage before applying Vulnerable.",
  );
  assert(
    thunderShockTimeline[0].actionStates[2].debuffs.some((effect) => effect.name === "Vulnerable"),
    "Thunder Shock hit 2 must benefit from Vulnerable applied after hit 1.",
  );
  const probeSkill = { name: "Probe", castTime: 9, action: [{ type: "damage", phyCoef: 0, time: 9 }], tags: [] };
  const shieldAtProbe = (conditions) => {
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
      effectDefinitions: { ...generalBuffs, ...mightBuffs },
      innerWayConditions: conditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    });
    return timeline[1].actionStates[0].buffs.some((effect) => effect.name === "Shield");
  };
  assert(!shieldAtProbe([]), "The base eight-second Shield must expire before the probe hit.");
  assert(shieldAtProbe(["FormBend4"]), "Formbend four-piece must extend Shield by two seconds.");
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
      LateProbe: { ...probeSkill, castTime: 13, action: [{ ...probeSkill.action[0], time: 13 }] },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { ...generalBuffs, ...mightBuffs },
    innerWayConditions: ["ArtOfResistanceT0", "ArtOfResistanceT4", "FormBend4"],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["thundercry", "stormbreaker"],
  });
  const lateBuffs = durationTimeline[2].actionStates[0].buffs;
  assert(
    lateBuffs.some((effect) => effect.name === "Shield"),
    "AoR and Formbend must extend Shield at the late probe.",
  );
  assert(
    !lateBuffs.some((effect) => effect.name === "Breakthrough"),
    "Breakthrough must expire after 12 seconds without receiving Shield extensions.",
  );
  console.log("Formbend four-piece Shield extension check passed.");
} finally {
  await viteServer.close();
}
