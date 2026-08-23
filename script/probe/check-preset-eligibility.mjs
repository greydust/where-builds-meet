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
  paths.bamboocutKite.wip !== true && paths.bamboocutWind.wip === true && paths.bamboocutDust.wip === true,
  "Kite must be production-ready while Wind and Dust remain explicitly WIP.",
);
assert(
  Object.keys(paths).join(",") === "stonesplitStrength,stonesplitMight,bamboocutKite,bamboocutWind,bamboocutDust,mixed",
  "The path selector must place Kite beside Might and Wind beside Kite.",
);
assert(
  paths.bamboocutDust.lockedWeapons.join(",") === "everspring,unfettered",
  "Dust must lock the expected martial arts.",
);
assert(
  paths.bamboocutKite.lockedWeapons.join(",") === "heavenwill,skygrasp",
  "Kite must lock the expected martial arts.",
);
assert(
  paths.bamboocutWind.icon === "wind.png" && paths.bamboocutWind.tag === "BamboocutWind",
  "Wind must expose its WIP icon and shared eligibility tag.",
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
      path.basename(file).startsWith("might-fully-relayed-") ||
      path.basename(file).startsWith("kite-fully-relayed-"),
  ),
  "Fully-relayed preset filenames must identify mixed, pure, Might, or Kite builds.",
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
  mightBuild.gear.leftWeapon.additionalAffixes.some((affix) => affix.key === "moBladeDmgBoost"),
  "The Might max preset's Mo Blade damage roll must use the Mo Blade stat key.",
);
assert(
  ["helmet", "chestpiece", "greaves", "bracer"].every(
    (slot) => mightBuild.gear[slot].attunement.key === "thundercryChargedBoost",
  ),
  "The Might max preset armor must use the Thundercry Charged attunement.",
);
assert(
  mightBuild.setup.weaponSets.RainWhisper === 4 && mightBuild.setup.armorSets.Formbend === 4,
  "The Might max preset must use its Rain Whisper and Formbend setup.",
);

for (const variant of ["min", "max"]) {
  const kiteBuild = await readJson(`data/build/bamboocut-kite/kite-fully-relayed-${variant}.json`);
  assert(
    kiteBuild.id === `kite-fully-relayed-${variant}` &&
      kiteBuild.name === `Kite Fully Relayed ${variant === "min" ? "Min" : "Max"} Build`,
    `The Kite ${variant} preset must use its Kite identity.`,
  );
  assert(
    kiteBuild.martialArts.join(",") === "heavenwill,skygrasp" &&
      kiteBuild.gear.leftWeapon.definitionId === "gauntlet" &&
      kiteBuild.gear.rightWeapon.definitionId === "skygraspRopeDart",
    `The Kite ${variant} preset must use Heavenwill Gauntlets and Skygrasp Rope Dart.`,
  );
  assert(
    kiteBuild.setup.weaponSets.Etherwrath === 4,
    `The Kite ${variant} preset must use the Etherwrath four-piece weapon set.`,
  );
  assert(
    JSON.stringify(kiteBuild.setup.innerWays) ===
      JSON.stringify([
        { innerWay: "SoaringHigh", tier: "T6" },
        { innerWay: "SkyGripped", tier: "T6" },
        { innerWay: "MoraleChant", tier: "T6" },
        { innerWay: "EnvigoratedWarrior", tier: "T6" },
      ]) && kiteBuild.setup.arsenal === "Bamboocut",
    `The Kite ${variant} preset must use its four selected Inner Ways and Bamboocut arsenal.`,
  );
  assert(
    ["helmet", "chestpiece", "greaves", "bracer"].every(
      (slot) => kiteBuild.gear[slot].attunement.key === "heavenwillChargedBoost",
    ),
    `The Kite ${variant} preset armor must use the Heavenwill Charged attunement.`,
  );
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
assert(mightRotation.name === "Dummy 1 min", "The Might tank rotation must keep its built-in preset name.");
assert(
  mightRotation.start?.step === 4 && mightRotation.start.action === 1,
  "The Might dummy rotation must start on Avalanche's second hit.",
);
assert(mightSkillIds.length === 59, "The Might dummy rotation must preserve its 59 skill entries.");
assert(
  mightSkillIds.slice(0, 13).join(",") ===
    [
      "StormRoar",
      "PredatorsShield",
      "FluteOfTheTidesCancel",
      "Deflect",
      "Avalanche",
      "StonebreakerCleave",
      "ThunderShock1",
      "Deflect",
      "LeapingToad",
      "Deflect",
      "DragonsBreath1",
      "Defense",
      "Avalanche",
    ].join(","),
  "The Might dummy rotation opener must match the exported tank sequence.",
);
const defenseStepIndexes = mightRotation.steps
  .map((step, index) => ({ step, index }))
  .filter(({ step }) => step.type === "skill" && step.skill === "Defense")
  .map(({ index }) => index);
assert(defenseStepIndexes.length === 6, "The Might dummy rotation must contain six Defense casts.");
assert(
  defenseStepIndexes.every((index) => {
    const precedingStep = mightRotation.steps[index - 1];
    return precedingStep?.type === "event" && precedingStep.event === "Delay" && precedingStep.duration === 0.3;
  }),
  "Every Defense cast in the Might dummy rotation must be preceded by a 0.3-second Delay.",
);
const cadenceEvents = mightRotation.steps.filter(
  (step) => step.type === "event" && step.event === "Buff" && step.buff === "Cadence" && step.stack === 2,
);
assert(
  cadenceEvents.length === 5 && cadenceEvents.every((event) => event.before?.action === "start"),
  "The Might dummy rotation must preserve its five two-stack Cadence events.",
);
assert(
  mightRotation.steps.at(-1)?.event === "BattleEnd" && mightRotation.steps.at(-1)?.startTime === 60.82,
  "The Might dummy rotation must end at 60.82 seconds.",
);

console.log("Path, attunement, build, and rotation eligibility checks passed.");
