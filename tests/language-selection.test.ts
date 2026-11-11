// @vitest-environment jsdom
import { readFile } from "node:fs/promises"

import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  getLocale,
  getLocaleDisplayName,
  getSupportedLocales,
  initializeI18n,
  resolveLocale,
  selectLocale,
  t,
} from "@/i18n"

beforeEach(async () => {
  localStorage.clear()
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(`public/locales/${url.split("/").at(-1)}`, "utf8")),
  }))
  await initializeI18n()
})

afterEach(() => vi.unstubAllGlobals())

it.each(["en", "zh-Hans", "zh-Hant", "ja", "ko", "es", "fr", "de", "pt", "vi", "th", "ru"])(
  "loads %s, persists selection, and resolves catalog messages",
  async locale => {
    const english = JSON.parse(await readFile("public/locales/en.json", "utf8")) as Record<string, string>
    expect(getSupportedLocales()).toContain(locale)
    expect(await selectLocale(locale)).toBe(true)
    expect(getLocale()).toBe(locale)
    expect(document.documentElement.lang).toBe(locale)
    expect(localStorage.getItem("wwm-locale")).toBe(locale)
    expect(getLocaleDisplayName(locale)).not.toBe(locale)
    const messages = JSON.parse(await readFile(`public/locales/${locale}.json`, "utf8")) as Record<string, string>
    for (const [key, value] of Object.entries(english)) {
      expect(t(key)).toBe(messages[key] ?? value)
    }
  },
)

it("falls back to English when a selected locale asset lacks a message", async () => {
  vi.stubGlobal("fetch", async (url: string) => {
    const messages = JSON.parse(await readFile(`public/locales/${url.split("/").at(-1)}`, "utf8")) as Record<
      string,
      unknown
    >
    if (url.endsWith("ja.json")) delete messages["ui.app.language"]
    return { ok: true, json: async () => messages }
  })
  expect(await selectLocale("ja")).toBe(true)
  const english = JSON.parse(await readFile("public/locales/en.json", "utf8")) as Record<string, string>
  expect(t("ui.app.language")).toBe(english["ui.app.language"])
})

it.each([
  ["zh-CN", "zh-Hans"],
  ["zh-SG", "zh-Hans"],
  ["zh-TW", "zh-Hant"],
  ["zh-HK", "zh-Hant"],
  ["pt-BR", "pt"],
  ["es-MX", "es"],
])("detects browser language %s as %s without saving it", (browserLanguage, expected) => {
  vi.stubGlobal("navigator", { languages: [browserLanguage] })
  expect(resolveLocale(null)).toBe(expected)
  expect(localStorage.getItem("wwm-locale")).toBeNull()
})

it("keeps an explicit saved selection ahead of browser detection", () => {
  vi.stubGlobal("navigator", { languages: ["ja"] })
  expect(resolveLocale("ko")).toBe("ko")
})
