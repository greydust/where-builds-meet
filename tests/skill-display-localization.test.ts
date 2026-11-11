// @vitest-environment jsdom
import { readFile } from "node:fs/promises"

import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { skillCategoryLabel, skillDisplayName } from "@/application/formatting"
import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { allSkillDefinitions, dotDefinitions, skillCategoryByWeapon } from "@/application/gameData/skills"
import { gameText, initializeI18n, selectLocale } from "@/i18n"
import type { WeaponId } from "@/types"

beforeEach(async () => {
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(`public/locales/${url.split("/").at(-1)}`, "utf8")),
  }))
  await initializeI18n()
  await selectLocale("zh-Hant")
})

afterEach(() => vi.unstubAllGlobals())

it("translates DOT rows when the breakdown regular-skill lookup has no definition", () => {
  expect(skillDisplayName(allSkillDefinitions.DivinecraftFire, "DivinecraftFire", "DivinecraftFire")).toBe("天工・火")
  expect(skillDisplayName(undefined, "DivinecraftPoison", "DivinecraftPoison")).toBe("天工・毒")
})

it("preserves custom DOT names and unknown identifiers", () => {
  expect(skillDisplayName({ ...dotDefinitions.DivinecraftFire, name: "Custom fire" }, "", "DivinecraftFire")).toBe(
    "Custom fire",
  )
  expect(skillDisplayName(undefined, "UnknownSkill", "UnknownSkill")).toBe("UnknownSkill")
})

it.each(["zh-Hant", "ko"])("localizes martial-art categories and effect-only damage rows in %s", async locale => {
  await selectLocale(locale)
  for (const [weapon, category] of Object.entries(skillCategoryByWeapon)) {
    expect(skillCategoryLabel(category)).toBe(gameText(martialArtDefinitions[weapon as WeaponId].name))
    expect(skillCategoryLabel(category)).not.toMatch(/[A-Za-z]{2,}/)
  }
  for (const id of ["ToadVenom", "LesserToadVenom"]) {
    expect(skillDisplayName(undefined, id, id)).not.toMatch(/[A-Za-z]{2,}/)
  }
})
