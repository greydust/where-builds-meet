import { describe, expect, it } from "vitest"

import { bossDefinitions } from "../src/calculations/combatDefaults"

// Ported from script/probe/check-rotation-options.mjs.
describe("rotation-options", () => {
  it("Legacy Auto HP, Dummy Attack, and Infinite Vitality behavior remains valid", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const commonInput = {
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      eventDefinitions: {
        HP: { name: "Event: HP", castTime: 0, action: [{ type: "setTargetHP", time: 0 }], tags: ["Event"] },
        TakeDamage: {
          name: "Event: Take Damage",
          castTime: 0,
          action: [{ type: "takeDamage", time: 0 }],
          tags: ["Event"],
        },
        BattleEnd: { name: "Event: Battle End", castTime: 0, action: [], tags: ["Event"] },
      },
    }

    const legacyRotation = {
      name: "Automatic HP probe",
      autoHP: true,
      eventTimeReference: "battleStart" as const,
      steps: [{ type: "skill" as const, skill: "ObserveHP" }],
    }
    const hpTimeline = buildRotationTimeline({
      ...commonInput,
      rotation: legacyRotation,
      skills: {
        ObserveHP: {
          name: "Observe HP",
          castTime: 10,
          action: Array.from({ length: 11 }, (_, time) => ({ type: "damage", phyCoef: 1, attrCoef: 1, time })),
          tags: ["General"],
        },
      },
    })
    const hpRow = hpTimeline.find(row => row.step.type === "skill")
    const automaticRows = hpTimeline.filter(
      row => row.step.type === "event" && row.step.event === "HP" && "automatic" in row.step && row.step.automatic,
    )
    expect(
      automaticRows.length === 0,
      "A legacy Auto HP flag must not generate duration-dependent HP events.",
    ).toBeTruthy()
    expect(
      hpRow !== undefined && Object.values(hpRow.actionStates).every(state => state.targetHPRatio === 0.99),
      "Without manual HP events or maximum target HP, legacy rotations retain the ordinary 99% target state.",
    ).toBeTruthy()

    const vitalityTimeline = buildRotationTimeline({
      ...commonInput,
      rotation: {
        name: "Infinite Vitality probe",
        infiniteVitality: true,
        steps: [{ type: "skill", skill: "SpendVitality" }],
      },
      skills: {
        SpendVitality: {
          name: "Spend Vitality",
          castTime: 2,
          action: [
            { type: "consumeResource", value: "Vitality", amount: 50, time: 0 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
            { type: "addResource", value: "Vitality", amount: 10, time: 1 },
            { type: "consumeResource", value: "Vitality", amount: "all", time: 2 },
            { type: "damage", phyCoef: 1, attrCoef: 1, time: 2 },
          ],
          tags: ["Mystic"],
        },
      },
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
    })
    expect(
      Object.values(vitalityTimeline[0].actionStates).every(state => state.resources.Vitality === 100),
      "An infinite resource must remain at its maximum through gains and every form of consumption.",
    ).toBeTruthy()

    const attackTimelines = Object.fromEntries(
      bossDefinitions.map(definition => [
        definition.id,
        buildRotationTimeline({
          ...commonInput,
          rotation: {
            name: `target-${definition.id}`,
            targetType: definition.id,
            eventTimeReference: "battleStart" as const,
            steps: [
              { type: "skill" as const, skill: "ObserveDamage" },
              { type: "event" as const, event: "BattleEnd" as const, startTime: 18 },
            ],
          },
          skills: {
            ObserveDamage: {
              name: "Observe Damage",
              castTime: 18,
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 17.9 }],
              tags: ["General"],
            },
          },
          maxHP: 2000,
        }),
      ]),
    )
    expect(
      bossDefinitions.every(definition => {
        const rows = attackTimelines[definition.id].filter(
          row =>
            row.step.type === "event" &&
            row.step.event === "TakeDamage" &&
            "automatic" in row.step &&
            row.step.automatic === "targetAttack",
        )
        // A target that declares no attack pattern must never generate a hit.
        if (definition.attackPattern.length === 0) return rows.length === 0
        const pattern = definition.attackPattern[0]
        // One occurrence every `interval`, each landing `count` simultaneous hits.
        const occurrenceTimes = Array.from({ length: 3 }, (_, index) => pattern.firstDelay + index * pattern.interval)
        const expectedTimes = occurrenceTimes.flatMap(time => Array.from({ length: pattern.count }, () => time))
        return (
          rows.length === expectedTimes.length &&
          rows.every((row, index) => Math.abs(row.startTime - expectedTimes[index]) < 1e-9) &&
          rows.every(row => row.actions[0]?.damage === pattern.damage)
        )
      }),
      "Every target must follow its own declared attack pattern, and a target without one must never attack.",
    ).toBeTruthy()
    expect(
      bossDefinitions.find(definition => definition.id === "DummyAttack")?.attackPattern.length === 1,
      "Only the attacking dummy declares a pattern; the inert dummy and the boss declare none.",
    ).toBeTruthy()

    const dummyAttackTimeline = attackTimelines.DummyAttack
    const dummyAttackRows = dummyAttackTimeline.filter(
      row =>
        row.step.type === "event" &&
        row.step.event === "TakeDamage" &&
        "automatic" in row.step &&
        row.step.automatic === "targetAttack",
    )
    expect(dummyAttackRows.length, "The attacking dummy must resolve its declared pattern before Battle End.").toBe(6)
    expect(
      dummyAttackRows.every(row => row.actions[0]?.damage === 200),
      "Every generated Dummy Attack hit must deal exactly 200 damage.",
    ).toBeTruthy()
    const observedDamageRow = dummyAttackTimeline.find(
      row => row.step.type === "skill" && row.step.skill === "ObserveDamage",
    )
    expect(
      observedDamageRow?.actionStates[0]?.currentHP === 800,
      "Generated Dummy Attack hits must update the same Self HP state as manual Take Damage events.",
    ).toBeTruthy()
  })

  it("The legacy dummyAttack flag still resolves to the attacking dummy", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const legacyTimeline = buildRotationTimeline({
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
      skills: {},
      eventDefinitions: { BattleEnd: { name: "Event: Battle End", castTime: 0, action: [], tags: ["Event"] } },
      rotation: {
        name: "Legacy dummy attack",
        dummyAttack: true,
        eventTimeReference: "battleStart",
        steps: [{ type: "event", event: "BattleEnd", startTime: 18 }],
      } as never,
      maxHP: 2000,
    })
    expect(
      legacyTimeline.filter(
        row =>
          row.step.type === "event" &&
          row.step.event === "TakeDamage" &&
          "automatic" in row.step &&
          row.step.automatic === "targetAttack",
      ).length > 0,
      "A stored rotation using the removed dummyAttack flag must keep its generated attack pattern.",
    ).toBeTruthy()
  })
})
