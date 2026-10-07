import { createServer } from "vite"

import { alias } from "../../aliases.ts"

// Production preset and UI-equivalent stat/attunement groups, without browser transport/rendering.
// Run from the repository root: node script/probe/benchmark-wind-innerways.mjs
const server = await createServer({
  configFile: false,
  resolve: { alias },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
})
try {
  const load = path => server.ssrLoadModule(path)
  const { buildPresetRotationBundle } = await load("/src/application/graduation.ts")
  const gear = await load("/src/gear.ts")
  const composition = await load("/src/application/characterComposition.ts")
  const { dpsSnapshotEnvironment } = await load("/tests/helpers/dps-snapshot-fixtures.ts")
  const rotation = (await load("/data/rotation/bamboocut-wind/wind-dummy-1-min-infinite-vitality.json")).default
  const { calculateRotationBaseline, calculateRotationComparisons } = await load(
    "/src/calculations/rotationCalculator.ts",
  )
  const { compactInnerWayResults } = await load("/src/calculations/compactInnerWayResults.ts")
  const preset = gear.defaultBuildPresets.find(build => build.id === "wind-fully-relayed-min")
  const selection = preset.setup.innerWays.find(row => row.innerWay === "MoraleChant")
  const original = selection.innerWay
  const bundles = {}
  try {
    for (const name of ["MoraleChant", "FivefoldBleed"]) {
      // Only this process's imported object changes; the canonical preset file is untouched.
      selection.innerWay = name
      const bundle = buildPresetRotationBundle(
        {
          ...dpsSnapshotEnvironment,
          pathId: "bamboocutWind",
          martialArts: rotation.martialArts,
          rotation,
          skillOverrides: {},
          previewId: null,
        },
        preset.id,
      )
      const settings = { weapons: bundle.weapons, breakthrough: "17", ping: 40 }
      bundle.statPriority = Object.entries(gear.statRollsForLevel(bundle.enemy.level).affix)
        .filter(([key]) => composition.characterStatAvailableForSettings(key, settings, "bamboocutWind"))
        .map(([key, amount]) => ({ label: key, stats: { ...bundle.baseStats, [key]: bundle.baseStats[key] + amount } }))
      bundle.attunementPriority = Object.keys(gear.attunementData)
        .filter(key => composition.attunementAvailableForSettings(key, "bamboocutWind", settings))
        .flatMap(key => {
          const amount = gear.maxGearRoll(key, "attunement", false, bundle.enemy.level)
          return typeof amount === "number"
            ? [{ label: key, attunement: { ...bundle.attunement, [key]: bundle.attunement[key] + amount } }]
            : []
        })
      bundles[name] = bundle
    }
  } finally {
    selection.innerWay = original
  }
  const samples = []
  console.log(
    JSON.stringify({
      node: process.version,
      fixture: preset.id,
      rotation: rotation.name,
      warmupPairs: 2,
      measuredPairs: 6,
    }),
  )
  for (let round = 0; round < 8; round++) {
    const cases = Object.entries(bundles)
    if (round % 2) cases.reverse()
    for (const [name, bundle] of cases) {
      const start = performance.now()
      const baseline = calculateRotationBaseline(bundle)
      const baselineMs = performance.now() - start
      const compactStart = performance.now()
      const compact = compactInnerWayResults(baseline)
      const compactionMs = performance.now() - compactStart
      const statStart = performance.now()
      calculateRotationComparisons({ ...bundle, attunementPriority: [] }, baseline)
      const statsMs = performance.now() - statStart
      const attuneStart = performance.now()
      calculateRotationComparisons({ ...bundle, statPriority: [] }, baseline)
      const attunementMs = performance.now() - attuneStart
      // The full stat group above prepares the aggregate coefficients. Measure
      // repeated attack comparisons separately from their one-time preparation.
      const attackStart = performance.now()
      calculateRotationComparisons(
        {
          ...bundle,
          statPriority: bundle.statPriority.filter(variant => ["minPhys", "maxPhys"].includes(variant.label)),
          attunementPriority: [],
        },
        baseline,
      )
      const cachedAttackComparisonsMs = performance.now() - attackStart
      const rateStart = performance.now()
      calculateRotationComparisons(
        {
          ...bundle,
          statPriority: bundle.statPriority.filter(variant =>
            ["precision", "crit", "affinity"].includes(variant.label),
          ),
          attunementPriority: [],
        },
        baseline,
      )
      const rateComparisonsMs = performance.now() - rateStart
      const sample = {
        round,
        name,
        baselineMs,
        compactionMs,
        statsMs,
        attunementMs,
        cachedAttackComparisonsMs,
        rateComparisonsMs,
        statCount: bundle.statPriority.length,
        attunementCount: bundle.attunementPriority.length,
        rows: baseline.timeline.length,
        compactedRows: compact.timeline.length,
        dps: baseline.metrics.dps,
      }
      if (round >= 2) samples.push(sample)
      console.log(JSON.stringify(sample))
    }
  }
  const median = values => {
    const sorted = values.toSorted((a, b) => a - b)
    return (sorted[2] + sorted[3]) / 2
  }
  for (const name of Object.keys(bundles)) {
    const runs = samples.filter(sample => sample.name === name)
    console.log(
      JSON.stringify({
        summary: name,
        ...Object.fromEntries(
          [
            "baselineMs",
            "compactionMs",
            "statsMs",
            "attunementMs",
            "cachedAttackComparisonsMs",
            "rateComparisonsMs",
          ].map(key => [key, median(runs.map(run => run[key]))]),
        ),
      }),
    )
  }
} finally {
  await server.close()
}
