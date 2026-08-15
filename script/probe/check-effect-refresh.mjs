import { createServer } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const mysticSkills = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const mysticDots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;

  for (const directory of ["data/buff", "data/debuff"]) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
      const definitions = JSON.parse(readFileSync(join(directory, file), "utf8"));
      for (const [id, definition] of Object.entries(definitions)) {
        const expected = id !== "SurgingWaves";
        assert(definition.refresh === expected, `${directory}/${file}:${id} must explicitly set refresh to ${expected}.`);
      }
    }
  }

  assert(mysticBuffs.SurgingWaves.refresh === false, "Surging Waves must not refresh its duration when gaining stacks.");
  assert(mysticBuffs.SurgingWaves.stackEffects.length === 40, "Surging Waves must define all 40 cumulative stack tiers.");
  mysticBuffs.SurgingWaves.stackEffects.forEach((group, index) => {
    assert(closeTo(group[0]?.effect?.dmgBonus, (index + 1) * 0.0125), `Surging Waves stack ${index + 1} has the wrong cumulative damage bonus.`);
    assert(group[1]?.effect?.baseDMGBonus === 1, `Surging Waves stack ${index + 1} is missing the Exhausted base damage bonus.`);
  });
  assert(Object.values(mysticDots).every((definition) => definition.refresh === false), "Every DOT must explicitly disable duration refresh.");

  const stackingSkill = {
    name: "Stacking probe",
    castTime: 8,
    action: [
      { type: "apply", target: "self", value: "SurgingWaves", stack: 1, time: 0 },
      { type: "apply", target: "self", value: "SurgingWaves", stack: 1, time: 2 },
      { type: "damage", phyCoef: 1, time: 6.9 },
      { type: "damage", phyCoef: 1, time: 7.1 },
    ],
    modifier: [],
    tags: ["DragonHeadTide"],
  };
  const stackingTimeline = buildRotationTimeline({
    rotation: { name: "Refresh probe", steps: [{ type: "skill", skill: "Probe" }] },
    skills: { Probe: stackingSkill }, eventDefinitions: {}, dots: {}, effectDefinitions: mysticBuffs,
    innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [],
  });
  const stackingRow = stackingTimeline[0];
  assert(stackingRow.actionStates[2].buffs.find((effect) => effect.name === "SurgingWaves")?.stack === 2, "Surging Waves must accumulate stacks before its original expiration.");
  assert(!stackingRow.actionStates[3].buffs.some((effect) => effect.name === "SurgingWaves"), "The second Surging Waves stack must not extend the first stack's expiration.");

  const refreshingSkill = { ...stackingSkill, action: stackingSkill.action.map((action) => action.value === "SurgingWaves" ? { ...action, value: "Refreshing" } : action) };
  const refreshingTimeline = buildRotationTimeline({
    rotation: { name: "Refreshing probe", steps: [{ type: "skill", skill: "Probe" }] },
    skills: { Probe: refreshingSkill }, eventDefinitions: {}, dots: {},
    effectDefinitions: { Refreshing: { name: "Refreshing", duration: 7, maxStack: 40, refresh: true, effect: [] } },
    innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [],
  });
  assert(refreshingTimeline[0].actionStates[3].buffs.some((effect) => effect.name === "Refreshing"), "A refresh-enabled buff must reset its expiration when gaining a stack.");

  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const exhaustedEvent = { name: "Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }], tags: ["Event"] };
  const dragonHeadDamage = (exhausted) => {
    const steps = [...(exhausted ? [{ type: "event", event: "Exhausted", startTime: 0 }] : []), { type: "skill", skill: "DragonHeadTide" }];
    const dragonHeadIndex = exhausted ? 1 : 0;
    return calculateRotationBaseline({
      timeline: {
        rotation: { name: "Dragon Head probe", steps, start: { step: dragonHeadIndex } },
        skills: { DragonHeadTide: mysticSkills.DragonHeadTide }, eventDefinitions: { Exhausted: exhaustedEvent }, dots: {},
        effectDefinitions: { ...mysticBuffs, Exhausted: { name: "Exhausted", duration: 10, maxStack: 1, refresh: true, effect: [] } },
        innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [],
      },
      startAnchor: { rowId: `rotation-${dragonHeadIndex}` }, stats, attunement: {}, enemy,
      derivedStats: calculateDerivedStats(stats, 0), weapons: [], statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {},
    }).metrics.totalDamage;
  };
  const normalDamage = dragonHeadDamage(false);
  assert(closeTo(dragonHeadDamage(true) / normalDamage, 2), "Dragon Head - Tide must deal 100% more base damage when Surging Waves sees Exhausted at hit time.");

  console.log("Effect refresh, Surging Waves stacking, and Dragon Head Exhausted checks passed.");
} finally {
  await viteServer.close();
}
