import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { withUnresolvedEditorSteps } from "@/editorTimelinePreview"
import { buildTimelineDisplayEntries } from "@/rotationDisplay"

describe("rotation editor after battle end", () => {
  it("keeps unreached skills editable in saved order without exposing unexecuted actions", () => {
    const input: TimelineBuildInput = {
      rotation: {
        name: "Early battle end",
        steps: [
          { type: "skill", skill: "Probe" },
          { type: "skill", skill: "Probe" },
          { type: "skill", skill: "Probe" },
          { type: "event", event: "BattleEnd", startTime: 1 },
        ],
      },
      skills: { Probe: { name: "Probe", castTime: 2, tags: [], action: [{ type: "damage", time: 0, phyCoef: 1 }] } },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    }
    const resolved = buildRotationTimeline(input)
    expect(resolved.some(row => row.id === "rotation-1")).toBe(false)
    const timeline = withUnresolvedEditorSteps(input, resolved)
    const entries = buildTimelineDisplayEntries(timeline, () => true, { rowId: "rotation-0" })
    const skills = entries.filter(entry => entry.kind === "skill")
    expect(skills.map(entry => entry.row.id)).toEqual(["rotation-0", "rotation-3", "rotation-1", "rotation-2"])
    expect(skills.slice(-2).every(entry => entry.row.skipped)).toBe(true)
    expect(skills.slice(-2).map(entry => entry.row.rotationIndex)).toEqual([1, 2])
    expect(entries.filter(entry => entry.kind === "action").every(entry => entry.row.id === "rotation-0")).toBe(true)
    expect(resolved.some(row => row.id === "rotation-1")).toBe(false)
  })
})
