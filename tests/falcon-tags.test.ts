import { readdir, readFile } from "node:fs/promises"

import { assert, describe, it } from "vitest"

// Ported from script/probe/check-falcon-tags.mjs.
describe("falcon-tags", () => {
  it("falcon-tags checks", async () => {
    const files = (await readdir("data/skill")).filter(file => file.endsWith(".json")).map(file => `data/skill/${file}`)
    const missing = []

    const skillSources = await Promise.all(files.map(async file => [file, await readFile(file, "utf8")] as const))
    for (const [file, source] of skillSources) {
      const skills = JSON.parse(source) as Record<string, { tags?: unknown }>
      for (const [skillId, skill] of Object.entries(skills)) {
        const tags = Array.isArray(skill.tags) ? skill.tags.filter(tag => typeof tag === "string") : []
        if (tags.includes("Falcon") && !tags.includes("MartialArts")) missing.push(`${file}:${skillId}`)
      }
    }

    assert(!missing.length, `Falcon skills missing MartialArts: ${missing.join(", ")}`)
  })
})
