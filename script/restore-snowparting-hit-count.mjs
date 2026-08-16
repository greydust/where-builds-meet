import { readFile, writeFile } from "node:fs/promises";

const path = "data/skill/snowparting-blade.json";
const skills = JSON.parse(await readFile(path, "utf8"));
const maps = JSON.parse(await readFile("data/skill-maps.json", "utf8"));
const aliases = {
  SnowpartingLightCharged: "SnowpartingCharged",
  SnowpartingHeavyVC: "SnowpartingVC",
  SnowpartingQSlide: "SnowpartingSlide",
  SnowpartingQSlash: "SnowpartingQ-Slash",
  SnowpartingQStab: "SnowpartingQ-Stab",
  SnowpartingQDoubleSlash: "SnowpartingQ-DoubleSlash",
  SnowpartingConversion: "SnowpartingDual",
};

for (const [id, skill] of Object.entries(skills)) {
  const source = maps.Ab[aliases[id] ?? id];
  skill.hitCount =
    source?.hitCount ??
    (Array.isArray(skill.action)
      ? skill.action.filter((entry) => entry.type === "damage").length
      : Array.isArray(skill.damage)
        ? skill.damage.length
        : 0);
}

await writeFile(path, `${JSON.stringify(skills, null, 2)}\n`);
console.log(`Restored hitCount for ${Object.keys(skills).length} Snowparting entries`);
