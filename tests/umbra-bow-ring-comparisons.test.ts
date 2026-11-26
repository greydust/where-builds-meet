import { expect, it } from "vitest"

import { bowRingSetEffectFor } from "@/application/gameData/setup"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline, calculateRotationComparisons } from "@/calculations/rotationCalculator"
import { calculateStatsWithEffects, requirementIsUnconditional } from "@/calculations/statEffects"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

it.each(["18", "19"])("matches equipped Umbra bow/ring results at breakthrough %s", async breakthrough => {
  const entry = (await loadDpsSnapshotFixtures(breakthrough)).find(row => row.pathId === "bellstrikeUmbra")!
  const bundle = buildPresetRotationBundle(
    { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
    entry.fixture.build,
  )!
  const settings = { weapons: entry.fixture.martialArts, breakthrough, ping: 0 }
  // Keep Affinity capped even after removing the currently equipped bow/ring.
  bundle.baseStats = { ...bundle.baseStats!, affinity: bundle.baseStats!.affinity + 0.15 }
  const initialSheet = calculateStatsWithEffects(
    bundle.baseStats,
    [
      ...bundle.timeline.setupEffects.filter(effect => requirementIsUnconditional(effect.requirement)),
      ...bundle.timeline.innerWayRules
        .filter(rule => requirementIsUnconditional(rule.requirement))
        .map(rule => rule.effect),
    ],
    bundle.enemy.judgementResistance,
    bundle.weapons,
  )
  bundle.stats = initialSheet.stats
  bundle.rawStats = initialSheet.rawStats
  const affinityEffect = bowRingSetEffectFor("Affinity", settings)
  const setup = bundle.timeline.setupEffects.filter(effect => JSON.stringify(effect) !== JSON.stringify(affinityEffect))
  expect(setup.length).toBe(bundle.timeline.setupEffects.length - 1)
  const variants = ["None", "Precision", "Critical", "Affinity"].map(label => ({
    label,
    setupEffects: [...setup, bowRingSetEffectFor(label, settings)],
  }))
  bundle.setupComparisons = { bowRingSet: variants }
  const baseline = calculateRotationBaseline(bundle)
  const compared = calculateRotationComparisons(bundle, baseline).setupComparisons.bowRingSet
  for (const variant of variants) {
    const sheet = calculateStatsWithEffects(
      bundle.baseStats!,
      [
        ...variant.setupEffects.filter(effect => requirementIsUnconditional(effect.requirement)),
        ...bundle.timeline.innerWayRules
          .filter(rule => requirementIsUnconditional(rule.requirement))
          .map(rule => rule.effect),
      ],
      bundle.enemy.judgementResistance,
      bundle.weapons,
    )
    expect(sheet.stats.effectiveAffinity).toBe(0.4)
    const fresh = calculateRotationBaseline({
      ...bundle,
      stats: sheet.stats,
      rawStats: sheet.rawStats,
      timeline: { ...bundle.timeline, setupEffects: variant.setupEffects },
    })
    const difference = compared.find(row => row.label === variant.label)!.dpsDifference
    expect(difference).toBeCloseTo(fresh.metrics.dps - baseline.metrics.dps, 8)
  }
  expect(compared.find(row => row.label === "None")!.dpsDifference).toBe(0)
  expect(compared.find(row => row.label === "Affinity")!.dpsDifference).toBe(0)
})
