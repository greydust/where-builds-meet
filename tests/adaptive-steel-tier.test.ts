import { expect, it } from "vitest"

import { innerWayEffectRulesFor } from "@/application/characterComposition"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { emptyStats } from "@/data/statDefinitions"

it("unlocks Adaptive Steel's Bellstrike stat bonus at T5, retaining it at T6", () => {
  const bonus = (tier: "T4" | "T5" | "T6") => {
    const effects = innerWayEffectRulesFor([{ innerWay: "AdaptiveSteel", tier }], 17).map(rule => rule.effect)
    return calculateStatsWithEffects(emptyStats, effects, 0).stats.bellstrikeDmgBonus
  }
  expect(bonus("T4")).toBe(0)
  expect(bonus("T5")).toBeCloseTo(0.03, 12)
  expect(bonus("T6")).toBe(bonus("T5"))
})
