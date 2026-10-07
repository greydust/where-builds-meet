import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type EditableObject } from "@/calculations/rotationTimeline"

describe("resource costs", () => {
  it.each([
    { name: "zero multiplier", effects: [{ resourceCostMultiplier: { Endurance: 0 } }], endurance: 0, vitality: 20 },
    { name: "other resource only", effects: [{ resourceCostMultiplier: { Vitality: 0 } }], endurance: 20, vitality: 0 },
    {
      name: "conditional multiplier and additive bonus",
      effects: [
        { requirement: [{ target: "skillTag", value: "Charged" }], resourceCostMultiplier: { Endurance: 0.8 } },
        { requirement: [{ target: "skillTag", value: "Charged" }], resourceCostBonus: { Endurance: -0.25 } },
        { requirement: [{ target: "skillTag", value: "Healing" }], resourceCostMultiplier: { Endurance: 0 } },
      ],
      endurance: 12,
      vitality: 20,
    },
  ])("preserves $name for direct spending", ({ effects, endurance, vitality }) => {
    const rows = buildRotationTimeline({
      rotation: { name: "Resource costs", steps: [{ type: "skill", skill: "Spend" }] },
      skills: {
        Spend: {
          name: "Spend",
          castTime: 0,
          tags: ["Charged"],
          action: [
            { type: "consumeResource", value: "Endurance", amount: 20, time: 0 },
            { type: "consumeResource", value: "Vitality", amount: 20, time: 0 },
          ],
        },
      },
      initialResources: { Endurance: 100, Vitality: 100 },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [{ baseDMGBonus: 1 }, ...(effects as EditableObject[])],
      weapons: [],
    })
    expect(rows[0].resourceConsumption?.Endurance).toBeCloseTo(endurance, 10)
    expect(rows[0].resourceConsumption?.Vitality).toBeCloseTo(vitality, 10)
  })
})
