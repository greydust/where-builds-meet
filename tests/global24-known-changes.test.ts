import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { combatDefinitionsFor, currentCombatDefinitions } from "@/application/gameData/previews"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import {
  buildRotationTimeline,
  requirementsPass,
  type EditableObject,
  type TimelineBuildInput,
} from "@/calculations/rotationTimeline"
import { effectState } from "@/calculations/trackedEffectState"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"

const preview = combatDefinitionsFor("cn-2.8.5")
const shipped = currentCombatDefinitions
const cast = (skill: string) => ({ type: "skill" as const, skill })
const delay = (duration: number) => ({ type: "event" as const, event: "Delay" as const, duration })

function input(
  definitions: typeof preview,
  steps: TimelineBuildInput["rotation"]["steps"],
  innerWay = "SoaringHigh",
  tier = "T6",
  path = "bamboocutKite" as Parameters<typeof innerWayEffectRulesFor>[2],
): TimelineBuildInput {
  const selected = [{ innerWay, tier }]
  return {
    rotation: { name: "Global 2.4", ping: 0, steps },
    skills: {
      ...Object.assign({}, ...Object.values(definitions.skillMaps)),
      Observe: { castTime: 0, action: [] },
      Refill: { castTime: 0, action: [{ type: "addResource", value: "HeavensWill", amount: 4, time: 0 }] },
      Grant: { castTime: 0, action: [{ type: "apply", target: "self", value: "SpringThunder", stack: 10, time: 0 }] },
      Hit: { castTime: 0.1, tags: ["Light"], action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }] },
    },
    effectDefinitions: definitions.effectDefinitions,
    dots: definitions.dotDefinitions,
    eventDefinitions: {},
    setupEffects: [],
    innerWayConditions: [...innerWayConditionsFor(selected, undefined, path)],
    innerWayRules: innerWayEffectRulesFor(selected, 19, path, definitions),
    weapons: ["heavenwill", "inkwellFan", "namelessSword", "namelessSpear"],
    resourceMaximums: { HeavensWill: 4 },
    initialResources: { HeavensWill: 0 },
  }
}

