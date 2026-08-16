import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { resolveSegmentValue } = await viteServer.ssrLoadModule("/src/calculations/dynamicValues.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const segment = { function: "segment", param1: "actionTime", param2: [1.5, 2.5], param3: [-0.7, -1, -1.2] };
  assert(
    resolveSegmentValue(segment, { actionTime: 1.5 }) === -0.7,
    "A value equal to the first threshold must use the first segment.",
  );
  assert(
    resolveSegmentValue(segment, { actionTime: 2 }) === -1,
    "A value between thresholds must use the matching segment.",
  );
  assert(
    resolveSegmentValue(segment, { actionTime: 3 }) === -1.2,
    "A value above every threshold must use the overflow segment.",
  );

  const timeline = buildRotationTimeline({
    rotation: { name: "Segment timing probe", steps: [{ type: "skill", skill: "Probe" }] },
    skills: {
      Probe: {
        name: "Probe",
        castTime: 2,
        action: [
          { type: "damage", time: 1.5 },
          { type: "damage", time: 2 },
        ],
        modifier: [
          {
            effect: {
              castTimeModifier: { function: "segment", param1: "actionTime", param2: [1.5], param3: [-0.7, -1] },
            },
          },
        ],
        tags: [],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  });
  const row = timeline[0];
  assert(row.effectiveCastTime === 1, "The cast end above 1.5s must receive the overflow modifier.");
  assert(row.actions[0].time === 0.8, "An action equal to 1.5s must receive the first segment modifier.");
  assert(row.actions[1].time === 1, "An action above 1.5s must receive the overflow modifier.");
  console.log("Segment boundary, overflow, and per-action timing checks passed.");
} finally {
  await viteServer.close();
}
