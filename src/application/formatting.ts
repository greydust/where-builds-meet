import type { SkillRecord } from "@/calculations/rotationTimeline"
import { dataText, gameText, getLocale } from "@/i18n"
import type { EditorCategory } from "@/skillOverrides"

import { allSkillDefinitions, dotDefinitions, skillDataNamespaceById } from "./gameData/skills"

export function skillCategoryLabel(category: EditorCategory) {
  switch (category) {
    case "Snowparting":
      return "Snowparting Blade"
    case "Phalanxbane":
      return "Phalanxbane Blade"
    case "Infernal":
      return "Infernal Twinblades"
    case "Everspring":
      return "Everspring Umbrella"
    case "Unfettered":
      return "Unfettered Rope Dart"
    case "Mortal":
      return "Mortal Rope Dart"
    case "Soulshade":
      return "Soulshade Umbrella"
    case "Panacea":
      return "Panacea Fan"
    case "StrategicSword":
      return "Strategic Sword"
    case "HeavenQuakerSpear":
      return "Heavenquaker Spear"
    default:
      return category
  }
}

export function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value)
  const trimmed = value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return trimmed === "-0" ? "0" : trimmed
}

export function deltaPrefix(value: number) {
  return value > 0 && formatNumber(value) !== "0" ? "+" : ""
}

export type ThroughputChannel = "damage" | "healing"

/**
 * Damage, healing, and the per-second rates taken from them are magnitudes a reader weighs
 * against one another, so they are all presented the same way.
 *
 * A thousand separator only earns its place once a number is long enough that a reader would
 * lose track of it without one. Under that, the number is written out in full however many
 * digits it has: a separator inside a number already short enough to count at a glance reads
 * as noise, and it makes two figures of similar size occupy visibly different widths.
 */
const groupingThreshold = 10_000
const defaultPrecision = 2
const roundingLocale = "en"

const amountFormatters = new Map<string, Intl.NumberFormat>()

function amountFormatter(locale: string, precision: number, grouped: boolean) {
  const key = `${locale}|${precision}|${grouped}`
  const cached = amountFormatters.get(key)
  if (cached) return cached
  const created = new Intl.NumberFormat(locale, {
    useGrouping: grouped,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
  amountFormatters.set(key, created)
  return created
}

/**
 * The magnitude a reader will actually see, as a number rather than as text.
 *
 * `Intl` rounds the shortest decimal representation of a value, which `toFixed` does not:
 * `1.005` is `1.00` to `toFixed` and `1.01` to `Intl`. A caller that needs a number to
 * decide something — whether a difference reads as an increase, say — has to round the way the
 * formatter rounds or it can contradict the text printed next to it, and reading the magnitude
 * back out of a formatter is the only way to get exactly that rounding.
 *
 * The read-back runs in a fixed locale rather than the reader's, because a reader's locale may
 * separate the decimals with a character the number parser does not accept. How a number is
 * presented is the reader's business; what the number is, is not.
 */
function roundedThroughput(value: number, precision = defaultPrecision) {
  return Number(amountFormatter(roundingLocale, precision, false).format(value))
}

/**
 * A magnitude in the reader's locale, grouped only once it is large enough to need it. The
 * threshold is judged on the rounded magnitude, so a number that rounds up across it is
 * grouped like the number it turns into instead of showing digits that disagree with each other.
 */
export function formatThroughput(value: number, precision = defaultPrecision) {
  const rounded = roundedThroughput(value, precision)
  return amountFormatter(getLocale(), precision, Math.abs(rounded) >= groupingThreshold).format(rounded)
}

/**
 * The signed form, for a difference between two magnitudes. A difference of nothing is written
 * as `0`: a sign and its decimals on a value that is not there is noise, and the sign would
 * claim a direction that `throughputDeltaClass` reads as no change at all.
 */
export function formatThroughputDelta(value: number, precision = defaultPrecision) {
  const rounded = roundedThroughput(value, precision)
  if (rounded === 0) return "0"
  return rounded > 0 ? `+${formatThroughput(rounded, precision)}` : formatThroughput(rounded, precision)
}

const throughputChannelName: Record<ThroughputChannel, string> = { damage: "damage", healing: "healing" }

export function throughputDeltaClass(value: number, channel: ThroughputChannel) {
  const rounded = roundedThroughput(value)
  if (rounded === 0) return "throughput-neutral"
  return `${throughputChannelName[channel]}-${rounded > 0 ? "positive" : "negative"}`
}

export function skillFieldText(skillId: string, skill: SkillRecord | undefined, field: "name" | "shortName") {
  const definition = skill ?? dotDefinitions[skillId]
  const value = definition?.[field]?.trim()
  if (!value) return field === "name" ? skillId : ""
  const namespace = skillDataNamespaceById.get(skillId)
  const defaultValue = allSkillDefinitions[skillId]?.[field]?.trim()
  if (!namespace && value === dotDefinitions[skillId]?.[field]?.trim()) return gameText(value)
  return namespace && value === defaultValue ? dataText(`data.skill.${namespace}.${skillId}.${field}`, value) : value
}

export function skillDisplayName(skill: SkillRecord | undefined, fallback = "", skillId = fallback) {
  const name = skillFieldText(skillId, skill, "name")
  const shortName = skillFieldText(skillId, skill, "shortName")
  return shortName ? `${name} (${shortName})` : name
}

export function formatResourceRange(value: number, range: { minimum: number; maximum: number } | undefined) {
  if (!range || Math.abs(range.maximum - range.minimum) < 1e-9) return formatNumber(value)
  return `${formatNumber(range.minimum)} ~ ${formatNumber(range.maximum)}`
}
