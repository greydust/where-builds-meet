import { assert, describe, it } from "vitest";
import fluteDefinitions from "../data/buff/mystic.json" with { type: "json" };

// Ported from script/probe/check-distance-flute.mjs.
describe("distance-flute", () => {
  it("Distance timeline state and Flute by(distance) bonus checks passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
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
      skills: {
        Probe: {
          name: "Probe",
          castTime: 2,
          action: [
            { type: "damage", time: 0 },
            { type: "damage", time: 1.5 },
          ],
          modifier: [],
          tags: [],
        },
      },
      eventDefinitions: {
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] },
      },
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
    assert(
      firstSkill?.actionStates[1]?.distance === 5,
      "Damage after Move must use the new distance even within an earlier cast.",
    );
    assert(secondSkill?.distance === 5, "Skills after Move must display the new distance.");

    const equalTimestampTimeline = buildRotationTimeline({
      rotation: {
        name: "Equal timestamp event probe",
        steps: [
          { type: "skill", skill: "Probe" },
          { type: "skill", skill: "Probe" },
          { type: "event", event: "Move", startTime: 2 + 5e-10, distance: 7 },
        ],
      },
      skills: { Probe: { name: "Probe", castTime: 2, action: [{ type: "damage", time: 0 }], modifier: [], tags: [] } },
      eventDefinitions: {
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] },
      },
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    });
    const equalTimestampSkill = equalTimestampTimeline.find((row) => row.id === "rotation-1");
    assert(
      equalTimestampSkill?.distance === 7,
      "An appended Move event must resolve before a skill at the same displayed timestamp despite floating-point noise.",
    );
    assert(
      equalTimestampSkill?.actionStates[0]?.distance === 7,
      "An appended Move event must resolve before a damage action at the same displayed timestamp despite floating-point noise.",
    );

    const attachedTimeline = buildRotationTimeline({
      rotation: {
        name: "Attached event probe",
        steps: [
          { type: "event", event: "Move", before: { trigger: 0, action: 0 }, distance: 8 },
          { type: "skill", skill: "TriggerProbe" },
        ],
      },
      skills: {
        TriggerProbe: {
          name: "Trigger Probe",
          castTime: 2,
          action: [
            { type: "damage", time: 0 },
            { type: "trigger", value: "DeclaredTrigger", time: 1 },
          ],
          modifier: [],
          tags: [],
        },
        SetupTrigger: {
          name: "Setup Trigger",
          castTime: 0,
          action: [{ type: "apply", target: "self", value: "SetupMarker", time: 0 }],
          modifier: [],
          tags: ["Triggered"],
        },
        DeclaredTrigger: {
          name: "Declared Trigger",
          castTime: 0,
          action: [{ type: "damage", time: 0 }],
          modifier: [],
          tags: ["Triggered"],
        },
      },
      eventDefinitions: {
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] },
      },
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [{ trigger: { event: "damage", action: { type: "trigger", value: "SetupTrigger" } } }],
      weapons: [],
    });
    const setupTrigger = attachedTimeline.find((row) => row.step.type === "skill" && row.step.skill === "SetupTrigger");
    const declaredTrigger = attachedTimeline.find(
      (row) => row.step.type === "skill" && row.step.skill === "DeclaredTrigger",
    );
    assert(
      setupTrigger?.actionStates[0]?.distance === 1,
      "Reactive setup triggers must not consume a base skill's declared trigger ordinal.",
    );
    assert(
      declaredTrigger?.actionStates[0]?.distance === 8,
      "An attached event must resolve before the selected declared triggered-skill action.",
    );

    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
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
    const baseContext = {
      stats,
      attunement: {},
      skillTags: [],
      weapons: [],
      buffs: ["Flute"],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    };
    const action = { type: "damage", phyCoef: 1, attrCoef: 1 };
    const baseline = calculateDamageBreakdown(action, baseContext).total;
    const fluteEffect = fluteDefinitions.Flute.effect[0].effect;
    const damageAt = (distance) =>
      calculateDamageBreakdown(action, { ...baseContext, distance, effects: [fluteEffect] }).total;
    assert(closeTo(damageAt(1) / baseline, 1.02), "Flute must grant 2% at 1m.");
    assert(closeTo(damageAt(5) / baseline, 1.08), "Flute must grant 8% at 5m.");
    assert(closeTo(damageAt(9) / baseline, 1.2), "Flute must grant 20% at 9m.");
    assert(closeTo(damageAt(99) / baseline, 1.2), "Flute must cap at the final distance value.");

    assert(closeTo(damageAt(1.999) / baseline, 1.02), "Flute remains at 2% below 2m.");
    assert(closeTo(damageAt(2) / baseline, 1.03), "Flute advances to 3% at exactly 2m.");
    const coefficient = { function: "segment", param1: "distance", param2: [5, 12], param3: [0.63, 0.57, 0.6] };
    const coefficientStats = { ...stats, minBamboocut: 80, maxBamboocut: 80 };
    for (const [distance, expected] of [
      [4.999, 0.63],
      [5, 0.57],
      [11.999, 0.57],
      [12, 0.6],
      [20, 0.6],
    ]) {
      const context = {
        ...baseContext,
        distance,
        stats: coefficientStats,
        derivedStats: calculateDerivedStats(coefficientStats, 0),
      };
      for (const field of ["phyCoef", "attrCoef"]) {
        const dynamicAction = { type: "damage", [field]: coefficient };
        const numericAction = { type: "damage", [field]: expected };
        for (const calculate of [
          calculateDamageBreakdown,
          (a, c) => calculateSimulatedDamageBreakdown(a, c, () => 0.5),
        ]) {
          const reference = calculate(numericAction, context).total;
          assert(reference > 0, field + " must contribute damage in this probe.");
          assert(
            closeTo(calculate(dynamicAction, context).total, reference),
            field + " must resolve the distance snapshot at " + distance,
          );
        }
      }
    }

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
        ApplyFlute: {
          name: "Apply Flute",
          castTime: 1,
          action: [
            { type: "apply", target: "self", value: "Flute", time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 0.5 },
          ],
          modifier: [],
          tags: [],
        },
        Probe: {
          name: "Probe",
          castTime: 1,
          action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0.5 }],
          modifier: [],
          tags: [],
        },
      },
      eventDefinitions: {
        Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], modifier: [], tags: ["Event"] },
      },
      dots: {},
      effectDefinitions: { Flute: fluteDefinitions.Flute },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    };
    const integrated = calculateRotationBaseline({
      timeline: integratedTimeline,
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: {},
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: [],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    const atOneMeter = integrated.actionBreakdowns["rotation-0:1"].total;
    const atNineMeters = integrated.actionBreakdowns["rotation-2:0"].total;
    assert(
      closeTo(atNineMeters / atOneMeter, 1.2 / 1.02),
      "The shared rotation calculator must pass each action's distance into Flute.",
    );
  });
});
