import { describe, expect, it } from "vitest"

import windBuffsJson from "../data/buff/bamboocut-wind.json"
const windBuffs = asEffectDefinitions(windBuffsJson)
import infernalJson from "../data/skill/infernal-twinblades.json"
const infernal = asSkillRecords(infernalJson)

import mortalJson from "../data/skill/mortal-rope-dart.json"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
const mortal = asSkillRecords(mortalJson)
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const input = (steps: RotationStep[]): TimelineBuildInput => ({
  rotation: { name: "Infernal cancellation", ping: 40, steps },
  skills: { ...infernal, ...mortal },
  effectDefinitions: windBuffs,
  eventDefinitions: {},
  dots: {},
  innerWayConditions: ["EchoesOfOblivionT6"],
  innerWayRules: [],
  setupEffects: [],
  weapons: ["infernalTwinblades", "mortalRopeDart"],
})
const skillRows = (rows: ReturnType<typeof buildRotationTimeline>, skill: string) =>
  rows.filter(row => row.step.type === "skill" && row.step.skill === skill)
const hits = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.flatMap(row =>
    row.actions
      .filter(action => action.type === "damage")
      .map(action => ({
        skill: row.step.type === "skill" ? row.step.skill : undefined,
        time: row.startTime + Number(action.time ?? 0),
      })),
  )

