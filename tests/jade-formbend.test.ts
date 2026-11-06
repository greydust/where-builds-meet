import generalBuffs from "@gamedata/buff/general.json"
import mysticSkills from "@gamedata/skill/mystic.json"
import { expect, it } from "vitest"

import { setEffectsFor } from "@/application/characterComposition"
import { defaultSettings, typedArmorSetDefinitions } from "@/application/gameData/setup"
import { buildRotationTimeline } from "@/calculations/rotationTimeline"
import { availableSetEntriesForTags } from "@/gear"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { actionStateAt } from "./helpers/timelineRows"

it("offers Formbend for Jade and applies its four-piece condition", () => {
  expect(
    availableSetEntriesForTags(typedArmorSetDefinitions, ["VernalUmbrella", "InkwellFan"], "SilkbindJade").map(
      ([id]) => id,
    ),
  ).toContain("Formbend")
  const effects = setEffectsFor(
    { Formbend: 4 },
    typedArmorSetDefinitions,
    { ...defaultSettings, weapons: ["vernalUmbrella", "inkwellFan"] },
    "silkbindJade",
  )
  expect(effects.some(effect => effect.condition === "FormBend4")).toBe(true)
})

it.each([false, true])("Golden Body shield duration respects Formbend: %s", formbend => {
  const timeline = buildRotationTimeline({
    rotation: {
      name: "Golden Body duration probe",
      steps: [
        { type: "skill", skill: "GoldenBodyCancel" },
        { type: "skill", skill: "Probe" },
      ],
    },
    skills: {
      ...asSkillRecords(mysticSkills),
      Probe: {
        name: "Probe",
        castTime: 13,
        action: [
          { type: "damage", phyCoef: 0, time: 9 },
          { type: "damage", phyCoef: 0, time: 11 },
          { type: "damage", phyCoef: 0, time: 13 },
        ],
        tags: [],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: asEffectDefinitions(generalBuffs),
    innerWayConditions: formbend ? ["FormBend4"] : [],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["vernalUmbrella", "inkwellFan"],
  })
  const shield = actionStateAt(timeline[1], 0).buffs.get("Shield")!
  expect(shield.expiresAt! - shield.appliedAt!).toBeCloseTo(formbend ? 12 : 10, 10)
  expect(actionStateAt(timeline[1], 1).buffs.has("Shield")).toBe(formbend)
  expect(actionStateAt(timeline[1], 2).buffs.has("Shield")).toBe(false)
})
