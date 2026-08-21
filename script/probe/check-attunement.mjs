import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const thundercrySkills = (await viteServer.ssrLoadModule("/data/skill/thundercry-blade.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Attunement probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const baseAttunement = {
    physicalPenetration: 0,
    formlessPenetration: 0,
    phalanxbaneChargedBoost: 0,
    phalanxbaneMartialBoost: 0,
    snowpartingChargedBoost: 0,
    snowpartingVariedComboBoost: 0,
    snowpartingMartialBoost: 0,
    thundercryChargedBoost: 0,
  };
  const damage = (attunement, skillTags) =>
    calculateDamageBreakdown(
      { phyCoef: 1 },
      {
        stats,
        attunement,
        skillTags,
        weapons: [],
        buffs: [],
        enemy,
        derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
        effects: [],
      },
    ).total;
  const baseline = damage(baseAttunement, ["PhalanxbaneBlade", "Charged"]);
  const oneMatching = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06 }, ["PhalanxbaneBlade", "Charged"]);
  const missingTag = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06 }, ["PhalanxbaneBlade"]);
  const wrongWeapon = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06 }, ["SnowpartingBlade", "Charged"]);
  const twoMatching = damage({ ...baseAttunement, phalanxbaneChargedBoost: 0.06, phalanxbaneMartialBoost: 0.06 }, [
    "PhalanxbaneBlade",
    "Charged",
    "MartialArt",
  ]);
  const penetrated = damage({ ...baseAttunement, physicalPenetration: 10 }, []);

  assert(
    closeTo(oneMatching / baseline, 1.06),
    "A matching armor attunement must apply as a standalone 1 + attunement DMG Bonus multiplier.",
  );
  assert(closeTo(missingTag, baseline), "An armor attunement must require every configured skill tag.");
  assert(closeTo(wrongWeapon, baseline), "An armor attunement must not apply to another weapon's skills.");
  assert(
    closeTo(twoMatching / baseline, 1.12),
    "Matching armor attunement bonuses must sum inside the standalone multiplier.",
  );
  assert(
    closeTo(penetrated / baseline, 1.05),
    "A weapon attunement without skill-match tags must apply to its penetration channel.",
  );

  const cleaveBundle = (attunement) => ({
    timeline: {
      rotation: { name: "Thundercry attunement probe", steps: [{ type: "skill", skill: "StonebreakerCleave" }] },
      skills: {
        StonebreakerCleave: thundercrySkills.StonebreakerCleave,
        StonebreakerQuake: thundercrySkills.StonebreakerQuake,
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["thundercry", "stormbreaker"],
    },
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement,
    enemy,
    derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
    weapons: ["thundercry", "stormbreaker"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const cleaveBaseline = calculateRotationBaseline(cleaveBundle(baseAttunement));
  const cleaveBoosted = calculateRotationBaseline(cleaveBundle({ ...baseAttunement, thundercryChargedBoost: 0.06 }));
  const damageBySkill = (result, skillId) => {
    const row = result.timeline.find((candidate) => candidate.step.skill === skillId);
    if (!row) throw new Error(`Missing ${skillId} timeline row.`);
    return result.actionBreakdowns[`${row.id}:0`]?.total ?? 0;
  };
  assert(
    closeTo(
      damageBySkill(cleaveBoosted, "StonebreakerCleave") / damageBySkill(cleaveBaseline, "StonebreakerCleave"),
      1.06,
    ),
    "Thundercry Charged attunement must apply to Stonebreaker Cleave.",
  );
  assert(
    closeTo(damageBySkill(cleaveBoosted, "StonebreakerQuake"), damageBySkill(cleaveBaseline, "StonebreakerQuake")),
    "Thundercry Charged attunement must exclude Stonebreaker Quake without removing its Charged tag.",
  );
  console.log("Attunement tag and standalone multiplier checks passed.");
} finally {
  await viteServer.close();
}
