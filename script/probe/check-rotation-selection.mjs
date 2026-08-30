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
  const { resolveRotationSelection } = await viteServer.ssrLoadModule("/src/rotationEditing.ts");
  const directPathSwitch = resolveRotationSelection({
    pathChanged: true,
    requestedRotationId: null,
    activeRotationId: "mixed-dummy-infinite-vitality-1-min",
    editingRotationId: "mixed-dummy-infinite-vitality-1-min",
    defaultRotationId: "dummy-1-min",
    compatibleRotationIds: ["dummy-1-min", "might-custom"],
    listedRotationIds: ["dummy-1-min", "might-custom", "strength-custom"],
  });
  assert(
    directPathSwitch?.activeRotationId === "dummy-1-min" &&
      directPathSwitch.editingRotationId === "dummy-1-min" &&
      directPathSwitch.resetEditingRotation,
    "A direct path switch must replace both the active and editable rotation with the new path default.",
  );

  const crossPathCustomSelection = resolveRotationSelection({
    pathChanged: true,
    requestedRotationId: "might-custom",
    activeRotationId: "mixed-dummy-infinite-vitality-1-min",
    editingRotationId: "might-custom",
    defaultRotationId: "dummy-1-min",
    compatibleRotationIds: ["dummy-1-min", "might-custom"],
    listedRotationIds: ["dummy-1-min", "might-custom", "strength-custom"],
  });
  assert(
    crossPathCustomSelection?.activeRotationId === "dummy-1-min" &&
      crossPathCustomSelection.editingRotationId === "might-custom" &&
      !crossPathCustomSelection.resetEditingRotation,
    "Selecting a dimmed custom rotation must switch paths without discarding that editor selection.",
  );

  const samePathSelection = resolveRotationSelection({
    pathChanged: false,
    requestedRotationId: null,
    activeRotationId: "dummy-1-min",
    editingRotationId: "might-custom",
    defaultRotationId: "dummy-1-min",
    compatibleRotationIds: ["dummy-1-min", "might-custom"],
    listedRotationIds: ["dummy-1-min", "might-custom"],
  });
  assert(
    samePathSelection?.activeRotationId === "dummy-1-min" &&
      samePathSelection.editingRotationId === "might-custom" &&
      !samePathSelection.resetEditingRotation,
    "Ordinary editing within a path must not reset the selected rotation.",
  );

  console.log("Rotation path-selection checks passed.");
} finally {
  await viteServer.close();
}
