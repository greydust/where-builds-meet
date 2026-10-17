import jadebreaker from "@gamedata/rotation/silkbind-wings/wings-dummy-1-min-jadebreaker.json"
import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { migrateRotation } from "@/application/rotationCatalog"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
import { deserializeSkillOverrides, serializeSkillOverrides } from "@/skillOverrides"

it.each([
  ["Rustling", "VerdantGust", "WillowbendFan"],
  ["CraneCry", "CranesCry", "MuseflowWaistDrum"],
] as const)("preserves saved %s casts and customized references as %s", (oldId, newId, category) => {
  const saved: RotationRecord = {
    name: "Saved Wings cast",
    start: { step: 0, action: 0 },
    steps: [{ type: "skill", skill: oldId }],
  }
  const restored = migrateRotation(saved)
  expect(restored.steps[0].skill).toBe(newId)
  expect(restored.start).toEqual(saved.start)
  const overrides = deserializeSkillOverrides({
    version: 4,
    overrides: {
      [category]: {
        [oldId]: { castTime: 2, tags: [oldId], action: [{ type: "damage", phyCoef: 7, time: 1 }] },
        CustomComposite: { subAction: [{ value: oldId }] },
      },
    },
  })
  expect(overrides[category]?.[newId]).toEqual({
    castTime: 2,
    tags: [newId],
    action: [{ type: "damage", phyCoef: 7, time: 1 }],
  })
  expect(overrides[category]).not.toHaveProperty(oldId)
  expect(overrides[category]?.CustomComposite.subAction).toEqual([{ value: newId }])
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(overrides)))).toEqual(overrides)
})

it("restores saved End of Gale rotations without changing their damage or anchors", () => {
  const current = jadebreaker as RotationRecord
  const saved = structuredClone(current)
  for (const step of saved.steps) {
    if (step.type === "skill" && step.skill === "EndOfGale") step.skill = "FiendishSquall"
  }
  const migrated = migrateRotation(saved)
  expect(migrated.start).toEqual(current.start)
  expect(migrated.steps.filter(step => step.type === "skill" && step.skill === "EndOfGale")).toHaveLength(3)
  const calculate = (rotation: RotationRecord) =>
    calculateRotationBaseline(
      buildPresetRotationBundle(
        {
          pathId: "silkbindWings",
          martialArts: ["museflowWaistDrum", "willowbendFan"],
          rotation,
          breakthrough: "17",
          globalDebuffs: { ...defaultGlobalDebuffs },
          food: "SimmeringFishSlices",
          divinecraft: "Fire",
          script: "None",
          skillOverrides: {},
          previewId: null,
        },
        "wings-fully-relayed-min",
      )!,
    )
  const actual = calculate(migrated)
  const expected = calculate(current)
  expect(actual.metrics.totalDamage).toBe(expected.metrics.totalDamage)
  expect(actual.duration).toBe(expected.duration)
  expect(actual.anchorTime).toBe(expected.anchorTime)
})

it("preserves customized End of Gale overrides and nested references across migration and reload", () => {
  const overrides = deserializeSkillOverrides({
    version: 4,
    overrides: {
      WillowbendFan: {
        FiendishSquall: {
          castTime: 2.5,
          tags: ["Fan", "FiendishSquall"],
          action: [{ type: "damage", phyCoef: 7, time: 1.5 }],
        },
      },
      Debuff: {
        Cuncao: {
          effect: [{ requirement: [{ target: "skillTag", value: "FiendishSquall" }], effect: { baseDMGBonus: 0.2 } }],
        },
      },
    },
  })
  expect(overrides.WillowbendFan?.EndOfGale).toEqual({
    castTime: 2.5,
    tags: ["Fan", "EndOfGale"],
    action: [{ type: "damage", phyCoef: 7, time: 1.5 }],
  })
  expect(overrides.WillowbendFan).not.toHaveProperty("FiendishSquall")
  expect(overrides.Debuff?.Cuncao.effect).toEqual([
    { requirement: [{ target: "skillTag", value: "EndOfGale" }], effect: { baseDMGBonus: 0.2 } },
  ])
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(overrides)))).toEqual(overrides)
})

it("restores saved Rhythm of Accord casts and customized composite references", () => {
  const saved: RotationRecord = {
    name: "Saved drum VC",
    eventTimeReference: "battleStart",
    start: { step: 0, action: 0 },
    steps: [{ type: "skill", skill: "HarmoniousDrum" }],
  }
  const restored = migrateRotation(saved)
  expect(restored.steps[0].skill).toBe("RhythmOfAccord")
  expect(restored.start).toEqual(saved.start)
  const overrides = deserializeSkillOverrides({
    version: 4,
    overrides: {
      MuseflowWaistDrum: {
        HarmoniousDrum: {
          castTime: 1.5,
          tags: ["HarmoniousDrum"],
          action: [{ type: "damage", phyCoef: 9, time: 0.5 }],
        },
        RibbonHeavyComboVC: { subAction: [{ value: "HarmoniousDrum" }] },
      },
    },
  })
  expect(overrides.MuseflowWaistDrum?.RhythmOfAccord).toEqual({
    castTime: 1.5,
    tags: ["RhythmOfAccord"],
    action: [{ type: "damage", phyCoef: 9, time: 0.5 }],
  })
  expect(overrides.MuseflowWaistDrum?.RibbonHeavyComboVC.subAction).toEqual([{ value: "RhythmOfAccord" }])
  expect(overrides.MuseflowWaistDrum).not.toHaveProperty("HarmoniousDrum")
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(overrides)))).toEqual(overrides)
})
