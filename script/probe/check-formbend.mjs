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
  const {
    armorSetDefinitions,
    availableSetEntriesForTags,
    defaultBuildSetup,
    normalizeBuildSetup,
    selectSetTier,
    setAvailableForTags,
    setSelectionChangesTimeline,
    weaponSetDefinitions,
  } = await viteServer.ssrLoadModule("/src/gear.ts");
  const thundercrySkills = (await viteServer.ssrLoadModule("/data/skill/thundercry-blade.json")).default;
  const stormbreakerSkills = (await viteServer.ssrLoadModule("/data/skill/stormbreaker-spear.json")).default;
  const generalSkills = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
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
  const mightTags = ["ThundercryBlade", "StormbreakerSpear"];
  assert(
    availableSetEntriesForTags(weaponSetDefinitions, mightTags, "StonesplitMight")
      .map(([setName]) => setName)
      .join(",") === "RainWhisper",
    "The shared set filter must return the Might weapon-set list.",
  );
  assert(
    availableSetEntriesForTags(armorSetDefinitions, mightTags, "StonesplitMight")
      .map(([setName]) => setName)
      .join(",") === "Formbend",
    "The shared set filter must return the Might armor-set list.",
  );
  const migrated = normalizeBuildSetup(
    { gearSets: { Cleftpeak: 2, RainWhisper: 2 }, bowRingSet: "Precision", arsenal: "Stonesplit" },
    defaultBuildSetup,
  );
  assert(
    migrated.weaponSets.Cleftpeak === 2 && migrated.weaponSets.RainWhisper === 2 && migrated.armorSets.Formbend === 0,
    "Legacy gearSets must migrate without losing the new armor-set default.",
  );
  const cleftpeakToRainWhisper = selectSetTier(
    { Cleftpeak: 4, RainWhisper: 0 },
    "RainWhisper",
    4,
    weaponSetDefinitions,
  );
  assert(
    setSelectionChangesTimeline({ Cleftpeak: 4, RainWhisper: 0 }, cleftpeakToRainWhisper, weaponSetDefinitions),
    "Replacing Cleftpeak with Rain Whisper must rebuild the timeline because Cleftpeak is removed.",
  );
  const rainWhisperTierChange = selectSetTier({ Cleftpeak: 0, RainWhisper: 2 }, "RainWhisper", 4, weaponSetDefinitions);
  assert(
    !setSelectionChangesTimeline({ Cleftpeak: 0, RainWhisper: 2 }, rainWhisperTierChange, weaponSetDefinitions),
    "A Rain Whisper-only tier change must continue to reuse the baseline timeline.",
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
  const aoRShieldAtProbe = (conditions) => {
    assert(generalSkills.AoRT4Shield.castTime === 3, "AoR T4 Shield must have a three-second cast time.");
    assert(
      generalSkills.AoRT4Shield.action[0].type === "apply" &&
        generalSkills.AoRT4Shield.action[0].time === 0 &&
        generalSkills.AoRT4Shield.action[0].duration === 14,
      "AoR T4 Shield must apply a 14-second Shield at cast start.",
    );
    const timeline = buildRotationTimeline({
      rotation: {
        name: "AoR T4 Shield probe",
        steps: [
          { type: "skill", skill: "AoRT4Shield" },
          { type: "skill", skill: "Probe" },
        ],
      },
      skills: {
        AoRT4Shield: generalSkills.AoRT4Shield,
        Probe: { ...probeSkill, castTime: 12, action: [{ ...probeSkill.action[0], time: 12 }] },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: generalBuffs,
      innerWayConditions: conditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    });
    assert(timeline[0].effectiveCastTime === 3, "AoR T4 Shield must retain its three-second timeline duration.");
    return timeline[1].actionStates[0].buffs.some((effect) => effect.name === "Shield");
  };
  assert(!aoRShieldAtProbe([]), "AoR T4 Shield must expire after its 14-second duration.");
  assert(aoRShieldAtProbe(["FormBend4"]), "Formbend four-piece must extend AoR T4 Shield by two seconds.");
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
    lateBuffs.some((effect) => effect.name === "Breakthrough" && effect.expiresAt === 22),
    "Art of Resistance T0/T4 and Formbend must extend Breakthrough from 12 to 20 seconds.",
  );
  assert(
    lateBuffs.some((effect) => effect.name === "Shield" && effect.expiresAt === 18),
    "Art of Resistance and Formbend must extend Shield from 8 to 16 seconds.",
  );
  console.log("Art of Resistance and Formbend duration checks passed.");
} finally {
  await viteServer.close();
}
