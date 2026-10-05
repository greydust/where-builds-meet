import { describe, expect, it } from "vitest"

import kiteBuffs from "../data/buff/bamboocut-kite.json"
import windBuffs from "../data/buff/bamboocut-wind.json"
import generalBuffs from "../data/buff/general.json"
import mysticBuffs from "../data/buff/mystic.json"
import infernal from "../data/martial-art/infernal-twinblades.json"
import general from "../data/skill/general.json"
import mystic from "../data/skill/mystic.json"
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"
import { migrateDefenseActionAnchors } from "../src/rotationEditing"
import { exportRotationEntries, mergeImportedRotationEntries } from "../src/rotationTransfer"
import { asEffectDefinitions, asSkillRecords, rankTalentEffects } from "./helpers/shippedData"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const attack = (startTime: number, damage = 200): RotationStep => ({
  type: "event",
  event: "TakeDamage",
  startTime,
  damage,
})
const end = (startTime: number): RotationStep => ({ type: "event", event: "BattleEnd", startTime })
const input = (steps: RotationStep[]): TimelineBuildInput => ({
  rotation: { name: "Attack response", ping: 40, steps },
  skills: asSkillRecords({
    ...general,
    ...mystic,
    Follow: { castTime: 1, action: [0.06, 0.36, 0.47].map(time => ({ type: "damage", phyCoef: 1, time })) },
  }),
  eventDefinitions: { TakeDamage: { action: [{ type: "takeDamage", time: 0 }] }, BattleEnd: { action: [] } },
  effectDefinitions: asEffectDefinitions({ ...kiteBuffs, ...windBuffs, ...mysticBuffs, ...generalBuffs }),
  dots: {},
  innerWayConditions: ["Etherwrath4P", "BreakingPointT6", "Cleftpeak4P"],
  innerWayRules: [],
  setupEffects: [],
  weapons: [],
  initialResources: { Vitality: 0 },
  resourceMaximums: { Vitality: 40 },
  maxHP: 10000,
})
const rowsFor = (rows: ReturnType<typeof buildRotationTimeline>, skill: string) =>
  rows.filter(row => row.step.type === "skill" && row.step.skill === skill)
const incoming = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows
    .filter(row => row.step.type === "event" && row.step.event === "TakeDamage")
    .flatMap(row => row.actions.filter(action => action.type === "takeDamage").map(action => action.damage))

