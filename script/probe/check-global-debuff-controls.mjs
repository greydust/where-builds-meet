import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { defaultGlobalDebuffs, globalDebuffTimelineEffects, normalizeGlobalDebuffs } = await viteServer.ssrLoadModule("/src/globalDebuffs.ts");
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const strengthDebuffs = (await viteServer.ssrLoadModule("/data/debuff/stonesplit-strength.json")).default;
  const mightDebuffs = (await viteServer.ssrLoadModule("/data/debuff/stonesplit-might.json")).default;
  const splendorDebuffs = (await viteServer.ssrLoadModule("/data/debuff/bellstrike-splendor.json")).default;
  const umbraDebuffs = (await viteServer.ssrLoadModule("/data/debuff/bellstrike-umbra.json")).default;
  const dustDebuffs = (await viteServer.ssrLoadModule("/data/debuff/bamboocut-dust.json")).default;
  const innerWayDebuffs = (await viteServer.ssrLoadModule("/data/debuff/innerway.json")).default;
  const effectDefinitions = { ...generalDebuffs, ...strengthDebuffs, ...mightDebuffs, ...splendorDebuffs, ...umbraDebuffs, ...dustDebuffs, ...innerWayDebuffs };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 408, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const exhaustedEvent = { name: "Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", stack: 1, time: 0 }], tags: ["Event"] };
  const hit = (tags = [], appliesFearful = false) => ({ name: "Hit", castTime: 1, action: [...(appliesFearful ? [{ type: "apply", target: "target", value: "FearfulBlade", stack: 1, time: 0 }] : []), { type: "damage", phyCoef: 1, time: 1 }], tags });
  const result = (initialDebuffs, tags = [], exhausted = false, appliesFearful = false) => {
    const steps = exhausted ? [{ type: "event", event: "Exhausted", startTime: 0 }, { type: "skill", skill: "Hit" }] : [{ type: "skill", skill: "Hit" }];
    const skillIndex = exhausted ? 1 : 0;
    return calculateRotationBaseline({
      timeline: { rotation: { name: "Probe", steps, start: { step: skillIndex } }, skills: { Hit: hit(tags, appliesFearful) }, eventDefinitions: { Exhausted: exhaustedEvent }, dots: {}, effectDefinitions, innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [], initialDebuffs },
      startAnchor: { rowId: `rotation-${skillIndex}` }, stats, attunement: {}, enemy, derivedStats: calculateDerivedStats(stats, 0), weapons: [], statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {},
    }).metrics.dps;
  };

  assert(JSON.stringify(normalizeGlobalDebuffs(null)) === JSON.stringify(defaultGlobalDebuffs), "Missing stored controls must migrate to the all-off default.");
  const phantomEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, phantomChime: true });
  assert(phantomEffects[0]?.name === "PhantomChime" && phantomEffects[0]?.stack === 5 && phantomEffects[0]?.persistent, "Phantom Chime On must initialize a permanent maximum-stack debuff.");
  const soulEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, soulShaken: true });
  assert(soulEffects[0]?.name === "SoulShaken" && soulEffects[0]?.stack === 5 && soulEffects[0]?.persistent, "Soul-Shaken On must initialize a permanent maximum-stack debuff.");
  const qingyiEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, qingyisCharm: "T6" });
  assert(qingyiEffects[0]?.name === "QingyisCharmT6" && qingyiEffects[0]?.stack === 5 && qingyiEffects[0]?.persistent, "Bitter Seasons T6 must initialize its permanent maximum-stack debuff.");

  const baseline = result([]);
  const phantom = result(phantomEffects);
  assert(closeTo(phantom / baseline, 1.05), "Phantom Chime must reduce flat Physical Resistance through the full rotation path.");
  const qingyi = result(qingyiEffects);
  assert(closeTo(qingyi, (1000 - 408 * 0.94) * 1.05), "Qingyi's Charm T6 must combine defense and Physical Resistance reductions.");

  const vulnerableEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, vulnerable: true });
  assert(closeTo(result(vulnerableEffects) / baseline, 1.08), "Vulnerable must give its shared 8% to non-Might damage.");
  assert(closeTo(result(vulnerableEffects, ["StormbreakerSpear"]) / baseline, 1.16), "Vulnerable must give an additional 8% to Might damage.");
  const fearfulEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, fearfulBlade: true });
  assert(closeTo(result(fearfulEffects, ["SnowpartingBlade"]) / baseline, 1.08), "Fearful Blade must give its conditional 8% to Strength damage.");
  assert(closeTo(result(fearfulEffects, ["SnowpartingBlade"], false, true) / baseline, 1.08), "A rotation-applied Fearful Blade must merge with the permanent global debuff instead of doubling it.");

  const qiEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, qiImbalance: true });
  assert(closeTo(result(qiEffects) / baseline, 1), "Qi Imbalance's HP bonus must remain inactive outside Exhausted.");
  const exhaustedBaseline = result([], [], true);
  const exhaustedQi = result(qiEffects, [], true);
  assert(closeTo(exhaustedQi / exhaustedBaseline, 1.18 / 1.1), "Qi Imbalance must add 8% to the global category during Exhausted.");

  console.log("Global debuff control and conditional-effect checks passed.");
} finally {
  await viteServer.close();
}
