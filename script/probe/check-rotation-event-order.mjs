import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { attachedEventSiblingIndex, reorderAttachedEventWithinTarget } =
    await viteServer.ssrLoadModule("/src/rotationEditing.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const target = { action: 0 };
  const steps = [
    { type: "event", event: "Move", before: target, distance: 3 },
    { type: "event", event: "Buff", before: target, buff: "Cadence" },
    { type: "event", event: "Debuff", before: target, debuff: "Vulnerable" },
    { type: "skill", skill: "Avalanche" },
  ];
  const movedUp = reorderAttachedEventWithinTarget(steps, 1, -1);
  assert(movedUp?.movedIndex === 0, "The middle event should move above its same-target sibling.");
  assert(movedUp?.steps[0]?.event === "Buff", "The reordered event should occupy its sibling's position.");
  assert(movedUp?.steps[3]?.skill === "Avalanche", "Reordering events must not move their anchor skill.");

  const movedDown = reorderAttachedEventWithinTarget(steps, 1, 1);
  assert(movedDown?.movedIndex === 2, "The middle event should move below its same-target sibling.");
  assert(movedDown?.steps[2]?.event === "Buff", "Downward reordering should preserve the event itself.");

  const afterEventSteps = [
    { type: "event", event: "Qi", after: target, targetQiRatio: 0 },
    { type: "event", event: "Buff", before: target, buff: "Cadence" },
    { type: "skill", skill: "Avalanche" },
  ];
  assert(
    attachedEventSiblingIndex(afterEventSteps, 0, 1) === -1,
    "Before- and after-action events must remain separate ordering groups.",
  );
  console.log("Rotation event ordering checks passed.");
} finally {
  await viteServer.close();
}
