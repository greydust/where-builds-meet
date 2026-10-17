import dawn from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-dawnsun.json"
import jade from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-jadebreaker.json"
import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

it.each([jade, dawn])(
  "depletes Qi proportionally before and after the second Drum Special break in $name",
  rotation => {
    const bundle = buildPresetRotationBundle(
      {
        pathId: "silkbindWings",
        martialArts: ["museflowWaistDrum", "willowbendFan"],
        rotation: rotation as RotationRecord,
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
    const result = calculateRotationBaseline(bundle)
    const start = result.timeline.find(row => row.battleStartTime !== undefined)!.battleStartTime!
    const qi = result.timeline
      .filter(row => row.step.type === "event" && row.step.event === "Qi" && !row.skipped)
      .sort((a, b) => a.startTime - b.startTime)
    expect(qi.map(row => (row.step as { targetQiRatio: number }).targetQiRatio)).toEqual([
      0.5999, 0.3999, 0, 0.5999, 0.3999,
    ])
    const exhaustion = qi[2].startTime - start
    for (const [index, fraction] of [
      [0, 0.4],
      [1, 0.6],
    ]) {
      expect(qi[index].startTime - start).toBeCloseTo(exhaustion * fraction, 8)
      const action = qi[index].actions.findIndex(action => action.type === "setQi")
      expect(qi[index].actionStates[action + 1].targetQiRatio).toBe(
        (qi[index].step as { targetQiRatio: number }).targetQiRatio,
      )
    }
    const exhausted = result.timeline
      .flatMap(row => Object.values(row.actionStates).map(state => state.debuffs.get("Exhausted")))
      .find(effect => effect?.expiresAt !== undefined)!
    const recovery = exhausted.expiresAt! - start
    expect(recovery).toBeGreaterThan(exhaustion)
    expect(qi[3].targetQiRatio).toBe(1)
    for (const [index, fraction] of [
      [3, 0.4],
      [4, 0.6],
    ]) {
      expect(qi[index].startTime - start).toBeCloseTo(recovery + exhaustion * fraction, 8)
      expect(qi[index].debuffs.has("Exhausted")).toBe(false)
      const action = qi[index].actions.findIndex(action => action.type === "setQi")
      expect(qi[index].actionStates[action + 1].targetQiRatio).toBe(
        (qi[index].step as { targetQiRatio: number }).targetQiRatio,
      )
    }
    const specials = result.timeline.filter(
      row => row.step.skill === "RippleJadebreaker" || row.step.skill === "RippleDawnsun",
    )
    const second = specials[1]
    const lastHitRow =
      rotation === jade
        ? result.timeline.find(row => row.step.skill === "JadebreakerEnhanced" && row.sourceRowId === second.id)!
        : second
    const lastHit = lastHitRow.actions.findLast(action => action.type === "damage")!
    expect(qi[2].startTime).toBeCloseTo(lastHitRow.startTime + Number(lastHit.time), 8)
    expect(result.duration).toBe(60)
  },
)
