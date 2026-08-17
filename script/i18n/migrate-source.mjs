import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { readCatalog, writeCatalog } from "./catalog.mjs";

const root = process.cwd();
const catalogFile = path.join(root, "locales", "translations.csv");
const files = ["src/App.tsx", "src/BuildTab.tsx", "src/SimulationTab.tsx"];
const translatedAttributes = new Set(["aria-label", "title", "placeholder", "alt", "label"]);
const catalog = await readCatalog(catalogFile);
const headers = catalog.headers.length >= 2 ? catalog.headers : ["key", "en"];
const recordsByKey = new Map(catalog.records.map((record) => [record.key, record]));

const words = (value) => value.replace(/\s+/g, " ").trim();
const keyPart = (value) => {
  const parts = value.match(/[A-Za-z0-9]+/g) ?? ["text"];
  const [first = "text", ...rest] = parts.slice(0, 8);
  return `${first.toLowerCase()}${rest.map((part) => `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`).join("")}`;
};
const filePart = (file) => path.basename(file, path.extname(file)).replace(/^[A-Z]/, (value) => value.toLowerCase());

for (const relativeFile of files) {
  const file = path.join(root, relativeFile);
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements = [];
  const keysForEnglish = new Map();
  const usedKeys = new Set(recordsByKey.keys());
  const translationKey = (english) => {
    const normalized = words(english);
    const existing = keysForEnglish.get(normalized);
    if (existing) return existing;
    const base = `ui.${filePart(relativeFile)}.${keyPart(normalized)}`;
    let key = base;
    let index = 2;
    while (usedKeys.has(key) && recordsByKey.get(key)?.en !== normalized) {
      key = `${base}${index}`;
      index += 1;
    }
    usedKeys.add(key);
    keysForEnglish.set(normalized, key);
    const record = recordsByKey.get(key) ?? Object.fromEntries(headers.map((header) => [header, ""]));
    record.key = key;
    record.en = normalized;
    recordsByKey.set(key, record);
    return key;
  };
  const addReplacement = (start, end, replacement) => replacements.push({ start, end, replacement });
  const insideVisibleJsxExpression = (node) => {
    let parent = node.parent;
    while (parent && !ts.isFunctionLike(parent) && !ts.isSourceFile(parent)) {
      if (ts.isJsxExpression(parent)) return !ts.isJsxAttribute(parent.parent);
      parent = parent.parent;
    }
    return false;
  };
  const visibleExpressionLiteral = (node) => {
    if (!insideVisibleJsxExpression(node)) return false;
    const parent = node.parent;
    if (ts.isJsxExpression(parent)) return true;
    if (ts.isConditionalExpression(parent)) return parent.whenTrue === node || parent.whenFalse === node;
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
      return parent.right === node;
    return false;
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const original = source.slice(node.pos, node.end);
      const english = words(original);
      if (/[A-Za-z]/.test(english)) {
        const first = original.search(/\S/);
        const last = original.search(/\s*$/);
        addReplacement(
          node.pos,
          node.end,
          `${first < 0 ? original : original.slice(0, first)}{t("${translationKey(english)}")}${original.slice(last)}`,
        );
      }
    } else if (
      ts.isJsxAttribute(node) &&
      translatedAttributes.has(node.name.getText(sourceFile)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      /[A-Za-z]/.test(node.initializer.text)
    ) {
      addReplacement(
        node.initializer.getStart(sourceFile),
        node.initializer.end,
        `{t("${translationKey(node.initializer.text)}")}`,
      );
    } else if (ts.isStringLiteral(node) && visibleExpressionLiteral(node) && /[A-Za-z]/.test(node.text)) {
      addReplacement(node.getStart(sourceFile), node.end, `t("${translationKey(node.text)}")`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!source.includes('from "./i18n"')) {
    const lastImport = [...sourceFile.statements].filter(ts.isImportDeclaration).at(-1);
    if (lastImport) addReplacement(lastImport.end, lastImport.end, '\nimport { t } from "./i18n";');
  }
  const migrated = replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, replacement) =>
        `${text.slice(0, replacement.start)}${replacement.replacement}${text.slice(replacement.end)}`,
      source,
    );
  await writeFile(file, migrated, "utf8");
}

await writeCatalog(
  catalogFile,
  headers,
  [...recordsByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
);
console.log("Migrated static JSX text and accessibility attributes to locale keys.");
