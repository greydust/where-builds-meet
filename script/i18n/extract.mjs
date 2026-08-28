import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { readCatalog, serializeCsv, writeCatalog } from "./catalog.mjs";

const root = process.cwd();
const catalogFile = path.join(root, "locales", "translations.csv");
const generatedDirectory = path.join(root, "public", "locales");
const checkOnly = process.argv.includes("--check");
const publishedLocales = new Set(["en", "zh-Hant", "ko"]);
const translatableDataFields = new Set(["name", "shortName", "description"]);
const translatableJsxAttributes = new Set(["aria-label", "title", "placeholder", "alt", "label"]);

const normalizeSegment = (value) =>
  String(value)
    .replace(/\.json$/i, "")
    .replace(/[^A-Za-z0-9]+(.)/g, (_, next) => (next ? next.toUpperCase() : ""));

async function filesUnder(directory, predicate) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(fullPath, predicate)));
    else if (predicate(fullPath)) result.push(fullPath);
  }
  return result;
}

function collectDataStrings(value, keyPrefix, entries, canonicalKeysByEnglish, objectPath = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDataStrings(item, keyPrefix, entries, canonicalKeysByEnglish, [...objectPath, String(index)]),
    );
    return;
  }
  Object.entries(value).forEach(([key, child]) => {
    const nextPath = [...objectPath, key];
    if (translatableDataFields.has(key) && typeof child === "string" && child.trim()) {
      const canonicalKey = keyPrefix.startsWith("data.skill.") ? undefined : canonicalKeysByEnglish.get(child);
      entries.set(canonicalKey ?? `${keyPrefix}.${nextPath.map(normalizeSegment).join(".")}`, child);
    } else collectDataStrings(child, keyPrefix, entries, canonicalKeysByEnglish, nextPath);
  });
}

