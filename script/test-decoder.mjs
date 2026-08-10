import { readFile } from "node:fs/promises";

const source = await readFile("wwm/js/app.formatted.js", "utf8");
const arrayFn = source.match(/function _0x2f83\(\) \{[\s\S]*?\n\}\nfunction Td/)?.[0]
  .replace(/\nfunction Td[\s\S]*$/, "");
const values = new Function(`${arrayFn}\nreturn _0x2f83();`)();
const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";

function decode(text) {
  let bytes = [], buffer = 0, bits = 0;
  for (const char of text) {
    const value = alphabet.indexOf(char);
    if (value < 0 || char === "=") break;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""));
}

function lookup(index, shift) {
  return decode(values[(index + shift) % values.length]);
}

for (let shift = 0; shift < values.length; shift += 1) {
  const candidate = lookup(0x3a4a - 0x337, shift);
  if (candidate.includes("Anxi") || candidate.includes("Soldier")) {
    console.log({ shift, candidate, heng: lookup(0xbd6 - 0x337, shift) });
  }
}
