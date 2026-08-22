import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { requirementsPass } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const requirement = [{ target: "martialArt", value: "SnowpartingBlade" }];
  assert(
    requirementsPass(requirement, [], [], ["SnowpartingBlade", "MartialArts"], new Set(), ["snowparting"]),
    "A canonical martial-art tag must match its skill.",
  );
  assert(
    !requirementsPass(requirement, [], [], ["Mystic"], new Set(), ["snowparting"]),
    "Equipping the martial art must not make its requirement pass for a Mystic skill.",
  );
  assert(
    !requirementsPass([{ target: "martialArt", value: "snowparting" }], [], [], ["SnowpartingBlade"], new Set(), [
      "snowparting",
    ]),
    "Legacy weapon IDs must not be accepted as martial-art tags.",
  );
  assert(
    requirementsPass([{ target: "equippedMartialArt", value: "heavenwill" }], [], [], ["SkygraspRopeDart"], new Set(), [
      "skygrasp",
      "heavenwill",
    ]),
    "An equipped-martial-art requirement must match either equipped slot.",
  );
  assert(
    !requirementsPass(
      [{ target: "equippedMartialArt", value: "heavenwill" }],
      [],
      [],
      ["SkygraspRopeDart"],
      new Set(),
      ["skygrasp", "thundercry"],
    ),
    "An equipped-martial-art requirement must fail when the art is not equipped.",
  );
  console.log("Canonical martial-art requirement tag checks passed.");
} finally {
  await viteServer.close();
}
