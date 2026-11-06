import { expect, it } from "vitest"

import { setEffectsFor } from "@/application/characterComposition"
import { defaultSettings, typedArmorSetDefinitions } from "@/application/gameData/setup"
import { availableSetEntriesForTags } from "@/gear"

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
