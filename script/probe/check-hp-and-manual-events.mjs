import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const globalBuffs = (await viteServer.ssrLoadModule("/data/buff/global.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const eventDefinitions = {
    SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
    HP: { name: "HP", castTime: 0, action: [{ type: "setTargetHP", time: 0 }], tags: ["Event"] },
    Qi: {
      name: "Qi",
      castTime: 0,
      action: [
        { type: "setQi", time: 0 },
        {
          type: "apply",
          target: "target",
          value: "Exhausted",
          requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
          time: 0,
        },
      ],
      tags: ["Event"],
    },
    Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
    Debuff: { name: "Debuff", castTime: 0, action: [{ type: "apply", target: "target", time: 0 }], tags: ["Event"] },
    Controlled: {
      name: "Controlled",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "Controlled", time: 0 }],
      tags: ["Event"],
    },
  };
  const baseInput = {
    eventDefinitions,
    dots: {},
    effectDefinitions: { ...mysticBuffs, ...generalDebuffs },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };

  const hit = {
    name: "Hit",
    castTime: 2,
    action: [
      { type: "damage", phyCoef: 1, time: 0 },
      { type: "damage", phyCoef: 1, time: 1 },
    ],
    modifier: [],
    tags: ["DragonHeadTide", "HP"],
  };
  const hpRotation = {
    name: "HP probe",
    steps: [
      { type: "event", event: "SelfHP", before: { action: 1 }, currentHPRatio: 0.8 },
      { type: "skill", skill: "Hit" },
    ],
    start: { step: 1 },
  };
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const hpResult = calculateRotationBaseline({
    timeline: {
      ...baseInput,
      rotation: hpRotation,
      skills: { Hit: hit },
      setupEffects: globalBuffs.DragonHeadTide.effect,
    },
    startAnchor: { rowId: "rotation-1" },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const fullHPHit = hpResult.actionBreakdowns["rotation-1:0"].total;
  const missingHPHit = hpResult.actionBreakdowns["rotation-1:1"].total;
  assert(
    closeTo(missingHPHit / fullHPHit, 1.09),
    "Twenty missing HP percentage points must grant Dragon Head 9% damage at hit time.",
  );

  const targetHPResult = calculateRotationBaseline({
    timeline: {
      ...baseInput,
      rotation: { name: "Target HP probe", targetHP: 10000, steps: [{ type: "skill", skill: "Hit" }] },
      skills: { Hit: hit },
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const firstTargetHit = targetHPResult.actionBreakdowns["rotation-0:0"].total;
  const targetHPRow = targetHPResult.timeline.find((row) => row.id === "rotation-0");
  assert(
    closeTo(targetHPRow.actionStates[1].targetHPRatio, Math.max(0, 1 - firstTargetHit / 10000)),
    "Specified target HP must decrease by each preceding calculated damage result.",
  );
  const hpHitRow = hpResult.timeline.find((row) => row.id === "rotation-1");
  assert(
    hpHitRow.actionStates[0].currentHPRatio === 1 && hpHitRow.actionStates[1].currentHPRatio === 0.8,
    "The attached HP event must change only its target and subsequent action snapshots.",
  );

  const durationProbe = {
    name: "Duration probe",
    castTime: 13,
    action: [
      { type: "damage", phyCoef: 1, time: 0 },
      { type: "damage", phyCoef: 1, time: 2.9 },
      { type: "damage", phyCoef: 1, time: 3.1 },
      { type: "damage", phyCoef: 1, time: 9.9 },
      { type: "damage", phyCoef: 1, time: 10.1 },
      { type: "damage", phyCoef: 1, time: 12.4 },
      { type: "damage", phyCoef: 1, time: 12.6 },
    ],
    modifier: [],
    tags: [],
  };
  const manualTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: {
      name: "Manual effects",
      eventTimeReference: "battleStart",
      steps: [
        { type: "event", event: "Buff", before: { action: "start" }, buff: "Flute" },
        { type: "event", event: "Debuff", before: { action: "start" }, debuff: "Controlled" },
        { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 },
        { type: "skill", skill: "Probe" },
      ],
      start: { step: 3 },
    },
    skills: { Probe: durationProbe },
  });
  const probeRow = manualTimeline.find((row) => row.id === "rotation-3");
  assert(
    probeRow.actionStates[1].debuffs.some((effect) => effect.name === "Controlled"),
    "A manual Debuff event must use Controlled's default duration.",
  );
  assert(
    !probeRow.actionStates[2].debuffs.some((effect) => effect.name === "Controlled"),
    "Controlled must expire at its data-defined duration.",
  );
  assert(
    probeRow.actionStates[3].debuffs.some((effect) => effect.name === "Exhausted"),
    "Exhausted must use its data-defined default duration.",
  );
  assert(
    !probeRow.actionStates[4].debuffs.some((effect) => effect.name === "Exhausted"),
    "Exhausted must expire after its data-defined default duration.",
  );
  assert(
    probeRow.actionStates[3].targetQiRatio === 0,
    `Qi zero must remain active while Exhausted is active (saw ${probeRow.actionStates[3].targetQiRatio}).`,
  );
  assert(probeRow.actionStates[4].targetQiRatio === 1, "Exhausted expiration must restore Qi to 100%.");
  assert(
    probeRow.actionStates[5].buffs.some((effect) => effect.name === "Flute"),
    "A manual Buff event must use the selected buff's default duration.",
  );
  assert(
    !probeRow.actionStates[6].buffs.some((effect) => effect.name === "Flute"),
    "The manually applied buff must expire at its data-defined duration.",
  );

  console.log("Self HP, target HP, Qi exhaustion, and manual effect duration checks passed.");
} finally {
  await viteServer.close();
}
