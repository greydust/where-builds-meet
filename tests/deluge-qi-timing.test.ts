import paths from "@gamedata/path.json"
import regularFire from "@gamedata/rotation/silkbind-deluge/dummy-1-min-regular-fire.json"
import smolder from "@gamedata/rotation/silkbind-deluge/dummy-1-min-smolder.json"
import wtsTeam from "@gamedata/rotation/silkbind-deluge/dummy-1-min-wts-team.json"
import wts from "@gamedata/rotation/silkbind-deluge/dummy-1-min-wts.json"
import { assert, describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { compareTimelineTime, type RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

describe("Deluge Qi timing", () => {
  it.each([
    { name: "Regular Fire", rotation: regularFire },
    { name: "Smolder", rotation: smolder },
    { name: "World to Sword", rotation: wts },
    { name: "World to Sword Team", rotation: wtsTeam },
  ])("$name keeps its complete Qi segment near 20/30/50 seconds at default ping", ({ rotation: preset }) => {
    const rotation = { ...preset, ping: 40 } as RotationRecord
    const bundle = buildPresetRotationBundle(
      {
        pathId: "silkbindDeluge",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation,
        breakthrough: "17",
        food: "SimmeringFishSlices",
        divinecraft: "Fire",
        script: "None",
        globalDebuffs: { ...defaultGlobalDebuffs },
        skillOverrides: {},
        previewId: null,
      },
      paths.silkbindDeluge.defaultBuild,
    )
    expect(bundle).toBeDefined()
    const { timeline } = calculateRotationBaseline(bundle!)
    const anchor = timeline.find(row => row.rotationIndex === (rotation.start?.step ?? 0))!
    const startTime =
      anchor.startTime + (rotation.start?.action === undefined ? 0 : Number(anchor.actions[rotation.start.action].time))
    const ordered = timeline
      .filter(row => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
      .sort((a, b) => (a.rotationIndex ?? 0) - (b.rotationIndex ?? 0))
    if (preset === wts || preset === wtsTeam) {
      const firstCloud = ordered.find(row => row.step.skill?.startsWith("EndlessCloud"))!
      assert(anchor.resources.Dew >= 20, "The prepull refill must generate Dew before combat.")
      assert(
        firstCloud.resources.Dew >= firstCloud.resourceConsumption!.Dew,
        "The first Endless Cloud must be fully funded.",
      )
      assert(
        !timeline.some(
          row =>
            row.startTime < firstCloud.startTime &&
            row.step.type === "event" &&
            row.step.event === "Delay" &&
            row.step.automatic === "requirement",
        ),
        "The opener must fund the first Endless Cloud without a resource wait.",
      )
    }
    const attacks = timeline.filter(row => row.step.type === "event" && row.step.event === "TakeDamage")
    for (let index = 0; index < ordered.length; index++) {
      const row = ordered[index]
      if (row.step.type !== "skill" || row.step.skill !== "DeflectSuccessful") continue
      const previous = ordered[index - 1]
      const earliest = previous ? previous.startTime + previous.effectiveCastTime : 0
      const attack = attacks.find(attack => compareTimelineTime(attack.startTime, earliest) >= 0)
      if (!attack) {
        assert(
          Math.abs(row.startTime - earliest) < 0.005,
          "Deflect must start at the earliest ready time when no attack is incoming.",
        )
        continue
      }
      expect(row.startTime).toBeCloseTo(Math.max(earliest, attack.startTime + 0.1 - row.effectiveCastTime))
      expect(attack.actions.find(action => action.type === "takeDamage")?.damage).toBe(0)
    }
    const qiRows = timeline.filter(
      row => row.kind === "rotation" && row.step.type === "event" && row.step.event === "Qi",
    )
    expect(qiRows).toHaveLength(3)
    for (const [ratio, time] of [
      [0.5999, 20],
      [0.3999, 30],
      [0, 50],
    ]) {
      const row = qiRows.find(
        row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === ratio,
      )
      assert(row !== undefined, "Missing Qi event at " + time + " seconds")
      expect(Math.abs(row!.startTime - startTime - time)).toBeLessThanOrEqual(0.75)
      expect(row!.actions.some(action => action.type === "setQi")).toBe(true)
    }
  })
})
