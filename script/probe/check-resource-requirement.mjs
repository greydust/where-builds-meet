import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { buildRotationTimeline, requirementsPass } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const requirement = [{ target: "resource", value: "HeavensWill", comparison: ">=", amount: 1 }];

  assert(
    !requirementsPass(requirement, [], [], [], new Set(), ["heavenwill", "skygrasp"], {}),
    "A missing resource must default to zero.",
  );
  assert(
    requirementsPass(requirement, [], [], [], new Set(), ["heavenwill", "skygrasp"], { HeavensWill: 1 }),
    "A resource equal to the threshold must pass a greater-than-or-equal requirement.",
  );
  assert(
    !requirementsPass(
      [{ target: "resource", value: "HeavensWill", comparison: ">", amount: 1 }],
      [],
      [],
      [],
      new Set(),
      ["heavenwill", "skygrasp"],
      { HeavensWill: 1 },
    ),
    "Resource comparisons must preserve their declared operator.",
  );

  const timeline = buildRotationTimeline({
    rotation: { name: "Resource probe", steps: [{ type: "skill", skill: "ResourceSequence" }] },
    skills: {
      ResourceSequence: {
        name: "Resource Sequence",
        castTime: 1,
        action: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "addResource", value: "HeavensWill", amount: 1, time: 0 },
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "consumeResource", value: "HeavensWill", amount: 1, time: 0 },
          { type: "damage", phyCoef: 1, time: 0 },
        ],
        modifier: [],
        tags: ["MartialArts", "SkygraspRopeDart"],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["heavenwill", "skygrasp"],
  });
  const row = timeline[0];
  assert(
    (row.actionStates[0].resources.HeavensWill ?? 0) === 0 &&
      row.actionStates[2].resources.HeavensWill === 1 &&
      row.actionStates[4].resources.HeavensWill === 0,
    "Resource actions must affect only subsequent actions in timeline order.",
  );

  console.log("Numeric resource action and requirement checks passed.");
} finally {
  await viteServer.close();
}
