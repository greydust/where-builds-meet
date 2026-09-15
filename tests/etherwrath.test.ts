import { assert, describe, it } from "vitest";

// Ported from script/probe/check-etherwrath.mjs.
describe("etherwrath", () => {
  it("Etherwrath Direct Damage stacks, DOT/non-direct exclusion, and dodge checks passed", async () => {
    const weaponSets = (await import("../data/gear-set.json")).default;
    const kiteBuffs = (await import("../data/buff/bamboocut-kite.json")).default;
    const generalSkills = (await import("../data/skill/general.json")).default;
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { normalizeBuildSetup, normalizeBuildSetupOverrides } = await import("../src/gear.ts");

    const fourPiece = weaponSets.Etherwrath.options["4"].effect;
    const sparseSetup = normalizeBuildSetup({ weaponSets: { Etherwrath: 4 } });
    assert(
      sparseSetup.weaponSets.Etherwrath === 4 &&
        sparseSetup.weaponSets.Cleftpeak === 0 &&
        sparseSetup.weaponSets.RainWhisper === 0,
      "A sparse build set map must preserve Etherwrath and treat omitted sets as zero.",
    );
    const sparseOverride = normalizeBuildSetupOverrides({ weaponSets: { Etherwrath: 4 } });
    assert(
      sparseOverride.weaponSets?.Etherwrath === 4,
      "A sparse saved set override must remain valid when new set definitions are added.",
    );

    const hit = {
      name: "Etherwrath hit probe",
      castTime: 6,
      action: Array.from({ length: 6 }, (_, index) => ({
        type: "damage",
        phyCoef: 0,
        attrCoef: 0,
        phyBonus: 0,
        attrBonus: 0,
        time: index + 1,
      })),
      modifier: [],
      tags: ["DirectDamage"],
    };
    const observe = {
      name: "Etherwrath observer",
      castTime: 0,
      action: [{ type: "damage", phyCoef: 0, attrCoef: 0, phyBonus: 0, attrBonus: 0, time: 0 }],
      modifier: [],
      tags: ["DirectDamage"],
    };
    const timelineInput = (rotation, skills) => ({
      rotation,
      skills,
      eventDefinitions: {},
      dots: {},
      effectDefinitions: kiteBuffs,
      innerWayConditions: ["Etherwrath4P"],
      innerWayRules: [],
      setupEffects: [fourPiece],
      weapons: ["heavenwill", "skygrasp"],
    });
    const stackingTimeline = buildRotationTimeline(
      timelineInput({ name: "Stacking probe", steps: [{ type: "skill", skill: "Hit" }] }, { Hit: hit }),
    );
    const stackingRow = stackingTimeline.find((row) => row.step.skill === "Hit");
    assert(
      stackingRow.actionStates[5].buffs.find((effect) => effect.name === "Etherwrath")?.stack === 5,
      "The sixth damage action must see the five stacks granted by the previous five hits.",
    );
    const dodgeTimeline = buildRotationTimeline(
      timelineInput(
        {
          name: "Perfect Dodge probe",
          steps: [
            { type: "skill", skill: "PerfectDodgeCancel" },
            { type: "skill", skill: "Observe" },
          ],
        },
        { PerfectDodgeCancel: generalSkills.PerfectDodgeCancel, Observe: observe },
      ),
    );
    const dodgeObserver = dodgeTimeline.find((row) => row.step.skill === "Observe");
    assert(
      dodgeObserver.actionStates[0].buffs.find((effect) => effect.name === "Etherwrath")?.stack === 5,
      "Perfect Dodge must apply five Etherwrath stacks directly.",
    );

    const dots = (await import("../data/dot/innerway.json")).default;
    const directAndDot = {
      name: "Direct hit and bleed",
      castTime: 0,
      tags: ["DirectDamage"],
      action: [
        { type: "damage", phyCoef: 1, time: 0 },
        { type: "apply", target: "target", value: "WeepingBlood", time: 0 },
      ],
    };
    const watch = {
      name: "Non-direct observers",
      castTime: 9,
      tags: [],
      action: [2, 9].map((time) => ({ type: "damage", phyCoef: 1, time })),
    };
    const dotInput = timelineInput(
      {
        name: "DOT exclusion",
        steps: [
          { type: "skill", skill: "Start" },
          { type: "skill", skill: "Watch" },
        ],
      },
      { Start: directAndDot, Watch: watch },
    );
    dotInput.dots = dots;
    dotInput.effectDefinitions = { ...kiteBuffs, ...dots };
    const dotTimeline = buildRotationTimeline(dotInput);
    const watched = dotTimeline.find((row) => row.step.skill === "Watch");
    const activeStack = watched.actionStates[0].buffs.find((effect) => effect.name === "Etherwrath");
    assert(
      activeStack?.stack === 1 && activeStack.expiresAt === 8,
      "A DOT tick must neither add nor refresh Etherwrath stacks.",
    );
    assert(
      !watched.actionStates[1].buffs.some((effect) => effect.name === "Etherwrath"),
      "DOT and untagged damage must not keep Etherwrath alive.",
    );
    const dotOnly = buildRotationTimeline({
      ...dotInput,
      skills: {
        ...dotInput.skills,
        Start: { ...directAndDot, action: directAndDot.action.filter((action) => action.type !== "damage") },
      },
    });
    assert(
      dotOnly.every((row) =>
        Object.values(row.actionStates).every((state) => !state.buffs.some((effect) => effect.name === "Etherwrath")),
      ),
      "DOT-only and untagged damage cannot initially activate Etherwrath.",
    );
  });
});
