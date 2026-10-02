import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  buildRotationTimeline,
  type EditableObject,
  type RotationStep,
  type TimelineBuildInput,
} from "@/calculations/rotationTimeline"

import mechanismBuffs from "../data/buff/mechanism.json"
import mechanismSkills from "../data/skill/mechanism.json"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const lightning = { type: "skill", skill: "SummonLightning" } as const
const hit = { type: "skill", skill: "Hit" } as const

function timelineFor(steps: RotationStep[], setupEffects: EditableObject[] = []): TimelineBuildInput {
  return {
    rotation: { name: "Mechanism probe", ping: 0, steps },
    skills: asSkillRecords({
      ...mechanismSkills,
      Hit: { name: "Hit", castTime: 1, action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 1 }] },
    }),
    eventDefinitions: { BattleEnd: { action: [] }, Delay: { action: [] } },
    dots: {},
    effectDefinitions: asEffectDefinitions(mechanismBuffs),
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects,
    weapons: [],
  }
}

describe("Summon Lightning", () => {
  it("applies Thunder Summoning at the source time for the source duration", () => {
    const rows = buildRotationTimeline({
      ...timelineFor([
        lightning,
        { type: "event", event: "Delay", duration: 20 },
        { type: "event", event: "BattleEnd", startTime: 25 },
      ]),
      maxHP: 10000,
    })
    const cast = rows.find(row => row.step.type === "skill" && row.step.skill === "SummonLightning")
    const applied = rows.find(row => row.buffs.has("ThunderSummoning"))
    assert(cast, "The mechanic cast must produce a timeline row.")
    assert(applied && applied !== cast, "Thunder Summoning must be applied during the cast, not at its start.")
    assert(
      Math.abs((applied?.buffs.get("ThunderSummoning")?.expiresAt ?? 0) - (cast?.startTime ?? 0) - 15.403) < 1e-9,
      "The application must resolve at the source route's 0.403 second cast-timeline time and last 15 seconds.",
    )
    assert(rows.at(-1)?.buffs.has("ThunderSummoning") === false, "The buff must expire.")
  })

  it("adds 30% through the Mechanism category for the covered hits only", async () => {
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
    const enemy = {
      name: "Mechanism probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const totalDamage = (lead: RotationStep[], extraDamageEffects: Record<string, number>[] = []) =>
      calculateRotationBaseline({
        timeline: timelineFor(
          [...lead, hit],
          extraDamageEffects.map((effect): EditableObject => ({ effect })),
        ),
        startAnchor: { rowId: `rotation-${lead.length}` },
        stats,
        attunement: emptyAttunementStats,
        enemy,
        derivedStats: calculateDerivedStats(stats, 0),
        weapons: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }).metrics.totalDamage

    const bare = totalDamage([])
    const covered = totalDamage([lightning])
    const uncovered = totalDamage([lightning, { type: "event", event: "Delay", duration: 20 }])
    assert(Math.abs(covered / bare - 1.3) < 1e-9, "A covered hit must resolve through the 1.3 Mechanism multiplier.")
    assert(Math.abs(uncovered - bare) < 1e-9, "A hit after the 15-second expiry must return to the unmodified result.")
    const withOtherMechanismBonus = totalDamage([lightning], [{ globalDmgBonus: 0.1 }])
    assert(
      Math.abs(withOtherMechanismBonus / bare - 1.4) < 1e-9,
      "Thunder Summoning must add with the other Mechanism-category bonuses instead of multiplying separately.",
    )
    const withCategoryOneBonus = totalDamage([lightning], [{ dmgBonus: 0.1 }])
    assert(
      Math.abs(withCategoryOneBonus / bare - 1.3 * 1.1) < 1e-9,
      "Thunder Summoning must stay outside DMG Bonus Category 1's additive pool.",
    )
  })
})
