import divinecraftDots from "@gamedata/dot/divinecraft.json"
import { describe, expect, it } from "vitest"

import { divinecraftEffectFor, typedDivinecraftDefinitions } from "@/application/gameData/setup"
import { effectDefinitions, defaultSkillMaps, dotDefinitions } from "@/application/gameData/skills"
import { normalizeRotation } from "@/application/rotationCatalog"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { restrictedOutcomeRates } from "@/calculations/rateRoutes"
import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"
import { resolveSkillCalculationDefinitions } from "@/skillOverrides"

import { isClose } from "./helpers/floatEquality"

const closeTo = (actual: number, expected: number) => isClose(actual, expected, 1e-9)

// A flat physical/attribute range makes the average attack observable: it is the
// midpoint, and the simulator's uniform roll inside the range is visible without it.
const rangedStats = {
  ...emptyStats,
  minPhys: 800,
  maxPhys: 1200,
  minBellstrike: 500,
  maxBellstrike: 900,
  precision: 0.5,
  crit: 0.4,
  directCrit: 0,
}
const flatEnemy = {
  name: "Divinecraft route probe",
  level: 96,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}
const baseContext = {
  stats: rangedStats,
  attunement: emptyAttunementStats,
  skillTags: [],
  weapons: [],
  buffs: [],
  enemy: flatEnemy,
  derivedStats: calculateDerivedStats(rangedStats, 0),
  effects: [],
}

