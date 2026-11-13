import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

it("Mo A1 deals one light hit, changes the active art and preserves Inner Passion for the following conversion", async () => {
  const fixture = (await loadDpsSnapshotCases()).find(
    entry => entry.pathId === "stonesplitStrength" && entry.fixture.build === "mixed-fully-relayed-min",
  )!
  const bundle = buildPresetRotationBundle(
    {
      pathId: fixture.pathId,
      ...fixture.fixture,
      rotation: {
        name: "Mo A1",
        ping: 0,
        steps: [
          { type: "skill", skill: "PhalanxbaneLight1" },
          { type: "skill", skill: "SnowpartingConversion" },
        ],
      },
      skillOverrides: {},
      previewId: "cn-2.8.5",
    },
    fixture.fixture.build,
  )!
  bundle.timeline.initialBuffs = [{ name: "InnerPassion", stack: 2, maxStack: 4, expiresAt: 30 }]
  bundle.timeline.initialResources = { ...bundle.timeline.initialResources, Vitality: 0 }
  const result = calculateRotationBaseline(bundle)
  const a1 = result.timeline.find(row => row.step.skill === "PhalanxbaneLight1")!
  const conversion = result.timeline.find(row => row.step.skill === "SnowpartingConversion")!
  expect(a1.currentMartialArt).toBe("phalanxbane")
  expect(a1.actions.filter(action => action.type === "damage")).toHaveLength(1)
  expect(a1.actions.some(action => action.type === "consume" || action.type === "trigger")).toBe(false)
  expect(conversion.buffs.get("InnerPassion")?.stack).toBe(2)
  expect(conversion.resources.Vitality).toBe(2)
  expect(conversion.buffs.has("MountainSplitter")).toBe(false)
  const hit = result.baseline.find(entry => entry.context.skillTags.includes("Light"))!
  expect(hit.context.skillTags).toContain("PhalanxbaneBlade")
  expect(hit.context.skillTags).not.toContain("Charged")
  expect(result.metrics.breakdown.skills.find(skill => skill.id === "PhalanxbaneLight1")?.damage).toBeGreaterThan(0)
  expect(a1.effectiveCastTime).toBeGreaterThan(Number(a1.actions[0].time))
})
