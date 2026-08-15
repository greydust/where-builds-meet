import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const globalBuffs = (await viteServer.ssrLoadModule("/data/buff/global.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const eventDefinitions = {
    HP: { name: "HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
    Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
    Debuff: { name: "Debuff", castTime: 0, action: [{ type: "apply", target: "target", time: 0 }], tags: ["Event"] },
    Exhausted: { name: "Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }], tags: ["Event"] },
    Controlled: { name: "Controlled", castTime: 0, action: [{ type: "apply", target: "target", value: "Controlled", time: 0 }], tags: ["Event"] },
  };
  const baseInput = { eventDefinitions, dots: {}, effectDefinitions: { ...mysticBuffs, ...generalDebuffs }, innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [] };

  const hit = { name: "Hit", castTime: 2, action: [{ type: "damage", phyCoef: 1, time: 0 }, { type: "damage", phyCoef: 1, time: 1 }], modifier: [], tags: ["DragonHeadTide", "HP"] };
  const hpRotation = { name: "HP probe", steps: [{ type: "event", event: "HP", before: { action: 1 }, currentHPRatio: 0.8 }, { type: "skill", skill: "Hit" }], start: { step: 1 } };
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const hpResult = calculateRotationBaseline({
    timeline: { ...baseInput, rotation: hpRotation, skills: { Hit: hit }, setupEffects: globalBuffs.DragonHeadTide.effect },
    startAnchor: { rowId: "rotation-1" }, stats, attunement: {}, enemy, derivedStats: calculateDerivedStats(stats, 0), weapons: [],
    statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {},
  });
  const fullHPHit = hpResult.actionBreakdowns["rotation-1:0"].total;
  const missingHPHit = hpResult.actionBreakdowns["rotation-1:1"].total;
  assert(closeTo(missingHPHit / fullHPHit, 1.09), "Twenty missing HP percentage points must grant Dragon Head 9% damage at hit time.");
  const hpHitRow = hpResult.timeline.find((row) => row.id === "rotation-1");
  assert(hpHitRow.actionStates[0].currentHPRatio === 1 && hpHitRow.actionStates[1].currentHPRatio === 0.8, "The attached HP event must change only its target and subsequent action snapshots.");

  const durationProbe = { name: "Duration probe", castTime: 13, action: [{ type: "damage", phyCoef: 1, time: 0 }, { type: "damage", phyCoef: 1, time: 2.9 }, { type: "damage", phyCoef: 1, time: 3.1 }, { type: "damage", phyCoef: 1, time: 9.9 }, { type: "damage", phyCoef: 1, time: 10.1 }, { type: "damage", phyCoef: 1, time: 12.4 }, { type: "damage", phyCoef: 1, time: 12.6 }], modifier: [], tags: [] };
  const manualTimeline = buildRotationTimeline({
    ...baseInput,
    rotation: { name: "Manual effects", eventTimeReference: "battleStart", steps: [
      { type: "event", event: "Buff", before: { action: "start" }, buff: "Flute" },
      { type: "event", event: "Debuff", before: { action: "start" }, debuff: "Controlled" },
      { type: "event", event: "Exhausted", after: { action: 0 } },
      { type: "skill", skill: "Probe" },
    ], start: { step: 3 } },
    skills: { Probe: durationProbe },
  });
  const probeRow = manualTimeline.find((row) => row.id === "rotation-3");
  assert(probeRow.actionStates[1].debuffs.some((effect) => effect.name === "Controlled"), "A manual Debuff event must use Controlled's default duration.");
  assert(!probeRow.actionStates[2].debuffs.some((effect) => effect.name === "Controlled"), "Controlled must expire at its data-defined duration.");
  assert(probeRow.actionStates[3].debuffs.some((effect) => effect.name === "Exhausted"), "Exhausted must use its data-defined default duration.");
  assert(!probeRow.actionStates[4].debuffs.some((effect) => effect.name === "Exhausted"), "Exhausted must expire after its data-defined default duration.");
  assert(probeRow.actionStates[5].buffs.some((effect) => effect.name === "Flute"), "A manual Buff event must use the selected buff's default duration.");
  assert(!probeRow.actionStates[6].buffs.some((effect) => effect.name === "Flute"), "The manually applied buff must expire at its data-defined duration.");

  console.log("Hit-time HP scaling and manual Buff/Debuff duration checks passed.");
} finally {
  await viteServer.close();
}
