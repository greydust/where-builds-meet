import { readFile, writeFile } from "node:fs/promises";

const path = "data/skills.json";
const source = JSON.parse(await readFile(path, "utf8"));
const preservedKeys = new Set(["SnowpartingLightCharged", "SnowpartingHeavyVC"]);

function displayName(id) {
  return id
    .replace(/\[.*?\]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/([0-9])(\D)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function martialArt(attunementType, weaponType) {
  if (attunementType?.startsWith("snowparting")) return "SnowpartingBlade";
  if (attunementType?.startsWith("phalanx")) return "PhalanxBane";
  return weaponType ?? null;
}

function tagsFor(id, skill) {
  const tags = [];
  if (skill.attackType && skill.attackType !== "none") {
    tags.push(skill.attackType === "charge" ? "Charged" : displayName(skill.attackType));
  }
  const art = martialArt(skill.attunementType, skill.weaponType);
  if (art) tags.push(art);
  const compactName = displayName(id).replace(/\s/g, "");
  if (compactName && !tags.includes(compactName)) tags.push(compactName);
  return tags;
}

function convert(id, skill) {
  if (preservedKeys.has(id)) {
    const normalized = { ...skill };
    if (normalized.tag && !normalized.tags) {
      normalized.tags = normalized.tag;
      delete normalized.tag;
    }
    if (normalized.trigger && !normalized.triggers) {
      normalized.triggers = normalized.trigger;
      delete normalized.trigger;
    }
    delete normalized.duration;
    return normalized;
  }

  if (skill.damage) {
    const normalized = {
      ...skill,
      name: skill.name ?? displayName(id),
      tags: skill.tags ?? skill.tag ?? [],
      modifier: skill.modifier ?? [],
      triggers: skill.triggers ?? skill.trigger ?? [],
    };
    delete normalized.duration;
    return normalized;
  }

  const damage = [];
  if (skill.physCoeff !== undefined || skill.attrCoeff !== undefined) {
    damage.push({
      phyCoef: skill.physCoeff ?? 0,
      phyBonus: skill.flatPhys ?? 0,
      attrCoef: skill.attrCoeff ?? 0,
      attrBonus: skill.flatAttr ?? 0,
      time: 0,
    });
  }

  const triggers = [];
  if (skill.triggeredSkill) {
    const triggered = skill.triggeredSkill;
    const trigger = {
      requirement: [],
      skill: [triggered.name],
    };
    if (triggered.enabledParam) trigger.requirement.push(triggered.enabledParam);
    if (triggered.requiresBuff) trigger.requirement.push(triggered.requiresBuff);
    if (triggered.firesBeforeParent !== undefined) trigger.firesBeforeParent = triggered.firesBeforeParent;
    triggers.push(trigger);
  }

  return {
    name: skill.name ?? displayName(id),
    castTime: skill.castTime ?? 0,
    damage,
    weaponType: skill.weaponType ?? null,
    martialArt: martialArt(skill.attunementType, skill.weaponType),
    tags: tagsFor(id, skill),
    modifier: [],
    triggers,
  };
}

const result = {};
for (const [id, skill] of Object.entries(source)) result[id] = convert(id, skill);
await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Converted ${Object.keys(result).length} skills to the shared format`);
