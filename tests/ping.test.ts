import mysticBuffs from "@gamedata/buff/mystic.json"
import general from "@gamedata/skill/general.json"
import heavenwill from "@gamedata/skill/heavenwill-gauntlets.json"
import infernal from "@gamedata/skill/infernal-twinblades.json"
import mystic from "@gamedata/skill/mystic.json"
import phalanxbane from "@gamedata/skill/phalanxbane-blade.json"
import { assert, describe, expect, it } from "vitest"

import { rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import { normalizePing, resolvePing } from "@/calculations/combatDefaults"
import {
  buildRotationTimeline,
  type RotationStep,
  type SkillRecord,
  type TimelineBuildInput,
} from "@/calculations/rotationTimeline"
import type { RotationEntry } from "@/rotationTransfer"
import { exportRotationEntries, mergeImportedRotationEntries, serializeRotationEntries } from "@/rotationTransfer"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const hit: SkillRecord = { castTime: 1, action: [{ type: "damage", time: 1, phyCoef: 1 }] }
const step = (skill: string): RotationStep => ({ type: "skill", skill })
/**
 * A ping probe over a skills table.
 *
 * The tables come straight off the shipped JSON, so each record keeps the shape
 * TypeScript inferred for its own file rather than the one the timeline declares.
 */
function input(skills: unknown, steps: RotationStep[], ping = 40): TimelineBuildInput {
  return {
    rotation: { name: "Ping", ping, steps },
    skills: asSkillRecords(skills),
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
}
const damageTimes = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.flatMap(row =>
    row.actions.flatMap(action => (action.type === "damage" ? [row.startTime + Number(action.time)] : [])),
  )

describe("ping scheduling", () => {
  it("adds latency before each cast and preserves cast duration", () => {
    const rows = buildRotationTimeline(input({ Hit: hit }, [step("Hit"), step("Hit")]))
    expect(rows[0].startTime).toBeCloseTo(0.04)
    expect(rows[1].startTime).toBeCloseTo(1.08)
    expect(rows[1].startTime - (rows[0].startTime + rows[0].effectiveCastTime)).toBeCloseTo(0.04)
    expect(rows.map(row => row.effectiveCastTime)).toEqual([1, 1])
    expect(rows[0].timelineEndTime).toBeCloseTo(2.08)
    expect(damageTimes(buildRotationTimeline(input({ Hit: hit }, [step("Hit"), step("Hit")], 0)))).toEqual([1, 2])
  })

  it("does not scale ping with cast speed or apply it to Delay and triggers", () => {
    const skills = {
      Hit: {
        ...hit,
        modifier: [{ effect: { castTimeMultiplier: 0.5 } }],
        action: [...hit.action!, { type: "trigger", value: "Proc", time: 0 }],
      },
      Proc: { castTime: 0, action: [{ type: "damage", time: 0, phyCoef: 1 }] },
    }
    const rows = buildRotationTimeline(
      input(skills, [step("Hit"), { type: "event", event: "Delay", duration: 1 }, step("Hit")]),
    )
    expect(rows.find(row => row.rotationIndex === 2)?.startTime).toBeCloseTo(1.58)
    expect(rows.find(row => row.kind === "trigger")?.startTime).toBeCloseTo(0.04)
    expect(rows.find(row => row.rotationIndex === 1)?.effectiveCastTime).toBe(1)
  })

  it("waits for cooldown then pays ping once, including live resets during dispatch", () => {
    const skills = {
      Hit: { ...hit, cooldown: 3, action: [...hit.action!, { type: "trigger", value: "Reset", time: 0 }] },
      Reset: { castTime: 0, action: [{ type: "clearCD", value: "Hit", time: 3.02 }] },
    }
    const rows = buildRotationTimeline(input(skills, [step("Hit"), step("Hit")]))
    const second = rows.find(row => row.rotationIndex === 1)!
    expect(second.startTime).toBeCloseTo(3.08)
    expect(second.cooldownWait).toBeCloseTo(2)
    expect(rows.find(row => row.step.type === "event" && row.step.event === "Delay")?.effectiveCastTime).toBeCloseTo(2)
    expect(second.startTime + Number(second.actions[0].time)).toBeCloseTo(4.08)
  })

  it("applies component ping exactly once and keeps attachments aligned", () => {
    const skills = {
      Combo: { castTime: 0, ignorePing: true, subAction: [{ value: "Hit" }, { value: "Hit" }] },
      Hit: hit,
    }
    const data = input(skills, [
      { type: "event", event: "Buff", buff: "Marker", before: { action: 1 } },
      step("Combo"),
      step("Hit"),
    ])
    data.eventDefinitions = { Buff: { action: [{ type: "apply", target: "self", value: "Marker", time: 0 }] } }
    data.effectDefinitions = { Marker: { duration: 1 } }
    const rows = buildRotationTimeline(data)
    const combo = rows.find(row => row.rotationIndex === 1)!
    expect(combo.startTime).toBe(0)
    expect(combo.effectiveCastTime).toBeCloseTo(2.08)
    expect(rows.find(row => row.rotationIndex === 0)?.startTime).toBeCloseTo(2.08)
    expect(combo.actionStates[1].buffs.has("Marker")).toBe(true)
    expect(rows.find(row => row.rotationIndex === 2)?.startTime).toBeCloseTo(2.12)
  })

  it("uses the selected fallback's exemption and charges no ping for skipped components", () => {
    const data = input(
      {
        Combo: {
          ignorePing: true,
          subAction: [
            { value: "Hit", requirement: [{ target: "self", value: "Missing" }], fallback: "Free" },
            { value: "Hit", requirement: [{ target: "self", value: "Missing" }] },
            { value: "Hit" },
          ],
        },
        Hit: hit,
        Free: { ...hit, ignorePing: true },
      },
      [step("Combo")],
    )
    const rows = buildRotationTimeline(data)
    expect(rows[0].effectiveCastTime).toBeCloseTo(2.04)
    const times = damageTimes(rows)
    expect(times[0]).toBeCloseTo(1)
    expect(times[1]).toBeCloseTo(2.04)
  })

  it("resolves component start modifiers after effects expire during ping", () => {
    const data = input(
      {
        Combo: {
          ignorePing: true,
          action: [{ type: "apply", target: "self", value: "Speed", time: 0 }],
          subAction: [{ value: "Hit" }],
        },
        Hit: {
          ...hit,
          modifier: [{ requirement: [{ target: "self", value: "Speed" }], effect: { castTimeMultiplier: 0.5 } }],
        },
      },
      [step("Combo")],
    )
    data.effectDefinitions = { Speed: { duration: 0.02 } }
    expect(buildRotationTimeline(data)[0].effectiveCastTime).toBeCloseTo(1.04)
  })

  it("stops casts when Battle End arrives during ping", () => {
    const data = input({ Hit: hit }, [step("Hit"), { type: "event", event: "BattleEnd", startTime: 0.02 }])
    expect(buildRotationTimeline(data).some(row => row.step.type === "skill")).toBe(false)
  })

  it("keeps battle-relative events anchored to the delayed cast", () => {
    const data = input({ Hit: hit }, [step("Hit"), { type: "event", event: "BattleEnd", startTime: 0.5 }])
    data.rotation.start = { step: 0 }
    data.rotation.eventTimeReference = "battleStart"
    expect(buildRotationTimeline(data)[0].timelineEndTime).toBeCloseTo(0.54)
  })

  it.each([false, true])("charges Poet per selected action (initial Intoxicated: %s)", intoxicated => {
    const data = input(mystic, [step("DrunkenPoet5HitsCancel")])
    data.effectDefinitions = asEffectDefinitions(mysticBuffs)
    data.initialResources = { Vitality: 100 }
    data.resourceMaximums = { Vitality: 100 }
    if (intoxicated) data.initialBuffs = [{ name: "Intoxicated", stack: 1 }]
    const withPing = buildRotationTimeline(data)[0]
    const withoutPing = buildRotationTimeline({ ...data, rotation: { ...data.rotation, ping: 0 } })[0]
    expect(withPing.startTime).toBe(0)
    expect(withPing.effectiveCastTime - withoutPing.effectiveCastTime).toBeCloseTo((intoxicated ? 5 : 6) * 0.04)
  })

  it("exempts the requested Infernal attacks in actual scheduling", () => {
    const ids = [
      "InfernalLight1",
      "InfernalLight2",
      "InfernalLight3",
      "InfernalLight4",
      "InfernalFlamelashLight1",
      "InfernalFlamelashLight2",
      "InfernalFlamelashLight3",
      "InfernalFlamelashLight4",
      "InfernalFlamelashLight5",
    ]
    const data = input(infernal, ids.map(step))
    const times = (ping: number) =>
      buildRotationTimeline({ ...data, rotation: { ...data.rotation, ping } }).map(row => row.startTime)
    expect(times(40)).toEqual(times(0))
  })

  it.each([1, 2, 3].flatMap(stage => [false, true].map(fast => ({ stage, fast }))))(
    "Burning Heart stage $stage pays ping only once (fast: $fast)",
    ({ stage, fast }) => {
      const data = input(phalanxbane, [step("PhalanxbaneHeavyCharged" + stage)])
      data.effectDefinitions = { InnerPassion: { duration: 30, maxStack: 4 } }
      if (fast) data.initialBuffs = [{ name: "InnerPassion", stack: 1 }]
      const zero = buildRotationTimeline({ ...data, rotation: { ...data.rotation, ping: 0 } })
      const delayed = buildRotationTimeline(data)
      expect(delayed[0].effectiveCastTime - zero[0].effectiveCastTime).toBeCloseTo(0.04, 8)
      const zeroHits = damageTimes(zero)
      const delayedHits = damageTimes(delayed)
      expect(zeroHits.length).toBeGreaterThan(0)
      expect(delayedHits).toHaveLength(zeroHits.length)
      delayedHits.forEach((time, index) => expect(time - zeroHits[index]).toBeCloseTo(0.04, 8))
      if (stage === 3 && fast)
        assert(
          Math.abs(delayed[0].effectiveCastTime - 2.4608333333333334) < 5e-9,
          "Stage 3 fast cast must account for the full ping delay.",
        )
    },
  )

  it.each([
    "VileCondemnedHit",
    "VileCondemnedEndHit",
    ...[1, 2, 3].flatMap(n => ["PhalanxbaneHeavySlam" + n, "PhalanxbaneHeavyFastSlam" + n]),
  ])("exempts %s", id => {
    const data = input({ ...heavenwill, ...phalanxbane }, [step(id)])
    const rows = buildRotationTimeline(data)
    expect(rows[0].startTime).toBe(0)
    expect(rows[0].effectiveCastTime).toEqual(
      buildRotationTimeline({ ...data, rotation: { ...data.rotation, ping: 0 } })[0].effectiveCastTime,
    )
  })
})

describe("ping settings and persistence", () => {
  it("defaults to 40 ms, inherits Settings, and preserves explicit zero", () => {
    expect(resolvePing(undefined)).toBe(40)
    expect(resolvePing(undefined, 75)).toBe(75)
    expect(resolvePing(0, 75)).toBe(0)
    for (const value of [-1, NaN, Infinity, "40"]) expect(normalizePing(value)).toBeUndefined()
  })

  it.each([undefined, 0, 87.5])("round-trips rotation ping %s through persistence and transfer", ping => {
    const entries: RotationEntry[] = [
      { id: "ping", martialArts: ["snowparting"], rotation: { name: "Ping", ping, steps: [step("Hit")] } },
    ]
    const stored = JSON.parse(serializeRotationEntries(entries))
    expect(stored[0].rotation.ping).toBe(ping)
    const imported = mergeImportedRotationEntries([], JSON.parse(exportRotationEntries(entries)))
    expect(imported.entries[0].rotation.ping).toBe(ping)
  })

  it("includes ping in the calculation cache identity", () => {
    const timeline = input({ Hit: hit }, [step("Hit")])
    const fingerprint = (ping: number) =>
      rotationBundleFingerprint({
        weapons: [],
        timeline: { ...timeline, rotation: { ...timeline.rotation, ping } },
      } as never)
    expect(fingerprint(40)).not.toBe(fingerprint(0))
  })
})

it.each(["Deflect", "DeflectSuccessful"])("%s ignores ping without an incoming attack", skill => {
  const data = input(general, [step(skill), step(skill)])
  const rows = buildRotationTimeline(data)
  const zeroPingRows = buildRotationTimeline({ ...data, rotation: { ...data.rotation, ping: 0 } })
  const defenses = rows.filter(row => row.kind === "rotation")
  const zeroPingDefenses = zeroPingRows.filter(row => row.kind === "rotation")
  expect(defenses.map(row => row.startTime)).toEqual(zeroPingDefenses.map(row => row.startTime))
  expect(defenses[0].startTime).toBe(0)
  expect(defenses[1].startTime).toBeCloseTo(defenses[0].effectiveCastTime)
})
