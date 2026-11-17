import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconArrowsExchange,
  IconCirclePlus,
  IconTrash,
} from "@tabler/icons-react"

import { formatNumber, formatThroughput } from "@/application/formatting"
import { attunementData, gearData } from "@/gear"
import { gameText, t } from "@/i18n"
import { Tooltip } from "@/ui/Tooltip"

import type { AffixFlag } from "./affixFlags"

function flagMessage(flag: AffixFlag, item: boolean) {
  switch (flag.kind) {
    case "overCap":
      return t("ui.buildTab.flagOverCap", {
        stat: gameText(gearData.affixes[flag.statKey]?.name ?? flag.statKey),
        count: flag.reduceBy,
      })
    case "lowValue":
      return t("ui.buildTab.flagLowValue", {
        dps: formatThroughput(flag.dpsDifference),
        target: formatThroughput(flag.maxVoidDps),
      })
    case "graduationGap":
      return item && flag.direction === "tooFew"
        ? t("ui.buildTab.flagGraduationGapPositive", {
            stat: gameText(gearData.affixes[flag.statKey]?.name ?? flag.statKey),
            graduate: flag.graduateCount,
            current: flag.currentCount,
          })
        : t("ui.buildTab.flagGraduationGap", { graduate: flag.graduateCount, current: flag.currentCount })
    case "attunementMismatch":
      return t("ui.buildTab.flagAttunementMismatch", {
        stat: gameText(attunementData[flag.expected]?.name ?? flag.expected),
      })
    case "attunementUnderrolled":
      return t("ui.buildTab.flagAttunementUnderrolled", {
        stat: gameText(attunementData[flag.statKey]?.name ?? flag.statKey),
        current: formatNumber(flag.current),
        maximum: formatNumber(flag.maximum),
      })
  }
}

function flagIcon(flag: AffixFlag, item: boolean) {
  switch (flag.kind) {
    case "overCap":
      return <IconArrowDown size="1em" aria-hidden />
    case "lowValue":
      return <IconTrash size="1em" aria-hidden />
    case "graduationGap":
      return item && flag.direction === "tooFew" ? (
        <IconCirclePlus size="1em" aria-hidden />
      ) : (
        <IconAlertTriangle size="1em" aria-hidden />
      )
    case "attunementMismatch":
      return <IconArrowsExchange size="1em" aria-hidden />
    case "attunementUnderrolled":
      return <IconArrowUp size="1em" aria-hidden />
  }
}

function flagClass(flag: AffixFlag, item: boolean) {
  if (flag.kind === "graduationGap" && item && flag.direction === "tooFew") return "affix-flag--positive"
  return `affix-flag--${flag.kind}`
}

function AffixFlagIcon({ flag, item }: { flag: AffixFlag; item: boolean }) {
  const message = flagMessage(flag, item)
  const className = `affix-flag ${flagClass(flag, item)}`
  return (
    <Tooltip className="affix-flag-tooltip" content={message} aria-label={message}>
      <span className={className}>{flagIcon(flag, item)}</span>
    </Tooltip>
  )
}

/** Hoverable, accessible markers for everything that is wrong with one affix. */
export function AffixFlagIcons({ flags, item = false }: { flags?: readonly AffixFlag[]; item?: boolean }) {
  if (!flags || flags.length === 0) return null
  return (
    <span className="affix-flag-list">
      {flags.map(flag => (
        <AffixFlagIcon key={flag.kind} flag={flag} item={item} />
      ))}
    </span>
  )
}
