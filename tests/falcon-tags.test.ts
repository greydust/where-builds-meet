import { assert, describe, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";

// Ported from script/probe/check-falcon-tags.mjs.
describe("falcon-tags", () => {
  it("falcon-tags checks", async () => {
    const files = (await readdir("data/skill"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => `data/skill/${file}`);
    const missing = [];

    for (const file of files) {
      const skills = JSON.parse(await readFile(file, "utf8"));
      for (const [skillId, skill] of Object.entries(skills)) {
        const tags = Array.isArray(skill.tags) ? skill.tags : [];
        if (tags.includes("Falcon") && !tags.includes("MartialArts")) missing.push(`${file}:${skillId}`);
      }
    }

    assert(!missing.length, `Falcon skills missing MartialArts: ${missing.join(", ")}`);
  });
});
