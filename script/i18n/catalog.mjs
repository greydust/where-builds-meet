import { readFile, writeFile } from "node:fs/promises";

export function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

const quote = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function serializeCsv(headers, records) {
  return `${[headers, ...records.map((record) => headers.map((header) => record[header] ?? ""))]
    .map((row) => row.map(quote).join(","))
    .join("\n")}\n`;
}

export async function readCatalog(file) {
  try {
    const [headers = [], ...rows] = parseCsv(await readFile(file, "utf8"));
    return {
      headers,
      records: rows
        .filter((row) => row.some(Boolean))
        .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))),
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { headers: ["key", "en"], records: [] };
    throw error;
  }
}

export async function writeCatalog(file, headers, records) {
  await writeFile(file, serializeCsv(headers, records), "utf8");
}
