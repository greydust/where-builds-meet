import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { AttunementStats, DamageContext } from "@/calculations/damage"
import type { RotationSimulationBaseline } from "@/calculations/rotationCalculator"
import type { EditableObject, InnerWayEffectRule, TimelineBuildInput } from "@/calculations/rotationTimeline"
import type { CharacterStats, WeaponId } from "@/types"

import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { assertClose } from "./helpers/floatEquality"
import { castStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

// Ported from script/probe/check-innerway-catalog.mjs.
describe("innerway-catalog", () => {
  it("Inner Way catalog stat channels and Echoes of Oblivion lifecycle checks passed", async () => {
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { calculateHealingBreakdown } = await import("../src/calculations/healing.ts")
    const { resolveAttunementStats } = await import("../src/calculations/attunementStats.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const echoes = await import("../data/innerway/echoes-of-oblivion.json")
    const buffs = asEffectDefinitions((await import("../data/buff/bamboocut-wind.json")).default)
    const debuffs = asEffectDefinitions((await import("../data/debuff/bamboocut-wind.json")).default)
    const general = asSkillRecords((await import("../data/skill/general.json")).default)
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      minBellstrike: 100,
      maxBellstrike: 100,
      minStonesplit: 100,
      maxStonesplit: 100,
      minSilkbind: 100,
      maxSilkbind: 100,
      minBamboocut: 100,
      maxBamboocut: 100,
      precision: 1,
    }
    const enemy = {
      name: "Inner Way probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const context = (resolvedStats: CharacterStats, weapons: WeaponId[]): DamageContext => ({
      stats: resolvedStats,
      derivedStats: calculateDerivedStats(resolvedStats, 0, {}, weapons),
      enemy,
      weapons,
      effects: [],
      buffs: [],
      skillTags: [],
      attunement: emptyAttunementStats,
    })
    const close = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-8, message)
    const boosted = calculateStatsWithEffects(
      stats,
      [{ rawStat: { physicalHealingBonus: 0.025, formlessPenetration: 6 } }],
      0,
    ).stats
    for (const [weapons, channel] of [
      [["namelessSword", "namelessSpear"], "bellstrike"],
      [["thundercry", "stormbreaker"], "stonesplit"],
      [["panaceaFan", "soulshadeUmbrella"], "silkbind"],
      [["infernalTwinblades", "mortalRopeDart"], "bamboocut"],
    ] as Array<[WeaponId[], string]>) {
      const base = calculateDamageBreakdown({ type: "damage", phyCoef: 1, attrCoef: 1 }, context(stats, weapons))
      const result = calculateDamageBreakdown({ type: "damage", phyCoef: 1, attrCoef: 1 }, context(boosted, weapons))
      const attuned = calculateDamageBreakdown(
        { type: "damage", phyCoef: 1, attrCoef: 1 },
        { ...context(stats, weapons), attunement: { ...emptyAttunementStats, formlessPenetration: 6 } },
      )
      close(result.total, attuned.total, `${channel} raw Formless Penetration must match attunement penetration`)
      assert.ok(result.total > base.total, `${channel} Formless Penetration must improve output`)
      const baseHeal = calculateHealingBreakdown({ type: "heal", phyCoef: 1, silkbindCoef: 1 }, context(stats, weapons))
      const heal = calculateHealingBreakdown({ type: "heal", phyCoef: 1, silkbindCoef: 1 }, context(boosted, weapons))
      close(heal.physical, baseHeal.physical * 1.025, "Physical Healing Bonus must affect only the physical component")
      close(
        heal.silkbind,
        baseHeal.silkbind * (channel === "silkbind" ? 1.03 : 1),
        "Formless Penetration must affect healing only on a Silkbind path",
      )
    }
    // The app's own zero sheet, with the two penetration bonuses this spec varies.
    const defaults: AttunementStats = { ...emptyAttunementStats, physicalPenetration: 0, formlessPenetration: 0 }
    const displayed = resolveAttunementStats(defaults, { formlessPenetration: 10 }, {}, { formlessPenetration: 6 })
    close(displayed.displayed.formlessPenetration, 16, "Display must include the raw stat bonus")
    close(displayed.calculation.formlessPenetration, 10, "Calculation must exclude the already-applied raw stat bonus")
    const overridden = resolveAttunementStats(
      defaults,
      { formlessPenetration: 10 },
      { formlessPenetration: 20 },
      { formlessPenetration: 6 },
    )
    close(overridden.calculation.formlessPenetration + 6, 20, "Final attunement override must remain exact")
    // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
    const noEffect: EditableObject = {}
    function run(
      tier: number,
      {
        dodge = false,
        both = true,
        durationBonus = 0,
        tags = ["DirectDamage"],
        enemyDefense = 0,
        dodgeSkill = "PerfectDodge",
        actions,
      }: {
        dodge?: boolean
        both?: boolean
        durationBonus?: number
        tags?: string[]
        enemyDefense?: number
        dodgeSkill?: string
        actions?: EditableObject[]
      } = {},
    ) {
      // The tier table this probe walks, narrowed to the effect and trigger lists it reads.
      const tiers = Object.values(echoes.effect).slice(0, tier + 1) as Array<{
        effect?: EditableObject[]
        trigger?: EditableObject[]
      }>
      const rules = tiers.flatMap((definition, index): InnerWayEffectRule[] =>
        (definition.effect ?? [])
          .filter(effect => !effect.rawStat)
          .map(effect =>
            Object.assign({}, effect, {
              effect: (effect.effect ?? effect) as EditableObject,
              source: "EchoesOfOblivion",
              tier: index,
            }),
          )
          .concat(
            (definition.trigger ?? []).map(trigger => ({
              trigger,
              effect: noEffect,
              source: "EchoesOfOblivion",
              tier: index,
            })),
          ),
      )
      const rotation = { name: "Echoes probe", steps: [...(dodge ? [castStep(dodgeSkill)] : []), castStep("Probe")] }
      const timeline: TimelineBuildInput = {
        rotation,
        skills: withImmediateAttacks({
          ...general,
          Probe: {
            name: "Probe",
            castTime: 23,
            tags,
            action: actions ?? [
              ...(!dodge
                ? [
                    { type: "apply", target: "target", value: "Sin", duration: 1, time: 0 },
                    ...(both ? [{ type: "apply", target: "target", value: "Karma", duration: 1, time: 0 }] : []),
                  ]
                : []),
              ...[0.1, 0.2, 15.1, 15.3, 21.1, 21.3].map(time => ({ type: "damage", phyCoef: 1, time })),
            ],
          },
        }),
        effectDefinitions: { ...buffs, ...debuffs },
        initialResources: { Hellfire: 80 },
        dots: {},
        eventDefinitions: {},
        innerWayRules: rules,
        innerWayConditions: Object.keys(echoes.effect).slice(0, tier + 1),
        setupEffects: durationBonus
          ? [{ requirement: [{ target: "skillTag", value: "PerfectDodge" }], buffDurationBonus: durationBonus }]
          : [],
        weapons: [],
      }
      return calculateRotationBaseline({
        timeline,
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy: { ...enemy, defense: enemyDefense },
        weapons: [],
        attunement: emptyAttunementStats,
        startAnchor: { rowId: "rotation-0" },
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
    }
    const base = run(0)
    const active = run(1)

    close(base.metrics.totalDamage, 600, "T0 must not assume unsupported debuff mechanics")
    close(active.metrics.totalDamage, 610, "Samsara must affect later hits while active and stop after expiry")
    close(run(1, { both: false }).metrics.totalDamage, 600, "One mark alone must not activate Samsara")
    close(run(6).metrics.totalDamage, 620, "T6 must raise Samsara from 5% to 10%, without double counting")
    close(run(2, { dodge: true }).metrics.totalDamage, 600, "Perfect Dodge must not grant Samsara before T3")
    close(run(3, { dodge: true }).metrics.totalDamage, 610, "Perfect Dodge must grant 15-second Samsara at T3")
    close(
      run(3, { dodge: true, durationBonus: 0.4 }).metrics.totalDamage,
      620,
      "Existing dodge duration bonuses must extend Samsara",
    )
    const row = active.timeline.find(row => row.skill?.name === "Probe")
    assert(row, "The probe rotation must resolve a Probe cast.")
    const activeStates = row.actions.flatMap((action, index) => {
      const state = row.actionStates[index]
      return action.type === "damage" && state ? [state.buffs.has("Samsara")] : []
    })
    assert.deepEqual(
      activeStates,
      [false, true, true, false, false, false],
      "Samsara must apply after the first hit, refresh on the next hit, and expire 15 seconds after the refresh",
    )
    close(
      run(0, { tags: ["DirectDamage", "InfernalTwinblades", "Light"], enemyDefense: 50 }).metrics.totalDamage,
      320,
      "Sin must reduce defense only while marked and be reapplied after qualifying Light Attack damage",
    )
    close(
      run(0, { tags: ["DirectDamage", "InfernalTwinblades", "Heavy"], enemyDefense: 50 }).metrics.totalDamage,
      300,
      "Sin must not reduce defense for Heavy Attacks",
    )
    close(
      run(0, { tags: ["DirectDamage", "MortalRopeDart", "Light"], enemyDefense: 50 }).metrics.totalDamage,
      300,
      "Sin must not reduce defense for other martial arts",
    )
    close(
      run(3, { dodge: true, dodgeSkill: "PerfectDodgeCancel" }).metrics.totalDamage,
      610,
      "Cancelled Perfect Dodge must also grant Samsara",
    )

    const markStates = (result: RotationSimulationBaseline) => {
      const row = result.timeline.find(row => row.skill?.name === "Probe")!
      return row.actions.flatMap((action, index) => (action.type === "heal" ? [row.actionStates[index]] : []))
    }
    const lightTags = ["DirectDamage", "InfernalTwinblades", "Light"]
    const markSequence = (tier: number, flamelash: boolean, tags: string[] = lightTags) =>
      run(tier, {
        tags,
        actions: [
          ...(flamelash ? [{ type: "apply", target: "self", value: "Flamelash", time: 0 }] : []),
          { type: "damage", phyCoef: 1, time: 0.1 },
          { type: "heal", phyCoef: 0, time: 0.2 },
          { type: "damage", phyCoef: 1, time: 1 },
          { type: "heal", phyCoef: 0, time: 1.1 },
          { type: "heal", phyCoef: 0, time: 3.2 },
          { type: "heal", phyCoef: 0, time: 4.01 },
        ],
      })
    for (const [tier, flamelash, marks] of [
      [0, false, ["Sin"]],
      [0, true, ["Karma"]],
      [5, true, ["Karma"]],
      [6, true, ["Sin", "Karma"]],
      [6, false, ["Sin"]],
    ] as Array<[number, boolean, string[]]>) {
      const states = markStates(markSequence(tier, flamelash))
      states.forEach((state, index) => {
        assert.deepEqual(
          Array.from(state.debuffs.values())
            .map(mark => mark.name)
            .sort(),
          index === 3 ? [] : [...marks].sort(),
          "Marks must refresh for three seconds and expire after the refreshed duration",
        )
        for (const mark of state.debuffs.values()) {
          assert.equal(mark.stack, 1, "Repeated applications must cap at one stack")
          close(mark.expiresAt ?? 0, index === 0 ? 3.1 : 4, "Marks must expire three seconds after the latest hit")
        }
      })
      assert.equal(
        states[0].buffs.has("Samsara"),
        tier === 6 && flamelash,
        "The same T6 Flamelash hit must apply both marks before the T1 Samsara trigger checks them",
      )
    }
    for (const tags of [
      ["DirectDamage", "InfernalTwinblades", "Heavy"],
      ["DirectDamage", "MortalRopeDart", "Light"],
    ]) {
      assert.ok(
        markStates(markSequence(6, true, tags)).every(state => state.debuffs.size === 0),
        "Heavy Attacks and other martial arts must not apply either mark",
      )
    }
    const switched = markStates(
      run(1, {
        tags: lightTags,
        actions: [
          { type: "damage", phyCoef: 1, time: 0 },
          { type: "apply", target: "self", value: "Flamelash", time: 1 },
          { type: "damage", phyCoef: 1, time: 1.1 },
          { type: "heal", phyCoef: 0, time: 1.2 },
          { type: "heal", phyCoef: 0, time: 3.01 },
          { type: "heal", phyCoef: 0, time: 4.11 },
        ],
      }),
    )
    assert.deepEqual(
      switched.map(state =>
        Array.from(state.debuffs.values())
          .map(mark => mark.name)
          .sort(),
      ),
      [["Karma", "Sin"], ["Karma"], []],
      "Switching to Flamelash must leave Sin on its own expiry and apply Karma independently",
    )
    assert.ok(
      switched[0].buffs.has("Samsara"),
      "Switching modes while Sin remains must enable Samsara when Karma is applied",
    )
    const manuallyApplied = markStates(
      run(0, {
        actions: [
          { type: "apply", target: "target", value: "Sin", time: 0 },
          { type: "apply", target: "target", value: "Karma", time: 0 },
          { type: "heal", phyCoef: 0, time: 2.99 },
          { type: "heal", phyCoef: 0, time: 3.01 },
        ],
      }),
    )
    assert.deepEqual(
      manuallyApplied.map(state => state.debuffs.size),
      [2, 0],
      "Default mark duration must also govern explicit applications without an override",
    )
  })
})
