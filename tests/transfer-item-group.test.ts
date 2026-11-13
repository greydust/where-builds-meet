import { expect, it } from "vitest"

import { transferItemGroup } from "@/features/transfer/transferItemGroup"

it("groups a path's martial arts together regardless of weapon order", () => {
  const forward = transferItemGroup(["namelessSword", "namelessSpear"])
  const reverse = transferItemGroup(["namelessSpear", "namelessSword"])
  expect(forward.group).toBe("Splendor")
  expect(reverse).toEqual(forward)
  expect(transferItemGroup(["strategicSword", "heavenquakerSpear"]).group).toBe("Umbra")
})

it("identifies mixed combinations by their specific martial arts after standard paths", () => {
  const mixed = transferItemGroup(["namelessSword", "heavenquakerSpear"])
  expect(transferItemGroup(["heavenquakerSpear", "namelessSword"])).toEqual(mixed)
  expect(mixed.group).toContain("Mixed")
  expect(mixed.group).toContain("Nameless Sword")
  expect(mixed.group).toContain("HeavenQuaker Spear")
  expect(mixed.groupOrder).toBeGreaterThan(transferItemGroup(["strategicSword", "heavenquakerSpear"]).groupOrder)
})
