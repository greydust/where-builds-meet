import assert from "node:assert/strict"

import type { WeaponId } from "@/types"

/**
 * Fixtures for the weapon pair the calculator takes.
 *
 * Build presets and stored builds name their martial arts as a list, because a
 * stored build may hold only one weapon. The calculator settings take exactly
 * the pair, so narrowing happens here once instead of at every call site.
 */
export function weaponPair(weapons: readonly WeaponId[]): [WeaponId, WeaponId] {
  assert.equal(weapons.length, 2, "Expected exactly two martial arts, one per weapon slot.")
  return [weapons[0], weapons[1]]
}
