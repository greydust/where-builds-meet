import * as v from "valibot"
import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs, normalizeGlobalDebuffs, type GlobalDebuffState } from "@/globalDebuffs"
import { globalDebuffStateSchema } from "@/schemas/storage"

type Selection = GlobalDebuffState["silkbindWings"]
function bundle(selection: Selection, wings = true, special = "RippleDawnsun", tier = "T6") {
  const result = buildPresetRotationBundle(
    {
      pathId: wings ? "silkbindWings" : "silkbindDeluge",
      martialArts: wings ? ["museflowWaistDrum", "willowbendFan"] : ["panaceaFan", "soulshadeUmbrella"],
      rotation: {
        name: "Wings support",
        ping: 0,
        start: { step: 0 },
        steps: [
          { type: "skill", skill: "VerdantGust" },
          { type: "skill", skill: special },
          { type: "skill", skill: "Observe" },
        ],
      } as RotationRecord,
      breakthrough: "17",
      globalDebuffs: { ...defaultGlobalDebuffs, silkbindWings: selection },
      food: "SimmeringFishSlices",
      script: "None",
      divinecraft: "Fire",
      skillOverrides: {},
      previewId: null,
    },
    wings ? "wings-fully-relayed-min" : "deluge-fully-relayed-min-ew",
  )!
  result.timeline.skills = {
    ...result.timeline.skills,
    Observe: { castTime: 1, tags: ["DirectDamage"], action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }] },
  }
  if (tier === "T0")
    result.timeline.innerWayRules = result.timeline.innerWayRules?.filter(
      rule => rule.source !== "HarmonySong" || rule.tier === 0,
    )
  return result
}

describe("global Wings support", () => {
  it("preserves old saved settings and validates selections", () => {
    expect(normalizeGlobalDebuffs({ floatingGrace: "mixed" })).toEqual({
      ...defaultGlobalDebuffs,
      floatingGrace: "mixed",
    })
    for (const silkbindWings of ["none", "yellow", "blue", "full"] as const)
      expect(normalizeGlobalDebuffs(v.parse(globalDebuffStateSchema, { silkbindWings })).silkbindWings).toBe(
        silkbindWings,
      )
    expect(normalizeGlobalDebuffs({ silkbindWings: "invalid" }).silkbindWings).toBe("none")
  })
  it.each(["RippleJadebreaker", "RippleDawnsun"])("keeps Yellow identical to None for Wings %s", special => {
    expect(calculateRotationBaseline(bundle("yellow", true, special)).metrics).toEqual(
      calculateRotationBaseline(bundle("none", true, special)).metrics,
    )
  })
  it.each(["blue", "full"] as const)("fixes %s duration without Dawnsun extending it again", selection => {
    for (const special of ["RippleJadebreaker", "RippleDawnsun"])
      for (const tier of ["T0", "T6"]) {
        const result = calculateRotationBaseline(bundle(selection, true, special, tier))
        const cast = result.timeline.find(row => row.step.skill === special)!
        const observed = result.timeline.find(row => row.step.skill === "Observe")!
        expect(observed.buffs.get("RadiantDrum")!.expiresAt! - cast.startTime).toBeCloseTo(
          selection === "blue" ? 10.5 : 20.5,
        )
      }
  })
  it.each([
    ["yellow", 6.5 / 20],
    ["blue", 10.5 / 20],
    ["full", 1],
  ] as const)("matches weighted attack and Cloudshear effects for another path: %s", (selection, radiant) => {
    const weighted = bundle(selection, false)
    weighted.timeline.rotation = { name: "Other path", ping: 0, steps: [{ type: "skill", skill: "Observe" }] }
    const actual = calculateRotationBaseline(weighted)
    const manual = bundle("none", false)
    manual.timeline.rotation = weighted.timeline.rotation
    manual.timeline.setupEffects.push({
      effect: {
        dmgBonus: 0.06,
        healingBonus: 0.06,
        physicalAttackBonus: 0.06 * radiant,
        bellstrikeAttackBonus: 0.03 * (1 - radiant) + 0.06 * radiant,
        stonesplitAttackBonus: 0.03 * (1 - radiant) + 0.06 * radiant,
        silkbindAttackBonus: 0.03 * (1 - radiant) + 0.06 * radiant,
        bamboocutAttackBonus: 0.03 * (1 - radiant) + 0.06 * radiant,
      },
    })
    expect(actual.metrics.totalDamage).toBeCloseTo(calculateRotationBaseline(manual).metrics.totalDamage, 8)
    const none = bundle("none", false)
    none.timeline.rotation = weighted.timeline.rotation
    expect(actual.metrics.totalDamage).toBeGreaterThan(calculateRotationBaseline(none).metrics.totalDamage)
  })
})
