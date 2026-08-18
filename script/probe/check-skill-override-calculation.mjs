import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { resolveSkillCalculationDefinitions } = await viteServer.ssrLoadModule("/src/skillOverrides.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { rotationBundleFingerprint } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculationCache.ts");
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
  if (modified.skills.Attack.castTime !== 2) throw new Error("Skill overrides did not reach calculation skills.");
  if (modified.effectDefinitions.Power.duration !== 10)
    throw new Error("Buff overrides did not reach calculation effects.");
  if (modified.effectDefinitions.Weakness.duration !== 8)
    throw new Error("Debuff overrides did not reach calculation effects.");
  if (modified.dots.Burning.duration !== 8 || modified.effectDefinitions.Burning.duration !== 8)
    throw new Error("DOT overrides did not reach both calculation maps.");

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
  if (timelineFor(baseline)[0].effectiveCastTime !== 1 || timelineFor(modified)[0].effectiveCastTime !== 2)
    throw new Error("Skill overrides did not change the generated calculation timeline.");

  const bundleFor = (definitions) => ({
    timeline: {
      rotation: { name: "Probe", steps: [{ type: "skill", skill: "Attack" }] },
      skills: definitions.skills,
      dots: definitions.dots,
      effectDefinitions: definitions.effectDefinitions,
    },
  });
  if (rotationBundleFingerprint(bundleFor(baseline)) === rotationBundleFingerprint(bundleFor(modified)))
    throw new Error("Skill definition changes did not invalidate the calculation fingerprint.");

  console.log("Skill override calculation and fingerprint checks passed.");
} finally {
  await viteServer.close();
}
