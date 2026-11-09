import itemNamesJson from "@gamedata/ocr-item-names.json"

import {
  affixOptionsForGearDefinition,
  attunementData,
  attunementsForGearDefinition,
  gearData,
  gearLevels,
  type GearLevel,
  type GearRarity,
  type GearValue,
} from "./gear"

const gearTierPattern = new RegExp(`\\btier\\s*(${gearLevels.join("|")})\\b`, "i")

export type GearOcrResult = {
  definitionId: string
  level: GearLevel
  rarity: GearRarity
  relayed: boolean
  baseAffix?: GearValue
  additionalAffixes: GearValue[]
  attunement?: GearValue
  rawText: string
}

type OcrWord = { text: string; left: number; top: number; width: number; height: number; confidence: number }

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\[?turn\]?/g, " ")
    .replace(/critical rate/g, "critical")
    .replace(/precision rate/g, "precision")
    .replace(/art\s*of\s*mo\s*blade\s*dmg\s*boost/g, "art of mo")
    .replace(/art\s*of\s*heng\s*blade\s*dmg\s*boost/g, "art of heng")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
const normalizeLabel = (value: string) =>
  normalize(value)
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

function parseWords(tsv: string): OcrWord[] {
  return tsv.split(/\r?\n/).flatMap((line): OcrWord[] => {
    const columns = line.split("\t")
    if (columns[0] !== "5" || columns.length < 12) return []
    const [left, top, width, height, confidence] = columns.slice(6, 11).map(Number)
    const text = columns.slice(11).join("\t").trim()
    return text && [left, top, width, height, confidence].every(Number.isFinite)
      ? [{ text, left, top, width, height, confidence }]
      : []
  })
}

function definitionFromText(text: string, fallbackDefinitionId?: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const namedItems = Object.entries(itemNamesJson)
    .filter(([name]) => ` ${normalized} `.includes(` ${normalize(name)} `))
    .sort(([left], [right]) => right.length - left.length)
  if (namedItems.length > 0) {
    const longestName = namedItems[0][0].length
    const definitions = new Set(namedItems.filter(([name]) => name.length === longestName).map(([, id]) => id))
    if (definitions.size === 1) return namedItems[0][1]
    throw new Error("The item name matches more than one supported gear type.")
  }
  const aliases: Record<string, string[]> = {
    hengBlade: ["weapon heng blade", "heng blade"],
    moBlade: ["weapon mo blade", "mo blade"],
    chestpiece: ["chestpiece", "chest piece", "chest armor"],
    greaves: ["greaves"],
    bracer: ["bracer"],
    helmet: ["helmet"],
    disc: ["disc"],
    pendant: ["pendant"],
  }
  const matches = Object.entries(aliases).filter(([, values]) => values.some(value => normalized.includes(value)))
  if (matches.length !== 1) {
    if (fallbackDefinitionId && gearData.gear[fallbackDefinitionId]) return fallbackDefinitionId
    throw new Error("Could not identify exactly one supported gear type from the image.")
  }
  return matches[0][0]
}

export function gearRarityFromTitleColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tsv: string,
): GearRarity | undefined {
  const titleWord = parseWords(tsv)
    .filter(word => word.confidence >= 50 && /[a-z]{3}/i.test(word.text))
    .sort((left, right) => left.top - right.top)[0]
  if (!titleWord || titleWord.top > height * 0.25) return undefined
  // The narrow rarity strip sits immediately left of the first title word.
  // Scale the search area with title height so resized screenshots still work.
  const left = Math.max(0, Math.floor(titleWord.left - titleWord.height * 0.75))
  const right = Math.max(0, Math.floor(titleWord.left - titleWord.height * 0.1))
  const top = Math.max(0, Math.floor(titleWord.top))
  const bottom = Math.min(height, Math.ceil(titleWord.top + titleWord.height))
  let gold = 0
  let purple = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < Math.min(width, right); x++) {
      const offset = (y * width + x) * 4
      const [red, green, blue, alpha] = pixels.subarray(offset, offset + 4)
      if (alpha < 128 || Math.max(red, green, blue) < 65) continue
      if (red > blue * 1.2 && green > blue * 1.12 && red >= green * 0.95) gold++
      if (blue > green * 1.12 && red > green * 1.05 && blue >= red * 0.9) purple++
    }
  }
  const minimum = Math.max(3, (right - left) * (bottom - top) * 0.02)
  if (gold >= minimum && gold > purple * 2) return "Gold"
  if (purple >= minimum && purple > gold * 2) return "Purple"
  return undefined
}