function simulate(timeline: TimelineBuildInput) {
  const stats = {
    ...emptyStats,
    minPhys: 1000,
    maxPhys: 1000,
    minSilkbind: 100,
    maxSilkbind: 100,
    precision: 1,
    critDmgBonus: 0.5,
  }
  return calculateRotationBaseline({
    timeline,
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    attunement: emptyAttunementStats,
    weapons: timeline.weapons,
    enemy: {
      name: "Boss",
      level: 100,
      defense: 100,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  })
}

describe("Global 2.4 known balance changes", () => {
  it.each([0.2, 0.5])("replaces low-Qi pursuit crit rate with crit damage at %s Qi", qi => {
    const totals = [shipped, preview].map(definitions => {
      const data = input(definitions, [cast("Mark"), cast("Hit")], "ThunderousBloom", "T0", "silkbindJade")
      data.innerWayRules = []
      data.innerWayConditions = []
      data.skills.Mark = { castTime: 0, action: [{ type: "setQi", targetQiRatio: qi, time: 0 }] }
      data.skills.Hit.tags = ["MoonShatterSpring", "Heavy", "Pursuit"]
      data.setupEffects = [
        ...martialArtEffectsForRank(definitions.martialArtDefinitions, ["inkwellFan"], 19),
        { effect: { GuaranteedCrit: true } },
      ]
      const result = simulate(data)
      return {
        total: result.metrics.totalDamage,
        critBonus:
          result.baseline[0].context.derivedStats.effectiveCritDmgBonus +
          (result.baseline[0].context.unconditionalDamageEffects?.critDmgBonus ?? 0) +
          result.baseline[0].context.effects.reduce((sum, effect) => sum + Number(effect.critDmgBonus ?? 0), 0),
      }
    })
    const critFactor = 1 + totals[0].critBonus
    expect(totals[1].total / totals[0].total).toBeCloseTo(qi < 0.3 ? (critFactor + 0.15) / critFactor : 1, 10)
  })

  it("keeps Bone Corrosion active for twenty seconds after Bladebound Thread", () => {
    const data = input(
      preview,
      [cast("BladeboundThreadCancel"), delay(19), cast("Observe"), delay(2), cast("Observe")],
      "EchoesOfOblivion",
      "T0",
      "bamboocutWind",
    )
    data.weapons = ["mortalRopeDart", "infernalTwinblades"]
    data.setupEffects = martialArtEffectsForRank(preview.martialArtDefinitions, ["mortalRopeDart"], 19)
    const rows = buildRotationTimeline(data).filter(row => row.step.skill === "Observe")
    expect(rows.map(row => row.debuffs.has("BoneCorrosion"))).toEqual([true, false])
  })

  it("keeps Jadeware and Mountain's Might Endless Gale alive through their twelve-second interval", () => {
    for (const definitions of [shipped, preview]) {
      const data = input(
        definitions,
        [cast("Mark"), cast("QiankunsLockCancel"), delay(11), cast("Observe")],
        "MountainsMight",
        "T0",
        "bellstrikeSplendor",
      )
      data.skills.Mark = { castTime: 0, action: [{ type: "apply", target: "self", value: "Jadeware", time: 0 }] }
      const observe = buildRotationTimeline(data).find(row => row.step.skill === "Observe")!
      expect(observe.buffs.has("EndlessGale")).toBe(definitions === preview)
      expect(observe.buffs.has("Jadeware")).toBe(definitions === preview)
    }
  })

  it.each(["QiankunsLock", "QiankunsLockCancel"])("requires Nameless Sword to gain Endless Gale from %s", skill => {
    const data = input(preview, [cast(skill), cast("Observe")], "MountainsMight", "T0", "bellstrikeSplendor")
    data.weapons = ["namelessSpear"]
    expect(buildRotationTimeline(data).at(-1)!.buffs.has("EndlessGale")).toBe(false)
    data.weapons.push("namelessSword")
    expect(buildRotationTimeline(data).at(-1)!.buffs.has("EndlessGale")).toBe(true)
  })

  it.each([
    ["T0", 3, 10],
    ["T1", 5, 10],
    ["T4", 5, 20],
  ] as const)("applies Thunderous Bloom %s's stack cap and penetration", (tier, cap, penetration) => {
    const data = input(preview, [cast("Grant"), cast("Hit")], "ThunderousBloom", tier, "silkbindJade")
    const result = simulate(data)
    const row = result.timeline.find(row => row.step.skill === "Hit")!
    expect(row.buffs.get("SpringThunder")?.maxStack).toBe(cap)
    const context = result.baseline.find(hit => hit.context.skillTags.includes("Light"))!.context
    const expectedStats = { ...context.stats, physicalPenetration: penetration, silkbindPenetration: penetration }
    const expected = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, stats: expectedStats, derivedStats: calculateDerivedStats(expectedStats, 0), effects: [] },
    )
    expect(result.metrics.totalDamage).toBeCloseTo(expected.total, 8)
    expect(context.effects.some(effect => effect.hpDMGBonus === 0.15)).toBe(false)
  })

  it.each(["QiImbalance", "BoneCorrosion", "EmptyPeak", "Unmarked"])(
    "refunds Spring Thunder against %s through the existing shared cooldown",
    mark => {
      const data = input(
        preview,
        [cast("Mark"), cast("Hit"), cast("Observe"), cast("Hit"), cast("Observe")],
        "ThunderousBloom",
        "T6",
        "silkbindJade",
      )
      data.skills.Mark = {
        castTime: 0,
        action: [
          { type: "apply", target: "self", value: "SpringThunder", stack: 1, time: 0 },
          { type: "apply", target: "target", value: mark, duration: 10, time: 0 },
        ],
      }
      // Isolate anomaly recognition from the mark's own application route.
      data.effectDefinitions = { ...data.effectDefinitions, [mark]: { duration: 10, maxStack: 1 } }
      const rows = buildRotationTimeline(data).filter(row => row.step.skill === "Observe")
      expect(rows[0].buffs.get("SpringThunder")?.stack ?? 0).toBe(mark === "Unmarked" ? 0 : 1)
      expect(rows[1].buffs.get("SpringThunder")?.stack ?? 0).toBe(mark === "Unmarked" ? 0 : 1)
    },
  )

  it.each(["T4", "T6"])("refunds Heaven's Will once per End cast at %s without the eighteen-second lockout", tier => {
    const steps = Array.from({ length: 3 }, () => [cast("Refill"), cast("VileCondemnedEndHit"), cast("Observe")]).flat()
    const rows = buildRotationTimeline(input(preview, steps, "SoaringHigh", tier))
    expect(rows.filter(row => row.step.skill === "SoaringHighT6Refund")).toHaveLength(3)
    expect(rows.filter(row => row.step.skill === "Observe").map(row => row.resources.HeavensWill)).toEqual(
      tier === "T6" ? [1, 1, 1] : [2, 2, 2],
    )
  })

  it("adds the four-bar T6 debuff after the hit, caps at two stacks and expires after twenty-five seconds", () => {
    const steps = [
      ...Array.from({ length: 3 }, () => [cast("Refill"), cast("VileCondemnedEndHit"), cast("Observe")]).flat(),
      delay(26),
      cast("Observe"),
    ]
    const rows = buildRotationTimeline(input(preview, steps))
    expect(
      rows
        .filter(row => row.step.skill === "Observe")
        .map(row => row.debuffs.get("SoaringHighEndVulnerability")?.stack ?? 0),
    ).toEqual([1, 2, 2, 0])
    const hits = rows.filter(row => row.step.skill === "VileCondemnedEndHit")
    expect(
      hits.map(row => {
        const index = row.actions.findIndex(action => action.type === "damage")
        return row.actionStates[index].debuffs.get("SoaringHighEndVulnerability")?.stack ?? 0
      }),
    ).toEqual([0, 1, 2])
  })

  it("does not grant the End debuff from a three-bar cast or below T6", () => {
    for (const tier of ["T4", "T6"]) {
      const data = input(preview, [cast("VileCondemnedEndHit"), cast("Observe")], "SoaringHigh", tier)
      data.initialResources = { HeavensWill: 3 }
      expect(buildRotationTimeline(data).at(-1)!.debuffs.has("SoaringHighEndVulnerability")).toBe(false)
    }
  })

  it.each([
    ["Light", 39, 0.12, 0.05],
    ["Light", 40, 0.12, 0],
    ["Heavy", 39, 0.02, 0],
  ] as const)("keeps Bone Corrosion bonuses scoped to %s at %s%% Qi", (tag, qi, expectedQi, expectedHp) => {
    const rules = preview.effectDefinitions.BoneCorrosion.effect as EditableObject[]
    const effects = rules
      .filter(rule =>
        requirementsPass(
          rule.requirement,
          effectState([]),
          effectState([]),
          [tag],
          new Set(),
          [],
          {},
          { targetQiPercentage: qi },
        ),
      )
      .map(rule => (rule.effect ?? rule) as EditableObject)
    expect(effects.reduce((sum, effect) => sum + Number(effect.qiDMGBonus ?? 0), 0)).toBeCloseTo(expectedQi, 12)
    expect(effects.reduce((sum, effect) => sum + Number(effect.hpDMGBonus ?? 0), 0)).toBe(expectedHp)
  })
})
