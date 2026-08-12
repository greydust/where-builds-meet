import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const weaponIds = ["snowparting", "phalanxbane", "everspring", "unfettered", "heavenwill", "skygrasp"];
const martialArtFiles = {
  snowparting: "snowparting-blade.json",
  phalanxbane: "phalanxbane-blade.json",
  everspring: "everspring-umbrella.json",
  unfettered: "unfettered-rope-dart.json",
  heavenwill: "heavenwill-gauntlets.json",
  skygrasp: "skygrasp-rope-dart.json",
};
const martialArtTags = Object.fromEntries(await Promise.all(Object.entries(martialArtFiles).map(async ([id, file]) => [id, (await readJson(`data/martial-art/${file}`)).tag])));

const paths = await readJson("data/path.json");
assert(paths.bamboocutDust.wip === true && paths.bamboocutKite.wip === true, "Both unfinished Bamboocut paths must remain explicitly WIP.");
assert(paths.bamboocutDust.lockedWeapons.join(",") === "everspring,unfettered", "Dust must lock the expected martial arts.");
assert(paths.bamboocutKite.lockedWeapons.join(",") === "heavenwill,skygrasp", "Kite must lock the expected martial arts.");

const attunements = await readJson("data/attunement.json");
for (const [id, definition] of Object.entries(attunements)) {
  if (!definition.tags.includes("Armor")) continue;
  const matchingArts = weaponIds.filter((weapon) => definition.tags.includes(martialArtTags[weapon]));
  assert(matchingArts.length === 1, `Armor attunement ${id} must carry exactly one martial-art tag.`);
}

const buildFiles = (await readdir(path.join(root, "data/build"))).filter((file) => file.endsWith(".json"));
assert(buildFiles.every((file) => file === "empty.json" || file.startsWith("mixed-fully-relayed-")), "The fully-relayed preset filenames must use the mixed- prefix.");
for (const file of buildFiles) {
  const preset = await readJson(`data/build/${file}`);
  assert(Array.isArray(preset.weapons) && preset.weapons.length >= 2, `Build preset ${file} must declare weapon eligibility.`);
  if (preset.id === "empty") assert(preset.test === true && weaponIds.every((weapon) => preset.weapons.includes(weapon)), "The dev empty build must carry every weapon tag.");
}

const rotationDirectories = [path.join(root, "data/rotation")];
const rotationFiles = [];
while (rotationDirectories.length) {
  const directory = rotationDirectories.pop();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) rotationDirectories.push(entryPath);
    else if (entry.name.endsWith(".json")) rotationFiles.push(entryPath);
  }
}
for (const file of rotationFiles) {
  const rotation = JSON.parse(await readFile(file, "utf8"));
  assert(Array.isArray(rotation.martialArts) && rotation.martialArts.length >= 2, `Rotation ${path.basename(file)} must declare martial-art eligibility.`);
  if (path.basename(file) === "empty.json") assert(rotation.test === true && weaponIds.every((weapon) => rotation.martialArts.includes(weapon)), "The dev empty rotation must carry every martial-art tag.");
}

console.log("Path, attunement, build, and rotation eligibility checks passed.");
