import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const rotation = (await viteServer.ssrLoadModule("/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json")).default;
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const stonesplitBuffs = (await viteServer.ssrLoadModule("/data/buff/stonesplit-strength.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const conditions = ["FrostCladNight", "MoraleChant", "SteadfastDevotion", "ThroatPiercingArt"].flatMap((name) => Array.from({ length: 7 }, (_, tier) => `${name}T${tier}`));
  const timeline = buildRotationTimeline({
    rotation,
    skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
    eventDefinitions: { Exhausted: { name: "Event: Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }], tags: ["Event"] } }, dots,
    effectDefinitions: { ...mysticBuffs, ...generalBuffs, ...stonesplitBuffs, ...generalDebuffs, ...dots },
    innerWayConditions: conditions,
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting", "phalanxbane"],
  });
  const skillSteps = rotation.steps.filter((step) => step.type === "skill");
  const cancelSkillIds = new Set(["DrunkenPoetDrink", "FluteOfTheTidesCancel", "DrunkenPoet5"]);
  skillSteps.forEach((step, index) => {
    if (cancelSkillIds.has(step.skill)) assert(skillSteps[index + 1]?.skill === "Deflect", `${step.skill} must be followed by Deflect.`);
  });
  const startSkillIndex = rotation.steps.findIndex((step) => step.type === "skill" && step.skill === "SnowpartingSpecial");
  assert(rotation.start?.step === startSkillIndex && rotation.start.action === 5, "The rotation must start at Sideway Fleeting Trace action index 5.");
  assert(skillSteps.slice(17, 22).map((step) => step.skill).join(",") === "DrunkenPoet1,DrunkenPoet2,DrunkenPoet3,DrunkenPoet4,DrunkenPoet5", "Poet x5 must use all five ordered hit definitions.");
  const poet5RotationIndex = rotation.steps.findIndex((step) => step.type === "skill" && step.skill === "DrunkenPoet5");
  const poet5Row = timeline.find((row) => row.id === `rotation-${poet5RotationIndex}`);
  assert(poet5Row?.modifierEffects.some((effect) => effect.dmgBonus === 0.8), "Poet 5 must capture four Enhanced Drunken Poet stacks as an 80% direct-damage bonus.");
  assert(!poet5Row?.actionStates[2]?.buffs.some((effect) => effect.name === "EnhanceDrunkenPoet"), "Poet 5 must consume every Enhanced Drunken Poet stack before its direct hit.");
  const poet5Explosions = timeline.filter((row) => row.kind === "trigger" && row.sourceRowId === poet5Row?.id && (row.step.type === "skill" && ["CombustionExplosion", "SmolderExplosion"].includes(row.step.skill ?? "")));
  assert(poet5Explosions.every((row) => !row.modifierEffects.some((effect) => typeof effect.dmgBonus === "number" && effect.dmgBonus !== 0)), "Poet 5's triggered explosions must not inherit its stack-scaled damage bonus.");
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const directAction = poet5Row?.actions[2];
  const directContext = { stats, attunement: {}, skillTags: poet5Row?.skill?.tags ?? [], weapons: [], buffs: [], enemy, derivedStats: calculateDerivedStats(stats, 0), effects: [] };
  const unenhancedDamage = calculateDamageBreakdown(directAction, directContext).total;
  const enhancedDamage = calculateDamageBreakdown(directAction, { ...directContext, effects: poet5Row?.modifierEffects ?? [] }).total;
  assert(Math.abs(enhancedDamage / unenhancedDamage - 1.8) < 1e-9, "Four Enhanced Drunken Poet stacks must multiply Poet 5 direct damage by 1.8.");
  const exhaustedIndex = rotation.steps.findIndex((step) => step.type === "event" && step.event === "Exhausted");
  const exhaustedEvent = rotation.steps[exhaustedIndex];
  assert(exhaustedEvent?.type === "event" && exhaustedEvent.event === "Exhausted" && "after" in exhaustedEvent && exhaustedEvent.after.action === 3, "Exhausted must attach after the fourth slam's first damage action.");
  const fourthSevenSlam = timeline.find((row) => row.id === `rotation-${exhaustedIndex + 1}`);
  assert(fourthSevenSlam?.step.type === "skill" && fourthSevenSlam.step.skill === "PhalanxbaneHeavyCharged3", "The fourth slam in the seven-slam group must follow Exhausted.");
  const damageTime = fourthSevenSlam.startTime + Number(fourthSevenSlam.actions[3]?.time ?? 0);
  const exhaustedRow = timeline.find((row) => row.id === `rotation-${exhaustedIndex}`);
  assert(exhaustedRow?.startTime === damageTime, "Exhausted must resolve at its attached damage timestamp.");
  assert(!fourthSevenSlam.actionStates[3]?.debuffs.some((effect) => effect.name === "Exhausted"), "The attached damage action must resolve before Exhausted applies.");
  assert(fourthSevenSlam.actionStates[4]?.debuffs.some((effect) => effect.name === "Exhausted"), "The damage action after the break must receive Exhausted.");
  console.log("Smolder Poet sequence, Poet 5 stack damage, and post-action Exhausted timing checks passed.");
} finally {
  await viteServer.close();
}