describe("attack response windows", () => {
  it("keeps the canceled dodge window across the next cast and grants buffs exactly on the attack", () => {
    const rows = buildRotationTimeline(
      input([cast("PerfectDodgeCancel"), cast("Follow"), attack(5), attack(5), attack(5.05), attack(5.2), end(6)]),
    )
    const [dodge] = rowsFor(rows, "PerfectDodgeCancel")
    const [follow] = rowsFor(rows, "Follow")
    expect(dodge.startTime).toBeCloseTo(4.6)
    expect(dodge.effectiveCastTime).toBe(0)
    expect(dodge.resources.Vitality).toBe(0)
    expect(follow.startTime).toBeCloseTo(4.64)
    expect(follow.actionStates[0].buffs.has("Etherwrath")).toBe(false)
    for (const index of [1, 2]) {
      expect(follow.actionStates[index].resources.Vitality).toBe(3)
      expect(follow.actionStates[index].buffs.get("Etherwrath")?.expiresAt).toBeCloseTo(
        5 + kiteBuffs.Etherwrath.duration,
      )
      expect(follow.actionStates[index].buffs.get("Disintegration")?.expiresAt).toBeCloseTo(
        5 + windBuffs.Disintegration.duration,
      )
    }
    expect(incoming(rows)).toEqual([0, 0, 0, 200])
    const success = rowsFor(rows, "PerfectDodgeSuccess")
    expect(success).toHaveLength(1)
    expect(success[0].startTime).toBe(5)
    expect(success[0].sourceRowId).toBe(dodge.id)
    expect(rowsFor(rows, "BreakingPointT6Dodge")).toHaveLength(1)
  })

  it.each(["PerfectDodge", "PerfectDodgeCancel", "DeflectSuccessful"])(
    "%s triggers its defensive rewards from its no-attack fallback",
    skill => {
      const rows = buildRotationTimeline(input([cast(skill), cast("Follow"), end(3)]))
      const defense = rowsFor(rows, skill)[0]
      const successSkill = skill === "DeflectSuccessful" ? "DeflectSuccess" : "PerfectDodgeSuccess"
      expect(defense.startTime).toBeCloseTo(skill === "DeflectSuccessful" ? 0 : 0.04)
      expect(defense.actions).toHaveLength(0)
      expect(rowsFor(rows, successSkill)[0].startTime).toBeCloseTo(defense.startTime)
      expect(rowsFor(rows, "Follow")[0].resources.Vitality).toBe(3)
      expect(incoming(rows)).toEqual([])
    },
  )

  it.each(["Dodge", "DeflectSuccessful"])("%s blocks for its cast duration and grants success at the attack", skill => {
    const rows = buildRotationTimeline(input([cast(skill), cast("Follow"), attack(5), end(7)]))
    const defense = rowsFor(rows, skill)[0]
    expect(defense.startTime + defense.effectiveCastTime).toBeCloseTo(5.1)
    expect(rowsFor(rows, "Follow")[0].startTime).toBeCloseTo(5.14)
    expect(rowsFor(rows, skill === "Dodge" ? "PerfectDodgeSuccess" : "DeflectSuccess")[0].startTime).toBe(5)
    expect(incoming(rows)).toEqual([0])
  })

  it("reserves paired attacks once so consecutive attack-gated dodges align to distinct attacks", () => {
    const data = input([cast("Dodge"), cast("Dodge"), cast("Follow"), attack(5.5), end(13)])
    data.rotation.targetType = "DummyAttack"
    const rows = buildRotationTimeline(data)
    expect(rowsFor(rows, "Dodge").map(row => row.startTime)).toEqual([5.1, 11.1])
    expect(rowsFor(rows, "PerfectDodgeSuccess").map(row => row.startTime)).toEqual([5.5, 11.5])
    expect(incoming(rows)).toEqual([0, 0, 0, 0, 0])
  })

  it("resolves the canceled window from the normal dodge's weapon timing and modifiers", () => {
    const data = input([cast("PerfectDodgeCancel"), cast("Follow"), attack(5), end(7)])
    data.skills.PerfectDodge = {
      ...general.PerfectDodge,
      castTime: { function: "switch", param1: "currentWeapon", param2: { Gauntlet: 0.8 }, fallback: 1 },
      modifier: [{ effect: { castTimeMultiplier: 0.5 } }],
    }
    data.weapons = ["heavenwill"]
    data.martialArtState = { heavenwill: { weapon: "Gauntlet" } } as TimelineBuildInput["martialArtState"]
    const rows = buildRotationTimeline(data)
    expect(rowsFor(rows, "PerfectDodgeCancel")[0].startTime).toBeCloseTo(4.7)
    expect(rowsFor(rows, "PerfectDodgeCancel")[0].effectiveCastTime).toBe(0)
    expect(incoming(rows)).toEqual([0])
  })

  it("retains the defensive cast's weapon for success follow-ups without switching the active weapon back", () => {
    const data = input([cast("PerfectDodgeCancel"), cast("Follow"), cast("Observe"), attack(5), end(7)])
    data.weapons = ["heavenwill", "skygrasp"]
    data.martialArtState = {
      heavenwill: { weapon: "Gauntlet" },
      skygrasp: { weapon: "RopeDart" },
    } as TimelineBuildInput["martialArtState"]
    data.skills.Follow = { ...data.skills.Follow, tags: ["MartialArts"], martialArt: "skygrasp", weapon: "RopeDart" }
    data.skills.Observe = { castTime: 0, action: [] }
    data.initialBuffs = [{ name: "MysteryUmbra" }]
    const rows = buildRotationTimeline(data)
    const proc = rowsFor(rows, "GhostlyStepsUmbraDodgeGauntlet")
    expect(proc).toHaveLength(1)
    expect(proc[0].currentWeapon).toBe("Gauntlet")
    expect(proc[0].sourceRowId).toBe(rowsFor(rows, "PerfectDodgeCancel")[0].id)
    expect(rowsFor(rows, "GhostlyStepsUmbraDodgeRopeDart")).toHaveLength(0)
    expect(rowsFor(rows, "Observe")[0].currentWeapon).toBe("RopeDart")
  })

  it.each(["PerfectDodge", "PerfectDodgeCancel"])(
    "%s creates one Dual Blades Umbra explosion for paired attacks",
    skill => {
      const data = input([cast(skill), cast("Follow"), cast("Observe"), attack(5), attack(5), end(7)])
      data.weapons = ["infernalTwinblades", "mortalRopeDart"]
      data.martialArtState = {
        infernalTwinblades: { weapon: "DualBlades" },
        mortalRopeDart: { weapon: "RopeDart" },
      } as TimelineBuildInput["martialArtState"]
      data.skills.Follow = {
        ...data.skills.Follow,
        tags: ["MartialArts"],
        martialArt: "mortalRopeDart",
        weapon: "RopeDart",
      }
      data.skills.Observe = { castTime: 0, action: [] }
      data.initialBuffs = [{ name: "MysteryUmbra" }]
      const rows = buildRotationTimeline(data)
      const dodge = rowsFor(rows, skill)[0]
      expect(dodge.startTime).toBeCloseTo(4.975)
      expect(dodge.effectiveCastTime).toBe(skill === "PerfectDodge" ? 0.125 : 0)
      expect(rowsFor(rows, "Follow")[0].startTime).toBeCloseTo(skill === "PerfectDodge" ? 5.14 : 5.015)
      const procs = rowsFor(rows, "GhostlyStepsUmbraDodgeDualBlades")
      expect(procs).toHaveLength(1)
      expect(procs[0].currentWeapon).toBe("DualBlades")
      expect(procs[0].currentMartialArt).toBe("infernalTwinblades")
      expect(procs[0].sourceRowId).toBe(rowsFor(rows, skill)[0].id)
      const damage = procs[0].actions.filter(action => action.type === "damage")
      expect(damage).toHaveLength(1)
      expect(procs[0].startTime + Number(damage[0].time)).toBeCloseTo(5.8)
      expect(incoming(rows)).toEqual([0, 0])
      expect(rowsFor(rows, "GhostlyStepsUmbraDodgeRopeDart")).toHaveLength(0)
      expect(rowsFor(rows, "Observe")[0].currentWeapon).toBe("RopeDart")
      data.rotation.steps = [cast(skill), cast("Follow"), end(7)]
      expect(rowsFor(buildRotationTimeline(data), "GhostlyStepsUmbraDodgeDualBlades")).toHaveLength(1)
    },
  )

  it("restores talent charges on the successful attack, not on cast start", () => {
    const data = input([cast("Charged"), cast("PerfectDodgeCancel"), cast("Charged"), attack(5), end(6)])
    data.rotation.ping = 0
    data.skills.Charged = { castTime: 0, cooldown: 20, cooldownGroup: "AddledMind", action: [] }
    data.setupEffects = rankTalentEffects(infernal.talent[13])
    const rows = buildRotationTimeline(data)
    expect(rowsFor(rows, "Charged").map(row => row.startTime)).toEqual([0, 5])
  })

  it("keeps Dodge attack-gated without an incoming attack", () => {
    const rows = buildRotationTimeline(input([cast("Dodge"), cast("Follow"), end(3)]))
    expect(rowsFor(rows, "Dodge")[0].startTime).toBeCloseTo(0.04)
    expect(rowsFor(rows, "PerfectDodgeSuccess")).toHaveLength(0)
    expect(rowsFor(rows, "DeflectSuccess")).toHaveLength(0)
    expect(rowsFor(rows, "Follow")[0].resources.Vitality).toBe(0)
  })

  it.each([
    ["Dodge", "PerfectDodgeSuccess"],
    ["DeflectSuccessful", "DeflectSuccess"],
  ])("treats a zero-damage Take Damage event as an incoming hit for %s", (skill, successSkill) => {
    const rows = buildRotationTimeline(input([cast(skill), cast("Follow"), attack(1, 0), attack(2), end(2)]))
    expect(rowsFor(rows, successSkill)).toHaveLength(1)
    expect(rowsFor(rows, successSkill)[0].startTime).toBe(1)
  })

  it("runs Take Damage effects for a zero-damage event", () => {
    const data = input([cast("Follow"), cast("Observe"), attack(1, 0), end(3)])
    data.skills.Observe = { castTime: 0, action: [] }
    data.effectDefinitions.DamageSeen = { name: "Damage Seen", duration: 10 }
    data.setupEffects = [
      { trigger: { event: "takeDamage", action: { type: "addResource", value: "Vitality", amount: 2 } } },
      { trigger: { event: "takeDamage", action: { type: "apply", target: "self", value: "DamageSeen" } } },
    ]
    const observe = rowsFor(buildRotationTimeline(data), "Observe")[0]
    expect(observe.buffs.has("DamageSeen")).toBe(true)
    expect(observe.resources.Vitality).toBe(2)
  })
})

