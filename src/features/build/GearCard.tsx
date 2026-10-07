import { IconAlertTriangle, IconArrowUp, IconEdit, IconTrash } from "@tabler/icons-react"
import { useEffect, type ReactNode } from "react"

import { attunementData, gearBaseStats, gearData, type GearItem, type GearSlot } from "@/gear"
import { gameText, t } from "@/i18n"
import { Button } from "@/ui/Button"

import { formatNumber, gearRarityLabel } from "./GearEditor"
import { useInViewport } from "./useInViewport"

function displayValue(value: number, definition?: { percentage?: boolean }) {
  return `${formatNumber(definition?.percentage ? value * 100 : value)}${definition?.percentage ? "%" : ""}`
}

function itemAttributes(item: GearItem) {
  const rows: Array<{ label: string; value: string; kind: string }> = []
  const baseDefinition = gearData.affixes[item.baseAffix.key]
  rows.push({
    label: gameText(baseDefinition?.name ?? item.baseAffix.key),
    value: displayValue(item.baseAffix.value, baseDefinition),
    kind: "Base affix",
  })
  for (const affix of item.additionalAffixes) {
    const definition = gearData.affixes[affix.key]
    rows.push({
      label: gameText(definition?.name ?? affix.key),
      value: displayValue(affix.value, definition),
      kind: "Affix",
    })
  }
  if (item.attunement) {
    const attunementDefinition = attunementData[item.attunement.key]
    rows.push({
      label: gameText(attunementDefinition?.name ?? item.attunement.key),
      value: displayValue(item.attunement.value, attunementDefinition),
      kind: "Attunement",
    })
  }
  return rows
}

function GearBaseStatSummary({ item }: { item: GearItem }) {
  const stats = gearBaseStats(item)
  if (typeof stats.minPhys === "number" && typeof stats.maxPhys === "number") {
    return (
      <span className="gear-base-stats">
        <span className="gear-base-stat">
          {t("ui.buildTab.physicalAttack")}{" "}
          <strong>
            {formatNumber(stats.minPhys)}~{formatNumber(stats.maxPhys)}
          </strong>
        </span>
      </span>
    )
  }
  if (typeof stats.minPhys === "number")
    return (
      <span className="gear-base-stats">
        <span className="gear-base-stat">
          {t("stat.minPhys")} <strong>{formatNumber(stats.minPhys)}</strong>
        </span>
      </span>
    )
  if (typeof stats.maxPhys === "number")
    return (
      <span className="gear-base-stats">
        <span className="gear-base-stat">
          {t("stat.maxPhys")} <strong>{formatNumber(stats.maxPhys)}</strong>
        </span>
      </span>
    )
  if (typeof stats.maxHp === "number" || typeof stats.physicalDefense === "number")
    return (
      <span className="gear-base-stats">
        {typeof stats.maxHp === "number" && (
          <span className="gear-base-stat">
            {t("stat.maxHp")} <strong>{formatNumber(stats.maxHp)}</strong>
          </span>
        )}
        {typeof stats.physicalDefense === "number" && (
          <span className="gear-base-stat">
            {t("stat.physicalDefense")} <strong>{formatNumber(stats.physicalDefense)}</strong>
          </span>
        )}
      </span>
    )
  return null
}

