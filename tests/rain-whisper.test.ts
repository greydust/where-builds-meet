import { assert, describe, it } from "vitest";

// Ported from script/probe/check-rain-whisper.mjs.
describe("rain-whisper", () => {
  it("Rain Whisper Shield-dependent Critical DMG check passed", async () => {
    const weaponSets = (await import("../data/gear-set.json")).default;
    const generalBuffs = (await import("../data/buff/general.json")).default;
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");

    const rainWhisperEffects = weaponSets.RainWhisper.options["4"].effect;

    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, crit: 1 };
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
    const calculate = (shielded, setupEffects) => {
      const rotation = {
        name: "Rain Whisper probe",
        steps: [...(shielded ? [{ type: "skill", skill: "ApplyShield" }] : []), { type: "skill", skill: "Hit" }],
      };
      const hitIndex = rotation.steps.length - 1;
      return calculateRotationBaseline({
        timeline: {
          rotation,
          skills: {
            ApplyShield: {
              name: "Apply Shield",
              castTime: 0,
              action: [{ type: "apply", target: "self", value: "Shield", time: 0 }],
              modifier: [],
              tags: [],
            },
            Hit: {
              name: "Hit",
              castTime: 1,
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, phyBonus: 0, attrBonus: 0, time: 1 }],
              modifier: [],
              tags: ["DirectDamage"],
            },
          },
          eventDefinitions: {},
          dots: {},
          effectDefinitions: generalBuffs,
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects,
          weapons: ["thundercry", "stormbreaker"],
        },
        startAnchor: { rowId: `rotation-${hitIndex}`, actionIndex: 0 },
        stats,
        attunement: {},
        enemy,
        derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
        weapons: ["thundercry", "stormbreaker"],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }).metrics.totalDamage;
    };

    const unshieldedStatOnly = calculate(false, [rainWhisperEffects[0]]);
    const unshielded = calculate(false, rainWhisperEffects);
    const unshieldedWithoutConditional = calculate(false, rainWhisperEffects.slice(0, 2));
    const shielded = calculate(true, rainWhisperEffects);
    const shieldedWithoutConditional = calculate(true, rainWhisperEffects.slice(0, 2));
    assert(
      Math.abs(unshielded - unshieldedWithoutConditional) < 1e-9,
      "The conditional Rain Whisper bonus must remain inactive without Shield.",
    );
    assert(
      unshielded > unshieldedStatOnly,
      "The unconditional Rain Whisper Critical DMG must apply during damage calculation.",
    );
    assert(shielded > shieldedWithoutConditional, "The conditional Rain Whisper bonus must activate with Shield.");
  });
});
