import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"

import { describe, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageBreakdown } from "@/calculations/damage"
import type { RotationSimulationBaseline } from "@/calculations/rotationCalculator"
import type { FormulaStatValue, StatEffectValues } from "@/calculations/statEffects"
import type { CharacterStats, EnemyProfile } from "@/types"

import type {
  EditableObject,
  EffectDefinition,
  ResourceState,
  SkillRecord,
  TimelineBuildInput,
  TimelineRow,
  RotationStep,
} from "../src/calculations/rotationTimeline.ts"
import type { StatKey, WeaponId } from "../src/types.ts"
import { withImmediateAttacks } from "./helpers/attack-response-fixtures"
import { assertClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"

// Ported from script/probe/check-martial-art-talents.mjs.
describe("martial-art-talents", () => {
  it("All martial arts: conversions, raw attributes, thresholds, tag isolation, conditional damage, and talent triggers passed", async () => {
    const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8"))
    const close = (actual: number | undefined, expected: number, label: string) =>
      assertClose(actual, expected, 1e-8, label)
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const system = await read<{ initialResources: ResourceState }>("data/system.json")
    const arts = martialArtDefinitions
    const effectDirectories = ["buff", "debuff"]
    const effectFiles = await Promise.all(
      effectDirectories.map(async dir => [dir, await readdir(`data/${dir}`)] as const),
    )
    const effectPayloads: Array<readonly [string, string, Record<string, EffectDefinition>]> = await Promise.all(
      effectFiles.flatMap(([dir, files]) =>
        files.map(async file => [dir, file, await read(`data/${dir}/${file}`)] as const),
      ),
    )
    const effectDefinitions: Record<string, EffectDefinition> = {}
    for (const [, , payload] of effectPayloads) Object.assign(effectDefinitions, payload)
    const baseCases = [
      ["strategicSword", "power", "affinity", 0.000152, 0.04256],
      ["namelessSword", "momentum", "maxPhys", 0.264, 73.92],
      ["heavenquakerSpear", "power", "maxPhys", 0.264, 73.92],
      ["namelessSpear", "momentum", "affinity", 0.000152, 0.04256],
      ...[
        "panaceaFan",
        "phalanxbane",
        "mortalRopeDart",
        "skygrasp",
        "vernalUmbrella",
        "unfettered",
        "rivenTwinblades",
      ].map(w => [w, "agility", "crit", 0.000304, 0.08512]),
      ...[
        "inkwellFan",
        "infernalTwinblades",
        "soulshadeUmbrella",
        "snowparting",
        "heavenwill",
        "everspring",
        "skystrikeGauntlets",
      ].map(w => [w, "agility", "minPhys", 0.264, 73.92]),
    ] as Array<[WeaponId, StatKey, StatKey, number, number]>
    for (const [weapon, source, target, rate, cap] of baseCases) {
      for (const amount of [0, 140, 280, 560]) {
        const effects = martialArtEffectsForRank(arts, [weapon], 13).filter(e => !e.requirement)
        const stats = calculateStatsWithEffects({ ...emptyStats, [source]: amount }, effects, 0, [weapon]).stats
        close(stats[target], Math.min(amount * rate, cap), `${weapon} base-stat conversion`)
      }
    }
    type RawStatConversion = { rawStat?: StatEffectValues; stat?: StatEffectValues; statStage: "talent" }
    const isRawStatConversion = (
      effect: RawStatConversion,
    ): effect is RawStatConversion & { stat: Partial<Record<StatKey, FormulaStatValue>> } =>
      Boolean(effect.rawStat && effect.stat)
    for (const weapon of Object.keys(arts) as WeaponId[]) {
      const effect = martialArtEffectsForRank(arts, [weapon], 13).filter(isRawStatConversion)
      const sheet = calculateStatsWithEffects(emptyStats, effect, 0, [weapon])
      const raw = Object.entries(sheet.rawStats).filter(
        ([key, value]) => value && /^(min|max)(Bellstrike|Stonesplit|Silkbind|Bamboocut)$/.test(key),
      ) as Array<[StatKey, number]>
      for (const amount of [100, 1000]) {
        const base = { ...emptyStats }
        for (const [key] of raw) base[key] = amount
        const scaled = calculateStatsWithEffects(base, effect, 0, [weapon])
        const converted = effect[0]
        assert(converted, "A raw-stat conversion must exist for this martial art.")
        for (const [key, value] of Object.entries(converted.stat)) {
          const target = key as StatKey
          const source = value.formula.source as StatKey
          const maximumInput = source.startsWith("max")
          let rate
          switch (target.endsWith("Penetration")) {
            case true:
              rate = maximumInput ? 0.0336 : 0.0672
              break
            case false:
              rate = maximumInput ? 0.000168 : 0.000336
              break
          }
          close(
            scaled.stats[target],
            Math.min((amount + sheet.rawStats[source]) * rate, key.endsWith("Penetration") ? 22 : 0.11),
            `${weapon} attribute conversion includes raw talent and caps`,
          )
        }
      }
    }
    const talentEffects = (weapon: WeaponId, name: string) =>
      martialArtEffectsForRank(
        {
          [weapon]: {
            talent: [...Array.from({ length: 13 }, () => []), arts[weapon].talent[13].filter(t => t.name === name)],
          },
        },
        [weapon],
        13,
      )
    const outcomeRate = (damage: DamageBreakdown, rate: "critical" | "abrasion") => {
      assert(damage.outcomeRates, "A damaging action must report its outcome rates.")
      return damage.outcomeRates[rate]
    }
    const criticalRate = (damage: DamageBreakdown) => outcomeRate(damage, "critical")
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
    const run = (
      weapon: WeaponId,
      name: string,
      tags: string[],
      options: {
        stats?: Partial<CharacterStats>
        timeline?: Partial<TimelineBuildInput>
        enemy?: Partial<EnemyProfile>
      } = {},
    ): { result: RotationSimulationBaseline; damage: DamageBreakdown } => {
      const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, ...options.stats }
      const result = calculateRotationBaseline({
        timeline: {
          rotation: { name: "Talent behavior", steps: [{ type: "skill", skill: "Hit" }] },
          skills: { Hit: { castTime: 1, tags, action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }] } },
          effectDefinitions,
          eventDefinitions: {},
          dots: {},
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects: talentEffects(weapon, name),
          weapons: [weapon],
          initialResources: system.initialResources,
          ...options.timeline,
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy: { ...enemy, ...options.enemy },
        attunement: emptyAttunementStats,
        weapons: [weapon],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
      return { result, damage: Object.values(result.actionBreakdowns)[0] }
    }
    for (const [weapon, name, resource] of [
      ["skygrasp", "Heaven's Will DMG Boost", "HeavensWill"],
      ["snowparting", "Critical DMG Up", "BladeMomentum"],
    ] as Array<[WeaponId, string, string]>) {
      for (const amount of [0, 1, 1.01]) {
        const stats = { crit: 0.6 }
        const { damage } = run(weapon, name, [], { stats, timeline: { initialResources: { [resource]: amount } } })
        let expected = 1000
        if (amount > 1) expected *= weapon === "skygrasp" ? 1.09 : 1 + criticalRate(damage) * 0.21
        close(damage.physical, expected, `${weapon} strict one-bar threshold`)
      }
    }
    const snowpartingStart = run("snowparting", "Critical DMG Up", [], { stats: { crit: 0.6 } })
    close(
      snowpartingStart.damage.physical,
      1126,
      "System starting Blade Momentum enables Snowparting's 21% Critical DMG bonus at 60% Critical Rate",
    )
    for (const minPhys of [49, 50, 749, 750, 1000]) {
      for (const [weapon, name, tags] of [
        ["inkwellFan", "Heavy Attack Pursuit Enhancement", ["MoonShatterSpring"]],
        ["vernalUmbrella", "Trajectory Calculation Enhancement", ["VernalUmbrella", "Ballistic"]],
      ] as Array<[WeaponId, string, string[]]>) {
        const { damage } = run(weapon, name, tags, { stats: { minPhys, crit: 1 } })
        close(
          damage.physical,
          ((minPhys + 1000) / 2) * (1 + criticalRate(damage) * Math.min(15, Math.floor(minPhys / 50)) * 0.024),
          `${weapon} 50-point damage steps`,
        )
        close(
          run(weapon, name, ["Other"], { stats: { minPhys, crit: 1 } }).damage.physical,
          (minPhys + 1000) / 2,
          `${weapon} unrelated attacks`,
        )
      }
    }
    for (const status of [undefined, "Immobilized", "Airborne"]) {
      const { damage } = run("vernalUmbrella", "Trajectory Skill Enhancement", ["VernalUmbrella", "Ballistic"], {
        enemy: { physicalResistance: 20 },
        timeline: { initialDebuffs: status ? [{ name: status, stack: 1 }] : [] },
      })
      close(damage.physical, status ? 950 : 850, "Ballistic resistance ignores 5 or 15 points")
    }
    for (const qi of [29.99, 30]) {
      const { damage } = run("inkwellFan", "Low Qi Follow-up Enhancement", ["MoonShatterSpring"], {
        timeline: {
          rotation: {
            name: "Low Qi",
            steps: [
              { type: "event", event: "Qi", before: { action: "start" }, targetQiRatio: qi / 100 },
              { type: "skill", skill: "Hit" },
            ],
          },
          eventDefinitions: { Qi: { action: [{ type: "setQi", time: 0 }] } },
        },
      })
      close(criticalRate(damage), qi < 30 ? 0.3 : 0, "Low-Qi critical chance threshold")
      close(damage.physical, qi < 30 ? 1080 : 1000, "Low-Qi HP damage threshold")
    }
    for (const [weapon, name, tags] of [
      ["thundercry", "Charge Calculation Enhancement", ["ThundercryBlade", "Charged"]],
      ["heavenwill", "Perfect Dodge Enhancement", ["VileCondemned"]],
    ] as Array<[WeaponId, string, string[]]>) {
      close(
        outcomeRate(run(weapon, name, tags, { stats: { precision: 0.7 } }).damage, "abrasion"),
        0,
        `${weapon} supported no-Abrasion conversion`,
      )
      close(
        outcomeRate(run(weapon, name, ["Other", "Charged"], { stats: { precision: 0.7 } }).damage, "abrasion"),
        0.3,
        `${weapon} no cross-weapon conversion`,
      )
    }
    close(
      criticalRate(
        run("thundercry", "Charge Critical Hit Enhancement", ["ThundercryBlade", "Charged"], {
          stats: { maxHp: 90000 },
        }).damage,
      ),
      0.24,
      "Thundercry fixed and scaling Critical Rate",
    )
    close(
      run("thundercry", "Charge Calculation Enhancement", ["ThundercryBlade", "Charged"], {
        stats: { maxHp: 150000, crit: 1 },
      }).damage.physical,
      1144.8,
      "Thundercry effective attack and Critical DMG",
    )
    close(
      run("unfettered", "Soulbreak Critical Boost", [], {
        stats: { crit: 0.6 },
        timeline: { initialDebuffs: [{ name: "Soulbreak", stack: 1 }] },
      }).damage.physical,
      1162 * 1.05,
      "Soulbreak conditional critical damage and applier damage amplification",
    )
    close(
      run("phalanxbane", "Iron Guards Penetration Up", [], {
        timeline: { initialBuffs: [{ name: "IronGuard", stack: 1 }] },
      }).damage.physical,
      1144.8,
      "Iron Guard penetration stacks with its existing 8% damage bonus",
    )
    close(
      run("phalanxbane", "Iron Guards Penetration Up", []).damage.physical,
      1000,
      "Iron Guard absence removes bonus",
    )
    const timeline = (
      setupEffects: EditableObject[],
      steps: RotationStep[],
      skills: Record<string, SkillRecord>,
      extra: Partial<TimelineBuildInput> = {},
    ): TimelineRow[] =>
      buildRotationTimeline({
        rotation: { name: "Talent triggers", steps },
        skills: withImmediateAttacks(skills),
        effectDefinitions,
        eventDefinitions: {},
        dots: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects,
        weapons: [],
        ...extra,
      })
    const observe = { castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }] }
    const startingResourceRows = timeline(
      [],
      [castStep("Observe"), delayStep(60), castStep("Observe")],
      { Observe: observe },
      { initialResources: system.initialResources },
    ).filter(row => row.step.skill === "Observe")
    for (const row of startingResourceRows) {
      close(row.actionStates[0].resources.BladeMomentum, 4, "Blade Momentum stays at four without resource actions")
      close(row.actionStates[0].resources.BattleWill, 4, "Battle Will stays at four without resource actions")
    }
    const rows = timeline(
      [
        ...talentEffects("rivenTwinblades", "Increased Binge Point Gain"),
        ...talentEffects("skystrikeGauntlets", "Inebriate Dodge Enhancement"),
      ],
      [castStep("Carouse"), castStep("Dodge"), castStep("Dodge"), delayStep(1), castStep("Dodge"), castStep("Observe")],
      {
        Carouse: { castTime: 0, tags: ["HeroesBlood"], action: [] },
        Dodge: { castTime: 0, tags: ["PerfectDodge"], action: [] },
        Observe: observe,
      },
    )
    const final = rows.findLast(r => r.step.skill === "Observe")
    assert(final, "The rotation must observe at least once.")
    const carouse = final.buffs.get("Carouse")
    assert(carouse, "Observing must leave the Carouse buff applied.")
    close(final.resources.Binge, 10, "Carouse dodge gain has a shared one-second cooldown")
    close(carouse.expiresAt, 20, "Carouse lasts twenty seconds")
    const soulRows = timeline(
      talentEffects("heavenquakerSpear", "Damage Over Time Enhancement"),
      [...Array.from({ length: 6 }, () => castStep("Charged")), castStep("Observe")],
      { Charged: { ...observe, tags: ["HeavenQuakerSpear", "Charged"] }, Observe: observe },
    )
    const lastSoulRow = soulRows.at(-1)
    assert(lastSoulRow, "The rotation must produce at least one row.")
    const soulShaken = lastSoulRow.debuffs.get("SoulShaken")
    assert(soulShaken, "The Heavenquaker trigger must apply Soul-Shaken.")
    close(soulShaken.stack, 5, "Heavenquaker trigger applies capped Soul-Shaken stacks")
    for (const [grace, baseBonus] of [
      ["FloatingGrace", 0.1],
      ["FloatingGraceDeluge", 0.24],
    ] as Array<[string, number]>) {
      const graceSkills = {
        Grace: {
          castTime: 0,
          action: [{ type: "apply", target: "self", value: grace, duration: 12, reapply: true, time: 0 }],
        },
        Exhaust: {
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Exhausted", duration: 1, reapply: true, time: 0 }],
        },
        LongExhaust: {
          castTime: 0,
          action: [{ type: "apply", target: "target", value: "Exhausted", duration: 30, reapply: true, time: 0 }],
        },
        ConsumeGrace: {
          castTime: 0,
          action: [{ type: "consume", target: "self", value: grace, stack: "all", time: 0 }],
        },
        Observe: observe,
      }
      const graceSteps = [
        castStep("Grace"),
        castStep("Observe"),
        castStep("Exhaust"),
        castStep("Observe"),
        delayStep(1.1),
        castStep("Observe"),
        castStep("LongExhaust"),
        delayStep(5.1),
        castStep("Observe"),
        castStep("ConsumeGrace"),
        castStep("Observe"),
        castStep("Grace"),
        castStep("Observe"),
        delayStep(12.1),
        castStep("Observe"),
      ]
      const graceRun = (enabled: boolean, extra: Partial<TimelineBuildInput> = {}): RotationSimulationBaseline =>
        run("soulshadeUmbrella", "Buff Enhancement", [], {
          timeline: {
            rotation: { name: "Floating Grace exhaustion conditions", steps: graceSteps },
            skills: graceSkills,
            setupEffects: enabled ? talentEffects("soulshadeUmbrella", "Buff Enhancement") : [],
            ...extra,
          },
        }).result
      const ordinary = graceRun(false)
      const talented = graceRun(true)
      const damage = (result: RotationSimulationBaseline) =>
        result.baseline
          .filter(entry => entry.action.type === "damage")
          .map(entry => {
            assert(entry.id, "A resolved damaging action must have an id.")
            return result.actionBreakdowns[entry.id].physical
          })
      const ordinaryDamage = damage(ordinary)
      const talentedDamage = damage(talented)
      assert.equal(talentedDamage.length, 7)
      for (let index = 0; index < talentedDamage.length; index++) {
        const bonusActive = [1, 3, 5].includes(index)
        close(
          talentedDamage[index],
          ordinaryDamage[index] * (bonusActive ? (1 + baseBonus + 0.05) / (1 + baseBonus) : 1),
          `${grace}: Exhausted and Floating Grace must overlap; bonus follows consumption, expiry and reapplication`,
        )
      }
      assert(
        talented.timeline.every(row => !row.buffs.has("SoulshadeExhaustedBoost")),
        "The talent must not create a separate visible buff",
      )
      const permanent = {
        rotation: { name: "Permanent Floating Grace", steps: [castStep("Observe")] },
        initialBuffs: [{ name: grace, stack: 1, persistent: true }],
        initialDebuffs: [{ name: "Exhausted", stack: 1 }],
      }
      close(
        damage(graceRun(true, permanent))[0],
        (damage(graceRun(false, permanent))[0] * (1 + baseBonus + 0.05)) / (1 + baseBonus),
        `${grace}: a supplied permanent buff receives the equipped Soulshade talent without needing a cast`,
      )
    }
  })
})