function GearAttributes({ item, compact = false }: { item: GearItem; compact?: boolean }) {
  return (
    <div className={`gear-attribute-list ${compact ? "compact" : ""}`}>
      {itemAttributes(item).map(row => (
        <div
          className={`gear-attribute ${row.kind === "Attunement" ? "gear-attunement-attribute" : ""}`}
          key={`${row.kind}-${row.label}-${row.value}`}
        >
          <span>
            {row.kind === "Attunement" && <small>{t("ui.buildTab.attunement")}</small>}
            {row.label}
          </span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  )
}

function RelayedIndicator({ item }: { item?: GearItem }) {
  return item?.relayed ? (
    <span
      className="gear-relayed-indicator"
      aria-label={t("ui.buildTab.relayedGear")}
      title={t("ui.buildTab.relayedGear")}
    >
      <IconArrowUp size="1em" aria-hidden />
    </span>
  ) : null
}

/**
 * What one gear card holds, whichever grid it is in: a relayed badge, an optional heading line
 * above the name, the name with its level and base stats, a status column opposite them, the
 * affixes behind a separator, and a footer.
 *
 * The two grids ask different questions of the same object, so they differ only in what they put
 * in these slots. The equipped grid names the slot in the heading and leaves the status and
 * footer empty; the inventory grid leaves the heading empty and fills the status and footer. A
 * value added to a slot therefore appears in both grids or neither, rather than in whichever one
 * happened to be written first.
 */
export type GearCardContent = {
  /** The item shown. A slot with nothing equipped passes nothing and gets the empty note. */
  item: GearItem | undefined
  /** The item's gear name, already resolved by the caller, which has the definition and locale. */
  name: string | undefined
  /** A line above the name. The equipped grid puts the slot here. */
  eyebrowLabel?: string
  /** The header's right-hand column, opposite the name. */
  status?: ReactNode
  /** Below the affix separator, pinned to the bottom of the card. */
  footer?: ReactNode
  /** The equipped grid runs its affixes closer to the separator, because it is the denser card. */
  compact?: boolean
}

export function GearCard({ item, name, eyebrowLabel, status, footer, compact = false }: GearCardContent) {
  return (
    <div className="gear-card-body">
      <RelayedIndicator item={item} />
      {eyebrowLabel && <span className="gear-slot-name">{eyebrowLabel}</span>}
      {item ? (
        <>
          <div className="gear-card-heading">
            <div className="gear-card-identity">
              <strong>{name}</strong>
              <small>
                {item.level} {gearRarityLabel(item.rarity)}
              </small>
            </div>
            {status && <div className="gear-card-status">{status}</div>}
          </div>
          <GearBaseStatSummary item={item} />
          <GearAttributes item={item} compact={compact} />
        </>
      ) : (
        <span className="gear-empty">{t("ui.buildTab.noGearEquipped")}</span>
      )}
      {footer && <div className="gear-card-actions">{footer}</div>}
    </div>
  )
}

/**
 * A slot in the equipped grid. The whole card is the control that opens that slot's inventory,
 * so it is a button and it carries no actions of its own.
 */
export function EquippedGearCard(props: {
  slot: GearSlot
  slotLabel: string
  item: GearItem | undefined
  name: string | undefined
  selected: boolean
  /** A preset build's gear is fixed, so its slots cannot be opened. */
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={`gear-card gear-card--select ${props.selected ? "gear-card--selected" : ""}`}
      type="button"
      data-testid={`equipped-${props.slot}`}
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      <GearCard item={props.item} name={props.name} eyebrowLabel={props.slotLabel} compact />
    </button>
  )
}

/**
 * An item in the selected slot's inventory. It is the reference item when it is the one equipped,
 * which is why the equipped state is stated in both the status and the action: the status says
 * what the item is, the action says there is nothing left to do to it.
 */
export function AvailableGearCard(props: {
  item: GearItem
  name: string
  /** Equipped in the slot being shopped, and so the baseline the other cards are read against. */
  equipped: boolean
  usageCount: number
  /** Read alongside the equipped state, where a comparison against the equipped item would go. */
  status?: ReactNode
  onEquip: () => void
  onEdit: () => void
  onDelete: () => void
  /** The first click of the two-step delete, which changes the action into a confirmation. */
  deleting: boolean
  /**
   * Reports whether this card is on screen, so a candidate is measured once it can be read rather
   * than when the slot opens. The equipped card is the reading the others are compared against
   * and so has nothing to ask for, and the card that is measuring nothing should not hold an
   * observer open.
   */
  onVisibilityChange?: (visible: boolean) => void
}) {
  const { ref, visible } = useInViewport<HTMLElement>(Boolean(props.onVisibilityChange) && !props.equipped)
  const { onVisibilityChange } = props
  useEffect(() => {
    onVisibilityChange?.(visible)
  }, [onVisibilityChange, visible])

  const status = (
    <>
      {props.equipped && <span>{t("ui.buildTab.equippedGearStatus")}</span>}
      <small>
        {t("ui.buildTab.usedIn")} {props.usageCount}{" "}
        {props.usageCount === 1 ? t("ui.buildTab.build") : t("ui.buildTab.buildCountNoun")}
      </small>
      {props.status}
    </>
  )
  const footer = (
    <>
      <Button
        className="gear-card-equip"
        variant="primary"
        size="small"
        type="button"
        disabled={props.equipped}
        onClick={props.onEquip}
      >
        {props.equipped ? t("ui.buildTab.equippedGearStatus") : t("ui.buildTab.equip")}
      </Button>
      <Button
        aria-label={t("ui.buildTab.edit")}
        title={t("ui.buildTab.edit")}
        variant="secondary"
        size="small"
        iconOnly
        type="button"
        onClick={props.onEdit}
      >
        <IconEdit size="1em" aria-hidden />
      </Button>
      {/* Armed, the action is a warning rather than a trash can: an icon-only confirmation has no
          label to change, so the glyph and the variant are what say so. */}
      <Button
        aria-label={props.deleting ? t("ui.buildTab.confirmDeleteGear") : t("ui.buildTab.deleteGear")}
        title={props.deleting ? t("ui.buildTab.confirmDeleteGear") : t("ui.buildTab.deleteGear")}
        variant={props.deleting ? "danger" : "secondary"}
        size="small"
        iconOnly
        type="button"
        onClick={props.onDelete}
      >
        {props.deleting ? <IconAlertTriangle size="1em" aria-hidden /> : <IconTrash size="1em" aria-hidden />}
      </Button>
    </>
  )
  return (
    <article ref={ref} className={`gear-card gear-card--item ${props.equipped ? "gear-card--equipped" : ""}`}>
      <GearCard item={props.item} name={props.name} status={status} footer={footer} />
    </article>
  )
}
