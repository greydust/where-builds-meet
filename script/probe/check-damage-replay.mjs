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
  const { simulateRotation } = await viteServer.ssrLoadModule("/src/calculations/simulationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-7;
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Replay probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const replaySkill = {
    name: "Replay Probe",
    castTime: 0,
    action: [
      { type: "replay", coef: 0.1, time: 1 },
      { type: "replay", coef: 0.1, time: 2 },
      { type: "replay", coef: 0.2, time: 3 },
    ],
    modifier: [],
    tags: ["Triggered", "DOT", "Replayed"],
  };
  const skills = {
    ApplyHeavensMight: {
      name: "Apply Heaven's Might",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "HeavensMight", time: 0 }],
      modifier: [],
      tags: ["General"],
    },
    ChargedProbe: {
      name: "Charged Probe",
      castTime: 0.2,
      action: [
        { type: "damage", phyCoef: 1, time: 0.1 },
        { type: "damage", phyCoef: 2, time: 0.2 },
      ],
      modifier: [],
      tags: ["DirectDamage", "Charged"],
    },
    Wait: { name: "Wait", castTime: 18, action: [], modifier: [], tags: ["General"] },
    ReplayProbe: replaySkill,
  };
  const listenerRule = {
    requirement: [
      { target: "skillTag", value: "Charged" },
      { target: "target", value: "HeavensMight" },
    ],
    listen: {
      event: "damage",
      cooldown: 18,
      requirement: [
        { target: "skillTag", value: "Charged" },
        { target: "target", value: "HeavensMight" },
      ],
      action: {
        type: "trigger",
        value: "ReplayProbe",
        parameter: { damage: "event.damage" },
      },
    },
    effect: {},
    source: "ReplayProbeInnerWay",
    tier: 6,
  };
  const createBundle = (withHeavensMight = true) => {
    const timeline = {
      rotation: {
        name: "Damage replay probe",
        targetHP: 10000,
        steps: [
          ...(withHeavensMight ? [{ type: "skill", skill: "ApplyHeavensMight" }] : []),
          { type: "skill", skill: "ChargedProbe" },
          { type: "skill", skill: "Wait" },
          { type: "skill", skill: "ChargedProbe" },
        ],
      },
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {
        HeavensMight: { name: "Heaven's Might", duration: 100, maxStack: 1, refresh: true },
      },
      innerWayConditions: ["ReplayProbeInnerWayT6"],
      innerWayRules: [listenerRule],
      setupEffects: [],
      weapons: [],
    };
    return {
      timeline,
      startAnchor: { rowId: withHeavensMight ? "rotation-0" : "rotation-0" },
      stats,
      attunement: {},
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    };
  };

  const result = calculateRotationBaseline(createBundle());
  const normalEntries = result.baseline.filter((entry) => !entry.replay);
  const replayEntries = result.baseline.filter((entry) => entry.replay);
  assert(normalEntries.length === 4, "The probe must retain all four ordinary damage actions.");
  assert(
    replayEntries.length === 6,
    "The 18-second listener cooldown must allow only the first hit of each separated Charged cast to replay.",
  );
  const firstSource = result.actionBreakdowns[normalEntries[0].id].total;
  const firstReplayTotal = replayEntries
    .slice(0, 3)
    .reduce((total, entry) => total + result.actionBreakdowns[entry.id].total, 0);
  assert(closeTo(firstReplayTotal, firstSource * 0.4), "Replay actions must deal exactly 40% of the source hit.");
  const firstCastDamage =
    result.actionBreakdowns[normalEntries[0].id].total + result.actionBreakdowns[normalEntries[1].id].total;
  assert(
    closeTo(normalEntries[2].context.targetHPRatio, 1 - (firstCastDamage + firstReplayTotal) / 10000),
    "Delayed replay ticks must reduce target HP before later ordinary damage is evaluated.",
  );
  assert(
    replayEntries.every((entry) => {
      const breakdown = result.actionBreakdowns[entry.id];
      return !breakdown.outcomeRates && breakdown.physical === breakdown.total;
    }),
    "Replay damage must bypass outcomes and every normal damage channel calculation.",
  );
  assert(
    result.timeline.filter((row) => row.step.type === "skill" && row.step.skill === "ReplayProbe").length === 2,
    "Each accepted damage event must spawn one visible replay-skill invocation.",
  );
  assert(closeTo(result.duration, 21.3), "Replay ticks must extend rotation duration when Battle End is absent.");

  const withoutDebuff = calculateRotationBaseline(createBundle(false));
  assert(
    withoutDebuff.baseline.every((entry) => !entry.replay),
    "A Charged hit without Heaven's Might must not spawn replay damage.",
  );

  const simulation = simulateRotation(createBundle(), 3, () => 0.5);
  assert(
    simulation.runs.every((run) => run.normalPercentage === 100),
    "Replay ticks must not dilute simulated hit-outcome percentages.",
  );

  console.log("Damage-event replay checks passed.");
} finally {
  await viteServer.close();
}
