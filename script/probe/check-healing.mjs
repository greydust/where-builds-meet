import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateHealingBreakdown } = await viteServer.ssrLoadModule("/src/calculations/healing.ts");
  const { calculateRotationBaseline, calculateRotationSimulation } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationCalculator.ts",
  );
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const royalRemedy = (await viteServer.ssrLoadModule("/data/innerway/royal-remedy.json")).default;
  const panaceaFanSkills = (await viteServer.ssrLoadModule("/data/skill/panacea-fan.json")).default;
  const soulshadeUmbrellaSkills = (await viteServer.ssrLoadModule("/data/skill/soulshade-umbrella.json")).default;
  const delugeBuffs = (await viteServer.ssrLoadModule("/data/buff/silkbind-deluge.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-8;
  const stats = {
    ...emptyStats,
    minPhys: 100,
    maxPhys: 100,
    minSilkbind: 50,
    maxSilkbind: 50,
    silkbindPenetration: 10,
    silkbindHealingBonus: 0.1,
    precision: 1,
    crit: 0.2,
    directCrit: 0.1,
  };
  const enemy = {
    name: "Healing probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const derivedStats = calculateDerivedStats(stats, 0);
  const martialStats = {
    ...stats,
    allMartialArts: 0.05,
    fanDmgBoost: 0.06,
    umbrellaDmgBoost: 0.07,
  };
  const action = { type: "heal", phyCoef: 1, phyBonus: 10, attrBonus: 20 };
  const context = {
    stats: martialStats,
    derivedStats: calculateDerivedStats(martialStats, 0),
    enemy,
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    skillTags: ["Heal", "Heavy", "MartialArts", "Fan", "PanaceaFan"],
    buffs: [],
    effects: [{ physicalPenetration: 10 }, { healingBonus: 0.1 }, { criticalHealingBonus: 0.2 }],
    attunement: { physicalPenetration: 20, panaceaMartialHealingBoost: 0.1 },
  };
  const healing = calculateHealingBreakdown(action, context);
  const physical = 110 * 1.15;
  const silkbind = 70 * 1.05 * 1.1;
  const criticalRate = 0.3;
  const expected = (physical + silkbind) * (1 + criticalRate * 0.7) * 1.31;
  assert(
    closeTo(healing.total, expected),
    `Healing must apply both attack channels, penetration, general healing, All Martial Arts, and matching Art of Fan bonuses (${JSON.stringify(healing)} !== ${expected}).`,
  );
  const silkbindPenetrationHealing = calculateHealingBreakdown(action, {
    ...context,
    stats: { ...context.stats, silkbindPenetration: context.stats.silkbindPenetration + 10 },
  });
  const formlessPenetrationHealing = calculateHealingBreakdown(action, {
    ...context,
    attunement: { ...context.attunement, formlessPenetration: 10 },
  });
  const expectedSilkbindPenetrationIncrease = 70 * 0.05 * 1.1 * (1 + criticalRate * 0.7) * 1.31;
  assert(
    closeTo(silkbindPenetrationHealing.total - healing.total, expectedSilkbindPenetrationIncrease) &&
      closeTo(formlessPenetrationHealing.total - healing.total, expectedSilkbindPenetrationIncrease),
    "Native Silkbind Penetration and Formless Penetration converted by a Silkbind path must boost Silkbind healing equally.",
  );
  const nonSilkbindFormlessHealing = calculateHealingBreakdown(action, {
    ...context,
    weapons: ["thundercry", "stormbreaker"],
    attunement: { ...context.attunement, formlessPenetration: 10 },
  });
  assert(
    closeTo(nonSilkbindFormlessHealing.total, healing.total),
    "Formless Penetration converted to a non-Silkbind primary attribute must not boost Silkbind healing.",
  );
  const umbrellaHealing = calculateHealingBreakdown(action, {
    ...context,
    skillTags: ["Heal", "MartialArts", "Umbrella", "SoulshadeUmbrella"],
  });
  const umbrellaExpected = (physical + silkbind) * (1 + criticalRate * 0.7) * 1.22;
  assert(
    closeTo(umbrellaHealing.total, umbrellaExpected),
    `Umbrella healing must apply All Martial Arts and Art of Umbrella instead of Art of Fan (${JSON.stringify(umbrellaHealing)} !== ${umbrellaExpected}).`,
  );
  assert(
    closeTo(healing.criticalRate, criticalRate) && closeTo(healing.normalRate, 1 - criticalRate),
    "Healing must resolve only Normal and Critical outcomes using Critical Rate times Effective Precision.",
  );

  const healingTimeline = {
    rotation: {
      name: "Healing timeline probe",
      steps: [
        { type: "skill", skill: "SmallerHeal" },
        { type: "skill", skill: "LargerHeal" },
      ],
    },
    skills: {
      SmallerHeal: {
        name: "Smaller Heal",
        castTime: 1,
        action: [{ type: "heal", phyCoef: 1, time: 1 }],
        modifier: [],
        tags: ["Heal", "MartialArts", "PanaceaFan", "CloudburstHealing"],
      },
      LargerHeal: {
        name: "Larger Heal",
        castTime: 1,
        action: [{ type: "heal", phyCoef: 2, time: 1 }],
        modifier: [],
        tags: ["Heal", "MartialArts", "PanaceaFan"],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  };
  const baselineInput = {
    timeline: healingTimeline,
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy,
    derivedStats,
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };
  const result = calculateRotationBaseline(baselineInput);
  const royalRemedyResult = calculateRotationBaseline({
    ...baselineInput,
    timeline: {
      ...healingTimeline,
      innerWayConditions: ["RoyalRemedyT0"],
      innerWayRules: [
        {
          ...royalRemedy.effect.RoyalRemedyT0.effect[0],
          source: "RoyalRemedy",
          tier: 0,
        },
      ],
    },
  });
  const summedHealing = Object.values(result.actionBreakdowns).reduce(
    (total, breakdown) => total + (breakdown.healing?.total ?? 0),
    0,
  );
  assert(
    result.metrics.totalDamage === 0 && closeTo(result.metrics.totalHealing, summedHealing),
    "Heal actions must contribute to healing without contributing to damage.",
  );
  assert(
    closeTo(result.metrics.hps, result.metrics.totalHealing / result.duration),
    "HPS must use the rotation duration shared with DPS.",
  );
  assert(
    result.metrics.breakdown.skills.length === 0 &&
      result.metrics.breakdown.healingSkills.map((row) => row.id).join(",") === "LargerHeal,SmallerHeal",
    "Healing skills must be excluded from damage rows and sorted independently by healing.",
  );
  assert(
    result.metrics.breakdown.healingSkills.every((row) => closeTo(row.normalRate, 70) && closeTo(row.criticalRate, 30)),
    "Healing skill rows must expose their average Normal and Critical outcome rates.",
  );
  assert(
    result.metrics.breakdown.healingCasts.map((row) => row.skillId).join(",") === "LargerHeal,SmallerHeal",
    "Healing casts must be grouped and sorted independently by average HPS.",
  );
  const healingBySkill = (calculation, skillId) =>
    calculation.metrics.breakdown.healingSkills.find((row) => row.id === skillId)?.healing ?? 0;
  assert(
    closeTo(healingBySkill(royalRemedyResult, "SmallerHeal"), healingBySkill(result, "SmallerHeal") * 1.1) &&
      closeTo(healingBySkill(royalRemedyResult, "LargerHeal"), healingBySkill(result, "LargerHeal")),
    "Royal Remedy T0 must increase Cloudburst Healing by 10% without affecting other healing skills.",
  );

  const priorityResult = calculateRotationSimulation({
    ...baselineInput,
    statPriority: [
      { label: "Smaller healing increase", stats: { ...stats, allMartialArts: 0.05 } },
      { label: "Larger healing increase", stats: { ...stats, allMartialArts: 0.1 } },
    ],
  });
  assert(
    priorityResult.metrics.statPriority.map((row) => row.label).join(",") ===
      "Larger healing increase,Smaller healing increase" &&
      priorityResult.metrics.statPriority.every(
        (row) => row.dpsDifference === 0 && row.hpsDifference > 0 && row.healingIncrease > 0,
      ),
    "Healing stat-priority variants must expose HPS changes and use HPS to break equal-DPS ties.",
  );
  const attunementPriorityResult = calculateRotationSimulation({
    ...baselineInput,
    attunementPriority: [
      { label: "Smaller healing attunement", attunement: { panaceaMartialHealingBoost: 0.05 } },
      { label: "Larger healing attunement", attunement: { panaceaMartialHealingBoost: 0.1 } },
    ],
  });
  assert(
    attunementPriorityResult.metrics.attunementPriority.map((row) => row.label).join(",") ===
      "Larger healing attunement,Smaller healing attunement" &&
      attunementPriorityResult.metrics.attunementPriority.every(
        (row) => row.dpsDifference === 0 && row.hpsDifference > 0 && row.healingIncrease > 0,
      ),
    "Healing Attunement variants must expose HPS changes and use HPS to break equal-DPS ties.",
  );
  const setupComparisonResult = calculateRotationSimulation({
    ...baselineInput,
    setupComparisons: {
      healingSetup: [{ label: "Healing setup", attunement: { panaceaMartialHealingBoost: 0.1 } }],
    },
  });
  const healingSetup = setupComparisonResult.metrics.setupComparisons.healingSetup[0];
  assert(
    healingSetup.dpsDifference === 0 && healingSetup.hpsDifference > 0 && healingSetup.healingIncrease > 0,
    "Setup comparisons must expose HPS changes independently from DPS changes.",
  );
  const innerWayPriorityResult = calculateRotationSimulation({
    ...baselineInput,
    innerWayPriority: [
      { label: "Larger healing increase", stats: { ...stats, allMartialArts: 0.1 } },
      { label: "Smaller healing increase", stats: { ...stats, allMartialArts: 0.05 } },
    ],
  });
  assert(
    innerWayPriorityResult.metrics.innerWayPriority.map((row) => row.label).join(",") ===
      "Smaller healing increase,Larger healing increase" &&
      innerWayPriorityResult.metrics.innerWayPriority.every((row) => row.hpsDifference > 0),
    "Healing Inner Way variants must expose HPS changes and use ascending HPS for equal-DPS removal ties.",
  );

  const royalRemedyT1 = royalRemedy.effect.RoyalRemedyT1.trigger[0];
  const fanQVitality = (skillId) => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: `${skillId} Royal Remedy T1 probe`,
        steps: [
          { type: "skill", skill: skillId },
          { type: "skill", skill: "Wait" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: {
        [skillId]: panaceaFanSkills[skillId],
        Wait: { name: "Wait", castTime: 7, action: [] },
        Observe: { name: "Observe", castTime: 0, action: [] },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: ["RoyalRemedyT0", "RoyalRemedyT1"],
      innerWayRules: [
        {
          requirement: royalRemedyT1.requirement,
          trigger: royalRemedyT1,
          effect: {},
          source: "RoyalRemedy",
          tier: 1,
        },
      ],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      initialResources: { Vitality: 0 },
      resourceMaximums: { Vitality: 100 },
    });
    return timeline.find((row) => row.step.type === "skill" && row.step.skill === "Observe")?.resources.Vitality;
  };
  assert(
    fanQVitality("CloudburstHealing") === 14 && fanQVitality("CloudburstHealingCancel") === 14,
    "Royal Remedy T1 must restore two Vitality for each of all seven Fan Q healing ticks.",
  );

  const morningDrizzleTimeline = buildRotationTimeline({
    rotation: {
      name: "Morning Drizzle periodic healing probe",
      steps: [
        { type: "skill", skill: "MorningDrizzle" },
        { type: "skill", skill: "Wait" },
      ],
    },
    skills: {
      MorningDrizzle: panaceaFanSkills.MorningDrizzle,
      Wait: { name: "Wait", castTime: 6, action: [] },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  });
  const morningDrizzleTicks = morningDrizzleTimeline
    .filter((row) => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "MorningDrizzle")
    .map((row) => row.startTime);
  assert(
    morningDrizzleTicks.length === 6 && morningDrizzleTicks.every((time, index) => closeTo(time, 0.55 + index)),
    `Morning Drizzle must heal immediately on application and once per second through 5 seconds (${morningDrizzleTicks.join(", ")}).`,
  );
  const refreshedMorningDrizzleTimeline = buildRotationTimeline({
    rotation: {
      name: "Morning Drizzle refresh probe",
      steps: [
        { type: "skill", skill: "MorningDrizzle" },
        { type: "skill", skill: "MorningDrizzle" },
        { type: "skill", skill: "Wait" },
      ],
    },
    skills: {
      MorningDrizzle: panaceaFanSkills.MorningDrizzle,
      Wait: { name: "Wait", castTime: 6, action: [] },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  });
  const refreshedMorningDrizzleTicks = refreshedMorningDrizzleTimeline
    .filter((row) => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "MorningDrizzle")
    .map((row) => row.startTime);
  assert(
    refreshedMorningDrizzleTicks.length === 7 &&
      closeTo(refreshedMorningDrizzleTicks[0], 0.55) &&
      refreshedMorningDrizzleTicks.slice(1).every((time, index) => closeTo(time, 1.3125 + index)),
    `Refreshing Morning Drizzle must restart its six-tick cadence without retaining superseded ticks (${refreshedMorningDrizzleTicks.join(", ")}).`,
  );

  const echoesTimelineInput = {
    rotation: {
      name: "Echoes of a Thousand Plants periodic healing probe",
      steps: [
        { type: "skill", skill: "EchoesOfAThousandPlants" },
        { type: "skill", skill: "Wait" },
      ],
    },
    skills: {
      EchoesOfAThousandPlants: soulshadeUmbrellaSkills.EchoesOfAThousandPlants,
      Wait: { name: "Wait", castTime: 61, action: [] },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { EchoesOfAThousandPlants: delugeBuffs.EchoesOfAThousandPlants },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  };
  const echoesTimeline = buildRotationTimeline(echoesTimelineInput);
  const echoesTicks = echoesTimeline
    .filter(
      (row) => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "EchoesOfAThousandPlants",
    )
    .map((row) => row.startTime);
  assert(
    echoesTicks.length === 60 && echoesTicks.every((time, index) => closeTo(time, 1.625 + index)),
    `Echoes of a Thousand Plants must begin healing 1 second after application and repeat every second for its 60-second duration (${echoesTicks.length} ticks).`,
  );
  const consumedEchoesTimeline = buildRotationTimeline({
    ...echoesTimelineInput,
    rotation: {
      name: "Floating Grace consumes Echoes probe",
      steps: [
        { type: "skill", skill: "EchoesOfAThousandPlants" },
        { type: "skill", skill: "FloatingGrace" },
        { type: "skill", skill: "Wait" },
      ],
    },
    skills: {
      EchoesOfAThousandPlants: soulshadeUmbrellaSkills.EchoesOfAThousandPlants,
      FloatingGrace: soulshadeUmbrellaSkills.FloatingGrace,
      Wait: { name: "Wait", castTime: 2, action: [] },
    },
  });
  assert(
    !consumedEchoesTimeline.some(
      (row) => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "EchoesOfAThousandPlants",
    ),
    "Casting Floating Grace must consume Echoes of a Thousand Plants before its pending healing ticks resolve.",
  );

  console.log(
    "Healing formula, outcomes, periodic healing and consumption, Royal Remedy triggers, timeline totals, HPS, and breakdown sorting verified.",
  );
} finally {
  await viteServer.close();
}
