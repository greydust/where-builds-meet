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
  const { isAutomaticCooldownDelay, withAutomaticCooldownDelays } =
    await viteServer.ssrLoadModule("/src/rotationEditing.ts");
  const { default: snowpartingSkills } = await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json");
  const { default: phalanxbaneSkills } = await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const build = (rotation, skills, innerWayConditions = []) =>
    buildRotationTimeline({
      rotation,
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      cooldownPolicy: "wait",
    });

  const multiUseSkills = {
    First: { castTime: 1, cooldown: 12, cooldownUses: 2, action: [] },
    Second: { castTime: 1, cooldown: 12, cooldownUses: 2, action: [] },
  };
  const multiUseRotation = {
    name: "Per-skill multi-use cooldown probe",
    steps: [
      { type: "skill", skill: "First" },
      { type: "skill", skill: "Second" },
      { type: "skill", skill: "First" },
      { type: "skill", skill: "First" },
    ],
  };
  const multiUseTimeline = build(multiUseRotation, multiUseSkills);
  const explicitRows = multiUseTimeline.filter((row) => row.kind === "rotation" && row.step.type === "skill");
  assert(explicitRows[0].startTime === 0, "The first cast must start its cooldown window without waiting.");
  assert(explicitRows[1].startTime === 1, "A different skill must maintain an independent cooldown window.");
  assert(explicitRows[2].startTime === 2, "The second allowed cast of First must remain available.");
  assert(explicitRows[3].startTime === 12, "The third cast of First must wait for its own window to end.");
  assert(explicitRows[3].cooldownWait === 9, "The timeline must expose the exact wait required by the third cast.");

  const adjusted = withAutomaticCooldownDelays(multiUseRotation, multiUseTimeline);
  const generated = adjusted.steps[3];
  assert(isAutomaticCooldownDelay(generated), "Editor reconciliation must materialize a protected cooldown delay.");
  assert(generated.duration === 9, "The generated delay must preserve the timeline's exact cooldown wait.");
  assert(adjusted.steps[4].type === "skill", "The generated cooldown delay must be immediately before its skill.");

  const legion = {
    Legion: {
      castTime: 0.5,
      cooldown: 20,
      action: [],
      modifier: [
        {
          requirement: [{ target: "self", value: "SteadfastDevotionT1" }],
          effect: { cooldown: 1 },
        },
      ],
    },
  };
  const legionRotation = {
    name: "Cooldown modifier probe",
    steps: [
      { type: "skill", skill: "Legion" },
      { type: "skill", skill: "Legion" },
    ],
  };
  const ordinaryLegion = build(legionRotation, legion).filter((row) => row.step.type === "skill");
  const steadfastLegion = build(legionRotation, legion, ["SteadfastDevotionT1"]).filter(
    (row) => row.step.type === "skill",
  );
  assert(ordinaryLegion[1].startTime === 20, "Legion Summon must normally wait for its full cooldown.");
  assert(steadfastLegion[1].startTime === 1, "Steadfast T1 must override Legion Summon's cooldown to one second.");

  const actualSkills = { ...snowpartingSkills, ...phalanxbaneSkills };
  const actualRows = (skillIds, conditions = []) =>
    build(
      { name: "Data cooldown probe", steps: skillIds.map((skill) => ({ type: "skill", skill })) },
      actualSkills,
      conditions,
    ).filter((row) => row.kind === "rotation" && row.step.type === "skill");
  assert(
    Math.abs(actualRows(["SnowpartingQ", "SnowpartingQStab", "SnowpartingQ"])[2].startTime - 1.877) < 0.000001,
    "Stab must not consume a General's Bane use.",
  );
  assert(
    actualRows(["SnowpartingQ", "SnowpartingQ", "SnowpartingQ"])[2].startTime === 12,
    "The third cast of the same General's Bane definition must wait for its two-use window.",
  );
  assert(
    actualRows(["SnowpartingSpecial", "SnowpartingSpecial"])[1].startTime === 20,
    "The real Fleeting Trace definition must enforce its cooldown.",
  );
  assert(
    actualRows(["PhalanxbaneQ", "PhalanxbaneQ"])[1].startTime === 15,
    "The real Total Annihilation definition must enforce its cooldown.",
  );
  assert(
    actualRows(["PhalanxbaneSpecial", "PhalanxbaneSpecial"])[1].startTime === 20 &&
      actualRows(["PhalanxbaneSpecial", "PhalanxbaneSpecial"], ["SteadfastDevotionT1"])[1].startTime === 1.3,
    "The real Legion Summon definition must use its normal cooldown and Steadfast T1 override.",
  );

  console.log("Per-skill cooldown windows, multiple uses, editor waits, and cooldown modifiers passed.");
} finally {
  await viteServer.close();
}
