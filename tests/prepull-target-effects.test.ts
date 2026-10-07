import { describe, expect, it } from "vitest"

import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { effectDefinitions } from "@/application/gameData/skills"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"

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

  it("opens combat before timed target effects at the anchor's instant", () => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Timed target effect at battle start",
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "Hit" },
          { type: "event", event: "Exhausted", startTime: 0 },
          { type: "event", event: "Delay", duration: 1 },
        ],
      },
      skills: { Hit: { name: "Hit", castTime: 1, action: [{ type: "damage", phyCoef: 1, time: 0.5 }] } },
      eventDefinitions: {
        ...rotationEventDefinitions,
        Exhausted: {
          name: "Timed debuff",
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "FearfulBlade", time: 0 }],
        },
      },
      dots: {},
      effectDefinitions,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    expect(timeline[0].battleStartTime).toBe(0)
    expect(debuffNames(rowWithId(timeline, "rotation-2")!)).toContain("FearfulBlade")
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

  it("uses the live battle flag for delayed prepull follow-ups while retaining their damage source", () => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Delayed prepull follow-up",
        start: { step: 1 },
        steps: [
          { type: "skill", skill: "Prepull" },
          { type: "event", event: "Delay", duration: 2 },
          { type: "event", event: "Delay", duration: 1 },
        ],
      },
      skills: {
        Prepull: { name: "Prepull", castTime: 1, action: [{ type: "trigger", value: "Followup", time: 0 }] },
        Followup: {
          name: "Followup",
          castTime: 2,
          tags: ["Followup"],
          action: [
            { type: "apply", target: "target", value: "BeforeBattle", time: 0.25 },
            { type: "damage", phyCoef: 1, time: 0.25 },
            { type: "apply", target: "target", value: "AfterBattle", time: 1.25 },
            { type: "damage", phyCoef: 1, time: 1.25 },
          ],
        },
      },
      eventDefinitions: rotationEventDefinitions,
      dots: {},
      effectDefinitions: Object.fromEntries(
        ["BeforeBattle", "AfterBattle", "TriggeredTarget", "CombatHits"].map(name => [
          name,
          { name, duration: 10, maxStack: 10 },
        ]),
      ),
      innerWayConditions: [],
      innerWayRules: [
        {
          source: "CombatProbe",
          tier: 0,
          effect: {},
          trigger: {
            event: "damage",
            requirement: [{ target: "skillTag", value: "Followup" }, { target: "battleStarted" }],
            action: [
              { type: "apply", target: "target", value: "TriggeredTarget" },
              { type: "apply", target: "self", value: "CombatHits" },
            ],
          },
        },
      ],
      setupEffects: [],
      weapons: [],
    })
    expect(timeline[0].battleStartTime).toBe(1)
    const followup = timeline.find(row => row.kind === "trigger" && row.step.skill === "Followup")!
    expect(followup.sourceRowId).toBe("rotation-0")
    const after = rowWithId(timeline, "rotation-2")!
    expect(debuffNames(after)).not.toContain("BeforeBattle")
    expect(debuffNames(after)).toEqual(expect.arrayContaining(["AfterBattle", "TriggeredTarget"]))
    expect([...after.buffs.values()].find(effect => effect.name === "CombatHits")?.stack).toBe(1)
    expect([...after.debuffs.values()].find(effect => effect.name === "TriggeredTarget")?.stack).toBe(1)
  })
})
