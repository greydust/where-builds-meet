import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const breakthroughProfiles = (await viteServer.ssrLoadModule("/data/breakthrough.json")).default;
  const system = (await viteServer.ssrLoadModule("/data/system.json")).default;
  const { createBaseAttributeEffects } = await viteServer.ssrLoadModule("/src/data/baseAttributeEffects.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");

  const sharedEffects = [
    system.baseStats,
    ...system.enhancementStats,
    ...system.talentStats,
    ...system.qingheOddityStats,
    ...system.kaifengOddityStats,
    ...system.imperialPalaceOddityStats,
    ...system.hexiOddityStats,
    ...system.hiddenMountainOddityStats,
    ...createBaseAttributeEffects(system.baseAttributes),
  ];
  const calculate = (profile) =>
    calculateStatsWithEffects(emptyStats, [...sharedEffects, profile.levelBonusStats], profile.judgementResistance);
  const breakthrough16 = calculate(breakthroughProfiles["16"]);
  const breakthrough17 = calculate(breakthroughProfiles["17"]);
  const closeTo = (left, right) => Math.abs(left - right) < 1e-9;

  if (
    !closeTo(breakthrough17.stats.precision - breakthrough16.stats.precision, 0.012) ||
    !closeTo(breakthrough17.stats.power - breakthrough16.stats.power, 12) ||
    !closeTo(breakthrough17.stats.agility - breakthrough16.stats.agility, 12) ||
    !closeTo(breakthrough17.stats.momentum - breakthrough16.stats.momentum, 12) ||
    !closeTo(breakthrough17.stats.body - breakthrough16.stats.body, 12) ||
    !closeTo(breakthrough17.stats.defense - breakthrough16.stats.defense, 12)
  ) {
    throw new Error("Breakthrough 17 must replace Breakthrough 16's Precision and five base-attribute bonuses.");
  }
  if (
    !closeTo(breakthrough17.stats.minPhys - breakthrough16.stats.minPhys, 13.44) ||
    !closeTo(breakthrough17.stats.maxPhys - breakthrough16.stats.maxPhys, 27.12) ||
    !closeTo(breakthrough17.stats.crit - breakthrough16.stats.crit, 0.00912) ||
    !closeTo(breakthrough17.stats.affinity - breakthrough16.stats.affinity, 0.00456)
  ) {
    throw new Error("Breakthrough base attributes must flow through the shared attribute-conversion pipeline.");
  }

  const enemyFields = [
    "level",
    "defense",
    "physicalResistance",
    "bellstrikeResistance",
    "stonesplitResistance",
    "silkbindResistance",
    "bamboocutResistance",
    "judgementResistance",
  ];
  if (enemyFields.some((field) => breakthroughProfiles["16"][field] !== breakthroughProfiles["17"][field])) {
    throw new Error("Breakthrough 16 and 17 must currently use the same enemy profile.");
  }

  console.log("Breakthrough stat replacement and shared conversion checks passed.");
} finally {
  await viteServer.close();
}
