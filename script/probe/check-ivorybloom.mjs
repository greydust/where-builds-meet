import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const weaponSets = (await viteServer.ssrLoadModule("/data/gear-set.json")).default;
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;

  const setEffects = weaponSets.Ivorybloom.options["4"].effect;
  const stats = {
    ...emptyStats,
    minPhys: 1000,
    maxPhys: 1000,
    minSilkbind: 1000,
    maxSilkbind: 1000,
    precision: 1,
    critDmgBonus: 0.5,
    criticalHealingBonus: 0.5,
  };
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const skill = {
    name: "Damage and healing",
    castTime: 1,
    action: [
      { type: "damage", phyCoef: 1, time: 1 },
      { type: "heal", phyCoef: 1, time: 1 },
    ],
    modifier: [],
    tags: ["MartialArts", "PanaceaFan"],
  };
  const eventDefinitions = {
    SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
  };
  const calculate = (currentHPRatio, setupEffects) => {
    const steps = [
      ...(currentHPRatio < 1 ? [{ type: "event", event: "SelfHP", currentHPRatio }] : []),
      { type: "skill", skill: "DamageAndHealing" },
    ];
    const skillIndex = steps.length - 1;
    const result = calculateRotationBaseline({
      timeline: {
        rotation: { name: "Ivorybloom probe", steps },
        skills: { DamageAndHealing: skill },
        eventDefinitions,
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects,
        weapons: ["panaceaFan", "soulshadeUmbrella"],
      },
      startAnchor: { rowId: `rotation-${skillIndex}` },
      stats,
      attunement: {},
      enemy,
      derivedStats: calculateDerivedStats(stats, 0, {}, ["panaceaFan", "soulshadeUmbrella"]),
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    return {
      damage: result.actionBreakdowns[`rotation-${skillIndex}:0`],
      healing: result.actionBreakdowns[`rotation-${skillIndex}:1`].healing,
    };
  };

  const twoPiece = calculate(1, [weaponSets.Ivorybloom.options["2"].effect]);
  const fourPieceFull = calculate(1, setEffects);
  const fourPieceMissingHP = calculate(0.99, setEffects);

  assert(closeTo(twoPiece.damage.outcomeRates.critical, 0.09), "Ivorybloom two-piece must add 9% Critical Rate.");
  assert(
    closeTo(fourPieceFull.damage.outcomeRates.critical, 0.14) && closeTo(fourPieceFull.healing.criticalRate, 0.14),
    "Ivorybloom four-piece must add another 5% Critical Rate to damage and healing at full HP.",
  );
  assert(
    closeTo(fourPieceMissingHP.damage.outcomeRates.critical, 0.09) &&
      closeTo(fourPieceMissingHP.healing.criticalRate, 0.09),
    "Ivorybloom's full-HP Critical Rate must turn off below full HP.",
  );
  assert(
    fourPieceFull.damage.total > fourPieceMissingHP.damage.total &&
      fourPieceFull.healing.total > fourPieceMissingHP.healing.total,
    "Ivorybloom's full-HP Critical DMG and Critical Healing bonuses must affect their matching actions.",
  );
  console.log("Ivorybloom full-HP damage and healing checks passed.");
} finally {
  await viteServer.close();
}
