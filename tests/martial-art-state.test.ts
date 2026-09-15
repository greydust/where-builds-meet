import { assert, describe, it } from "vitest";
import { readFile } from "node:fs/promises";

// Ported from script/probe/check-martial-art-state.mjs.
describe("martial-art-state", () => {
  it("Current martial-art and weapon state checks passed", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const general = JSON.parse(await readFile("data/skill/general.json", "utf8"));
    const mystic = JSON.parse(await readFile("data/skill/mystic.json", "utf8"));
    const ghostSkills = Object.fromEntries(
      Object.entries(mystic).filter(([skillId]) => skillId.startsWith("GhostlyStepsUmbraDodge")),
    );
    const skills = {
      PerfectDodge: general.PerfectDodge,
      MartialArtCast: {
        name: "Martial Art Cast",
        castTime: 0,
        action: [],
        modifier: [],
        tags: ["MartialArts"],
        martialArt: "phalanxbane",
        weapon: "MoBlade",
      },
      ...ghostSkills,
    };
    const eventDefinitions = {
      MartialArt: {
        name: "Switch Martial Art",
        castTime: 0,
        action: [{ type: "switchMartialArt", time: 0 }],
        modifier: [],
        tags: ["Event"],
      },
    };
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Martial-art state probe",
        steps: [
          { type: "skill", skill: "PerfectDodge" },
          { type: "skill", skill: "MartialArtCast" },
          { type: "skill", skill: "PerfectDodge" },
          {
            type: "event",
            event: "MartialArt",
            before: { action: "start" },
            martialArt: "snowparting",
          },
          { type: "skill", skill: "PerfectDodge" },
        ],
      },
      skills,
      eventDefinitions,
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
      martialArtState: {
        snowparting: { weapon: "HengBlade" },
        phalanxbane: { weapon: "MoBlade" },
      },
      initialBuffs: [{ name: "MysteryUmbra" }],
    });
    const triggeredSkills = timeline
      .filter((row) => row.kind === "trigger" && row.step.type === "skill")
      .map((row) => row.step.skill);

    assert(
      triggeredSkills.join(",") ===
        "GhostlyStepsUmbraDodgeHengBlade,GhostlyStepsUmbraDodgeMoBlade,GhostlyStepsUmbraDodgeHengBlade",
      "Perfect Dodge must dispatch Ghostly Step from the current weapon after automatic and manual switches.",
    );
    assert(
      timeline.find((row) => row.id === "rotation-2")?.currentMartialArt === "phalanxbane" &&
        timeline.find((row) => row.id === "rotation-4")?.currentMartialArt === "snowparting",
      "Timeline rows must snapshot the current martial art.",
    );
    assert(
      timeline
        .filter((row) => row.step.type === "skill" && row.step.skill === "PerfectDodge")
        .every((row) => row.effectiveCastTime === 0.5),
      "Perfect Dodge must resolve its weapon-switched cast time when each cast starts.",
    );

    const switchedTimingTimeline = buildRotationTimeline({
      rotation: {
        name: "Weapon timing switch probe",
        steps: [
          { type: "skill", skill: "WeaponTimedAction" },
          { type: "skill", skill: "MartialArtCast" },
          { type: "skill", skill: "WeaponTimedAction" },
        ],
      },
      skills: {
        ...skills,
        WeaponTimedAction: {
          name: "Weapon-timed action",
          castTime: {
            function: "switch",
            param1: "currentWeapon",
            param2: { HengBlade: 0.25, MoBlade: 0.75 },
            fallback: 0.5,
          },
          action: [],
          modifier: [],
          tags: ["General"],
        },
      },
      eventDefinitions,
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
      martialArtState: {
        snowparting: { weapon: "HengBlade" },
        phalanxbane: { weapon: "MoBlade" },
      },
    });
    assert(
      switchedTimingTimeline.find((row) => row.id === "rotation-0")?.effectiveCastTime === 0.25 &&
        switchedTimingTimeline.find((row) => row.id === "rotation-1")?.startTime === 0.25 &&
        switchedTimingTimeline.find((row) => row.id === "rotation-2")?.startTime === 0.25 &&
        switchedTimingTimeline.find((row) => row.id === "rotation-2")?.effectiveCastTime === 0.75,
      "A switched cast time must use the current weapon and shift subsequent casts at each skill start.",
    );
  });
});
