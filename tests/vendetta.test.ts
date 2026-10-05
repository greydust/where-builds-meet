import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, InnerWayEffectRule, TimelineRow, RotationStep } from "@/calculations/rotationTimeline"
import type { WeaponId } from "@/types"

import type { RotationSimulationBaseline } from "../src/calculations/rotationCalculator.ts"
import { assertClose } from "./helpers/floatEquality"
import { castStep, delayStep } from "./helpers/rotationSteps"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowCasting } from "./helpers/timelineRows"

// Ported from script/probe/check-vendetta.mjs.
describe("vendetta", () => {
  it("Vendetta cumulative tiers, extended Rodent triggers, exact expiry, refresh, and expected/sampled checks passed", async () => {
    /**
     * The two weapon orders this spec uses, which are deliberately different.
     *
     * The timeline is built with Infernal leading and Mortal following, while the
     * Mortal talent table is read with Mortal leading. Weapon order decides which
     * martial art is the main one, so each use keeps the order it was written with.
     */
    const weapons: WeaponId[] = ["infernalTwinblades", "mortalRopeDart"]
    const talentOrder: WeaponId[] = ["mortalRopeDart", "infernalTwinblades"]
    const vendetta = await import("../data/innerway/vendetta.json")
    const buffs = asEffectDefinitions((await import("../data/buff/bamboocut-wind.json")).default)
    const debuffs = asEffectDefinitions((await import("../data/debuff/bamboocut-wind.json")).default)
    const mortal = asSkillRecords((await import("../data/skill/mortal-rope-dart.json")).default)
    const infernal = asSkillRecords((await import("../data/skill/infernal-twinblades.json")).default)
    const vendettaTiers = Object.entries(vendetta.default.effect).sort(
      ([left], [right]) => Number(left.slice("VendettaT".length)) - Number(right.slice("VendettaT".length)),
    ) as Array<[string, { effect?: EditableObject[] }]>
    // An empty literal is not assignable to Record<string, unknown>, so the no-op effect is named.
    const noEffect: EditableObject = {}
    const vendettaRules = (tier: number): InnerWayEffectRule[] =>
      tier < 0
        ? []
        : vendettaTiers
            .slice(0, tier + 1)
            .flatMap(([, definition], index) =>
              (definition.effect ?? []).map((effect): InnerWayEffectRule =>
                Object.assign({ effect: noEffect }, effect, { source: "Vendetta", tier: index }),
              ),
            )
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts")
    const build = (tier: number, steps: RotationStep[], roll?: () => number): TimelineRow[] =>
      buildRotationTimeline(
        {
          rotation: { name: "Vendetta lifetime", steps },
          skills: { ...mortal, ...infernal },
          effectDefinitions: { ...buffs, ...debuffs },
          dots: {},
          eventDefinitions: {},
          weapons,
          innerWayConditions: [],
          setupEffects: [],
          innerWayRules: vendettaRules(tier),
        },
        roll,
      )
    const rodent = (rows: TimelineRow[]) => rows.filter(row => row.step.skill === "Rodent")
    const lateAttack = [castStep("RodentRampage"), delayStep(14), castStep("InfernalLight1")]
    assert.equal(
      rodent(build(-1, lateAttack)).length,
      0,
      "Without Vendetta, the 10-second buff expires before the late attack",
    )
    for (const roll of [undefined, () => 0.5]) {
      for (let tier = 0; tier <= 6; tier++) {
        const duration = tier < 4 ? 15 : 20
        const rows = build(tier, lateAttack, roll)
        assert.equal(rodent(rows).length, 1, "Every Vendetta tier retains T0 and enables attacks after ten seconds")
        const buff = rowCasting(rows, "InfernalLight1").actionStates[0]?.buffs.get("RodentRampage")
        assert(buff, `Every Vendetta tier must extend the Rodent Rampage buff.`)
        assert.ok(
          Math.abs((buff.expiresAt ?? 0) - (duration + 0.541)) < 1e-9,
          "Vendetta sets the total duration to 15 seconds, upgraded to 20 at T4",
        )
        assert.equal(buff.stack, 1, "Duration extension preserves the one-stack cap")
        for (const [offset, expected] of [
          [-0.001, 1],
          [0, 0],
        ]) {
          const boundary = build(
            tier,
            [castStep("RodentRampage"), delayStep(duration - 0.339 + offset), castStep("InfernalLight1")],
            roll,
          )
          assert.equal(rodent(boundary).length, expected, "Rodent attacks stop at the selected tier's exact expiry")
        }
      }
    }
    assert.equal(
      rodent(build(0, [castStep("RodentRampage"), delayStep(15 - 0.339), castStep("InfernalLight1")])).length,
      0,
      "Extended buff expires at the exact 15-second boundary",
    )
    const refresh = build(0, [
      castStep("RodentRampage"),
      delayStep(14),
      castStep("RodentRampage"),
      delayStep(14),
      castStep("InfernalLight1"),
    ])
    assert.equal(rodent(refresh).length, 1, "Recasting refreshes the full extended lifetime")
    const refreshed = Array.from(rowCasting(refresh, "InfernalLight1").actionStates[0].buffs.values()).filter(
      buff => buff.name === "RodentRampage",
    )
    assert.equal(refreshed.length, 1, "Refresh still produces one buff")
    const [onlyRefresh] = refreshed
    assert(onlyRefresh, "Refresh still produces one Rodent Rampage buff.")
    assert.ok(
      Math.abs((onlyRefresh.expiresAt ?? 0) - 30.082) < 1e-9,
      "Refresh expiration is measured from the new application",
    )
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBamboocut: 80, maxBamboocut: 80, precision: 1 }
    const enemy = {
      name: "Vendetta target",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const damageRun = (
      withToken: boolean,
      t6 = false,
      setupEffects: EditableObject[] = [],
    ): RotationSimulationBaseline =>
      calculateRotationBaseline({
        timeline: {
          rotation: {
            name: "Vendetta Token damage",
            steps: [
              castStep("RodentRampage"),
              castStep(withToken ? "BladeboundThreadCancel" : "Wait"),
              castStep("InfernalLight1"),
              delayStep(0.5),
            ],
          },
          skills: { ...mortal, ...infernal, Wait: { castTime: 0.385, action: [] } },
          effectDefinitions: { ...buffs, ...debuffs },
          dots: {},
          eventDefinitions: {},
          weapons,
          innerWayConditions: [],
          innerWayRules: t6
            ? (vendettaTiers[6]?.[1].effect ?? []).map((effect): InnerWayEffectRule =>
                Object.assign({ effect: noEffect }, effect, { source: "Vendetta", tier: 6 }),
              )
            : [],
          setupEffects,
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        weapons,
        attunement: emptyAttunementStats,
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
    const close = (a: number | undefined, b: number, message: string) => assertClose(a, b, 1e-8, message)
    const tokenExpiry = (row: TimelineRow) => {
      const token = row.actionStates[0]?.debuffs.get("VendettaToken")
      assert(token, "The Infernal Light cast must carry the Vendetta Token.")
      return token.expiresAt
    }
    const procDamage = (result: RotationSimulationBaseline) => {
      const row = rowCasting(result.timeline, "Rodent")
      return result.actionBreakdowns[row.id + ":0"].total
    }
    const unbuffed = damageRun(false)
    const token = damageRun(true)
    const tokenT6 = damageRun(true, true)
    close(procDamage(token) / procDamage(unbuffed), 1.5, "Vendetta Token adds 50% Rodent general damage")
    close(procDamage(tokenT6) / procDamage(unbuffed), 1.8, "T6 adds 30% to Token's general damage bonus")
    close(procDamage(damageRun(false, true)), procDamage(unbuffed), "T6 has no effect without the target mark")
    close(
      token.actionBreakdowns["rotation-2:0"].total,
      unbuffed.actionBreakdowns["rotation-2:0"].total,
      "Token does not increase ordinary light damage",
    )
    const existingBonuses: EditableObject[] = [{ effect: { baseDMGBonus: 0.2, dmgBonus: 0.4 } }]
    close(
      procDamage(damageRun(true, true, existingBonuses)) / procDamage(unbuffed),
      1.2 * 2.2,
      "Base damage and Category 1 bonuses add within their own categories",
    )
    for (const roll of [undefined, () => 0.5]) {
      const rows = build(
        -1,
        [castStep("BladeboundThreadCancel"), castStep("BladeboundThreadCancel"), castStep("InfernalLight1")],
        roll,
      )
      const casts = rows.filter(row => row.step.skill === "BladeboundThreadCancel")
      const [firstCast, secondCast] = casts
      assert(firstCast && secondCast, "Both cancel casts must appear on the timeline.")
      close(firstCast.effectiveCastTime, 0.385, "Cancel cast ends at the supplied hit time")
      close(Number(firstCast.actions[0]?.time), 0.385, "Cancel hit uses the supplied local time")
      assert.ok(!firstCast.actionStates[0]?.debuffs.has("VendettaToken"), "Token is applied after the initial damage")
      close(secondCast.startTime, 8, "Repeated cancel casts honor the eight-second cooldown")
      const active = Array.from(rowCasting(rows, "InfernalLight1").actionStates[0].debuffs.values()).filter(
        buff => buff.name === "VendettaToken",
      )
      assert.equal(active.length, 1, "Reapplication refreshes one Token debuff")
      assert.ok(
        rows.every(row => !row.buffs.has("VendettaToken")),
        "Token never becomes a player buff",
      )
      assert.equal(active[0].stack, 1, "Token does not stack damage on recast")
      close(active[0].expiresAt, 18.385, "Token refresh starts ten seconds at its new application")
      for (const [tier, duration] of [
        [-1, 10],
        [0, 15],
        [1, 20],
        [6, 20],
      ]) {
        const lifetime = build(
          tier,
          [castStep("BladeboundThreadCancel"), delayStep(duration - 0.339), castStep("InfernalLight1")],
          roll,
        )
        const hit = rowCasting(lifetime, "InfernalLight1")
        assert.ok(
          !hit.actionStates[0].debuffs.has("VendettaToken"),
          "Token expires at its exact tier-adjusted boundary",
        )
        const before = rowCasting(
          build(tier, [castStep("BladeboundThreadCancel"), castStep("InfernalLight1")], roll),
          "InfernalLight1",
        )
        close(tokenExpiry(before), 0.385 + duration, "Token duration uses the selected tier")
      }
    }
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    for (const rank of [12, 13]) {
      const rows = buildRotationTimeline({
        rotation: {
          name: "Bladebound talent",
          steps: [castStep("BladeboundThreadCancel"), castStep("InfernalLight1")],
        },
        skills: { ...mortal, ...infernal },
        effectDefinitions: { ...buffs, ...debuffs },
        dots: {},
        eventDefinitions: {},
        weapons,
        innerWayRules: [],
        innerWayConditions: [],
        setupEffects: martialArtEffectsForRank(
          { mortalRopeDart: martialArtDefinitions.mortalRopeDart },
          talentOrder,
          rank,
        ),
      })
      const corrosion = rowCasting(rows, "InfernalLight1").actionStates[0].debuffs.get("BoneCorrosion")
      assert.equal(Boolean(corrosion), rank === 13, "Bladebound Thread activates Bone Corrosion only with the talent")
      if (corrosion) close(corrosion.expiresAt, 5.385, "Bone Corrosion starts its five-second lifetime at the hit")
    }
  })
})
