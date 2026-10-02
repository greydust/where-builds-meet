import { describe, expect, it } from "vitest"

import { rotationEventDefinitions } from "../src/application/gameData/rotationEffects"
import { effectDefinitions } from "../src/application/gameData/skills"
import { buildRotationTimeline } from "../src/calculations/rotationTimeline"
import { rowWithId } from "./helpers/timelineRows"

// The fight-start anchor is the boundary for anything that goes on the target. A
// prepull cast is a real rotation step that produces its own damage, so this is
// about effect application rather than about suppressing prepull actions.
describe("prepull target effects", () => {
  const build = (start: { step: number; action?: number }, extraSkills: Record<string, unknown> = {}) =>
    buildRotationTimeline({
      rotation: {
        name: "Prepull probe",
        start,
        steps: [
          { type: "skill", skill: "PrepullHit" },
          { type: "skill", skill: "Debuff" },
          { type: "event", event: "Delay", duration: 12 },
        ],
      },
      skills: {
        PrepullHit: {
          name: "Prepull Hit",
          castTime: 1,
          tags: ["DirectDamage"],
          action: [
            { type: "apply", target: "target", value: "FearfulBlade", stack: 1, time: 0 },
            { type: "apply", target: "self", value: "Shield", stack: 1, time: 0 },
            { type: "damage", phyCoef: 1, time: 0 },
          ],
        },
        Debuff: {
          name: "Debuff",
          castTime: 1,
          action: [{ type: "apply", target: "target", value: "FearfulBlade", stack: 1, time: 0 }],
        },
        ...extraSkills,
      },
      eventDefinitions: rotationEventDefinitions,
      dots: {},
      effectDefinitions,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })

  const debuffNames = (row: { debuffs?: unknown }) => {
    const debuffs =
      row.debuffs instanceof Map ? [...row.debuffs.values()] : Object.values((row.debuffs ?? {}) as object)
    return debuffs.map(effect => (effect as { name: string }).name)
  }

  it("rejects a target application from a prepull step but keeps the prepull hit and self effect", () => {
    const timeline = build({ step: 1 })
    const battleStart = timeline[0].battleStartTime!
    const prepull = timeline.filter(row => row.startTime < battleStart)
    expect(prepull.length).toBeGreaterThan(0)
    // The prepull damage still happened: this is not a prepull suppression rule.
    expect(prepull.some(row => row.actions?.some(action => action.type === "damage"))).toBeTruthy()
    // Its self effect applied, while its target effect did not.
    expect(prepull.some(row => debuffNames(row).length === 0)).toBeTruthy()
    expect(timeline.filter(row => row.startTime < battleStart).flatMap(debuffNames)).not.toContain("FearfulBlade")

    // Once the fight starts, the same application works.
    const inCombat = timeline.filter(row => row.startTime >= battleStart)
    expect(inCombat.some(row => debuffNames(row).includes("FearfulBlade"))).toBeTruthy()
  })

  it("applies the target effect when the fight is anchored on the applying step", () => {
    const timeline = build({ step: 0 })
    expect(timeline[0].battleStartTime).toBe(0)
    expect(timeline.some(row => debuffNames(row).includes("FearfulBlade"))).toBeTruthy()
  })

  it("treats the anchored step's earlier actions as prepull", () => {
    // The anchor names a specific action, so the same step's earlier actions
    // have not reached the fight yet.
    const timeline = build({ step: 1, action: 0 })
    expect(timeline[0].battleStartTime).toBeGreaterThan(timeline[0].startTime)
    // The first step's target effect never lands.
    expect(timeline.some(row => debuffNames(row).includes("FearfulBlade"))).toBeTruthy()
  })

  it("admits an application sharing the anchored action's instant", () => {
    // A charged release applies its debuff and lands its first hit in one timestamp
    // slot, so anchoring on the hit opens the fight on that instant. The debuff belongs
    // to the anchored hit, while an action strictly earlier in the same step is prepull.
    const timeline = build(
      { step: 0, action: 2 },
      {
        PrepullHit: {
          name: "Anchored Hit",
          castTime: 1,
          tags: ["DirectDamage"],
          action: [
            { type: "apply", target: "target", value: "FearfulBlade", stack: 1, time: 0.2 },
            { type: "apply", target: "target", value: "Candlelight", stack: 1, time: 0.5 },
            { type: "damage", phyCoef: 1, time: 0.5 },
          ],
        },
      },
    )
    const anchored = rowWithId(timeline, "rotation-0")!
    // The fight opens on the anchored hit, not on the cast start and not on the earlier action.
    expect(timeline[0].battleStartTime).toBeCloseTo(anchored.startTime + 0.5, 8)
    // Row snapshots capture state at row start, so the following row shows what landed.
    const after = rowWithId(timeline, "rotation-1")!
    expect(debuffNames(after)).toContain("Candlelight")
    expect(debuffNames(after)).not.toContain("FearfulBlade")
  })

  it("keeps a self effect from a prepull step", () => {
    const timeline = build({ step: 1 })
    // Row snapshots capture state at row start, so the effect a prepull step
    // applied to itself shows on the following row.
    const buffNames = (row: { buffs?: unknown }) =>
      (row.buffs instanceof Map ? [...row.buffs.values()] : Object.values((row.buffs ?? {}) as object)).map(
        effect => (effect as { name: string }).name,
      )
    expect(timeline.some(row => buffNames(row).includes("Shield"))).toBeTruthy()
  })
})