describe("divinecraft damage", () => {
  it("uses the average physical attack and can only roll the Normal outcome", () => {
    const action = { phyCoef: 1, rateRoute: "divinecraft", averageAttack: true, isDot: true }
    const expected = calculateDamageBreakdown(
      { phyCoef: 1, rateRoute: "divinecraft", averageAttack: true },
      baseContext,
    )
    expect(expected.outcomeRates).toEqual({ abrasion: 0, normal: 1, critical: 0, affinity: 0 })

    // (average physical attack - enemy defense) x physical coefficient, with no
    // attribute component, no flat bonus, and no outcome spread.
    const averagePhysicalAttack = (rangedStats.minPhys + rangedStats.maxPhys) / 2
    expect(expected.physical).toBeCloseTo(averagePhysicalAttack, 9)
    expect(expected.bellstrike).toBe(0)
    expect(expected.stonesplit).toBe(0)
    expect(expected.silkbind).toBe(0)
    expect(expected.bamboocut).toBe(0)
    expect(expected.total).toBeCloseTo(averagePhysicalAttack, 9)

    // Subtract enemy defense to prove the ordinary physical route still applies.
    const defended = calculateDamageBreakdown(
      { phyCoef: 1, rateRoute: "divinecraft", averageAttack: true },
      { ...baseContext, enemy: { ...flatEnemy, defense: 200 } },
    )
    expect(defended.physical).toBeCloseTo(averagePhysicalAttack - 200, 9)

    // The route resolves to the same value on every seed, so the sampled hit is
    // deterministic where a normal-route hit would spread across the range.
    for (const seed of [0, 0.25, 0.5, 0.99]) {
      const rolled = calculateSimulatedDamageBreakdown(action, baseContext, () => seed)
      expect(rolled.outcome).toBe("normal")
      expect(rolled.total).toBeCloseTo(averagePhysicalAttack, 9)
    }
  })

  it("keeps the ordinary outcome spread when the route and field are absent", () => {
    const rates = calculateDamageBreakdown({ phyCoef: 1 }, baseContext).outcomeRates!
    expect(rates.abrasion).toBeGreaterThan(0)
    expect(rates.critical).toBeGreaterThan(0)

    // Without `averageAttack` the same action still spreads its sampled attack
    // across the range, which is what the field exists to switch off.
    // With only the Normal outcome possible, the sampled seed drives the attack roll
    // alone, which is the difference `averageAttack` switches off.
    const normalOnly = { ...baseContext, stats: { ...rangedStats, precision: 1, crit: 0 } }
    const normalOnlyContext = {
      ...normalOnly,
      derivedStats: calculateDerivedStats({ ...rangedStats, precision: 1, crit: 0 }, 0),
    }
    const rolledAttack = (action: object, seed: number) =>
      calculateSimulatedDamageBreakdown(action, normalOnlyContext, () => seed).total
    expect(rolledAttack({ phyCoef: 1 }, 0)).toBeLessThan(rolledAttack({ phyCoef: 1 }, 1))
    expect(rolledAttack({ phyCoef: 1, averageAttack: true }, 0)).toBe(
      rolledAttack({ phyCoef: 1, averageAttack: true }, 1),
    )
    expect(rolledAttack({ phyCoef: 1, averageAttack: true }, 0)).toBe((rangedStats.minPhys + rangedStats.maxPhys) / 2)
  })

  it("exposes the healing and Divinecraft routes as distinct rate sets", () => {
    const derivedStats = calculateDerivedStats(rangedStats, 0)
    const healing = restrictedOutcomeRates("healing", derivedStats)
    expect(healing.abrasionRate).toBe(0)
    expect(healing.affinityRate).toBe(0)
    expect(closeTo(healing.normalRate + healing.critRate, 1)).toBeTruthy()
    expect(healing.critRate).toBeGreaterThan(0)
    expect(healing.critRate).toBeLessThan(1)

    expect(restrictedOutcomeRates("divinecraft", derivedStats)).toEqual({
      abrasionRate: 0,
      normalRate: 1,
      critRate: 0,
      affinityRate: 0,
    })
  })

  it("applies Fire and Poison only on direct damage, with the authored cadence", () => {
    expect(divinecraftDots.DivinecraftFire).toMatchObject({
      duration: 4,
      maxStack: 1,
      refresh: true,
      periodic: { interval: 1, firstTick: 0.5 },
    })
    expect(divinecraftDots.DivinecraftPoison).toMatchObject({
      duration: 8,
      maxStack: 1,
      refresh: true,
      periodic: { interval: 1, firstTick: 0.5 },
    })

    const timelineFor = (divinecraft: string, options?: { steps?: number }) =>
      buildRotationTimeline({
        ...divinecraftTimelineInput(options),
        setupEffects: [typedDivinecraftDefinitions[divinecraft].effect as Record<string, unknown>],
      })
    const ticksFor = (divinecraft: string, options?: { steps?: number }) => {
      const timeline = timelineFor(divinecraft, options)
      return {
        times: timeline
          .filter(row => row.kind === "dot")
          .map(row => row.startTime)
          .sort((left, right) => left - right),
        // A DOT tick must not be counted as a hit that reapplies its own source.
        kinds: new Set(timeline.filter(row => row.kind === "dot").map(row => row.step.skill)),
      }
    }

    // Sustained direct hits keep the burn refreshed, so it never lapses and ticks
    // on its own 1s schedule for as long as the rotation runs.
    const fire = ticksFor("Fire", { steps: 20 })
    expect(fire.times).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5])
    expect([...fire.kinds]).toEqual(["DivinecraftFire"])

    // A single hit then a long gap: the burn must expire on its own rather than
    // being sustained by its own ticks.
    const single = buildRotationTimeline({
      ...divinecraftTimelineInput({ steps: 1 }),
      setupEffects: [typedDivinecraftDefinitions.Fire.effect as Record<string, unknown>],
    })
    const singleTicks = single.filter(row => row.kind === "dot").map(row => row.startTime)
    expect(singleTicks).toEqual([0.5, 1.5, 2.5, 3.5])

    const poison = ticksFor("PoisonFire", { steps: 20 })
    expect(poison.times).toEqual([
      0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5,
    ])
    expect([...poison.kinds]).toEqual(["DivinecraftPoison"])

    // The longer Poison window is what distinguishes the two on a single hit.
    const singlePoison = buildRotationTimeline({
      ...divinecraftTimelineInput({ steps: 1 }),
      setupEffects: [typedDivinecraftDefinitions.PoisonFire.effect as Record<string, unknown>],
    })
    expect(singlePoison.filter(row => row.kind === "dot").map(row => row.startTime)).toEqual([
      0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5,
    ])

    // Water-first pairings and None apply no Divinecraft DOT.
    expect(ticksFor("WaterFire").times).toEqual([])
    expect(ticksFor("WaterPoison").times).toEqual([])
    expect(ticksFor("None").times).toEqual([])
  })

  it("grants Solid Foundation on the fifth direct hit and consumes it on the next", () => {
    const timeline = buildRotationTimeline({
      ...divinecraftTimelineInput(),
      setupEffects: [typedDivinecraftDefinitions.Fire.effect as Record<string, unknown>],
    })
    const grants = timeline.filter(row => row.step.skill === "DivinecraftSolidFoundationGrant")
    const strikes = timeline.filter(row => row.step.skill === "DivinecraftSolidFoundationStrike")
    // Eight direct hits grant once: the 10s re-grant cooldown outlasts the rotation.
    expect(grants.length).toBe(1)
    expect(strikes.length).toBe(1)
    // The counter reaches five on the fifth hit, which lands at 2.0s.
    expect(grants[0].startTime).toBeCloseTo(2, 9)
    // The buff is consumed by the next hit rather than firing for its whole window.
    expect(strikes[0].startTime).toBeCloseTo(2.5, 9)
    expect(strikes[0].startTime).toBeGreaterThan(grants[0].startTime)
  })

  it("gives each Divinecraft only the damage its own elements grant", () => {
    // The burn belongs to the Fire group and the poison to the Poison group. A
    // Water-first pairing carries no Divinecraft damage at all, and only the
    // Fire group also builds Solid Foundation.
    const expected: Record<string, { dot?: string; foundation?: boolean }> = {
      Fire: { dot: "DivinecraftFire", foundation: true },
      FireWater: { dot: "DivinecraftFire", foundation: true },
      FirePoison: { dot: "DivinecraftFire", foundation: true },
      PoisonFire: { dot: "DivinecraftPoison" },
      PoisonWater: { dot: "DivinecraftPoison" },
      WaterFire: {},
      WaterPoison: {},
      None: {},
    }
    for (const [id, { dot, foundation }] of Object.entries(expected)) {
      const damageRules = divinecraftRules(typedDivinecraftDefinitions[id].effect).filter(
        rule => rule.event === "damage",
      )
      const targetDots = damageRules.filter(rule => rule.action?.target === "target").map(rule => rule.action!.value!)
      const buildsCounter = damageRules.some(rule => rule.action?.target === "self")
      expect({ id, targetDots, buildsCounter }).toEqual({
        id,
        targetDots: dot ? [dot] : [],
        buildsCounter: !!foundation,
      })
    }
  })

  it("fires Solid Foundation once per grant, even from a multi-hit source", () => {
    // Two damage actions at the same timestamp both resolve before any queued
    // trigger row runs, so the buff must be consumed in the trigger's own pass.
    const input = divinecraftTimelineInput()
    const resolved = resolveSkillCalculationDefinitions(defaultSkillMaps, effectDefinitions, dotDefinitions, {})
    const timeline = buildRotationTimeline({
      ...input,
      skills: {
        ...resolved.skills,
        MultiHit: {
          name: "Multi Hit",
          castTime: 0.5,
          tags: ["DirectDamage"],
          action: [
            { type: "damage", phyCoef: 1, time: 0 },
            { type: "damage", phyCoef: 1, time: 0 },
          ],
        },
      },
      rotation: {
        ...input.rotation,
        steps: Array.from({ length: 12 }, () => ({ type: "skill" as const, skill: "MultiHit" })),
      },
      setupEffects: [typedDivinecraftDefinitions.Fire.effect as Record<string, unknown>],
    })
    const strikes = timeline.filter(row => row.step.skill === "DivinecraftSolidFoundationStrike")
    const times = strikes.map(row => row.startTime)
    // One strike per grant, never two at the same instant, and never inside the
    // 10s re-grant cooldown.
    expect(new Set(times).size).toBe(times.length)
    for (let index = 1; index < times.length; index++)
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(10)
  })

  it("drops only the damaging rules when a rotation disables Divinecraft damage", () => {
    for (const id of ["Fire", "FireWater", "FirePoison", "PoisonFire", "PoisonWater", "WaterFire", "WaterPoison"]) {
      const full = divinecraftRules(typedDivinecraftDefinitions[id].effect)
      const reduced = divinecraftRules(divinecraftEffectFor(id, false) as Record<string, unknown>)
      // The HP DMG bonus and Qi DMG bonus are untouched; only the damage-event
      // rules that apply a DOT or build the counter are removed.
      expect({ id, full: full.length, reduced: reduced.length }).toEqual({
        id,
        full: full.length,
        reduced: full.filter(rule => rule.event !== "damage").length,
      })
      expect(reduced.every(rule => rule.event !== "damage")).toBeTruthy()
      expect((divinecraftEffectFor(id, false) as { hpDMGBonus?: number }).hpDMGBonus).toBe(
        (typedDivinecraftDefinitions[id].effect as { hpDMGBonus?: number }).hpDMGBonus,
      )
    }
    // A heal trigger survives, so the Vitality grant is unaffected.
    const healRules = divinecraftRules(divinecraftEffectFor("FireWater", false) as Record<string, unknown>)
    expect(healRules.map(rule => rule.event)).toEqual(["heal"])
    // Enabling damage restores the full effect unchanged.
    expect(divinecraftEffectFor("Fire", true)).toBe(typedDivinecraftDefinitions.Fire.effect)

    // The flag reaches the timeline through selectedSetupEffects, so an unchecked
    // rotation produces no Divinecraft rows at all.
    const divinecraftRows = (damage: boolean) =>
      buildRotationTimeline({
        ...divinecraftTimelineInput(),
        setupEffects: [divinecraftEffectFor("Fire", damage) as unknown as Record<string, unknown>],
      }).filter(row => row.step.skill?.startsWith("Divinecraft")).length
    expect(divinecraftRows(false)).toBe(0)
    expect(divinecraftRows(true)).toBeGreaterThan(0)
  })

  it("defaults an absent rotation flag to damage applying, and preserves an explicit one", () => {
    // Legacy and freshly built rotations omit the field, so omitting it must not
    // silently switch Divinecraft damage off.
    const rotation = { name: "probe", steps: [] }
    expect("divinecraftDamage" in normalizeRotation(rotation)).toBeFalsy()
    expect(normalizeRotation({ ...rotation, divinecraftDamage: false }).divinecraftDamage).toBe(false)
    expect(normalizeRotation({ ...rotation, divinecraftDamage: true }).divinecraftDamage).toBe(true)
    // A non-boolean value from an imported file is dropped rather than trusted.
    expect("divinecraftDamage" in normalizeRotation({ ...rotation, divinecraftDamage: "off" } as never)).toBeFalsy()
  })

  it("applies no Divinecraft damage before the fight starts", () => {
    const timelineAnchoredAt = (start: { step: number; action: number }) => {
      const input = divinecraftTimelineInput()
      return buildRotationTimeline({
        ...input,
        rotation: { ...input.rotation, start },
        setupEffects: [typedDivinecraftDefinitions.Fire.effect as Record<string, unknown>],
      })
    }
    // Anchoring a later direct hit makes the earlier ones prepull, so they may
    // neither put the burn on the target nor advance the Solid Foundation counter.
    for (const start of [
      { step: 1, action: 0 },
      { step: 2, action: 0 },
    ]) {
      const timeline = timelineAnchoredAt(start)
      const beforeStart = timeline.filter(row => row.startTime < timeline[0].battleStartTime!)
      expect(
        beforeStart.some(row => row.kind === "dot"),
        "A prepull hit must not tick the Divinecraft burn",
      ).toBeFalsy()
      expect(
        beforeStart.some(row => row.step.skill === "DivinecraftSolidFoundationStrike"),
        "A prepull hit must not count toward Solid Foundation",
      ).toBeFalsy()
    }

    // The in-combat hits still apply both, so this is a prepull rule and not a
    // blanket rejection.
    const inCombat = timelineAnchoredAt({ step: 0, action: 0 })
    expect(inCombat.filter(row => row.kind === "dot").length).toBeGreaterThan(0)
    expect(inCombat.some(row => row.step.skill === "DivinecraftSolidFoundationStrike")).toBeTruthy()
  })

  it("registers the Divinecraft DOTs in the shared DOT registry", () => {
    expect(dotDefinitions.DivinecraftFire).toBeDefined()
    expect(dotDefinitions.DivinecraftPoison).toBeDefined()
    expect(effectDefinitions.DivinecraftFireEmber).toMatchObject({ maxStack: 5, hidden: true })
    expect(defaultSkillMaps.General.DivinecraftSolidFoundationStrike).toBeDefined()
  })
})

