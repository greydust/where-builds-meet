// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

import { legacyRotationEventLimitStorageKey, rotationEventLimitStorageKey } from "@/application/persistence/keys"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { useSettingsStore } from "@/stores/settingsStore"

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSettingsStore.getState().initialise(false)
})

describe("rotation event limit setting", () => {
  it("defaults to 6000 and restores a saved cap or unlimited selection", () => {
    expect(useSettingsStore.getState().rotationEventLimit).toBe(6000)
    for (const limit of [12000, 0]) {
      useSettingsStore.getState().setRotationEventLimit(limit)
      useSettingsStore.setState({ rotationEventLimit: 5000 })
      useSettingsStore.getState().initialise(false)
      expect(useSettingsStore.getState().rotationEventLimit).toBe(limit)
    }
  })

  it.each(["-1", "NaN", "Infinity", "invalid", "1.5", "9007199254740992"])(
    "uses the default for invalid saved limit %s",
    saved => {
      localStorage.setItem(rotationEventLimitStorageKey, saved)
      useSettingsStore.getState().initialise(false)
      expect(useSettingsStore.getState().rotationEventLimit).toBe(6000)
    },
  )

  it.each([5000, 0, 3000, 12000])("migrates a legacy cap of %s once and preserves subsequent choices", limit => {
    localStorage.setItem(legacyRotationEventLimitStorageKey, String(limit))
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().rotationEventLimit).toBe(limit === 5000 ? 6000 : limit)
    expect(localStorage.getItem(rotationEventLimitStorageKey)).toBe(String(limit === 5000 ? 6000 : limit))
    useSettingsStore.getState().setRotationEventLimit(5000)
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().rotationEventLimit).toBe(5000)
  })

  it("migrates a legacy session limit and gives the current version precedence", () => {
    sessionStorage.setItem(legacyRotationEventLimitStorageKey, "5000")
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().rotationEventLimit).toBe(6000)
    localStorage.setItem(rotationEventLimitStorageKey, "0")
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().rotationEventLimit).toBe(0)
  })

  it.each(["invalid", "-1", "1.5"])("replaces invalid legacy cap %s with the current default", saved => {
    localStorage.setItem(legacyRotationEventLimitStorageKey, saved)
    useSettingsStore.getState().initialise(false)
    expect(useSettingsStore.getState().rotationEventLimit).toBe(6000)
    expect(localStorage.getItem(rotationEventLimitStorageKey)).toBe("6000")
  })

  it("rejects invalid updates without replacing the saved setting", () => {
    useSettingsStore.getState().setRotationEventLimit(8000)
    for (const limit of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      useSettingsStore.getState().setRotationEventLimit(limit)
      expect(useSettingsStore.getState().rotationEventLimit).toBe(8000)
      expect(localStorage.getItem(rotationEventLimitStorageKey)).toBe("8000")
    }
  })
})

function timelineInput(): TimelineBuildInput {
  return {
    rotation: { name: "Event cap probe", steps: [{ type: "skill", skill: "Hit" }] },
    skills: {
      Hit: { castTime: 1, action: Array.from({ length: 6100 }, () => ({ type: "damage", time: 0, phyCoef: 1 })) },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
}

it("enforces the selected cap and completes editor timelines above 6000 events when unlimited", () => {
  const input = timelineInput()
  expect(() => buildRotationTimeline(input)).toThrow(/6,000-event safety limit/)
  expect(() => calculateEditorTimeline({ ...input, eventLimit: 100 })).toThrow(/100-event safety limit/)
  const unlimited = calculateEditorTimeline({ ...input, eventLimit: 0 })
  const raised = calculateEditorTimeline({ ...input, eventLimit: 10000 })
  expect(unlimited.timeline[0].actions.filter(action => action.type === "damage")).toHaveLength(6100)
  expect(unlimited).toEqual(raised)
})
