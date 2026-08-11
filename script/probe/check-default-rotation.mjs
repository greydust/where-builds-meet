import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const rotation = (await viteServer.ssrLoadModule("/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json")).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  const skillIds = rotation.steps.filter((step) => step.type === "skill").map((step) => step.skill);
  assert(rotation.name === "Mixed Dummy Rotation Infinite Vitality 1 Min", "The bundled rotation name must match the requested name.");
  assert(rotation.start?.step === 6 && rotation.start.action === 5, "Fleeting Trace action index 5 must be the fight anchor.");
  assert(skillIds.length === 45, "The expanded rotation must contain 45 skill steps including Deflect cancels.");
  assert(skillIds.filter((id) => id === "SnowpartingQ").length === 4, "Every plain Heng Q must use SnowpartingQ.");
  assert(skillIds.filter((id) => id === "PhalanxbaneHeavyCharged3").length === 15, "The slam groups must expand to 4 + 7 + 3 + 1 casts.");
  const exhaustedEvent = rotation.steps.find((step) => step.type === "event" && step.event === "Exhausted");
  assert(exhaustedEvent, "The rotation must contain an Exhausted event.");
  const soaringIndex = skillIds.indexOf("SoaringSpin2");
  assert(soaringIndex > 0 && skillIds[soaringIndex - 1] === "PerfectDodgeCancel", "Perfect Dodge Cancel must immediately precede Soaring Spin.");

  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1500, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 405, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0.65 };
  const result = calculateRotationBaseline({
    timeline: {
      rotation,
      skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
      eventDefinitions: {},
      dots,
      effectDefinitions: { ...mysticBuffs, ...generalBuffs, ...dots },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
    },
    startAnchor: { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action },
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
  assert(result.actionBreakdowns["rotation-6:5"], "The configured Fleeting Trace starting action must calculate damage.");
  assert(result.metrics.totalDamage > 0 && result.duration > 0, "The new default rotation must produce a valid calculation.");
  console.log("Infinite Vitality default rotation sequence and calculation checks passed.");
} finally {
  await viteServer.close();
}
