import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { WeaponId } from "@/types"

import type { DamageContext } from "../src/calculations/damage.ts"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "../src/calculations/rotationCalculator.ts"
import type {
  EditableObject,
  RotationStep,
  SkillRecord,
  TimelineBuildInput,
  TimelineRow,
} from "../src/calculations/rotationTimeline.ts"
import { assertClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowCasting } from "./helpers/timelineRows"

// A skill record carries its actions untyped; these specs read them as editable objects.
const skillActions = (record: SkillRecord): EditableObject[] => (record.action ?? []) as EditableObject[]

// Ported from script/probe/check-rodent-rampage.mjs.
describe("rodent-rampage", () => {
  it("Infernal stage timing, Rodent cadence/lifetime, T6 gating, dynamic damage, and expected/sampled checks passed", async () => {
    const close = (a: number | undefined, b: number, message: string) => assertClose(a, b, 1e-9, message)
    const infernal = asSkillRecords((await import("../data/skill/infernal-twinblades.json")).default)
    const mortal = asSkillRecords((await import("../data/skill/mortal-rope-dart.json")).default)
    const buffs = asEffectDefinitions((await import("../data/buff/bamboocut-wind.json")).default)
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const weapons: WeaponId[] = ["infernalTwinblades", "mortalRopeDart"]
    const slow: SkillRecord = {
      castTime: 0.5,
      martialArt: "snowparting",
      weapon: "HengBlade",
      tags: ["MartialArts", "SnowpartingBlade", "Light"],
      action: [
        { type: "damage", time: 0.1, phyCoef: 1 },
        { type: "damage", time: 0.2, phyCoef: 1 },
      ],
    }
    const input = (steps: RotationStep[], extra: Partial<TimelineBuildInput> = {}): TimelineBuildInput => ({
      rotation: { name: "Rodent stages", steps },
      skills: {
        ...infernal,
        ...mortal,
        Slow: slow,
        MortalLight: {
          ...slow,
          martialArt: "mortalRopeDart",
          weapon: "RopeDart",
          tags: ["MartialArts", "MortalRopeDart", "Light"],
        },
        Heavy: { ...slow, tags: ["MartialArts", "Heavy"] },
        Combo: { martialArt: "snowparting", weapon: "HengBlade", tags: slow.tags, subAction: ["Slow", "Slow"] },
        LateDriver: { castTime: 0, action: [{ type: "trigger", time: 0, value: "LateLight" }] },
        LateLight: {
          ...slow,
          tags: [...(slow.tags ?? []), "Triggered"],
          action: [
            { type: "damage", phyCoef: 1, time: 0.1 },
            { type: "damage", phyCoef: 1, time: 0.8 },
          ],
        },
      },
      effectDefinitions: buffs,
      dots: {},
      eventDefinitions: {},
      innerWayConditions: ["EchoesOfOblivionT6"],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["infernalTwinblades", "mortalRopeDart"],
      initialBuffs: [{ name: "Flamelash", stack: 1 }],
      ...extra,
    })
    const rodentRows = (rows: TimelineRow[]) => rows.filter(row => row.step.skill === "Rodent")
    const build = (
      steps: RotationStep[],
      extra: Partial<TimelineBuildInput> = {},
      roll?: (key: string) => number,
    ): TimelineRow[] => buildRotationTimeline(input(steps, extra), roll)
    for (const id of Object.keys(infernal).filter(id => id.endsWith("Rodent"))) {
      const active = build([castStep("RodentRampage"), castStep(id)])
      assert.equal(rodentRows(active).length, 1, `${id} launches one Rodent before its light attack hits`)
      assert.equal(rowCasting(active, id).effectiveCastTime, 0)
      assert.equal(rodentRows(build([castStep(id)], { initialBuffs: [] })).length, 0, `${id} requires Rampage`)
    }
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
    for (const roll of [undefined, () => 0.5]) {
      const rows = build([castStep("RodentRampage"), ...ids.map(id => castStep(id))], {}, roll)
      assert.equal(
        rodentRows(rows).length,
        11,
        "Nine stages produce nine Rodents plus two T6 extras, in expected and sampled timelines",
      )
      const castRows = rows.filter(row => ids.includes(row.step.skill ?? ""))
      const lastCast = castRows.at(-1)
      assert(lastCast, "Every stage must cast in the rotation.")
      close(lastCast.startTime + lastCast.effectiveCastTime, 6.588, "Interrupt timings determine the rotation endpoint")
      let offset = 0.541
      for (const [index, [duration, firstHit, hitCount]] of [
        [0.43, 0.339, 1],
        [0.47, 0.242, 2],
        [0.6, 0.248, 2],
        [0.529, 0.167, 2],
        [0.357, 0.104, 2],
        [0.5, 0.294, 1],
        [0.8, 0.253, 8],
        [0.96, 0.345, 5],
        [1.401, 0.342, 5],
      ].entries()) {
        const row = castRows[index]
        close(row.startTime, offset, "Each stage starts after the previous interrupt")
        assert.equal(
          row.actions.filter(a => a.type === "damage").length,
          hitCount,
          "Stage keeps every original damage hit: " + row.step.skill,
        )
        const procs = rodentRows(rows).filter(proc => Math.abs(proc.startTime - (offset + firstHit)) < 1e-9)
        assert.equal(procs.length, index === 8 ? 3 : 1, "Rodent fires only on the first hit of each stage")
        assert.ok(
          procs.every(proc => proc.currentMartialArt === "infernalTwinblades"),
          "Triggered Rodent does not switch the active martial art",
        )
        offset += duration
      }
    }
    assert.equal(
      rodentRows(build([castStep("InfernalFlamelashLight5")])).length,
      0,
      "FA5 requires the active Rodent buff",
    )
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), castStep("InfernalFlamelashLight5")], { innerWayConditions: [] }))
        .length,
      1,
      "Without T6 FA5 triggers one Rodent",
    )
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), castStep("InfernalFlamelashLight5")], { initialBuffs: [] })).length,
      1,
      "The T6 extras require Flamelash",
    )
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), castStep("MortalLight"), castStep("MortalLight")])).length,
      2,
      "Mortal triggers every stage",
    )
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), castStep("Slow")])).length,
      0,
      "A multi-hit stage from another art is only one count",
    )
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), castStep("Slow"), castStep("Heavy"), castStep("Slow")])).length,
      1,
      "Other arts trigger every two stages and heavy hits do not advance progress",
    )
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), castStep("Combo")])).length,
      1,
      "Multi-action components count as separate stages",
    )
    const refreshed = build([castStep("RodentRampage"), castStep("Slow"), castStep("RodentRampage"), castStep("Slow")])
    assert.equal(rodentRows(refreshed).length, 1, "Refresh preserves the half-complete counter")
    const applications = refreshed.filter(row => row.kind === "rotation" && row.step.skill === "RodentRampage")
    const secondApplication = applications[1]
    assert(secondApplication, "Both Rampage casts must appear on the timeline.")
    close(secondApplication.startTime, 1.041, "Rodent Rampage has no cooldown")
    const latestSlow = refreshed.find(row => row.step.skill === "Slow" && row.startTime > 1.1)
    assert(latestSlow, "The second Slow cast must appear after the refresh.")
    const latest = Array.from(latestSlow.actionStates[0]?.buffs.values() ?? []).filter(
      buff => buff.name === "RodentRampage",
    )
    assert.equal(latest.length, 1, "Refreshing never duplicates the buff")
    const [onlyLatest] = latest
    assert(onlyLatest, "Refreshing never duplicates the buff")
    assert.equal(onlyLatest.stack, 1, "The buff stays capped at one stack")
    close(onlyLatest.expiresAt ?? 0, 11.582, "Refresh gives ten seconds from the new application time")
    const expired = build([
      castStep("RodentRampage"),
      castStep("Slow"),
      delayStep(10),
      castStep("RodentRampage"),
      castStep("Slow"),
      castStep("Slow"),
    ])
    assert.equal(rodentRows(expired).length, 1, "Expiry resets progress before the next activation")
    assert.ok(rodentRows(expired)[0].startTime > 12, "Only the second new stage triggers after reapplication")
    assert.equal(
      rodentRows(build([castStep("RodentRampage"), delayStep(9.9), castStep("MortalLight")])).length,
      0,
      "Buff is inactive at its exact expiry",
    )
    assert.equal(
      rodentRows(build([castStep("LateDriver"), castStep("RodentRampage"), delayStep(1)])).length,
      0,
      "Applying the buff mid-stage cannot turn a later hit into another stage",
    )

    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBamboocut: 80, maxBamboocut: 80, precision: 1 }
    const enemy = {
      name: "Rodent target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const context: DamageContext = {
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      attunement: emptyAttunementStats,
      skillTags: mortal.Rodent.tags ?? [],
      weapons,
      buffs: [],
      effects: [],
      enemy,
    }
    for (const [distance, coef] of [
      [4.999, 0.348974526316],
      [5, 0.348974526316],
      [11.999, 0.348974526316],
      [12, 0],
      [20, 0],
    ] as Array<[number, number]>) {
      for (const calculate of [
        calculateDamageBreakdown,
        (action: EditableObject, damageContext: DamageContext) =>
          calculateSimulatedDamageBreakdown(action, damageContext, () => 0.5),
      ]) {
        close(
          calculate(skillActions(mortal.Rodent)[0], { ...context, distance }).total,
          calculate({ phyCoef: coef, attrCoef: coef }, context).total,
          "PvE Rodent uses its final nonmatching coefficient below distance 12",
        )
      }
    }
    const bundle = (conditions: string[]): RotationSimulationBundle => ({
      timeline: input([castStep("RodentRampage"), castStep("InfernalFlamelashLight5")], {
        innerWayConditions: conditions,
      }),
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: context.derivedStats,
      enemy,
      attunement: emptyAttunementStats,
      weapons: context.weapons,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const base = calculateRotationBaseline(bundle([]))
    const t6 = calculateRotationBaseline(bundle(["EchoesOfOblivionT6"]))
    const total = (result: RotationSimulationBaseline) =>
      Object.values(result.actionBreakdowns).reduce((sum, entry) => sum + entry.total, 0)
    const rodent = base.baseline.find(entry => entry.context.skillTags.includes("Rodent"))
    assert(rodent?.context, "Base rotation resolves a Rodent attack")
    close(
      total(t6) - total(base),
      2 * calculateDamageBreakdown(rodent.action, rodent.context).total,
      "Central worker calculation adds exactly two Rodent attacks for T6",
    )
  })
})
