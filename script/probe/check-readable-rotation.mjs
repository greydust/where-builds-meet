import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { readableRotationText } = await viteServer.ssrLoadModule("/src/readableRotation.ts");
  const skillRow = (index, startTime, castTime, shortName, actions = [{ type: "damage", time: castTime }]) => ({
    id: `rotation-${index}`,
    kind: "rotation",
    rotationIndex: index,
    order: index * 1000,
    step: { type: "skill", skill: `Skill${index}` },
    startTime,
    effectiveCastTime: castTime,
    skill: { name: `Skill ${index}`, shortName },
    actions,
    buffs: [],
    debuffs: [],
    modifierEffects: [],
    actionStates: {},
  });
  const timeline = [
    skillRow(0, 0, 1, "One"),
    skillRow(1, 1, 2, "Two", [
      { type: "damage", time: 0.5 },
      { type: "damage", time: 1 },
      { type: "damage", time: 1 },
    ]),
    skillRow(2, 3, 1, "Three"),
    skillRow(3, 4, 1, "Four"),
    {
      id: "rotation-4",
      kind: "rotation",
      rotationIndex: 4,
      order: 4000,
      step: { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 },
      startTime: 3.5,
      effectiveCastTime: 0,
      skill: {},
      actions: [],
      buffs: [],
      debuffs: [],
      modifierEffects: [],
      actionStates: {},
    },
  ];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  assert(
    readableRotationText(timeline, { rowId: "rotation-1", actionIndex: 2 }, 2) ===
      "One at 2 > Two (start at hit 3) > Three (break) > Four",
    "Readable rotation modifiers must match the requested format.",
  );
  assert(
    readableRotationText(timeline, { rowId: "rotation-1" }, 1) === "One at 1 > Two (start) > Three (break) > Four",
    "A skill-level anchor must use the start modifier without a hit.",
  );
  const repeatedTimeline = [
    skillRow(0, 0, 1, "One"),
    skillRow(1, 1, 1, "One"),
    skillRow(2, 2, 1, "One"),
    skillRow(3, 3, 1, "Two"),
    skillRow(4, 4, 1, "One"),
  ];
  assert(
    readableRotationText(repeatedTimeline, { rowId: "missing" }, 0) === "One x3 > Two > One",
    "Consecutive identical skills must be collapsed without merging later occurrences.",
  );
  assert(
    readableRotationText(repeatedTimeline, { rowId: "rotation-1" }, 1) === "One at 1 > One (start) > One > Two > One",
    "Skills with different modifiers must remain separate.",
  );
  console.log("Readable rotation format checks passed.");
} finally {
  await viteServer.close();
}
