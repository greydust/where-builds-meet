import { readdir, readFile } from "node:fs/promises";

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

if (missing.length) throw new Error(`Falcon skills missing MartialArts: ${missing.join(", ")}`);
console.log("All Falcon skills carry the MartialArts tag.");
