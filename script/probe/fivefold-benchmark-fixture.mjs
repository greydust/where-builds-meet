/** Shared dense-hit fixture, not timed as part of calculation benchmarks. */
export async function fivefoldBenchmarkBundle(server, count) {
  const load = async (path) => (await server.ssrLoadModule(path)).default;
  const { calculateDerivedStats } = await server.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await server.ssrLoadModule("/src/data/statDefinitions.ts");
  const { innerWayDefinitionForSoloLevel } = await server.ssrLoadModule("/src/data/innerWayDefinitions.ts");
  const way = innerWayDefinitionForSoloLevel(await load("/data/innerway/fivefold-bleed.json"), 17);
  const dots = await load("/data/dot/innerway.json");
  const { PiercingDamage } = await load("/data/skill/general.json");
  const rules = Object.values(way.effect).flatMap((definition, tier) =>
    (definition.effect ?? [])
      .map((effect) => Object.assign({}, effect, { effect: effect.effect ?? effect, source: "FivefoldBleed", tier }))
      .concat((definition.trigger ?? []).map((trigger) => ({ trigger, effect: {}, source: "FivefoldBleed", tier }))),
  );
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };

  const end = (count - 1) * 0.137 + 5;
  const input = {
    rotation: {
      name: "Cadence stress",
      steps: [
        { type: "skill", skill: "Hits" },
        { type: "event", event: "BattleEnd", startTime: end },
      ],
    },
    skills: {
      PiercingDamage,
      Hits: {
        name: "Hits",
        castTime: end,
        tags: ["DirectDamage"],
        action: Array.from({ length: count }, (_, i) => ({ type: "damage", phyCoef: 1, time: i * 0.137 })),
      },
    },
    dots,
    effectDefinitions: dots,
    eventDefinitions: { BattleEnd: { name: "Battle End", action: [] } },
    innerWayRules: rules,
    innerWayConditions: Object.keys(way.effect),
    setupEffects: [],
    weapons: [],
  };
  const bundle = {
    timeline: input,
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
    },
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };

  return bundle;
}
