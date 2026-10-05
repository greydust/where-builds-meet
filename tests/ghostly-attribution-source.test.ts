import { describe, expect, it } from "vitest"

import { defaultSkillMaps } from "@/application/gameData/skills"

import effects from "../data/buff/mystic.json"

const general = defaultSkillMaps.General
import mystic from "../data/skill/mystic.json"
import { buildRotationTimeline, type TimelineBuildInput } from "../src/calculations/rotationTimeline"

describe("explicit Ghostly Step attribution", () => {
  it.each([
    ["GhostlySteps", "Mystery", "GhostlyStepsUmbra", "MysteryUmbra"],
    ["GhostlyStepsUmbra", "MysteryUmbra", "GhostlySteps", "Mystery"],
  ])("replaces %s with %s's counterpart and credits the new enabling cast", (first, firstBuff, second, secondBuff) => {
    const input: TimelineBuildInput = {
      rotation: {
        name: "Ghostly source replacement",
        infiniteVitality: true,
        steps: [first, "PerfectDodgeSuccess", "Observe", second, "Observe", "PerfectDodgeSuccess", "Observe"].map(
          skill => ({ type: "skill", skill }),
        ),
      },
      skills: { ...mystic, ...general, Observe: { castTime: 1, action: [{ type: "damage", time: 0 }] } },
      effectDefinitions: effects,
      eventDefinitions: {},
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    }
    const rows = buildRotationTimeline(input)
    const at = (index: number) => rows.find(row => row.rotationIndex === index)!
    const before = at(2).actionStates[0].buffs
    const switched = at(4).actionStates[0].buffs
    const refreshed = at(6).actionStates[0].buffs
    expect(before.has(firstBuff)).toBe(true)
    expect(before.has(secondBuff)).toBe(false)
    expect(before.get("MysteryDMGBoost")?.sourceRowId).toBe(at(0).id)
    expect(switched.has(firstBuff)).toBe(false)
    expect(switched.has(secondBuff)).toBe(true)
    expect(switched.get("MysteryDMGBoost")?.sourceRowId).toBe(at(0).id)
    expect(refreshed.get("MysteryDMGBoost")?.sourceRowId).toBe(at(3).id)
    expect(refreshed.get("MysteryDMGBoost")?.collectBoostDamage).toBe("MysteryDMGBoost")
    // Earlier snapshots retain the original enabling state and attribution.
    expect(before.has(firstBuff)).toBe(true)
    expect(before.get("MysteryDMGBoost")?.sourceRowId).toBe(at(0).id)
    for (const row of rows)
      for (const state of Object.values(row.actionStates))
        expect(state.buffs.has("Mystery") && state.buffs.has("MysteryUmbra")).toBe(false)
  })
})
