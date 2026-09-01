import { readdir, readFile } from "node:fs/promises";
import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { allStatDefinitions, emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateHealingBreakdown } = await viteServer.ssrLoadModule("/src/calculations/healing.ts");
  const { resolveAttunementStats } = await viteServer.ssrLoadModule("/src/calculations/attunementStats.ts");
  const visibleStats = new Set(allStatDefinitions.map(({ key }) => key));
  const innerWayFiles = (await readdir("data/innerway")).filter((fileName) => fileName.endsWith(".json"));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  assert(
    !visibleStats.has("physicalPenetration") && "physicalPenetration" in emptyStats,
    "Physical Penetration must remain a shared calculation stat rather than a Character Stats field.",
  );
  assert(
    "physicalResistance" in emptyStats && !visibleStats.has("physicalResistance"),
    "Physical Resistance must remain available to calculations but hidden from Character Stats.",
  );

  const physicalPenetrationOutput = (physicalPenetration, calculate) => {
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, physicalPenetration };
    return calculate(
      { type: calculate === calculateHealingBreakdown ? "heal" : "damage", phyCoef: 1 },
      {
        stats,
        attunement: {},
        skillTags: [],
        weapons: [],
        buffs: [],
        enemy: {
          name: "Inner Way stat visibility probe",
          level: 96,
          defense: 0,
          physicalResistance: 10,
          bellstrikeResistance: 0,
          stonesplitResistance: 0,
          silkbindResistance: 0,
          bamboocutResistance: 0,
          judgementResistance: 0,
        },
        derivedStats: calculateDerivedStats(stats, 0),
        effects: [],
      },
    ).total;
  };
  assert(
    physicalPenetrationOutput(5.1, calculateDamageBreakdown) > physicalPenetrationOutput(0, calculateDamageBreakdown),
    "The Physical Penetration character stat must increase physical damage.",
  );
  assert(
    physicalPenetrationOutput(5.1, calculateHealingBreakdown) > physicalPenetrationOutput(0, calculateHealingBreakdown),
    "The Physical Penetration character stat must increase physical healing.",
  );

  for (const fileName of innerWayFiles) {
    const definition = JSON.parse(await readFile(`data/innerway/${fileName}`, "utf8"));
    for (const tier of [2, 5]) {
      const tierDefinition = Object.entries(definition.effect ?? {}).find(([key]) => key.endsWith(`T${tier}`))?.[1];
      if (!tierDefinition?.effect) continue;
      for (const effect of tierDefinition.effect) {
        assert(
          effect.stat && !effect.requirement && !effect.target && !effect.modify,
          `${definition.name} T${tier} must express its unconditional bonus through the shared stat pipeline.`,
        );
        for (const stat of Object.keys(effect.stat)) {
          assert(stat in emptyStats, `${definition.name} T${tier} uses unknown stat ${stat}.`);
          assert(
            stat === "physicalPenetration" || stat === "physicalResistance" || visibleStats.has(stat),
            `${definition.name} T${tier} stat ${stat} must be visible in its Stats-page section.`,
          );
          const resolvedStats = calculateStatsWithEffects(emptyStats, [effect], 0).stats;
          assert(
            effect.stat[stat] === 0 || resolvedStats[stat] !== emptyStats[stat],
            `${definition.name} T${tier} stat ${stat} must affect the shared character-stat result.`,
          );
        }
      }
    }
  }

  const attunementDefaults = { physicalPenetration: 0, formlessPenetration: 0 };
  const resolvedAttunement = resolveAttunementStats(
    attunementDefaults,
    { physicalPenetration: 10 },
    {},
    { physicalPenetration: 5.1 },
  );
  assert(
    resolvedAttunement.displayed.physicalPenetration === 15.1 &&
      resolvedAttunement.calculation.physicalPenetration === 10,
    "Inner Way Physical Penetration must update the displayed Attunement Stats total without duplicating its calculation.",
  );

  console.log("Inner Way T2/T5 stat visibility checks passed.");
} finally {
  await viteServer.close();
}
