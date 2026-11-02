import { readdir, readFile } from "node:fs/promises"

import type { buildPresetRotationBundle } from "@/application/graduation"
import { resolvePing } from "@/calculations/combatDefaults"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
type Environment = Parameters<typeof buildPresetRotationBundle>[0]

const dataRoot = new URL("../../data/", import.meta.url)
// Rotations without an override use their path's default build.
export const snapshotBuildOverrides: Record<string, string> = {
  "silkbindJade/jade-three-rounds": "jade-fully-relayed-max-bp",
  "bamboocutKite/dummy-1-min-infinite-vitality": "kite-fully-relayed-min",
  "stonesplitStrength/pure-dummy-1-min": "pure-fully-relayed-min",
  "stonesplitStrength/pure-dummy-1-min-infinite-vitality": "pure-fully-relayed-min",
  "stonesplitStrength/mixed-dummy-1-min-double-stab": "mixed-fully-relayed-double-min",
}
export const dpsSnapshotEnvironment = {
  breakthrough: "17",
  ping: 40,
  food: "SimmeringFishSlices",
  divinecraft: "Fire",
  script: "None",
  globalDebuffs: { ...defaultGlobalDebuffs },
}
export async function loadDpsSnapshotFixtures(breakthrough = dpsSnapshotEnvironment.breakthrough) {
  const paths = JSON.parse(await readFile(new URL("path.json", dataRoot), "utf8"))
  const groups = new Set(
    (await readdir(new URL("rotation/", dataRoot), { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name),
  )
  const availablePathIds = Object.keys(paths)
    .sort()
    .filter(pathId => groups.has(paths[pathId].buildGroup))
  const nested = await Promise.all(
    availablePathIds.map(async pathId => {
      const definition = paths[pathId]
      const directory = new URL("rotation/" + definition.buildGroup + "/", dataRoot)
      const files = (await readdir(directory)).filter(file => file.endsWith(".json")).sort()
      return Promise.all(
        files.map(async file => {
          const rotationId = file.slice(0, -5)
          const id = pathId + "/" + rotationId
          const rotation = JSON.parse(await readFile(new URL(file, directory), "utf8")) as RotationRecord & {
            martialArts: Environment["martialArts"]
          }
          if (!rotation.steps.length) return undefined
          return {
            id,
            pathId: pathId as Environment["pathId"],
            buildGroup: definition.buildGroup as string,
            rotation,
            fixture: {
              build: snapshotBuildOverrides[id] ?? (definition.defaultBuild as string),
              rotation: rotationId,
              martialArts: rotation.martialArts!,
              ...dpsSnapshotEnvironment,
              breakthrough,
              ping: resolvePing(rotation.ping, dpsSnapshotEnvironment.ping),
            },
          }
        }),
      )
    }),
  )
  const cases = nested.flat().filter(entry => entry !== undefined)
  if (!cases.length) throw new Error("No preset rotations found for DPS snapshots.")
  for (const id of Object.keys(snapshotBuildOverrides))
    if (!cases.some(entry => entry.id === id)) throw new Error("Stale snapshot build override: " + id)
  return cases
}

/** Accepted regression cases cover every build/rotation pair at both current breakthroughs. */
export async function loadDpsSnapshotCases() {
  const levels = await Promise.all(["18", "19"].map(breakthrough => loadDpsSnapshotFixtures(breakthrough)))
  const groups = [...new Set(levels.flat().map(entry => entry.buildGroup))]
  const buildsByGroup = new Map(
    await Promise.all(
      groups.map(async group => {
        const directory = new URL("build/" + group + "/", dataRoot)
        const files = (await readdir(directory)).filter(file => file.endsWith(".json")).sort()
        const builds = await Promise.all(
          files.map(
            async file =>
              JSON.parse(await readFile(new URL(file, directory), "utf8")) as {
                id: string
                martialArts: Environment["martialArts"]
              },
          ),
        )
        if (!builds.length) throw new Error("No preset builds found for DPS snapshots: " + group)
        return [group, builds] as const
      }),
    ),
  )
  return levels.flatMap(cases =>
    cases.flatMap(entry =>
      buildsByGroup
        .get(entry.buildGroup)!
        .map(build =>
          Object.assign({}, entry, {
            id: entry.id + "/" + build.id + "/" + entry.fixture.breakthrough,
            fixture: { ...entry.fixture, build: build.id, martialArts: build.martialArts },
          }),
        ),
    ),
  )
}
export function selectDpsSnapshotUpdates(raw: string, caseIds: string[]): string[] {
  if (!raw.trim()) return []
  if (raw.trim() === "all") return [...caseIds]
  const tokens = raw.trim().split(/\s+/)
  const selected = new Set<string>()
  for (const token of tokens) {
    const matches = caseIds.filter(id => id === token || id.startsWith(token + "/"))
    if (!matches.length) throw new Error("Unknown DPS snapshot selector: " + token)
    for (const id of matches) {
      if (selected.has(id)) throw new Error("Overlapping DPS snapshot selectors: " + id)
      selected.add(id)
    }
  }
  return [...selected].sort()
}
