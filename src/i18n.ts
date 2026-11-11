import type * as v from "valibot"

import { developmentModeStorageKey, localeStorageKey } from "./application/persistence/keys"
import { getPersistentItem, setPersistentItem } from "./persistentStorage"
import { localeManifestSchema, localeMessagesSchema, type LocaleManifest, type LocaleMessages } from "./schemas/http"
import { validateUnknown } from "./schemas/json"

type Messages = LocaleMessages

export { developmentModeStorageKey }
const fallbackManifest: LocaleManifest = { default: "en", locales: ["en"] }
const wipLocales = new Set<string>()
const localeDisplayNames: Record<string, string> = { en: "English", "zh-Hant": "繁體中文", ko: "한국어" }

let manifest = fallbackManifest
let activeLocale = fallbackManifest.default
let activeMessages: Messages = {}
let fallbackMessages: Messages = {}
let gameMessages = new Map<string, string>()

function localeAsset(name: string) {
  return `${import.meta.env.BASE_URL}locales/${name}`
}

async function loadJson<T>(name: string, schema: v.GenericSchema<T>): Promise<T> {
  const response = await fetch(localeAsset(name), { cache: "no-cache" })
  if (!response.ok) throw new Error(`Unable to load locale asset ${name}.`)
  const result = validateUnknown(schema, (await response.json()) as unknown)
  if (!result.success) throw new Error(`Unable to load locale asset ${name}.`)
  return result.output
}

function supportedLocale(candidate: string | null | undefined) {
  if (!candidate) return undefined
  const normalized = candidate.toLowerCase()
  return manifest.locales.find(locale => locale.toLowerCase() === normalized)
}

export function isLocaleWip(locale: string) {
  return wipLocales.has(locale)
}

function localeAvailable(locale: string) {
  return !isLocaleWip(locale) || getPersistentItem(developmentModeStorageKey) === "true"
}

function availableLocale(candidate: string | null | undefined) {
  const supported = supportedLocale(candidate)
  return supported && localeAvailable(supported) ? supported : undefined
}

function browserLocale() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const candidate of candidates) {
    const exact = availableLocale(candidate)
    if (exact) return exact
    const base = availableLocale(candidate.split("-")[0])
    if (base) return base
  }
  return undefined
}

export function resolveLocale(savedLocale = getPersistentItem(localeStorageKey)) {
  return availableLocale(savedLocale) ?? browserLocale() ?? manifest.default
}

async function loadLocale(locale: string) {
  const [selected, fallback] = await Promise.all([
    loadJson(`${locale}.json`, localeMessagesSchema),
    locale === manifest.default
      ? Promise.resolve(undefined)
      : loadJson(`${manifest.default}.json`, localeMessagesSchema),
  ])
  activeLocale = locale
  activeMessages = selected
  fallbackMessages = fallback ?? selected
  gameMessages = new Map(
    Object.entries(fallbackMessages)
      .filter(
        ([key]) =>
          key.startsWith("data.") ||
          key.startsWith("stat.") ||
          key.startsWith("game.event.") ||
          key.startsWith("system."),
      )
      .map(([key, english]) => [english, activeMessages[key] ?? english]),
  )
  document.documentElement.lang = locale
  document.title = t("ui.app.documentTitle")
}

export async function initializeI18n() {
  try {
    manifest = await loadJson("manifest.json", localeManifestSchema)
  } catch {
    manifest = fallbackManifest
  }
  const locale = resolveLocale()
  try {
    await loadLocale(locale)
  } catch {
    try {
      await loadLocale(manifest.default)
    } catch {
      activeLocale = manifest.default
      activeMessages = {}
      fallbackMessages = {}
      gameMessages = new Map()
      document.documentElement.lang = manifest.default
    }
  }
}

export async function selectLocale(locale: string) {
  const supported = availableLocale(locale)
  if (!supported) return false
  try {
    await loadLocale(supported)
    setPersistentItem(localeStorageKey, supported)
    return true
  } catch {
    return false
  }
}

export function getLocale() {
  return activeLocale
}

export function getSupportedLocales() {
  return [...manifest.locales]
}

export function getLocaleDisplayName(locale: string) {
  const displayName = localeDisplayNames[locale] ?? locale
  if (locale === manifest.default) return displayName
  const completion = manifest.completion?.[locale]
  return completion === undefined || completion === 100 ? displayName : `${displayName} (${completion}%)`
}

export function t(key: string, parameters: Record<string, string | number> = {}) {
  const message = activeMessages[key] ?? fallbackMessages[key] ?? key
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : match,
  )
}

export function dataText(key: string, fallback: string) {
  return activeMessages[key] ?? fallbackMessages[key] ?? fallback
}

export function gameText(fallback: string | undefined) {
  if (!fallback) return fallback ?? ""
  return gameMessages.get(fallback) ?? fallback
}
