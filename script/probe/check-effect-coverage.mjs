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
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Coverage probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const result = calculateRotationBaseline({
    timeline: {
      rotation: {
        name: "Coverage probe",
        steps: [{ type: "skill", skill: "CoverageProbe" }],
      },
      skills: {
        CoverageProbe: {
          name: "Coverage probe",
          castTime: 2,
          action: [
            { type: "apply", target: "self", value: "ShortBuff", stack: 1, time: 0 },
            { type: "apply", target: "self", value: "HiddenBuff", stack: 1, time: 0 },
            { type: "apply", target: "target", value: "ShortDebuff", stack: 1, time: 0 },
            { type: "apply", target: "target", value: "PrivateDebuff", stack: 1, time: 0 },
            { type: "damage", phyCoef: 1, time: 1 },
            { type: "addResource", target: "self", resource: "Probe", amount: 1, time: 1.5 },
            { type: "heal", phyCoef: 1, time: 2 },
          ],
          modifier: [],
          tags: ["MartialArts"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {
        ShortBuff: {
          name: "Short Buff",
          duration: 1.5,
          maxStack: 1,
          refresh: true,
          showCoverage: true,
          effect: [],
        },
        ShortDebuff: {
          name: "Short Debuff",
          duration: 1.5,
          maxStack: 1,
          refresh: true,
          shared: true,
          showCoverage: true,
          effect: [],
        },
        PrivateDebuff: {
          name: "Private Debuff",
          duration: 1.5,
          maxStack: 1,
          refresh: true,
          shared: false,
          showCoverage: true,
          effect: [],
        },
        HiddenBuff: {
          name: "Hidden Buff",
          duration: 10,
          maxStack: 1,
          refresh: true,
          effect: [],
        },
      },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
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
  const buff = result.metrics.breakdown.buffCoverage.find((row) => row.id === "ShortBuff");
  const debuff = result.metrics.breakdown.debuffCoverage.find((row) => row.id === "ShortDebuff");
  const privateDebuff = result.metrics.breakdown.debuffCoverage.find((row) => row.id === "PrivateDebuff");
  assert(buff?.averageStacks === 0.5, "Buff average stacks must include only damage and healing actions.");
  assert(
    debuff?.averageStacks === 0.5 && debuff.timeCoverage === 75,
    "A shared debuff must report output-action average stacks and elapsed-time coverage.",
  );
  assert(
    privateDebuff?.averageStacks === 0.5 && privateDebuff.timeCoverage === undefined,
    "A non-shared debuff must report average stacks without elapsed-time coverage.",
  );
  assert(
    !result.metrics.breakdown.buffCoverage.some((row) => row.id === "HiddenBuff"),
    "Effects without showCoverage must stay out of the coverage breakdown.",
  );

  console.log("Definition-filtered average stacks and shared-debuff time coverage verified.");
} finally {
  await viteServer.close();
}