function valueForLabel(label: string, allowedKeys: string[], definitions: Record<string, { name?: string }>) {
  const normalizedLabel = normalizeLabel(label)
  const candidates = allowedKeys
    .filter(key => {
      const name = normalizeLabel(definitions[key]?.name ?? key)
      return name.length >= 3 && (normalizedLabel.includes(name) || name.includes(normalizedLabel))
    })
    .sort(
      (left, right) =>
        normalizeLabel(definitions[right]?.name ?? right).length -
        normalizeLabel(definitions[left]?.name ?? left).length,
    )
  if (candidates.length === 0) throw new Error(`Could not match OCR attribute “${label.trim()}”.`)
  return candidates[0]
}

function numericValue(text: string) {
  const cleaned = text.replace(/,/g, ".").replace(/[^0-9.%]/g, "")
  const match = cleaned.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

function isStandaloneNumericValue(text: string) {
  return /^[^0-9]*\d+(?:[.,]\d+)?%?[^0-9]*$/.test(text.trim())
}

function inlineValueWords(words: OcrWord[]) {
  return words.filter(word => /^\+\s*\d/.test(word.text)).sort((left, right) => left.top - right.top)
}

function storedValue(key: string, value: number, definitions: Record<string, { percentage?: boolean }>): GearValue {
  return { key, value: definitions[key]?.percentage ? value / 100 : value }
}

function numericTokens(text: string) {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(value => Number(value.replace(",", ".")))
}

function containsNumber(values: number[], expected: number) {
  return values.some(value => Math.abs(value - expected) < 0.011)
}

export function inferGearLevelAndRarity(definitionId: string, rawText: string) {
  const definition = gearData.gear[definitionId]
  const normalizedText = normalize(rawText)
  const levelMatch = normalizedText.match(gearTierPattern)
  const level = (levelMatch ? Number(levelMatch[1]) : 96) as GearLevel
  const values = numericTokens(rawText)
  const rarities = (["Gold", "Purple"] as const).filter(rarity => {
    const signature = definition?.baseStats[String(level)]?.[rarity]
    const signatureValues = Object.values(signature ?? {}).filter((value): value is number => typeof value === "number")
    return signatureValues.length > 0 && signatureValues.every(value => containsNumber(values, value))
  })
  return { level, rarity: rarities.length === 1 ? rarities[0] : ("Gold" as const) }
}

function optionalValueForLabel(label: string, allowedKeys: string[], definitions: Record<string, { name?: string }>) {
  if (!label.trim()) return undefined
  try {
    return valueForLabel(label, allowedKeys, definitions)
  } catch {
    return undefined
  }
}

export function parseGearOcrTsv(
  tsv: string,
  rawText: string,
  imageWidth: number,
  imageHeight: number,
  fallbackDefinitionId?: string,
  titleRarity?: GearRarity,
): GearOcrResult {
  const words = parseWords(tsv)
  if (words.length === 0) throw new Error("No readable text was found in the image.")
  const definitionId = definitionFromText(rawText, fallbackDefinitionId)
  const definition = gearData.gear[definitionId]
  if (!definition) throw new Error("The recognized gear type is not supported.")
  const normalizedText = normalize(rawText)
  const inferred = inferGearLevelAndRarity(definitionId, rawText)
  const { level } = inferred
  const rarity = titleRarity ?? inferred.rarity
  const relayed = /\brelay(?:ing|ed)?\b/.test(normalizedText)

  // The gear's built-in attack value is displayed above the affix rows, and
  // screenshots may be cropped tightly or include extra space below the card.
  // Reading the final six right-aligned scalar values avoids depending on a
  // fixed percentage of the image height and excludes attack ranges such as
  // `65~151`.
  const valueCandidates = words
    .filter(
      word =>
        word.left > imageWidth * 0.7 && isStandaloneNumericValue(word.text) && numericValue(word.text) !== undefined,
    )
    .sort((left, right) => left.top - right.top)
  const inlineWords = inlineValueWords(words)
  const inlineLayout = inlineWords.length >= 2
  const numberWords = (inlineLayout ? inlineWords : valueCandidates).slice(-6)

  const rows = numberWords
    .map((numberWord, index) => {
      const center = numberWord.top + numberWord.height / 2
      const previousCenter = index === 0 ? undefined : numberWords[index - 1].top + numberWords[index - 1].height / 2
      const nextCenter =
        index === numberWords.length - 1 ? undefined : numberWords[index + 1].top + numberWords[index + 1].height / 2
      const top =
        previousCenter === undefined
          ? center - ((nextCenter ?? center + numberWord.height * 2) - center) / 2
          : (previousCenter + center) / 2
      // Armor attunement names can wrap onto a line below their value, so the
      // final row must retain the remainder of the cropped card.
      const bottom = nextCenter === undefined ? imageHeight : (center + nextCenter) / 2
      const label = words
        .filter(
          word =>
            word.left < (inlineLayout ? numberWord.left : imageWidth * 0.7) &&
            word.top + word.height / 2 >= top &&
            word.top + word.height / 2 < bottom &&
            word.confidence >= 20,
        )
        .sort((left, right) => (Math.abs(left.top - right.top) <= 12 ? left.left - right.left : left.top - right.top))
        .map(word => word.text)
        .join(" ")
      // Inline values can be split into adjacent OCR words, e.g. `+6 3.8`.
      const valueText = inlineLayout
        ? words
            .filter(
              word =>
                word.left >= numberWord.left &&
                Math.abs(word.top + word.height / 2 - center) <= numberWord.height / 2 &&
                /^[+\d.,%]+$/.test(word.text),
            )
            .sort((left, right) => left.left - right.left)
            .map(word => word.text)
            .join("")
        : numberWord.text
      const value = numericValue(valueText)
      if (value === undefined) return undefined
      return { label, value }
    })
    .filter((row): row is { label: string; value: number } => Boolean(row))

  const baseKeys = affixOptionsForGearDefinition(definition, "baseAffixes", level, relayed)
  const additionalKeys = affixOptionsForGearDefinition(definition, "additionalAffixes", level, relayed)
  const attunementKeys = attunementsForGearDefinition(definition)
  let baseAffix: GearValue | undefined
  let attunement: GearValue | undefined
  const additionalAffixes: GearValue[] = []

  if (rows.length === 6) {
    const baseKey = optionalValueForLabel(rows[0].label, baseKeys, gearData.affixes)
    if (baseKey) baseAffix = storedValue(baseKey, rows[0].value, gearData.affixes)
    for (const row of rows.slice(1, 5)) {
      const key = optionalValueForLabel(row.label, additionalKeys, gearData.affixes)
      if (key && !additionalAffixes.some(affix => affix.key === key))
        additionalAffixes.push(storedValue(key, row.value, gearData.affixes))
    }
    const attunementKey = optionalValueForLabel(rows[5].label, attunementKeys, attunementData)
    if (attunementKey) attunement = storedValue(attunementKey, rows[5].value, attunementData)
  } else {
    for (const row of rows) {
      const baseKey = optionalValueForLabel(row.label, baseKeys, gearData.affixes)
      const additionalKey = optionalValueForLabel(row.label, additionalKeys, gearData.affixes)
      const attunementKey = optionalValueForLabel(row.label, attunementKeys, attunementData)
      const categories = [baseKey && "base", additionalKey && "additional", attunementKey && "attunement"].filter(
        Boolean,
      )
      if (categories.length !== 1) continue
      switch (categories[0]) {
        case "base":
          if (!baseAffix && baseKey) baseAffix = storedValue(baseKey, row.value, gearData.affixes)
          break
        case "additional":
          if (additionalKey && !additionalAffixes.some(affix => affix.key === additionalKey))
            additionalAffixes.push(storedValue(additionalKey, row.value, gearData.affixes))
          break
        case "attunement":
          if (!attunement && attunementKey) attunement = storedValue(attunementKey, row.value, attunementData)
          break
      }
    }
  }
  return {
    definitionId,
    level,
    rarity,
    relayed,
    ...(baseAffix ? { baseAffix } : {}),
    additionalAffixes,
    ...(attunement ? { attunement } : {}),
    rawText,
  }
}

async function imageDetails(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Could not read image colors.")
    context.drawImage(bitmap, 0, 0)
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
    }
  } finally {
    bitmap.close()
  }
}

