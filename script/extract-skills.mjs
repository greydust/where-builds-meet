import { readFile, writeFile } from "node:fs/promises";

const sourcePath = "wwm/js/app.formatted.js";
const outputPath = "data/skills.json";
const source = await readFile(sourcePath, "utf8");

const fields = [
  "castTime", "duration", "hitCount", "hitMode", "physCoeff", "flatPhys",
  "attrCoeff", "flatAttr", "critBoost", "weaponType", "attackType",
  "coeffsAreTotal", "damageCategory", "mysticCategory", "attunementType",
  "triggeredSkill", "bossOnlyBonus", "hasMinPhysCritBonus",
  "hasQiBreakPhysPen", "isAreaMystic", "hidden", "delayPerHit", "tickDelay",
];

function parseValue(value) {
  const trimmed = value.trim().replace(/,$/, "");
  if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16);
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "!0x0") return true;
  if (trimmed === "!0x1") return false;
  if (trimmed === "null") return null;
  const quoted = trimmed.match(/^(?:"([^"]*)"|'([^']*)')$/);
  if (quoted) return quoted[1] ?? quoted[2];
  return undefined;
}

function findValue(block, field) {
  const assignment = new RegExp(
    `(?:\\[\\s*["']${field}["']\\s*\\]|\\b${field}\\b)\\s*[:=]\\s*([^,\\n)]+)`,
  ).exec(block);
  return assignment ? parseValue(assignment[1]) : undefined;
}

const records = [];
const blockPattern = /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*\{\};([\s\S]*?)(?=\n(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=|\nfunction\s|\nvar\s)/g;
let match;
while ((match = blockPattern.exec(source))) {
  const [, sourceVariable, block] = match;
  const values = {};
  for (const field of fields) {
    const value = findValue(block, field);
    if (value !== undefined) values[field] = value;
  }
  if (Object.keys(values).length >= 2) {
    records.push({
      id: sourceVariable,
      sourceVariable,
      ...values,
      extraction: "static-bundle",
    });
  }
}

const unique = [...new Map(records.map((record) => [record.sourceVariable, record])).values()];
unique.sort((a, b) => a.sourceVariable.localeCompare(b.sourceVariable));

await writeFile(
  outputPath,
  `${JSON.stringify({ source: sourcePath, count: unique.length, skills: unique }, null, 2)}\n`,
);
console.log(`Extracted ${unique.length} skill records to ${outputPath}`);
