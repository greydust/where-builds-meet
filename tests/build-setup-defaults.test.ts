import { assert, describe, it } from "vitest"

import { windowWithStorage, writableStorage } from "./helpers/domStubs"

// Ported from script/probe/check-build-setup-defaults.mjs.
describe("build-setup-defaults", () => {
  it("Build-sourced setup defaults and one-time legacy migration checks passed", async () => {
    const localStorage = writableStorage()
    const sessionStorage = writableStorage()
    globalThis.window = windowWithStorage({ localStorage, sessionStorage })
    globalThis.localStorage = localStorage
    globalThis.sessionStorage = sessionStorage

    try {
      const { loadBuildSetupOverrides } = await import("../src/application/persistence/setupOverrides")
      const { defaultBuildSetup } = await import("../src/gear.ts")
      const legacyInnerWays = [
        { innerWay: "BreakingPoint", tier: "T3" },
        { innerWay: "MoraleChant", tier: "T6" },
        { innerWay: "SteadfastDevotion", tier: "T6" },
        { innerWay: "ThroatPiercingArt", tier: "T6" },
      ]
      const legacyGearSets = { Cleftpeak: 2, RainWhisper: 2 }

      sessionStorage.setItem("wwm-build-setup-overrides-v1", "{}")
      sessionStorage.setItem("wwm-inner-way-session-v1", JSON.stringify(legacyInnerWays))
      sessionStorage.setItem("wwm-gear-set-session-v1", JSON.stringify(legacyGearSets))
      const current = loadBuildSetupOverrides(defaultBuildSetup)
      assert(
        Object.keys(current).length === 0,
        "An explicitly saved empty override must use every setup value from the active build.",
      )

      localStorage.removeItem("wwm-build-setup-overrides-v1")
      const migrated = loadBuildSetupOverrides(defaultBuildSetup)
      assert(
        migrated.innerWays?.[0]?.innerWay === "BreakingPoint",
        "The standalone Inner Way session must migrate only when the unified override has never been saved.",
      )
      assert(
        migrated.weaponSets?.Cleftpeak === 2 && migrated.weaponSets?.RainWhisper === 2,
        "The standalone gear-set session must migrate to weaponSets when the unified override has never been saved.",
      )
    } finally {
      for (const global of ["window", "localStorage", "sessionStorage"] as const)
        Reflect.deleteProperty(globalThis, global)
    }
  })
})
