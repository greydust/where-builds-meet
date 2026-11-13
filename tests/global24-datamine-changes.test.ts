import { describe, expect, it } from "vitest"

import { innerWayConditionsFor } from "@/application/characterComposition"
import { combatDefinitionsFor, currentCombatDefinitions } from "@/application/gameData/previews"
import { defaultRotationEntries, rotationRecordForEntry } from "@/application/rotationCatalog"
import { buildRotationTimeline, requirementsPass, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { innerWayDefinitionForSoloLevel } from "@/data/innerWayDefinitions"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"
import type { WeaponId } from "@/types"

const preview = combatDefinitionsFor("cn-2.8.5")
const cast = (skill: string) => ({ type: "skill" as const, skill })
const delay = (duration: number) => ({ type: "event" as const, event: "Delay" as const, duration })
function input(steps: TimelineBuildInput["rotation"]["steps"], definitions = preview): TimelineBuildInput {
  return {
    rotation: { name: "Datamine changes", ping: 0, steps },
    skills: { ...Object.assign({}, ...Object.values(definitions.skillMaps)), Observe: { castTime: 0, action: [] } },
    effectDefinitions: definitions.effectDefinitions,
    dots: definitions.dotDefinitions,
    eventDefinitions: {},
    setupEffects: [],
    innerWayRules: [],
    innerWayConditions: [],
    weapons: ["inkwellFan", "namelessSword", "namelessSpear", "heavenwill", "everspring"],
    initialResources: { Endurance: 100, HeavensWill: 3 },
    resourceMaximums: { Endurance: 100, HeavensWill: 4 },
    resourceRegeneration: { Endurance: 0 },
  }
}

describe("Global 2.4 resolved CN findings", () => {
  it.each([
    ["MoonShatterSpringNormal", 3, 3.1194, 865, 470],
    ["MoonShatterSpringWindrider", 5, 7.54635, 2087.5, 1137.5],
  ] as const)(
    "updates %s without duplicating the old NPC enhancement or changing hit clocks",
    (skill, count, coef, physical, attribute) => {
      const hits = (definitions: typeof preview) => {
        const row = buildRotationTimeline(input([cast(skill)], definitions))[0]
        return row.actions.filter(
          (a, index) =>
            a.type === "damage" &&
            requirementsPass(
              a.requirement,
              row.actionStates[index].buffs,
              row.actionStates[index].debuffs,
              [],
              new Set(),
              [],
              {},
            ),
        )
      }
      const changed = hits(preview)
      const old = hits(currentCombatDefinitions)
      expect(changed).toHaveLength(count)
      expect(changed.map(hit => hit.time)).toEqual(old.map(hit => hit.time))
      for (const field of ["phyCoef", "attrCoef"])
        expect(changed.reduce((sum, hit) => sum + Number(hit[field]), 0)).toBeCloseTo(coef, 10)
      expect(changed.reduce((sum, hit) => sum + Number(hit.phyBonus), 0)).toBeCloseTo(physical, 10)
      expect(changed.reduce((sum, hit) => sum + Number(hit.attrBonus), 0)).toBeCloseTo(attribute, 10)
    },
  )

  it("applies one caster-owned Empty Peak before the first pursuit hit and renews its deadline", () => {
    const data = input([
      cast("MoonShatterSpringNormal"),
      delay(5),
      cast("MoonShatterSpringNormal"),
      delay(9),
      cast("Observe"),
      delay(2),
      cast("Observe"),
    ])
    data.setupEffects = martialArtEffectsForRank(preview.martialArtDefinitions, ["inkwellFan"], 19)
    const rows = buildRotationTimeline(data)
    const pursuits = rows.filter(row => row.step.skill === "MoonShatterSpringNormal")
    const firstHit = pursuits[0].actionStates[0].debuffs.get("EmptyPeak")!
    expect(firstHit.stack).toBe(1)
    expect(firstHit.expiresAt).toBeCloseTo(pursuits[0].startTime + Number(pursuits[0].actions[0].time) + 10, 10)
    const observed = rows.filter(row => row.step.skill === "Observe")
    expect(observed.map(row => row.debuffs.has("EmptyPeak"))).toEqual([true, false])
    expect(pursuits[1].actionStates[0].debuffs.get("EmptyPeak")?.stack).toBe(1)
    expect(preview.effectDefinitions.EmptyPeak.shared).not.toBe(true)
  })

  it.each([
    { weapon: "thundercry" as WeaponId, conStat: "defense" as const, powerStat: "maxPhys" as const, conCap: 60.984 },
    { weapon: "stormbreaker" as WeaponId, conStat: "maxHp" as const, powerStat: "minPhys" as const, conCap: 4620 },
  ])(
    "selects mutually exclusive %s conversions, ties to Power and freezes steady inputs",
    ({ weapon, conStat, powerStat, conCap }) => {
      const effects = martialArtEffectsForRank(preview.martialArtDefinitions, [weapon], 19).filter(
        effect => !("requirement" in effect),
      )
      const sheet = (body: number, power: number) =>
        calculateStatsWithEffects(
          { ...emptyStats, body, power },
          [...effects, { stat: { body: 1000, power: 2000 } }],
          0,
        ).stats
      const con = sheet(500, 100)
      const power = sheet(100, 500)
      const tie = sheet(500, 500)
      expect(con[conStat]).toBeCloseTo(conCap, 9)
      expect(con[powerStat]).toBe(0)
      expect(power[conStat]).toBe(0)
      expect(power[powerStat]).toBeCloseTo(121.968, 9)
      expect(tie[powerStat]).toBe(power[powerStat])
    },
  )

  it.each(["CelestialVigor", "BladesWill", "Volutefit"])(
    "resolves %s's corrected world-level curve through the character pipeline",
    innerWay => {
      const definition = innerWayDefinitionForSoloLevel(preview.innerWayDefinitions[innerWay], 19)
      const result = calculateStatsWithEffects(emptyStats, definition.effect[`${innerWay}T2`].effect ?? [], 0)
      expect(result.rawStats.minVoidAttack).toBe(15.4)
      expect(result.rawStats.maxVoidAttack).toBe(30.8)
    },
  )

  it.each([2, 3])("accelerates the eligible End charge at %s Heaven's Will only", amount => {
    const data = input([cast("VileCondemned")])
    data.initialResources!.HeavensWill = amount
    data.innerWayConditions = [
      ...innerWayConditionsFor([{ innerWay: "SoaringHigh", tier: "T0" }], undefined, "bamboocutKite"),
    ]
    const row = buildRotationTimeline(data)[0]
    expect(row.effectiveCastTime).toBeCloseTo(2.8375 + (amount === 3 ? 0.455 : 0.775), 10)
  })

  it("drains Endurance only during Bubbles' hold and preserves the release timing", () => {
    const rows = buildRotationTimeline(input([cast("DreamwroughtBubbles"), cast("Observe")]))
    const bubbles = rows[0]
    expect(bubbles.effectiveCastTime).toBeCloseTo(0.603 + 1.2, 10)
    expect(bubbles.actions.find(action => action.type === "damage")?.time).toBeCloseTo(0.603 + 0.4002173027694225, 10)
    expect(rows.at(-1)!.resources.Endurance).toBeCloseTo(100 - 0.363 * 14, 9)
    expect(rows.at(-1)!.buffs.has("DreamwroughtHoldDrain")).toBe(false)
  })

  it("Peerless speeds only the charging stage, unlocks three waves without Shield and consumes on release", () => {
    const data = input([cast("DauntingStrikeCancel"), cast("VagrantSword2"), cast("Observe")])
    data.innerWayConditions = [
      ...innerWayConditionsFor(
        [
          { innerWay: "MountainsMight", tier: "T0" },
          { innerWay: "SwordMorph", tier: "T0" },
        ],
        undefined,
        "bellstrikeSplendor",
      ),
    ]
    const rows = buildRotationTimeline(data)
    const sword = rows.find(row => row.step.skill === "VagrantSword2")!
    expect(sword.effectiveCastTime).toBeCloseTo(0.2 + 0.8 + 0.85, 10)
    expect(sword.actions.filter(action => action.type === "damage")).toHaveLength(3)
    expect(rows.at(-1)!.buffs.has("PeerlessStance")).toBe(false)
    data.rotation.targetType = "Boss"
    const boss = buildRotationTimeline(data)
    expect(boss.find(row => row.step.skill === "VagrantSword2")?.effectiveCastTime).toBeCloseTo(0.2 + 1.2 + 0.85, 10)
  })

  it("keeps one 19m opening attachment and anchors battle start to Fleeting Trace's sixth hit", () => {
    const rotation = rotationRecordForEntry(
      defaultRotationEntries.find(entry => entry.id === "mixed-dummy-1-min")!,
      "cn-2.8.5",
    )
    expect(
      rotation.steps.filter(step => step.type === "event" && step.event === "Move" && step.distance === 19),
    ).toHaveLength(1)
    expect(rotation.steps[rotation.start!.step]).toMatchObject({ type: "skill", skill: "SnowpartingSpecial" })
    expect(rotation.start!.action).toBe(5)
  })

  it("applies Seasonal Edge's resolved Spring recovery and Winter cost to explicit branch buffs", () => {
    const spring = input([cast("Grant"), cast("Hit"), cast("Hit"), cast("Observe")])
    spring.initialResources!.Endurance = 50
    spring.skills.Grant = { castTime: 0, action: [{ type: "apply", target: "self", value: "Bloom", time: 0 }] }
    spring.skills.Hit = { castTime: 0.1, action: [{ type: "damage", phyCoef: 1, time: 0 }] }
    expect(buildRotationTimeline(spring).at(-1)!.resources.Endurance).toBe(70)
    const winter = input([cast("Grant"), cast("Spend"), cast("Observe")])
    winter.skills.Grant = { castTime: 0, action: [{ type: "apply", target: "self", value: "Frost", time: 0 }] }
    winter.skills.Spend = {
      castTime: 0.1,
      tags: ["Dodge"],
      action: [{ type: "consumeResource", value: "Endurance", amount: 20, time: 0 }],
    }
    expect(buildRotationTimeline(winter).at(-1)!.resources.Endurance).toBe(70)
  })
})
