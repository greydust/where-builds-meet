import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const rotation = (await viteServer.ssrLoadModule("/data/rotation/silkbind-deluge/dummy-1-min-wts.json")).default;
  const panacea = (await viteServer.ssrLoadModule("/data/skill/panacea-fan.json")).default;
  const soulshade = (await viteServer.ssrLoadModule("/data/skill/soulshade-umbrella.json")).default;
  const mystic = (await viteServer.ssrLoadModule("/data/skill/mystic.json")).default;
  const general = (await viteServer.ssrLoadModule("/data/skill/general.json")).default;
  const mysticBuffs = (await viteServer.ssrLoadModule("/data/buff/mystic.json")).default;
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const delugeBuffs = (await viteServer.ssrLoadModule("/data/buff/silkbind-deluge.json")).default;
  const mysticDebuffs = (await viteServer.ssrLoadModule("/data/debuff/mystic.json")).default;
  const generalDebuffs = (await viteServer.ssrLoadModule("/data/debuff/general.json")).default;
  const dots = (await viteServer.ssrLoadModule("/data/dot/mystic.json")).default;
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { mergeCalculatedTimelineState } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const timelineInput = {
    rotation,
    skills: { ...panacea, ...soulshade, ...mystic, ...general },
    eventDefinitions: {
      TakeDamage: {
        name: "Take Damage",
        castTime: 0,
        action: [{ type: "takeDamage", time: 0 }],
        tags: ["Event"],
      },
      BattleEnd: { name: "Battle End", castTime: 0, action: [], tags: ["Event"] },
    },
    dots,
    effectDefinitions: {
      ...mysticBuffs,
      ...generalBuffs,
      ...delugeBuffs,
      ...mysticDebuffs,
      ...generalDebuffs,
      ...dots,
    },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["panaceaFan", "soulshadeUmbrella"],
  };
  const timeline = buildRotationTimeline(timelineInput);
  const deflectRows = timeline.filter(
    (row) => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "DeflectSuccessful",
  );
  const manualAttackRows = timeline.filter(
    (row) =>
      row.step.type === "event" &&
      row.step.event === "TakeDamage" &&
      row.step.automatic !== "dummyAttack" &&
      row.startTime < 60,
  );
  assert(manualAttackRows.length === 0, "The preset must not invent manual Take Damage events.");
  const automaticAttackRows = timeline.filter(
    (row) => row.step.type === "event" && row.step.event === "TakeDamage" && row.step.automatic === "dummyAttack",
  );
  assert(
    automaticAttackRows.length === 20 &&
      automaticAttackRows.every((row, index) => Math.abs(row.startTime - (5.5 + Math.floor(index / 2) * 6)) < 1e-9),
    "The preset must use only the standard paired dummy attacks every six seconds from 5.5 seconds.",
  );
  assert(
    deflectRows.every((row) => row.startTime < 60),
    "Every requested Successful Deflect must occur before the one-minute battle end.",
  );
  const stats = {
    ...emptyStats,
    minPhys: 1000,
    maxPhys: 1000,
    minSilkbind: 500,
    maxSilkbind: 500,
    precision: 1,
  };
  const timelineBundle = {
    ...timelineInput,
    initialResources: { Vitality: 100 },
    resourceMaximums: { Vitality: 100 },
    maxHP: 100000,
  };
  const baseline = calculateRotationBaseline({
    timeline: timelineBundle,
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy: {
      name: "Probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    },
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: ["panaceaFan", "soulshadeUmbrella"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const qiBladeBreakdown = baseline.metrics.breakdown.skills.find((skill) => skill.id === "QiBlade");
  assert(qiBladeBreakdown?.hits, "The WTS preset must trigger Qi Blade damage before Battle End.");
  const worldToSwordCast = baseline.metrics.breakdown.casts.find((cast) => cast.skillId === "WorldToSword");
  assert(
    worldToSwordCast?.casts === 2 && Math.abs(worldToSwordCast.damage - qiBladeBreakdown.damage) < 1e-9,
    "The WTS per-cast row must own all damage dealt by its triggered Qi Blades.",
  );
  assert(
    !baseline.metrics.breakdown.casts.some((cast) => cast.skillId === "QiBlade"),
    "Triggered Qi Blades must not appear as a separate per-cast row.",
  );
  const displayedTimeline = mergeCalculatedTimelineState(timeline, baseline.timeline);
  assert(
    displayedTimeline.some((row) => row.step.type === "skill" && row.step.skill === "QiBlade"),
    "The rotation editor timeline must retain worker-created Qi Blade rows.",
  );
  console.log("Deluge WTS sequence and standard dummy-attack schedule verified.");
} finally {
  await viteServer.close();
}
