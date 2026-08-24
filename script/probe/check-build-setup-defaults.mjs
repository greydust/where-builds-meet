import { createServer } from "vite";

const createStorage = () => {
  const values = new Map();
  return {
    values,
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
};
const localStorage = createStorage();
const sessionStorage = createStorage();
globalThis.window = { localStorage, sessionStorage };
globalThis.localStorage = localStorage;
globalThis.sessionStorage = sessionStorage;

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

  sessionStorage.setItem("wwm-build-setup-overrides-v1", "{}");
  sessionStorage.setItem("wwm-inner-way-session-v1", JSON.stringify(legacyInnerWays));
  const current = loadBuildSetupOverrides(defaultBuildSetup);
  assert(
    Object.keys(current).length === 0,
    "An explicitly saved empty override must use every setup value from the active build.",
  );

  localStorage.removeItem("wwm-build-setup-overrides-v1");
  const migrated = loadBuildSetupOverrides(defaultBuildSetup);
  assert(
    migrated.innerWays?.[0]?.innerWay === "BreakingPoint",
    "The standalone Inner Way session must migrate only when the unified override has never been saved.",
  );

  console.log("Build-sourced setup defaults and one-time legacy migration checks passed.");
} finally {
  await viteServer.close();
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
}