it("preserves legacy defense anchors on load and import without rewriting the source", () => {
  const rotation = input([
    { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0.4 },
    cast("PerfectDodge"),
    cast("Follow"),
    attack(5),
    end(7),
  ]).rotation
  rotation.start = { step: 1, action: 0 }
  const original = structuredClone(rotation)
  const migrated = migrateDefenseActionAnchors(rotation)
  expect(migrated.steps[0]).toMatchObject({ before: { action: "start" } })
  expect(migrated.start).toEqual({ step: 1 })
  expect(rotation).toEqual(original)
  expect(migrateDefenseActionAnchors(migrated)).toBe(migrated)
  const exported = exportRotationEntries([{ id: "legacy", rotation, martialArts: ["heavenwill", "skygrasp"] }])
  const imported = mergeImportedRotationEntries([], JSON.parse(exported)).entries[0].rotation
  expect(imported.steps).toEqual(migrated.steps)
  expect(imported.start).toEqual(migrated.start)
  const data = input(migrated.steps)
  data.eventDefinitions.Qi = { action: [{ type: "setQi", time: 0 }] }
  const rows = buildRotationTimeline(data)
  expect(rowsFor(rows, "PerfectDodge")[0].targetQiRatio).toBe(0.4)
})

it("starts a late dodge immediately, but skips attacks that land before its ping gap ends", () => {
  for (const [lead, expected] of [
    [4.9, 4.98],
    [5, 7.6],
  ]) {
    const data = input([cast("Lead"), cast("PerfectDodgeCancel"), cast("Follow"), attack(5), attack(8), end(9)])
    data.skills.Lead = { castTime: lead, action: [] }
    const rows = buildRotationTimeline(data)
    expect(rowsFor(rows, "PerfectDodgeCancel")[0].startTime).toBeCloseTo(expected)
    expect(rowsFor(rows, "PerfectDodgeSuccess")[0].startTime).toBe(lead === 4.9 ? 5 : 8)
  }
})
