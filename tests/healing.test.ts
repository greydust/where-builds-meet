import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import type { RotationSimulationBaseline, RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { TimelineBuildInput } from "@/calculations/rotationTimeline"

import mysticBuffsJson from "../data/buff/mystic.json"
const mysticBuffs = asEffectDefinitions(mysticBuffsJson)
import delugeBuffsJson from "../data/buff/silkbind-deluge.json"
const delugeBuffs = asEffectDefinitions(delugeBuffsJson)
import royalRemedy from "../data/innerway/royal-remedy.json"
import mysticSkillsJson from "../data/skill/mystic.json"
const mysticSkills = asSkillRecords(mysticSkillsJson)
import panaceaFanSkillsJson from "../data/skill/panacea-fan.json"
const panaceaFanSkills = asSkillRecords(panaceaFanSkillsJson)
import soulshadeUmbrellaSkillsJson from "../data/skill/soulshade-umbrella.json"
const soulshadeUmbrellaSkills = asSkillRecords(soulshadeUmbrellaSkillsJson)
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateHealingAttackSnapshot, calculateHealingBreakdown } from "../src/calculations/healing"
import {
  calculateRotationBaseline,
  calculateRotationSimulation,
  calculateSimulatedRotationRun,
} from "../src/calculations/rotationCalculator"
import { buildRotationTimeline, mergeCalculatedTimelineState } from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { isClose } from "./helpers/floatEquality"
import { castStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowCasting } from "./helpers/timelineRows"
import { rowWithId } from "./helpers/timelineRows"

// Ported from script/probe/check-healing.mjs. The probe stops at the first
// failure, so this port keeps the same fail-fast order inside one test.
const closeTo = (actual: number | undefined, expected: number) => isClose(actual, expected, 1e-8)

