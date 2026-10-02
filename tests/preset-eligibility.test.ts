import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { assert, describe, it } from "vitest"

import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import type { PathDefinition } from "@/application/gameData/paths"
import { gearData, statRollsForLevel } from "@/gear"
import type { BuildPreset, BuildPresetGear, GearSlot } from "@/gear"

// The build and rotation presets share the fields this spec reads; only a build
// preset carries gear, so the shared shape is the intersection of the two.
type PresetPayload = Pick<BuildPreset, "id" | "martialArts" | "relayed" | "test"> & Partial<Pick<BuildPreset, "gear">>

// Ported from script/probe/check-preset-eligibility.mjs.
describe("preset-eligibility", () => {
  it("Preset eligibility consistency checks passed", async () => {
    const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T
    const collectJsonFiles = async (root: string): Promise<string[]> => {
      const entries = await readdir(root, { withFileTypes: true })
      const nested = await Promise.all(
        entries.map(async entry => {
          const entryPath = path.join(root, entry.name)
          if (entry.isDirectory()) return collectJsonFiles(entryPath)
          return entry.name.endsWith(".json") ? [entryPath] : []
        }),
      )
      return nested.flat()
    }
    const assertUniqueMartialArts = (definition: PresetPayload, file: string) => {
      assert(
        Array.isArray(definition.martialArts) && definition.martialArts.length >= 2,
        `${file} must declare at least two eligible martial arts.`,
      )
      assert(
        new Set(definition.martialArts).size === definition.martialArts.length,
        `${file} must not repeat martial-art eligibility entries.`,
      )
    }

    const paths = typedPathDefinitions
    const lockedMartialArts = new Set<string>()
    const allowedStatuses = new Set(["available", "wip", "devOnly", "plannerOnly"])
    const pathByBuildGroup = new Map<string, { pathId: PathId; definition: PathDefinition }>()
    for (const [pathId, definition] of Object.entries(paths) as Array<[PathId, PathDefinition]>) {
      assert(allowedStatuses.has(definition.status), `Path ${pathId} must declare a recognized status.`)
      assert(
        typeof definition.buildGroup === "string" && definition.buildGroup,
        `Path ${pathId} must declare a build group.`,
      )
      assert(
        !pathByBuildGroup.has(definition.buildGroup),
        `Build group ${definition.buildGroup} is assigned to multiple paths.`,
      )
      pathByBuildGroup.set(definition.buildGroup, { pathId, definition })
      if (!definition.lockedWeapons) continue
      assert(
        definition.lockedWeapons.length >= 2 &&
          new Set(definition.lockedWeapons).size === definition.lockedWeapons.length,
        `Path ${pathId} must declare at least two distinct locked martial arts.`,
      )
      definition.lockedWeapons.forEach(martialArt => lockedMartialArts.add(martialArt))
    }

    const buildFiles = await collectJsonFiles("data/build")
    const rotationFiles = await collectJsonFiles("data/rotation")
    const presetMartialArts = new Set<string>()
    const buildPresetIds = new Set<string>()
    const buildsById = new Map<string, { definition: PresetPayload; file: string; buildGroup?: string }>()
    const rotationsById = new Map<string, { definition: PresetPayload; file: string }>()
    const presetPayloads = await Promise.all(
      [...buildFiles, ...rotationFiles].map(async file => [file, await readJson<PresetPayload>(file)] as const),
    )
    for (const [file, definition] of presetPayloads) {
      assertUniqueMartialArts(definition, file)
      definition.martialArts.forEach(martialArt => presetMartialArts.add(martialArt))
      if (file.startsWith(`data${path.sep}build${path.sep}`)) {
        assert(!buildPresetIds.has(definition.id), `Build preset ID ${definition.id} must be unique.`)
        buildPresetIds.add(definition.id)
        const relative = path.relative("data/build", file).split(path.sep)
        const buildGroup = relative.length > 1 ? relative[0] : undefined
        buildsById.set(definition.id, { definition, file, buildGroup })
        if (!buildGroup) continue
        const pathEntry = pathByBuildGroup.get(buildGroup)
        assert(pathEntry, `Build group ${buildGroup} must be assigned to a path.`)
        if (!pathEntry.definition.lockedWeapons) continue
        assert(
          [...definition.martialArts].sort().join("|") === [...pathEntry.definition.lockedWeapons].sort().join("|"),
          `${file} must use the martial-art pair locked by path ${pathEntry.pathId}.`,
        )
        continue
      }
      const rotationId = path.basename(file, ".json")
      assert(!rotationsById.has(rotationId), `Rotation preset ID ${rotationId} must be unique.`)
      rotationsById.set(rotationId, { definition, file })
    }

    for (const [pathId, definition] of Object.entries(paths)) {
      assert(typeof definition.defaultBuild === "string", `Path ${pathId} must declare a default build.`)
      assert(
        Array.isArray(definition.graduated) && definition.graduated.length > 0,
        `Path ${pathId} must declare at least one graduate build.`,
      )
      assert(
        definition.graduated.every(buildId => typeof buildId === "string"),
        `Path ${pathId} must declare only string graduate build IDs.`,
      )
      assert(
        new Set(definition.graduated).size === definition.graduated.length,
        `Path ${pathId} must not repeat graduate build IDs.`,
      )
      assert(typeof definition.defaultRotation === "string", `Path ${pathId} must declare a default rotation.`)
      const defaultBuildId = definition.defaultBuild
      const defaultRotationId = definition.defaultRotation
      const build = buildsById.get(defaultBuildId)
      const graduateBuilds = definition.graduated.map(graduateBuildId => {
        const graduateBuild = buildsById.get(graduateBuildId)
        assert(graduateBuild, `Path ${pathId} references missing graduate build ${graduateBuildId}.`)
        return graduateBuild
      })
      const rotation = rotationsById.get(defaultRotationId)
      assert(build, `Path ${pathId} references missing default build ${defaultBuildId}.`)
      assert(rotation, `Path ${pathId} references missing default rotation ${defaultRotationId}.`)
      if (definition.defaultBuild !== "empty")
        assert(
          build.buildGroup === definition.buildGroup,
          `Path ${pathId}'s default build must belong to its build group.`,
        )
      for (const graduateBuild of graduateBuilds) {
        if (graduateBuild.definition.id === "empty") continue
        assert(
          graduateBuild.buildGroup === definition.buildGroup,
          `Path ${pathId}'s graduate build ${graduateBuild.definition.id} must belong to its build group.`,
        )
        assert(
          graduateBuild.definition.relayed !== true,
          `Path ${pathId}'s graduate build ${graduateBuild.definition.id} cannot be relayed.`,
        )
        for (const [slot, gear] of Object.entries(graduateBuild.definition.gear ?? {}) as [
          GearSlot,
          BuildPresetGear,
        ][]) {
          assert(gear.relayed !== true, `Path ${pathId}'s graduate ${slot} cannot be relayed.`)
          const affixCaps = statRollsForLevel(gear.level)?.affix
          assert(affixCaps, `Path ${pathId}'s graduate ${slot} has unsupported gear level ${gear.level}.`)
          const gearDefinition = gearData.gear[gear.definitionId]
          assert(
            gearDefinition?.slots.includes(slot),
            `Path ${pathId}'s graduate ${slot} uses an invalid gear definition.`,
          )
          const allowedAffixes = (category: "baseAffixes" | "additionalAffixes") => {
            const options = gearDefinition[category]
            const relayOnly = new Set(options[`${gear.level}Relayed`] ?? [])
            const standard = (options[String(gear.level)] ?? []).filter(key => !relayOnly.has(key))
            const universal =
              category === "additionalAffixes" ? (gearData.universalAdditionalAffixes[String(gear.level)] ?? []) : []
            return new Set([...standard, ...universal])
          }
          assert(
            allowedAffixes("baseAffixes").has(gear.baseAffix.key),
            `Path ${pathId}'s graduate ${slot} uses an invalid base affix ${gear.baseAffix.key}.`,
          )
          const additionalKeys = gear.additionalAffixes?.map(affix => affix.key) ?? []
          assert(
            additionalKeys.length === 4 && new Set(additionalKeys).size === 4,
            `Path ${pathId}'s graduate ${slot} must use four distinct additional affixes.`,
          )
          for (const key of additionalKeys)
            assert(
              allowedAffixes("additionalAffixes").has(key),
              `Path ${pathId}'s graduate ${slot} uses invalid additional affix ${key}.`,
            )
          for (const affix of [gear.baseAffix, ...(gear.additionalAffixes ?? [])]) {
            const maximum = affixCaps[affix.key]
            assert(maximum !== undefined, `Path ${pathId}'s graduate ${slot} uses unsupported affix ${affix.key}.`)
            assert(
              affix.value === maximum,
              `Path ${pathId}'s graduate ${slot} affix ${affix.key} must use its maximum roll.`,
            )
          }
        }
      }
      if (definition.lockedWeapons && definition.defaultRotation !== "empty")
        assert(
          [...rotation.definition.martialArts].sort().join("|") === [...definition.lockedWeapons].sort().join("|"),
          `Path ${pathId}'s default rotation must use its locked martial-art pair.`,
        )
      if (definition.status === "available") {
        assert(build.definition.test !== true, `Available path ${pathId} cannot use a test-only default build.`)
        for (const graduateBuild of graduateBuilds)
          assert(
            graduateBuild.definition.test !== true,
            `Available path ${pathId} cannot use test-only graduate build ${graduateBuild.definition.id}.`,
          )
        assert(rotation.definition.test !== true, `Available path ${pathId} cannot use a test-only default rotation.`)
      }
    }

    for (const martialArt of lockedMartialArts) {
      assert(
        presetMartialArts.has(martialArt),
        `Locked martial art ${martialArt} must be represented by a build or rotation preset.`,
      )
    }
  })
})
