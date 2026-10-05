import { expect, it } from "vitest"

import { deserializeSkillOverrides, serializeSkillOverrides } from "@/skillOverrides"

import { skillActions } from "./helpers/shippedData"

it("preserves customized shared Resonance damage and routes across migration and reload", () => {
  const overrides = deserializeSkillOverrides({
    version: 3,
    overrides: {
      Everspring: {
        Resonance: { action: [{ type: "damage", time: 0, phyCoef: 7 }] },
        PhantomUmbrellaSummon: { action: [{ type: "trigger", value: "Resonance", time: 0, inheritTags: true }] },
        DreamwroughtBubblesRelease: {
          action: [{ type: "trigger", value: "PhantomUmbrellaSummon", time: 0.8, inheritTags: true }],
        },
      },
    },
  })
  const skills = overrides.Everspring!
  /** The first action of `skillId`, as the migrated override records it. */
  const firstAction = (skillId: string) => skillActions(skills[skillId])[0]
  const tagsOf = (skillId: string) => skills[skillId]?.tags ?? []
  expect(skills.Resonance.action).toEqual(skills.BubblesResonance.action)
  expect(firstAction("BubblesResonance").phyCoef).toBe(7)
  expect(tagsOf("Resonance")).toContain("MartialArt")
  expect(tagsOf("BubblesResonance")).toEqual(expect.arrayContaining(["Heavy", "Charged"]))
  expect(tagsOf("BubblesResonance")).not.toContain("MartialArt")
  expect(firstAction("BubblesPhantomUmbrellaSummon").value).toBe("BubblesResonance")
  expect(firstAction("DreamwroughtBubblesRelease").value).toBe("BubblesPhantomUmbrellaSummon")
  expect(firstAction("PhantomUmbrellaSummon")).not.toHaveProperty("inheritTags")
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(overrides)))).toEqual(overrides)
})

it("keeps new Scarlet Spin-only overrides separate after saving", () => {
  const original = { Everspring: { Resonance: { action: [{ type: "damage", phyCoef: 7 }] } } }
  expect(deserializeSkillOverrides(JSON.parse(serializeSkillOverrides(original)))).toEqual(original)
})
