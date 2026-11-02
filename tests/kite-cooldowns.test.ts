import gauntlets from "@gamedata/skill/heavenwill-gauntlets.json"
import ropeDart from "@gamedata/skill/skygrasp-rope-dart.json"
import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"
import { asSkillRecords } from "./helpers/shippedData"

it.each([
  { sequence: ["SnaringLashCancel", "SnaringLash", "SnaringLashCancel"], cooldown: 15 },
  { sequence: ["SnaringLash", "SnaringLashCancel", "SnaringLash"], cooldown: 15 },
  { sequence: ["SkyGrasped", "SkyGrasped"], cooldown: 18 },
  { sequence: ["AllUnderJustice", "AllUnderJustice"], cooldown: 6 },
  { sequence: ["CelestialMandate", "CelestialMandate"], cooldown: 2 },
  { sequence: ["HeavenwillDeclared", "CelestialMandate", "HeavenwillDeclared"], cooldown: 15 },
])("Kite casts respect cooldowns across $sequence", ({ sequence, cooldown }) => {
  const timeline = buildRotationTimeline({
    rotation: { name: "Kite cooldowns", ping: 0, steps: sequence.map(skill => ({ type: "skill", skill })) },
    skills: asSkillRecords({ ...gauntlets, ...ropeDart }),
    eventDefinitions: {},
    effectDefinitions: {},
    dots: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["heavenwill", "skygrasp"],
  })
  const casts = timeline.filter(row => row.step.type === "skill" && row.kind === "rotation")
  expect(casts).toHaveLength(sequence.length)
  expect(casts.at(-1)!.startTime - casts[0].startTime).toBeCloseTo(
    sequence.includes("HeavenwillDeclared") ? cooldown : cooldown * (sequence.length - 1),
    8,
  )
})

it("Kite DH lands Dragon Head during Exhausted and its final two-HW hit before cutoff", async () => {
  const cases = (await loadDpsSnapshotCases()).filter(
    entry => entry.pathId === "bamboocutKite" && entry.fixture.rotation === "dummy-1-min-iv-bp-dh",
  )
  expect(cases.length).toBeGreaterThan(0)
  for (const { pathId, rotation, fixture } of cases) {
    const bundle = buildPresetRotationBundle(
      { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null },
      fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    for (const time of [17.5, 29.5, 41.5]) {
      const successes = result.timeline.filter(
        row => row.step.skill === "PerfectDodgeSuccess" && Math.abs(row.startTime - result.anchorTime - time) < 1e-8,
      )
      expect(successes).toHaveLength(1)
      expect(result.timeline.find(row => row.id === successes[0].sourceRowId)?.step.skill).toBe("SoaringSpin2")
    }
    const dodge = result.timeline.find(
      row =>
        row.step.type === "skill" &&
        row.step.skill === "PerfectDodgeSuccess" &&
        Math.abs(row.startTime - result.anchorTime - 41.5) < 1e-8,
    )
    expect(dodge).toBeDefined()
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const ends = casts.filter(row => row.step.type === "skill" && row.step.skill?.startsWith("VileCondemned"))
    expect(ends).toHaveLength(4)
    expect(ends.map(row => row.resourceConsumption?.HeavensWill)).toEqual([4, 4, 4, 2])
    const final = ends.at(-1)!
    const finalHit = final.actions.findIndex(action => action.type === "damage")
    expect(finalHit).toBeGreaterThanOrEqual(0)
    expect(final.startTime + Number(final.actions[finalHit].time) - result.anchorTime).toBeLessThan(60)
    const spend = final.actions.findIndex(action => action.type === "consumeResource")
    expect(final.actionStates[spend].resources.HeavensWill).toBeGreaterThanOrEqual(2)
    expect(final.actions[finalHit].phyCoef).toBe(7.2178)
    expect(final.actionStates[finalHit].buffs.has("VileCondemnedEndCooldown")).toBe(true)
    const dragon = casts.find(row => row.step.type === "skill" && row.step.skill === "DragonHeadTide")!
    const hits = dragon.actions.flatMap((action, index) => (action.type === "damage" ? [index] : []))
    expect(hits.length).toBeGreaterThan(0)
    for (const index of hits) {
      expect(dragon.actionStates[index].buffs.get("Disintegration")?.stack).toBe(
        bundle.timeline.innerWayConditions.includes("BreakingPointT0") ? 5 : undefined,
      )
      expect(dragon.actionStates[index].debuffs.has("Exhausted")).toBe(true)
    }
    const qi = result.timeline.find(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
    )!
    const spin = casts.find(row => row.id === qi.sourceRowId)!
    expect(spin.step).toMatchObject({ type: "skill", skill: "SoaringSpin2" })
    const breakingHit = spin.actions.findIndex(action => action.type === "damage")
    expect(qi.startTime).toBeCloseTo(spin.startTime + Number(spin.actions[breakingHit].time), 8)
    expect(spin.actionStates[breakingHit].debuffs.has("Exhausted")).toBe(true)
    const thirdHit = ends[2].actions.findIndex(action => action.type === "damage")
    expect(ends[2].actionStates[thirdHit].debuffs.has("Exhausted")).toBe(true)
    expect(ends[2].actionStates[thirdHit].buffs.get("Disintegration")?.stack).toBe(
      bundle.timeline.innerWayConditions.includes("BreakingPointT0") ? 5 : undefined,
    )
  }
})
