import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const moduleJson = async (path) => (await viteServer.ssrLoadModule(path)).default;

function innerWayState(selections, definitions) {
  const conditions = new Set(["FormBend4"]);
  const rules = [];
  for (const { innerWay, tier } of selections) {
    const tierNumber = Number(tier.slice(1));
    for (let currentTier = 0; currentTier <= tierNumber; currentTier += 1) {
      conditions.add(`${innerWay}T${currentTier}`);
      const tierDefinition = definitions[innerWay]?.effect?.[`${innerWay}T${currentTier}`];
      for (const item of tierDefinition?.effect ?? []) {
        rules.push({
          requirement: item.requirement,
          trigger: item.trigger,
          target: item.target,
          modify: item.modify,
          effect: item.stat ? { stat: item.stat } : (item.effect ?? {}),
          source: innerWay,
          tier: currentTier,
        });
      }
      for (const item of tierDefinition?.trigger ?? []) {
        rules.push({
          requirement: item.requirement,
          trigger: { target: item.target ?? "self", action: item.action ?? [] },
          effect: {},
          source: innerWay,
          tier: currentTier,
        });
      }
    }
  }
  return { conditions: [...conditions], rules };
}

try {
  const rotationPaths = [
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s.json",
    "/data/rotation/stonesplit-strength/mixed-horse-tamer-standard-27s-no-fcn.json",
    "/data/rotation/stonesplit-strength/pure-dummy-1-min.json",
    "/data/rotation/stonesplit-strength/pure-dummy-1-min-2.json",
    "/data/rotation/stonesplit-strength/pure-horse-tamer-standard-27s.json",
    "/data/rotation/stonesplit-might/dummy-1-min.json",
    "/data/rotation/bamboocut-kite/dummy-1-min-infinite-vitality.json",
  ];
  const skillPaths = [
    "/data/skill/general.json",
    "/data/skill/mystic.json",
    "/data/skill/phalanxbane-blade.json",
    "/data/skill/snowparting-blade.json",
    "/data/skill/stormbreaker-spear.json",
    "/data/skill/thundercry-blade.json",
    "/data/skill/heavenwill-gauntlets.json",
    "/data/skill/skygrasp-rope-dart.json",
  ];
  const effectPaths = [
    "/data/buff/general.json",
    "/data/buff/mystic.json",
    "/data/buff/stonesplit-might.json",
    "/data/buff/stonesplit-strength.json",
    "/data/debuff/general.json",
    "/data/debuff/innerway.json",
    "/data/debuff/stonesplit-might.json",
    "/data/debuff/stonesplit-strength.json",
    "/data/buff/bamboocut-kite.json",
    "/data/debuff/bamboocut-kite.json",
    "/data/dot/mystic.json",
  ];
  const innerWayPaths = [
    "/data/innerway/art-of-resistance.json",
    "/data/innerway/exquisite-scenery.json",
    "/data/innerway/frost-clad-night.json",
    "/data/innerway/morale-chant.json",
    "/data/innerway/steadfast-devotion.json",
    "/data/innerway/throat-piercing-art.json",
    "/data/innerway/sky-gripped.json",
    "/data/innerway/soaring-high.json",
    "/data/innerway/envigorated-warrior.json",
  ];
  const skills = Object.assign({}, ...(await Promise.all(skillPaths.map(moduleJson))));
  const effectDefinitions = Object.assign({}, ...(await Promise.all(effectPaths.map(moduleJson))));
  const exhaustedDuration = Number(effectDefinitions.Exhausted?.duration ?? 10);
  const dots = await moduleJson("/data/dot/mystic.json");
  const innerWayDefinitions = Object.fromEntries(
    (await Promise.all(innerWayPaths.map(moduleJson))).map((definition) => [
      Object.keys(definition.effect ?? {})[0]?.replace(/T0$/, ""),
      definition,
    ]),
  );
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const eventDefinitions = {
    BattleEnd: { name: "Battle End", castTime: 0, action: [], tags: ["Event"] },
    Buff: { name: "Buff", castTime: 0, action: [{ type: "apply", target: "self", time: 0 }], tags: ["Event"] },
    Debuff: {
      name: "Debuff",
      castTime: 0,
      action: [{ type: "apply", target: "target", time: 0 }],
      tags: ["Event"],
    },
    Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }], tags: ["Event"] },
    Qi: {
      name: "Qi",
      castTime: 0,
      action: [
        { type: "setQi", time: 0 },
        {
          type: "apply",
          target: "target",
          value: "Exhausted",
          stack: 1,
          requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
          time: 0,
        },
      ],
      tags: ["Event"],
    },
    SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }], tags: ["Event"] },
    TakeDamage: {
      name: "Take Damage",
      castTime: 0,
      action: [{ type: "takeDamage", time: 0 }],
      tags: ["Event"],
    },
  };
  const strengthInnerWays = [
    { innerWay: "FrostCladNight", tier: "T6" },
    { innerWay: "MoraleChant", tier: "T6" },
    { innerWay: "SteadfastDevotion", tier: "T6" },
    { innerWay: "ThroatPiercingArt", tier: "T6" },
  ];
  const mightInnerWays = [
    { innerWay: "ExquisiteScenery", tier: "T6" },
    { innerWay: "MoraleChant", tier: "T6" },
    { innerWay: "ArtOfResistance", tier: "T6" },
    { innerWay: "ThroatPiercingArt", tier: "T6" },
  ];
  const kiteInnerWays = [
    { innerWay: "SoaringHigh", tier: "T6" },
    { innerWay: "SkyGripped", tier: "T6" },
    { innerWay: "MoraleChant", tier: "T6" },
    { innerWay: "EnvigoratedWarrior", tier: "T6" },
  ];
  const selectedInnerWaysFor = (rotationPath) => {
    switch (true) {
      case rotationPath.includes("stonesplit-might"):
        return mightInnerWays;
      case rotationPath.includes("bamboocut-kite"):
        return kiteInnerWays;
      default:
        return strengthInnerWays;
    }
  };

  for (const rotationPath of rotationPaths) {
    const rotation = await moduleJson(rotationPath);
    const selectedInnerWays = selectedInnerWaysFor(rotationPath);
    const { conditions, rules } = innerWayState(selectedInnerWays, innerWayDefinitions);
    const timeline = buildRotationTimeline({
      rotation,
      skills,
      eventDefinitions,
      dots,
      effectDefinitions,
      innerWayConditions: conditions,
      innerWayRules: rules,
      setupEffects: [],
      weapons: rotation.martialArts,
      maxHP: 200000,
    });
    const anchorRow = timeline.find((row) => row.id === `rotation-${rotation.start?.step ?? 0}`);
    const anchorAction = rotation.start?.action;
    const battleStart =
      (anchorRow?.startTime ?? 0) +
      (anchorAction === undefined ? 0 : Number(anchorRow?.actions[anchorAction]?.time ?? 0));
    const qiRows = timeline.filter(
      (row) => row.kind === "rotation" && row.step.type === "event" && row.step.event === "Qi",
    );
    const zeroRows = qiRows.filter((row) => row.step.targetQiRatio === 0);
    const rampRatios = [0.59, 0.3999];
    const ratioLabel = (ratio) => `${Number((ratio * 100).toFixed(2))}%`;
    if (process.argv.includes("--suggest")) {
      const candidates = timeline.flatMap((row) =>
        row.kind !== "rotation" || row.step.type !== "skill" || row.skipped
          ? []
          : row.actions.map((action, actionIndex) => ({
              row,
              actionIndex,
              time: row.startTime + Number(action.time ?? 0) - battleStart,
            })),
      );
      for (const ratio of rampRatios)
        for (let index = 0; index < zeroRows.length; index += 1) {
          const zeroRow = zeroRows[index];
          const zeroTime = zeroRow.startTime - battleStart;
          const previousExhaustedEnd =
            index === 0 ? 0 : zeroRows[index - 1].startTime - battleStart + exhaustedDuration;
          const targetTime = previousExhaustedEnd + (zeroTime - previousExhaustedEnd) * (1 - ratio);
          const nearest = candidates.reduce((best, candidate) =>
            Math.abs(candidate.time - targetTime) < Math.abs(best.time - targetTime) ? candidate : best,
          );
          console.log(
            `${rotation.name}: Qi ${ratioLabel(ratio)} target ${targetTime.toFixed(3)}s; ` +
              `attach before step ${nearest.row.rotationIndex} ${nearest.row.step.skill} action ${nearest.actionIndex} ` +
              `at ${nearest.time.toFixed(3)}s (Qi 0 at ${zeroTime.toFixed(3)}s).`,
          );
        }
      continue;
    }
    for (const ratio of rampRatios) {
      const rampRows = qiRows.filter((row) => row.step.targetQiRatio === ratio);
      assert(
        rampRows.length === zeroRows.length,
        `${rotation.name} must have one ${ratioLabel(ratio)} Qi event per 0% Qi event.`,
      );
      for (let index = 0; index < zeroRows.length; index += 1) {
        const zeroTime = zeroRows[index].startTime - battleStart;
        const rampTime = rampRows[index].startTime - battleStart;
        const previousExhaustedEnd = index === 0 ? 0 : zeroRows[index - 1].startTime - battleStart + exhaustedDuration;
        const expectedRampTime = previousExhaustedEnd + (zeroTime - previousExhaustedEnd) * (1 - ratio);
        assert(rampTime < zeroTime, `${rotation.name} Qi ramp ${index + 1} must precede depletion.`);
        assert(
          Math.abs(rampTime - expectedRampTime) <= 0.75,
          `${rotation.name} ${ratioLabel(ratio)} Qi ramp ${index + 1} is ${rampTime.toFixed(3)}s; ` +
            `expected roughly ${expectedRampTime.toFixed(3)}s.`,
        );
      }
    }
    console.log(`${rotation.name}: ${zeroRows.length} Qi segment(s) verified.`);
  }
} finally {
  await viteServer.close();
}
