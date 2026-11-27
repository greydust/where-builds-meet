import { describe, expect, it } from "vitest"

import { defaultSkillMaps } from "@/application/gameData/skills"
import type { TimelineRow } from "@/calculations/rotationTimeline"
import { readableRotationText } from "@/readableRotation"

// Ported from script/probe/check-readable-rotation.mjs.
function skillRow(
  index: number,
  startTime: number,
  castTime: number,
  shortName: string,
  actions = [{ type: "damage", time: castTime }],
) {
  return {
    id: `rotation-${index}`,
    kind: "rotation",
    rotationIndex: index,
    order: index * 1000,
    step: { type: "skill", skill: `Skill${index}` },
    startTime,
    effectiveCastTime: castTime,
    skill: { name: `Skill ${index}`, shortName },
    actions,
    buffs: new Map(),
    debuffs: new Map(),
    modifierEffects: [],
    actionStates: {},
  }
}

describe("readableRotationText", () => {
  const timeline = [
    skillRow(0, 0, 1, "One"),
    skillRow(1, 1, 2, "Two", [
      { type: "damage", time: 0.5 },
      { type: "damage", time: 1 },
      { type: "damage", time: 1 },
    ]),
    skillRow(2, 3, 1, "Three"),
    skillRow(3, 4, 1, "Four"),
    {
      id: "rotation-4",
      kind: "rotation",
      rotationIndex: 4,
      order: 4000,
      step: { type: "event", event: "Qi", after: { action: 0 }, targetQiRatio: 0 },
      startTime: 3.5,
      effectiveCastTime: 0,
      skill: {},
      actions: [],
      buffs: new Map(),
      debuffs: new Map(),
      modifierEffects: [],
      actionStates: {},
    },
  ] as unknown as TimelineRow[]

  it("formats action-level anchors with hit modifiers", () => {
    expect(readableRotationText(timeline, { rowId: "rotation-1", actionIndex: 2 }, 2)).toBe(
      "One (-2s) > Two (start at hit 3) > Three (break) > Four",
    )
  })

  it("formats skill-level anchors with the start modifier", () => {
    expect(readableRotationText(timeline, { rowId: "rotation-1" }, 1)).toBe(
      "One (-1s) > Two (start) > Three (break) > Four",
    )
  })

  it("collapses consecutive identical skills without merging later occurrences", () => {
    const repeatedTimeline = [
      skillRow(0, 0, 1, "One"),
      skillRow(1, 1, 1, "One"),
      skillRow(2, 2, 1, "One"),
      skillRow(3, 3, 1, "Two"),
      skillRow(4, 4, 1, "One"),
    ] as unknown as TimelineRow[]

    expect(readableRotationText(repeatedTimeline, { rowId: "missing" }, 0)).toBe("One x3 > Two > One")
    expect(readableRotationText(repeatedTimeline, { rowId: "rotation-1" }, 1)).toBe(
      "One (-1s) > One (start) > One > Two > One",
    )
  })

  it("shows authored waits and holds alongside combat markers", () => {
    const heldSkill = skillRow(2, 1, 4, "Spring Away")
    const sequence = [
      { ...skillRow(0, 0, 0.5, ""), step: { type: "event", event: "Delay", duration: 0.5 } },
      { ...skillRow(1, 0.5, 0.5, ""), step: { type: "event", event: "Delay", duration: 0.5, automatic: "cooldown" } },
      { ...heldSkill, step: { ...heldSkill.step, duration: 4, causesBreak: true } },
    ] as unknown as TimelineRow[]

    expect(readableRotationText(sequence, { rowId: "rotation-2" }, 1)).toBe(
      "Wait 0.5s > Spring Away (hold 4s, start, break)",
    )
  })

  it("shows the weapon once for consecutive skills and keeps repeated casts grouped", () => {
    const q = skillRow(0, 0, 1, "Heng Q")
    const sequence = [
      { ...q, skill: defaultSkillMaps.Snowparting.SnowpartingQ },
      { ...skillRow(1, 1, 1, "Heng Q"), skill: defaultSkillMaps.Snowparting.SnowpartingQ },
      { ...skillRow(2, 2, 1, "Heng Special"), skill: defaultSkillMaps.Snowparting.SnowpartingSpecial },
      { ...skillRow(3, 3, 1, "Heng Stab"), skill: defaultSkillMaps.Snowparting.SnowpartingQStab },
      { ...skillRow(4, 4, 1, "Heng Slash"), skill: defaultSkillMaps.Snowparting.SnowpartingQSlash },
      { ...skillRow(5, 5, 1, "Blue Q"), skill: defaultSkillMaps.BoshanQuyueSpear.BoltBlueQ },
    ] as unknown as TimelineRow[]

    expect(readableRotationText(sequence, { rowId: "missing" }, 0)).toBe("Heng Q x2, Special, Stab, Slash > Blue Q")
  })

  it("restores the weapon label after a wait or a non-weapon skill", () => {
    const ropeDart = defaultSkillMaps.Unfettered
    const sequence = [
      { ...skillRow(0, 0, 1, ""), skill: ropeDart.SoulSweep },
      { ...skillRow(1, 1, 0.5, ""), step: { type: "event", event: "Delay", duration: 0.5 } },
      { ...skillRow(2, 1.5, 1, ""), skill: ropeDart.BurnAndBury },
      { ...skillRow(3, 2.5, 1, ""), skill: defaultSkillMaps.General.Deflect },
      { ...skillRow(4, 3.5, 1, ""), skill: ropeDart.BurnAndBury },
    ] as unknown as TimelineRow[]

    expect(readableRotationText(sequence, { rowId: "missing" }, 0)).toBe(
      "RD Q > Wait 0.5s > RD Special > Deflect > RD Special",
    )
  })

  it("labels conversions and manual weapon switches with their destination", () => {
    const sequence = [
      { ...skillRow(0, 0, 1, ""), skill: defaultSkillMaps.Snowparting.SnowpartingConversion },
      { ...skillRow(1, 1, 1, ""), skill: defaultSkillMaps.Snowparting.SnowpartingSpecial },
      { ...skillRow(2, 2, 1, ""), skill: defaultSkillMaps.BoshanQuyueSpear.BoltBlueTab },
      { ...skillRow(3, 3, 1, ""), skill: defaultSkillMaps.BoshanQuyueSpear.BoltBlueQ },
      {
        ...skillRow(4, 4, 1, ""),
        step: { type: "event", event: "MartialArt", before: { action: "start" }, martialArt: "jueyuXuanfengSpear" },
      },
      { ...skillRow(5, 4, 1, ""), skill: defaultSkillMaps.JueyuXuanfengSpear.BoltRedQ },
    ] as unknown as TimelineRow[]

    expect(readableRotationText(sequence, { rowId: "missing" }, 0)).toBe(
      "Tab to Heng > Special > Tab to Blue > Q > Scroll to Red > Red Q",
    )
  })
})
