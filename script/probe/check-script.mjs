import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { buildRotationTimeline, requirementsPass } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { scriptSelectionChangesTimeline } = await viteServer.ssrLoadModule("/src/data/scriptDefinitions.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const scripts = (await viteServer.ssrLoadModule("/data/script.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  assert(scripts.Revelry.altersTimeline === true, "Revelry must declare that it alters the timeline.");
  assert(
    scriptSelectionChangesTimeline("None", "Revelry", scripts),
    "A Revelry comparison must rebuild the timeline when Revelry is the candidate.",
  );
  assert(
    scriptSelectionChangesTimeline("Revelry", "None", scripts),
    "A comparison from baseline Revelry must rebuild the timeline when the candidate removes it.",
  );
  assert(
    !scriptSelectionChangesTimeline("Wraithstrike", "Insight", scripts),
    "Scripts that only affect damage calculation must continue reusing the baseline timeline.",
  );

  assert(
    requirementsPass(
      scripts.Wraithstrike.effect.requirement,
      [],
      [],
      [],
      new Set(),
      [],
      {},
      { targetQiPercentage: 39 },
    ),
    "Wraithstrike must activate below 40% target Qi.",
  );
  assert(
    !requirementsPass(
      scripts.Insight.effect.requirement,
      [],
      [],
      ["MartialArts"],
      new Set(),
      [],
      {},
      { targetHPPercentage: 80 },
    ),
    "Insight must require the Mystic skill tag.",
  );

  const timeline = buildRotationTimeline({
    rotation: {
      name: "Revelry probe",
      steps: [
        { type: "event", event: "SelfHP", before: { action: 1 }, currentHP: 200 },
        { type: "event", event: "TakeDamage", before: { action: 1 }, damage: 1 },
        { type: "skill", skill: "Hit" },
      ],
      start: { step: 2 },
    },
    skills: {
      Hit: {
        name: "Hit",
        castTime: 1,
        action: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "damage", phyCoef: 1, time: 1 },
        ],
        tags: [],
      },
    },
    eventDefinitions: {
      SelfHP: {
        name: "Self HP",
        castTime: 0,
        action: [{ type: "setHP", time: 0 }],
        tags: ["Event"],
      },
      TakeDamage: {
        name: "Take Damage",
        castTime: 0,
        action: [{ type: "takeDamage", time: 0 }],
        tags: ["Event"],
      },
    },
    dots: {},
    effectDefinitions: generalBuffs,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [scripts.Revelry.effect],
    weapons: [],
    maxHP: 1000,
  });
  const hit = timeline.find((row) => row.id === "rotation-2");
  const takeDamageRow = timeline.find((row) => row.id === "rotation-1");
  assert(
    takeDamageRow?.sourceRowId === hit?.id && takeDamageRow?.startTime === 1,
    "Take Damage must remain attached to its selected skill action.",
  );
  assert(
    hit?.actionStates[0].currentHP === 1000 && hit?.actionStates[1].currentHP === 199,
    "Self HP and Take Damage must affect only their attached action and later state.",
  );
  assert(
    !hit?.actionStates[0].buffs.some((buff) => buff.name === "Revelry") &&
      hit?.actionStates[1].buffs.some((buff) => buff.name === "Revelry"),
    "Revelry Script must apply Revelry when Take Damage leaves self HP at 30% or below.",
  );

  const stats = {
    ...emptyStats,
    minPhys: 1000,
    maxPhys: 1000,
    precision: 1,
    critical: 1,
    critDmgBonus: 0.35,
  };
  const thresholdResult = calculateRotationBaseline({
    timeline: {
      rotation: {
        name: "Target HP Script probe",
        targetHP: 2500,
        steps: [{ type: "skill", skill: "DoubleHit" }],
        start: { step: 0 },
      },
      skills: {
        DoubleHit: {
          name: "Double Hit",
          castTime: 1,
          action: [
            { type: "damage", phyCoef: 1, time: 0 },
            { type: "damage", phyCoef: 1, time: 1 },
          ],
          tags: ["Mystic"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: generalBuffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [scripts.Insight.effect],
      weapons: [],
      maxHP: 1000,
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy: {
      name: "Probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  assert(
    thresholdResult.actionBreakdowns["rotation-0:0"].total > thresholdResult.actionBreakdowns["rotation-0:1"].total,
    `Target-HP Script requirements must be reevaluated after preceding calculated damage (${thresholdResult.actionBreakdowns["rotation-0:0"].total} -> ${thresholdResult.actionBreakdowns["rotation-0:1"].total}).`,
  );
  console.log("Script thresholds, absolute self HP, Take Damage, and Revelry checks passed.");
} finally {
  await viteServer.close();
}
