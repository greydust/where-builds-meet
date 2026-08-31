import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  const { resolvePathWorkspaceSelection } = await viteServer.ssrLoadModule("/src/pathWorkspace.ts");
  const directPathSwitch = resolvePathWorkspaceSelection({
    buildIds: ["might-build"],
    rotationIds: ["dummy-1-min", "might-custom"],
    savedBuildId: "strength-build",
    savedRotationId: "mixed-dummy-infinite-vitality-1-min",
    defaultBuildId: "might-build",
    defaultRotationId: "dummy-1-min",
  });
  assert(
    directPathSwitch?.buildId === "might-build" && directPathSwitch.rotationId === "dummy-1-min",
    "A path transition must resolve both destination defaults before changing paths.",
  );

  const savedPathSelection = resolvePathWorkspaceSelection({
    buildIds: ["might-build", "might-custom-build"],
    rotationIds: ["dummy-1-min", "might-custom"],
    savedBuildId: "might-custom-build",
    savedRotationId: "might-custom",
    defaultBuildId: "might-build",
    defaultRotationId: "dummy-1-min",
  });
  assert(
    savedPathSelection?.buildId === "might-custom-build" && savedPathSelection.rotationId === "might-custom",
    "A path transition must restore both selections previously saved for that destination path.",
  );

  const crossPathCustomSelection = resolvePathWorkspaceSelection({
    buildIds: ["might-build"],
    rotationIds: ["dummy-1-min", "might-custom"],
    savedBuildId: "might-build",
    savedRotationId: "dummy-1-min",
    requestedRotationId: "might-custom",
    defaultBuildId: "might-build",
    defaultRotationId: "dummy-1-min",
  });
  assert(
    crossPathCustomSelection?.rotationId === "might-custom",
    "Selecting a compatible dimmed rotation must make it the destination path selection.",
  );

  const unavailableWorkspace = resolvePathWorkspaceSelection({
    buildIds: [],
    rotationIds: ["dummy-1-min"],
    defaultBuildId: "missing-build",
    defaultRotationId: "dummy-1-min",
  });
  assert(unavailableWorkspace === undefined, "A path transition must not install an incomplete workspace.");

  console.log("Rotation path-selection checks passed.");
} finally {
  await viteServer.close();
}
