import { attunementData, attunementsForGearDefinition, gearData, type GearLevel, type GearRarity, type GearValue } from "./gear";

export type GearOcrResult = {
  definitionId: string;
  level: GearLevel;
  rarity: GearRarity;
  relayed: boolean;
  baseAffix: GearValue;
  additionalAffixes: GearValue[];
  attunement: GearValue;
  rawText: string;
};

type OcrWord = { text: string; left: number; top: number; width: number; height: number; confidence: number };

const normalize = (value: string) => value
  .toLowerCase()
  .replace(/\[?turn\]?/g, " ")
  .replace(/critical rate/g, "critical")
  .replace(/precision rate/g, "precision")
  .replace(/art\s*of\s*mo\s*blade\s*dmg\s*boost/g, "art of mo")
  .replace(/art\s*of\s*heng\s*blade\s*dmg\s*boost/g, "art of heng")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();
const normalizeLabel = (value: string) => normalize(value).replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();

function parseWords(tsv: string): OcrWord[] {
  return tsv.split(/\r?\n/).flatMap((line): OcrWord[] => {
    const columns = line.split("\t");
    if (columns[0] !== "5" || columns.length < 12) return [];
    const [left, top, width, height, confidence] = columns.slice(6, 11).map(Number);
    const text = columns.slice(11).join("\t").trim();
    return text && [left, top, width, height, confidence].every(Number.isFinite) ? [{ text, left, top, width, height, confidence }] : [];
  });
}

function definitionFromText(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const aliases: Record<string, string[]> = {
    hengBlade: ["weapon heng blade", "heng blade"],
    moBlade: ["weapon mo blade", "mo blade"],
    chestpiece: ["chestpiece", "chest piece", "chest armor"],
    greaves: ["greaves"],
    bracer: ["bracer"],
    helmet: ["helmet"],
    disc: ["disc"],
    pendant: ["pendant"],
  };
  const matches = Object.entries(aliases).filter(([, values]) => values.some((value) => normalized.includes(value)));
  if (matches.length !== 1) throw new Error("Could not identify exactly one supported gear type from the image.");
  return matches[0][0];
}

function valueForLabel(label: string, allowedKeys: string[], definitions: Record<string, { name?: string }>) {
  const normalizedLabel = normalizeLabel(label);
  const candidates = allowedKeys.filter((key) => {
    const name = normalizeLabel(definitions[key]?.name ?? key);
    return name.length >= 3 && (normalizedLabel.includes(name) || name.includes(normalizedLabel));
  }).sort((left, right) => normalizeLabel(definitions[right]?.name ?? right).length - normalizeLabel(definitions[left]?.name ?? left).length);
  if (candidates.length === 0) throw new Error(`Could not match OCR attribute “${label.trim()}”.`);
  return candidates[0];
}

