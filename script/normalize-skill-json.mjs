import { readFile, writeFile } from "node:fs/promises";

const path = "data/skills.json";
const lines = (await readFile(path, "utf8")).trimEnd().split("\n");
const arrayStart = lines.findIndex((line) => line === "  {");
if (arrayStart < 0) throw new Error("Skill array not found");

const firstTwoText = lines.slice(0, arrayStart).join("\n").replace(/,\s*$/, "\n}");
const firstTwo = JSON.parse(firstTwoText);
const remainingText = `[${lines.slice(arrayStart, -1).join("\n")}]`;
const remaining = JSON.parse(remainingText);

function displayName(id) {
  return id
    .replace(/\[.*?\]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/([0-9])(\D)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

const result = { ...firstTwo };
for (const record of remaining) {
  const { id, ...skill } = record;
  if (!id) throw new Error("Encountered a skill without an id");
  result[id] = { name: displayName(id), ...skill };
}

await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Normalized ${Object.keys(result).length} skills`);
