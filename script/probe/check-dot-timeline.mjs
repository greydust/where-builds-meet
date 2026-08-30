import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const mysticDebuffs = (await viteServer.ssrLoadModule("/data/debuff/mystic.json")).default;
  const smolderPoetRotation = (
    await viteServer.ssrLoadModule("/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json")
  ).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const build = (steps) =>
    buildRotationTimeline({
      rotation: { name: "DOT probe", steps: steps.map((skill) => ({ type: "skill", skill })) },
      skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
      eventDefinitions: {},
      dots,
      effectDefinitions: { ...dots, ...mysticDebuffs },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
    });

  const smolderTimeline = build(["DragonsBreathSmolder1", "DragonsBreathSmolder1"]);
  const smolderTicks = smolderTimeline.filter((row) => row.kind === "dot" && row.step.skill === "Smolder");
  const secondSmolder = smolderTimeline.find((row) => row.id === "rotation-1");
  const extensionTime = secondSmolder.startTime + Number(secondSmolder.actions[2]?.time ?? 0);
  assert(
    smolderTicks.length === 16,
    `Expected 16 Smolder ticks after one four-second extension, received ${smolderTicks.length}.`,
  );
  const firstApplicationTime = smolderTimeline[0].startTime + Number(smolderTimeline[0].actions[3]?.time ?? 0);
  const expectedSmolderEnd = firstApplicationTime + 4 + 4;
  assert(
    Math.abs(smolderTicks.at(-1).startTime - expectedSmolderEnd) < 0.0001,
    `Smolder ended at ${smolderTicks.at(-1).startTime}s instead of ${expectedSmolderEnd}s.`,
  );
  assert(
    smolderTicks.filter((row) => row.startTime < extensionTime).every((row) => row.sourceRowId === "rotation-0"),
    `Ticks before the extension must belong to the first Smolder cast: ${smolderTicks
      .slice(0, 5)
      .map((row) => `${row.startTime}:${row.sourceRowId}`)
      .join(", ")}`,
  );
  assert(
    smolderTicks.filter((row) => row.startTime > extensionTime).every((row) => row.sourceRowId === "rotation-1"),
    "Ticks after the extension must belong to the extending Smolder cast.",
  );

  const toadTimeline = build(["LeapingToad"]);
  const venomAttacks = toadTimeline.filter(
    (row) => row.kind === "periodic" && (row.step.skill === "ToadVenom" || row.step.skill === "LesserToadVenom"),
  );
  assert(
    venomAttacks.length === 2 &&
      venomAttacks[0].step.skill === "ToadVenom" &&
      Math.abs(venomAttacks[0].startTime + Number(venomAttacks[0].actions[0].time) - 6.15) < 0.0001 &&
      venomAttacks[1].step.skill === "LesserToadVenom" &&
      Math.abs(venomAttacks[1].startTime + Number(venomAttacks[1].actions[0].time) - 11.15) < 0.0001,
    "Toad Venom and Lesser Toad Venom must attack five seconds after their respective applications.",
  );
  assert(
    venomAttacks.every((row) => row.sourceRowId === "rotation-0" && !row.skill.tags.includes("DOT")),
    "Both venom attacks must belong to Leaping Toad and must not be DOTs.",
  );
  const repeatedToadTimeline = build(["LeapingToad", "LeapingToad"]);
  const repeatedVenomAttacks = repeatedToadTimeline.filter(
    (row) => row.kind === "periodic" && (row.step.skill === "ToadVenom" || row.step.skill === "LesserToadVenom"),
  );
  assert(
    repeatedVenomAttacks.length === 2,
    `Reapplying Toad Venom before expiration must not schedule duplicate attacks; received ${repeatedVenomAttacks.length}.`,
  );

  const fullTimeline = buildRotationTimeline({
    rotation: smolderPoetRotation,
    skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
    eventDefinitions: { Exhausted: { name: "Event: Exhausted", castTime: 0, action: [], tags: ["Event"] } },
    dots,
    effectDefinitions: { ...dots, ...mysticDebuffs },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting", "phalanxbane"],
  });
  const fullSmolderTicks = fullTimeline.filter((row) => row.kind === "dot" && row.step.skill === "Smolder");
  const smolderCasts = fullTimeline.filter(
    (row) => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "DragonsBreathSmolder2",
  );
  let expectedLatestSmolderTime = 0;
  smolderCasts
    .flatMap((row) => row.actions.map((action) => ({ row, action, time: row.startTime + Number(action.time ?? 0) })))
    .sort((left, right) => left.time - right.time)
    .forEach(({ action, time }) => {
      if (action.value !== "Smolder" || typeof action.duration !== "number") return;
      if (action.type === "apply" && expectedLatestSmolderTime <= time)
        expectedLatestSmolderTime = time + action.duration;
      if (action.type === "extend" && expectedLatestSmolderTime > time) expectedLatestSmolderTime += action.duration;
    });
  const latestSmolderTime = fullSmolderTicks.at(-1)?.startTime ?? 0;
  assert(
    latestSmolderTime <= expectedLatestSmolderTime + 0.0001,
    `Smolder ticked at ${latestSmolderTime}s after its ${expectedLatestSmolderTime}s expiration.`,
  );
  assert(
    fullSmolderTicks.every(
      (row) =>
        fullTimeline.find((candidate) => candidate.id === row.sourceRowId)?.step.skill === "DragonsBreathSmolder2",
    ),
    "Every full-rotation Smolder tick must belong to a Smolder cast.",
  );

  console.log(
    `DOT lifetime and delayed venom attack checks passed. Full rotation's final Smolder tick is ${latestSmolderTime.toFixed(4)}s.`,
  );
} finally {
  await viteServer.close();
}
