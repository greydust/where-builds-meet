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
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
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
  const action = { type: "heal", phyCoef: 1, phyBonus: 10, attrBonus: 20 };
  const context = {
    stats,
    derivedStats,
    enemy,
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    skillTags: ["Heal", "Heavy", "MartialArts", "Fan", "PanaceaFan"],
    buffs: [],
    effects: [{ healingBonus: 0.1 }, { criticalHealingBonus: 0.2 }],
    attunement: { physicalPenetration: 20, panaceaMartialHealingBoost: 0.1 },
  };
  const healing = calculateHealingBreakdown(action, context);
  const physical = 110 * 1.1;
  const silkbind = 70 * 1.05 * 1.1;
  const criticalRate = 0.3;
  const expected = (physical + silkbind) * (1 + criticalRate * 0.7) * 1.2;
  assert(
    closeTo(healing.total, expected),
    `Healing must apply both attack channels, penetration, and healing bonuses (${JSON.stringify(healing)} !== ${expected}).`,
  );
  assert(
    closeTo(healing.criticalRate, criticalRate) && closeTo(healing.normalRate, 1 - criticalRate),
    "Healing must resolve only Normal and Critical outcomes using Critical Rate times Effective Precision.",
  );

  const result = calculateRotationBaseline({
    timeline: {
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
          tags: ["Heal", "MartialArts", "PanaceaFan"],
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

  console.log("Healing formula, outcomes, timeline totals, HPS, and breakdown sorting verified.");
} finally {
  await viteServer.close();
}
