import dawnsun from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-jadebreaker.json"
import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

describe("Wings rotation finishers", () => {
  it.each(["17", "18"].flatMap(breakthrough => [jadebreaker, dawnsun].map(rotation => ({ breakthrough, rotation }))))(
    "cuts off the finishing sequence at one minute for $rotation.name at breakthrough $breakthrough",
    ({ breakthrough, rotation }) => {
      const current = rotation as RotationRecord
      const extended = structuredClone(current)
      const end = extended.steps.find(step => step.type === "event" && step.event === "BattleEnd")!
      Object.assign(end, { startTime: 65 })
      const calculate = (candidate: RotationRecord) => {
        const bundle = buildPresetRotationBundle(
          {
            pathId: "silkbindWings",
            martialArts: ["museflowWaistDrum", "willowbendFan"],
            rotation: candidate,
            breakthrough,
            globalDebuffs: { ...defaultGlobalDebuffs },
            food: "SimmeringFishSlices",
            script: "None",
            divinecraft: "Fire",
            skillOverrides: {},
            previewId: null,
          },
          "wings-fully-relayed-min",
        )!
        return calculateRotationBaseline(bundle)
      }
      const afterWindow = calculate(extended)
      const after = calculate(current)
      expect(after.duration).toBe(60)
      expect(afterWindow.duration).toBe(65)
      expect(afterWindow.metrics.totalDamage).toBeGreaterThan(after.metrics.totalDamage)
    },
  )
})
