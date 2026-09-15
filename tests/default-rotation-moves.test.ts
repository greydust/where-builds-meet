import { assert, describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-default-rotation-moves.mjs.
describe("default-rotation-moves", () => {
  it("default-rotation-moves checks", async () => {
    const rotationPaths = [
      "/data/rotation/stonesplit-strength/mixed-dummy-1-min.json",
      "/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json",
      "/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json",
    ];
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
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const skills = { ...snowparting, ...phalanxbane, ...mystic, ...general };
    const effectDefinitions = {
      ...mysticBuffs,
      ...generalBuffs,
      ...stonesplitBuffs,
      ...generalDebuffs,
      ...stonesplitDebuffs,
      ...dots,
    };
    const conditions = ["FrostCladNight", "MoraleChant", "SteadfastDevotion", "ThroatPiercingArt"].flatMap((name) =>
      Array.from({ length: 7 }, (_, tier) => `${name}T${tier}`),
    );
    const eventDefinitions = {
      Qi: {
        name: "Qi",
        castTime: 0,
        action: [
          { type: "setQi", time: 0 },
          { type: "apply", target: "target", value: "Exhausted", time: 0 },
        ],
        tags: ["Event"],
      },
      BattleEnd: { name: "Battle End", castTime: 0, action: [], tags: ["Event"] },
      Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], tags: ["Event"] },
    };
    const loadedRotations = await Promise.all(rotationPaths.map(async (path) => (await probeLoad(path)).default));
    for (const rotation of loadedRotations) {
      const timeline = buildRotationTimeline({
        rotation,
        skills,
        eventDefinitions,
        dots,
        effectDefinitions,
        innerWayConditions: conditions,
        innerWayRules: [],
        setupEffects: [],
        weapons: ["snowparting", "phalanxbane"],
      });
      const firstSkill = timeline
        .filter((row) => row.step.type === "skill" && !row.skipped)
        .sort((left, right) => left.startTime - right.startTime || left.order - right.order)[0];
      assert(firstSkill.distance === 19, `${rotation.name} must begin at 19m.`);
      const fleeting = timeline.find(
        (row) => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "SnowpartingSpecial",
      );
      assert(fleeting?.distance === 3, `${rotation.name} first Fleeting Trace must begin at 3m.`);
      for (const row of timeline.filter(
        (candidate) =>
          candidate.kind === "rotation" &&
          candidate.step.type === "skill" &&
          candidate.step.skill === "PhalanxbaneHeavyCharged3" &&
          !candidate.skipped,
      )) {
        const firstAnxi = timeline.find(
          (candidate) =>
            candidate.kind === "trigger" &&
            candidate.sourceRowId === row.id &&
            candidate.step.type === "skill" &&
            candidate.step.skill === "AnxiSoldierBurningHeart2",
        );
        const secondAnxi = timeline.find(
          (candidate) =>
            candidate.kind === "trigger" &&
            candidate.sourceRowId === row.id &&
            candidate.step.type === "skill" &&
            candidate.step.skill === "AnxiSoldierBurningHeart3",
        );
        assert(
          firstAnxi?.actionStates[0]?.distance === 6,
          `${rotation.name} Burning Heart ${row.rotationIndex} first Anxi must be 6m.`,
        );
        assert(
          secondAnxi?.actionStates[0]?.distance === 4,
          `${rotation.name} Burning Heart ${row.rotationIndex} second Anxi must be 4m.`,
        );
        assert(
          row.actionStates[3]?.distance === 2,
          `${rotation.name} Burning Heart ${row.rotationIndex} first damage must be 2m.`,
        );
      }
    }
  });
});
