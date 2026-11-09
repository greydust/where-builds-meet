import { describe, expect, it } from "vitest"

import type { PathId } from "@/application/contracts"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { arsenalEffectFor, defaultSettings, systemStatEffectsForProgression } from "@/application/gameData/setup"
import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"
import { defaultBuildPresets } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

const settings = (breakthrough: string) => ({ ...defaultSettings, breakthrough })

describe("Enhancement and Arsenal progression", () => {
  it("builds every path's preset with resolved Level 25 progression", () => {
    for (const preset of defaultBuildPresets) {
      const entry = Object.entries(typedPathDefinitions).find(([, path]) => path.buildGroup === preset.buildGroup)
      if (!entry || preset.martialArts?.length !== 2) continue
      const pathId = entry[0] as PathId
      const bundle = buildPresetRotationBundle(
        {
          pathId,
          martialArts: [preset.martialArts[0], preset.martialArts[1]],
          breakthrough: "25",
          rotation: { name: "Level 25 preset coverage", steps: [] },
          food: "None",
          divinecraft: "None",
          script: "None",
          globalDebuffs: defaultGlobalDebuffs,
          skillOverrides: {},
          previewId: null,
        },
        preset.id,
      )!
      expect(bundle).toBeDefined()
      const fields = Object.keys(emptyStats) as Array<keyof typeof emptyStats>
      expect(fields.every(key => Number.isFinite(bundle.stats[key]))).toBe(true)
      expect(JSON.stringify(bundle.timeline.setupEffects)).not.toContain("bySoloLevel")
    }
  })
  it.each([
    { soloLevel: 17, minPhys: 240, maxPhys: 480, maxHp: 40070, physicalDefense: 120 },
    { soloLevel: 18, minPhys: 258, maxPhys: 516, maxHp: 43147, physicalDefense: 130 },
    { soloLevel: 19, minPhys: 276, maxPhys: 552, maxHp: 46223, physicalDefense: 138 },
    { soloLevel: 25, minPhys: 392, maxPhys: 780, maxHp: 66944, physicalDefense: 196 },
  ])("applies exported cumulative Enhancement totals at Solo Level $soloLevel", ({ soloLevel, ...expected }) => {
    const effects = systemStatEffectsForProgression(soloLevel, soloLevel).filter(effect => "id" in effect)
    expect(calculateStatsWithEffects(emptyStats, effects, 0).rawStats).toMatchObject(expected)
  })

  it.each([
    ["General", "Phys"],
    ["Bellstrike", "Bellstrike"],
    ["Stonesplit", "Stonesplit"],
    ["Silkbind", "Silkbind"],
    ["Bamboocut", "Bamboocut"],
  ])("applies %s Arsenal attack in its channel and HP at both Solo Levels", (selection, channel) => {
    const calculate = (breakthrough: string) =>
      calculateStatsWithEffects(emptyStats, [arsenalEffectFor(selection, settings(breakthrough))], 0).rawStats
    const before = calculate("17")
    expect(before).toMatchObject({ [`min${channel}`]: 131, [`max${channel}`]: 263, maxHp: 27300 })
    expect(calculate("18")).toMatchObject({ [`min${channel}`]: 148, [`max${channel}`]: 297, maxHp: 31700 })
    expect(calculate("19")).toEqual(calculate("18"))
    expect(calculate("25")).toMatchObject({ [`min${channel}`]: 211, [`max${channel}`]: 423, maxHp: 54500 })
    expect(calculate("17")).toEqual(before)
  })

  it.each(["17", "18", "19", "20", "21", "22", "23", "24", "25"])(
    "passes resolved progression into the production worker bundle at breakthrough %s",
    breakthrough => {
      const bundle = buildPresetRotationBundle(
        {
          pathId: "stonesplitStrength",
          martialArts: ["snowparting", "phalanxbane"],
          breakthrough,
          rotation: { name: "Progression probe", steps: [{ type: "skill", skill: "AnxiSoldierBurningHeart2" }] },
          food: "None",
          divinecraft: "None",
          script: "None",
          globalDebuffs: defaultGlobalDebuffs,
          skillOverrides: {},
          previewId: null,
        },
        "mixed-fully-relayed-double-min",
      )!
      expect(bundle.timeline.setupEffects).toContainEqual(arsenalEffectFor("Stonesplit", settings(breakthrough)))
      const enhancement = systemStatEffectsForProgression(Number(breakthrough), Number(breakthrough)).find(
        effect => "id" in effect,
      )!
      expect(bundle.timeline.setupEffects).toContainEqual(enhancement)
      expect(JSON.stringify(bundle.timeline.setupEffects)).not.toContain("bySoloLevel")
    },
  )

  it("raises conversion caps and attribute attack at rank 21", () => {
    const stats = { ...emptyStats, agility: 1000, power: 1000, body: 1000 }
    const calculate = (rank: number) =>
      calculateStatsWithEffects(
        stats,
        martialArtEffectsForRank(martialArtDefinitions, ["snowparting", "stormbreaker", "thundercry"], rank),
        0,
      ).stats
    const before = calculate(15)
    const after = calculate(21)
    expect(after.minPhys - before.minPhys).toBeCloseTo((528 - 325) * 0.264, 10)
    expect(after.maxPhys - before.maxPhys).toBeCloseTo((528 - 325) * 0.264, 10)
    expect(after.maxHp - before.maxHp).toBeCloseTo((528 - 325) * 10, 10)
    expect(after.minStonesplit).toBe(176 * 3)
    expect(after.maxStonesplit).toBe(352 * 3)
  })
})
