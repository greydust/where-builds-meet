import { createServer } from "vite";
import { writeFile } from "node:fs/promises";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

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
  const effectDefinitions = { ...mysticBuffs, ...generalBuffs, ...stonesplitBuffs, ...generalDebuffs, ...stonesplitDebuffs, ...dots };
  const conditions = ["FrostCladNight", "MoraleChant", "SteadfastDevotion", "ThroatPiercingArt"].flatMap((name) => Array.from({ length: 7 }, (_, tier) => `${name}T${tier}`));
  const eventDefinitions = {
    Exhausted: { name: "Exhausted", castTime: 0, action: [{ type: "apply", target: "target", value: "Exhausted", time: 0 }], tags: ["Event"] },
    BattleEnd: { name: "Battle End", castTime: 0, action: [], tags: ["Event"] },
    Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], tags: ["Event"] },
  };
  const round = (value) => Number(value.toFixed(4));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };

  for (const path of rotationPaths) {
    const rotation = (await viteServer.ssrLoadModule(path)).default;
    const timeline = buildRotationTimeline({ rotation, skills, eventDefinitions, dots, effectDefinitions, innerWayConditions: conditions, innerWayRules: [], setupEffects: [], weapons: ["snowparting", "phalanxbane"] });
    const anchorRow = timeline.find((row) => row.id === `rotation-${rotation.start.step}`);
    const anchorTime = anchorRow.startTime + Number(anchorRow.actions[rotation.start.action]?.time ?? 0);
    const relative = (value) => value - anchorTime;
    const skillRows = timeline.filter((row) => row.kind === "rotation" && row.step.type === "skill" && !row.skipped);
    const firstActionTime = Math.min(...timeline.filter((row) => row.step.type === "skill" && !row.skipped).map((row) => row.startTime));
    const firstFleetingTrace = skillRows.find((row) => row.step.skill === "SnowpartingSpecial");
    const moves = [
      { reason: "before first action", distance: 19, startTime: round(relative(firstActionTime)) },
      { reason: "before first Fleeting Trace", distance: 3, startTime: round(relative(firstFleetingTrace.startTime)) },
      { reason: "after first Fleeting Trace", distance: 1, startTime: round(relative(firstFleetingTrace.startTime + firstFleetingTrace.effectiveCastTime)) },
    ];

    for (const row of skillRows.filter((candidate) => candidate.step.skill === "PhalanxbaneHeavyCharged3")) {
      const firstAnxi = row.actions.findIndex((action) => action.type === "trigger" && action.value === "AnxiSoldierBurningHeart2");
      const secondAnxi = row.actions.findIndex((action) => action.type === "trigger" && action.value === "AnxiSoldierBurningHeart3");
      const firstDamage = row.actions.findIndex((action) => action.type === "damage");
      moves.push(
        { reason: `before first Anxi (${row.rotationIndex})`, distance: 6, startTime: round(relative(row.startTime + Number(row.actions[firstAnxi]?.time ?? 0))) },
        { reason: `before second Anxi (${row.rotationIndex})`, distance: 4, startTime: round(relative(row.startTime + Number(row.actions[secondAnxi]?.time ?? 0))) },
        { reason: `before first damage (${row.rotationIndex})`, distance: 2, startTime: round(relative(row.startTime + Number(row.actions[firstDamage]?.time ?? 0))) },
      );
    }

    const burningIndexes = rotation.steps.flatMap((step, index) => step.type === "skill" && step.skill === "PhalanxbaneHeavyCharged3" ? [index] : []);
    burningIndexes.forEach((stepIndex, index) => {
      const nextBurningIndex = burningIndexes[index + 1];
      const interveningSkills = nextBurningIndex === undefined ? true : rotation.steps.slice(stepIndex + 1, nextBurningIndex).some((step) => step.type === "skill");
      if (!interveningSkills) return;
      const row = skillRows.find((candidate) => candidate.rotationIndex === stepIndex);
      moves.push({ reason: `after Burning Heart section (${stepIndex})`, distance: 1, startTime: round(relative(row.startTime + row.effectiveCastTime)) });
    });

    moves.sort((left, right) => left.startTime - right.startTime);
    if (process.argv.includes("--write")) {
      const updated = {
        ...rotation,
        steps: [
          ...rotation.steps.filter((step) => step.type !== "event" || step.event !== "Move"),
          ...moves.map(({ startTime, distance }) => ({ type: "event", event: "Move", startTime, distance })),
        ],
      };
      await writeFile(new URL(`../..${path}`, import.meta.url), `${JSON.stringify(updated, null, 2)}\n`);
      console.log(`${rotation.name}: wrote ${moves.length} Move events.`);
    } else {
      const actualMoves = rotation.steps.filter((step) => step.type === "event" && step.event === "Move").map(({ startTime, distance }) => ({ startTime, distance })).sort((left, right) => left.startTime - right.startTime);
      assert(actualMoves.length === moves.length, `${rotation.name} must contain ${moves.length} generated Move events.`);
      moves.forEach((move, index) => {
        assert(actualMoves[index].distance === move.distance, `${rotation.name} Move ${index + 1} must move to ${move.distance}m.`);
      });
      const firstSkillAction = skillRows.flatMap((row) => row.actions.map((action, actionIndex) => ({ row, action, actionIndex, time: row.startTime + Number(action.time ?? 0) }))).sort((left, right) => left.time - right.time)[0];
      const firstVisibleSkill = timeline.filter((row) => row.step.type === "skill" && !row.skipped).sort((left, right) => left.startTime - right.startTime || left.order - right.order)[0];
      assert(firstVisibleSkill?.distance === 19, `${rotation.name} must show its first skill at 19m (received ${firstVisibleSkill?.distance}m).`);
      assert(firstSkillAction.row.actionStates[firstSkillAction.actionIndex]?.distance === 19, `${rotation.name} must begin its first skill action at 19m (received ${firstSkillAction.row.actionStates[firstSkillAction.actionIndex]?.distance}m at ${firstSkillAction.time - anchorTime}s).`);
      assert(firstFleetingTrace.distance === 3, `${rotation.name} must begin its first Fleeting Trace at 3m.`);
      for (const row of skillRows.filter((candidate) => candidate.step.skill === "PhalanxbaneHeavyCharged3")) {
        const firstAnxi = row.actions.findIndex((action) => action.type === "trigger" && action.value === "AnxiSoldierBurningHeart2");
        const secondAnxi = row.actions.findIndex((action) => action.type === "trigger" && action.value === "AnxiSoldierBurningHeart3");
        const firstDamage = row.actions.findIndex((action) => action.type === "damage");
        assert(row.actionStates[firstAnxi]?.distance === 6, `${rotation.name} Burning Heart ${row.rotationIndex} first Anxi must trigger at 6m (received ${row.actionStates[firstAnxi]?.distance}m).`);
        assert(row.actionStates[secondAnxi]?.distance === 4, `${rotation.name} Burning Heart ${row.rotationIndex} second Anxi must trigger at 4m (received ${row.actionStates[secondAnxi]?.distance}m).`);
        assert(row.actionStates[firstDamage]?.distance === 2, `${rotation.name} Burning Heart ${row.rotationIndex} first damage must occur at 2m (received ${row.actionStates[firstDamage]?.distance}m).`);
      }
      console.log(`${rotation.name}: ${actualMoves.length} Move events verified.`);
    }
  }
} finally {
  await viteServer.close();
}