function numericValue(text: string) {
  const cleaned = text.replace(/,/g, ".").replace(/[^0-9.%]/g, "");
  const match = cleaned.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

function isStandaloneNumericValue(text: string) {
  return /^[^0-9]*\d+(?:[.,]\d+)?%?[^0-9]*$/.test(text.trim());
}

function storedValue(key: string, value: number, definitions: Record<string, { percentage?: boolean }>): GearValue {
  return { key, value: definitions[key]?.percentage ? value / 100 : value };
}

export function parseGearOcrTsv(tsv: string, rawText: string, imageWidth: number, imageHeight: number, rarity: GearRarity): GearOcrResult {
  const words = parseWords(tsv);
  if (words.length === 0) throw new Error("No readable text was found in the image.");
  const definitionId = definitionFromText(rawText);
  const definition = gearData.gear[definitionId];
  if (!definition) throw new Error("The recognized gear type is not supported.");
  const normalizedText = normalize(rawText);
  const levelMatch = normalizedText.match(/tier\s*(91|96)/);
  if (!levelMatch) throw new Error("Could not read Gear Tier 91 or Tier 96.");
  const level = Number(levelMatch[1]) as GearLevel;
  const relayed = /\brelay(?:ing|ed)?\b/.test(normalizedText);

  // The gear's built-in attack value is displayed above the affix rows, and
  // screenshots may be cropped tightly or include extra space below the card.
  // Reading the final six right-aligned scalar values avoids depending on a
  // fixed percentage of the image height and excludes attack ranges such as
  // `65~151`.
  const valueCandidates = words
    .filter((word) => word.left > imageWidth * 0.7 && isStandaloneNumericValue(word.text) && numericValue(word.text) !== undefined)
    .sort((left, right) => left.top - right.top);
  if (valueCandidates.length < 6) throw new Error(`Expected five affix values and one attunement value, but found ${valueCandidates.length}.`);
  const numberWords = valueCandidates.slice(-6);

  const rows = numberWords.map((numberWord, index) => {
    const center = numberWord.top + numberWord.height / 2;
    const previousCenter = index === 0 ? undefined : numberWords[index - 1].top + numberWords[index - 1].height / 2;
    const nextCenter = index === numberWords.length - 1 ? undefined : numberWords[index + 1].top + numberWords[index + 1].height / 2;
    const top = previousCenter === undefined
      ? center - ((nextCenter ?? center + numberWord.height * 2) - center) / 2
      : (previousCenter + center) / 2;
    // Armor attunement names can wrap onto a line below their value, so the
    // final row must retain the remainder of the cropped card.
    const bottom = nextCenter === undefined ? imageHeight : (center + nextCenter) / 2;
    const label = words
      .filter((word) => word.left < imageWidth * 0.7 && word.top + word.height / 2 >= top && word.top + word.height / 2 < bottom && word.confidence >= 20)
      .sort((left, right) => Math.abs(left.top - right.top) <= 12 ? left.left - right.left : left.top - right.top)
      .map((word) => word.text)
      .join(" ");
    const value = numericValue(numberWord.text);
    if (!label || value === undefined) throw new Error("An affix row was not clear enough to import.");
    return { label, value };
  });

  const levelKey = String(level);
  const baseKey = valueForLabel(rows[0].label, definition.baseAffixes[levelKey] ?? [], gearData.affixes);
  const additionalAffixes = rows.slice(1, 5).map((row) => storedValue(valueForLabel(row.label, definition.additionalAffixes[levelKey] ?? [], gearData.affixes), row.value, gearData.affixes));
  if (new Set(additionalAffixes.map((affix) => affix.key)).size !== 4) throw new Error("The image contains duplicate or unclear additional affixes.");
  const attunementKey = valueForLabel(rows[5].label, attunementsForGearDefinition(definition), attunementData);
  return {
    definitionId,
    level,
    rarity,
    relayed,
    baseAffix: storedValue(baseKey, rows[0].value, gearData.affixes),
    additionalAffixes,
    attunement: storedValue(attunementKey, rows[5].value, attunementData),
    rawText,
  };
}

async function imageDimensionsAndRarity(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot inspect the image.");
    context.drawImage(bitmap, 0, 0);
    const sampleWidth = Math.max(1, Math.ceil(bitmap.width * 0.045));
    const sampleHeight = Math.max(1, Math.ceil(bitmap.height * 0.12));
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let gold = 0;
    let purple = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red > 125 && green > 80 && red > blue * 1.12 && green > blue * 0.9) gold += 1;
      if (blue > 110 && red > 70 && blue > red * 1.08 && blue > green * 1.08) purple += 1;
    }
    const threshold = Math.max(6, sampleHeight * 0.08);
    if (gold < threshold && purple < threshold) throw new Error("Could not determine Gold or Purple rarity from the color beside the gear name.");
    if (Math.min(gold, purple) > Math.max(gold, purple) * 0.75) throw new Error("The rarity color is ambiguous.");
    return { width: bitmap.width, height: bitmap.height, rarity: (gold > purple ? "Gold" : "Purple") as GearRarity };
  } finally {
    bitmap.close();
  }
}

export async function recognizeGearImage(file: File, onProgress?: (progress: number, status: string) => void) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG, or WebP image file.");
  const dimensions = await imageDimensionsAndRarity(file);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const assetRoot = `${import.meta.env.BASE_URL}ocr`;
  let recognitionPass = 0;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: assetRoot,
    workerPath: `${assetRoot}/worker.min.js`,
    corePath: `${assetRoot}/tesseract-core-lstm.wasm.js`,
    logger: (message) => {
      const passProgress = typeof message.progress === "number" ? message.progress : 0;
      onProgress?.((recognitionPass + passProgress) / 2, message.status ?? "Reading image");
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const metadataResult = await worker.recognize(file, {}, { text: true, tsv: true });
    recognitionPass = 1;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const positionedResult = await worker.recognize(file, {}, { text: true, tsv: true });
    if (!positionedResult.data.tsv) throw new Error("OCR did not return positioned text.");
    const rawText = `${metadataResult.data.text}\n${positionedResult.data.text}`;
    try {
      return parseGearOcrTsv(positionedResult.data.tsv, rawText, dimensions.width, dimensions.height, dimensions.rarity);
    } catch (sparseError) {
      if (!metadataResult.data.tsv) throw sparseError;
      try {
        return parseGearOcrTsv(metadataResult.data.tsv, rawText, dimensions.width, dimensions.height, dimensions.rarity);
      } catch {
        throw sparseError;
      }
    }
  } finally {
    await worker.terminate();
  }
}
