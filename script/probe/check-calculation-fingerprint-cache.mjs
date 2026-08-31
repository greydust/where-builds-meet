import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculationFingerprint, rotationBundleFingerprint, RotationCalculationCache } =
    await viteServer.ssrLoadModule("/src/calculations/rotationCalculationCache.ts");
  const cache = new RotationCalculationCache();
  const setupA = calculationFingerprint({ stats: { minPhys: 1 }, selector: "A", rotation: ["SkillA"] });
  const setupB = calculationFingerprint({ stats: { minPhys: 2 }, selector: "B", rotation: ["SkillA"] });
  const setupC = calculationFingerprint({ stats: { minPhys: 3 }, selector: "C", rotation: ["SkillA"] });
  const baselineA = { metrics: { dps: 100 } };
  const baselineB = { metrics: { dps: 200 } };
  const baselineC = { metrics: { dps: 300 } };
  const variant = calculationFingerprint({ category: "food", value: "Fish" });
  const variantA = { dps: 101 };

  cache.storeBaseline(setupA, baselineA);
  cache.storeVariant(setupA, variant, variantA);
  cache.storeBaseline(setupB, baselineB);
  cache.storeBaseline(setupC, baselineC);

  if (cache.baseline(setupA) !== baselineA) throw new Error("Returning to setup A did not restore its baseline.");
  if (cache.variant(setupA, variant) !== variantA) throw new Error("Setup A did not restore its cached variant.");
  if (cache.variant(setupB, variant) !== undefined)
    throw new Error("A cached variant leaked into a different setup fingerprint.");
  if (new Set([setupA, setupB, setupC]).size !== 3)
    throw new Error("Distinct setup inputs produced duplicate fingerprints.");

  const namedRotationBundle = (name, skill, weapons = ["snowparting", "phalanxbane"]) => ({
    timeline: { rotation: { name, steps: [{ type: "skill", skill }] } },
    weapons,
  });
  const rotationA = rotationBundleFingerprint(namedRotationBundle("First name", "SkillA"));
  const renamedRotationA = rotationBundleFingerprint(namedRotationBundle("Renamed", "SkillA"));
  const rotationB = rotationBundleFingerprint(namedRotationBundle("First name", "SkillB"));
  const reversedMartialArts = rotationBundleFingerprint(
    namedRotationBundle("First name", "SkillA", ["phalanxbane", "snowparting"]),
  );
  if (rotationA !== renamedRotationA)
    throw new Error("Display-only rotation names changed the calculation fingerprint.");
  if (rotationA === rotationB) throw new Error("Different rotation step content produced the same fingerprint.");
  if (rotationA === reversedMartialArts)
    throw new Error("Different ordered martial-art selections produced the same fingerprint.");

  console.log("Calculation fingerprint cache probe passed.");
} finally {
  await viteServer.close();
}
