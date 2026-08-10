import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("wwm/js/app.formatted.js", "utf8");
let existing = {};
try {
  existing = JSON.parse(await readFile("data/skills.json", "utf8"));
} catch {}
const arrayFn = source.match(/function _0x2f83\(\) \{[\s\S]*?\n\}\nfunction Td/)?.[0]
  .replace(/\nfunction Td[\s\S]*$/, "");
const values = new Function(`${arrayFn}\nreturn _0x2f83();`)();
const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
const SHIFT = 218;

function decode(text) {
  let bytes = [], buffer = 0, bits = 0;
  for (const char of text) {
    const value = alphabet.indexOf(char);
    if (value < 0 || char === "=") break;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); }
  }
  return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""));
}

function number(value) { return Number(value.startsWith("-") ? -Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 16)); }
function resolve(match, kind, first, second) {
  const offset = kind === "p" ? 0x337 : 0x2b6;
  const index = number(first) - offset;
  const value = values[(index + SHIFT) % values.length];
  return JSON.stringify(decode(value));
}

const resolved = source.replace(/_0x24351d\((-?0x[0-9a-f]+|-?\d+),\s*(-?0x[0-9a-f]+|-?\d+)\)/gi,
  (match, first, second) => resolve(match, "p", first, second))
  .replace(/_0x4994a7\((-?0x[0-9a-f]+|-?\d+),\s*(-?0x[0-9a-f]+|-?\d+)\)/gi,
  (match, first, second) => resolve(match, "g", first, second));

const prefix = resolved.split("\n").slice(0, 20210).join("\n");
const helpers = `
function _0x24351d(a, b) { return decode(values[(a - 0x337 + SHIFT) % values.length]); }
function _0x4994a7(a, b) { return decode(values[(a - 0x2b6 + SHIFT) % values.length]); }
`;
const registry = new Function("values", "decode", "SHIFT", `${helpers}\n${arrayFn}\n${prefix}\nreturn { xb, wb, Ab, Eb, _b };`)(values, decode, SHIFT);
await writeFile("data/skill-maps.json", `${JSON.stringify(registry, null, 2)}\n`);
console.log(Object.fromEntries(Object.entries(registry).map(([key, value]) => [key, Object.keys(value).length])));
