import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const weaponSets = (await viteServer.ssrLoadModule("/data/gear-set.json")).default;
  const kiteBuffs = (await viteServer.ssrLoadModule("/data/buff/bamboocut-kite.json")).default;
  const generalSkills = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { normalizeBuildSetup, normalizeBuildSetupOverrides } = await viteServer.ssrLoadModule("/src/gear.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const fourPiece = weaponSets.Etherwrath.options["4"].effect;
  const buff = kiteBuffs.Etherwrath;
  assert(
    weaponSets.Etherwrath.options["2"].effect.stat.minPhys === 78,
    "Etherwrath 2-piece must add 78 minimum Physical Attack.",
  );
  assert(fourPiece.condition === "Etherwrath4P", "Etherwrath 4-piece must expose its setup condition.");
  assert(fourPiece.trigger.event === "damage", "Etherwrath 4-piece must trigger on every damage action.");
  assert(buff.duration === 8 && buff.maxStack === 5, "Etherwrath must last eight seconds and cap at five stacks.");
  assert(buff.stackEffects.length === 5, "Etherwrath must define all five cumulative stack states.");
  assert(
    ["BamboocutKite", "HeavenwillGauntlets", "SkygraspRopeDart"].every((tag) =>
      weaponSets.Etherwrath.tags.includes(tag),
    ),
    "Etherwrath must remain available to Bamboocut Kite.",
  );
  assert(
    ["StonesplitStrength", "SnowpartingBlade", "PhalanxbaneBlade"].every((tag) =>
      weaponSets.Etherwrath.tags.includes(tag),
    ),
    "Etherwrath must be available to Stonesplit Strength.",
  );
  assert(
    ["BamboocutKite", "HeavenwillGauntlets", "SkygraspRopeDart"].every((tag) =>
      weaponSets.Cleftpeak.tags.includes(tag),
    ),
    "Cleftpeak must be available to Bamboocut Kite.",
  );
  const sparseSetup = normalizeBuildSetup({ weaponSets: { Etherwrath: 4 } });
  assert(
    sparseSetup.weaponSets.Etherwrath === 4 &&
      sparseSetup.weaponSets.Cleftpeak === 0 &&
      sparseSetup.weaponSets.RainWhisper === 0,
    "A sparse build set map must preserve Etherwrath and treat omitted sets as zero.",
  );
  const sparseOverride = normalizeBuildSetupOverrides({ weaponSets: { Etherwrath: 4 } });
  assert(
    sparseOverride.weaponSets?.Etherwrath === 4,
    "A sparse saved set override must remain valid when new set definitions are added.",
  );

  const hit = {
    name: "Etherwrath hit probe",
    castTime: 6,
    action: Array.from({ length: 6 }, (_, index) => ({
      type: "damage",
      phyCoef: 0,
      phyBonus: 0,
      attrBonus: 0,
      time: index + 1,
    })),
    modifier: [],
    tags: ["DirectDamage"],
  };
  const observe = {
    name: "Etherwrath observer",
    castTime: 0,
    action: [{ type: "damage", phyCoef: 0, phyBonus: 0, attrBonus: 0, time: 0 }],
    modifier: [],
    tags: ["DirectDamage"],
  };
  const timelineInput = (rotation, skills) => ({
    rotation,
    skills,
    eventDefinitions: {},
    dots: {},
    effectDefinitions: kiteBuffs,
    innerWayConditions: ["Etherwrath4P"],
    innerWayRules: [],
    setupEffects: [fourPiece],
    weapons: ["heavenwill", "skygrasp"],
  });
  const stackingTimeline = buildRotationTimeline(
    timelineInput({ name: "Stacking probe", steps: [{ type: "skill", skill: "Hit" }] }, { Hit: hit }),
  );
  const stackingRow = stackingTimeline.find((row) => row.step.skill === "Hit");
  assert(
    stackingRow.actionStates[5].buffs.find((effect) => effect.name === "Etherwrath")?.stack === 5,
    "The sixth damage action must see the five stacks granted by the previous five hits.",
  );

  const dodgeTimeline = buildRotationTimeline(
    timelineInput(
      {
        name: "Perfect Dodge probe",
        steps: [
          { type: "skill", skill: "PerfectDodgeCancel" },
          { type: "skill", skill: "Observe" },
        ],
      },
      { PerfectDodgeCancel: generalSkills.PerfectDodgeCancel, Observe: observe },
    ),
  );
  const dodgeObserver = dodgeTimeline.find((row) => row.step.skill === "Observe");
  assert(
    dodgeObserver.actionStates[0].buffs.find((effect) => effect.name === "Etherwrath")?.stack === 5,
    "Perfect Dodge must apply five Etherwrath stacks directly.",
  );

  const stats = {
    ...emptyStats,
    minPhys: 100,
    maxPhys: 100,
    minBellstrike: 100,
    maxBellstrike: 100,
    minStonesplit: 100,
    maxStonesplit: 100,
    minSilkbind: 100,
    maxSilkbind: 100,
    minBamboocut: 100,
    maxBamboocut: 100,
    precision: 1,
  };
  const enemy = {
    name: "Etherwrath probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const baseContext = {
    stats,
    attunement: {},
    skillTags: ["DirectDamage"],
    weapons: ["heavenwill", "skygrasp"],
    buffs: [],
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    effects: [],
  };
  const maxStackEffects = buff.stackEffects[4];
  const attackEffects = maxStackEffects.filter((effect) => !effect.requirement).map((effect) => effect.effect);
  const penetrationEffects = maxStackEffects.filter((effect) => effect.requirement).map((effect) => effect.effect);
  const action = { phyCoef: 1, phyBonus: 0, attrBonus: 0 };
  const baseline = calculateDamageBreakdown(action, baseContext).total;
  const attackBoosted = calculateDamageBreakdown(action, { ...baseContext, effects: attackEffects }).total;
  const martialEffectBoosted = calculateDamageBreakdown(action, {
    ...baseContext,
    skillTags: ["DirectDamage", "MartialArtEffect"],
    effects: [...attackEffects, ...penetrationEffects],
  }).total;
  assert(
    Math.abs(attackBoosted / baseline - 1.06) < 1e-9,
    "Five Etherwrath stacks must multiply every attack value by 1.06.",
  );
  assert(
    Math.abs(martialEffectBoosted / attackBoosted - 1.03) < 1e-9,
    "Martial Art Effects at five stacks must gain six penetration in every damage channel.",
  );

  console.log("Etherwrath set, stack, dodge, attack, and penetration checks passed.");
} finally {
  await viteServer.close();
}
