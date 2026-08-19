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
  const generalSkills = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const mightSkills = (await viteServer.ssrLoadModule("/data/skill/thundercry-blade.json")).default;
  const strengthBuffs = (await viteServer.ssrLoadModule("/data/buff/stonesplit-strength.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const defenseTimeline = (innerWayConditions) =>
    buildRotationTimeline({
      rotation: { name: "Defense probe", steps: [{ type: "skill", skill: "Defense" }] },
      skills: { Defense: generalSkills.Defense },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: strengthBuffs,
      innerWayConditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    })[0];

  assert(defenseTimeline([]).effectiveCastTime === 0, "Defense must have zero cast time.");
  assert(
    !defenseTimeline([]).actionStates[0].buffs.some((effect) => effect.name === "Cadence"),
    "Defense must not apply Cadence without Exquisite Scenery.",
  );
  const cadenceState = defenseTimeline(["ExquisiteSceneryT0"]).actionStates[0].buffs;
  assert(
    !cadenceState.some((effect) => effect.name === "Cadence"),
    "The applying action's pre-action snapshot must not contain Cadence.",
  );
  const build = (steps, innerWayConditions = ["ExquisiteSceneryT0"], innerWayRules = []) =>
    buildRotationTimeline({
      rotation: { name: "Periodic effect probe", steps },
      skills: {
        Defense: generalSkills.Defense,
        RiposteTrigger: generalSkills.RiposteTrigger,
        Avalanche: mightSkills.Avalanche,
        ApplyCadence: {
          name: "Apply Cadence",
          castTime: 0,
          action: [{ type: "apply", target: "self", value: "Cadence", stack: 2, time: 0 }],
          modifier: [],
          tags: [],
        },
        ApplyOneCadence: {
          name: "Apply One Cadence",
          castTime: 0,
          action: [{ type: "apply", target: "self", value: "Cadence", stack: 1, time: 0 }],
          modifier: [],
          tags: [],
        },
        Probe: { name: "Probe", castTime: 0, action: [{ type: "damage", time: 0 }], modifier: [], tags: [] },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: strengthBuffs,
      innerWayConditions,
      innerWayRules,
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    });

  const followupTimeline = build([
    { type: "skill", skill: "Defense" },
    { type: "skill", skill: "Probe" },
  ]);
  const defensePeriodicRow = followupTimeline.find((row) => row.kind === "periodic" && row.step.skill === "Cadence");
  const followupRow = followupTimeline.find((row) => row.id === "rotation-1");
  assert(defensePeriodicRow?.startTime === 0, "Cadence must trigger immediately when Defense applies it.");
  assert(
    followupRow.actionStates[0].buffs.some((effect) => effect.name === "Riposte") &&
      !followupRow.actionStates[0].buffs.some((effect) => effect.name === "Cadence"),
    "An immediate Cadence trigger must consume Cadence and grant Riposte before the next skill.",
  );

  const baseCooldownTimeline = build([
    { type: "skill", skill: "ApplyCadence" },
    { type: "event", event: "Delay", duration: 12 },
  ]);
  assert(
    JSON.stringify(
      baseCooldownTimeline.filter((row) => row.step.skill === "RiposteTrigger").map((row) => row.startTime),
    ) === JSON.stringify([0, 10]),
    "Riposte must start one ten-second follow-up attempt for each successfully converted Cadence stack.",
  );

  const refreshedTimeline = build([
    { type: "skill", skill: "ApplyCadence" },
    { type: "event", event: "Delay", duration: 2 },
    { type: "skill", skill: "ApplyOneCadence" },
    { type: "event", event: "Delay", duration: 20 },
  ]);
  assert(
    JSON.stringify(
      refreshedTimeline.filter((row) => row.step.skill === "RiposteTrigger").map((row) => row.startTime),
    ) === JSON.stringify([0, 10, 20]),
    "Refreshing Cadence during Riposte cooldown must not consume it or restart the existing follow-up wait.",
  );

  const blockedApplyTimeline = build([
    { type: "skill", skill: "ApplyCadence" },
    { type: "event", event: "Delay", duration: 2 },
    { type: "skill", skill: "ApplyOneCadence" },
    { type: "skill", skill: "Probe" },
  ]);
  const blockedApplyProbe = blockedApplyTimeline.find((row) => row.id === "rotation-3");
  assert(
    blockedApplyProbe.actionStates[0].buffs.find((effect) => effect.name === "Cadence")?.stack === 2,
    "A cooldown-rejected Riposte application must not consume Cadence.",
  );

  const resumedTimeline = build([
    { type: "skill", skill: "ApplyOneCadence" },
    { type: "event", event: "Delay", duration: 12 },
    { type: "skill", skill: "ApplyOneCadence" },
  ]);
  assert(
    JSON.stringify(resumedTimeline.filter((row) => row.step.skill === "RiposteTrigger").map((row) => row.startTime)) ===
      JSON.stringify([0, 12]),
    "Cadence applied after an idle Riposte cooldown must restart the chain immediately.",
  );

  const t4Timeline = build(
    [
      { type: "skill", skill: "ApplyCadence" },
      { type: "event", event: "Delay", duration: 7 },
    ],
    ["ExquisiteSceneryT0", "ExquisiteSceneryT4"],
    [
      {
        source: "ExquisiteScenery",
        tier: 4,
        target: "Riposte",
        modify: { cooldown: 5 },
      },
    ],
  );
  assert(
    JSON.stringify(t4Timeline.filter((row) => row.step.skill === "RiposteTrigger").map((row) => row.startTime)) ===
      JSON.stringify([0, 5]),
    "Exquisite Scenery T4 must reduce both the Riposte cooldown and follow-up wait to five seconds.",
  );

  const avalancheTimeline = build([
    { type: "skill", skill: "Defense" },
    { type: "skill", skill: "Avalanche" },
    { type: "skill", skill: "Probe" },
  ]);
  const avalanche = avalancheTimeline.find((row) => row.id === "rotation-1");
  const afterAvalanche = avalancheTimeline.find((row) => row.id === "rotation-2");
  assert(avalanche.effectiveCastTime === 1.766, "Riposte must reduce Avalanche's cast time by 2 seconds.");
  const avalancheDamageTimes = avalanche.actions
    .filter((action) => action.type === "damage")
    .map((action) => action.time);
  assert(
    avalancheDamageTimes.length === 2 &&
      Math.abs(avalancheDamageTimes[0] - 0.93) < 1e-9 &&
      Math.abs(avalancheDamageTimes[1] - 1.766) < 1e-9,
    "Riposte must shift Avalanche's damage actions with its reduced cast time.",
  );
  assert(
    !afterAvalanche.buffs.some((effect) => effect.name === "Riposte"),
    "Avalanche must consume Riposte when its cast starts.",
  );
  console.log("Defense, Cadence conversion, Riposte cooldown, and Avalanche timing checks passed.");
} finally {
  await viteServer.close();
}
