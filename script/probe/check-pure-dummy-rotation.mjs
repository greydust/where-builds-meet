import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const rotation = (await viteServer.ssrLoadModule("/data/rotation/stonesplit-strength/pure-dummy-1-min.json")).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const stonesplitBuffs = (await viteServer.ssrLoadModule("/data/buff/stonesplit-strength.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const stonesplitDebuffs = (await viteServer.ssrLoadModule("/data/debuff/stonesplit-strength.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const expectedSkills = [
    "FluteOfTheTides",
    "PhalanxbaneSpecial",
    "SnowpartingConversion",
    "SnowpartingQ",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingSpecial",
    "SnowpartingHeavyVC",
    "SnowpartingQStab",
    "PhalanxbaneQ",
    "SnowpartingConversion",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SoaringSpin2",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "LeapingToad",
    "Deflect",
    "PhalanxbaneSpecial",
    "SnowpartingConversion",
    "SnowpartingQ",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingSpecial",
    "SnowpartingHeavyVC",
    "SnowpartingQStab",
    "PhalanxbaneQ",
    "SnowpartingConversion",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "FluteOfTheTidesCancel",
    "Deflect",
    "PhalanxbaneSpecial",
    "SnowpartingConversion",
    "SnowpartingQ",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingSpecial",
    "SnowpartingHeavyVC",
    "SnowpartingQStab",
    "PhalanxbaneQ",
    "SnowpartingConversion",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SnowpartingHeavyVC",
    "SnowpartingLightCharged",
    "SoaringSpin2",
  ];
  const skillIds = rotation.steps.filter((step) => step.type === "skill").map((step) => step.skill);
  assert(rotation.name === "Pure Dummy 1 min", "The preset name must match the requested name.");
  assert(JSON.stringify(skillIds) === JSON.stringify(expectedSkills), "The translated Tilla sequence has changed.");
  assert(
    rotation.start?.step === 4 && rotation.start.action === 0 && rotation.steps[4]?.skill === "SnowpartingQ",
    "The prepull slide hit must be the fight-start anchor.",
  );
  assert(
    rotation.steps.some((step) => step.type === "event" && step.event === "Move" && step.distance === 19),
    "The rotation must begin at 19m.",
  );
  assert(
    rotation.steps.some((step) => step.type === "event" && step.event === "Move" && step.distance === 3),
    "The first Fleeting Trace must begin at 3m.",
  );
  const exhaustedIndex = rotation.steps.findIndex((step) => step.type === "event" && step.event === "Exhausted");
  assert(
    exhaustedIndex > 0 &&
      rotation.steps[exhaustedIndex].after?.action === 4 &&
      rotation.steps[exhaustedIndex + 1]?.skill === "SnowpartingLightCharged",
    "The dummy break must attach after Grave Frost's fourth damage action.",
  );
  assert(
    rotation.steps.at(-1)?.event === "BattleEnd" && rotation.steps.at(-1)?.startTime === 60,
    "The dummy rotation must end at 60s.",
  );

  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1500, precision: 1 };
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 405,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0.65,
  };
  const result = calculateRotationBaseline({
    timeline: {
      rotation,
      skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
      eventDefinitions: {
        Exhausted: {
          name: "Exhausted",
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }],
        },
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] },
        BattleEnd: { name: "Battle End", castTime: 0, action: [] },
      },
      dots,
      effectDefinitions: {
        ...mysticBuffs,
        ...generalBuffs,
        ...stonesplitBuffs,
        ...generalDebuffs,
        ...stonesplitDebuffs,
        ...dots,
      },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
    },
    startAnchor: { rowId: "rotation-4", actionIndex: 0 },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
    weapons: ["snowparting", "phalanxbane"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  assert(
    result.metrics.totalDamage > 0 && result.duration === 60,
    "The translated preset must calculate as a 60-second rotation.",
  );
  const firstPostBreakSpecialIndex = rotation.steps.findIndex(
    (step, stepIndex) => stepIndex > exhaustedIndex && step.type === "skill" && step.skill === "SnowpartingSpecial",
  );
  const firstPostBreakSpecial = result.timeline.find((row) => row.id === `rotation-${firstPostBreakSpecialIndex}`);
  assert(
    firstPostBreakSpecial?.actionStates[0]?.debuffs.some((effect) => effect.name === "Exhausted"),
    "The first post-break Fleeting Trace hit must see Exhausted.",
  );
  if (process.argv.includes("--show-break-candidates")) {
    const candidates = result.timeline.flatMap((row) =>
      row.kind === "rotation" && row.step.type === "skill"
        ? row.actions
            .map((action, actionIndex) => ({
              rowId: row.id,
              skill: row.step.skill,
              action: actionIndex,
              time: row.startTime + Number(action.time ?? 0) - result.anchorTime,
              type: action.type,
            }))
            .filter((entry) => entry.time >= 23 && entry.time <= 27)
        : [],
    );
    console.log(JSON.stringify(candidates, null, 2));
  }
  console.log("Pure Dummy 1 min source sequence and calculation checks passed.");
} finally {
  await viteServer.close();
}