describe("Infernal light attack variants", () => {
  it.each(["RodentRampage", "EnhancedRodentRampage"])(
    "FA2 Rodent launches under %s and lands after 0.5 seconds",
    buff => {
      const config = input([cast("InfernalFlamelashLight2Rodent"), { type: "event", event: "Delay", duration: 0.6 }])
      config.initialBuffs = [{ name: buff, stack: 1 }]
      const rows = buildRotationTimeline(config)
      expect(hits(rows)).toEqual([{ skill: "Rodent", time: 0.5 }])
      expect(skillRows(rows, "InfernalFlamelashLight2Rodent")[0].effectiveCastTime).toBe(0)
      config.initialBuffs = []
      expect(hits(buildRotationTimeline(config))).toEqual([])
      config.initialBuffs = [{ name: buff, stack: 1 }]
      config.skills.MoveOut = { castTime: 0, action: [{ type: "move", distance: 12, time: 0 }] }
      config.rotation.steps.unshift(cast("MoveOut"))
      expect(hits(buildRotationTimeline(config))).toEqual([])
    },
  )
  it.each([false, true])(
    "retains every FA5 hit and its T6 Rodents while ending on the final hit (sampled=%s)",
    sampled => {
      const config = input([
        cast("RodentRampage"),
        cast("InfernalFlamelashLight5Cancel"),
        cast("RodentsResilienceCharge"),
      ])
      config.initialBuffs = [{ name: "Flamelash", stack: 1 }]
      const rows = buildRotationTimeline(config, sampled ? () => 0.5 : undefined)
      const bladeHits = hits(rows).filter(hit => hit.skill === "InfernalFlamelashLight5Cancel")
      const [fa5] = skillRows(rows, "InfernalFlamelashLight5Cancel")
      expect(bladeHits).toHaveLength(5)
      expect(bladeHits.at(-1)!.time - fa5.startTime).toBeCloseTo(1.023)
      expect(fa5.startTime + fa5.effectiveCastTime).toBeCloseTo(bladeHits.at(-1)!.time)
      expect(skillRows(rows, "RodentsResilienceCharge")[0].startTime).toBeCloseTo(bladeHits.at(-1)!.time + 0.04)
      const rodentHits = hits(rows).filter(hit => hit.skill === "Rodent")
      expect(rodentHits).toHaveLength(3)
      expect(rodentHits.every(hit => Math.abs(hit.time - bladeHits[0].time - 0.5) < 1e-9)).toBe(true)
      config.rotation.steps = [cast("RodentRampage"), cast("InfernalFlamelashLight5"), cast("RodentsResilienceCharge")]
      const normal = buildRotationTimeline(config)
      expect(
        hits(normal)
          .filter(hit => hit.skill === "InfernalFlamelashLight5")
          .map(hit => hit.time),
      ).toEqual(bladeHits.map(hit => hit.time))
      expect(
        skillRows(normal, "RodentsResilienceCharge")[0].startTime -
          skillRows(rows, "RodentsResilienceCharge")[0].startTime,
      ).toBeCloseTo(0.378)
    },
  )

  it.each([false, true])("ends A4 Cancel on its hit and starts the next attack immediately (sampled=%s)", sampled => {
    const rows = buildRotationTimeline(
      input([cast("InfernalLight4Cancel"), cast("InfernalLight1")]),
      sampled ? () => 0.5 : undefined,
    )
    expect(hits(rows)).toHaveLength(3)
    expect(hits(rows)[0].time).toBeCloseTo(0.167)
    expect(skillRows(rows, "InfernalLight1")[0].startTime).toBeCloseTo(hits(rows)[0].time)
    const normal = buildRotationTimeline(input([cast("InfernalLight4"), cast("InfernalLight1")]))
    expect(skillRows(normal, "InfernalLight1")[0].startTime).toBeCloseTo(0.529)
  })

  it.each([false, true])(
    "triggers one Rodent per immediate cancel without blade damage or delaying the next cast (sampled=%s)",
    sampled => {
      const rows = buildRotationTimeline(
        input([
          cast("RodentRampage"),
          cast("InfernalLight1Rodent"),
          cast("InfernalLight3Rodent"),
          cast("InfernalLight4Rodent"),
          cast("InfernalFlamelashLight2Rodent"),
          cast("InfernalFlamelashLight4Rodent"),
          cast("RodentsResilienceCharge"),
        ]),
        sampled ? () => 0.5 : undefined,
      )
      expect(hits(rows).map(hit => hit.skill)).toEqual(["Rodent", "Rodent", "Rodent", "Rodent", "Rodent"])
      const [a1] = skillRows(rows, "InfernalLight1Rodent")
      const [a3] = skillRows(rows, "InfernalLight3Rodent")
      const [charge] = skillRows(rows, "RodentsResilienceCharge")
      expect(a1.effectiveCastTime).toBe(0)
      expect(a3.effectiveCastTime).toBe(0)
      const [a4] = skillRows(rows, "InfernalLight4Rodent")
      expect(a4.effectiveCastTime).toBe(0)
      expect(a4.startTime).toBeCloseTo(a1.startTime)
      const [fa4] = skillRows(rows, "InfernalFlamelashLight4Rodent")
      expect(fa4.effectiveCastTime).toBe(0)
      expect(fa4.startTime).toBeCloseTo(a1.startTime)
      expect(a3.startTime).toBeCloseTo(a1.startTime)
      expect(charge.startTime).toBeCloseTo(a1.startTime + 0.04)
      expect(hits(rows).every(hit => Math.abs(hit.time - a1.startTime - 0.5) < 1e-9)).toBe(true)
      expect(skillRows(rows, "Rodent").every(row => row.currentMartialArt === "infernalTwinblades")).toBe(true)
    },
  )

  it("does not summon Rodents without an active Rampage or after its expiration", () => {
    const empty = buildRotationTimeline(
      input([
        cast("InfernalLight1Rodent"),
        cast("InfernalLight3Rodent"),
        cast("InfernalLight4Rodent"),
        cast("InfernalFlamelashLight4Rodent"),
      ]),
    )
    expect(hits(empty)).toHaveLength(0)
    const expired = buildRotationTimeline(
      input([
        cast("RodentRampage"),
        { type: "event", event: "Delay", duration: 10 },
        cast("InfernalLight1Rodent"),
        cast("InfernalLight3Rodent"),
        cast("InfernalLight4Rodent"),
        cast("InfernalFlamelashLight4Rodent"),
      ]),
    )
    expect(hits(expired)).toHaveLength(0)
  })
})