describe("healing", () => {
  it("verifies healing formula, self-HP restoration, World to Sword overheal, periodic healing, Royal Remedy, totals, HPS, and breakdown sorting", () => {
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      minSilkbind: 50,
      maxSilkbind: 50,
      silkbindPenetration: 10,
      silkbindHealingBonus: 0.1,
      criticalHealingBonus: 0.5,
      precision: 1,
      crit: 0.2,
      directCrit: 0.1,
    }
    const enemy = {
      name: "Healing probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const derivedStats = calculateDerivedStats(stats, 0)
    const martialStats = { ...stats, allMartialArts: 0.05, fanDmgBoost: 0.06, umbrellaDmgBoost: 0.07 }
    const action = { type: "heal", phyCoef: 1, silkbindCoef: 1, phyBonus: 10, attrBonus: 20 }
    const context: DamageContext = {
      stats: martialStats,
      derivedStats: calculateDerivedStats(martialStats, 0),
      enemy,
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      skillTags: ["Heal", "Heavy", "MartialArts", "Fan", "PanaceaFan"],
      buffs: [],
      effects: [{ physicalPenetration: 10 }, { healingBonus: 0.1 }, { criticalHealingBonus: 0.2 }],
      attunement: { ...emptyAttunementStats, physicalPenetration: 20, panaceaMartialHealingBoost: 0.1 },
    }
    const healing = calculateHealingBreakdown(action, context)
    const physicalOnlyHealing = calculateHealingBreakdown({ type: "heal", phyCoef: 1 }, context)
    const silkbindOnlyHealing = calculateHealingBreakdown({ type: "heal", silkbindCoef: 1 }, context)
    const combinedHealing = calculateHealingBreakdown(
      { type: "heal", phyCoef: 1, silkbindCoef: 2, attrCoef: 100 },
      context,
    )
    expect(
      closeTo(combinedHealing.total, physicalOnlyHealing.total + 2 * silkbindOnlyHealing.total),
      "Healing must use independent Physical and Silkbind coefficients and ignore attrCoef.",
    ).toBeTruthy()
    const physical = 110 * 1.15
    const silkbind = 70 * 1.05 * 1.1
    const criticalRate = 0.3
    const expected = (physical + silkbind) * (1 + criticalRate * 0.7) * 1.21
    expect(
      closeTo(healing.total, expected),
      `Healing must apply both attack channels, penetration, general healing, All Martial Arts, and matching Art of Fan bonuses (${JSON.stringify(healing)} !== ${expected}).`,
    ).toBeTruthy()
    const panaceaHeavyAttunement = calculateHealingBreakdown(action, {
      ...context,
      attunement: { ...context.attunement, panaceaHealingSkillBoost: 0.06 },
    })
    expect(
      closeTo(panaceaHeavyAttunement.total, expected * (1.27 / 1.21)),
      "Panacea Fan Healing Skill Boost must add General Healing Bonus to Fan Heavy healing.",
    ).toBeTruthy()
    const panaceaSpecialAttunement = calculateHealingBreakdown(action, {
      ...context,
      skillTags: ["Heal", "MartialArts", "Special", "Fan", "PanaceaFan"],
      attunement: { ...context.attunement, panaceaSpecialHealingBoost: 0.06, panaceaHealingSkillBoost: 0.06 },
    })
    const panaceaSpecialBaseline = calculateHealingBreakdown(action, {
      ...context,
      skillTags: ["Heal", "MartialArts", "Special", "Fan", "PanaceaFan"],
    })
    expect(
      closeTo(panaceaSpecialAttunement.total / panaceaSpecialBaseline.total, 1.27 / 1.21),
      "Panacea Fan Special Skill Healing Boost must match Special healing while the Heavy-only boost remains inactive.",
    ).toBeTruthy()
    const soulshadeSpecialBaseline = calculateHealingBreakdown(action, {
      ...context,
      skillTags: ["Heal", "MartialArts", "Special", "Umbrella", "SoulshadeUmbrella"],
      attunement: emptyAttunementStats,
    })
    const soulshadeSpecialAttunement = calculateHealingBreakdown(action, {
      ...context,
      skillTags: ["Heal", "MartialArts", "Special", "Umbrella", "SoulshadeUmbrella"],
      attunement: { ...emptyAttunementStats, soulshadeSpecialHealingBoost: 0.06 },
    })
    expect(
      closeTo(soulshadeSpecialAttunement.total / soulshadeSpecialBaseline.total, 1.28 / 1.22),
      "Soulshade Umbrella Special Skill Healing Boost must add General Healing Bonus only to matching Special healing.",
    ).toBeTruthy()
    const silkbindPenetrationHealing = calculateHealingBreakdown(action, {
      ...context,
      stats: { ...context.stats, silkbindPenetration: context.stats.silkbindPenetration + 10 },
    })
    const formlessPenetrationHealing = calculateHealingBreakdown(action, {
      ...context,
      attunement: { ...context.attunement, formlessPenetration: 10 },
    })
    const expectedSilkbindPenetrationIncrease = 70 * 0.05 * 1.1 * (1 + criticalRate * 0.7) * 1.21
    expect(
      closeTo(silkbindPenetrationHealing.total - healing.total, expectedSilkbindPenetrationIncrease) &&
        closeTo(formlessPenetrationHealing.total - healing.total, expectedSilkbindPenetrationIncrease),
      "Native Silkbind Penetration and Formless Penetration converted by a Silkbind path must boost Silkbind healing equally.",
    ).toBeTruthy()
    const nonSilkbindFormlessHealing = calculateHealingBreakdown(action, {
      ...context,
      weapons: ["thundercry", "stormbreaker"],
      attunement: { ...context.attunement, formlessPenetration: 10 },
    })
    expect(
      closeTo(nonSilkbindFormlessHealing.total, healing.total),
      "Formless Penetration converted to a non-Silkbind primary attribute must not boost Silkbind healing.",
    ).toBeTruthy()
    const umbrellaHealing = calculateHealingBreakdown(action, {
      ...context,
      skillTags: ["Heal", "MartialArts", "Umbrella", "SoulshadeUmbrella"],
    })
    const umbrellaExpected = (physical + silkbind) * (1 + criticalRate * 0.7) * 1.22
    expect(
      closeTo(umbrellaHealing.total, umbrellaExpected),
      `Umbrella healing must apply All Martial Arts and Art of Umbrella instead of Art of Fan (${JSON.stringify(umbrellaHealing)} !== ${umbrellaExpected}).`,
    ).toBeTruthy()
    expect(
      closeTo(healing.criticalRate, criticalRate) && closeTo(healing.normalRate, 1 - criticalRate),
      "Healing must resolve only Normal and Critical outcomes using Critical Rate times Effective Precision.",
    ).toBeTruthy()

    const healingTimeline: TimelineBuildInput = {
      rotation: { name: "Healing timeline probe", steps: [castStep("SmallerHeal"), castStep("LargerHeal")] },
      skills: {
        SmallerHeal: {
          name: "Smaller Heal",
          castTime: 1,
          action: [{ type: "heal", phyCoef: 1, silkbindCoef: 1, time: 1 }],
          modifier: [],
          tags: ["Heal", "MartialArts", "MartialArt", "PanaceaFan", "CloudburstHealing"],
        },
        LargerHeal: {
          name: "Larger Heal",
          castTime: 1,
          action: [{ type: "heal", phyCoef: 2, silkbindCoef: 2, time: 1 }],
          modifier: [],
          tags: ["Heal", "MartialArts", "PanaceaFan"],
        },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    }
    const baselineInput: RotationSimulationBundle = {
      timeline: healingTimeline,
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats,
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }
    const result = calculateRotationBaseline(baselineInput)
    const royalRemedyResult = calculateRotationBaseline({
      ...baselineInput,
      timeline: {
        ...healingTimeline,
        innerWayConditions: ["RoyalRemedyT0"],
        innerWayRules: [{ ...royalRemedy.effect.RoyalRemedyT0.effect[0], source: "RoyalRemedy", tier: 0 }],
      },
    })
    const summedHealing = Object.values(result.actionBreakdowns).reduce(
      (total, breakdown) => total + (breakdown.healing?.total ?? 0),
      0,
    )
    expect(
      result.metrics.totalDamage === 0 && closeTo(result.metrics.totalHealing, summedHealing),
      "Heal actions must contribute to healing without contributing to damage.",
    ).toBeTruthy()
    expect(
      closeTo(result.metrics.hps, result.metrics.totalHealing / result.duration),
      "HPS must use the rotation duration shared with DPS.",
    ).toBeTruthy()
    expect(
      result.metrics.breakdown.skills.length === 0 &&
        result.metrics.breakdown.healingSkills.map(row => row.id).join(",") === "LargerHeal,SmallerHeal",
      "Healing skills must be excluded from damage rows and sorted independently by healing.",
    ).toBeTruthy()
    expect(
      result.metrics.breakdown.healingSkills.every(row => closeTo(row.normalRate, 70) && closeTo(row.criticalRate, 30)),
      "Healing skill rows must expose their average Normal and Critical outcome rates.",
    ).toBeTruthy()
    expect(
      result.metrics.breakdown.healingCasts.map(row => row.skillId).join(",") === "LargerHeal,SmallerHeal",
      "Healing casts must be grouped and sorted independently by average HPS.",
    ).toBeTruthy()
    const healingBySkill = (calculation: RotationSimulationBaseline, skillId: string) =>
      rowWithId(calculation.metrics.breakdown.healingSkills, skillId)?.healing ?? 0
    expect(
      closeTo(healingBySkill(royalRemedyResult, "SmallerHeal"), healingBySkill(result, "SmallerHeal") * 1.1) &&
        closeTo(healingBySkill(royalRemedyResult, "LargerHeal"), healingBySkill(result, "LargerHeal")),
      "Royal Remedy T0 must increase Cloudburst Healing by 10% without affecting other healing skills.",
    ).toBeTruthy()

    const priorityResult = calculateRotationSimulation({
      ...baselineInput,
      statPriority: [
        { label: "Smaller healing increase", stats: { ...stats, allMartialArts: 0.05 } },
        { label: "Larger healing increase", stats: { ...stats, allMartialArts: 0.1 } },
      ],
    })
    expect(
      priorityResult.metrics.statPriority.map(row => row.label).join(",") ===
        "Larger healing increase,Smaller healing increase" &&
        priorityResult.metrics.statPriority.every(
          row => row.dpsDifference === 0 && row.hpsDifference > 0 && row.healingIncrease > 0,
        ),
      "Healing stat-priority variants must expose HPS changes and use HPS to break equal-DPS ties.",
    ).toBeTruthy()
    const attunementPriorityResult = calculateRotationSimulation({
      ...baselineInput,
      attunementPriority: [
        {
          label: "Smaller healing attunement",
          attunement: { ...emptyAttunementStats, panaceaMartialHealingBoost: 0.05 },
        },
        {
          label: "Larger healing attunement",
          attunement: { ...emptyAttunementStats, panaceaMartialHealingBoost: 0.1 },
        },
      ],
    })
    expect(
      attunementPriorityResult.metrics.attunementPriority.map(row => row.label).join(",") ===
        "Larger healing attunement,Smaller healing attunement" &&
        attunementPriorityResult.metrics.attunementPriority.every(
          row => row.dpsDifference === 0 && row.hpsDifference > 0 && row.healingIncrease > 0,
        ),
      "Healing Attunement variants must expose HPS changes and use HPS to break equal-DPS ties.",
    ).toBeTruthy()
    const setupComparisonResult = calculateRotationSimulation({
      ...baselineInput,
      setupComparisons: {
        healingSetup: [
          { label: "Healing setup", attunement: { ...emptyAttunementStats, panaceaMartialHealingBoost: 0.1 } },
        ],
      },
    })
    const healingSetup = setupComparisonResult.metrics.setupComparisons.healingSetup[0]
    expect(
      healingSetup.dpsDifference === 0 && healingSetup.hpsDifference > 0 && healingSetup.healingIncrease > 0,
      "Setup comparisons must expose HPS changes independently from DPS changes.",
    ).toBeTruthy()
    const innerWayPriorityResult = calculateRotationSimulation({
      ...baselineInput,
      innerWayPriority: [
        { label: "Larger healing increase", stats: { ...stats, allMartialArts: 0.1 } },
        { label: "Smaller healing increase", stats: { ...stats, allMartialArts: 0.05 } },
      ],
    })
    expect(
      innerWayPriorityResult.metrics.innerWayPriority.map(row => row.label).join(",") ===
        "Smaller healing increase,Larger healing increase" &&
        innerWayPriorityResult.metrics.innerWayPriority.every(row => row.hpsDifference > 0),
      "Healing Inner Way variants must expose HPS changes and use ascending HPS for equal-DPS removal ties.",
    ).toBeTruthy()

    const royalRemedyT1 = royalRemedy.effect.RoyalRemedyT1.trigger[0]
    const fanQVitality = (skillId: string) => {
      const timeline = buildRotationTimeline({
        rotation: {
          name: `${skillId} Royal Remedy T1 probe`,
          steps: [castStep(skillId), castStep("Wait"), castStep("Observe")],
        },
        skills: {
          [skillId]: panaceaFanSkills[skillId],
          Wait: { name: "Wait", castTime: 7, action: [] },
          Observe: { name: "Observe", castTime: 0, action: [] },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: ["RoyalRemedyT0", "RoyalRemedyT1"],
        innerWayRules: [
          {
            requirement: royalRemedyT1.requirement,
            trigger: royalRemedyT1,
            effect: {},
            source: "RoyalRemedy",
            tier: 1,
          },
        ],
        setupEffects: [],
        weapons: ["panaceaFan", "soulshadeUmbrella"],
        initialResources: { Vitality: 0 },
        resourceMaximums: { Vitality: 100 },
      })
      return timeline.find(row => row.step.type === "skill" && row.step.skill === "Observe")?.resources.Vitality
    }
    expect(
      fanQVitality("CloudburstHealing") === 14 && fanQVitality("CloudburstHealingCancel") === 14,
      "Royal Remedy T1 must restore two Vitality for each of all seven Fan Q healing ticks.",
    ).toBeTruthy()

    const morningDrizzleTimeline = buildRotationTimeline({
      rotation: {
        name: "Morning Drizzle periodic healing probe",
        steps: [castStep("MorningDrizzle"), castStep("Wait")],
      },
      skills: { MorningDrizzle: panaceaFanSkills.MorningDrizzle, Wait: { name: "Wait", castTime: 6, action: [] } },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    })
    const morningDrizzleTicks = morningDrizzleTimeline
      .filter(row => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "MorningDrizzle")
      .map(row => row.startTime)
    expect(
      morningDrizzleTicks.length === 6 && morningDrizzleTicks.every((time, index) => closeTo(time, 0.55 + index)),
      `Morning Drizzle must heal immediately on application and once per second through 5 seconds (${morningDrizzleTicks.join(", ")}).`,
    ).toBeTruthy()
    const refreshedMorningDrizzleTimeline = buildRotationTimeline({
      rotation: {
        name: "Morning Drizzle refresh probe",
        steps: [castStep("MorningDrizzle"), castStep("MorningDrizzle"), castStep("Wait")],
      },
      skills: { MorningDrizzle: panaceaFanSkills.MorningDrizzle, Wait: { name: "Wait", castTime: 6, action: [] } },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    })
    const refreshedMorningDrizzleTicks = refreshedMorningDrizzleTimeline
      .filter(row => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "MorningDrizzle")
      .map(row => row.startTime)
    expect(
      refreshedMorningDrizzleTicks.length === 7 &&
        closeTo(refreshedMorningDrizzleTicks[0], 0.55) &&
        refreshedMorningDrizzleTicks.slice(1).every((time, index) => closeTo(time, 1.3125 + index)),
      `Refreshing Morning Drizzle must restart its six-tick cadence without retaining superseded ticks (${refreshedMorningDrizzleTicks.join(", ")}).`,
    ).toBeTruthy()
    const teamEndlessCloudTimeline = buildRotationTimeline({
      rotation: {
        name: "Team Endless Cloud Morning Drizzle probe",
        groupSize: 5,
        steps: [castStep("EndlessCloud"), castStep("Wait")],
      },
      skills: { EndlessCloud: panaceaFanSkills.EndlessCloud, Wait: { name: "Wait", castTime: 6, action: [] } },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    })
    const teamMorningDrizzleTicks = teamEndlessCloudTimeline.filter(
      row => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "MorningDrizzle",
    )
    expect(
      teamMorningDrizzleTicks.length === 12 &&
        teamMorningDrizzleTicks.filter(row => row.playerRecipientIndex === 0).length === 6 &&
        teamMorningDrizzleTicks.filter(row => row.playerRecipientIndex === 1).length === 6,
      "Endless Cloud must maintain independent Morning Drizzle copies on self and one teammate in a team.",
    ).toBeTruthy()
    const replacedMorningDrizzleTimeline = buildRotationTimeline({
      rotation: {
        name: "Morning Drizzle recipient replacement probe",
        groupSize: 5,
        steps: [...Array.from({ length: 6 }, () => castStep("MorningDrizzle")), castStep("Observe")],
      },
      skills: {
        MorningDrizzle: panaceaFanSkills.MorningDrizzle,
        Observe: { name: "Observe", castTime: 0, action: [] },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { MorningDrizzle: delugeBuffs.MorningDrizzle },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    })
    const replacementObservation = rowCasting(replacedMorningDrizzleTimeline, "Observe")
    const replacedCopies = Array.from(replacementObservation.buffs.values()).filter(
      buff => buff.name === "MorningDrizzle",
    )
    expect(
      replacedCopies.length === 5 &&
        closeTo(replacedCopies.find(buff => buff.playerRecipientIndex === 0)?.appliedAt, 4.3625) &&
        closeTo(replacedCopies.find(buff => buff.playerRecipientIndex === 1)?.appliedAt, 1.3125),
      "A full player-target buff roster must replace the copy with the least remaining duration.",
    ).toBeTruthy()

    const echoesTimelineInput: TimelineBuildInput = {
      rotation: {
        name: "Echoes of a Thousand Plants periodic healing probe",
        steps: [castStep("EchoesOfAThousandPlants"), castStep("Wait")],
      },
      skills: {
        EchoesOfAThousandPlants: soulshadeUmbrellaSkills.EchoesOfAThousandPlants,
        Wait: { name: "Wait", castTime: 61, action: [] },
      },
      eventDefinitions: {},
      dots: {},
      effectDefinitions: { EchoesOfAThousandPlants: delugeBuffs.EchoesOfAThousandPlants },
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    }
    const echoesTimeline = buildRotationTimeline(echoesTimelineInput)
    const echoesTicks = echoesTimeline
      .filter(
        row => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "EchoesOfAThousandPlants",
      )
      .map(row => row.startTime)
    expect(
      echoesTicks.length === 60 && echoesTicks.every((time, index) => closeTo(time, 1.625 + index)),
      `Echoes of a Thousand Plants must begin healing 1 second after application and repeat every second for its 60-second duration (${echoesTicks.length} ticks).`,
    ).toBeTruthy()
    const cutoffEchoesResult = calculateRotationBaseline({
      timeline: {
        ...echoesTimelineInput,
        rotation: {
          name: "Echoes Battle End cutoff probe",
          eventTimeReference: "battleStart",
          start: { step: 0 },
          steps: [
            castStep("EchoesOfAThousandPlants"),
            { type: "event", event: "BattleEnd", startTime: 5 },
            castStep("Wait"),
          ],
        },
        eventDefinitions: { BattleEnd: { name: "Battle End", castTime: 0, action: [] } },
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats,
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const cutoffEchoesHealing = cutoffEchoesResult.metrics.breakdown.healingSkills.find(
      row => row.id === "EchoesOfAThousandPlants",
    )
    const cutoffEchoesDamage = cutoffEchoesResult.metrics.breakdown.skills.find(
      row => row.id === "EchoesOfAThousandPlants",
    )
    expect(
      cutoffEchoesHealing?.triggers === 4 && cutoffEchoesHealing.heals === 4,
      `Periodic healing triggers after Battle End must not enter the healing breakdown (${JSON.stringify(cutoffEchoesHealing)}).`,
    ).toBeTruthy()
    expect(
      cutoffEchoesDamage?.triggers === 0,
      `Healing-only periodic rows must not count as damage triggers (${JSON.stringify(cutoffEchoesDamage)}).`,
    ).toBeTruthy()
    const consumedEchoesTimeline = buildRotationTimeline({
      ...echoesTimelineInput,
      rotation: {
        name: "Floating Grace consumes Echoes probe",
        steps: [castStep("EchoesOfAThousandPlants"), castStep("FloatingGrace"), castStep("Wait")],
      },
      skills: {
        EchoesOfAThousandPlants: soulshadeUmbrellaSkills.EchoesOfAThousandPlants,
        FloatingGrace: soulshadeUmbrellaSkills.FloatingGrace,
        Wait: { name: "Wait", castTime: 2, action: [] },
      },
    })
    expect(
      !consumedEchoesTimeline.some(
        row => row.kind === "periodic" && row.step.type === "skill" && row.step.skill === "EchoesOfAThousandPlants",
      ),
      "Casting Floating Grace must consume Echoes of a Thousand Plants before its pending healing ticks resolve.",
    ).toBeTruthy()

    const worldToSwordBundle: RotationSimulationBundle = {
      timeline: {
        rotation: {
          name: "World to Sword overheal probe",
          steps: [
            castStep("WorldToSword"),
            castStep("IncomingHit"),
            castStep("OverflowHeal"),
            { type: "event", event: "Delay", duration: 1 },
          ],
        },
        skills: {
          WorldToSword: mysticSkills.WorldToSword,
          QiBlade: mysticSkills.QiBlade,
          IncomingHit: {
            name: "Incoming Hit",
            castTime: 0.1,
            action: [{ type: "takeDamage", damage: 100, time: 0.1 }],
            tags: [],
          },
          OverflowHeal: {
            name: "Overflow Heal",
            castTime: 0.2,
            action: [
              { type: "heal", phyCoef: 30, silkbindCoef: 30, time: 0.2 },
              { type: "heal", phyCoef: 30, silkbindCoef: 30, time: 0.2 },
            ],
            tags: ["Heal", "MartialArts", "PanaceaFan"],
          },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: { WorldToSword: mysticBuffs.WorldToSword },
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["panaceaFan", "soulshadeUmbrella"],
        initialResources: { Vitality: 100 },
        resourceMaximums: { Vitality: 100 },
        maxHP: 1000,
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats,
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }
    const groupHealingContext: DamageContext = {
      stats,
      derivedStats,
      enemy,
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      skillTags: ["Heal"],
      buffs: [],
      effects: [],
      attunement: emptyAttunementStats,
    }
    const groupHealingThreshold = (() => {
      const snapshot = calculateHealingAttackSnapshot(groupHealingContext)
      return snapshot.averagePhysicalAttack * 12 + snapshot.averageSilkbindAttack * 18
    })()
    const healingPerPhysicalBonus = calculateHealingBreakdown(
      { type: "heal", phyCoef: 0, silkbindCoef: 0, phyBonus: 1, attrBonus: 0 },
      groupHealingContext,
    ).total
    const groupHealAction = {
      type: "heal",
      phyCoef: 0,
      silkbindCoef: 0,
      phyBonus: (groupHealingThreshold * 0.7) / healingPerPhysicalBonus,
      attrBonus: 0,
      time: 0.1,
    }
    const groupHealingBundle = (groupSize: number): RotationSimulationBundle => ({
      ...worldToSwordBundle,
      timeline: {
        ...worldToSwordBundle.timeline,
        rotation: {
          name: `Group healing ${groupSize}`,
          groupSize: groupSize as 1 | 5 | 10,
          steps: [castStep("WorldToSword"), castStep("GroupHeal")],
        },
        skills: {
          WorldToSword: mysticSkills.WorldToSword,
          QiBlade: mysticSkills.QiBlade,
          GroupHeal: { name: "Group Heal", group: true, castTime: 0.1, action: [groupHealAction], tags: ["Heal"] },
        },
      },
    })
    const soloGroupHealing = calculateRotationBaseline(groupHealingBundle(1))
    const teamGroupHealing = calculateRotationBaseline(groupHealingBundle(5))
    const raidGroupHealing = calculateRotationBaseline(groupHealingBundle(10))
    expect(
      closeTo(teamGroupHealing.metrics.totalHealing, soloGroupHealing.metrics.totalHealing * 5) &&
        closeTo(raidGroupHealing.metrics.totalHealing, soloGroupHealing.metrics.totalHealing * 10),
      "A group heal must report one healing copy for every recipient in the rotation group.",
    ).toBeTruthy()
    const groupHealCount = (result: RotationSimulationBaseline) =>
      result.metrics.breakdown.healingSkills.find(row => row.id === "GroupHeal")?.heals
    expect(
      groupHealCount(soloGroupHealing) === 1 &&
        groupHealCount(teamGroupHealing) === 5 &&
        groupHealCount(raidGroupHealing) === 10,
      "A group heal's breakdown must count one heal for every recipient.",
    ).toBeTruthy()
    const groupQiBladeCount = (result: RotationSimulationBaseline) =>
      result.timeline.filter(row => row.kind === "trigger" && row.step.type === "skill" && row.step.skill === "QiBlade")
        .length
    const buffedThresholdResult = calculateRotationBaseline({
      ...worldToSwordBundle,
      timeline: {
        ...worldToSwordBundle.timeline,
        rotation: {
          name: "Buffed WTS threshold probe",
          steps: [castStep("WorldToSword"), castStep("RawThresholdHeal")],
        },
        skills: {
          WorldToSword: mysticSkills.WorldToSword,
          QiBlade: mysticSkills.QiBlade,
          RawThresholdHeal: {
            name: "Raw threshold heal",
            castTime: 0.1,
            action: [
              {
                type: "heal",
                phyCoef: 0,
                silkbindCoef: 0,
                phyBonus: (groupHealingThreshold * 1.1) / healingPerPhysicalBonus,
                attrBonus: 0,
                time: 0.1,
              },
            ],
            tags: ["Heal"],
          },
        },
        setupEffects: [{ physicalAttackBonus: 4, silkbindAttackBonus: 4 }],
      },
    })
    expect(
      groupQiBladeCount(buffedThresholdResult) === 0,
      "World to Sword's cast snapshot must include attack multipliers, raising the threshold for a fixed heal.",
    ).toBeTruthy()
    expect(
      groupQiBladeCount(soloGroupHealing) === 0 &&
        groupQiBladeCount(teamGroupHealing) === 1 &&
        groupQiBladeCount(raidGroupHealing) === 1,
      "WTS must count teammate group healing as one-fifth overhealing while retaining one threshold cap per action.",
    ).toBeTruthy()
    const playerTargetHealing = calculateRotationBaseline({
      ...worldToSwordBundle,
      timeline: {
        ...worldToSwordBundle.timeline,
        rotation: {
          name: "Single-target teammate WTS probe",
          groupSize: 5,
          steps: [castStep("WorldToSword"), castStep("ApplyPlayerHeal")],
        },
        skills: {
          WorldToSword: mysticSkills.WorldToSword,
          QiBlade: mysticSkills.QiBlade,
          ApplyPlayerHeal: {
            name: "Apply Player Heal",
            castTime: 0.1,
            action: [
              { type: "apply", target: "player", value: "PlayerHeal", time: 0.1 },
              { type: "apply", target: "player", value: "PlayerHeal", time: 0.1 },
            ],
            tags: ["Heal"],
          },
        },
        effectDefinitions: {
          WorldToSword: mysticBuffs.WorldToSword,
          PlayerHeal: {
            name: "Player Heal",
            duration: 0.1,
            maxStack: 1,
            refresh: true,
            periodic: { interval: 1, firstTick: 0, action: [groupHealAction] },
          },
        },
      },
    })
    expect(
      groupQiBladeCount(playerTargetHealing) === 1,
      "WTS must count all overhealing from a single-target heal assigned to a teammate, rather than applying the group-heal one-fifth weight.",
    ).toBeTruthy()
    const worldToSwordResult = calculateRotationBaseline(worldToSwordBundle)
    const qiBlades = worldToSwordResult.timeline.filter(
      row => row.kind === "trigger" && row.step.type === "skill" && row.step.skill === "QiBlade",
    )
    expect(
      qiBlades.length === 2 && closeTo(qiBlades[1].startTime - qiBlades[0].startTime, 0.3),
      "Expected overhealing must retain threshold credit during cooldown and launch queued Qi Blades 0.3 seconds apart.",
    ).toBeTruthy()
    const overflowHealRow = rowCasting(worldToSwordResult.timeline, "OverflowHeal")
    expect(
      overflowHealRow.actionStates[1]?.currentHP === 1000,
      "Healing must restore missing self HP before later healing is counted entirely as overhealing.",
    ).toBeTruthy()
    expect(
      overflowHealRow?.actionStates[1]?.buffs.get("WorldToSword")?.remainingTriggers === 19,
      "World to Sword must expose its remaining Qi Blade budget after a successful launch.",
    ).toBeTruthy()
    const mergedWorldToSwordTimeline = mergeCalculatedTimelineState(
      buildRotationTimeline(worldToSwordBundle.timeline),
      worldToSwordResult.timeline,
    )
    const mergedOverflowHealRow = rowCasting(mergedWorldToSwordTimeline, "OverflowHeal")
    expect(
      mergedOverflowHealRow.actionStates[1]?.currentHP === 1000 &&
        mergedOverflowHealRow.currentHPRatio === overflowHealRow.currentHPRatio &&
        mergedOverflowHealRow.actionStates[1]?.buffs.get("WorldToSword")?.remainingTriggers === 19,
      "The editor timeline must retain calculated self-HP restoration and finite buff-trigger progress when it merges worker results.",
    ).toBeTruthy()
    const exhaustedWorldToSword = calculateRotationBaseline({
      ...worldToSwordBundle,
      timeline: {
        ...worldToSwordBundle.timeline,
        rotation: {
          name: "World to Sword trigger-limit probe",
          steps: [
            castStep("WorldToSword"),
            castStep("TwentyOverflowHeals"),
            castStep("WaitForBlades"),
            castStep("Observe"),
          ],
        },
        skills: {
          WorldToSword: mysticSkills.WorldToSword,
          QiBlade: mysticSkills.QiBlade,
          TwentyOverflowHeals: {
            name: "Twenty Overflow Heals",
            castTime: 6,
            action: Array.from({ length: 20 }, (_, index) => ({
              type: "heal",
              phyCoef: 30,
              silkbindCoef: 30,
              time: 0.1 + index * 0.31,
            })),
            tags: ["Heal"],
          },
          WaitForBlades: { name: "Wait for Blades", castTime: 0.5, action: [] },
          Observe: { name: "Observe", castTime: 0, action: [] },
        },
      },
    })
    const exhaustedWorldToSwordObserve = exhaustedWorldToSword.timeline.find(
      row => row.step.type === "skill" && row.step.skill === "Observe",
    )
    const exhaustedWorldToSwordBuff = exhaustedWorldToSwordObserve?.buffs.get("WorldToSword")
    expect(
      groupQiBladeCount(exhaustedWorldToSword) === 20 &&
        exhaustedWorldToSwordBuff?.remainingTriggers === 0 &&
        (exhaustedWorldToSwordBuff.expiresAt ?? 0) >
          (exhaustedWorldToSwordObserve?.startTime ?? Number.POSITIVE_INFINITY),
      "World to Sword must remain active until its normal expiry after all 20 Qi Blades have launched.",
    ).toBeTruthy()
    const ordinaryHealingResult = calculateRotationBaseline({
      ...worldToSwordBundle,
      timeline: {
        ...worldToSwordBundle.timeline,
        rotation: {
          name: "Ordinary self-healing probe",
          steps: [castStep("IncomingHit"), castStep("OverflowHeal"), castStep("Observe")],
        },
        skills: { ...worldToSwordBundle.timeline.skills, Observe: { name: "Observe", castTime: 0, action: [] } },
        effectDefinitions: {},
      },
      startAnchor: { rowId: "rotation-0" },
    })
    const ordinaryHealRow = ordinaryHealingResult.timeline.find(
      row => row.step.type === "skill" && row.step.skill === "OverflowHeal",
    )
    const ordinaryObserveRow = ordinaryHealingResult.timeline.find(
      row => row.step.type === "skill" && row.step.skill === "Observe",
    )
    expect(
      ordinaryHealRow?.actionStates[1]?.currentHP === 1000 && ordinaryObserveRow?.currentHP === 1000,
      "Ordinary healing must restore timeline self HP even when World to Sword is not active.",
    ).toBeTruthy()
    const fanQQTimeline = buildRotationTimeline({
      rotation: {
        name: "Fan QQ automatic Echoes probe",
        steps: [
          castStep("EndlessCloud"),
          castStep("EndlessCloudCancel"),
          { type: "event", event: "Delay", duration: 30 },
          castStep("EndlessCloud"),
        ],
      },
      skills: { ...panaceaFanSkills, ...soulshadeUmbrellaSkills },
      eventDefinitions: { Delay: { name: "Delay", castTime: 0, action: [], tags: ["Event"] } },
      dots: {},
      effectDefinitions: delugeBuffs,
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
      martialArtState: { panaceaFan: { weapon: "Fan" }, soulshadeUmbrella: { weapon: "Umbrella" } },
    })
    const fanQQEchoes = fanQQTimeline.filter(
      row => row.kind === "trigger" && row.step.type === "skill" && row.step.skill === "EchoesOfAThousandPlantsFanQQ",
    )
    expect(
      fanQQEchoes.length === 2 && fanQQEchoes.every(row => row.actions.every(action => action.type !== "damage")),
      "Fan QQ must trigger the non-damaging Echoes utility cast only while its shared cooldown is ready.",
    ).toBeTruthy()
    expect(
      fanQQEchoes.every(row => row.currentMartialArt === "panaceaFan" && row.currentWeapon === "Fan"),
      "The automatic Echoes utility cast must not switch the current martial art or weapon.",
    ).toBeTruthy()
    const secondFanQQ = fanQQTimeline.find(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "EndlessCloudCancel",
    )
    expect(
      secondFanQQ?.buffs.has("MorningDrizzle"),
      "Fan QQ and Fan QQ Cancel must apply Morning Drizzle at their healing timestamp.",
    ).toBeTruthy()
    expect(
      worldToSwordResult.metrics.breakdown.skills.some(skill => skill.id === "QiBlade" && skill.hits === 2),
      "Every launched Qi Blade must resolve its delayed damage through the normal damage pipeline.",
    ).toBeTruthy()
    const simulatedWorldToSword = calculateSimulatedRotationRun(worldToSwordBundle, () => 0.25)
    expect(
      simulatedWorldToSword.resolvedSequence.filter(({ entry }) => entry.context.skillTags.includes("QiBlade"))
        .length === 2,
      "Simulation must use rolled healing while retaining overheal accumulated during the Qi Blade cooldown.",
    ).toBeTruthy()
    let recipientRoll = 0
    const independentlyRolledGroupHealing = calculateSimulatedRotationRun(groupHealingBundle(5), () => {
      recipientRoll += 1
      switch (recipientRoll % 4) {
        case 1:
          return 0
        case 3:
          return 0.99
        default:
          return 0.5
      }
    })
    const groupHealingEntry = independentlyRolledGroupHealing.resolvedSequence.find(
      ({ entry }) => entry.id === "rotation-1:0",
    )
    const groupHealingOutcomes = new Set(groupHealingEntry?.breakdown.recipientHealing?.map(healing => healing.outcome))
    expect(
      groupHealingEntry?.breakdown.recipientHealing?.length === 5 &&
        groupHealingOutcomes.has("normal") &&
        groupHealingOutcomes.has("critical"),
      "Simulation must independently roll every recipient of a group healing action.",
    ).toBeTruthy()
  })
})
