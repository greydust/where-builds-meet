import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditableObject, RotationStep, SkillRecord, TrackedEffect } from "@/calculations/rotationTimeline"
import type { CharacterStats } from "@/types"

import { isClose } from "./helpers/floatEquality"
import { asEffectDefinitions } from "./helpers/shippedData"

// Ported from script/probe/check-global-debuff-controls.mjs.
describe("global-debuff-controls", () => {
  it("Global debuff control and conditional-effect checks passed", async () => {
    const { calculateRotationBaseline } = await import("@/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("@/calculations/effectiveStats.ts")
    const { emptyStats } = await import("@/data/statDefinitions.ts")
    const { defaultGlobalDebuffs, globalBuffTimelineEffects, globalDebuffTimelineEffects, normalizeGlobalDebuffs } =
      await import("@/globalDebuffs.ts")
    const delugeBuffs = (await import("@gamedata/buff/silkbind-deluge.json")).default
    const generalBuffs = (await import("@gamedata/buff/general.json")).default
    const generalDebuffs = (await import("@gamedata/debuff/general.json")).default
    const strengthDebuffs = (await import("@gamedata/debuff/stonesplit-strength.json")).default
    const mightDebuffs = (await import("@gamedata/debuff/stonesplit-might.json")).default
    const splendorDebuffs = (await import("@gamedata/debuff/bellstrike-splendor.json")).default
    const umbraDebuffs = (await import("@gamedata/debuff/bellstrike-umbra.json")).default
    const dustDebuffs = (await import("@gamedata/debuff/bamboocut-dust.json")).default
    const innerWayDebuffs = (await import("@gamedata/debuff/innerway.json")).default
    const draughtDebuffs = (await import("@gamedata/debuff/bamboocut-draught.json")).default
    const scripts = (await import("@gamedata/script.json")).default
    const effectDefinitions = asEffectDefinitions({
      ...generalBuffs,
      ...draughtDebuffs,
      ...delugeBuffs,
      ...generalDebuffs,
      ...strengthDebuffs,
      ...mightDebuffs,
      ...splendorDebuffs,
      ...umbraDebuffs,
      ...dustDebuffs,
      ...innerWayDebuffs,
    })
    const closeTo = (actual: number, expected: number) => isClose(actual, expected, 1e-9)
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 }
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 408,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const exhaustedEvent: SkillRecord = {
      name: "Exhausted",
      castTime: 0,
      action: [{ type: "apply", target: "target", value: "Exhausted", stack: 1, time: 0 }],
      tags: ["Event"],
    }
    const hit = (tags: string[] = [], appliesFearful = false): SkillRecord => ({
      name: "Hit",
      castTime: 1,
      action: [
        ...(appliesFearful ? [{ type: "apply", target: "target", value: "FearfulBlade", stack: 1, time: 0 }] : []),
        { type: "damage", phyCoef: 1, attrCoef: 1, time: 1 },
      ],
      tags,
    })
    const result = (
      initialDebuffs: TrackedEffect[] = [],
      tags: string[] = [],
      exhausted = false,
      appliesFearful = false,
      initialBuffs: TrackedEffect[] = [],
      nextStats: CharacterStats = stats,
      setupEffects: EditableObject[] = [],
    ): number => {
      // Exhausted is a target debuff, so the fight has to start on the event
      // that applies it. Nothing reaches the target during prepull.
      const steps: RotationStep[] = exhausted
        ? [
            { type: "skill", skill: "Hit" },
            { type: "event", event: "Exhausted", startTime: 0 },
          ]
        : [{ type: "skill", skill: "Hit" }]
      return calculateRotationBaseline({
        timeline: {
          rotation: { name: "Probe", steps, start: { step: 0 } },
          skills: { Hit: hit(tags, appliesFearful) },
          eventDefinitions: { Exhausted: exhaustedEvent },
          dots: {},
          effectDefinitions,
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects,
          weapons: [],
          initialDebuffs,
          initialBuffs,
        },
        startAnchor: { rowId: "rotation-0" },
        stats: nextStats,
        attunement: emptyAttunementStats,
        enemy,
        derivedStats: calculateDerivedStats(nextStats, 0),
        weapons: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }).metrics.dps
    }

    assert(
      JSON.stringify(normalizeGlobalDebuffs(null)) === JSON.stringify(defaultGlobalDebuffs),
      "Missing stored controls must migrate to the all-off default.",
    )
    for (const [saved, names] of [
      [{}, []],
      [{ strayhuntDraught: true }, ["Strayhunt"]],
      [{ wildstrideDraught: true }, ["Strayhunt", "Wildstride"]],
      [{ draught: "none", wildstrideDraught: true }, []],
      [{ draught: "strayhunt" }, ["Strayhunt"]],
      [{ draught: "both" }, ["Strayhunt", "Wildstride"]],
    ]) {
      assert.deepEqual(
        globalDebuffTimelineEffects(normalizeGlobalDebuffs(saved)).map(effect => effect.name),
        names,
        "Saved stages and legacy toggles must activate exactly their intended debuffs.",
      )
    }
    const phantomEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, phantomChime: true })
    assert(
      phantomEffects[0]?.name === "PhantomChime" && phantomEffects[0]?.stack === 5 && phantomEffects[0]?.persistent,
      "Phantom Chime On must initialize a permanent maximum-stack debuff.",
    )
    const soulEffects = globalDebuffTimelineEffects(normalizeGlobalDebuffs({ soulShaken: true }))
    assert(
      soulEffects[0]?.name === "SoulShaken" && soulEffects[0]?.stack === 5 && soulEffects[0]?.persistent,
      "Soul-Shaken On must initialize a permanent maximum-stack debuff.",
    )
    assert.deepEqual(
      soulEffects.map(effect => effect.name),
      ["SoulShaken", "ShatteredStone"],
    )
    assert(
      soulEffects.every(effect => effect.persistent),
      "Both Umbra support debuffs must remain active.",
    )
    assert(
      closeTo(result(soulEffects), result([], [], false, false, [], stats, [{ effect: { defenseBonus: -0.05 } }])),
      "The saved Umbra toggle must reduce defense for ordinary non-Umbra hits by 5%.",
    )
    assert(
      closeTo(
        result(soulEffects, ["DOT"]),
        result([{ name: "SoulShaken", stack: 5 }], ["DOT"], false, false, [], stats, [
          { effect: { defenseBonus: -0.05 } },
        ]),
      ),
      "The Umbra toggle must combine Soul-Shaken's DoT bonus with Shattered Stone's defense reduction.",
    )
    const qingyiEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, qingyisCharm: "T6" })
    assert(
      qingyiEffects[0]?.name === "QingyisCharmT6" && qingyiEffects[0]?.stack === 5 && qingyiEffects[0]?.persistent,
      "Bitter Seasons T6 must initialize its permanent maximum-stack debuff.",
    )

    assert.equal(normalizeGlobalDebuffs({}).bossTalent, 0)
    assert.equal(normalizeGlobalDebuffs({ bossTalent: 15 }).bossTalent, 0)
    const bossEffects = globalBuffTimelineEffects(normalizeGlobalDebuffs({ bossTalent: 0.15 }))
    const baseline = result([])
    assert(closeTo(result([], [], false, false, bossEffects) / baseline, 1.15))
    const combinedEffects = globalBuffTimelineEffects({
      ...defaultGlobalDebuffs,
      bossTalent: 0.15,
      floatingGrace: "mixed",
    })
    assert(closeTo(result([], [], false, false, combinedEffects) / baseline, 1.25))
    const mixedGraceEffects = globalBuffTimelineEffects({ ...defaultGlobalDebuffs, floatingGrace: "mixed" })
    const delugeGraceEffects = globalBuffTimelineEffects({ ...defaultGlobalDebuffs, floatingGrace: "deluge" })
    assert(
      mixedGraceEffects[0]?.name === "FloatingGrace" && mixedGraceEffects[0]?.persistent,
      "Floating Grace Mixed must initialize the permanent 10% base buff.",
    )
    assert(
      delugeGraceEffects[0]?.name === "FloatingGraceDeluge" && delugeGraceEffects[0]?.persistent,
      "Floating Grace Deluge must initialize the permanent 24% Deluge buff.",
    )
    assert(
      closeTo(result([], [], false, false, mixedGraceEffects) / baseline, 1.1),
      "Floating Grace Mixed must increase general damage by 10%.",
    )
    assert(
      closeTo(result([], [], false, false, delugeGraceEffects) / baseline, 1.24),
      "Floating Grace Deluge must increase general damage by 24%.",
    )
    const phantom = result(phantomEffects)
    assert(
      closeTo(phantom / baseline, 1.05),
      "Phantom Chime must reduce flat Physical Resistance through the full rotation path.",
    )
    const qingyi = result(qingyiEffects)
    assert(
      closeTo(qingyi, (1000 - 408 * 0.94) * 1.05),
      "Qingyi's Charm T6 must combine defense and Physical Resistance reductions.",
    )

    const vulnerableEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, vulnerable: true })
    assert(
      closeTo(result(vulnerableEffects) / baseline, 1.08),
      "Vulnerable must give its shared 8% to non-Might damage.",
    )
    assert(
      closeTo(result(vulnerableEffects, ["StormbreakerSpear"]) / baseline, 1.18),
      "Vulnerable must give an additional 10% to Might damage.",
    )
    const fearfulEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, fearfulBlade: true })
    assert(
      closeTo(result(fearfulEffects, ["SnowpartingBlade"]) / baseline, 1.08),
      "Fearful Blade must give its conditional 8% to Strength damage.",
    )
    assert(
      closeTo(result(fearfulEffects, ["SnowpartingBlade"], false, true) / baseline, 1.08),
      "A rotation-applied Fearful Blade must merge with the permanent global debuff instead of doubling it.",
    )

    const qiEffects = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, qiImbalance: true })
    assert(closeTo(result(qiEffects) / baseline, 1), "Qi Imbalance's HP bonus must remain inactive outside Exhausted.")
    const strayhunt = globalDebuffTimelineEffects({ ...defaultGlobalDebuffs, draught: "strayhunt" })
    assert(
      closeTo(result(strayhunt) / baseline, 1.02),
      "Strayhunt increases physical damage through the global control.",
    )
    assert(normalizeGlobalDebuffs({ qiImbalance: true }).draught === "none", "Legacy controls keep Strayhunt disabled.")
    for (const channel of ["Bellstrike", "Stonesplit", "Silkbind", "Bamboocut"]) {
      const channelStats = {
        ...stats,
        minPhys: 0,
        maxPhys: 0,
        ["min" + channel]: 1000,
        ["max" + channel]: 1000,
        [channel.toLowerCase() + "DmgBonus"]: 0.2,
      }
      const channelBaseline = result([], [], false, false, [], channelStats)
      assert(
        closeTo(result(strayhunt, [], false, false, [], channelStats) / channelBaseline, 1.22 / 1.2),
        "Strayhunt adds to existing " + channel + " bonus.",
      )
      assert(
        closeTo(
          result(strayhunt, [], false, false, [], channelStats, [scripts.Convergence.effect]) / channelBaseline,
          1.37 / 1.2,
        ),
        "Convergence and Strayhunt add in the " + channel + " category.",
      )
      if (channel === "Bellstrike") {
        const exhaustedChannel = result([], [], true, false, [], channelStats)
        assert(
          closeTo(
            result([...strayhunt, ...qiEffects], [], true, false, [], channelStats) / exhaustedChannel,
            (1.32 / 1.2) * (1.2 / 1.1),
          ),
          "Qi Imbalance adds Bellstrike bonus separately from its global HP bonus.",
        )
      }
    }
    const exhaustedBaseline = result([], [], true)
    const exhaustedQi = result(qiEffects, [], true)
    assert(
      closeTo(exhaustedQi / exhaustedBaseline, 1.2 / 1.1),
      "Qi Imbalance must add 10% to the global category during Exhausted.",
    )
  })
})
