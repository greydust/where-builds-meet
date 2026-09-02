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
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const commonInput = {
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    eventDefinitions: {
      HP: {
        name: "Event: HP",
        castTime: 0,
        action: [{ type: "setTargetHP", time: 0 }],
        tags: ["Event"],
      },
      TakeDamage: {
        name: "Event: Take Damage",
        castTime: 0,
        action: [{ type: "takeDamage", time: 0 }],
        tags: ["Event"],
      },
      BattleEnd: {
        name: "Event: Battle End",
        castTime: 0,
        action: [],
        tags: ["Event"],
      },
    },
  };

  const hpTimeline = buildRotationTimeline({
    ...commonInput,
    rotation: {
      name: "Automatic HP probe",
      autoHP: true,
      eventTimeReference: "battleStart",
      steps: [{ type: "skill", skill: "ObserveHP" }],
    },
    skills: {
      ObserveHP: {
        name: "Observe HP",
        castTime: 10,
        action: Array.from({ length: 11 }, (_, time) => ({ type: "damage", phyCoef: 1, time })),
        tags: ["General"],
      },
    },
  });
  const hpRow = hpTimeline.find((row) => row.step.type === "skill");
  const automaticRows = hpTimeline.filter(
    (row) => row.step.type === "event" && row.step.event === "HP" && row.step.automatic,
  );
  assert(automaticRows.length === 10, "Auto HP must create ten hidden state changes for a nonzero rotation.");
  assert(
    Object.values(hpRow.actionStates).every((state, index) => {
      const expected = index === 0 ? 0.9999 : 0.9999 - Math.min(index, 9) * 0.1;
      return Math.abs(state.targetHPRatio - expected) < 1e-9;
    }),
    "Auto HP must begin at 99.99% and lose ten percentage points at each 10% duration boundary.",
  );

  const vitalityTimeline = buildRotationTimeline({
    ...commonInput,
    rotation: {
      name: "Infinite Vitality probe",
      infiniteVitality: true,
      steps: [{ type: "skill", skill: "SpendVitality" }],
    },
    skills: {
      SpendVitality: {
        name: "Spend Vitality",
        castTime: 2,
        action: [
          { type: "consumeResource", value: "Vitality", amount: 50, time: 0 },
          { type: "damage", phyCoef: 1, time: 1 },
          { type: "addResource", value: "Vitality", amount: 10, time: 1 },
          { type: "consumeResource", value: "Vitality", amount: "all", time: 2 },
          { type: "damage", phyCoef: 1, time: 2 },
        ],
        tags: ["Mystic"],
      },
    },
    initialResources: { Vitality: 100 },
    resourceMaximums: { Vitality: 100 },
  });
  assert(
    Object.values(vitalityTimeline[0].actionStates).every((state) => state.resources.Vitality === 100),
    "An infinite resource must remain at its maximum through gains and every form of consumption.",
  );

  const dummyAttackTimeline = buildRotationTimeline({
    ...commonInput,
    rotation: {
      name: "Dummy Attack probe",
      dummyAttack: true,
      eventTimeReference: "battleStart",
      steps: [
        { type: "skill", skill: "ObserveDamage" },
        { type: "event", event: "BattleEnd", startTime: 18 },
      ],
    },
    skills: {
      ObserveDamage: {
        name: "Observe Damage",
        castTime: 18,
        action: [{ type: "damage", phyCoef: 1, time: 18 }],
        tags: ["General"],
      },
    },
    maxHP: 2000,
  });
  const dummyAttackRows = dummyAttackTimeline.filter(
    (row) => row.step.type === "event" && row.step.event === "TakeDamage" && row.step.automatic === "dummyAttack",
  );
  assert(
    dummyAttackRows.length === 6 &&
      dummyAttackRows.every((row, index) => Math.abs(row.startTime - (5.5 + Math.floor(index / 2) * 6)) < 1e-9),
    "Dummy Attack must create two generated 200-damage events together every six seconds from 5.5s until Battle End.",
  );
  assert(
    dummyAttackRows.every((row) => row.actions[0]?.damage === 200),
    "Every generated Dummy Attack hit must deal exactly 200 damage.",
  );
  const observedDamageRow = dummyAttackTimeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "ObserveDamage",
  );
  assert(
    observedDamageRow?.actionStates[0]?.currentHP === 800,
    "Generated Dummy Attack hits must update the same Self HP state as manual Take Damage events.",
  );

  console.log("Rotation Auto HP, Dummy Attack, and Infinite Vitality checks passed.");
} finally {
  await viteServer.close();
}
