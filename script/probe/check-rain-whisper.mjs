import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const weaponSets = (await viteServer.ssrLoadModule("/data/gear-set.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const rainWhisperEffects = weaponSets.RainWhisper.options["4"].effect;
  assert(Array.isArray(rainWhisperEffects), "Rain Whisper four-piece must expose separate setup effects.");
  assert(
    rainWhisperEffects[0].stat.precision === 0.08 && rainWhisperEffects[0].stat.critDmgBonus === 0.1,
    "Rain Whisper must retain its unconditional four-piece stats.",
  );
  assert(
    rainWhisperEffects[1].requirement[0].value === "Shield" && rainWhisperEffects[1].effect.critDmgBonus === 0.15,
    "Rain Whisper must grant 15% Critical DMG while Shield is active.",
  );

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
            action: [{ type: "damage", phyCoef: 1, phyBonus: 0, attrBonus: 0, time: 1 }],
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

  const unshielded = calculate(false, rainWhisperEffects);
  const unshieldedWithoutConditional = calculate(false, [rainWhisperEffects[0]]);
  const shielded = calculate(true, rainWhisperEffects);
  const shieldedWithoutConditional = calculate(true, [rainWhisperEffects[0]]);
  assert(
    Math.abs(unshielded - unshieldedWithoutConditional) < 1e-9,
    "The conditional Rain Whisper bonus must remain inactive without Shield.",
  );
  assert(shielded > shieldedWithoutConditional, "The conditional Rain Whisper bonus must activate with Shield.");
  console.log("Rain Whisper Shield-dependent Critical DMG check passed.");
} finally {
  await viteServer.close();
}
