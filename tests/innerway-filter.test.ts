import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { innerWayGroupsFor, typedPathDefinitions } from "@/application/gameData/paths"
import { innerWayDefinitions } from "@/data/innerWayDefinitions"
import { defaultBuildPresets } from "@/gear"

describe("Inner Way picker groups", () => {
  it("keeps curated selections and applies combat rules to choices from other paths", () => {
    const groups = innerWayGroupsFor(typedPathDefinitions.bamboocutKite)
    expect(groups.curated.map(([id]) => id)).toContain("BattleAnthem")
    expect(groups.experimental.map(([id]) => id)).toContain("Mistwing")
    expect(groups.others.map(([id]) => id)).toContain("EchoesOfOblivion")
    expect(groups.passiveOnly.map(([id]) => id)).toContain("EveningSnow")

    const selection = [{ innerWay: "Mistwing", tier: "T6" }]
    expect(innerWayConditionsFor(selection)).toContain("MistwingT6")
    expect(innerWayEffectRulesFor(selection, 17)).toContainEqual(
      expect.objectContaining({ source: "Mistwing", tier: 6 }),
    )
  })

  it("prioritizes the path lists and places each catalog entry in exactly one group", () => {
    const groups = innerWayGroupsFor({ curatedInnerWays: ["Volutefit"], experimentalInnerWays: ["BattleAnthem"] })
    expect(groups.curated.map(([id]) => id)).toEqual(["Volutefit"])
    expect(groups.experimental.map(([id]) => id)).toEqual(["BattleAnthem"])
    const allIds = Object.values(groups)
      .flat()
      .map(([id]) => id)
    expect(allIds.toSorted()).toEqual(Object.keys(innerWayDefinitions).toSorted())
    expect(groups.others.map(([, entry]) => entry.name)).toEqual(
      groups.others.map(([, entry]) => entry.name).toSorted((left, right) => left.localeCompare(right)),
    )
  })

  it("keeps every path build preset's Inner Ways in its curated or experimental groups", () => {
    const missing: string[] = []
    for (const path of Object.values(typedPathDefinitions)) {
      if (!path.lockedWeapons) continue
      const { curated, experimental } = innerWayGroupsFor(path)
      const pathInnerWays = new Set<string>([...curated, ...experimental].map(([id]) => id))
      const builds = defaultBuildPresets.filter(build =>
        path.lockedWeapons?.every(weapon => build.martialArts.includes(weapon)),
      )
      for (const build of builds)
        for (const row of build.setup?.innerWays ?? [])
          if (row.innerWay && !pathInnerWays.has(row.innerWay)) missing.push(`${build.id}: ${row.innerWay}`)
    }
    expect(missing).toEqual([])
  })
})
