import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const rotation = (await viteServer.ssrLoadModule("/data/rotation/stonesplit-strength/mixed-horse-tamer-standard.json")).default;
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
  const { readableRotationText } = await viteServer.ssrLoadModule("/src/readableRotation.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  const skills = { ...snowparting, ...phalanxbane, ...mystic, ...general };
  const effectDefinitions = { ...mysticBuffs, ...generalBuffs, ...stonesplitBuffs, ...generalDebuffs, ...stonesplitDebuffs, ...dots };
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1500, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 405, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0.65 };
  const result = calculateRotationBaseline({
    timeline: {
      rotation,
      skills,
      eventDefinitions: {
        Exhausted: { name: "Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }], tags: ["Event"] },
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], tags: ["Event"] },
        HP: { name: "HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
        Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
        Debuff: { name: "Debuff", castTime: 0, action: [{ type: "apply", target: "target", time: 0 }], tags: ["Event"] },
      },
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

  const dragonIndex = rotation.steps.findIndex((step) => step.type === "skill" && step.skill === "DragonHeadTide");
  const exhausted = rotation.steps[dragonIndex - 1];
  const hpEvent = rotation.steps[dragonIndex - 2];
  const surgingWaves = rotation.steps[dragonIndex - 3];
  const postDragonCharged = result.timeline.filter((row) => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "PhalanxbaneHeavyCharged3" && row.rotationIndex > dragonIndex);
  assert(rotation.name === "Mixed Horse Tamer Standard", "Rotation name must match the requested preset name.");
  assert(surgingWaves?.type === "event" && surgingWaves.event === "Buff" && surgingWaves.buff === "SurgingWaves" && surgingWaves.stack === 32 && surgingWaves.before?.action === 8, "Dragon Head must receive 32 external Surging Waves stacks immediately before its damage hit.");
  assert(hpEvent?.type === "event" && hpEvent.event === "HP" && hpEvent.currentHPRatio === 0.2 && hpEvent.before?.action === 8, "Dragon Head must be at 20% HP immediately before its damage hit.");
  assert(exhausted?.type === "event" && exhausted.event === "Debuff" && exhausted.debuff === "Exhausted" && exhausted.before?.action === 8, "External Exhausted must apply immediately before Dragon Head's damage hit.");
  const dragonRow = result.timeline.find((row) => row.kind === "rotation" && row.rotationIndex === dragonIndex);
  assert(!dragonRow?.actionStates[0].buffs.some((effect) => effect.name === "SurgingWaves"), "External Surging Waves must not be present at Dragon Head's cast start.");
  assert(dragonRow?.actionStates[8].buffs.find((effect) => effect.name === "SurgingWaves")?.stack === 40, "Dragon Head's eight applications must raise Surging Waves to 40 stacks before its hit.");
  assert(dragonRow?.actionStates[8].debuffs.some((effect) => effect.name === "Exhausted"), "Dragon Head's damage must see externally applied Exhausted.");
  assert(dragonRow?.actionStates[8].currentHPRatio === 0.2, "Dragon Head's damage must use 20% current HP.");
  assert(readableRotationText(result.timeline, { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action }, 0).includes("Dragon Head - Tide (break)"), "Readable format must mark externally exhausted Dragon Head as the break skill.");
  assert(postDragonCharged.length >= 3, "The post-break slow charged and charged x2 sequence is missing.");
  assert(postDragonCharged[0].currentHPRatio === 1 && postDragonCharged[0].actionStates[0].currentHPRatio === 1, `HP must return to 100% at the first skill after Dragon Head (row=${postDragonCharged[0].currentHPRatio}, action=${postDragonCharged[0].actionStates[0].currentHPRatio}).`);
  assert(postDragonCharged[0].effectiveCastTime > postDragonCharged[1].effectiveCastTime, "The first post-break charged cast must be slow and grant enhancement to the next cast.");
  assert(result.metrics.totalDamage > 0 && result.duration > 0, "The preset must produce a valid calculation.");
  console.log("Mixed Horse Tamer Standard sequence, break, charged timing, and calculation verified.");
} finally {
  await viteServer.close();
}
