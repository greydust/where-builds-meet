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

try {
  const rotationFiles = [
    "dummy-1-min-regular-fire.json",
    "dummy-1-min-smolder.json",
    "dummy-1-min-wts.json",
    "dummy-1-min-wts-team.json",
  ];
  const rotations = await Promise.all(
    rotationFiles.map(async (file) => ({
      file,
      rotation: await moduleJson(`/data/rotation/silkbind-deluge/${file}`),
    })),
  );
  const skills = Object.assign(
    {},
    ...(await Promise.all(
      [
        "/data/skill/general.json",
        "/data/skill/mystic.json",
        "/data/skill/panacea-fan.json",
        "/data/skill/soulshade-umbrella.json",
      ].map(moduleJson),
    )),
  );
  const dots = await moduleJson("/data/dot/mystic.json");
  const effectDefinitions = Object.assign(
    {},
    ...(await Promise.all(
      [
        "/data/buff/general.json",
        "/data/buff/mystic.json",
        "/data/buff/silkbind-deluge.json",
        "/data/debuff/general.json",
        "/data/debuff/mystic.json",
      ].map(moduleJson),
    )),
    dots,
  );
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const eventDefinitions = {
    BattleEnd: { name: "Battle End", castTime: 0, action: [], tags: ["Event"] },
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
    TakeDamage: {
      name: "Take Damage",
      castTime: 0,
      action: [{ type: "takeDamage", time: 0 }],
      tags: ["Event"],
    },
  };

  for (const { file, rotation } of rotations) {
    const timeline = buildRotationTimeline({
      rotation,
      skills,
      eventDefinitions,
      dots,
      effectDefinitions,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: rotation.martialArts,
    });
    const qiRows = timeline.filter(
      (row) => row.kind === "rotation" && row.step.type === "event" && row.step.event === "Qi",
    );
    const expected = [
      { ratio: 0.5999, time: 20 },
      { ratio: 0.3999, time: 30 },
      { ratio: 0, time: 50 },
    ];
    assert(qiRows.length === expected.length, `${file} must contain one complete Qi segment.`);
    for (const target of expected) {
      const row = qiRows.find((candidate) => candidate.step.targetQiRatio === target.ratio);
      assert(row, `${file} is missing its ${target.ratio * 100}% Qi event.`);
      assert(
        Math.abs(row.startTime - target.time) <= 0.75,
        `${file} ${target.ratio * 100}% Qi occurs at ${row.startTime.toFixed(3)}s instead of near ${target.time}s.`,
      );
    }
  }

  console.log("Deluge preset Qi thresholds lead to a 50-second Qi break.");
} finally {
  await viteServer.close();
}
