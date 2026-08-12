import { createServer } from "vite";
import fluteDefinitions from "../../data/buff/mystic.json" with { type: "json" };

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;

  const timeline = buildRotationTimeline({
    rotation: {
      name: "Distance probe",
      eventTimeReference: "battleStart",
      steps: [
        { type: "skill", skill: "Probe" },
        { type: "event", event: "Move", startTime: 1, distance: 5 },
        { type: "skill", skill: "Probe" },
      ],
    },
    skills: { Probe: { name: "Probe", castTime: 2, action: [{ type: "damage", time: 0 }, { type: "damage", time: 1.5 }], modifier: [], tags: [] } },
    eventDefinitions: { Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] } },
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  });
  const firstSkill = timeline.find((row) => row.id === "rotation-0");
  const secondSkill = timeline.find((row) => row.id === "rotation-2");
  assert(firstSkill?.distance === 1, "Distance must start at 1m.");
  assert(firstSkill?.actionStates[0]?.distance === 1, "Damage before Move must use 1m.");
  assert(firstSkill?.actionStates[1]?.distance === 5, "Damage after Move must use the new distance even within an earlier cast.");
  assert(secondSkill?.distance === 5, "Skills after Move must display the new distance.");

  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const baseContext = { stats, attunement: {}, skillTags: [], weapons: [], buffs: ["Flute"], enemy, derivedStats: calculateDerivedStats(stats, 0), effects: [] };
  const action = { type: "damage", phyCoef: 1 };
  const baseline = calculateDamageBreakdown(action, baseContext).total;
  const fluteEffect = fluteDefinitions.Flute.effect[0].effect;
  const damageAt = (distance) => calculateDamageBreakdown(action, { ...baseContext, distance, effects: [fluteEffect] }).total;
  assert(closeTo(damageAt(1) / baseline, 1.02), "Flute must grant 2% at 1m.");
  assert(closeTo(damageAt(5) / baseline, 1.08), "Flute must grant 8% at 5m.");
  assert(closeTo(damageAt(9) / baseline, 1.2), "Flute must grant 20% at 9m.");
  assert(closeTo(damageAt(99) / baseline, 1.2), "Flute must cap at the final distance value.");

  const integratedTimeline = {
    rotation: {
      name: "Integrated Flute probe",
      eventTimeReference: "battleStart",
      steps: [
        { type: "skill", skill: "ApplyFlute" },
        { type: "event", event: "Move", startTime: 1, distance: 9 },
        { type: "skill", skill: "Probe" },
      ],
    },
    skills: {
      ApplyFlute: { name: "Apply Flute", castTime: 1, action: [{ type: "apply", target: "self", value: "Flute", time: 0 }, { type: "damage", phyCoef: 1, time: 0.5 }], modifier: [], tags: [] },
      Probe: { name: "Probe", castTime: 1, action: [{ type: "damage", phyCoef: 1, time: 0.5 }], modifier: [], tags: [] },
    },
    eventDefinitions: { Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] } },
    dots: {}, effectDefinitions: { Flute: fluteDefinitions.Flute }, innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [],
  };
  const integrated = calculateRotationBaseline({ timeline: integratedTimeline, startAnchor: { rowId: "rotation-0" }, stats, attunement: {}, enemy, derivedStats: calculateDerivedStats(stats, 0), weapons: [], statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {} });
  const atOneMeter = integrated.actionBreakdowns["rotation-0:1"].total;
  const atNineMeters = integrated.actionBreakdowns["rotation-2:0"].total;
  assert(closeTo(atNineMeters / atOneMeter, 1.2 / 1.02), "The shared rotation calculator must pass each action's distance into Flute.");
  console.log("Distance timeline state and Flute by(distance) bonus checks passed.");
} finally {
  await viteServer.close();
}
