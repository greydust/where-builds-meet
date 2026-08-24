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
  const rawStats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Single damage resolution probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const skill = {
    name: "Probe Hit",
    castTime: 0.1,
    action: [{ type: "damage", phyCoef: 1, time: 0.1 }],
    modifier: [],
    tags: ["DirectDamage"],
  };
  const inertDamageListener = {
    source: "ProbeListener",
    tier: 0,
    effect: {},
    listen: {
      event: "damage",
      requirement: [],
      action: { type: "noop" },
    },
  };

  const runCase = ({ listener = false, targetHP } = {}) => {
    let damageEvaluations = 0;
    const stats = new Proxy(rawStats, {
      get(target, property, receiver) {
        if (property === "vsBossDmg") damageEvaluations += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const timeline = {
      rotation: {
        name: "Single damage resolution probe",
        ...(typeof targetHP === "number" ? { targetHP } : {}),
        steps: [{ type: "skill", skill: "ProbeHit" }],
      },
      skills: { ProbeHit: skill },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: listener ? [inertDamageListener] : [],
      setupEffects: [],
      weapons: [],
    };
    const result = calculateRotationBaseline({
      timeline,
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: {},
      enemy,
      derivedStats: calculateDerivedStats(rawStats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    assert(result.metrics.totalDamage > 0, "The probe hit must deal damage.");
    assert(
      damageEvaluations === 1,
      `Each deterministic hit must resolve once; observed ${damageEvaluations} evaluations.`,
    );
  };

  runCase();
  runCase({ listener: true });
  runCase({ targetHP: 10000 });

  console.log("Single deterministic damage-resolution checks passed.");
} finally {
  await viteServer.close();
}
