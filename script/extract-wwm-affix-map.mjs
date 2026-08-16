import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../local/wwm/js/app.formatted.js", import.meta.url);
const sourceAffixMapPath = new URL("../local/official-wwm-affix-map.json", import.meta.url);
const outputPath = new URL("../data/official/affix-map.json", import.meta.url);
const importOutputPath = new URL("../data/official/import-map.json", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");
const sourceAffixMap = JSON.parse(fs.readFileSync(sourceAffixMapPath, "utf8"));

// Translate the reference site's names once at generation time. Runtime code
// only sees IDs mapped directly to Where Builds Meet's canonical data keys.
const internalAffixKeys = {
  minPhys: "minPhys",
  maxPhys: "maxPhys",
  minBellstrike: "minBellstrike",
  maxBellstrike: "maxBellstrike",
  minStonesplit: "minStonesplit",
  maxStonesplit: "maxStonesplit",
  minSilkbind: "minSilkbind",
  maxSilkbind: "maxSilkbind",
  minBamboocut: "minBamboocut",
  maxBamboocut: "maxBamboocut",
  minVoid: "minVoidAttack",
  maxVoid: "maxVoidAttack",
  power: "power",
  agility: "agility",
  momentum: "momentum",
  precision: "precision",
  crit: "crit",
  affinity: "affinity",
  allWeaponDmg: "allMartialArts",
  stMysticDmg: "singleTargetMysticDmgBoost",
  areaMysticDmg: "areaMysticDmgBoost",
  bossDmg: "vsBossDmg",
  hengBladeDmg: "hengBladeDmgBoost",
  moBladeDmg: "moBladeDmgBoost",
  umbrellaDmg: "umbrellaDmgBoost",
  ropeDartDmg: "ropeDartDmgBoost",
  physPen: "physicalPenetration",
  formlessPen: "formlessPenetration",
  physResist: "physicalResistance",
  phalanxbaneCharged: "phalanxbaneChargedBoost",
  phalanxbaneQ: "phalanxbaneMartialBoost",
  snowpartingCharged: "snowpartingChargedBoost",
  snowpartingVariedCombo: "snowpartingVariedComboBoost",
  snowpartingQ: "snowpartingMartialBoost",
  everspringUmbCharged: "everspringMartialBoost",
  everspringUmbSpecial: "everspringSpecialBoost",
  ropeDartCharged: "unfetteredChargedBoost",
  ropeDartSpecial: "unfetteredSpecialBoost",
  ropeDartQ: "unfetteredMartialBoost",
};

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Could not find ${name}`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`Could not find the end of ${name}`);
}

function extractRange(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Could not extract ${startMarker}`);
  }
  return source.slice(start, end + endMarker.length);
}

const decoderSetup = [
  extractFunction("_0x2f83"),
  extractFunction("_0x3a14"),
  extractFunction("_0x24351d"),
  extractFunction("_0x4994a7"),
  extractRange("(function (_0x7703ce", "})(_0x2f83, 0xbe68d);"),
].join("\n");

const importTables = extractRange("const _0x5aba14 = {};", "zS = _0x47435b;");

const context = {};
vm.createContext(context);
vm.runInContext(
  `${decoderSetup}\n${importTables}\n` +
    "globalThis.extracted = { slots: _0x5aba14, baseAttributeKeys: _0x3dd791, baseStats: _0x4193a2 };",
  context,
);

const mapping = Object.fromEntries(
  Object.entries(sourceAffixMap)
    .map(([affixId, sourceKey]) => [affixId, internalAffixKeys[sourceKey]])
    .filter(([, statKey]) => typeof statKey === "string")
    .sort(([left], [right]) => Number(left) - Number(right)),
);

fs.writeFileSync(outputPath, `${JSON.stringify(mapping, null, 2)}\n`);
fs.writeFileSync(
  importOutputPath,
  `${JSON.stringify(
    {
      slots: context.extracted.slots,
      baseAttributeKeys: context.extracted.baseAttributeKeys,
      baseStats: context.extracted.baseStats,
    },
    null,
    2,
  )}\n`,
);
console.log(`Generated ${Object.keys(mapping).length} supported official affix IDs.`);
console.log(`9233002 -> ${mapping["9233002"]}`);
