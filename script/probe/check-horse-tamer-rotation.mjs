import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const mixed = (
    await viteServer.ssrLoadModule("/archive/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s.json")
  ).default;
  const pure = (
    await viteServer.ssrLoadModule("/archive/rotation/stonesplit-strength/pure-horse-tamer-standard-27s.json")
  ).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const stonesplitBuffs = (await viteServer.ssrLoadModule("/data/buff/stonesplit-strength.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const stonesplitDebuffs = (await viteServer.ssrLoadModule("/data/debuff/stonesplit-strength.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const skills = { ...snowparting, ...phalanxbane, ...mystic, ...general };
  const effectDefinitions = {
    ...mysticBuffs,
    ...generalBuffs,
    ...stonesplitBuffs,
    ...generalDebuffs,
    ...stonesplitDebuffs,
    ...dots,
  };
  const eventDefinitions = {
    Qi: {
      name: "Qi",
      castTime: 0,
      action: [
        { type: "setQi", time: 0 },
        {
          type: "apply",
          target: "target",
          value: "Exhausted",
          requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
          time: 0,
        },
      ],
      tags: ["Event"],
    },
    Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], tags: ["Event"] },
    SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
    TakeDamage: {
      name: "Take Damage",
      castTime: 0,
      action: [{ type: "takeDamage", time: 0 }],
      tags: ["Event"],
    },
    Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
  };
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1500, precision: 1 };
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 405,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0.65,
  };

  const calculate = (rotation) =>
    calculateRotationBaseline({
      timeline: {
        rotation,
        skills,
        eventDefinitions,
        dots,
        effectDefinitions,
        innerWayConditions: ["SteadfastDevotionT4", "SteadfastDevotionT6"],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["snowparting", "phalanxbane"],
      },
      startAnchor: { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action },
      stats,
      attunement: {},
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: ["snowparting", "phalanxbane"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });

  const presets = [
    { rotation: pure, name: "Pure Horse Tamer Standard 27s" },
    { rotation: mixed, name: "Mixed Horse Tamer Standard 27s" },
  ];
  presets.forEach(({ rotation, name }) => {
    assert(rotation.name === name, `${name} must use its requested preset name.`);
    assert(rotation.targetHP === 2526534, `${name} must preserve the exported target HP.`);
    assert(rotation.eventTimeReference === "battleStart", `${name} events must remain fight-relative.`);
    assert(
      JSON.stringify(rotation.martialArts) === JSON.stringify(["snowparting", "phalanxbane"]),
      `${name} must remain eligible for Snowparting Blade and Phalanxbane Blade.`,
    );

    const result = calculate(rotation);
    const dragonIndex = rotation.steps.findIndex((step) => step.type === "skill" && step.skill === "DragonHeadTide");
    const dragonRow = result.timeline.find((row) => row.rotationIndex === dragonIndex);
    const dragonBuff = rotation.steps.findIndex(
      (step) => step.type === "event" && step.event === "Buff" && step.buff === "SurgingWaves",
    );
    const firstTakeDamage = rotation.steps.findIndex(
      (step) => step.type === "event" && step.event === "TakeDamage" && step.startTime === 13.5,
    );
    const selfHP = rotation.steps.findIndex((step) => step.type === "event" && step.event === "SelfHP");
    const buffRow = result.timeline.find((row) => row.rotationIndex === dragonBuff);
    const damageRow = result.timeline.find((row) => row.rotationIndex === firstTakeDamage);
    const selfHPRow = result.timeline.find((row) => row.rotationIndex === selfHP);

    assert(dragonIndex >= 0 && dragonRow, `${name} must include Dragon Head - Tide.`);
    assert(
      buffRow?.sourceRowId === dragonRow.id && buffRow.startTime === dragonRow.startTime + dragonRow.actions[8].time,
      `${name} Surging Waves must remain attached to Dragon Head's damage action.`,
    );
    assert(
      selfHPRow?.sourceRowId === damageRow?.id && selfHPRow.startTime === damageRow.startTime,
      `${name} self HP setup must resolve immediately before its 13.5s Take Damage event.`,
    );
    assert(
      result.metrics.totalDamage > 0 && result.duration > 0,
      `${name} must produce a valid calculation (damage=${result.metrics.totalDamage}, duration=${result.duration}).`,
    );
  });

  console.log("Pure and Mixed Horse Tamer Standard 27s presets verified.");
} finally {
  await viteServer.close();
}
