import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationRecord, TimelineBuildInput } from "@/calculations/rotationTimeline"
import type { EnemyProfile } from "@/types"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowWithId } from "./helpers/timelineRows"

// Ported from script/probe/check-deluge-wts-rotation.mjs.
describe("deluge-wts-rotation", () => {
  it("Deluge WTS sequence and standard dummy-attack schedule verified", async () => {
    const rotation = (await import("../data/rotation/silkbind-deluge/dummy-1-min-wts.json")).default as RotationRecord
    const panacea = (await import("../data/skill/panacea-fan.json")).default
    const soulshade = (await import("../data/skill/soulshade-umbrella.json")).default
    const mystic = (await import("../data/skill/mystic.json")).default
    const general = (await import("../data/skill/general.json")).default
    const mysticBuffs = (await import("../data/buff/mystic.json")).default
    const generalBuffs = (await import("../data/buff/general.json")).default
    const delugeBuffs = (await import("../data/buff/silkbind-deluge.json")).default
    const mysticDebuffs = (await import("../data/debuff/mystic.json")).default
    const generalDebuffs = (await import("../data/debuff/general.json")).default
    const dots = (await import("../data/dot/mystic.json")).default
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const { mergeCalculatedTimelineState } = await import("../src/calculations/rotationTimeline.ts")
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateHealingAttackSnapshot } = await import("../src/calculations/healing.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const timelineInput: TimelineBuildInput = {
      rotation,
      skills: asSkillRecords({ ...panacea, ...soulshade, ...mystic, ...general }),
      eventDefinitions: asSkillRecords({
        TakeDamage: { name: "Take Damage", castTime: 0, action: [{ type: "takeDamage", time: 0 }], tags: ["Event"] },
        BattleEnd: { name: "Battle End", castTime: 0, action: [], tags: ["Event"] },
      }),
      dots: asSkillRecords(dots),
      effectDefinitions: asEffectDefinitions({
        ...mysticBuffs,
        ...generalBuffs,
        ...delugeBuffs,
        ...mysticDebuffs,
        ...generalDebuffs,
        ...dots,
      }),
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    }
    const timeline = buildRotationTimeline(timelineInput)
    // The preset anchors on the first step, and no action index, so the anchor is
    // the row's own start time.
    const anchorRow = rowWithId(timeline, `rotation-${rotation.start?.step ?? 0}`)
    const anchorTime = anchorRow.startTime
    for (const preset of [
      rotation,
      (await import("../data/rotation/silkbind-deluge/dummy-1-min-wts-team.json")).default as RotationRecord,
    ]) {
      const rows = buildRotationTimeline({ ...timelineInput, rotation: preset })
      assert(
        !rows.some(row => row.step.skill === "EchoesOfAThousandPlantsFanQQ"),
        "Cancelled Fan QQ must not trigger Echoes in either WTS preset.",
      )
      assert(
        rows
          .filter(row => row.kind === "rotation" && row.step.skill === "EchoesOfAThousandPlants")
          .every(row => !row.cooldownWait),
        "Cancelled Fan QQ must leave the preset's manual Umbrella Special available.",
      )
    }
    const deflectRows = timeline.filter(
      row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "DeflectSuccessful",
    )
    const manualAttackRows = timeline.filter(
      row =>
        row.step.type === "event" &&
        row.step.event === "TakeDamage" &&
        !("automatic" in row.step && row.step.automatic === "targetAttack") &&
        row.startTime - anchorTime < 60,
    )
    assert(manualAttackRows.length === 0, "The preset must not invent manual Take Damage events.")
    const automaticAttackRows = timeline.filter(
      row =>
        row.step.type === "event" &&
        row.step.event === "TakeDamage" &&
        "automatic" in row.step &&
        row.step.automatic === "targetAttack",
    )
    assert(
      automaticAttackRows.length === 20 &&
        automaticAttackRows.every(
          (row, index) => Math.abs(row.startTime - anchorTime - (5.5 + Math.floor(index / 2) * 6)) < 1e-9,
        ),
      "The preset must use only the standard paired dummy attacks every six seconds from 5.5 seconds.",
    )
    assert(
      deflectRows.every(row => row.startTime < 60),
      "Every requested Successful Deflect must occur before the one-minute battle end.",
    )
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, minSilkbind: 500, maxSilkbind: 500, precision: 1 }
    const weapons = ["panaceaFan", "soulshadeUmbrella"] as const
    const enemy: EnemyProfile = {
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
    const voidStats = { ...stats, minVoidAttack: 100, maxVoidAttack: 200 }
    const voidSnapshot = calculateHealingAttackSnapshot({
      stats: voidStats,
      attunement: emptyAttunementStats,
      skillTags: [],
      weapons: [...weapons],
      buffs: [],
      derivedStats: calculateDerivedStats(voidStats, 0, {}, [...weapons]),
      effects: [],
      enemy,
    })
    assert(
      Math.abs(voidSnapshot.averageSilkbindAttack - 650) < 1e-9,
      "World to Sword must include Deluge's Void Attack conversion in its effective Silkbind threshold snapshot.",
    )
    const timelineBundle = {
      ...timelineInput,
      initialResources: { Vitality: 100 },
      resourceMaximums: { Vitality: 100 },
      maxHP: 100000,
    }
    const simulate = (bundle: TimelineBuildInput) =>
      calculateRotationBaseline({
        timeline: bundle,
        startAnchor: { rowId: "rotation-0" },
        stats,
        attunement: emptyAttunementStats,
        enemy,
        derivedStats: calculateDerivedStats(stats, 0),
        weapons: [...weapons],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
    const baseline = simulate(timelineBundle)
    const groupResult = (groupSize: 1 | 5 | 10) => simulate({ ...timelineBundle, rotation: { ...rotation, groupSize } })
    const teamBaseline = groupResult(5)
    const groupBaseline = groupResult(10)
    const qiBladeHits = (result: ReturnType<typeof simulate>) =>
      result.metrics.breakdown.skills.find(skill => skill.id === "QiBlade")?.hits ?? 0
    assert(
      baseline.metrics.totalHealing < teamBaseline.metrics.totalHealing &&
        teamBaseline.metrics.totalHealing < groupBaseline.metrics.totalHealing,
      "Changing the WTS preset from Solo to Team to Group must increase recipient-weighted healing.",
    )
    assert(
      qiBladeHits(baseline) < qiBladeHits(teamBaseline) && qiBladeHits(teamBaseline) <= qiBladeHits(groupBaseline),
      "Changing the WTS preset group size must increase its overheal-driven Qi Blade triggers.",
    )
    const qiBladeBreakdown = baseline.metrics.breakdown.skills.find(skill => skill.id === "QiBlade")
    assert(qiBladeBreakdown?.hits, "The WTS preset must trigger Qi Blade damage before Battle End.")
    const worldToSwordCast = baseline.metrics.breakdown.casts.find(cast => cast.skillId === "WorldToSword")
    assert(
      worldToSwordCast?.casts === 2 && Math.abs(worldToSwordCast.damage - qiBladeBreakdown.damage) < 1e-9,
      "The WTS per-cast row must own all damage dealt by its triggered Qi Blades.",
    )
    assert(
      !baseline.metrics.breakdown.casts.some(cast => cast.skillId === "QiBlade"),
      "Triggered Qi Blades must not appear as a separate per-cast row.",
    )
    const displayedTimeline = mergeCalculatedTimelineState(timeline, baseline.timeline)
    assert(
      displayedTimeline.some(row => row.step.type === "skill" && row.step.skill === "QiBlade"),
      "The rotation editor timeline must retain worker-created Qi Blade rows.",
    )
  })
})
