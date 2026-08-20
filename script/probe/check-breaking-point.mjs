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
  const buffs = (await viteServer.ssrLoadModule("/data/buff/bamboocut-wind.json")).default;
  const breakingPoint = (await viteServer.ssrLoadModule("/data/innerway/breaking-point.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  assert(
    buffs.Disintegration.cooldown === undefined,
    "Disintegration must accept every Breaking Point stack application.",
  );
  assert(buffs.Disintegration.maxStack === 3, "Disintegration must default to a three-stack cap.");
  assert(
    breakingPoint.effect.BreakingPointT0.trigger[0].action[0].stack === 1,
    "Breaking Point must add one Disintegration stack per trigger.",
  );
  assert(
    breakingPoint.effect.BreakingPointT4.effect[0].modify.maxStack === 5,
    "Breaking Point T4 must raise the Disintegration cap to five.",
  );
  assert(buffs.Disintegration.stackEffects.length >= 5, "Disintegration must define effects through five stacks.");

  const hit = {
    name: "Breaking Point probe hit",
    castTime: 1,
    action: [{ type: "damage", phyCoef: 1, time: 0.5 }],
    modifier: [],
    tags: ["DirectDamage"],
  };
  const exhausted = {
    name: "Exhausted",
    castTime: 0,
    action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }],
    tags: ["Event"],
  };
  const triggerDefinition = breakingPoint.effect.BreakingPointT0.trigger[0];
  const triggerRule = {
    requirement: triggerDefinition.requirement,
    trigger: { target: triggerDefinition.target, action: triggerDefinition.action },
    effect: {},
    source: "BreakingPoint",
    tier: 0,
  };
  const maxStackRule = {
    ...breakingPoint.effect.BreakingPointT4.effect[0],
    source: "BreakingPoint",
    tier: 4,
  };
  const stackStarts = (hitCount, highTier) => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Breaking Point stacking probe",
        steps: [
          ...Array.from({ length: hitCount }, () => ({ type: "skill", skill: "Hit" })),
          { type: "event", event: "Exhausted", startTime: 0 },
        ],
        eventTimeReference: "battleStart",
      },
      skills: { Hit: hit },
      eventDefinitions: { Exhausted: exhausted },
      dots: {},
      effectDefinitions: { ...buffs, Exhausted: { name: "Exhausted", duration: 100, maxStack: 1 } },
      innerWayConditions: Array.from({ length: highTier ? 5 : 1 }, (_, tier) => `BreakingPointT${tier}`),
      innerWayRules: highTier ? [triggerRule, maxStackRule] : [triggerRule],
      setupEffects: [],
      weapons: [],
    });
    return timeline
      .filter((row) => row.kind === "rotation" && row.step.type === "skill")
      .map((row) => row.buffs.find((effect) => effect.name === "Disintegration")?.stack ?? 0);
  };
  assert(
    JSON.stringify(stackStarts(4, false)) === JSON.stringify([0, 1, 2, 3]),
    "Repeated Breaking Point triggers must accumulate to the default three-stack cap.",
  );
  assert(
    JSON.stringify(stackStarts(6, true)) === JSON.stringify([0, 1, 2, 3, 4, 5]),
    "Breaking Point T4 must accumulate Disintegration to five stacks.",
  );
  console.log("Breaking Point stacking checks passed.");
} finally {
  await viteServer.close();
}
