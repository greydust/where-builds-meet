import { createServer } from "vite";

const storage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { loadBuildSetupOverrides } = await viteServer.ssrLoadModule("/src/App.tsx");
  const { defaultBuildSetup } = await viteServer.ssrLoadModule("/src/gear.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const legacyInnerWays = [
    { innerWay: "BreakingPoint", tier: "T3" },
    { innerWay: "MoraleChant", tier: "T6" },
    { innerWay: "SteadfastDevotion", tier: "T6" },
    { innerWay: "ThroatPiercingArt", tier: "T6" },
  ];

  storage.set("wwm-build-setup-overrides-v1", "{}");
  storage.set("wwm-inner-way-session-v1", JSON.stringify(legacyInnerWays));
  const current = loadBuildSetupOverrides(defaultBuildSetup);
  assert(
    Object.keys(current).length === 0,
    "An explicitly saved empty override must use every setup value from the active build.",
  );

  storage.delete("wwm-build-setup-overrides-v1");
  const migrated = loadBuildSetupOverrides(defaultBuildSetup);
  assert(
    migrated.innerWays?.[0]?.innerWay === "BreakingPoint",
    "The standalone Inner Way session must migrate only when the unified override has never been saved.",
  );

  console.log("Build-sourced setup defaults and one-time legacy migration checks passed.");
} finally {
  await viteServer.close();
}