function collectSourceKeys(source, file, keys, untranslated) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "t" || node.expression.text === "dataText") &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      keys.add(node.arguments[0].text);
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text.trim()))
      untranslated.push(`${path.relative(root, file)}:${sourceFile.getLineAndCharacterOfPosition(node.pos).line + 1}`);
    if (
      ts.isJsxAttribute(node) &&
      translatableJsxAttributes.has(node.name.getText(sourceFile)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      /[A-Za-z]/.test(node.initializer.text)
    )
      untranslated.push(
        `${path.relative(root, file)}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}`,
      );
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function collectStatLabels(source, file, entries) {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map(
        node.properties
          .filter(ts.isPropertyAssignment)
          .map((property) => [property.name.getText(sourceFile), property.initializer]),
      );
      const key = properties.get("key");
      const label = properties.get("label");
      if (key && label && ts.isStringLiteralLike(key) && ts.isStringLiteralLike(label))
        entries.set(`stat.${key.text}`, label.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const existing = await readCatalog(catalogFile);
const headers = existing.headers.length >= 2 ? existing.headers : ["key", "en"];
if (headers[0] !== "key" || !headers.includes("en"))
  throw new Error("Translation CSV must start with key and include en.");
const duplicateKeys = existing.records
  .map((record) => record.key)
  .filter((key, index, keys) => key && keys.indexOf(key) !== index);
if (duplicateKeys.length) throw new Error(`Duplicate translation keys: ${[...new Set(duplicateKeys)].join(", ")}`);
const recordsByKey = new Map(existing.records.map((record) => [record.key, record]));
const canonicalTerms = existing.records
  .filter((record) => record.key.startsWith("system.") && record.en)
  .map((record) => [record.key, record.en]);
const expectedEnglish = new Map(canonicalTerms);
const canonicalKeysByEnglish = new Map();

for (const [key, english] of canonicalTerms) {
  if (canonicalKeysByEnglish.has(english)) throw new Error(`Canonical term ${english} is owned by more than one key.`);
  canonicalKeysByEnglish.set(english, key);
}

const statDefinitionsFile = path.join(root, "src", "data", "statDefinitions.ts");
const statLabels = new Map();
collectStatLabels(await readFile(statDefinitionsFile, "utf8"), statDefinitionsFile, statLabels);
for (const [key, english] of statLabels) {
  expectedEnglish.set(key, english);
  if (!canonicalKeysByEnglish.has(english)) canonicalKeysByEnglish.set(english, key);
}

for (const file of await filesUnder(path.join(root, "data"), (candidate) => candidate.endsWith(".json"))) {
  const relative = path.relative(path.join(root, "data"), file).split(path.sep).map(normalizeSegment).join(".");
  const data = JSON.parse(await readFile(file, "utf8"));
  if (relative === "attunement") {
    for (const [id, definition] of Object.entries(data)) {
      if (typeof definition?.name !== "string" || !definition.name.trim()) continue;
      const key = `system.attunement.${normalizeSegment(id)}`;
      expectedEnglish.set(key, definition.name);
      canonicalKeysByEnglish.set(definition.name, key);
    }
  }
  if (relative === "gear" && data?.slots && typeof data.slots === "object") {
    for (const [id, name] of Object.entries(data.slots)) {
      if (typeof name !== "string" || !name.trim()) continue;
      const key = `system.gearSlot.${normalizeSegment(id)}`;
      expectedEnglish.set(key, name);
      canonicalKeysByEnglish.set(name, key);
    }
  }
  collectDataStrings(data, `data.${relative}`, expectedEnglish, canonicalKeysByEnglish);
}

const sourceKeys = new Set();
const untranslated = [];
for (const file of await filesUnder(path.join(root, "src"), (candidate) => /\.(?:ts|tsx)$/.test(candidate)))
  collectSourceKeys(await readFile(file, "utf8"), file, sourceKeys, untranslated);

if (untranslated.length)
  throw new Error(`Unmigrated static JSX text or attributes:\n${untranslated.map((entry) => `- ${entry}`).join("\n")}`);

for (const [key, english] of expectedEnglish) {
  const matchingRecords = existing.records.filter((record) => record.en === english);
  const record = recordsByKey.get(key) ?? Object.fromEntries(headers.map((header) => [header, ""]));
  for (const locale of headers.slice(1)) {
    if (record[locale]) continue;
    const translations = [...new Set(matchingRecords.map((candidate) => candidate[locale]).filter(Boolean))];
    if (translations.length > 1)
      throw new Error(`Conflicting ${locale} translations for canonical term ${english}: ${translations.join(", ")}`);
    if (translations.length === 1) record[locale] = translations[0];
  }
  record.key = key;
  record.en = english;
  recordsByKey.set(key, record);
}
for (const key of sourceKeys) {
  if (!recordsByKey.has(key)) throw new Error(`Missing translation CSV entry for ${key}.`);
}

const requiredKeys = new Set([
  ...expectedEnglish.keys(),
  ...sourceKeys,
  ...[...recordsByKey.keys()].filter((key) => key.startsWith("game.event.")),
]);
const records = [...recordsByKey.values()]
  .filter((record) => requiredKeys.has(record.key))
  .sort((left, right) => left.key.localeCompare(right.key));
const placeholders = (message) =>
  [...String(message).matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]).sort();
for (const record of records) {
  const expectedPlaceholders = placeholders(record.en).join(",");
  for (const locale of headers.filter((header) => header !== "key" && header !== "en")) {
    if (record[locale] && placeholders(record[locale]).join(",") !== expectedPlaceholders)
      throw new Error(`Placeholder mismatch for ${record.key} in ${locale}.`);
  }
}
const csv = serializeCsv(headers, records);
const localeFiles = Object.fromEntries(
  headers
    .slice(1)
    .map((locale) => [
      locale,
      `${JSON.stringify(Object.fromEntries(records.filter((record) => record[locale]).map((record) => [record.key, record[locale]])), null, 2)}\n`,
    ]),
);
const manifestLocales = `[${headers
  .slice(1)
  .filter((locale) => publishedLocales.has(locale))
  .map((locale) => JSON.stringify(locale))
  .join(", ")}]`;
const manifest = `{\n  "default": "en",\n  "locales": ${manifestLocales}\n}\n`;

if (checkOnly) {
  const currentCsv = await readFile(catalogFile, "utf8");
  if (currentCsv !== csv) throw new Error("translations.csv is out of date. Run npm run i18n:extract.");
  for (const [locale, content] of Object.entries(localeFiles))
    if ((await readFile(path.join(generatedDirectory, `${locale}.json`), "utf8")) !== content)
      throw new Error(`${locale}.json is out of date. Run npm run i18n:extract.`);
  if ((await readFile(path.join(generatedDirectory, "manifest.json"), "utf8")) !== manifest)
    throw new Error("Locale manifest is out of date. Run npm run i18n:extract.");
} else {
  await mkdir(path.dirname(catalogFile), { recursive: true });
  await mkdir(generatedDirectory, { recursive: true });
  await writeCatalog(catalogFile, headers, records);
  await Promise.all(
    Object.entries(localeFiles).map(([locale, content]) =>
      writeFile(path.join(generatedDirectory, `${locale}.json`), content, "utf8"),
    ),
  );
  await writeFile(path.join(generatedDirectory, "manifest.json"), manifest, "utf8");
}

console.log(`Localization catalog contains ${records.length} entries across ${headers.length - 1} locale(s).`);
