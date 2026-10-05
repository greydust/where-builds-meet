import fs from "node:fs"
import path from "node:path"

import { assert, describe, it } from "vitest"

/** One JSON object, as the walker below visits it. */
type JsonObject = Record<string, unknown>

/** The object at `field`, or nothing when the field is not one. */
function objectAt(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined
}

/** The tag list a shipped record carries, when it has one. */
function tagsOf(record: JsonObject | undefined): string[] {
  const tags = record?.tags
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : []
}

// Ported from script/probe/check-triggered-skills.mjs.
describe("triggered-skills", () => {
  it("triggered-skills checks", async () => {
    const jsonFiles = (directory: string): string[] =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const itemPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return jsonFiles(itemPath)
        return entry.name.endsWith(".json") ? [itemPath] : []
      })
    const walk = (value: unknown, visit: (node: JsonObject) => void): void => {
      if (Array.isArray(value)) value.forEach(item => walk(item, visit))
      else {
        const node = objectAt(value)
        if (!node) return
        visit(node)
        Object.values(node).forEach(item => walk(item, visit))
      }
    }
    // A preview may introduce the triggered skill a previewed trigger names, so a preview's
    // own `skill` folder defines records exactly as the shipped folder does. Both are merged,
    // and because a preview's triggers are walked below, a preview-only `Triggered` record is
    // still required to be referenced.
    const skillDefinitionFiles = [
      ...jsonFiles(path.join("data", "skill")),
      ...jsonFiles(path.join("data", "preview")).filter(file => path.basename(path.dirname(file)) === "skill"),
    ]
    const definitions: Record<string, JsonObject> = Object.assign(
      {},
      ...skillDefinitionFiles.map(file => JSON.parse(fs.readFileSync(file, "utf8")) as JsonObject),
    )
    const triggeredIds = new Set<string>()

    jsonFiles("data").forEach(file =>
      walk(JSON.parse(fs.readFileSync(file, "utf8")), value => {
        const response = objectAt(value.attackResponse)
        if (response && typeof response.durationFrom === "string")
          assert(definitions[response.durationFrom] !== undefined, "Attack response duration reference must resolve")
        if (typeof response?.onSuccess === "string") triggeredIds.add(response.onSuccess)
        const onMaxStack = objectAt(value.onMaxStack)
        if (typeof onMaxStack?.trigger === "string") triggeredIds.add(onMaxStack.trigger)
        if (value.type !== "trigger") return
        if (typeof value.value === "string") {
          triggeredIds.add(value.value)
          return
        }
        const dynamic = objectAt(value.value)
        if (dynamic?.function !== "switch") return
        for (const skillId of Object.values(objectAt(dynamic.param2) ?? {})) {
          if (typeof skillId === "string") triggeredIds.add(skillId)
        }
        if (typeof dynamic.fallback === "string") triggeredIds.add(dynamic.fallback)
      }),
    )

    triggeredIds.forEach(skillId => {
      const definition = definitions[skillId]
      assert(definition, `Triggered skill ${skillId} has no skill definition.`)
      assert(tagsOf(definition).includes("Triggered"), `Triggered skill ${skillId} is missing the Triggered tag.`)
    })
    Object.entries(definitions).forEach(([skillId, definition]) => {
      if (tagsOf(definition).includes("Triggered"))
        assert(triggeredIds.has(skillId), `${skillId} is tagged Triggered but is not referenced by a trigger action.`)
    })
  })
})
