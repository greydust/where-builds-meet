import { assert, describe, it } from "vitest";

// Ported from script/probe/check-smolder-poet-rotation.mjs.
describe("smolder-poet-rotation", () => {
  it("Final composite hit snapshots and consumes stacks without transferring its bonus to triggered explosions", async () => {
    const rotation = (await import("../data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json")).default;
    const snowparting = (await import("../data/skill/snowparting-blade.json")).default;
    const phalanxbane = (await import("../data/skill/phalanxbane-blade.json")).default;
    const mystic = (await import("../data/skill/mystic.json")).default;
    const general = (await import("../data/skill/general.json")).default;
    const dots = (await import("../data/dot/mystic.json")).default;
    const mysticBuffs = (await import("../data/buff/mystic.json")).default;
    const generalBuffs = (await import("../data/buff/general.json")).default;
    const stonesplitBuffs = (await import("../data/buff/stonesplit-strength.json")).default;
    const generalDebuffs = (await import("../data/debuff/general.json")).default;
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const conditions = ["FrostCladNight", "MoraleChant", "SteadfastDevotion", "ThroatPiercingArt"].flatMap((name) =>
      Array.from({ length: 7 }, (_, tier) => `${name}T${tier}`),
    );
    const timeline = buildRotationTimeline({
      rotation,
      skills: { ...snowparting, ...phalanxbane, ...mystic, ...general },
      eventDefinitions: {
        Qi: {
          name: "Event: Qi",
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
          tags: ["Event"],
        },
      },
      dots,
      effectDefinitions: { ...mysticBuffs, ...generalBuffs, ...stonesplitBuffs, ...generalDebuffs, ...dots },
      innerWayConditions: conditions,
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
    });
    const poet5RotationIndex = rotation.steps.findIndex(
      (step) => step.type === "skill" && step.skill === "DrunkenPoet5HitsCancel",
    );
    const poet5Row = timeline.find((row) => row.id === `rotation-${poet5RotationIndex}`);
    const poet5DamageIndex = poet5Row?.actions.findLastIndex((action) => action.type === "damage");
    const poet5ModifierEffects = poet5Row?.actionModifierEffects?.[poet5DamageIndex ?? -1] ?? [];
    assert(
      poet5ModifierEffects.some((effect) => effect.dmgBonus === 0.8),
      "Poet 5 must capture four Enhanced Drunken Poet stacks as an 80% direct-damage bonus.",
    );
    assert(
      poet5DamageIndex !== undefined &&
        poet5DamageIndex >= 0 &&
        !poet5Row?.actionStates[poet5DamageIndex]?.buffs.some((effect) => effect.name === "EnhanceDrunkenPoet"),
      "Poet 5 must consume every Enhanced Drunken Poet stack before its direct hit.",
    );
    const poet5Explosions = timeline.filter(
      (row) =>
        row.kind === "trigger" &&
        row.sourceRowId === poet5Row?.id &&
        row.step.type === "skill" &&
        ["CombustionExplosion", "SmolderExplosion"].includes(row.step.skill ?? ""),
    );
    assert(
      poet5Explosions.every(
        (row) => !row.modifierEffects.some((effect) => typeof effect.dmgBonus === "number" && effect.dmgBonus !== 0),
      ),
      "Poet 5's triggered explosions must not inherit its stack-scaled damage bonus.",
    );
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
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
    const directAction = poet5Row?.actions[poet5DamageIndex ?? -1];
    const directContext = {
      stats,
      attunement: {},
      skillTags: poet5Row?.actionSkillTags?.[poet5DamageIndex ?? -1] ?? [],
      weapons: [],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    };
    const unenhancedDamage = calculateDamageBreakdown(directAction, directContext).total;
    const enhancedDamage = calculateDamageBreakdown(directAction, {
      ...directContext,
      effects: poet5ModifierEffects,
    }).total;
    assert(
      Math.abs(enhancedDamage / unenhancedDamage - 1.8) < 1e-9,
      "Four Enhanced Drunken Poet stacks must multiply Poet 5 direct damage by 1.8.",
    );
  });
});