type DivinecraftRule = { event?: string; action?: { value?: string; target?: string } }

/** Every damage-event rule a Divinecraft declares, whether a target DOT or a self counter. */
function divinecraftRules(effect: unknown): DivinecraftRule[] {
  const declared = (effect as { trigger?: unknown }).trigger
  if (declared === undefined || declared === null) return []
  return (Array.isArray(declared) ? declared : [declared]) as DivinecraftRule[]
}

/**
 * Direct hits at a 0.5s cadence. A trailing Delay holds the fight open so a burn
 * applied by the final hit can run out its own lifetime instead of being cut off
 * by the end of the rotation.
 */
function divinecraftTimelineInput(options: { steps?: number } = {}): TimelineBuildInput {
  const resolved = resolveSkillCalculationDefinitions(defaultSkillMaps, effectDefinitions, dotDefinitions, {})
  const count = options.steps ?? 8
  return {
    rotation: {
      name: "Divinecraft damage probe",
      steps: [
        ...Array.from({ length: count }, () => ({ type: "skill" as const, skill: "DirectHit" })),
        { type: "event" as const, event: "Delay", duration: 8 },
      ],
    },
    skills: {
      ...resolved.skills,
      DirectHit: { name: "Direct Hit", castTime: 0.5, action: [{ type: "damage", phyCoef: 1, time: 0 }] },
    },
    eventDefinitions: {},
    dots: resolved.dots,
    effectDefinitions: resolved.effectDefinitions,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
}
