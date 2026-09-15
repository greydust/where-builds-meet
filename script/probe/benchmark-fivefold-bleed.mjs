import { createServer } from "vite";
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { ExpectedPeriodicTracker } = await server.ssrLoadModule("/src/calculations/outcomeTriggeredBuffs.ts");
  const { innerWayDefinitionForSoloLevel } = await server.ssrLoadModule("/src/data/innerWayDefinitions.ts");
  const way = innerWayDefinitionForSoloLevel(
    (await server.ssrLoadModule("/data/innerway/fivefold-bleed.json")).default,
    17,
  );
  const dots = (await server.ssrLoadModule("/data/dot/innerway.json")).default;
  const { PiercingDamage } = (await server.ssrLoadModule("/data/skill/general.json")).default;
  let peakStates = 0,
    tickChecks = 0,
    expirationChecks = 0,
    applications = 0;
  const apply = ExpectedPeriodicTracker.prototype.apply;
  ExpectedPeriodicTracker.prototype.apply = function (...args) {
    applications++;
    const result = apply.apply(this, args);
    peakStates = Math.max(peakStates, this.stateCount);
    return result;
  };
  const tickAt = ExpectedPeriodicTracker.prototype.tickAt;
  ExpectedPeriodicTracker.prototype.tickAt = function (...args) {
    tickChecks++;
    return tickAt.apply(this, args);
  };
  const expirationProbability = ExpectedPeriodicTracker.prototype.expirationProbability;
  ExpectedPeriodicTracker.prototype.expirationProbability = function (...args) {
    expirationChecks++;
    return expirationProbability.apply(this, args);
  };
  const rules = Object.values(way.effect).flatMap((definition, tier) =>
    (definition.effect ?? [])
      .map((effect) => Object.assign({}, effect, { effect: effect.effect ?? effect, source: "FivefoldBleed", tier }))
      .concat((definition.trigger ?? []).map((trigger) => ({ trigger, effect: {}, source: "FivefoldBleed", tier }))),
  );
  for (const count of process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [10, 25, 50]) {
    peakStates = tickChecks = expirationChecks = applications = 0;
    const end = (count - 1) * 0.137 + 5;
    const start = performance.now();
    const rows = buildRotationTimeline({
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
    });
    console.log(
      JSON.stringify({
        count,
        milliseconds: Math.round(performance.now() - start),
        rows: rows.length,
        dotRows: rows.filter((row) => row.kind === "dot").length,
        peakStates,
        tickChecks,
        expirationChecks,
        applications,
      }),
    );
  }
} finally {
  await server.close();
}
