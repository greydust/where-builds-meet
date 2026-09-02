import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const skills = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const buffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { migrateDrunkenPoetSequences } = await viteServer.ssrLoadModule("/src/rotationEditing.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected) => Math.abs((actual ?? Number.NaN) - expected) < 1e-9;
  const componentTimes = [0.6375, 0.5, 0.625, 0.65, 0.5875];
  const compositeIds = [
    "DrunkenPoet1Hit",
    "DrunkenPoet2Hits",
    "DrunkenPoet3Hits",
    "DrunkenPoet4Hits",
    "DrunkenPoet5HitsCancel",
  ];
  const timelineFor = (skillId, initialBuffs = []) =>
    buildRotationTimeline({
      rotation: { name: `${skillId} probe`, steps: [{ type: "skill", skill: skillId }] },
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: buffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      initialBuffs,
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
    })[0];

  compositeIds.forEach((skillId, index) => {
    const hitCount = index + 1;
    const expectedPoetTime = componentTimes.slice(0, hitCount).reduce((total, value) => total + value, 0);
    const sober = timelineFor(skillId);
    const intoxicated = timelineFor(skillId, [{ name: "Intoxicated", stack: 1 }]);
    assert(
      sober.actions.filter((action) => action.type === "damage").length === hitCount &&
        intoxicated.actions.filter((action) => action.type === "damage").length === hitCount,
      `${skillId} must resolve exactly ${hitCount} Poet damage actions with or without initial Intoxicated.`,
    );
    assert(
      closeTo(sober.effectiveCastTime, expectedPoetTime + 0.6875) &&
        closeTo(intoxicated.effectiveCastTime, expectedPoetTime),
      `${skillId} must insert Drink only when Intoxicated is absent.`,
    );
  });

  const expiringTimeline = buildRotationTimeline({
    rotation: {
      name: "Expiring Intoxicated composite probe",
      steps: [
        { type: "skill", skill: "PrimeIntoxicated" },
        { type: "skill", skill: "DrunkenPoet5HitsCancel" },
      ],
    },
    skills: {
      ...skills,
      PrimeIntoxicated: {
        name: "Prime Intoxicated",
        castTime: 0,
        action: [{ type: "apply", target: "self", value: "Intoxicated", duration: 1, time: 0 }],
        tags: [],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: buffs,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 100 },
    resourceMaximums: { Vitality: 100 },
  });
  const expiringPoet = expiringTimeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "DrunkenPoet5HitsCancel",
  );
  assert(
    expiringPoet?.actions.filter((action) => action.type === "damage" && action.type !== "inactive").length === 2,
    "Each Poet component must recheck Intoxicated and stop the remaining chain after it expires.",
  );

  const migrated = migrateDrunkenPoetSequences({
    name: "Legacy Poet chain",
    steps: [
      { type: "event", event: "Buff", before: { action: 2 }, buff: "Intoxicated" },
      ...[1, 2, 3, 4, 5].map((hit) => ({
        type: "skill",
        skill: `DrunkenPoet${hit}`,
        ...(hit === 5 ? { causesBreak: true } : {}),
      })),
      { type: "skill", skill: "LeapingToad" },
    ],
    start: { step: 3, action: 1 },
  });
  assert(
    migrated.steps.length === 3 && migrated.steps[1]?.skill === "DrunkenPoet5HitsCancel",
    "A persisted five-stage Poet chain must migrate to one composite without disturbing neighboring steps.",
  );
  assert(
    migrated.steps[0]?.before?.action === 6,
    "An event attached to legacy Poet 1 must retain its action anchor after migration.",
  );
  assert(
    migrated.start?.step === 1 && migrated.start.action === 22,
    "A fight-start anchor inside a legacy Poet chain must retain its component action after migration.",
  );
  assert(migrated.steps[1]?.causesBreak === true, "A break marker on legacy Poet 5 must move to the composite.");

  console.log("Drunken Poet composite behavior and persisted-chain migration checks passed.");
} finally {
  await viteServer.close();
}
