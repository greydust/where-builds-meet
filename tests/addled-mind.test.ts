import buffs from "@gamedata/buff/bamboocut-wind.json"
import echoes from "@gamedata/innerway/echoes-of-oblivion.json"
import infernal from "@gamedata/skill/infernal-twinblades.json"
import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type TimelineBuildInput, type TimelineRow } from "@/calculations/rotationTimeline"
import type { InnerWayEffectRule } from "@/calculations/rotationTimeline"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const cast = () => ({ type: "skill" as const, skill: "AddledMind" })
const input = (active = false, count = 1): TimelineBuildInput => ({
  rotation: { name: "Addled Mind", steps: Array.from({ length: count }, cast) },
  skills: asSkillRecords(infernal),
  effectDefinitions: asEffectDefinitions(buffs),
  dots: {},
  eventDefinitions: {},
  weapons: ["infernalTwinblades", "mortalRopeDart"],
  initialBuffs: active ? [{ name: "Flamelash", stack: 1 }] : [],
  innerWayConditions: [],
  innerWayRules: [],
  setupEffects: [],
})
const castRows = (rows: TimelineRow[]) => rows.filter(row => row.step.skill === "AddledMind" && !row.skipped)

describe("Addled Mind", () => {
  it.each([false, true])(
    "Echoes T4 restores a charge before the next cast would need to wait, Flamelash=%s",
    active => {
      const castCount = infernal.AddledMind.cooldownUses + 1
      const timeline = input(active, castCount)
      const withoutEchoes = castRows(buildRotationTimeline(timeline))
      expect(withoutEchoes).toHaveLength(castCount)
      const previous = withoutEchoes.at(-2)
      const last = withoutEchoes.at(-1)
      expect(previous, "The probe must schedule at least two Addled Mind casts.").toBeTruthy()
      expect(last?.startTime).toBeGreaterThan((previous?.startTime ?? 0) + (previous?.effectiveCastTime ?? 0))
      const withEchoes = castRows(
        buildRotationTimeline({
          ...timeline,
          innerWayConditions: ["EchoesOfOblivionT4"],
          innerWayRules: [
            {
              source: "EchoesOfOblivion",
              tier: 4,
              effect: {},
              trigger: echoes.effect.EchoesOfOblivionT4.trigger[0],
            } as InnerWayEffectRule,
          ],
        }),
      )
      expect(withEchoes).toHaveLength(castCount)
      withEchoes.slice(1).forEach((row, index) => {
        const previous = withEchoes[index]
        expect(row.startTime).toBeCloseTo(previous.startTime + previous.effectiveCastTime, 9)
      })
    },
  )
})
