import { readFile, writeFile } from "node:fs/promises";

const maps = JSON.parse(await readFile("data/skill-maps.json", "utf8"));

function displayName(id) {
  return id
    .replace(/\[.*?\]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/([0-9])(\D)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function convert(id, skill, martialArt) {
  const triggers = [];
  if (skill.triggeredSkill) {
    const triggered = skill.triggeredSkill;
    const trigger = { requirement: [], skill: [triggered.name] };
    if (triggered.enabledParam) trigger.requirement.push(triggered.enabledParam);
    if (triggered.requiresBuff) trigger.requirement.push(triggered.requiresBuff);
    if (triggered.firesBeforeParent !== undefined) trigger.firesBeforeParent = triggered.firesBeforeParent;
    triggers.push(trigger);
  }

  const tags = [];
  if (skill.attackType && skill.attackType !== "none") {
    tags.push(skill.attackType === "charge" ? "Charged" : displayName(skill.attackType));
  }
  if (martialArt) tags.push(martialArt);
  tags.push(displayName(id).replace(/\s/g, ""));

  return {
    name: displayName(id),
    castTime: skill.castTime ?? 0,
    hitCount: skill.hitCount ?? 0,
    damage: skill.physCoeff === undefined && skill.attrCoeff === undefined
      ? []
      : [{
          phyCoef: skill.physCoeff ?? 0,
          phyBonus: skill.flatPhys ?? 0,
          attrCoef: skill.attrCoeff ?? 0,
          attrBonus: skill.flatAttr ?? 0,
          time: 0,
        }],
    weaponType: skill.weaponType ?? null,
    martialArt,
    modifier: [],
    tags,
    triggers,
  };
}

const phalanx = {};
for (const [id, skill] of Object.entries(maps.Ab)) {
  if (id.startsWith("Phalanx") || id.startsWith("AnxiSoldierMo")) {
    phalanx[id] = convert(id, skill, "PhalanxBane");
  }
}

const general = {};
for (const [id, skill] of Object.entries(maps.Eb)) {
  general[id] = convert(id, skill, "General");
}

const swordSpear = {};
for (const [id, skill] of Object.entries(maps.xb)) {
  swordSpear[id] = convert(id, skill, "Sword/Spear");
}

const moBlade = {};
for (const [id, skill] of Object.entries(maps.wb)) {
  moBlade[id] = convert(id, skill, "PhalanxBane");
}

const umbrellaRopeDart = {};
for (const [id, skill] of Object.entries(maps._b)) {
  umbrellaRopeDart[id] = convert(id, skill, null);
}

await writeFile("data/skill/phalanx-bane.json", `${JSON.stringify(phalanx, null, 2)}\n`);
await writeFile("data/skill/general.json", `${JSON.stringify(general, null, 2)}\n`);
await writeFile("data/skill/sword-spear.json", `${JSON.stringify(swordSpear, null, 2)}\n`);
await writeFile("data/skill/mo-blade.json", `${JSON.stringify(moBlade, null, 2)}\n`);
await writeFile("data/skill/umbrella-rope-dart.json", `${JSON.stringify(umbrellaRopeDart, null, 2)}\n`);
console.log({
  phalanx: Object.keys(phalanx).length,
  general: Object.keys(general).length,
  swordSpear: Object.keys(swordSpear).length,
  moBlade: Object.keys(moBlade).length,
  umbrellaRopeDart: Object.keys(umbrellaRopeDart).length,
});
