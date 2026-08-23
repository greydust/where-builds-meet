import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { applyStatConversions } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const soaringHigh = (await viteServer.ssrLoadModule("/data/innerway/soaring-high.json")).default;
  const enemyProfiles = (await viteServer.ssrLoadModule("/data/enemy.json")).default;
  const assertClose = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message} Expected ${expected}, received ${actual}.`);
  };

  const generic = applyStatConversions({ source: 0.2, target: 0.05, untouched: 3 }, [
    { convert: { from: "source", to: "target", ratio: 2, max: 0.1 } },
  ]);
  assertClose(generic.source, 0.1, "Conversion must subtract the capped amount from its named source.");
  assertClose(generic.target, 0.25, "Conversion must add the ratio-adjusted amount to its named target.");
  assertClose(generic.untouched, 3, "Conversion must preserve unrelated stats.");

  const t4Rule = soaringHigh.effect.SoaringHighT4.effect[0];
  const conversion = t4Rule.effect.convert;
  if (
    !t4Rule.requirement.some(
      (requirement) => requirement.target === "skillTag" && requirement.value === "VileCondemned",
    ) ||
    conversion.from !== "finalAffinity" ||
    conversion.to !== "directCrit" ||
    conversion.ratio !== 1 ||
    conversion.max !== 0.12
  )
    throw new Error("Soaring High T4 must convert up to 12% Final Affinity into Direct Critical for Vile Condemned.");

  const derivedStats = {
    effectiveMinPhys: 0,
    effectiveMaxPhys: 0,
    effectiveMinBellstrike: 0,
    effectiveMaxBellstrike: 0,
    effectiveMinSilkbind: 0,
    effectiveMaxSilkbind: 0,
    effectiveMinStonesplit: 0,
    effectiveMaxStonesplit: 0,
    effectiveMinBamboocut: 0,
    effectiveMaxBamboocut: 0,
    effectivePrecision: 1,
    effectiveCrit: 0.4,
    effectiveAffinity: 0.2,
    effectiveCritDmgBonus: 0,
    directCrit: 0.1,
    finalCrit: 0.5,
    finalAffinity: 0.2,
    abrasionRate: 0,
    normalRate: 0.3,
    critRate: 0.5,
    affinityRate: 0.2,
  };
  const breakdown = calculateDamageBreakdown(
    { phyCoef: 0, phyBonus: 0, attrBonus: 0 },
    {
      stats: emptyStats,
      attunement: {},
      skillTags: ["VileCondemned"],
      weapons: ["heavenwill", "skygrasp"],
      buffs: [],
      enemy: enemyProfiles["96"],
      derivedStats,
      effects: [t4Rule.effect],
    },
  );
  assertClose(breakdown.outcomeRates.affinity, 0.08, "T4 must remove 12% from Final Affinity.");
  assertClose(breakdown.outcomeRates.critical, 0.62, "T4 must add the converted 12% to Direct Critical.");
  assertClose(breakdown.outcomeRates.normal, 0.3, "T4 must preserve the remaining outcome probability.");

  console.log("Generic stat conversion and Soaring High T4 checks passed.");
} finally {
  await viteServer.close();
}
