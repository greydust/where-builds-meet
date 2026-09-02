import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRawHealingAttackSnapshot, calculateHealingBreakdown } =
    await viteServer.ssrLoadModule("/src/calculations/healing.ts");
  const { calculateRotationBaseline, calculateRotationSimulation, calculateSimulatedRotationRun } =
    await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline, mergeCalculatedTimelineState } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const royalRemedy = (await viteServer.ssrLoadModule("/data/innerway/royal-remedy.json")).default;
  const panaceaFanSkills = (await viteServer.ssrLoadModule("/data/skill/panacea-fan.json")).default;
  const soulshadeUmbrellaSkills = (await viteServer.ssrLoadModule("/data/skill/soulshade-umbrella.json")).default;
  const delugeBuffs = (await viteServer.ssrLoadModule("/data/buff/silkbind-deluge.json")).default;
  const mysticSkills = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
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
    criticalHealingBonus: 0.5,
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
  const panaceaHeavyAttunement = calculateHealingBreakdown(action, {
    ...context,
    attunement: { ...context.attunement, panaceaHealingSkillBoost: 0.06 },
  });
  assert(
    closeTo(panaceaHeavyAttunement.total, expected * (1.37 / 1.31)),
    "Panacea Fan Healing Skill Boost must add General Healing Bonus to Fan Heavy healing.",
  );
  const panaceaSpecialAttunement = calculateHealingBreakdown(action, {
    ...context,
    skillTags: ["Heal", "MartialArts", "Special", "Fan", "PanaceaFan"],
    attunement: {
      ...context.attunement,
      panaceaSpecialHealingBoost: 0.06,
      panaceaHealingSkillBoost: 0.06,
    },
  });
  const panaceaSpecialBaseline = calculateHealingBreakdown(action, {
    ...context,
    skillTags: ["Heal", "MartialArts", "Special", "Fan", "PanaceaFan"],
  });
  assert(
    closeTo(panaceaSpecialAttunement.total / panaceaSpecialBaseline.total, 1.37 / 1.31),
    "Panacea Fan Special Skill Healing Boost must match Special healing while the Heavy-only boost remains inactive.",
  );
  const soulshadeSpecialBaseline = calculateHealingBreakdown(action, {
    ...context,
    skillTags: ["Heal", "MartialArts", "Special", "Umbrella", "SoulshadeUmbrella"],
    attunement: {},
  });
  const soulshadeSpecialAttunement = calculateHealingBreakdown(action, {
    ...context,
    skillTags: ["Heal", "MartialArts", "Special", "Umbrella", "SoulshadeUmbrella"],
    attunement: { soulshadeSpecialHealingBoost: 0.06 },
  });
  assert(
    closeTo(soulshadeSpecialAttunement.total / soulshadeSpecialBaseline.total, 1.28 / 1.22),
    "Soulshade Umbrella Special Skill Healing Boost must add General Healing Bonus only to matching Special healing.",
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
  const teamEndlessCloudTimeline = buildRotationTimeline({
    rotation: {
      name: "Team Endless Cloud Morning Drizzle probe",
      groupSize: 5,
      steps: [
        { type: "skill", skill: "EndlessCloud" },
        { type: "skill", skill: "Wait" },
      ],
    },
    skills: {
      EndlessCloud: panaceaFanSkills.EndlessCloud,
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
  const teamMorningDrizzleTicks = teamEndlessCloudTimeline.filter(
    (row) => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "MorningDrizzle",
  );
  assert(
    teamMorningDrizzleTicks.length === 12 &&
      teamMorningDrizzleTicks.filter((row) => row.playerRecipientIndex === 0).length === 6 &&
      teamMorningDrizzleTicks.filter((row) => row.playerRecipientIndex === 1).length === 6,
    "Endless Cloud must maintain independent Morning Drizzle copies on self and one teammate in a team.",
  );
  const replacedMorningDrizzleTimeline = buildRotationTimeline({
    rotation: {
      name: "Morning Drizzle recipient replacement probe",
      groupSize: 5,
      steps: [
        ...Array.from({ length: 6 }, () => ({ type: "skill", skill: "MorningDrizzle" })),
        { type: "skill", skill: "Observe" },
      ],
    },
    skills: {
      MorningDrizzle: panaceaFanSkills.MorningDrizzle,
      Observe: { name: "Observe", castTime: 0, action: [] },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  });
  const replacementObservation = replacedMorningDrizzleTimeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "Observe",
  );
  const replacedCopies = replacementObservation?.buffs.filter((buff) => buff.name === "MorningDrizzle") ?? [];
  assert(
    replacedCopies.length === 5 &&
      closeTo(replacedCopies.find((buff) => buff.playerRecipientIndex === 0)?.appliedAt, 4.3625) &&
      closeTo(replacedCopies.find((buff) => buff.playerRecipientIndex === 1)?.appliedAt, 1.3125),
    "A full player-target buff roster must replace the copy with the least remaining duration.",
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
  const cutoffEchoesResult = calculateRotationBaseline({
    timeline: {
      ...echoesTimelineInput,
      rotation: {
        name: "Echoes Battle End cutoff probe",
        eventTimeReference: "battleStart",
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "EchoesOfAThousandPlants" },
          { type: "event", event: "BattleEnd", startTime: 5 },
          { type: "skill", skill: "Wait" },
        ],
      },
      eventDefinitions: { BattleEnd: { name: "Battle End", castTime: 0, action: [] } },
    },
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
  });
  const cutoffEchoesHealing = cutoffEchoesResult.metrics.breakdown.healingSkills.find(
    (row) => row.id === "EchoesOfAThousandPlants",
  );
  const cutoffEchoesDamage = cutoffEchoesResult.metrics.breakdown.skills.find(
    (row) => row.id === "EchoesOfAThousandPlants",
  );
  assert(
    cutoffEchoesHealing?.triggers === 4 && cutoffEchoesHealing.heals === 4,
    `Periodic healing triggers after Battle End must not enter the healing breakdown (${JSON.stringify(cutoffEchoesHealing)}).`,
  );
  assert(
    cutoffEchoesDamage?.triggers === 0,
    `Healing-only periodic rows must not count as damage triggers (${JSON.stringify(cutoffEchoesDamage)}).`,
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

  const worldToSwordBundle = {
    timeline: {
      rotation: {
        name: "World to Sword overheal probe",
        steps: [
          { type: "skill", skill: "WorldToSword" },
          { type: "skill", skill: "IncomingHit" },
          { type: "skill", skill: "OverflowHeal" },
        ],
      },
      skills: {
        WorldToSword: mysticSkills.WorldToSword,
        QiBlade: mysticSkills.QiBlade,
        IncomingHit: {
          name: "Incoming Hit",
          castTime: 0.1,
          action: [{ type: "takeDamage", damage: 100, time: 0.1 }],
          tags: [],
        },
        OverflowHeal: {
          name: "Overflow Heal",
          castTime: 0.2,
          action: [
            { type: "heal", phyCoef: 30, time: 0.2 },
            { type: "heal", phyCoef: 30, time: 0.2 },
          ],
          tags: ["Heal", "MartialArts", "PanaceaFan"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { WorldToSword: mysticBuffs.WorldToSword },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
      maxHP: 1000,
    },
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
  const groupHealingContext = {
    stats,
    derivedStats,
    enemy,
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    skillTags: ["Heal"],
    buffs: [],
    effects: [],
    attunement: {},
  };
  const groupHealingThreshold = (() => {
    const snapshot = calculateRawHealingAttackSnapshot(groupHealingContext);
    return snapshot.averagePhysicalAttack * 12 + snapshot.averageSilkbindAttack * 18;
  })();
  const healingPerPhysicalBonus = calculateHealingBreakdown(
    { type: "heal", phyCoef: 0, phyBonus: 1, attrBonus: 0 },
    groupHealingContext,
  ).total;
  const groupHealAction = {
    type: "heal",
    phyCoef: 0,
    phyBonus: (groupHealingThreshold * 0.7) / healingPerPhysicalBonus,
    attrBonus: 0,
    time: 0.1,
  };
  const groupHealingBundle = (groupSize) => ({
    ...worldToSwordBundle,
    timeline: {
      ...worldToSwordBundle.timeline,
      rotation: {
        name: `Group healing ${groupSize}`,
        groupSize,
        steps: [
          { type: "skill", skill: "WorldToSword" },
          { type: "skill", skill: "GroupHeal" },
        ],
      },
      skills: {
        WorldToSword: mysticSkills.WorldToSword,
        QiBlade: mysticSkills.QiBlade,
        GroupHeal: {
          name: "Group Heal",
          group: true,
          castTime: 0.1,
          action: [groupHealAction],
          tags: ["Heal"],
        },
      },
    },
  });
  const soloGroupHealing = calculateRotationBaseline(groupHealingBundle(1));
  const teamGroupHealing = calculateRotationBaseline(groupHealingBundle(5));
  const raidGroupHealing = calculateRotationBaseline(groupHealingBundle(10));
  assert(
    closeTo(teamGroupHealing.metrics.totalHealing, soloGroupHealing.metrics.totalHealing * 5) &&
      closeTo(raidGroupHealing.metrics.totalHealing, soloGroupHealing.metrics.totalHealing * 10),
    "A group heal must report one healing copy for every recipient in the rotation group.",
  );
  const groupHealCount = (result) =>
    result.metrics.breakdown.healingSkills.find((row) => row.id === "GroupHeal")?.heals;
  assert(
    groupHealCount(soloGroupHealing) === 1 &&
      groupHealCount(teamGroupHealing) === 5 &&
      groupHealCount(raidGroupHealing) === 10,
    "A group heal's breakdown must count one heal for every recipient.",
  );
  const groupQiBladeCount = (result) =>
    result.timeline.filter((row) => row.kind === "trigger" && row.step.type === "skill" && row.step.skill === "QiBlade")
      .length;
  const rawThresholdResult = calculateRotationBaseline({
    ...worldToSwordBundle,
    timeline: {
      ...worldToSwordBundle.timeline,
      rotation: {
        name: "Raw WTS threshold probe",
        steps: [
          { type: "skill", skill: "WorldToSword" },
          { type: "skill", skill: "RawThresholdHeal" },
        ],
      },
      skills: {
        WorldToSword: mysticSkills.WorldToSword,
        QiBlade: mysticSkills.QiBlade,
        RawThresholdHeal: {
          name: "Raw threshold heal",
          castTime: 0.1,
          action: [
            {
              type: "heal",
              phyCoef: 0,
              phyBonus: (groupHealingThreshold * 1.1) / healingPerPhysicalBonus,
              attrBonus: 0,
              time: 0.1,
            },
          ],
          tags: ["Heal"],
        },
      },
      setupEffects: [{ physicalAttackBonus: 4, silkbindAttackBonus: 4 }],
    },
  });
  assert(
    groupQiBladeCount(rawThresholdResult) === 1,
    "World to Sword's threshold must use raw character attacks rather than combat-time attack multipliers.",
  );
  assert(
    groupQiBladeCount(soloGroupHealing) === 0 &&
      groupQiBladeCount(teamGroupHealing) === 1 &&
      groupQiBladeCount(raidGroupHealing) === 1,
    "WTS must count teammate group healing as one-fifth overhealing while retaining one threshold cap per action.",
  );
  const playerTargetHealing = calculateRotationBaseline({
    ...worldToSwordBundle,
    timeline: {
      ...worldToSwordBundle.timeline,
      rotation: {
        name: "Single-target teammate WTS probe",
        groupSize: 5,
        steps: [
          { type: "skill", skill: "WorldToSword" },
          { type: "skill", skill: "ApplyPlayerHeal" },
        ],
      },
      skills: {
        WorldToSword: mysticSkills.WorldToSword,
        QiBlade: mysticSkills.QiBlade,
        ApplyPlayerHeal: {
          name: "Apply Player Heal",
          castTime: 0.1,
          action: [
            { type: "apply", target: "player", value: "PlayerHeal", time: 0.1 },
            { type: "apply", target: "player", value: "PlayerHeal", time: 0.1 },
          ],
          tags: ["Heal"],
        },
      },
      effectDefinitions: {
        WorldToSword: mysticBuffs.WorldToSword,
        PlayerHeal: {
          name: "Player Heal",
          duration: 0.1,
          maxStack: 1,
          refresh: true,
          periodic: { interval: 1, firstTick: 0, action: [groupHealAction] },
        },
      },
    },
  });
  assert(
    groupQiBladeCount(playerTargetHealing) === 1,
    "WTS must count all overhealing from a single-target heal assigned to a teammate, rather than applying the group-heal one-fifth weight.",
  );
  const worldToSwordResult = calculateRotationBaseline(worldToSwordBundle);
  const qiBlades = worldToSwordResult.timeline.filter(
    (row) => row.kind === "trigger" && row.step.type === "skill" && row.step.skill === "QiBlade",
  );
  assert(
    qiBlades.length === 2 && closeTo(qiBlades[1].startTime - qiBlades[0].startTime, 0.3),
    "Expected overhealing must retain threshold credit during cooldown and launch queued Qi Blades 0.3 seconds apart.",
  );
  const overflowHealRow = worldToSwordResult.timeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "OverflowHeal",
  );
  assert(
    overflowHealRow?.actionStates[1]?.currentHP === 1000,
    "Healing must restore missing self HP before later healing is counted entirely as overhealing.",
  );
  assert(
    overflowHealRow?.actionStates[1]?.buffs.find((buff) => buff.name === "WorldToSword")?.remainingTriggers === 19,
    "World to Sword must expose its remaining Qi Blade budget after a successful launch.",
  );
  const mergedWorldToSwordTimeline = mergeCalculatedTimelineState(
    buildRotationTimeline(worldToSwordBundle.timeline),
    worldToSwordResult.timeline,
  );
  const mergedOverflowHealRow = mergedWorldToSwordTimeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "OverflowHeal",
  );
  assert(
    mergedOverflowHealRow?.actionStates[1]?.currentHP === 1000 &&
      mergedOverflowHealRow.currentHPRatio === overflowHealRow.currentHPRatio &&
      mergedOverflowHealRow.actionStates[1]?.buffs.find((buff) => buff.name === "WorldToSword")?.remainingTriggers ===
        19,
    "The editor timeline must retain calculated self-HP restoration and finite buff-trigger progress when it merges worker results.",
  );
  const exhaustedWorldToSword = calculateRotationBaseline({
    ...worldToSwordBundle,
    timeline: {
      ...worldToSwordBundle.timeline,
      rotation: {
        name: "World to Sword trigger-limit probe",
        steps: [
          { type: "skill", skill: "WorldToSword" },
          { type: "skill", skill: "TwentyOverflowHeals" },
          { type: "skill", skill: "WaitForBlades" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: {
        WorldToSword: mysticSkills.WorldToSword,
        QiBlade: mysticSkills.QiBlade,
        TwentyOverflowHeals: {
          name: "Twenty Overflow Heals",
          castTime: 6,
          action: Array.from({ length: 20 }, (_, index) => ({
            type: "heal",
            phyCoef: 30,
            time: 0.1 + index * 0.31,
          })),
          tags: ["Heal"],
        },
        WaitForBlades: { name: "Wait for Blades", castTime: 0.5, action: [] },
        Observe: { name: "Observe", castTime: 0, action: [] },
      },
    },
  });
  const exhaustedWorldToSwordObserve = exhaustedWorldToSword.timeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "Observe",
  );
  const exhaustedWorldToSwordBuff = exhaustedWorldToSwordObserve?.buffs.find((buff) => buff.name === "WorldToSword");
  assert(
    groupQiBladeCount(exhaustedWorldToSword) === 20 &&
      exhaustedWorldToSwordBuff?.remainingTriggers === 0 &&
      (exhaustedWorldToSwordBuff.expiresAt ?? 0) >
        (exhaustedWorldToSwordObserve?.startTime ?? Number.POSITIVE_INFINITY),
    "World to Sword must remain active until its normal expiry after all 20 Qi Blades have launched.",
  );
  const ordinaryHealingResult = calculateRotationBaseline({
    ...worldToSwordBundle,
    timeline: {
      ...worldToSwordBundle.timeline,
      rotation: {
        name: "Ordinary self-healing probe",
        steps: [
          { type: "skill", skill: "IncomingHit" },
          { type: "skill", skill: "OverflowHeal" },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: {
        ...worldToSwordBundle.timeline.skills,
        Observe: { name: "Observe", castTime: 0, action: [] },
      },
      effectDefinitions: {},
    },
    startAnchor: { rowId: "rotation-0" },
  });
  const ordinaryHealRow = ordinaryHealingResult.timeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "OverflowHeal",
  );
  const ordinaryObserveRow = ordinaryHealingResult.timeline.find(
    (row) => row.step.type === "skill" && row.step.skill === "Observe",
  );
  assert(
    ordinaryHealRow?.actionStates[1]?.currentHP === 1000 && ordinaryObserveRow?.currentHP === 1000,
    "Ordinary healing must restore timeline self HP even when World to Sword is not active.",
  );
  const fanQQTimeline = buildRotationTimeline({
    rotation: {
      name: "Fan QQ automatic Echoes probe",
      steps: [
        { type: "skill", skill: "EndlessCloud" },
        { type: "skill", skill: "EndlessCloudCancel" },
        { type: "event", event: "Delay", duration: 30 },
        { type: "skill", skill: "EndlessCloud" },
      ],
    },
    skills: { ...panaceaFanSkills, ...soulshadeUmbrellaSkills },
    eventDefinitions: { Delay: { name: "Delay", castTime: 0, action: [], tags: ["Event"] } },
    dots: {},
    effectDefinitions: delugeBuffs,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    martialArtState: {
      panaceaFan: { weapon: "Fan" },
      soulshadeUmbrella: { weapon: "Umbrella" },
    },
  });
  const fanQQEchoes = fanQQTimeline.filter(
    (row) => row.kind === "trigger" && row.step.type === "skill" && row.step.skill === "EchoesOfAThousandPlantsFanQQ",
  );
  assert(
    fanQQEchoes.length === 2 && fanQQEchoes.every((row) => row.actions.every((action) => action.type !== "damage")),
    "Fan QQ must trigger the non-damaging Echoes utility cast only while its shared cooldown is ready.",
  );
  assert(
    fanQQEchoes.every((row) => row.currentMartialArt === "panaceaFan" && row.currentWeapon === "Fan"),
    "The automatic Echoes utility cast must not switch the current martial art or weapon.",
  );
  const secondFanQQ = fanQQTimeline.find(
    (row) => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "EndlessCloudCancel",
  );
  assert(
    secondFanQQ?.buffs.some((buff) => buff.name === "MorningDrizzle"),
    "Fan QQ and Fan QQ Cancel must apply Morning Drizzle at their healing timestamp.",
  );
  assert(
    worldToSwordResult.metrics.breakdown.skills.some((skill) => skill.id === "QiBlade" && skill.hits === 2),
    "Every launched Qi Blade must resolve its delayed damage through the normal damage pipeline.",
  );
  const simulatedWorldToSword = calculateSimulatedRotationRun(worldToSwordBundle, () => 0.25);
  assert(
    simulatedWorldToSword.resolvedSequence.filter(({ entry }) => entry.context.skillTags.includes("QiBlade")).length ===
      2,
    "Simulation must use rolled healing while retaining overheal accumulated during the Qi Blade cooldown.",
  );
  let recipientRoll = 0;
  const independentlyRolledGroupHealing = calculateSimulatedRotationRun(groupHealingBundle(5), () => {
    recipientRoll += 1;
    return recipientRoll % 2 === 1 ? 0 : 0.99;
  });
  const groupHealingEntry = independentlyRolledGroupHealing.resolvedSequence.find(
    ({ entry }) => entry.id === "rotation-1:0",
  );
  const groupHealingOutcomes = new Set(
    groupHealingEntry?.breakdown.recipientHealing?.map((healing) => healing.outcome),
  );
  assert(
    groupHealingEntry?.breakdown.recipientHealing?.length === 5 &&
      groupHealingOutcomes.has("normal") &&
      groupHealingOutcomes.has("critical"),
    "Simulation must independently roll every recipient of a group healing action.",
  );

  console.log(
    "Healing formula, self-HP restoration, World to Sword overheal conversion, periodic healing and consumption, Royal Remedy triggers, timeline totals, HPS, and breakdown sorting verified.",
  );
} finally {
  await viteServer.close();
}
