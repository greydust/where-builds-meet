import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const weaponIds = [
  "snowparting",
  "phalanxbane",
  "thundercry",
  "stormbreaker",
  "everspring",
  "unfettered",
  "heavenwill",
  "skygrasp",
];
const martialArtFiles = {
  snowparting: "snowparting-blade.json",
  phalanxbane: "phalanxbane-blade.json",
  thundercry: "thundercry-blade.json",
  stormbreaker: "stormbreaker-spear.json",
  everspring: "everspring-umbrella.json",
  unfettered: "unfettered-rope-dart.json",
  heavenwill: "heavenwill-gauntlets.json",
  skygrasp: "skygrasp-rope-dart.json",
};
const martialArtTags = Object.fromEntries(
  await Promise.all(
    Object.entries(martialArtFiles).map(async ([id, file]) => [id, (await readJson(`data/martial-art/${file}`)).tag]),
  ),
);

const paths = await readJson("data/path.json");
assert(
  paths.bamboocutDust.wip === true && paths.bamboocutKite.wip === true,
  "Both unfinished Bamboocut paths must remain explicitly WIP.",
);
assert(
  paths.bamboocutDust.lockedWeapons.join(",") === "everspring,unfettered",
  "Dust must lock the expected martial arts.",
);
assert(
  paths.bamboocutKite.lockedWeapons.join(",") === "heavenwill,skygrasp",
  "Kite must lock the expected martial arts.",
);

const attunements = await readJson("data/attunement.json");
for (const [id, definition] of Object.entries(attunements)) {
  if (!definition.tags.includes("Armor")) continue;
  const matchingArts = weaponIds.filter((weapon) => definition.tags.includes(martialArtTags[weapon]));
  assert(matchingArts.length === 1, `Armor attunement ${id} must carry exactly one martial-art tag.`);
}

const buildDirectories = [path.join(root, "data/build")];
const buildFiles = [];
while (buildDirectories.length) {
  const directory = buildDirectories.pop();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) buildDirectories.push(entryPath);
    else if (entry.name.endsWith(".json")) buildFiles.push(entryPath);
  }
}
assert(
  buildFiles.every(
    (file) =>
      path.basename(file) === "empty.json" ||
      path.basename(file).startsWith("mixed-fully-relayed-") ||
      path.basename(file).startsWith("pure-fully-relayed-") ||
      path.basename(file).startsWith("might-fully-relayed-"),
  ),
  "Fully-relayed preset filenames must identify mixed, pure, or Might builds.",
);
for (const file of buildFiles) {
  const preset = JSON.parse(await readFile(file, "utf8"));
  assert(
    Array.isArray(preset.martialArts) && preset.martialArts.length >= 2,
    `Build preset ${path.basename(file)} must declare martial-art eligibility.`,
  );
  if (preset.id === "empty")
    assert(
      preset.test === true && weaponIds.every((weapon) => preset.martialArts.includes(weapon)),
      "The dev empty build must carry every martial-art tag.",
    );
}

const mightBuild = await readJson("data/build/stonesplit-might/might-fully-relayed-max.json");
assert(mightBuild.name === "Might Fully Relayed Max Build", "The Might max preset must use its requested name.");
assert(
  mightBuild.martialArts.join(",") === "thundercry,stormbreaker",
  "The Might max preset must use Thundercry Blade and Stormbreaker Spear.",
);
assert(
  mightBuild.gear.leftWeapon.definitionId === "moBlade" && mightBuild.gear.rightWeapon.definitionId === "spear",
  "The Might max preset must use Mo Blade and Spear weapon definitions.",
);
assert(
  Object.values(mightBuild.gear).every(
    (gear) => gear.baseAffix.key !== "agility" && gear.additionalAffixes.every((affix) => affix.key !== "agility"),
  ),
  "The Might max preset must replace every Agility roll with Momentum.",
);
assert(
  mightBuild.setup.weaponSets.RainWhisper === 4 && mightBuild.setup.armorSets.Formbend === 4,
  "The Might max preset must use its Rain Whisper and Formbend setup.",
);

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
  assert(
    Array.isArray(rotation.martialArts) && rotation.martialArts.length >= 2,
    `Rotation ${path.basename(file)} must declare martial-art eligibility.`,
  );
  if (path.basename(file) === "empty.json")
    assert(
      rotation.test === true && weaponIds.every((weapon) => rotation.martialArts.includes(weapon)),
      "The dev empty rotation must carry every martial-art tag.",
    );
}

const mightRotation = await readJson("data/rotation/stonesplit-might/dummy-1-min.json");
const mightSkillIds = mightRotation.steps.filter((step) => step.type === "skill").map((step) => step.skill);
assert(mightRotation.name === "Dummy 1 min", "The Teams Dummy rotation must use its requested preset name.");
assert(
  mightRotation.start?.step === 2 && mightRotation.start.action === 0,
  "The Might dummy rotation must start on the first Avalanche hit.",
);
assert(mightSkillIds.length === 60, "The Might dummy rotation must preserve all 60 exported sequence entries.");
assert(
  mightSkillIds.slice(0, 12).join(",") ===
    [
      "StormRoar",
      "PredatorsShield",
      "Avalanche",
      "Deflect",
      "ThunderShockCancel",
      "Deflect",
      "Avalanche",
      "Deflect",
      "Avalanche",
      "StonebreakerCleave",
      "Deflect",
      "Deflect",
    ].join(","),
  "The Might dummy rotation opener must match the exported Teams Dummy sequence.",
);
assert(
  mightRotation.steps.at(-1)?.event === "BattleEnd" && mightRotation.steps.at(-1)?.startTime === 60,
  "The Might dummy rotation must end at 60 seconds.",
);

console.log("Path, attunement, build, and rotation eligibility checks passed.");
