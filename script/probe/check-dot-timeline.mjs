import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const smolderPoetRotation = (await viteServer.ssrLoadModule("/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json")).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const build = (steps) => buildRotationTimeline({
    rotation: { name: "DOT probe", steps: steps.map((skill) => ({ type: "skill", skill })) },
    skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
    eventDefinitions: {},
    dots,
    effectDefinitions: dots,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting", "phalanxbane"],
  });

  const smolderTimeline = build(["DragonsBreathSmolder1", "DragonsBreathSmolder1"]);
  const smolderTicks = smolderTimeline.filter((row) => row.kind === "dot" && row.step.skill === "Smolder");
  const secondSmolder = smolderTimeline.find((row) => row.id === "rotation-1");
  const extensionTime = secondSmolder.startTime + Number(secondSmolder.actions[2]?.time ?? 0);
  assert(smolderTicks.length === 16, `Expected 16 Smolder ticks after one four-second extension, received ${smolderTicks.length}.`);
  assert(Math.abs(smolderTicks.at(-1).startTime - 9.5667) < 0.0001, `Smolder ended at ${smolderTicks.at(-1).startTime}s instead of 9.5667s.`);
  assert(smolderTicks.filter((row) => row.startTime < extensionTime).every((row) => row.sourceRowId === "rotation-0"), `Ticks before the extension must belong to the first Smolder cast: ${smolderTicks.slice(0, 5).map((row) => `${row.startTime}:${row.sourceRowId}`).join(", ")}`);
  assert(smolderTicks.filter((row) => row.startTime > extensionTime).every((row) => row.sourceRowId === "rotation-1"), "Ticks after the extension must belong to the extending Smolder cast.");

  const toadTimeline = build(["LeapingToad"]);
  const venomTicks = toadTimeline.filter((row) => row.kind === "dot" && (row.step.skill === "ToadVenom" || row.step.skill === "LesserToadVenom"));
  assert(venomTicks.length === 2, `Expected Toad Venom and Lesser Toad Venom ticks, received ${venomTicks.length}.`);
  assert(venomTicks.every((row) => row.sourceRowId === "rotation-0"), "Both venom DOTs must belong to the Leaping Toad cast.");

  const fullTimeline = buildRotationTimeline({
    rotation: smolderPoetRotation,
    skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
    eventDefinitions: { Exhausted: { name: "Event: Exhausted", castTime: 0, action: [], tags: ["Event"] } },
    dots,
    effectDefinitions: dots,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting", "phalanxbane"],
  });
  const fullSmolderTicks = fullTimeline.filter((row) => row.kind === "dot" && row.step.skill === "Smolder");
  const lastSmolderCast = fullTimeline.filter((row) => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "DragonsBreathSmolder2").at(-1);
  const lastSmolderApplyIndex = lastSmolderCast.actions.findLastIndex((action) => action.type === "apply" && action.value === "Smolder");
  const lastSmolderApply = lastSmolderCast.actions[lastSmolderApplyIndex];
  const expectedLatestSmolderTime = lastSmolderCast.startTime + Number(lastSmolderApply.time ?? 0) + Number(lastSmolderApply.duration ?? 0);
  const latestSmolderTime = fullSmolderTicks.at(-1)?.startTime ?? 0;
  assert(latestSmolderTime <= expectedLatestSmolderTime + 0.0001, `Smolder ticked at ${latestSmolderTime}s after its ${expectedLatestSmolderTime}s expiration.`);
  assert(fullSmolderTicks.every((row) => fullTimeline.find((candidate) => candidate.id === row.sourceRowId)?.step.skill === "DragonsBreathSmolder2"), "Every full-rotation Smolder tick must belong to a Smolder cast.");

  console.log(`DOT lifetime, extension ownership, and nested ownership checks passed. Full rotation's final Smolder tick is ${latestSmolderTime.toFixed(4)}s.`);
} finally {
  await viteServer.close();
}
