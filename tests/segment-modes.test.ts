import { describe, expect, it } from "vitest"

import mysticBuffs from "../data/buff/mystic.json"
import { resolveSegmentValue, type SegmentMode } from "../src/calculations/dynamicValues"
import { calculateStatsWithEffects, type SegmentStatValue } from "../src/calculations/statEffects"
import { emptyStats } from "../src/data/statDefinitions"
import { deserializeSkillOverrides, serializeSkillOverrides } from "../src/skillOverrides"

const segment = {
  function: "segment",
  param1: "distance",
  param2: [4, 5, 6, 7, 8],
  param3: [0.03, 0.032, 0.034, 0.036, 0.038, 0.04],
}

describe("segment boundary modes", () => {
  it("keeps Flute upper bounds exclusive and reaches 20% at exactly 9 m", () => {
    const value = mysticBuffs.Flute.effect[0].effect.dmgBonus
    expect(resolveSegmentValue(value, { distance: 4.999999 })).toBe(0.05)
    expect(resolveSegmentValue(value, { distance: 5 })).toBe(0.08)
    expect(resolveSegmentValue(value, { distance: 5.999999 })).toBe(0.08)
    expect(resolveSegmentValue(value, { distance: 6 })).toBe(0.11)
    expect(resolveSegmentValue(value, { distance: 8.999999 })).toBe(0.17)
    expect(resolveSegmentValue(value, { distance: 9 })).toBe(0.2)
  })
  it.each<SegmentMode>(["LowerBoundInclusive", "UpperBoundInclusive"])(
    "handles both sides of every boundary in %s",
    mode => {
      for (const [index, threshold] of segment.param2.entries()) {
        const value = { ...segment, mode }
        expect(resolveSegmentValue(value, { distance: threshold - 0.000001 })).toBe(segment.param3[index])
        expect(resolveSegmentValue(value, { distance: threshold })).toBe(
          segment.param3[index + (mode === "LowerBoundInclusive" ? 1 : 0)],
        )
        expect(resolveSegmentValue(value, { distance: threshold + 0.000001 })).toBe(segment.param3[index + 1])
      }
      expect(resolveSegmentValue({ ...segment, mode }, { distance: 0 })).toBe(0.03)
      expect(resolveSegmentValue({ ...segment, mode }, { distance: 100 })).toBe(0.04)
    },
  )

  it("defaults to lower-bound inclusion and rejects unsupported modes", () => {
    expect(resolveSegmentValue(segment, { distance: 4 })).toBe(0.032)
    for (const mode of ["inclusive", "", null, true]) {
      expect(resolveSegmentValue({ ...segment, mode }, { distance: 4 })).toBeUndefined()
    }
  })

  it.each<SegmentMode>(["LowerBoundInclusive", "UpperBoundInclusive"])(
    "resolves stat effects and preserves saved mode %s",
    mode => {
      const value: SegmentStatValue = { function: "segment", mode, param1: "maxHp", param2: [5000], param3: [0, 4] }
      const stats = calculateStatsWithEffects({ ...emptyStats, maxHp: 5000 }, [{ stat: { maxPhys: value } }], 0).stats
      expect(stats.maxPhys).toBe(mode === "LowerBoundInclusive" ? 4 : 0)
      const overrides = { Buff: { Probe: { effect: [{ effect: { dmgBonus: { ...segment, mode } } }] } } }
      const saved = deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(overrides)))
      const reloaded = (saved.Buff?.Probe.effect as Array<{ effect: { dmgBonus: unknown } }> | undefined)?.[0]
      expect(reloaded, "The saved Probe override must keep its first effect.").toBeDefined()
      expect(resolveSegmentValue(reloaded?.effect.dmgBonus, { distance: 5 })).toBe(
        mode === "LowerBoundInclusive" ? 0.034 : 0.032,
      )
    },
  )
})
