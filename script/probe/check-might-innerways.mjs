import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const battleAnthem = await readJson("data/innerway/battle-anthem.json");
const adaptiveSteel = await readJson("data/innerway/adaptive-steel.json");
const breakingPoint = await readJson("data/innerway/breaking-point.json");

assert(
  battleAnthem.tags.includes("StonesplitMight") && adaptiveSteel.tags.includes("StonesplitMight"),
  "Might alternative Inner Ways must use the Stonesplit Might path tag.",
);
assert(
  breakingPoint.tags.includes("StonesplitStrength") && breakingPoint.tags.includes("StonesplitMight"),
  "Breaking Point must remain available to both Stonesplit paths.",
);

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { innerWayEntriesForTag } = await viteServer.ssrLoadModule("/src/data/innerWayDefinitions.ts");
  assert(
    innerWayEntriesForTag("StonesplitMight").some(([id]) => id === "BreakingPoint"),
    "The shared Main/Build Inner Way selector must expose Breaking Point for Stonesplit Might.",
  );
} finally {
  await viteServer.close();
}

const battleT0 = battleAnthem.effect.BattleAnthemT0.effect[0];
const battleT4 = battleAnthem.effect.BattleAnthemT4.effect[0];
assert(
  battleT0.requirement[0].value === "Charged" &&
    battleT0.effect.dmgBonus === 0.1 &&
    battleT4.requirement[0].value === "Charged" &&
    battleT4.effect.dmgBonus === 0.05,
  "Battle Anthem Charged Skill bonuses must remain cumulative and tag-gated.",
);
assert(
  battleAnthem.effect.BattleAnthemT2.effect[0].stat.affinity === 0.039,
  "Battle Anthem T2 must add 3.9% Affinity.",
);
const enduranceScaling = battleAnthem.effect.BattleAnthemT6.effect[0].effect.dmgBonus;
assert(
  enduranceScaling.function === "segment" &&
    enduranceScaling.param1 === "enduranceLost" &&
    JSON.stringify(enduranceScaling.param2) === JSON.stringify([9, 19, 29, 39, 49]) &&
    JSON.stringify(enduranceScaling.param3) === JSON.stringify([0, 0.02, 0.04, 0.06, 0.08, 0.1]),
  "Battle Anthem T6 must preserve its future Endurance-loss segment.",
);

const adaptiveT0 = adaptiveSteel.effect.AdaptiveSteelT0.effect[0];
assert(
  adaptiveT0.requirement[0].value === "Charged" && adaptiveT0.effect.critDmgBonus === 0.2,
  "Adaptive Steel T0 must add 20% Critical DMG to Charged Skills.",
);
assert(
  adaptiveSteel.effect.AdaptiveSteelT2.effect[0].stat.maxBellstrike === 38 &&
    adaptiveSteel.effect.AdaptiveSteelT4.effect[0].stat.bellstrikeDmgBonus === 0.03,
  "Adaptive Steel stat tiers must preserve their Bellstrike values.",
);

console.log("Might alternative Inner Way data checks passed.");
