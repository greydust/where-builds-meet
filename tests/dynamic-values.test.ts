import swordMorph from "@gamedata/innerway/sword-morph.json"
import { describe, expect, it } from "vitest"

import { resolveMultiplyValue, resolveSegmentValue, resolveSwitchValue } from "@/calculations/dynamicValues"

describe("dynamic multiplier caps", () => {
  it.each([
    [0, 0],
    [10, 0.15],
    [20, 0.3],
    [30, 0.3],
  ])("caps Sword Morph's bonus for %s Endurance spent at %s", (enduranceSpent, expected) => {
    const value = swordMorph.effect.SwordMorphT0.effect[0].effect.dmgBonus
    expect(resolveMultiplyValue(value, { enduranceSpent })).toBeCloseTo(expected, 12)
  })
})

describe("dynamic switches", () => {
  const value = { function: "switch", param1: "state", param2: { ready: 7, 2: 8, true: 0, false: 4 }, fallback: 9 }

  it.each([
    ["ready", 7],
    [2, 8],
    [true, 0],
    [false, 4],
  ])("selects the own case for %s", (state, expected) => {
    expect(resolveSwitchValue(value, { state })).toBe(expected)
  })

  it.each([undefined, "missing", 3, "toString"])("uses the fallback for unmatched key %s", state => {
    expect(resolveSwitchValue(value, { state })).toBe(9)
  })

  it("leaves an unmatched switch unresolved when no fallback is defined", () => {
    expect(resolveSwitchValue({ function: "switch", param1: "state", param2: { ready: 7 } }, {})).toBeUndefined()
  })
})

describe("dynamic segment inputs", () => {
  it.each([
    [5, 1],
    [10, 2],
    [15, 2],
    [20, 3],
  ])("resolves the segment for numeric input %s", (param1, expected) => {
    expect(resolveSegmentValue({ function: "segment", param1, param2: [10, 20], param3: [1, 2, 3] }, {})).toBe(expected)
  })

  it.each([5, 15, 25])("rejects a missing overflow result even when the input is %s", distance => {
    const value = { function: "segment", param1: "distance", param2: [10, 20], param3: [1, 2] }
    expect(resolveSegmentValue(value, { distance })).toBeUndefined()
  })
})
