import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { defaultRotationEntries, rotationRecordForEntry } from "@/application/rotationCatalog"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

it("Global 2.4 Mixed preserves all fifteen charges, four Soul hits and legal weapon transitions", async () => {
  const cases = (await loadDpsSnapshotCases()).filter(
    entry =>
      entry.pathId === "stonesplitStrength" &&
      entry.fixture.rotation === "mixed-dummy-1-min" &&
      entry.fixture.build.startsWith("mixed-"),
  )
  expect(cases).toHaveLength(8)
  for (const entry of cases) {
    const bundle = buildPresetRotationBundle(
      {
        pathId: entry.pathId,
        ...entry.fixture,
        rotation: rotationRecordForEntry(
          defaultRotationEntries.find(rotation => rotation.id === "mixed-dummy-1-min")!,
          "cn-2.8.5",
        ),
        skillOverrides: {},
        previewId: "cn-2.8.5",
      },
      entry.fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
    expect(result.metrics.breakdown.skills.find(skill => skill.id === "PhalanxbaneHeavyCharged3")?.hits).toBe(30)
    expect(result.metrics.breakdown.skills.find(skill => skill.id === "PhalanxbaneQ")?.hits).toBe(4)
    for (const row of casts.filter(row => row.step.skill === "PhalanxbaneQ")) {
      expect(row.buffs.has("IronGuard")).toBe(true)
      expect(row.actions.some(action => action.type === "damage" && Number(action.phyCoef) > 3)).toBe(true)
    }
    let art = bundle.weapons[0]
    const conversionSources: string[] = []
    for (const row of result.timeline.filter(row => row.kind === "rotation" && !row.skipped)) {
      if (row.step.type === "event" && row.step.event === "MartialArt") art = row.step.martialArt
      if (row.step.type !== "skill") continue
      if (row.step.skill === "SnowpartingConversion") conversionSources.push(art)
      const nextArt = bundle.timeline.skills[row.step.skill!]?.martialArt
      if (nextArt) art = nextArt
    }
    expect(conversionSources.length).toBeGreaterThan(0)
    expect(conversionSources.every(source => source === "phalanxbane")).toBe(true)
    const breath = casts.find(row => row.step.skill === "DragonsBreath1")!
    expect(breath.currentMartialArt).toBe("phalanxbane")
    const toadIndex = casts.findIndex(row => row.step.skill === "LeapingToad")
    expect(casts[toadIndex + 1].step.skill).toBe("Deflect")
    const linkedVcHits = result.baseline.filter(
      hit =>
        hit.context.skillTags.includes("AnxiSoldier") &&
        hit.context.skillTags.includes("HengBlade") &&
        hit.context.skillTags.includes("VariedCombo"),
    )
    expect(linkedVcHits.length).toBeGreaterThan(0)
    expect(Math.max(...linkedVcHits.map(hit => hit.timelineTime! - result.anchorTime))).toBeLessThan(60)
    const trace = casts.find(row => row.step.skill === "SnowpartingSpecial")!
    expect(result.anchorTime).toBeCloseTo(trace.startTime + Number(trace.actions[5].time), 8)
    expect(result.duration).toBe(60)
  }
})
