import { describe, expect, it } from "vitest"

import { migrateRotation } from "@/application/rotationCatalog"
import { deserializeSkillOverrides } from "@/skillOverrides"

describe("Umbra skill ID migration", () => {
  it("preserves saved rotation durations and anchors while updating skill IDs", () => {
    const migrated = migrateRotation({
      name: "Saved Umbra",
      eventTimeReference: "battleStart",
      start: { step: 0, action: 1 },
      steps: [
        { type: "skill", skill: "InnerBalanceStrikeBoth", duration: 2 },
        { type: "skill", skill: "SecondTrackSlashFollowup" },
      ],
    })
    expect(migrated.steps.map(step => step.skill)).toEqual(["InnerBalanceStrikeIII2", "CrisscrossSecondTrackSlash1"])
    expect(migrated.steps[0]).toMatchObject({ duration: 2 })
    expect(migrated.start).toEqual({ step: 0, action: 1 })
    expect(migrateRotation(migrated)).toEqual(migrated)
  })
  it("preserves customized overrides and updates their component references", () => {
    const overrides = deserializeSkillOverrides({
      version: 4,
      overrides: {
        StrategicSword: {
          InnerBalanceStrikeBoth: {
            castTime: 0.25,
            subAction: [
              { value: "InnerBalanceStrike2Cancel", skillBreakdownCategory: "Saved category" },
              "SecondTrackSlashFollowup",
            ],
          },
        },
      },
    })
    expect(overrides.StrategicSword?.InnerBalanceStrikeIII2).toMatchObject({
      castTime: 0.25,
      subAction: [
        { value: "CrisscrossInnerBalanceStrikeIIICancel", skillBreakdownCategory: "Saved category" },
        "CrisscrossSecondTrackSlash1",
      ],
    })
    expect(overrides.StrategicSword?.InnerBalanceStrikeBoth).toBeUndefined()
  })
})
