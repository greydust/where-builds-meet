import build from "@gamedata/build/silkbind-wings/wings-fully-relayed-min.json"
import dawnsun from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-dawnsun.json"
import jadebreaker from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-jadebreaker.json"
import system from "@gamedata/system.json"
import { describe, expect, it } from "vitest"

import {
  innerWayConditionsFor,
  innerWayEffectRulesFor,
  selectableRotationSkillGroups,
  setupConditionsFor,
} from "@/application/characterComposition"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline, type RotationRecord, type SkillRecord } from "@/calculations/rotationTimeline"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import type { BuildSetup } from "@/gear"
import type { WeaponId } from "@/types"

const weapons: WeaponId[] = ["museflowWaistDrum", "willowbendFan"]
function timeline(
  rotation: unknown,
  harmonyTier = "T6",
  skills: Record<string, SkillRecord> = allSkillDefinitions,
  extraInnerWays: BuildSetup["innerWays"] = [],
) {
  const innerWays = build.setup.innerWays
    .map(row => Object.assign({}, row, { tier: row.innerWay === "HarmonySong" ? harmonyTier : row.tier }))
    .concat(extraInnerWays) as BuildSetup["innerWays"]
  const setupEffects = martialArtEffectsForRank(martialArtDefinitions, weapons, 14)
  return buildRotationTimeline({
    rotation: rotation as RotationRecord,
    skills,
    eventDefinitions: rotationEventDefinitions,
    dots: {},
    effectDefinitions,
    innerWayConditions: [
      ...innerWayConditionsFor(innerWays, undefined, "silkbindWings"),
      ...setupConditionsFor(setupEffects),
      "Cloudshear4P",
    ],
    innerWayRules: innerWayEffectRulesFor(innerWays, 21, "silkbindWings"),
    setupEffects,
    weapons,
    initialResources: system.initialResources,
    resourceMaximums: system.resourceMaximums,
    cooldownPolicy: "wait",
  })
}
describe("Wings preset combat", () => {
  it.each([
    ["T3", 6.5],
    ["T6", 10.5],
  ] as const)("extends Dawnsun Radiant Drum at %s", (tier, expiresAt) => {
    const rows = timeline(
      {
        name: "Dawnsun extension",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "VerdantGust" },
          { type: "skill", skill: "RippleDawnsun" },
          { type: "skill", skill: "Observe" },
        ],
      },
      tier,
      { ...allSkillDefinitions, Observe: { castTime: 0, action: [] } },
    )
    const special = rows.find(row => row.step.skill === "RippleDawnsun")!
    const observed = rows.find(row => row.step.skill === "Observe")!
    expect(observed.buffs.get("RadiantDrum")!.expiresAt! - special.startTime).toBeCloseTo(expiresAt)
  })
  it.each([
    ["T0", 1, 0],
    ["T0", 2, 0],
    ["T0", 3, 1],
    ["T4", 1, 0],
    ["T4", 2, 1],
    ["T4", 3, 2],
  ] as const)("applies Cuncao %s with %s enemies and expires its stacks", (tier, enemyCount, perHit) => {
    const rows = timeline(
      {
        name: "Cuncao stacks",
        enemyCount,
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "VerdantGust" },
          { type: "skill", skill: "Observe" },
          ...Array.from({ length: 6 }, () => [
            { type: "skill", skill: "RhythmOfAccord" },
            { type: "skill", skill: "Observe" },
          ]).flat(),
          { type: "event", event: "Delay", duration: 8.1 },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      { ...allSkillDefinitions, Observe: { castTime: 0, action: [] } },
      [{ innerWay: "BladesWill", tier }],
    )
    const observations = rows.filter(row => row.step.skill === "Observe")
    expect(observations[0].debuffs.has("Cuncao")).toBe(false)
    for (let i = 1; i <= 6; i++) expect(observations[i].debuffs.get("Cuncao")?.stack ?? 0).toBe(Math.min(i * perHit, 5))
    expect(observations.at(-1)!.debuffs.has("Cuncao")).toBe(false)
  })
  it.each([1, 2, 3, 4, 5])(
    "uses enemy count %s for Perception dash timing without adding other-target damage",
    enemyCount => {
      const rows = timeline({
        name: "Perception targets",
        enemyCount,
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "EndOfGale" },
          { type: "skill", skill: "CraneWings" },
        ],
      })
      const perception = rows.find(row => row.step.skill === "EndOfGale")!
      const hits = perception.actions.filter(
        (action, index) => action.type === "damage" && perception.actionStates[index]?.combatOrder !== undefined,
      )
      const extra = (Math.min(enemyCount, 4) - 1) * 0.4
      expect(hits).toHaveLength(2)
      expect(Number(hits[0].time)).toBeCloseTo(0.566)
      expect(Number(hits[1].time)).toBeCloseTo(1.816 + extra)
      expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - perception.startTime).toBeCloseTo(
        1.933 + extra,
      )
    },
  )
  it("connects enhanced Fan Q to one-dash Perception on its second callback", () => {
    const rows = timeline({
      name: "Fan perception clock",
      ping: 0,
      start: { step: 0 },
      steps: [
        { type: "skill", skill: "BoundlessBloom" },
        { type: "skill", skill: "EndOfGale" },
        { type: "skill", skill: "CraneWings" },
      ],
    })
    const fan = rows.find(row => row.step.skill === "BoundlessBloom")!
    const perception = rows.find(row => row.step.skill === "EndOfGale")!
    expect(
      fan.actions
        .filter((action, index) => action.type === "damage" && fan.actionStates[index]?.combatOrder !== undefined)
        .map(action => action.time),
    ).toEqual([0.5, 1])
    expect(perception.startTime - fan.startTime).toBeCloseTo(1)
    const hits = perception.actions
      .filter((action, index) => action.type === "damage" && perception.actionStates[index]?.combatOrder !== undefined)
      .map(action => perception.startTime - fan.startTime + Number(action.time))
    expect(hits[0]).toBeCloseTo(1.566)
    expect(hits[1]).toBeCloseTo(2.816)
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - fan.startTime).toBeCloseTo(2.933)
  })
  it("connects charged light to VC after pre-charge and release", () => {
    const rows = timeline({
      name: "Charged light clock",
      ping: 0,
      start: { step: 0 },
      steps: [
        { type: "skill", skill: "RibbonLightChargedVC" },
        { type: "skill", skill: "CraneWings" },
      ],
    })
    const combo = rows.find(row => row.step.skill === "RibbonLightChargedVC")!
    const vcHit = combo.actions.find(action => action.type === "damage" && Number(action.time) > 0)!
    expect(Number(vcHit.time)).toBeCloseTo(0.2 + 1.833 + 0.5471428571428572)
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - combo.startTime).toBeCloseTo(
      0.2 + 1.833 + 1.1785714285714286,
    )
  })
  it("lands Dawnsun hits and releases the next skill on the nominal perfect-input clock", () => {
    const rows = timeline({
      name: "Dawnsun clock",
      ping: 0,
      start: { step: 0, action: 3 },
      steps: [
        { type: "skill", skill: "RippleDawnsun" },
        { type: "skill", skill: "CraneWings" },
      ],
    })
    const special = rows.find(row => row.step.skill === "RippleDawnsun")!
    const hits = Object.entries(special.actionStates)
      .filter(([index, state]) => special.actions[Number(index)].type === "damage" && state.combatOrder !== undefined)
      .map(([index]) => Number(special.actions[Number(index)].time))
    expect(hits).toEqual([0.982, 2.963, 5.165])
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - special.startTime).toBeCloseTo(5.92)
    expect(rows[0].battleStartTime! - special.startTime).toBeCloseTo(0.982)
  })
  it.each(["T3", "T6"])("lands Jadebreaker waves on the nominal perfect-input clock at Harmony %s", tier => {
    const rows = timeline(
      {
        name: "Jadebreaker clock",
        ping: 0,
        start: { step: 1, action: 3 },
        steps: [
          { type: "skill", skill: "VerdantGust" },
          { type: "skill", skill: "RippleJadebreaker" },
          { type: "skill", skill: "CraneWings" },
        ],
      },
      tier,
    )
    const special = rows.find(row => row.step.skill === "RippleJadebreaker")!
    const hits = rows
      .filter(row => row.step.skill === "RippleJadebreaker" || row.step.skill === "JadebreakerEnhanced")
      .flatMap(row =>
        Object.entries(row.actionStates)
          .filter(([index, state]) => row.actions[Number(index)].type === "damage" && state.combatOrder !== undefined)
          .map(([index]) => row.startTime - special.startTime + Number(row.actions[Number(index)].time)),
      )
    const expected = tier === "T6" ? [0.982, 3.033, 4.089, 5.235, 5.435] : [0.982, 3.033, 4.089, 5.235]
    expect(hits).toHaveLength(expected.length)
    hits.forEach((time, index) => expect(time).toBeCloseTo(expected[index]))
    expect(rows.find(row => row.step.skill === "CraneWings")!.startTime - special.startTime).toBeCloseTo(5.852)
    expect(rows[0].battleStartTime! - special.startTime).toBeCloseTo(0.982)
  })
  it.each([0, 40])("combines heavy attacks and VC with the earlier Pre-VC interruption at %sms ping", ping => {
    const run = (ids: string[]) =>
      timeline({ name: "Wings combo", ping, start: { step: 0 }, steps: ids.map(skill => ({ type: "skill", skill })) })
    const separate = run(["RibbonHeavy1", "RibbonHeavy2", "RibbonHeavy3", "RhythmOfAccord", "CraneWings"])
    const combined = run(["RibbonHeavyComboVC", "CraneWings"])
    const end = (rows: ReturnType<typeof run>) => rows.find(row => row.step.skill === "CraneWings")!
    expect(end(separate).startTime - end(combined).startTime).toBeCloseTo(0.25)
    expect(end(combined).resources.NobleWill).toBe(end(separate).resources.NobleWill)
    const damage = (rows: ReturnType<typeof run>) =>
      rows
        .filter(row => row.step.skill !== "CraneWings")
        .flatMap(row =>
          row.actions.filter(action => action.type === "damage").map(({ time: _time, ...action }) => action),
        )
    expect(damage(combined)).toEqual(damage(separate))
  })
  it("offers the two ready-to-use combos while hiding their attack components", () => {
    const ids = selectableRotationSkillGroups(["museflowWaistDrum", "willowbendFan"]).flatMap(group => group.skillIds)
    expect(ids).toEqual(expect.arrayContaining(["RibbonLightChargedVC", "RibbonHeavyComboVC"]))
    for (const id of ["RibbonHeavy1", "RibbonHeavy2", "RibbonHeavy3", "RibbonHeavy3PreVC", "RibbonLightCharged"])
      expect(ids).not.toContain(id)
  })
  it("advances the heavy/light combo by imported cancel times and restores 雅意 on the light hit", () => {
    const rows = timeline(
      {
        name: "Wings timed combo",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "Spend" },
          { type: "skill", skill: "RibbonHeavy1" },
          { type: "skill", skill: "RibbonHeavy2" },
          { type: "skill", skill: "RibbonHeavy3" },
          { type: "skill", skill: "RhythmOfAccord" },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      {
        ...allSkillDefinitions,
        Spend: { castTime: 0, action: [{ type: "consumeResource", value: "NobleWill", amount: "all", time: 0 }] },
        Observe: { castTime: 0, action: [] },
      },
    )
    const observed = rows.find(row => row.step.skill === "Observe")!
    expect(observed.startTime).toBeCloseTo(
      0.6941666666666667 + 0.4615384615384615 + 0.8333333333333334 + 1.1785714285714286,
    )
    expect(observed.resources.NobleWill).toBe(20)
    const light = rows.find(row => row.step.skill === "RhythmOfAccord")!
    const hit = Object.entries(light.actionStates).find(
      ([index, state]) => light.actions[Number(index)].type === "damage" && state.combatOrder !== undefined,
    )!
    expect(Number(light.actions[Number(hit[0])].time)).toBeCloseTo(0.5471428571428572)
    expect(hit[1].resources.NobleWill).toBe(0)
  })
  it("does not refresh Cloudshear when Radiant Drum expires into Tailwind", () => {
    const rows = timeline(
      {
        name: "Expiry Tailwind",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "VerdantGust" },
          { type: "skill", skill: "RippleJadebreaker" },
          { type: "event", event: "Delay", duration: 10 },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      { ...allSkillDefinitions, Observe: { castTime: 0, action: [] } },
    )
    const observed = rows.find(row => row.step.skill === "Observe")!
    expect(observed.buffs.has("RadiantDrum")).toBe(false)
    expect(observed.buffs.has("Tailwind")).toBe(true)
    expect(observed.buffs.has("Cloudshear")).toBe(false)
  })
  it.each([jadebreaker, dawnsun])("refreshes Cloudshear on each enhanced Fan Q in $name", rotation => {
    const rows = timeline(rotation)
    const fans = rows.filter(row => row.kind === "rotation" && row.step.skill === "BoundlessBloom")
    expect(fans).toHaveLength(3)
    for (const fan of fans) {
      const perception = rows.find(
        row => row.kind === "rotation" && row.step.skill === "EndOfGale" && row.startTime > fan.startTime,
      )!
      expect(perception.buffs.get("Cloudshear")!.expiresAt).toBeCloseTo(fan.startTime + 15)
    }
    const skills = rows.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const followingHeavy = skills.flatMap((row, index) =>
      row.step.skill === "RibbonHeavyComboVC" ? [skills[index + 1]] : [],
    )
    expect(followingHeavy).toHaveLength(4)
    expect(followingHeavy.every(row => row.distance === 1)).toBe(true)
  })
  it.each([jadebreaker, dawnsun])(
    "limits Cloudshear gaps to the delayed Fan Q and final Ripple refreshes in $name",
    rotation => {
      const rows = timeline(rotation)
      const start = rows[0].battleStartTime!
      const expiries = [
        ...new Set(
          rows.flatMap(row =>
            [row.buffs, ...Object.values(row.actionStates).map(state => state.buffs)]
              .map(buffs => buffs.get("Cloudshear")?.expiresAt)
              .filter((expiry): expiry is number => typeof expiry === "number"),
          ),
        ),
      ].sort((a, b) => a - b)
      let coveredUntil = start
      const gaps: Array<[number, number]> = []
      for (const expiry of expiries) {
        if (expiry - 15 > coveredUntil) gaps.push([coveredUntil, expiry - 15])
        coveredUntil = Math.max(coveredUntil, expiry)
      }
      const openingRipple = rows.find(row => row.kind === "rotation" && row.step.skill?.startsWith("Ripple"))!
      const fanRefresh = rows.filter(row => row.kind === "rotation" && row.step.skill === "BoundlessBloom")[1]
      const lastFan = rows.findLast(row => row.kind === "rotation" && row.step.skill === "BoundlessBloom")!
      const lastRipple = rows.findLast(row => row.kind === "rotation" && row.step.skill?.startsWith("Ripple"))!
      expect(gaps).toHaveLength(2)
      expect(gaps[0][0]).toBeCloseTo(openingRipple.startTime + 15)
      expect(gaps[0][1]).toBeCloseTo(fanRefresh.startTime)
      expect(gaps[1][0]).toBeCloseTo(lastFan.startTime + 15)
      expect(gaps[1][1]).toBeCloseTo(lastRipple.startTime)
      expect(coveredUntil).toBeGreaterThanOrEqual(start + 60)
    },
  )
  it("caps repeated Cloudshear applications at one stack and expires 15 seconds after refresh", () => {
    const rows = timeline(
      {
        name: "Cloudshear refresh",
        ping: 0,
        start: { step: 0, action: 0 },
        steps: [
          { type: "skill", skill: "VerdantGust" },
          { type: "event", event: "Delay", duration: 1 },
          { type: "skill", skill: "VerdantGust" },
          { type: "event", event: "Delay", duration: 14.9 },
          { type: "skill", skill: "Observe" },
          { type: "event", event: "Delay", duration: 0.2 },
          { type: "skill", skill: "Observe" },
        ],
      },
      "T6",
      {
        ...allSkillDefinitions,
        VerdantGust: { ...allSkillDefinitions.VerdantGust, cooldown: 0, castTime: 0 },
        Observe: { castTime: 0, action: [] },
      },
    )
    const observations = rows.filter(row => row.step.skill === "Observe")
    expect(observations).toHaveLength(2)
    const active = observations[0].buffs.get("Cloudshear")!
    expect(active.stack).toBe(1)
    expect(active.expiresAt! - observations[0].startTime).toBeCloseTo(0.1)
    expect(observations[1].buffs.has("Cloudshear")).toBe(false)
  })
  it.each([
    ["RippleJadebreaker", jadebreaker],
    ["RippleDawnsun", dawnsun],
  ])("restores 雅意 naturally before every %s", (variant, rotation) => {
    const rows = timeline(rotation)
    const specials = rows.filter(row => row.kind === "rotation" && row.step.skill === variant)
    expect(specials).toHaveLength(4)
    expect(specials.map(row => row.resourceConsumption?.NobleWill)).toEqual([100, 100, 100, 100])
    expect(rows.some(row => row.buffs.has("Cloudshear"))).toBe(true)
    expect(rows.some(row => row.debuffs.has("InkRhyme"))).toBe(true)
  })
  it.each([
    ["RippleJadebreaker", jadebreaker],
    ["RippleDawnsun", dawnsun],
  ])("resets %s after the second special's final hit and exhausted Q2", (variant, rotation) => {
    const rows = timeline(rotation)
    const specials = rows.filter(row => row.kind === "rotation" && row.step.skill === variant)
    const second = specials[1]
    const third = specials[2]
    const lastHitRow =
      variant === "RippleJadebreaker"
        ? rows.find(row => row.step.skill === "JadebreakerEnhanced" && row.sourceRowId === second.id)!
        : second
    const lastHit = lastHitRow.actions.findLastIndex(action => action.type === "damage")
    const exhausted = rows.find(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
    )!
    expect(exhausted.startTime).toBeCloseTo(lastHitRow.startTime + Number(lastHitRow.actions[lastHit].time))
    expect(lastHitRow.actionStates[lastHit].debuffs.has("Exhausted")).toBe(false)
    const q2 = rows.find(row => row.step.skill === "CranesCry" && row.startTime > second.startTime)!
    expect(q2.debuffs.has("Exhausted")).toBe(true)
    expect(third.startTime).toBeGreaterThan(q2.startTime)
    expect(third.startTime - second.startTime).toBeLessThan(20)
  })
  it("uses the third Dawnsun's Radiant Drum for the second Smolder before the final round", () => {
    const rows = timeline(dawnsun)
    const specials = rows.filter(row => row.kind === "rotation" && row.step.skill === "RippleDawnsun")
    const smolder = rows.findLast(row => row.kind === "rotation" && row.step.skill === "DragonsBreathSmolder2")!
    expect(smolder.startTime).toBeGreaterThan(specials[2].startTime)
    expect(smolder.startTime).toBeLessThan(specials[3].startTime)
    expect(smolder.buffs.has("RadiantDrum")).toBe(true)
  })
  it.each([jadebreaker, dawnsun])(
    "starts combat on Boundless Blossom and carries refreshed Driftbreeze into Drum Special",
    rotation => {
      const rows = timeline(rotation)
      const fan = rows.find(row => row.kind === "rotation" && row.step.skill === "BoundlessBloom")!
      const perception = rows.find(row => row.kind === "rotation" && row.step.skill === "EndOfGale")!
      const special = rows.find(row => row.kind === "rotation" && row.step.skill?.startsWith("Ripple"))!
      const firstHit = fan.actions.find(action => action.type === "damage")!
      expect(fan.startTime).toBeLessThan(perception.startTime)
      expect(perception.buffs.has("Tailwind")).toBe(true)
      expect(rows[0].battleStartTime).toBe(fan.startTime + Number(firstHit.time))
      expect(special.distance).toBe(6)
      expect(special.buffs.get("FlowingWind")!.expiresAt).toBeCloseTo(
        perception.startTime + Number(perception.actions.find(action => action.type === "damage")!.time) + 20,
      )
      expect(rows.filter(row => row.kind === "rotation" && row.step.skill === "NorthwindSweep")).toHaveLength(1)
    },
  )
  it("adds the second enhanced Jadebreaker beat only at Harmony T6", () => {
    const beats = (tier: string) =>
      timeline(jadebreaker, tier)
        .filter(row => row.step.skill === "JadebreakerEnhanced")
        .flatMap(row =>
          Object.keys(row.actionStates)
            .filter(index => row.actionStates[Number(index)].combatOrder !== undefined)
            .map(index => row.actions[Number(index)])
            .filter(action => action.type === "damage"),
        )
    expect(beats("T3")).toHaveLength(3)
    expect(beats("T6")).toHaveLength(8)
  })
  it("shares the full sequence and movement apart from Ripple and its Qi timing", () => {
    const normalize = (rotation: { steps: Array<{ skill?: string; event?: string }> }) =>
      rotation.steps
        .filter(step => step.event !== "Qi")
        .map(step =>
          Object.assign(
            {},
            step,
            step.skill ? { skill: step.skill.replace(/Ripple(Jadebreaker|Dawnsun)/, "Ripple") } : {},
          ),
        )
    expect(normalize(jadebreaker)).toEqual(normalize(dawnsun))
    expect(jadebreaker.start).toEqual(dawnsun.start)
    expect(jadebreaker.infiniteVitality).toBe(dawnsun.infiniteVitality)
    expect(jadebreaker.ping).toBe(dawnsun.ping)
  })
})
