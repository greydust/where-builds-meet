import { createServer } from "vite";
import { writeFile } from "node:fs/promises";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const rotationPaths = [
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json",
  ];
  const snowparting = (await viteServer.ssrLoadModule("/data/skill/snowparting-blade.json")).default;
  const phalanxbane = (await viteServer.ssrLoadModule("/data/skill/phalanxbane-blade.json")).default;
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const stonesplitBuffs = (await viteServer.ssrLoadModule("/data/buff/stonesplit-strength.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const stonesplitDebuffs = (await viteServer.ssrLoadModule("/data/debuff/stonesplit-strength.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
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
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const move = (distance, before) => ({ type: "event", event: "Move", before, distance });

  function expectedRotation(rotation) {
    const exhaustedIndex = rotation.steps.findIndex(
      (step) => step.type === "event" && step.event === "Qi" && step.targetQiRatio === 0,
    );
    const exhaustedSkillOrdinal =
      exhaustedIndex < 0 ? -1 : rotation.steps.slice(0, exhaustedIndex).filter((step) => step.type === "skill").length;
    const retained = rotation.steps.filter(
      (step) => step.type !== "event" || (step.event !== "Move" && step.event !== "Qi"),
    );
    const skillsWithIndexes = retained.flatMap((step, index) => (step.type === "skill" ? [{ step, index }] : []));
    const before = new Map();
    const add = (index, event) => before.set(index, [...(before.get(index) ?? []), event]);
    const first = skillsWithIndexes[0];
    add(first.index, move(19, { action: "start" }));
    const fleeting = skillsWithIndexes.find(({ step }) => step.skill === "SnowpartingSpecial");
    add(fleeting.index, move(3, { action: "start" }));
    const afterFleeting = skillsWithIndexes.find(({ index }) => index > fleeting.index);
    if (afterFleeting) add(afterFleeting.index, move(1, { action: "start" }));

    const burning = skillsWithIndexes.filter(({ step }) => step.skill === "PhalanxbaneHeavyCharged3");
    burning.forEach(({ index }) => {
      add(index, move(6, { trigger: 0, action: 0 }));
      add(index, move(4, { trigger: 1, action: 0 }));
      add(index, move(2, { action: 3 }));
    });
    burning.forEach(({ index }, burningIndex) => {
      const nextBurning = burning[burningIndex + 1];
      const nextSkill = skillsWithIndexes.find((candidate) => candidate.index > index);
      if (!nextSkill || nextSkill.index === nextBurning?.index) return;
      add(nextSkill.index, move(1, { action: "start" }));
    });

    // Preserve each preset's intentional break after the same fourth Burning
    // Heart damage action selected by the former fixed-time row.
    const exhaustedTarget = rotation.name.includes("Smolder Poet")
      ? burning[7]
      : skillsWithIndexes[exhaustedSkillOrdinal];
    if (exhaustedTarget)
      add(exhaustedTarget.index, { type: "event", event: "Qi", targetQiRatio: 0, after: { action: 3 } });

    const oldStartSkill = rotation.steps[rotation.start?.step];
    const steps = retained.flatMap((step, index) =>
      step.type === "skill" ? [...(before.get(index) ?? []), step] : [step],
    );
    const startStep = oldStartSkill ? steps.indexOf(oldStartSkill) : undefined;
    return {
      ...rotation,
      steps,
      ...(startStep === undefined || startStep < 0
        ? {}
        : {
            start: {
              step: startStep,
              ...(rotation.start?.action === undefined ? {} : { action: rotation.start.action }),
            },
          }),
    };
  }

  for (const path of rotationPaths) {
    const rotation = (await viteServer.ssrLoadModule(path)).default;
    const expected = expectedRotation(rotation);
    if (process.argv.includes("--write")) {
      await writeFile(new URL(`../..${path}`, import.meta.url), `${JSON.stringify(expected, null, 2)}\n`);
      console.log(`${rotation.name}: wrote attached events.`);
      continue;
    }
    const stepsWithoutQiRamps = rotation.steps.filter(
      (step) => !(step.type === "event" && step.event === "Qi" && step.targetQiRatio === 0.4),
    );
    const mismatchIndex = stepsWithoutQiRamps.findIndex(
      (step, index) => JSON.stringify(step) !== JSON.stringify(expected.steps[index]),
    );
    assert(
      mismatchIndex < 0 && stepsWithoutQiRamps.length === expected.steps.length,
      `${rotation.name} attached event structure is out of date at ${mismatchIndex}: ${JSON.stringify(stepsWithoutQiRamps[mismatchIndex])} != ${JSON.stringify(expected.steps[mismatchIndex])}.`,
    );
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
    console.log(`${rotation.name}: attached Move and Exhausted events verified.`);
  }
} finally {
  await viteServer.close();
}
