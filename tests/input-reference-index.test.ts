import { describe, expect, it } from "vitest"

import { referencedInputs, referencesChangedInput } from "@/calculations/rotationDamageResponse"

describe("input reference index", () => {
  it("matches recursive dependency detection across nested and shared formula data", () => {
    const formula = { formula: { source: "minPhys", multiplier: 0.1 } }
    const graph = [
      { actions: [{ requirement: [{ param1: "effectiveCrit", param2: ["maxPhys"] }] }] },
      { effects: [formula, { minVoidAttack: 10 }, null, undefined, false] },
      { expectedEffects: [{ effects: [formula] }] },
    ]
    const index = referencedInputs(graph)
    for (const fields of [
      ["minPhys"],
      ["effectiveCrit", "crit"],
      ["maxPhys"],
      ["minVoidAttack"],
      ["affinity", "maxVoidAttack"],
    ]) {
      expect(fields.some(field => index.has(field))).toBe(referencesChangedInput(graph, new Set(fields)))
    }
  })
})
