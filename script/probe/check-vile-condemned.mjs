import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const heavenwillSkills = JSON.parse(await readFile("data/skill/heavenwill-gauntlets.json", "utf8"));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const observer = {
    name: "Observe Heaven's Will",
    castTime: 0.01,
    action: [{ type: "damage", phyCoef: 0, time: 0.01 }],
    modifier: [],
    tags: ["General"],
  };
  const restore = {
    name: "Restore Heaven's Will",
    castTime: 0,
    action: [{ type: "setResource", value: "HeavensWill", amount: 3, time: 0 }],
    modifier: [],
    tags: ["General"],
  };
  const falcon = {
    name: "Falcon Probe",
    castTime: 0,
    action: [{ type: "damage", phyCoef: 0, time: 0 }],
    modifier: [],
    tags: ["Falcon"],
  };
  const build = (
    steps,
    {
      initialResources = {},
      resourceRegeneration = {},
      innerWayConditions = [],
      innerWayRules = [],
      initialDebuffs = [],
    },
  ) =>
    buildRotationTimeline({
      rotation: { name: "Vile Condemned probe", steps },
      skills: { ...heavenwillSkills, ObserveHeavensWill: observer, RestoreHeavensWill: restore, FalconProbe: falcon },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { Exhausted: { name: "Exhausted", duration: 10, maxStack: 1 } },
      innerWayConditions,
      innerWayRules,
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
      initialResources,
      resourceRegeneration,
      resourceMaximums: { HeavensWill: 4 },
      initialDebuffs,
    });

  const weakTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    { initialResources: { HeavensWill: 2 } },
  );
  const weakCast = weakTimeline.find((row) => row.step.skill === "VileCondemned");
  const weakObserver = weakTimeline.find((row) => row.step.skill === "ObserveHeavensWill");
  assert(weakCast.effectiveCastTime === 3, "Vile Condemned must retain its three-second total cast time.");
  assert(weakCast.actions[0].phyCoef === 7.2178, "Two Heaven's Will must select Vile Condemned Hit.");
  assert(
    weakObserver.actionStates[0].resources.HeavensWill === 0,
    "Vile Condemned Hit must consume exactly two Heaven's Will.",
  );

  const fractionalFallbackTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    { initialResources: { HeavensWill: 3.5 } },
  );
  const fractionalFallbackCast = fractionalFallbackTimeline.find((row) => row.step.skill === "VileCondemned");
  const fractionalFallbackObserver = fractionalFallbackTimeline.find((row) => row.step.skill === "ObserveHeavensWill");
  assert(
    fractionalFallbackCast.actions[0].phyCoef === 7.2178,
    "Vile Condemned without Soaring High T0 must use the normal release.",
  );
  assert(
    fractionalFallbackObserver.actionStates[0].resources.HeavensWill === 1.5,
    "Vile Condemned Hit must consume exactly two from a fractional resource value.",
  );

  const fractionalEndTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    {
      initialResources: { HeavensWill: 3.5 },
      innerWayConditions: ["SoaringHighT0"],
    },
  );
  const fractionalEndCast = fractionalEndTimeline.find((row) => row.step.skill === "VileCondemned");
  const fractionalEndObserver = fractionalEndTimeline.find((row) => row.step.skill === "ObserveHeavensWill");
  assert(
    fractionalEndCast.actions[0].phyCoef === 11.7527,
    "Vile Condemned with Soaring High T0 must select End Hit at 3.5 Heaven's Will.",
  );
  assert(
    fractionalEndObserver.actionStates[0].resources.HeavensWill === 0.5,
    "Vile Condemned End Hit must consume exactly three at 3.5 Heaven's Will.",
  );

  const endTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    {
      initialResources: { HeavensWill: 2.9 },
      resourceRegeneration: { HeavensWill: 0.1 },
      innerWayConditions: [
        "SoaringHighT0",
        "SoaringHighT1",
        "SoaringHighT2",
        "SoaringHighT3",
        "SoaringHighT4",
        "SoaringHighT5",
      ],
    },
  );
  const endCast = endTimeline.find((row) => row.step.skill === "VileCondemned");
  assert(
    endCast.actions[0].phyCoef === 11.7527,
    "The release-start resource snapshot must select Vile Condemned End Hit at three Heaven's Will.",
  );

  const cappedTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    {
      initialResources: { HeavensWill: 4 },
      resourceRegeneration: { HeavensWill: 0.1 },
      innerWayConditions: ["SoaringHighT0"],
    },
  );
  const cappedCast = cappedTimeline.find((row) => row.step.skill === "VileCondemned");
  const cappedObserver = cappedTimeline.find((row) => row.step.skill === "ObserveHeavensWill");
  assert(
    cappedCast.actionStates[0].resources.HeavensWill === 4,
    "Heaven's Will regeneration must respect the four-point cap.",
  );
  assert(
    !cappedCast.actionModifierEffects[0].some((effect) => effect.baseDMGBonus === 0.3 || effect.critDmgBonus === 0.1),
    "Four Heaven's Will must not grant the End Hit T6 damage bonuses before Soaring High T6.",
  );
  assert(
    Math.abs(cappedObserver.actionStates[0].resources.HeavensWill - 1.001) < 0.000001,
    "Vile Condemned End Hit must consume only three Heaven's Will before Soaring High T6.",
  );

  const t6Timeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    {
      initialResources: { HeavensWill: 4 },
      innerWayConditions: [
        "SoaringHighT0",
        "SoaringHighT1",
        "SoaringHighT2",
        "SoaringHighT3",
        "SoaringHighT4",
        "SoaringHighT5",
        "SoaringHighT6",
      ],
    },
  );
  const t6Cast = t6Timeline.find((row) => row.step.skill === "VileCondemned");
  const t6Observer = t6Timeline.find((row) => row.step.skill === "ObserveHeavensWill");
  assert(
    t6Cast.actionModifierEffects[0].some((effect) => effect.baseDMGBonus === 0.3 && effect.critDmgBonus === 0.1),
    "Four Heaven's Will with Soaring High T6 must lock the 30% base-damage and 10% Critical Damage bonuses.",
  );
  assert(
    t6Observer.actionStates[0].resources.HeavensWill === 0,
    "Vile Condemned End Hit must consume all four Heaven's Will with Soaring High T6.",
  );

  const regeneratedToFourTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    {
      initialResources: { HeavensWill: 3.8 },
      resourceRegeneration: { HeavensWill: 0.1 },
      innerWayConditions: [
        "SoaringHighT0",
        "SoaringHighT1",
        "SoaringHighT2",
        "SoaringHighT3",
        "SoaringHighT4",
        "SoaringHighT5",
        "SoaringHighT6",
      ],
    },
  );
  const regeneratedToFourCast = regeneratedToFourTimeline.find((row) => row.step.skill === "VileCondemned");
  const regeneratedToFourObserver = regeneratedToFourTimeline.find((row) => row.step.skill === "ObserveHeavensWill");
  assert(
    !regeneratedToFourCast.actionModifierEffects[0].some(
      (effect) => effect.baseDMGBonus === 0.3 || effect.critDmgBonus === 0.1,
    ),
    "Reaching four Heaven's Will after release start must not activate the T6 damage bonuses.",
  );
  assert(
    Math.abs(regeneratedToFourObserver.actionStates[0].resources.HeavensWill - 1.001) < 0.000001,
    "A start-bound failed requirement must not consume the fourth Heaven's Will after later regeneration.",
  );

  const cooldownTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "RestoreHeavensWill" },
      { type: "skill", skill: "VileCondemned" },
    ],
    { initialResources: { HeavensWill: 3 }, innerWayConditions: ["SoaringHighT0"] },
  );
  const cooldownCasts = cooldownTimeline.filter((row) => row.step.skill === "VileCondemned");
  assert(cooldownCasts[0].actions[0].phyCoef === 11.7527, "The first ready release must use End Hit.");
  assert(
    cooldownCasts[1].actions[0].phyCoef === 7.2178,
    "A release during End Hit's cooldown must fall back to the weaker hit.",
  );

  const noSoaringHighTimeline = build([{ type: "skill", skill: "VileCondemned" }], {
    initialResources: { HeavensWill: 3 },
  });
  const noSoaringHighCast = noSoaringHighTimeline.find((row) => row.step.skill === "VileCondemned");
  assert(
    noSoaringHighCast.actions[0].phyCoef === 7.2178,
    "Vile Condemned End Hit must remain disabled without Soaring High T0.",
  );

  const t3Rule = {
    source: "SoaringHigh",
    tier: 3,
    requirement: [
      { target: "skillTag", value: "Falcon" },
      { target: "target", value: "Exhausted" },
    ],
    effect: {},
    trigger: {
      target: "self",
      action: [{ type: "clearCD", target: "self", value: "VileCondemnedEndHit" }],
    },
  };
  const t6RefundRule = {
    source: "SoaringHigh",
    tier: 6,
    requirement: [{ target: "skillTag", value: "VileCondemnedEnd" }],
    effect: {},
    trigger: {
      target: "self",
      action: [{ type: "trigger", value: "SoaringHighT6Refund" }],
    },
  };
  const resetTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "RestoreHeavensWill" },
      { type: "skill", skill: "FalconProbe" },
      { type: "skill", skill: "VileCondemned" },
    ],
    {
      initialResources: { HeavensWill: 3 },
      innerWayConditions: ["SoaringHighT0", "SoaringHighT1", "SoaringHighT2", "SoaringHighT3"],
      innerWayRules: [t3Rule],
      initialDebuffs: [{ name: "Exhausted", stack: 1, expiresAt: 100 }],
    },
  );
  const resetCasts = resetTimeline.filter((row) => row.step.skill === "VileCondemned");
  assert(
    resetCasts.every((row) => row.actions[0].phyCoef === 11.7527),
    "Soaring High T3 Falcon damage against an exhausted target must reset End Hit cooldown.",
  );

  const refundTimeline = build(
    [
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
      { type: "skill", skill: "RestoreHeavensWill" },
      { type: "skill", skill: "FalconProbe" },
      { type: "skill", skill: "VileCondemned" },
      { type: "skill", skill: "ObserveHeavensWill" },
    ],
    {
      initialResources: { HeavensWill: 3 },
      innerWayConditions: [
        "SoaringHighT0",
        "SoaringHighT1",
        "SoaringHighT2",
        "SoaringHighT3",
        "SoaringHighT4",
        "SoaringHighT5",
        "SoaringHighT6",
      ],
      innerWayRules: [t3Rule, t6RefundRule],
      initialDebuffs: [{ name: "Exhausted", stack: 1, expiresAt: 100 }],
    },
  );
  const refundObservers = refundTimeline.filter((row) => row.step.skill === "ObserveHeavensWill");
  assert(
    refundObservers[0].actionStates[0].resources.HeavensWill === 1,
    "The first Soaring High T6 End Hit must refund one Heaven's Will.",
  );
  assert(
    refundObservers[1].actionStates[0].resources.HeavensWill === 0,
    "Resetting End Hit must not reset the separate T6 refund cooldown.",
  );

  console.log("Vile Condemned branch, cooldown, start-bound requirement, and consumption checks passed.");
} finally {
  await viteServer.close();
}
