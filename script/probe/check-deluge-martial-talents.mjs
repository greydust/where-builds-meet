import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const panaceaFan = (await viteServer.ssrLoadModule("/data/martial-art/panacea-fan.json")).default;
  const soulshadeUmbrella = (await viteServer.ssrLoadModule("/data/martial-art/soulshade-umbrella.json")).default;
  const { calculateStatsWithEffects, resolveFormulaValue } = await viteServer.ssrLoadModule(
    "/src/calculations/statEffects.ts",
  );
  const { requirementsPass } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");

  const assertClose = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message} Expected ${expected}, received ${actual}.`);
  };
  const statEffects = (definition) =>
    definition.talent.flatMap((talent) => talent.effect ?? []).filter((effect) => effect.stat);

  const panaceaStats = calculateStatsWithEffects(
    { ...emptyStats, agility: 280, minSilkbind: 230 },
    statEffects(panaceaFan),
    0,
  ).stats;
  assertClose(panaceaStats.crit, 0.085, "Panacea Fan must reach its Critical Rate cap at 280 Agility.");
  assertClose(panaceaStats.minSilkbind, 328, "Panacea Fan must add Min Silkbind Attack.");
  assertClose(panaceaStats.maxSilkbind, 196, "Panacea Fan must add Max Silkbind Attack.");
  assertClose(panaceaStats.silkbindDmgBonus, 0.11, "Panacea Fan must reach its Silkbind DMG cap at 328 Min.");
  assertClose(
    panaceaStats.silkbindHealingBonus,
    0.11,
    "Panacea Fan must preserve its Silkbind Healing cap in character stats.",
  );

  const soulshadeStats = calculateStatsWithEffects(
    { ...emptyStats, agility: 280, minSilkbind: 230 },
    statEffects(soulshadeUmbrella),
    0,
  ).stats;
  assertClose(soulshadeStats.minPhys, 73.9, "Soulshade Umbrella must reach its Min Physical cap at 280 Agility.");
  assertClose(soulshadeStats.minSilkbind, 328, "Soulshade Umbrella must add Min Silkbind Attack.");
  assertClose(soulshadeStats.maxSilkbind, 196, "Soulshade Umbrella must add Max Silkbind Attack.");
  assertClose(
    soulshadeStats.silkbindPenetration,
    22,
    "Soulshade Umbrella must reach its Silkbind Penetration cap at 328 Min.",
  );

  const heavyHealing = panaceaFan.talent
    .flatMap((talent) => talent.effect ?? [])
    .find((effect) => effect.effect?.healingBonus);
  const mysticBuff = soulshadeUmbrella.talent
    .flatMap((talent) => talent.effect ?? [])
    .find((effect) => effect.effect?.dmgBonus);
  const criticalHealing = soulshadeUmbrella.talent
    .flatMap((talent) => talent.effect ?? [])
    .find((effect) => effect.effect?.criticalHealingBonus);
  if (!heavyHealing || !mysticBuff || !criticalHealing)
    throw new Error("Deluge conditional talent effects are missing.");

  const requirementPasses = (requirement, tags, martialArts) =>
    requirementsPass(requirement, [], [], tags, new Set(), martialArts, {});
  if (
    !requirementPasses(heavyHealing.requirement, ["Heavy"], ["panaceaFan", "soulshadeUmbrella"]) ||
    requirementPasses(heavyHealing.requirement, ["Light"], ["panaceaFan", "soulshadeUmbrella"])
  )
    throw new Error("Panacea Fan healing must be restricted to Heavy-tagged actions.");
  if (
    !requirementPasses(mysticBuff.requirement, ["Mystic"], ["panaceaFan", "soulshadeUmbrella"]) ||
    requirementPasses(mysticBuff.requirement, ["Mystic"], ["soulshadeUmbrella", "inkwellFan"]) ||
    requirementPasses(mysticBuff.requirement, ["MartialArts"], ["panaceaFan", "soulshadeUmbrella"])
  )
    throw new Error("Soulshade Umbrella's damage bonus must require both Panacea Fan and a Mystic action.");
  if (
    !requirementPasses(criticalHealing.requirement, ["Special"], ["panaceaFan", "soulshadeUmbrella"]) ||
    requirementPasses(criticalHealing.requirement, ["Heavy"], ["panaceaFan", "soulshadeUmbrella"])
  )
    throw new Error("Soulshade Umbrella Critical Healing must be restricted to Special-tagged actions.");

  assertClose(
    resolveFormulaValue(heavyHealing.effect.healingBonus.formula, { minPhys: 750 }),
    0.3,
    "Heavy healing must include its base bonus and capped Min Physical scaling.",
  );
  assertClose(
    resolveFormulaValue(criticalHealing.effect.criticalHealingBonus.formula, { minPhys: 750 }),
    0.3,
    "Critical healing must include its base bonus and capped Min Physical scaling.",
  );

  console.log("Deluge martial-art talent behavior checks passed.");
} finally {
  await viteServer.close();
}
