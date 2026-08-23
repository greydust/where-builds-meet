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
  const { buildRotationTimeline, requirementsPass } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const system = JSON.parse(await readFile("data/system.json", "utf8"));
  const heavenwillSkills = JSON.parse(await readFile("data/skill/heavenwill-gauntlets.json", "utf8"));
  const kiteBuffs = JSON.parse(await readFile("data/buff/bamboocut-kite.json", "utf8"));
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const requirement = [{ target: "resource", value: "HeavensWill", comparison: ">=", amount: 1 }];

  const systemCharacter = calculateStatsWithEffects(emptyStats, [system.baseStats], 0).stats;
  assert(
    systemCharacter.heavensWillRegen === 0.1,
    "The innate character pipeline must provide 0.1 Heaven's Will per second.",
  );
  assert(system.initialResources.HeavensWill === 2, "Heaven's Will must start at the system-defined value of two.");

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

  const regenerationTimeline = buildRotationTimeline({
    rotation: { name: "Resource regeneration probe", steps: [{ type: "skill", skill: "RegenerationSequence" }] },
    skills: {
      RegenerationSequence: {
        name: "Regeneration Sequence",
        castTime: 10,
        action: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "damage", phyCoef: 1, time: 5 },
          { type: "consumeResource", value: "HeavensWill", amount: 0.25, time: 5 },
          { type: "damage", phyCoef: 1, time: 5 },
          { type: "damage", phyCoef: 1, time: 10 },
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
    resourceRegeneration: { HeavensWill: 0.1 },
  });
  const regenerationStates = regenerationTimeline[0].actionStates;
  assert(
    (regenerationStates[0].resources.HeavensWill ?? 0) === 0 &&
      regenerationStates[1].resources.HeavensWill === 0.5 &&
      regenerationStates[3].resources.HeavensWill === 0.25 &&
      regenerationStates[4].resources.HeavensWill === 0.75,
    "Resource regeneration must accrue by elapsed time and preserve same-time action ordering.",
  );

  const fightStartTimeline = buildRotationTimeline({
    rotation: {
      name: "Fight-start resource regeneration probe",
      start: { step: 1 },
      steps: [
        { type: "skill", skill: "PrepullSequence" },
        { type: "skill", skill: "CombatSequence" },
      ],
    },
    skills: {
      PrepullSequence: {
        name: "Prepull Sequence",
        castTime: 5,
        action: [{ type: "damage", phyCoef: 1, time: 0 }],
        modifier: [],
        tags: ["General"],
      },
      CombatSequence: {
        name: "Combat Sequence",
        castTime: 5,
        action: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "damage", phyCoef: 1, time: 5 },
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
    initialResources: system.initialResources,
    resourceRegeneration: { HeavensWill: systemCharacter.heavensWillRegen },
    resourceMaximums: system.resourceMaximums,
  });
  assert(
    fightStartTimeline[0].actionStates[0].resources.HeavensWill === 2 &&
      fightStartTimeline[1].actionStates[0].resources.HeavensWill === 2 &&
      fightStartTimeline[1].actionStates[1].resources.HeavensWill === 2.5,
    "Heaven's Will must not regenerate during prepull time and must begin regenerating at fight start.",
  );

  const buildMandateTimeline = (withUnity) =>
    buildRotationTimeline({
      rotation: {
        name: `Celestial Mandate ${withUnity ? "with" : "without"} Heaven's Unity`,
        steps: [
          ...(withUnity ? [{ type: "skill", skill: "ApplyHeavensUnity" }] : []),
          { type: "skill", skill: "CelestialMandate" },
          { type: "skill", skill: "ObserveHeavensWill" },
        ],
      },
      skills: {
        ...heavenwillSkills,
        ApplyHeavensUnity: {
          name: "Apply Heaven's Unity",
          castTime: 0,
          action: [{ type: "apply", target: "self", value: "HeavensUnity", time: 0 }],
          modifier: [],
          tags: ["General"],
        },
        ObserveHeavensWill: {
          name: "Observe Heaven's Will",
          castTime: 0.01,
          action: [{ type: "damage", phyCoef: 0, time: 0.01 }],
          modifier: [],
          tags: ["General"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: kiteBuffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["heavenwill", "skygrasp"],
    });

  const withoutUnity = buildMandateTimeline(false).at(-1).actionStates[0].resources.HeavensWill;
  const unityTimeline = buildMandateTimeline(true);
  const withUnity = unityTimeline.at(-1).actionStates[0].resources.HeavensWill;
  assert(withoutUnity === 0.1, "Celestial Mandate must generate 0.1 Heaven's Will without Heaven's Unity.");
  assert(withUnity === 0.3, "Celestial Mandate must generate 0.3 Heaven's Will with Heaven's Unity.");

  console.log("Numeric resource action and requirement checks passed.");
} finally {
  await viteServer.close();
}
