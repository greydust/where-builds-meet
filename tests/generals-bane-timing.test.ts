import { expect, it } from "vitest"

import skillsJson from "../data/skill/snowparting-blade.json"
const skills = asSkillRecords(skillsJson)
import { buildRotationTimeline } from "../src/calculations/rotationTimeline"
import type { RotationRecord } from "../src/calculations/rotationTimeline"
import { migrateGeneralsBaneSlides } from "../src/rotationEditing"
import { mergeImportedRotationEntries, rotationExportFormat } from "../src/rotationTransfer"
import { asSkillRecords } from "./helpers/shippedData"

it("General's Bane variants share two uses while Slash retains its independent follow-up timing", () => {
  const timeline = buildRotationTimeline({
    rotation: {
      name: "General's Bane variants",
      ping: 40,
      steps: ["SnowpartingQ", "SnowpartingQ2", "SnowpartingQSlash", "SnowpartingQ"].map(skill => ({
        type: "skill",
        skill,
      })),
    },
    skills,
    eventDefinitions: {},
    effectDefinitions: {},
    dots: {},
    weapons: [],
    setupEffects: [],
    innerWayConditions: [],
    innerWayRules: [],
  })
  const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
  expect(casts.map(row => row.step.skill)).toEqual([
    "SnowpartingQ",
    "SnowpartingQ2",
    "SnowpartingQSlash",
    "SnowpartingQ",
  ])
  expect(casts[0].startTime).toBeCloseTo(0.04)
  expect(casts[1].startTime).toBeCloseTo(0.772)
  expect(casts[2].startTime).toBeCloseTo(1.52)
  expect(casts[3].startTime).toBeCloseTo(12.08)
  for (const [castIndex, offsets] of [
    [0, [0.526]],
    [1, [0.611]],
    [2, [0.234, 0.491]],
  ] as const) {
    const row = casts[castIndex]
    offsets.forEach((offset, index) => {
      expect(Number(row.actions[index].time)).toBeCloseTo(offset)
      expect(row.actionStates[index]).toBeDefined()
      expect(row.startTime + offset).toBeLessThan(row.startTime + row.effectiveCastTime)
    })
  }
})

it("migrates stored and imported Slide openers without moving their event or battle anchors", () => {
  const legacy: RotationRecord = {
    name: "Legacy Slide opener",
    ping: 40,
    start: { step: 3 },
    steps: [
      { type: "skill", skill: "SnowpartingQSlide" },
      { type: "skill", skill: "GhostlySteps" },
      { type: "event", event: "Move", before: { action: "start" }, distance: 3 },
      { type: "skill", skill: "SnowpartingQSlide", causesBreak: true },
      { type: "skill", skill: "SnowpartingQ" },
    ],
  }
  const migrated = migrateGeneralsBaneSlides(legacy)
  expect(migrated.steps.filter(step => step.type === "skill").map(step => step.skill)).toEqual([
    "SnowpartingQ",
    "GhostlySteps",
    "SnowpartingQ2",
    "SnowpartingQ",
  ])
  expect(migrated.start).toEqual(legacy.start)
  expect(migrated.steps[2]).toEqual(legacy.steps[2])
  expect(migrated.steps[3]?.type === "skill" && migrated.steps[3].causesBreak).toBe(true)
  expect(legacy.steps[0].skill).toBe("SnowpartingQSlide")
  expect(migrateGeneralsBaneSlides(migrated)).toBe(migrated)
  const imported = mergeImportedRotationEntries([], {
    format: rotationExportFormat,
    version: 9,
    rotations: [{ id: "legacy", martialArts: ["snowparting"], rotation: legacy }],
  })
  expect(imported.importedCount).toBe(1)
  expect(imported.entries[0].rotation.steps).toEqual(migrated.steps)
  expect(imported.entries[0].rotation.start).toEqual(legacy.start)
})
