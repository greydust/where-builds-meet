import { describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";
import assert from "node:assert/strict";

// Ported from script/probe/check-innerway-damage-groups.mjs.
describe("innerway-damage-groups", () => {
  it("Inner Way ownership, unchanged damage/timing, grouped totals, zero-proc headers, expansion isolation, and sampled ownership verified", async () => {
    const { calculateRotationBaseline, calculateSimulatedRotationRun, calculateRotationComparisons } =
      await import("../src/calculations/rotationCalculator.ts");
    const { buildRotationTimeline, mergeCalculatedTimelineState } = await probeLoad(
      "/src/calculations/rotationTimeline.ts",
    );
    const { buildTimelineDisplayEntries } = await import("../src/rotationDisplay.ts");
    const { compactInnerWayResults } = await import("../src/calculations/compactInnerWayResults.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const { innerWayDefinitionForSoloLevel } = await import("../src/data/innerWayDefinitions.ts");
    const ways = {
      FivefoldBleed: innerWayDefinitionForSoloLevel(await import("../data/innerway/fivefold-bleed.json"), 17),
      MoraleChant: innerWayDefinitionForSoloLevel(await import("../data/innerway/morale-chant.json"), 17),
    };
    const general = await import("../data/skill/general.json");
    const dots = await import("../data/dot/innerway.json");
    const buffs = await import("../data/buff/general.json");
    const rules = Object.entries(ways).flatMap(([source, way]) =>
      Object.values(way.effect).flatMap((definition, tier) =>
        (definition.effect ?? [])
          .map((effect) => Object.assign({}, effect, { effect: effect.effect ?? effect, source, tier }))
          .concat((definition.trigger ?? []).map((trigger) => ({ trigger, effect: {}, source, tier }))),
      ),
    );
    const timeline = {
      rotation: {
        name: "Independent Inner Ways",
        steps: [
          ...Array.from({ length: 6 }, () => ({ type: "skill", skill: "Hit" })),
          { type: "event", event: "BattleEnd", startTime: 12 },
        ],
      },
      skills: {
        PiercingDamage: general.PiercingDamage,
        MoraleChant: general.MoraleChant,
        Hit: { name: "Hit", castTime: 2, tags: ["DirectDamage"], action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      },
      dots,
      effectDefinitions: { ...buffs, ...dots },
      eventDefinitions: { BattleEnd: { name: "Battle End", action: [], tags: ["Event"] } },
      innerWayRules: rules,
      innerWayConditions: Object.values(ways).flatMap((way) => Object.keys(way.effect)),
      setupEffects: [],
      weapons: [],
    };
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
    const bundle = {
      timeline,
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
    const result = calculateRotationBaseline(bundle);
    const groupIds = ["innerway-FivefoldBleed", "innerway-MoraleChant"];
    assert.deepEqual(
      result.timeline
        .filter((row) => row.kind === "damageGroup")
        .map((row) => row.id)
        .sort(),
      groupIds,
    );
    for (const row of result.timeline.filter(
      (row) => row.actions.some((action) => action.type === "damage") && row.kind !== "rotation",
    )) {
      const owner = row.step.skill === "MoraleChant" ? groupIds[1] : groupIds[0];
      assert.equal(row.sourceRowId, owner, "Triggered actions are owned by the Inner Way, never an attack");
      if (row.sourceDamageWeights) assert.deepEqual(Object.keys(row.sourceDamageWeights), [owner]);
    }
    for (const id of ["FivefoldBleed", "MoraleChant"]) {
      const cast = result.metrics.breakdown.casts.find((item) => item.skillId === id);
      assert.ok(cast?.damage > 0, `${id} collects damage: ${JSON.stringify(result.metrics.breakdown.casts)}`);
      const sum = result.timeline
        .filter((row) => row.sourceRowId === `innerway-${id}`)
        .reduce(
          (total, row) =>
            total +
            row.actions.reduce(
              (value, action, index) => value + (result.actionBreakdowns[`${row.id}:${index}`]?.total ?? 0),
              0,
            ),
          0,
        );
      assert.ok(Math.abs(cast.damage - sum) < 1e-8, `${id} totals match its actions exactly once`);
    }
    const strip = (definitions) =>
      Object.fromEntries(
        Object.entries(definitions).map(([id, { damageGroup: _damageGroup, ...definition }]) => [id, definition]),
      );
    const ungrouped = calculateRotationBaseline({
      ...bundle,
      timeline: {
        ...timeline,
        skills: strip(timeline.skills),
        dots: strip(dots),
        effectDefinitions: strip(timeline.effectDefinitions),
      },
    });
    assert.ok(
      Math.abs(result.metrics.totalDamage - ungrouped.metrics.totalDamage) < 1e-8,
      "Ownership does not change combat damage",
    );
    assert.equal(result.duration, ungrouped.duration);
    const compacted = compactInnerWayResults(result);
    const totalPublishedDamage = (value) =>
      Object.values(value.actionBreakdowns).reduce((sum, item) => sum + item.total, 0);
    assert.ok(Math.abs(totalPublishedDamage(compacted) - totalPublishedDamage(result)) < 1e-8);
    assert.strictEqual(compacted.metrics, result.metrics, "Publication does not recalculate or alter metrics");

    // Split one real resolved burst into equivalent weighted contributions, then
    // verify publication combines them without altering the original calculation.
    const burst = result.timeline.find(
      (row) => row.step.skill === "PiercingDamage" && result.actionBreakdowns[`${row.id}:0`],
    );
    assert.ok(burst);
    const fixture = structuredClone(result);
    const fixtureRow = fixture.timeline.find((row) => row.id === burst.id);
    const fixtureEntry = fixture.baseline.find((entry) => entry.id === `${burst.id}:0`);
    const duplicate = structuredClone(fixtureRow);
    duplicate.id = "equivalent-burst";
    for (const row of [fixtureRow, duplicate]) {
      row.actions[0].damageScale = Number(burst.actions[0].damageScale ?? 1) / 2;
      row.actions[0].hitProbability = Number(burst.actions[0].hitProbability ?? 1) / 2;
    }
    const half = structuredClone(fixture.actionBreakdowns[`${burst.id}:0`]);
    for (const channel of ["physical", "bellstrike", "stonesplit", "silkbind", "bamboocut", "total"])
      half[channel] /= 2;
    for (const source of Object.keys(half.buffedDamageBySource ?? {})) half.buffedDamageBySource[source] /= 2;
    fixture.actionBreakdowns[`${burst.id}:0`] = half;
    fixture.actionBreakdowns[`${duplicate.id}:0`] = structuredClone(half);
    fixture.timeline.push(duplicate);
    fixture.baseline.push({ ...structuredClone(fixtureEntry), id: `${duplicate.id}:0`, action: duplicate.actions[0] });
    const before = structuredClone(fixture);
    const combined = compactInnerWayResults(fixture);
    assert.ok(!combined.timeline.some((row) => row.id === duplicate.id));
    assert.ok(Math.abs(totalPublishedDamage(combined) - totalPublishedDamage(result)) < 1e-8);
    assert.deepEqual(fixture, before, "Exact cached timeline and actions remain untouched");
    const displayed = mergeCalculatedTimelineState(fixture.timeline, combined.timeline);
    assert.ok(
      !displayed.some((row) => row.id === duplicate.id),
      "Structural rows cannot reintroduce merged contributions",
    );
    assert.deepEqual(
      displayed.find((row) => row.id === burst.id).actions,
      combined.timeline.find((row) => row.id === burst.id).actions,
    );
    for (const change of ["time", "context"]) {
      const distinct = structuredClone(fixture);
      if (change === "time") distinct.timeline.find((row) => row.id === duplicate.id).startTime += 0.1;
      else distinct.baseline.find((entry) => entry.id === `${duplicate.id}:0`).context.distance = 99;
      assert.ok(
        compactInnerWayResults(distinct).timeline.some((row) => row.id === duplicate.id),
        `${change} differences must not merge`,
      );
    }
    const comparisonBundle = {
      ...bundle,
      statPriority: [{ label: "Physical", stats: { ...stats, minPhys: 110, maxPhys: 110 } }],
    };
    assert.deepEqual(
      calculateRotationComparisons(comparisonBundle, compacted),
      calculateRotationComparisons(comparisonBundle, result),
      "A compacted baseline rebuilds exact events if the worker cache is unavailable",
    );
    const collapsed = buildTimelineDisplayEntries(result.timeline, () => false, bundle.startAnchor);
    assert.deepEqual(
      collapsed
        .slice(-2)
        .map((entry) => entry.row.id)
        .sort(),
      groupIds,
    );
    assert.ok(collapsed.every((entry) => entry.row.kind === "rotation" || entry.row.kind === "damageGroup"));
    const expanded = buildTimelineDisplayEntries(result.timeline, (id) => groupIds.includes(id), bundle.startAnchor);
    assert.deepEqual(expanded, collapsed, "Stale group expansion state cannot expose internal actions");
    for (const visibleGroups of [groupIds, [groupIds[0]], [groupIds[1]]]) {
      const entries = buildTimelineDisplayEntries(
        result.timeline,
        (id) => visibleGroups.includes(id),
        bundle.startAnchor,
      );
      assert.deepEqual(
        entries
          .slice(-2)
          .map((entry) => entry.row.id)
          .sort(),
        groupIds,
      );
      const chronological = entries.slice(0, -2);
      assert.ok(
        chronological.every((entry, index) => index === 0 || entry.time >= chronological[index - 1].time),
        "Ordinary entries remain chronological above the Inner Way summaries",
      );
      const actions = chronological.filter((entry) => entry.kind === "action");
      assert.equal(
        actions.length,
        expanded.filter((entry) => entry.kind === "action" && visibleGroups.includes(entry.row.sourceRowId)).length,
      );
      assert.equal(actions.length, 0, "Inner Way actions have no display entries");
      assert.equal(new Set(actions.map((entry) => `${entry.row.id}:${entry.actionIndex}`)).size, actions.length);
    }
    const castExpanded = buildTimelineDisplayEntries(
      result.timeline,
      (id) => id.startsWith("rotation-"),
      bundle.startAnchor,
    );
    assert.ok(
      castExpanded.filter((entry) => entry.kind === "action").every((entry) => entry.row.kind === "rotation"),
      "Cast expansion never reveals grouped damage",
    );
    assert.deepEqual(
      mergeCalculatedTimelineState(result.timeline, result.timeline)
        .map((row) => row.id)
        .sort(),
      result.timeline.map((row) => row.id).sort(),
    );
    const noHits = buildRotationTimeline({
      ...timeline,
      skills: { ...timeline.skills, Hit: { ...timeline.skills.Hit, action: [] } },
    });
    assert.equal(
      noHits.filter((row) => row.kind === "damageGroup").length,
      2,
      "Selected Inner Ways remain visible with zero damage",
    );
    assert.equal(
      buildRotationTimeline({ ...timeline, innerWayRules: [], innerWayConditions: [] }).filter(
        (row) => row.kind === "damageGroup",
      ).length,
      0,
    );
    const sampled = calculateSimulatedRotationRun(bundle, () => 0);
    assert.ok(
      sampled.resolvedSequence
        .filter(({ entry }) => entry.context.skillTags.includes("PiercingDamage"))
        .every(({ entry }) => entry.sourceRowId === groupIds[0]),
    );
  });
});
