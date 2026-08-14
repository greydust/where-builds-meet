import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const frostCladNight = (await viteServer.ssrLoadModule("/data/innerway/frost-clad-night.json")).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const t4Rule = { ...frostCladNight.effect.FrostCladNightT4.effect[0], source: "FrostCladNight", tier: 4 };
  const conditions = Array.from({ length: 7 }, (_, tier) => `FrostCladNightT${tier}`);
  const hit = { name: "Snowbreak Spring probe", castTime: 2, action: [{ type: "damage", phyCoef: 1, time: 1 }], modifier: [], tags: ["SnowbreakSpring"] };
  const exhausted = { name: "Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }], tags: ["Event"] };

  const damage = ({ exhaustedAt, innerPassion = false } = {}) => {
    const steps = [{ type: "skill", skill: "Hit" }];
    if (exhaustedAt !== undefined) steps.push({ type: "event", event: "Exhausted", startTime: exhaustedAt });
    return calculateRotationBaseline({
      timeline: {
        rotation: { name: "Snowbreak hit-time probe", steps },
        skills: { Hit: hit },
        eventDefinitions: { Exhausted: exhausted },
        dots: {},
        effectDefinitions: { Exhausted: { duration: 10 } },
        innerWayConditions: conditions,
        innerWayRules: [t4Rule],
        setupEffects: [],
        weapons: [],
        initialBuffs: innerPassion ? [{ name: "InnerPassion" }] : [],
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
    }).metrics.totalDamage;
  };

  const baseline = damage();
  assert(closeTo(damage({ exhaustedAt: 0.5 }) / baseline, 1.4), "Exhausted applied after cast start but before the hit must grant the 40% bonus.");
  assert(closeTo(damage({ exhaustedAt: 1.5 }), baseline), "Exhausted applied after the hit must not grant the bonus.");
  assert(closeTo(damage({ innerPassion: true }) / baseline, 1.4), "Inner Passion active at the hit must grant the 40% bonus.");
  assert(closeTo(damage({ exhaustedAt: 0.5, innerPassion: true }) / baseline, 1.4), "Inner Passion and Exhausted together must grant only one 40% bonus.");
  assert(snowparting.SnowpartingHeavyVC.modifier.length === 0, "Snowbreak Spring must not retain the cast-time HP damage modifier.");

  console.log("Snowbreak Spring hit-time Frost-Clad Night checks passed.");
} finally {
  await viteServer.close();
}
