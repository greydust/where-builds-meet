import { assert, describe, it } from "vitest";

// Ported from script/probe/check-skill-override-calculation.mjs.
describe("skill-override-calculation", () => {
  it("Skill override calculation and fingerprint checks passed", async () => {
    const { resolveSkillCalculationDefinitions } = await import("../src/skillOverrides.ts");
    const { deserializeSkillOverrides, serializeSkillOverrides } = await import("../src/skillOverrides.ts");
    const migrated = deserializeSkillOverrides({
      General: {
        Legacy: {
          action: [
            { type: "damage", phyCoef: 2 },
            { type: "heal", phyCoef: 3 },
            { type: "damage", phyCoef: 4, attrCoef: 0 },
          ],
        },
      },
    });
    const migratedActions = migrated.General.Legacy.action;
    assert(
      !(
        migratedActions[0].attrCoef !== 2 ||
        migratedActions[1].silkbindCoef !== 3 ||
        migratedActions[2].attrCoef !== 0
      ),
      "Legacy overrides must preserve old coefficients without overwriting explicit zero.",
    );
    const physicalOnly = { DOT: { Bleed: { periodic: { action: [{ type: "damage", phyCoef: 0.02 }] } } } };
    const reloaded = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(physicalOnly)));
    assert(
      reloaded.DOT.Bleed.periodic.action[0].attrCoef === undefined,
      "New physical-only overrides must remain physical-only after saving and reloading.",
    );
    const oldStacked = deserializeSkillOverrides({
      version: 2,
      overrides: {
        DOT: {
          Bleed: {
            periodic: { stackDamage: true, interval: 1, action: [{ type: "damage", phyCoef: 0.02 }] },
          },
        },
      },
    });
    assert(
      !(
        oldStacked.DOT.Bleed.periodic.stackDamage !== undefined ||
        oldStacked.DOT.Bleed.periodic.tickOnExpire !== false ||
        oldStacked.DOT.Bleed.periodic.action[0].attrCoef !== undefined
      ),
      "Old stack-damage overrides must preserve expiration behavior and physical-only coefficients, but drop stack scaling.",
    );
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { rotationBundleFingerprint } = await import("../src/calculations/rotationCalculationCache.ts");
    const defaults = {
      Snowparting: { Attack: { name: "Attack", castTime: 1, action: [{ type: "damage", time: 1 }] } },
      Phalanxbane: {},
      Thundercry: {},
      Stormbreaker: {},
      Mystic: {},
      General: {},
    };
    const defaultDots = { Burning: { duration: 4, periodic: { interval: 1 } } };
    const defaultEffects = {
      Power: { duration: 5, effect: [{ stat: { minPhys: 1 } }] },
      Weakness: { duration: 5, effect: [{ dmgBonus: 0.01 }] },
      ...defaultDots,
    };
    const baseline = resolveSkillCalculationDefinitions(defaults, defaultEffects, defaultDots, {});
    const modified = resolveSkillCalculationDefinitions(defaults, defaultEffects, defaultDots, {
      Snowparting: { Attack: { name: "Attack", castTime: 2, action: [{ type: "damage", time: 2 }] } },
      Buff: { Power: { duration: 10, effect: [{ stat: { minPhys: 2 } }] } },
      Debuff: { Weakness: { duration: 8, effect: [{ dmgBonus: 0.02 }] } },
      DOT: { Burning: { duration: 8, periodic: { interval: 2 } } },
    });
    assert(modified.skills.Attack.castTime === 2, "Skill overrides did not reach calculation skills.");
    assert(modified.effectDefinitions.Power.duration === 10, "Buff overrides did not reach calculation effects.");
    assert(modified.effectDefinitions.Weakness.duration === 8, "Debuff overrides did not reach calculation effects.");
    assert(
      !(modified.dots.Burning.duration !== 8 || modified.effectDefinitions.Burning.duration !== 8),
      "DOT overrides did not reach both calculation maps.",
    );

    const timelineFor = (definitions) =>
      buildRotationTimeline({
        rotation: { name: "Probe", steps: [{ type: "skill", skill: "Attack" }] },
        skills: definitions.skills,
        dots: definitions.dots,
        effectDefinitions: definitions.effectDefinitions,
        eventDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["snowparting"],
      });
    assert(
      !(timelineFor(baseline)[0].effectiveCastTime !== 1 || timelineFor(modified)[0].effectiveCastTime !== 2),
      "Skill overrides did not change the generated calculation timeline.",
    );

    const bundleFor = (definitions) => ({
      weapons: ["snowparting"],
      timeline: {
        rotation: { name: "Probe", steps: [{ type: "skill", skill: "Attack" }] },
        skills: definitions.skills,
        dots: definitions.dots,
        effectDefinitions: definitions.effectDefinitions,
      },
    });
    assert(
      rotationBundleFingerprint(bundleFor(baseline)) !== rotationBundleFingerprint(bundleFor(modified)),
      "Skill definition changes did not invalidate the calculation fingerprint.",
    );
  });
});
