import dawnsun from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-jadebreaker.json"
import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

function compare(rotation: RotationRecord) {
  const bundle = buildPresetRotationBundle(
    {
      pathId: "silkbindWings",
      martialArts: ["museflowWaistDrum", "willowbendFan"],
      rotation,
      breakthrough: "17",
      globalDebuffs: { ...defaultGlobalDebuffs },
      food: "SimmeringFishSlices",
      script: "None",
      divinecraft: "Fire",
      skillOverrides: {},
      previewId: null,
    },
    "wings-fully-relayed-min",
  )!
  const gated = calculateRotationBaseline(bundle)
  const rule = bundle.timeline.innerWayRules!.find(rule => rule.source === "HarmonySong" && rule.tier === 3)!
  expect(rule).toBeDefined()
  rule.requirement = [{ target: "skillTag", value: "JadebreakerNormal" }]
  return { gated, ungated: calculateRotationBaseline(bundle) }
}

it.each([jadebreaker, dawnsun])("preserves $name damage with the Radiant Drum condition", rotation => {
  const { gated, ungated } = compare(rotation as RotationRecord)
  expect(gated.metrics.totalDamage).toBe(ungated.metrics.totalDamage)
  expect(gated.metrics.dps).toBe(ungated.metrics.dps)
})

it("removes ordinary-wave critical damage when Jadebreaker has no Radiant Drum", () => {
  const { gated, ungated } = compare({
    name: "Unbuffed Jadebreaker",
    ping: 0,
    start: { step: 0 },
    steps: [{ type: "skill", skill: "RippleJadebreaker" }],
  } as RotationRecord)
  expect(gated.metrics.totalDamage).toBeLessThan(ungated.metrics.totalDamage)
})
