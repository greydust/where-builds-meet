import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationSimulationBaseline } from "@/calculations/rotationCalculator"
import type {
  EditableObject,
  EffectDefinition,
  RotationStep,
  SkillRecord,
  TimelineBuildInput,
  TimelineRow,
} from "@/calculations/rotationTimeline"
import type { CharacterStats } from "@/types"

import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { assertClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"
import { rowCasting } from "./helpers/timelineRows"

/** The shipped talent table, narrowed to the rank the spec drives. */
type MartialArtTalentInput = {
  name: string
  weapon: string
  talent: Array<Array<{ name: string; effect?: EditableObject[] }>>
}

/** The effect the named rank-13 talent declares. */
function talentEffect(talent: MartialArtTalentInput, name: string): EditableObject[] {
  const entry = talent.talent[13]?.find(candidate => candidate.name === name)
  assert(entry?.effect, `Expected rank 13 to declare the ${name} talent.`)
  return entry.effect
}

/** The last row a rotation produced, which the cooldown and charge checks time. */
function lastRow(rows: readonly TimelineRow[]): TimelineRow {
  const row = rows.at(-1)
  assert(row, "Expected the rotation to produce at least one row.")
  return row
}

/** The single timeline row the spec reads for the ordered step at `index`. */
function rowWithIndex(rows: readonly TimelineRow[], index: number): TimelineRow {
  const row = rows.find(candidate => candidate.rotationIndex === index)
  assert(row, `Expected a timeline row for rotation step ${index}.`)
  return row
}

// Ported from script/probe/check-infernal-twinblades-talents.mjs.
describe("infernal-twinblades-talents", () => {
  it("Infernal Twinblades: rank-13 stat scaling, conditional Flamelash damage, status lifecycle, attribute channels, dodge durations, and charge reset passed", async () => {
    const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8"))
    const close = (actual: number | undefined, expected: number, message: string) =>
      assertClose(actual, expected, 1e-8, message)

    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const general = await readJson<Record<string, SkillRecord>>("data/skill/general.json")
    const talent = await readJson<MartialArtTalentInput>("data/martial-art/infernal-twinblades.json")
    const effects: Record<string, EffectDefinition> = {
      ...(await readJson<Record<string, EffectDefinition>>("data/buff/bamboocut-kite.json")),
      ...(await readJson<Record<string, EffectDefinition>>("data/buff/bamboocut-wind.json")),
      ...(await readJson<Record<string, EffectDefinition>>("data/buff/mystic.json")),
      Existing: { duration: 10 },
      Direct: { duration: 10 },
      Indirect: { duration: 10 },
      Listener: { duration: 10 },
      Permanent: {},
      NoRefresh: { duration: 10, refresh: false, maxStack: 5 },
      Enemy: { duration: 10 },
    }
    const apply = (value: string, extra: EditableObject = {}): EditableObject => ({
      type: "apply",
      target: "self",
      value,
      time: 0,
      ...extra,
    })
    const skills = {
      ...general,
      // Deliberately long, ordinary cooldown isolates the reset from future charge semantics.
      AddledMind: { castTime: 0, cooldown: 100, action: [] },
      Observe: { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
      Ordinary: { castTime: 0, action: [apply("Existing"), apply("Direct"), apply("NoRefresh")] },
      ProbeDodge: {
        castTime: 0,
        tags: ["PerfectDodge"],
        action: [
          apply("Direct", { duration: 5 }),
          apply("Permanent"),
          apply("NoRefresh"),
          apply("Enemy", { target: "target" }),
          { type: "trigger", value: "Helper", time: 0 },
        ],
      },
      Helper: {
        castTime: 0,
        damageGroup: { id: "SeparateOwner", name: "Separate Owner" },
        action: [{ type: "trigger", value: "NestedHelper", time: 1 }],
      },
      NestedHelper: {
        castTime: 0,
        tags: ["Triggered"],
        action: [apply("Indirect"), { type: "damage", phyCoef: 1, time: 0 }],
      },
      Extend: {
        castTime: 0,
        tags: ["PerfectDodge"],
        action: [{ type: "extend", target: "self", value: "Direct", duration: 2, time: 0 }],
      },
      EmptyDodge: { castTime: 0, tags: ["PerfectDodge"], action: [] },
    }
    const setupEffects = martialArtEffectsForRank({ infernalTwinblades: talent }, ["infernalTwinblades"], 13)
    const build = (
      steps: RotationStep[],
      extra: Partial<TimelineBuildInput> = {},
      procRoll?: (key: string) => number,
    ): TimelineRow[] =>
      buildRotationTimeline(
        {
          rotation: { name: "Infernal Twinblades talent probe", steps },
          skills: withImmediateAttacks(skills),
          effectDefinitions: effects,
          eventDefinitions: {},
          dots: {},
          innerWayConditions: ["Etherwrath4P", "BreakingPointT6", "Mystery"],
          innerWayRules: [],
          setupEffects,
          weapons: ["infernalTwinblades"],
          ...extra,
        },
        procRoll,
      )
    const observed = (rows: TimelineRow[]) => rows.filter(row => row.step.skill === "Observe")
    const buff = (row: TimelineRow | undefined, name: string) => {
      assert(row, "Expected the probe to produce an Observe row.")
      return row.buffs.get(name)
    }
    /** The expiry a buff must carry, in seconds from now. */
    const expiresAtOf = (row: TimelineRow | undefined, name: string) => {
      const tracked = buff(row, name)
      assert(tracked, `Expected ${name} to be applied to the observed cast.`)
      return tracked.expiresAt
    }
    /** The expiry a debuff must carry; target-applied effects land in the debuff map. */
    const debuffExpiresAtOf = (row: TimelineRow | undefined, name: string) => {
      assert(row, "Expected the probe to produce an Observe row.")
      const tracked = row.debuffs.get(name)
      assert(tracked, `Expected ${name} to be applied to the target.`)
      return tracked.expiresAt
    }
    /** The declared duration of a shipped effect, which the scaling compares against. */
    const durationOf = (name: string) => {
      const duration = effects[name].duration
      assert(typeof duration === "number", `Expected ${name} to declare a duration.`)
      return duration
    }

    for (const dodge of ["PerfectDodge", "PerfectDodgeCancel"]) {
      for (const enabled of [false, true]) {
        const [row] = observed(
          build([castStep(dodge), castStep("Observe")], { setupEffects: enabled ? setupEffects : [] }),
        )
        for (const name of ["Etherwrath", "Disintegration", "MysteryDMGBoost"]) {
          close(expiresAtOf(row, name), durationOf(name) * (enabled ? 1.4 : 1), `${dodge} ${name} duration`)
        }
      }
    }
    for (const procRoll of [undefined, () => 0.25]) {
      const rows = build(
        [
          castStep("Ordinary"),
          delayStep(1),
          castStep("ProbeDodge"),
          delayStep(1),
          castStep("Observe"),
          castStep("Extend"),
          castStep("Observe"),
          delayStep(11),
          castStep("Observe"),
        ],
        {
          setupEffects: [
            ...setupEffects,
            {
              trigger: {
                event: "damage",
                requirement: [{ target: "skillTag", value: "Triggered" }],
                action: apply("Listener"),
              },
            },
          ],
        },
        procRoll,
      )
      const [first, extended, later] = observed(rows)
      close(expiresAtOf(first, "Direct"), 8, "Explicit application duration is scaled once")
      close(
        expiresAtOf(first, "Indirect"),
        16,
        "Nested triggered buff inherits original cast tags across damage ownership",
      )
      close(expiresAtOf(first, "Listener"), 16, "On-damage trigger application inherits the same buff source")
      close(expiresAtOf(first, "Existing"), 10, "Unrelated active buff is unchanged")
      close(expiresAtOf(first, "NoRefresh"), 10, "Non-refreshing stack application preserves expiry")
      assert.equal(buff(first, "Permanent")?.expiresAt, undefined)
      close(debuffExpiresAtOf(first, "Enemy"), 11, "Debuffs are unchanged")
      close(expiresAtOf(extended, "Direct"), 10, "Explicit extensions are not multiplied")
      assert(!buff(later, "Existing") && !buff(later, "Direct"), "Ordinary expirations still remove buffs")
      assert(
        buff(later, "Indirect") && buff(later, "Listener"),
        "Extended indirect buffs remain active past base expiry",
      )
      const nestedTags = rowCasting(rows, "NestedHelper").skill?.tags
      assert.deepEqual(nestedTags, ["Triggered"], "Buff origin does not alter damage tags")
    }

    const resetRows = build([
      castStep("AddledMind"),
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
      delayStep(29),
      castStep("PerfectDodge"),
      castStep("Observe"),
      delayStep(0.5),
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
      delayStep(1),
      castStep("PerfectDodgeCancel"),
      castStep("AddledMind"),
    ])
    assert.deepEqual(
      resetRows.filter(row => row.step.skill === "AddledMind").map(row => row.startTime),
      [0, 0, 30, 130],
      "Reset is immediate, shared across dodge variants, and available exactly at 30 seconds",
    )
    close(
      expiresAtOf(observed(resetRows)[0], "Etherwrath"),
      29 + durationOf("Etherwrath") * 1.4,
      "Duration bonus remains active during reset cooldown",
    )
    const unenhanced = build([castStep("AddledMind"), castStep("PerfectDodgeCancel"), castStep("AddledMind")], {
      setupEffects: [],
    })
    assert.equal(lastRow(unenhanced).startTime, 100, "Without talent a dodge cannot reset the skill")
    const empty = build([castStep("AddledMind"), castStep("EmptyDodge"), castStep("AddledMind")])
    assert.equal(lastRow(empty).startTime, 0, "Success trigger restores a charge when the incoming hit is avoided")
    assert.deepEqual(
      rowCasting(empty, "EmptyDodge").actions,
      [{ type: "takeDamage", damage: 0, time: 0 }],
      "Only the fixture incoming hit is displayed; the response event stays internal",
    )
    const waiting = build([castStep("AddledMind"), castStep("AddledMind")], {
      skills: withImmediateAttacks({
        ...skills,
        AddledMind: { ...skills.AddledMind, action: [{ type: "trigger", value: "DelayedDodge", time: 0 }] },
        DelayedDodge: { castTime: 0, action: [{ type: "trigger", value: "PerfectDodgeCancel", time: 5 }] },
      }),
    })
    assert.equal(rowWithIndex(waiting, 1).startTime, 5, "Triggered dodge wakes a pending cast before its old cooldown")

    const unconditional = setupEffects.filter(effect => !effect.requirement)
    for (const [agility, bonus] of [
      [0, 0],
      [140, 36.96],
      [280, 73.92],
      [560, 73.92],
    ]) {
      const sheet = calculateStatsWithEffects({ ...emptyStats, agility, minPhys: 100, maxPhys: 1000 }, unconditional, 0)
      close(sheet.stats.minPhys, 100 + bonus, "Agility talent scales and caps at the datamined rate")
    }
    for (const [baseMin, penetration] of [
      [0, 6.5856],
      [102, 13.44],
      [230, 22],
      [500, 22],
    ]) {
      const sheet = calculateStatsWithEffects(
        { ...emptyStats, minBamboocut: baseMin, maxBamboocut: 1000 },
        [...unconditional, { statStage: "food", effectiveStat: { minBamboocut: 100 } }],
        0,
        ["infernalTwinblades"],
      )
      close(
        sheet.stats.bamboocutPenetration,
        penetration,
        "Penetration includes flat talents and excludes effective food",
      )
    }
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const calculate = (
      minPhys: number,
      active: boolean,
      extra: { stats?: Partial<CharacterStats>; timeline?: Partial<TimelineBuildInput> } = {},
    ): RotationSimulationBaseline => {
      const stats = { ...emptyStats, agility: 280, minPhys, maxPhys: 2000, precision: 1, crit: 1, ...extra.stats }
      return calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Flamelash",
            steps: [
              ...(active
                ? [
                    {
                      type: "event",
                      event: "Buff",
                      before: { action: "start" },
                      buff: "Flamelash",
                    } satisfies RotationStep,
                  ]
                : []),
              castStep("Hit"),
            ],
          },
          skills: {
            Hit: {
              castTime: 1,
              tags: ["MartialArts", "InfernalTwinblades"],
              action: [{ type: "damage", phyCoef: 1, time: 0 }],
            },
          },
          eventDefinitions: { Buff: { action: [{ type: "apply", target: "self", time: 0 }] } },
          dots: {},
          initialResources: { Hellfire: 80 },
          // Isolate rank-13 talents from the separately tested base Flamelash bonuses.
          effectDefinitions: { ...effects, Flamelash: { ...effects.Flamelash, effect: [] } },
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects,
          weapons: ["infernalTwinblades"],
          ...extra.timeline,
        },
        startAnchor: { rowId: active ? "rotation-1" : "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        attunement: emptyAttunementStats,
        weapons: ["infernalTwinblades"],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
    }
    for (const [minPhys, bonus] of [
      [0, 0.05],
      [375, 0.175],
      [750, 0.3],
      [1000, 0.3],
    ]) {
      const ordinary = calculate(minPhys, false)
      const enhanced = calculate(minPhys, true)
      const ordinaryBreakdown = Object.values(ordinary.actionBreakdowns)[0]
      assert(ordinaryBreakdown?.outcomeRates, "A damaging action must report its outcome rates.")
      const criticalRate = ordinaryBreakdown.outcomeRates.critical
      close(
        enhanced.metrics.totalDamage - ordinary.metrics.totalDamage,
        ((minPhys + 73.92 + 2000) / 2) * criticalRate * bonus,
        "Flamelash gates critical damage and scales from raw attack before the Agility talent",
      )
    }
    close(
      calculate(750, true, { stats: { crit: 0 } }).metrics.totalDamage,
      calculate(750, false, { stats: { crit: 0 } }).metrics.totalDamage,
      "Flamelash does not increase normal-hit damage",
    )
    const lifecycle = calculate(750, false, {
      timeline: {
        rotation: {
          name: "Flamelash lifecycle",
          steps: [
            castStep("Hit"),
            castStep("Enter"),
            castStep("Hit"),
            delayStep(1),
            castStep("Hit"),
            castStep("Enter"),
            castStep("Hit"),
            castStep("Exit"),
            castStep("Hit"),
          ],
        },
        skills: {
          Hit: { castTime: 1, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
          Enter: { castTime: 0, action: [apply("Flamelash", { duration: 2 })] },
          Exit: {
            castTime: 0,
            action: [{ type: "consume", target: "self", value: "Flamelash", stack: "all", time: 0 }],
          },
        },
      },
    })
    const damage = lifecycle.timeline
      .filter(row => row.step.skill === "Hit")
      .map(row => lifecycle.actionBreakdowns[`${row.id}:0`].total)
    assert(damage[1] > damage[0] && damage[3] > damage[0], "Existing status applications enable Flamelash damage")
    close(damage[2], damage[0], "Expiration removes the bonus at its exact boundary")
    close(damage[4], damage[0], "Consumption removes the bonus before the following hit")

    const attributeStats = {
      ...emptyStats,
      precision: 1,
      minBellstrike: 100,
      maxBellstrike: 100,
      minStonesplit: 100,
      maxStonesplit: 100,
      minSilkbind: 100,
      maxSilkbind: 100,
      minBamboocut: 100,
      maxBamboocut: 100,
    }
    const attributeDamage = calculateDamageBreakdown(
      { phyCoef: 0, attrCoef: 1 },
      {
        stats: attributeStats,
        derivedStats: calculateDerivedStats(attributeStats, 0, {}, ["infernalTwinblades"]),
        enemy,
        attunement: emptyAttunementStats,
        skillTags: ["MartialArts", "InfernalTwinblades"],
        weapons: ["infernalTwinblades"],
        buffs: [],
        effects: talentEffect(talent, "Attr. Attack DMG Up"),
      },
    )
    close(attributeDamage.bellstrike, 100, "Non-primary attribute damage is retained")
    close(attributeDamage.stonesplit, 100, "Stonesplit damage remains a normal attribute channel")
    close(attributeDamage.silkbind, 100, "Silkbind damage remains a normal attribute channel")
    close(attributeDamage.bamboocut, 150, "Bamboocut receives exactly one 50% primary multiplier")
  })
})
