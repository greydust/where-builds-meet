export type LocaleManifest = {
  default: string;
  locales: string[];
};

type Messages = Record<string, string>;

const localeStorageKey = "wwm-locale";
export const developmentModeStorageKey = "wwm-dev-mode-v1";
const fallbackManifest: LocaleManifest = { default: "en", locales: ["en"] };
const wipLocales = new Set<string>();
const localeDisplayNames: Record<string, string> = {
  en: "English",
  "zh-Hant": "繁體中文",
};

let manifest = fallbackManifest;
let activeLocale = fallbackManifest.default;
let activeMessages: Messages = {};
let fallbackMessages: Messages = {};
let gameMessages = new Map<string, string>();

function localeAsset(name: string) {
  return `${import.meta.env.BASE_URL}locales/${name}`;
}

async function loadJson<T>(name: string): Promise<T> {
  const response = await fetch(localeAsset(name), { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load locale asset ${name}.`);
  return response.json() as Promise<T>;
}

function supportedLocale(candidate: string | null | undefined) {
  if (!candidate) return undefined;
  const normalized = candidate.toLowerCase();
  return manifest.locales.find((locale) => locale.toLowerCase() === normalized);
}

export function isLocaleWip(locale: string) {
  return wipLocales.has(locale);
}

function localeAvailable(locale: string) {
  return !isLocaleWip(locale) || localStorage.getItem(developmentModeStorageKey) === "true";
}

function availableLocale(candidate: string | null | undefined) {
  const supported = supportedLocale(candidate);
  return supported && localeAvailable(supported) ? supported : undefined;
}

function browserLocale() {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const candidate of candidates) {
    const exact = availableLocale(candidate);
    if (exact) return exact;
    const base = availableLocale(candidate.split("-")[0]);
    if (base) return base;
  }
  return undefined;
}

export function resolveLocale(savedLocale = localStorage.getItem(localeStorageKey)) {
  return availableLocale(savedLocale) ?? browserLocale() ?? manifest.default;
}

async function loadLocale(locale: string) {
  const [selected, fallback] = await Promise.all([
    loadJson<Messages>(`${locale}.json`),
    locale === manifest.default ? Promise.resolve(undefined) : loadJson<Messages>(`${manifest.default}.json`),
  ]);
  activeLocale = locale;
  activeMessages = selected;
  fallbackMessages = fallback ?? selected;
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
  );
  document.documentElement.lang = locale;
}

export async function initializeI18n() {
  try {
    manifest = await loadJson<LocaleManifest>("manifest.json");
  } catch {
    manifest = fallbackManifest;
  }
  const locale = resolveLocale();
  try {
    await loadLocale(locale);
  } catch {
    try {
      await loadLocale(manifest.default);
    } catch {
      activeLocale = manifest.default;
      activeMessages = {};
      fallbackMessages = {};
      gameMessages = new Map();
      document.documentElement.lang = manifest.default;
    }
  }
}

export async function selectLocale(locale: string) {
  const supported = availableLocale(locale);
  if (!supported) return false;
  try {
    await loadLocale(supported);
    localStorage.setItem(localeStorageKey, supported);
    return true;
  } catch {
    return false;
  }
}

export function getLocale() {
  return activeLocale;
}

export function getSupportedLocales() {
  return [...manifest.locales];
}

export function getLocaleDisplayName(locale: string) {
  return localeDisplayNames[locale] ?? locale;
}

export function t(key: string, parameters: Record<string, string | number> = {}) {
  const message = activeMessages[key] ?? fallbackMessages[key] ?? key;
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : match,
  );
}

export function dataText(key: string, fallback: string) {
  return activeMessages[key] ?? fallbackMessages[key] ?? fallback;
}

export function gameText(fallback: string | undefined) {
  if (!fallback) return fallback ?? "";
  return gameMessages.get(fallback) ?? fallback;
}
