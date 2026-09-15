import { assert, describe, it } from "vitest";

// Ported from script/probe/check-pure-dummy-rotation.mjs.
describe("pure-dummy-rotation", () => {
  it("Pure Dummy 1 min calculation checks passed", async () => {
    const rotation = (await import("../data/rotation/stonesplit-strength/pure-dummy-1-min.json")).default;
    const snowparting = (await import("../data/skill/snowparting-blade.json")).default;
    const phalanxbane = (await import("../data/skill/phalanxbane-blade.json")).default;
    const mystic = (await import("../data/skill/mystic.json")).default;
    const general = (await import("../data/skill/general.json")).default;
    const mysticBuffs = (await import("../data/buff/mystic.json")).default;
    const generalBuffs = (await import("../data/buff/general.json")).default;
    const stonesplitBuffs = (await import("../data/buff/stonesplit-strength.json")).default;
    const generalDebuffs = (await import("../data/debuff/general.json")).default;
    const stonesplitDebuffs = (await import("../data/debuff/stonesplit-strength.json")).default;
    const dots = (await import("../data/dot/mystic.json")).default;
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");

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
    const result = calculateRotationBaseline({
      timeline: {
        rotation,
        skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
        eventDefinitions: {
          Qi: {
            name: "Qi",
            castTime: 0,
            action: [
              { type: "setQi", time: 0 },
              {
                type: "apply",
                target: "target",
                value: "Exhausted",
                time: 0,
                requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
              },
            ],
          },
          Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] },
          BattleEnd: { name: "Battle End", castTime: 0, action: [] },
        },
        dots,
        effectDefinitions: {
          ...mysticBuffs,
          ...generalBuffs,
          ...stonesplitBuffs,
          ...generalDebuffs,
          ...stonesplitDebuffs,
          ...dots,
        },
        innerWayConditions: [],
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
    assert(
      result.metrics.totalDamage > 0 &&
        result.duration === rotation.steps.find((step) => step.event === "BattleEnd").startTime,
      "The translated preset must calculate as a 60-second rotation.",
    );
  });
});
