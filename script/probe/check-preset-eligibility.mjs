import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const collectJsonFiles = async (root) => {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.name.endsWith(".json")) files.push(entryPath);
    }
  }
  return files;
};
const assertUniqueMartialArts = (definition, file) => {
  assert(
    Array.isArray(definition.martialArts) && definition.martialArts.length >= 2,
    `${file} must declare at least two eligible martial arts.`,
  );
  assert(
    new Set(definition.martialArts).size === definition.martialArts.length,
    `${file} must not repeat martial-art eligibility entries.`,
  );
};

const paths = await readJson("data/path.json");
const lockedMartialArts = new Set();
const allowedStatuses = new Set(["available", "wip", "devOnly", "plannerOnly"]);
const pathByBuildGroup = new Map();
for (const [pathId, definition] of Object.entries(paths)) {
  assert(allowedStatuses.has(definition.status), `Path ${pathId} must declare a recognized status.`);
  assert(
    typeof definition.buildGroup === "string" && definition.buildGroup,
    `Path ${pathId} must declare a build group.`,
  );
  assert(
    !pathByBuildGroup.has(definition.buildGroup),
    `Build group ${definition.buildGroup} is assigned to multiple paths.`,
  );
  pathByBuildGroup.set(definition.buildGroup, { pathId, definition });
  if (!definition.lockedWeapons) continue;
  assert(
    definition.lockedWeapons.length >= 2 && new Set(definition.lockedWeapons).size === definition.lockedWeapons.length,
    `Path ${pathId} must declare at least two distinct locked martial arts.`,
  );
  definition.lockedWeapons.forEach((martialArt) => lockedMartialArts.add(martialArt));
}

const buildFiles = await collectJsonFiles("data/build");
const rotationFiles = await collectJsonFiles("data/rotation");
const presetMartialArts = new Set();
const buildPresetIds = new Set();
for (const file of [...buildFiles, ...rotationFiles]) {
  const definition = await readJson(file);
  assertUniqueMartialArts(definition, file);
  definition.martialArts.forEach((martialArt) => presetMartialArts.add(martialArt));
  if (!file.startsWith(`data${path.sep}build${path.sep}`)) continue;
  assert(!buildPresetIds.has(definition.id), `Build preset ID ${definition.id} must be unique.`);
  buildPresetIds.add(definition.id);
  const relative = path.relative("data/build", file).split(path.sep);
  if (relative.length === 1) continue;
  const buildGroup = relative[0];
  const pathEntry = pathByBuildGroup.get(buildGroup);
  assert(pathEntry, `Build group ${buildGroup} must be assigned to a path.`);
  if (!pathEntry.definition.lockedWeapons) continue;
  assert(
    [...definition.martialArts].sort().join("|") === [...pathEntry.definition.lockedWeapons].sort().join("|"),
    `${file} must use the martial-art pair locked by path ${pathEntry.pathId}.`,
  );
}

for (const martialArt of lockedMartialArts) {
  assert(
    presetMartialArts.has(martialArt),
    `Locked martial art ${martialArt} must be represented by a build or rotation preset.`,
  );
}

console.log("Preset eligibility consistency checks passed.");
