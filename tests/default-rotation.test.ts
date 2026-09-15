import { assert, describe, it } from "vitest";

// Ported from script/probe/check-default-rotation.mjs.
describe("default-rotation", () => {
  it("Infinite Vitality default rotation sequence and calculation checks passed", async () => {
    const rotation = (await import("../data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json"))
      .default;
    const snowparting = (await import("../data/skill/snowparting-blade.json")).default;
    const phalanxbane = (await import("../data/skill/phalanxbane-blade.json")).default;
    const mystic = (await import("../data/skill/mystic.json")).default;
    const general = (await import("../data/skill/general.json")).default;
    const mysticBuffs = (await import("../data/buff/mystic.json")).default;
    const generalBuffs = (await import("../data/buff/general.json")).default;
    const dots = (await import("../data/dot/mystic.json")).default;
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");

    const startSkillIndex = rotation.steps.findIndex(
      (step) => step.type === "skill" && step.skill === "SnowpartingSpecial",
    );

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
              { type: "apply", target: "target", value: "Exhausted", time: 0 },
            ],
          },
          Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] },
          BattleEnd: { name: "Battle End", castTime: 0, action: [] },
        },
        dots,
        effectDefinitions: { ...mysticBuffs, ...generalBuffs, ...dots },
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
      result.actionBreakdowns[`rotation-${startSkillIndex}:5`],
      "The configured Fleeting Trace starting action must calculate damage.",
    );
    assert(
      result.metrics.totalDamage > 0 && result.duration > 0,
      "The new default rotation must produce a valid calculation.",
    );
    const ghostlyCast = result.metrics.breakdown.casts.find((row) => row.skillId === "GhostlySteps");
    assert(
      (ghostlyCast?.damageWithBuff ?? 0) > (ghostlyCast?.damage ?? 0),
      "The bundled Ghostly Step cast must include damage indirectly added by Mystery DMG Boost.",
    );
  });
});
