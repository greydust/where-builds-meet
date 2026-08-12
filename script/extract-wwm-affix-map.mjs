import fs from "node:fs";
import vm from "node:vm";

const sourcePath = new URL("../local/wwm/js/app.formatted.js", import.meta.url);
const outputPath = new URL("../data/official-wwm-affix-map.json", import.meta.url);
const source = fs.readFileSync(sourcePath, "utf8");

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

const affixTable = extractRange(
  "const _0x1bb508 = {};",
  "var rd = _0x1bb508;",
);
const statTableStart = source.indexOf("const _0x5c0a63 = {};");
const statTableEnd = source.indexOf("const _0x53394a = {};", statTableStart);
if (statTableStart < 0 || statTableEnd < 0) {
  throw new Error("Could not extract the stat-key table");
}
const statTable = source.slice(statTableStart, statTableEnd);

const context = {};
vm.createContext(context);
vm.runInContext(
  `${decoderSetup}\n${affixTable}\n${statTable}\n` +
    "globalThis.extracted = { affixes: _0x1bb508, stats: _0x5c0a63 };",
  context,
);

const mapping = Object.fromEntries(
  Object.entries(context.extracted.affixes)
    .map(([affixId, statCode]) => [affixId, context.extracted.stats[statCode]])
    .filter(([, statKey]) => typeof statKey === "string")
    .sort(([left], [right]) => Number(left) - Number(right)),
);

fs.writeFileSync(outputPath, `${JSON.stringify(mapping, null, 2)}\n`);
console.log(`Extracted ${Object.keys(mapping).length} affix IDs.`);
console.log(`9233002 -> ${mapping["9233002"]}`);
