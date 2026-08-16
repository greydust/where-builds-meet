import fs from "node:fs";
import path from "node:path";

const jsonFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(itemPath);
    return entry.name.endsWith(".json") ? [itemPath] : [];
  });
const walk = (value, visit) => {
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (value && typeof value === "object") {
    visit(value);
    Object.values(value).forEach((item) => walk(item, visit));
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const definitions = Object.assign(
  {},
  ...jsonFiles(path.join("data", "skill")).map((file) => JSON.parse(fs.readFileSync(file, "utf8"))),
);
const triggeredIds = new Set();

jsonFiles("data").forEach((file) =>
  walk(JSON.parse(fs.readFileSync(file, "utf8")), (value) => {
    if (value.type === "trigger" && typeof value.value === "string") triggeredIds.add(value.value);
  }),
);

triggeredIds.forEach((skillId) => {
  assert(definitions[skillId], `Triggered skill ${skillId} has no skill definition.`);
  assert(definitions[skillId].tags?.includes("Triggered"), `Triggered skill ${skillId} is missing the Triggered tag.`);
});
Object.entries(definitions).forEach(([skillId, definition]) => {
  if (definition.tags?.includes("Triggered"))
    assert(triggeredIds.has(skillId), `${skillId} is tagged Triggered but is not referenced by a trigger action.`);
});

console.log(`Triggered skill tag checks passed for ${triggeredIds.size} skills.`);