export async function recognizeGearImage(
  file: File,
  onProgress?: (progress: number, status: string) => void,
  fallbackDefinitionId?: string,
) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG, or WebP image file.")
  const dimensions = await imageDetails(file)
  const { createWorker, OEM, PSM } = await import("tesseract.js")
  const assetRoot = `${import.meta.env.BASE_URL}ocr`
  let recognitionPass = 0
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    langPath: assetRoot,
    workerPath: `${assetRoot}/worker.min.js`,
    corePath: `${assetRoot}/tesseract-core-lstm.wasm.js`,
    logger: message => {
      const passProgress = typeof message.progress === "number" ? message.progress : 0
      onProgress?.((recognitionPass + passProgress) / 2, message.status ?? "Reading image")
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" })
    const metadataResult = await worker.recognize(file, {}, { text: true, tsv: true })
    recognitionPass = 1
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" })
    const positionedResult = await worker.recognize(file, {}, { text: true, tsv: true })
    if (!positionedResult.data.tsv) throw new Error("OCR did not return positioned text.")
    const titleRarity = gearRarityFromTitleColor(
      dimensions.pixels,
      dimensions.width,
      dimensions.height,
      positionedResult.data.tsv,
    )
    let rawText = `${metadataResult.data.text}\n${positionedResult.data.text}`
    const inlineWords = inlineValueWords(parseWords(positionedResult.data.tsv))
    if (!gearTierPattern.test(rawText) && inlineWords.length >= 2) {
      // The progression page's tier banner uses dark text on a light strip.
      // Isolate it from the surrounding light-on-dark title and attributes.
      const gap = inlineWords[1].top - inlineWords[0].top
      const left = Math.round(dimensions.width * 0.25)
      const top = Math.max(0, Math.round(inlineWords[0].top - gap))
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
      const tierResult = await worker.recognize(file, {
        rectangle: {
          left,
          top,
          width: Math.round(dimensions.width * 0.35),
          height: Math.min(dimensions.height - top, Math.max(1, Math.round(gap * 0.6))),
        },
      })
      const tier = tierResult.data.text.match(gearTierPattern)
      if (tier) rawText += `\nTier ${tier[1]}`
    }
    try {
      return parseGearOcrTsv(
        positionedResult.data.tsv,
        rawText,
        dimensions.width,
        dimensions.height,
        fallbackDefinitionId,
        titleRarity,
      )
    } catch (sparseError) {
      if (!metadataResult.data.tsv) throw sparseError
      try {
        return parseGearOcrTsv(
          metadataResult.data.tsv,
          rawText,
          dimensions.width,
          dimensions.height,
          fallbackDefinitionId,
          titleRarity,
        )
      } catch {
        throw sparseError
      }
    }
  } finally {
    await worker.terminate()
  }
}
