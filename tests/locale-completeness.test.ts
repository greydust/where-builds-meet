import { readFile } from "node:fs/promises"

import { expect, it } from "vitest"

const technicalTerms = new Set([
  "DPS",
  "HPS",
  "OCR",
  "JSON",
  "PNG",
  "JPEG",
  "WebP",
  "MB",
  "Ctrl",
  "Discord",
  "GitHub",
  "greydust",
  // Existing attack/input notation, rather than English display copy.
  "FA",
  "VC",
  "QQ",
  "QQQ",
])

it.each(["zh-Hant", "ko"])("%s covers every published message without English display copy", async locale => {
  const load = async (name: string): Promise<Record<string, string>> =>
    JSON.parse(await readFile(`public/locales/${name}.json`, "utf8"))
  const [english, translated] = await Promise.all([load("en"), load(locale)])
  expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort())

  const untranslated: string[] = []
  for (const [key, message] of Object.entries(translated)) {
    expect(message.trim()).not.toBe("")
    const text = message.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, "")
    const words = text.match(/[A-Za-z]{2,}/g) ?? []
    if (words.some(word => !technicalTerms.has(word))) untranslated.push(`${key}: ${message}`)
  }
  expect(untranslated).toEqual([])
})
