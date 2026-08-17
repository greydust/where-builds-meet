import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const {
    beginRotationCalculation,
    completeRotationCalculationCategory,
    endRotationCalculation,
    getRotationCalculationStatus,
    publishRotationCategoryProgress,
    rotationCalculationCategories,
  } = await viteServer.ssrLoadModule("/src/calculations/rotationMetrics.ts");
  const expectedOrder = [
    "baseline",
    "statPriority",
    "attunementPriority",
    "weaponSets",
    "armorSets",
    "bowRingSet",
    "arsenal",
    "globalDebuffs",
    "innerWays",
    "script",
    "divinecraft",
    "food",
  ];
  if (JSON.stringify(rotationCalculationCategories) !== JSON.stringify(expectedOrder))
    throw new Error("Progressive calculation categories are not in the required order.");

  beginRotationCalculation();
  const started = getRotationCalculationStatus();
  if (rotationCalculationCategories.some((category) => !started[category].recalculating || started[category].progress))
    throw new Error("Every category must begin pending at zero progress.");

  publishRotationCategoryProgress("statPriority", 0.5);
  const progressing = getRotationCalculationStatus();
  if (progressing.statPriority.progress !== 0.5 || progressing.attunementPriority.progress !== 0)
    throw new Error("Category progress must update independently.");

  completeRotationCalculationCategory("statPriority");
  const completed = getRotationCalculationStatus();
  if (completed.statPriority.recalculating || completed.statPriority.progress !== 1)
    throw new Error("A completed category must be idle at full progress.");

  endRotationCalculation();
  if (rotationCalculationCategories.some((category) => getRotationCalculationStatus()[category].recalculating))
    throw new Error("Ending a calculation must clear every remaining category status.");

  console.log("Progressive calculation status probe passed.");
} finally {
  await viteServer.close();
}
