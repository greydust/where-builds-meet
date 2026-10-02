import assert from "node:assert/strict"

import type { BuildEntry, BuildSetup } from "@/gear"
import type { WeaponId } from "@/types"

/**
 * Fixtures for reading what a build-state round trip actually persisted.
 *
 * The serialize and export calls return JSON strings, so a spec that reads one
 * back to check which fields survived gets `any` back. These name the two
 * payload shapes and check, at the point of reading, the fields the migration
 * guarantees. Both keep their gear items as records, because the specs ask which
 * keys are absent rather than reading values.
 */

type PersistedBuild = BuildEntry & { setup?: BuildSetup }

/** The payload as it comes back out of `serializeBuildState`. */
export type SerializedBuildPayload = {
  version: number
  gearItems: Record<string, unknown>[]
  entries: PersistedBuild[]
}

/** The shareable payload as it comes back out of `exportBuildState`. */
export type ExportedBuildPayload = {
  format: string
  version: number
  gearItems: Record<string, unknown>[]
  builds: PersistedBuild[]
}

/** A build's setup selections, which a migrated or imported build must carry. */
export function setupOf(entry: { setup?: BuildSetup }): BuildSetup {
  assert(entry.setup, "Expected the build to carry its setup selections.")
  return entry.setup
}

/** A build's martial arts, which a migrated or imported build must carry. */
export function weaponsOf(entry: Pick<BuildEntry, "martialArts">): WeaponId[] {
  assert(entry.martialArts, "Expected the build to carry its martial arts.")
  return entry.martialArts
}
