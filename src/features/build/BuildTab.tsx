import arsenalDefinitions from "@gamedata/arsenal.json"
import bowRingSetDefinitions from "@gamedata/bow-ring-set.json"
import { IconCopy, IconEdit, IconPlus, IconPointFilled, IconX } from "@tabler/icons-react"
import { nanoid } from "nanoid"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react"

import type { PathId } from "@/application/contracts"
import { formatThroughput, formatThroughputDelta, throughputDeltaClass } from "@/application/formatting"
import { breakthroughProfile } from "@/application/gameData/setup"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { innerWayEntriesForTag } from "@/data/innerWayDefinitions"
import {
  defaultBuildSetup,
  duplicateBuildState,
  armorSetDefinitions,
  attunementData,
  attunementsForGearDefinition,
  availableSetEntriesForTags,
  affixOptionsForGearDefinition,
  buildEntryAvailableForMartialArts,
  buildEntryMartialArts,
  exportBuildState,
  gearData,
  gearDefinitionForSlot,
  gearItemSupportsSlot,
  gearSlots,
  isGearItemCompatible,
  mergeImportedBuildState,
  normalizeBuildSetup,
  resolveBuildInventory,
  resolveBuildSetup,
  selectSetTier,
  summarizeGearAffixes,
  weaponSetDefinitions,
  type BuildSetup,
  type GearAffixSummary,
  type BuildEntry,
  type GearInventory,
  type GearItem,
  type GearLevel,
  type GearSlot,
} from "@/gear"
import { dataText, gameText, t } from "@/i18n"
import { publishNotice, dismissNotice } from "@/notices"
import { createOfficialGearBookmarklet } from "@/officialGearBookmarklet"
import { useGearStore } from "@/stores/gearStore"
import type { WeaponId } from "@/types"
import { Button } from "@/ui/Button"
import { ButtonGroup, ButtonGroupOption } from "@/ui/ButtonGroup"
import { Dialog } from "@/ui/Dialog"
import { Panel, PanelHeading } from "@/ui/Panel"
import { Tooltip } from "@/ui/Tooltip"

import { AvailableGearCard, EquippedGearCard } from "./GearCard"
import { GearDelta } from "./GearDelta"
import {
  GearEditor,
  capAndFilterGearDraft,
  createGearId,
  itemToDraft,
  newDraft,
  normalizeDraftValue,
  type GearDraft,
} from "./GearEditor"
import { useBuildThroughputs } from "./useBuildThroughputs"
import { useGearComparison } from "./useGearComparison"

function gearSlotLabel(slot: GearSlot) {
  return dataText(`system.gearSlot.${slot}`, gearData.slots[slot])
}

function buildEntryDisplayName(entry: Pick<BuildEntry, "name" | "isDefault">) {
  return (entry.isDefault ? gameText(entry.name) : entry.name) || "Unnamed Build"
}

function createBuildId() {
  return `build-${nanoid()}`
}

type BuildTabProps = {
  pathId: PathId
  /** The builds this path may see, already filtered by the store's rule. */
  builds: BuildEntry[]
  /** The gear this path may see, which is what the editor and the gear panel both resolve. */
  visibleItems: GearItem[]
  weapons: [WeaponId, WeaponId]
  martialArtTags: string[]
  pathTag?: string
  graduatedBuildIds: string[]
  onActiveBuildChange: (id: string) => void
  onSelectBuildWeapons: (weapons: [WeaponId, WeaponId]) => boolean
  /** The sheet and environment a build is measured against, and the rotation it runs. */
  measurement: MeasurementContext
  activeRotation?: RotationRecord
  activeRotationName?: string
}

type BuildManagementProps = {
  weapons: [WeaponId, WeaponId]
  martialArtTags: string[]
  pathTag?: string
  inventory: GearInventory
  setup: BuildSetup
  usageCounts: ReadonlyMap<string, number>
  locked: boolean
  onInventoryChange: Dispatch<SetStateAction<GearInventory>>
  onSetupChange: (setup: BuildSetup) => void
  /** The build on screen, which a candidate item is measured against the equipped item of. */
  build: BuildEntry | undefined
  /** The sheet and environment the candidates are measured in, and the rotation they run. */
  measurement: MeasurementContext
  activeRotation?: RotationRecord
}

const stackedBuildLayoutQuery = "(max-width: 80em)"

function subscribeToStackedBuildLayout(callback: () => void) {
  const query = window.matchMedia(stackedBuildLayoutQuery)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function stackedBuildLayoutSnapshot() {
  return window.matchMedia(stackedBuildLayoutQuery).matches
}

function ResponsiveBuildOverview({ children }: { children: [ReactElement, ReactElement] }) {
  const setupFirst = useSyncExternalStore(subscribeToStackedBuildLayout, stackedBuildLayoutSnapshot, () => false)
  const [setup, gear] = children
  return <div className="build-overview-grid">{setupFirst ? [setup, gear] : [gear, setup]}</div>
}

const noGearOptions: string[] = []

/** The shared empty set, so clearing visibility is a state change rather than a new identity. */
const emptySet: ReadonlySet<string> = new Set()

const attunementOptionCache = new Map<string, string[]>()
function cachedAttunementOptions(
  definitionId: string,
  pathTag: string | undefined,
  martialArtTags: string[],
): string[] {
  const cacheKey = `${definitionId}|${pathTag ?? ""}|${martialArtTags.join(",")}`
  const cached = attunementOptionCache.get(cacheKey)
  if (cached) return cached
  const definition = gearData.gear[definitionId]
  const options = (definition ? attunementsForGearDefinition(definition) : noGearOptions).filter(key => {
    const tags = attunementData[key]?.tags ?? []
    if (tags.includes("Weapon")) return true
    return (!pathTag || tags.includes(pathTag)) && martialArtTags.some(tag => tags.includes(tag))
  })
  attunementOptionCache.set(cacheKey, options)
  return options
}

export default function BuildTab({
  pathId,
  builds,
  visibleItems,
  weapons,
  martialArtTags,
  pathTag,
  graduatedBuildIds,
  onActiveBuildChange,
  onSelectBuildWeapons,
  measurement,
  activeRotation,
  activeRotationName,
}: BuildTabProps) {
  // The build list and the shared gear inventory are one stored record, held by `gearStore`
  // rather than handed in: this component is where they are created, renamed, duplicated,
  // deleted and equipped, so it is also where they are stored.
  const gearTier = breakthroughProfile(measurement.environment.settings).gearTier
  const buildState = useGearStore(state => state.buildState)
  const updateBuildState = useGearStore(state => state.updateBuildState)
  const [editingBuildId, setEditingBuildId] = useState(buildState.activeBuildId)
  const [editingName, setEditingName] = useState(false)
  const [officialImportText, setOfficialImportText] = useState("")
  const officialImportDialogRef = useRef<HTMLDialogElement>(null)
  const officialBookmarkletRef = useRef<HTMLAnchorElement>(null)
  const buildNameInputRef = useRef<HTMLInputElement>(null)
  const buildImportInputRef = useRef<HTMLInputElement>(null)
  const officialGearBookmarklet = createOfficialGearBookmarklet({
    noGearData: t("ui.buildTab.bookmarkletNoGearData"),
    copyPrompt: t("ui.buildTab.bookmarkletCopyPrompt"),
    copySuccess: t("ui.buildTab.bookmarkletCopySuccess"),
    notLoggedIn: t("ui.buildTab.bookmarkletNotLoggedIn"),
    unreadableData: t("ui.buildTab.bookmarkletUnreadableData"),
    dashboardUnreachable: t("ui.buildTab.bookmarkletDashboardUnreachable"),
  })
  useEffect(() => {
    if (editingName) buildNameInputRef.current?.focus()
  }, [editingName])
  useEffect(() => {
    // React sanitizes javascript: href props; this trusted, generated bookmarklet must be assigned to the DOM.
    officialBookmarkletRef.current?.setAttribute("href", officialGearBookmarklet)
  }, [officialGearBookmarklet])
  // `builds` is already the list this path may see, filtered by the store's rule. Only the
  // order is decided here, because a shipped preset belongs at the end of the list rather than
  // wherever the records happen to be stored.
  const listedEntries = useMemo(
    () => [...builds].sort((left, right) => Number(left.isDefault === true) - Number(right.isDefault === true)),
    [builds],
  )
  const editingEntry = listedEntries.find(entry => entry.id === editingBuildId) ?? listedEntries[0]
  const activeEntry = listedEntries.find(entry => entry.id === buildState.activeBuildId)
  if (editingEntry && editingEntry.id !== editingBuildId) setEditingBuildId(editingEntry.id)
  function addBuild() {
    const id = createBuildId()
    updateBuildState(pathId, current => ({
      ...current,
      entries: [
        ...current.entries,
        {
          id,
          name: t("ui.buildTab.newBuild"),
          martialArts: [...weapons],
          equipped: {},
          setup: normalizeBuildSetup(defaultBuildSetup),
        },
      ],
    }))
    setEditingBuildId(id)
    setEditingName(true)
  }
  // The build on screen, and the active one it is weighed against. When they are the same build
  // both targets measure the same bundle, so the store answers the second from the first.
  // Measured before the empty-build return below, because a hook cannot sit behind one.
  const buildTargets = useMemo(
    () => [
      { key: "viewed", build: editingEntry },
      { key: "active", build: activeEntry },
    ],
    [editingEntry, activeEntry],
  )
  const throughputs = useBuildThroughputs({
    targets: buildTargets,
    gearItems: buildState.gearItems,
    context: measurement,
    rotation: activeRotation,
  })
  const editedThroughput = throughputs.viewed
  const activeThroughput = throughputs.active

  if (!editingEntry)
    return (
      <Panel className="build-manager-panel">
        <div className="build-manager-layout">
          <aside className="build-list">
            <div className="build-list-heading">
              <span>{t("ui.buildTab.builds")}</span>
              <Button variant="secondary" size="small" type="button" onClick={addBuild}>
                {t("ui.buildTab.newBuild")}
              </Button>
            </div>
            <p className="array-editor-empty">{t("ui.buildTab.noBuildsMatchTheSelectedMartialArts")}</p>
          </aside>
        </div>
      </Panel>
    )
  const isActiveBuild = editingEntry.id === buildState.activeBuildId
  const comparison =
    !isActiveBuild && editedThroughput && activeThroughput
      ? { delta: editedThroughput.dps - activeThroughput.dps, reading: editedThroughput }
      : undefined
  const inventory = resolveBuildInventory(editingEntry, visibleItems, weapons, gearTier)
  const setup = resolveBuildSetup(editingEntry)
  const usageCounts = new Map<string, number>()
  for (const entry of listedEntries) {
    if (entry.isDefault) continue
    for (const itemId of new Set(Object.values(entry.equipped ?? {}))) {
      if (itemId) usageCounts.set(itemId, (usageCounts.get(itemId) ?? 0) + 1)
    }
  }

  function updateInventory(update: SetStateAction<GearInventory>) {
    if (editingEntry.isDefault) return
    updateBuildState(pathId, current => {
      const currentEntry = current.entries.find(entry => entry.id === editingEntry.id)
      if (!currentEntry || currentEntry.isDefault) return current
      const currentInventory = { items: current.gearItems, equipped: currentEntry.equipped ?? {} }
      const nextInventory = typeof update === "function" ? update(currentInventory) : update
      const availableItems = new Map(nextInventory.items.map(item => [item.id, item]))
      return {
        ...current,
        gearItems: nextInventory.items,
        entries: current.entries.map(entry => {
          if (entry.isDefault) return entry
          const candidateEquipped = entry.id === editingEntry.id ? nextInventory.equipped : (entry.equipped ?? {})
          const equipped = Object.fromEntries(
            gearSlots.flatMap(slot => {
              const itemId = candidateEquipped[slot]
              const item = itemId ? availableItems.get(itemId) : undefined
              return item && gearItemSupportsSlot(item, slot) ? [[slot, itemId]] : []
            }),
          ) as Partial<Record<GearSlot, string>>
          return { ...entry, equipped }
        }),
      }
    })
  }

  function renameBuild(name: string) {
    updateBuildState(pathId, current => ({
      ...current,
      entries: current.entries.map(entry =>
        entry.id === editingEntry.id && !entry.isDefault ? { ...entry, name } : entry,
      ),
    }))
  }

  function activateBuild() {
    onActiveBuildChange(editingEntry.id)
  }

  function duplicateBuild() {
    const id = createBuildId()
    const name = t("ui.buildTab.copyOfNamedBuild", { name: buildEntryDisplayName(editingEntry) })
    updateBuildState(pathId, current => duplicateBuildState(current, editingEntry.id, { id, name }, gearTier))
    setEditingBuildId(id)
    setEditingName(false)
  }

  function updateSetup(nextSetup: BuildSetup) {
    if (editingEntry.isDefault) return
    updateBuildState(pathId, current => ({
      ...current,
      entries: current.entries.map(entry =>
        entry.id === editingEntry.id ? { ...entry, setup: normalizeBuildSetup(nextSetup) } : entry,
      ),
    }))
  }

  function removeBuild(id: string) {
    const entry = buildState.entries.find(candidate => candidate.id === id)
    if (
      !entry ||
      entry.isDefault ||
      !window.confirm(t("ui.buildTab.deleteNamedBuildConfirmation", { name: buildEntryDisplayName(entry) }))
    )
      return
    const remaining = listedEntries.filter(candidate => candidate.id !== id)
    const fallback = remaining.find(candidate => candidate.isDefault) ?? remaining[0]
    updateBuildState(pathId, current => ({
      ...current,
      entries: current.entries.filter(candidate => candidate.id !== id),
    }))
    if (buildState.activeBuildId === id && fallback) onActiveBuildChange(fallback.id)
    if (editingBuildId === id) setEditingBuildId(fallback?.id ?? "")
  }

  function exportBuilds() {
    const blob = new Blob([exportBuildState(buildState)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `where-builds-meet-builds-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function importBuilds(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    dismissNotice("build-import")
    try {
      const result = mergeImportedBuildState(buildState, JSON.parse(await file.text()) as unknown)
      updateBuildState(pathId, () => result.state)
      if (result.importedBuildIds[0]) {
        setEditingBuildId(result.importedBuildIds[0])
        setEditingName(false)
      }
    } catch (error) {
      publishNotice({
        id: "build-import",
        error: true,
        message: error instanceof Error ? error.message : t("ui.notices.buildImportError"),
      })
    }
  }

  function openOfficialImport() {
    setOfficialImportText("")
    dismissNotice("official-import")
    officialImportDialogRef.current?.showModal()
  }

  async function importFromOfficial() {
    dismissNotice("official-import")
    try {
      const { parseOfficialGearExport } = await import("@/officialGearImport")
      const official = parseOfficialGearExport(JSON.parse(officialImportText), weapons)
      const result = mergeImportedBuildState(buildState, official.exportValue, { reuseIdenticalGear: true })
      if (result.importedGearCount + result.reusedGearCount !== official.gearCount || result.importedBuildCount !== 1)
        throw new Error(t("ui.buildTab.dashboardValidationError"))
      if (official.warnings.length) publishNotice({ id: "official-import", message: official.warnings.join("\n") })
      updateBuildState(pathId, () => result.state)
      setEditingBuildId(result.importedBuildIds[0])
      setEditingName(false)
      officialImportDialogRef.current?.close()
    } catch (error) {
      publishNotice({
        id: "official-import",
        error: true,
        message: error instanceof Error ? error.message : t("ui.buildTab.dashboardImportError"),
      })
    }
  }

  function selectBuild(entry: typeof editingEntry) {
    if (!buildEntryAvailableForMartialArts(entry, weapons)) {
      const entryMartialArts = buildEntryMartialArts(entry)
      if (entryMartialArts.length !== 2 || !onSelectBuildWeapons([entryMartialArts[0], entryMartialArts[1]])) return
    }
    setEditingBuildId(entry.id)
    setEditingName(false)
  }

  return (
    <Panel className="build-manager-panel">
      <div className="build-manager-layout">
        <aside className="build-list">
          <div className="build-list-heading">
            <span>{t("ui.buildTab.builds")}</span>
          </div>
          <div className="build-list-entries">
            <Button className="build-list-create" variant="secondary" size="small" type="button" onClick={addBuild}>
              <IconPlus size="1em" aria-hidden />
              <span>{t("ui.buildTab.newBuild")}</span>
            </Button>
            {listedEntries.map(entry => {
              const incompatible = !buildEntryAvailableForMartialArts(entry, weapons)
              return (
                <div
                  className={`build-list-item ${entry.id === buildState.activeBuildId ? "active" : ""} ${entry.id === editingBuildId ? "editing" : ""} ${incompatible ? "incompatible" : ""}`}
                  key={entry.id}
                >
                  <button
                    className="build-select-button"
                    type="button"
                    title={incompatible ? t("ui.buildTab.selectThisBuildAndSwitchToItsMartial") : undefined}
                    onClick={() => selectBuild(entry)}
                  >
                    <span>
                      <strong>
                        {entry.id === buildState.activeBuildId && (
                          <i className="active-build-icon" title={t("ui.buildTab.activeBuild")}>
                            <IconPointFilled size="1em" aria-hidden />
                          </i>
                        )}
                        {buildEntryDisplayName(entry)}
                      </strong>
                      {entry.isDefault && (
                        <small>
                          {graduatedBuildIds.includes(entry.presetId ?? "")
                            ? t("ui.buildTab.graduatePreset")
                            : t("ui.buildTab.defaultPreset")}
                        </small>
                      )}
                    </span>
                  </button>
                  {!entry.isDefault && (
                    <button
                      className="build-remove-button"
                      type="button"
                      aria-label={t("ui.buildTab.removeNamedBuild", { name: entry.name || t("ui.buildTab.build") })}
                      onClick={event => {
                        event.stopPropagation()
                        removeBuild(entry.id)
                      }}
                    >
                      <IconX size="1em" aria-hidden />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="build-transfer-actions">
            <div>
              <Button variant="secondary" size="small" type="button" onClick={exportBuilds}>
                {t("ui.buildTab.export")}
              </Button>
              <Button
                variant="secondary"
                size="small"
                type="button"
                onClick={() => buildImportInputRef.current?.click()}
              >
                {t("ui.buildTab.import")}
              </Button>
              <input
                ref={buildImportInputRef}
                type="file"
                accept="application/json,.json"
                aria-label={t("ui.buildTab.importBuildsAndGear")}
                onChange={importBuilds}
                hidden
              />
            </div>
            <Button
              className="build-official-import-button"
              variant="secondary"
              size="small"
              type="button"
              onClick={openOfficialImport}
            >
              {t("ui.buildTab.importFromOfficial")}
            </Button>
          </div>
        </aside>
        <div className="build-editor-content">
          <div className="build-detail-heading">
            <div className="build-detail-title">
              {editingName && !editingEntry.isDefault ? (
                <input
                  ref={buildNameInputRef}
                  className="build-name-input"
                  value={editingEntry.name}
                  onChange={event => renameBuild(event.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={event => {
                    if (event.key === "Enter") setEditingName(false)
                  }}
                />
              ) : (
                <h3>
                  {buildEntryDisplayName(editingEntry)}
                  {!editingEntry.isDefault ? (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={t("ui.buildTab.editBuildName")}
                      onClick={() => setEditingName(true)}
                    >
                      <IconEdit size="1em" aria-hidden />
                    </button>
                  ) : null}
                </h3>
              )}
              {isActiveBuild ? (
                activeThroughput ? (
                  <small className="build-detail-dps build-detail-dps-active">
                    ({formatThroughput(activeThroughput.dps, 0)} {t("system.dps")}
                    {activeThroughput.hps > 0
                      ? ` / ${formatThroughput(activeThroughput.hps, 0)} ${t("system.hps")}`
                      : ""}
                    )
                  </small>
                ) : null
              ) : !comparison ? null : (
                <Tooltip
                  className="build-detail-dps-tooltip"
                  content={
                    <>
                      <span className="build-detail-dps-row">
                        <span>{t("ui.buildTab.notActiveDps")}</span>
                        <strong>{formatThroughput(comparison.reading.dps, 0)}</strong>
                      </span>
                      <span className="build-detail-dps-row">
                        <span>{t("ui.buildTab.rotationUsed")}</span>
                        <strong>{activeRotationName ?? ""}</strong>
                      </span>
                      <span className="build-detail-dps-row">
                        <span>{t("system.totalDamage")}</span>
                        <strong>{formatThroughput(comparison.reading.totalDamage)}</strong>
                      </span>
                    </>
                  }
                >
                  <small className={`build-detail-dps ${throughputDeltaClass(comparison.delta, "damage")}`}>
                    ({formatThroughput(comparison.reading.dps, 0)}, {formatThroughputDelta(comparison.delta, 0)}{" "}
                    {t("system.dps")})
                  </small>
                </Tooltip>
              )}
            </div>
            <div className="detail-active-actions">
              <Button
                aria-label={t("ui.app.duplicate")}
                title={t("ui.app.duplicate")}
                variant="secondary"
                size="small"
                iconOnly
                type="button"
                onClick={duplicateBuild}
              >
                <IconCopy size="1em" aria-hidden />
              </Button>
              <Button
                className="detail-active-button"
                size="small"
                type="button"
                disabled={editingEntry.id === buildState.activeBuildId}
                onClick={activateBuild}
              >
                {editingEntry.id === buildState.activeBuildId
                  ? t("ui.buildTab.activeBuildAction")
                  : t("ui.buildTab.makeActive")}
              </Button>
            </div>
          </div>
          <BuildManagement
            key={editingEntry.id}
            weapons={weapons}
            martialArtTags={martialArtTags}
            pathTag={pathTag}
            inventory={inventory}
            setup={setup}
            usageCounts={usageCounts}
            locked={editingEntry.isDefault === true}
            onInventoryChange={updateInventory}
            onSetupChange={updateSetup}
            build={editingEntry}
            measurement={measurement}
            activeRotation={activeRotation}
          />
        </div>
      </div>
      <dialog className="official-import-dialog" ref={officialImportDialogRef}>
        <div className="official-import-heading">
          <div>
            <span className="detail-kicker">{t("ui.buildTab.officialDashboard")}</span>
            <h2>{t("ui.buildTab.importEquippedGear")}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t("ui.buildTab.closeOfficialImport")}
            onClick={() => officialImportDialogRef.current?.close()}
          >
            <IconX size="1em" aria-hidden />
          </button>
        </div>
        <ol className="official-import-steps">
          <li>
            {t("ui.buildTab.drag")}{" "}
            {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- The effect assigns the trusted bookmarklet href. */}
            <a className="official-bookmarklet" ref={officialBookmarkletRef}>
              {t("ui.buildTab.exportWwmGear")}
            </a>{" "}
            {t("ui.buildTab.toYourBrowserBookmarksBar")}
          </li>
          <li>
            {t("ui.buildTab.openThe")}{" "}
            <a href="https://www.wherewindsmeetgame.com/m/2025h5sjgj/en/" target="_blank" rel="noreferrer">
              {t("ui.buildTab.officialWhereWindsMeetDashboard")}
            </a>{" "}
            {t("ui.buildTab.andLogIn")}
          </li>
          <li>{t("ui.buildTab.clickTheSavedBookmarkItCopiesYourEquipped")}</li>
          <li>{t("ui.buildTab.returnHereAndPasteTheCopiedJsonBelow")}</li>
        </ol>
        <textarea
          aria-label={t("ui.buildTab.officialDashboardGearJson")}
          placeholder={t("ui.buildTab.pasteTheCopiedDashboardJsonHere")}
          value={officialImportText}
          onChange={event => {
            setOfficialImportText(event.target.value)
            dismissNotice("official-import")
          }}
        />
        <div className="official-import-actions">
          <Button variant="secondary" type="button" onClick={() => officialImportDialogRef.current?.close()}>
            {t("ui.buildTab.cancel")}
          </Button>
          <Button variant="primary" type="button" disabled={!officialImportText.trim()} onClick={importFromOfficial}>
            {t("ui.buildTab.importGear")}
          </Button>
        </div>
        <p className="official-import-privacy">{t("ui.buildTab.theBookmarkRunsOnlyOnTheOfficialDashboard")}</p>
      </dialog>
    </Panel>
  )
}

function BuildSetupPanel({
  setup,
  affixSummary,
  martialArtTags,
  pathTag,
  locked,
  onChange,
}: {
  setup: BuildSetup
  affixSummary: GearAffixSummary
  martialArtTags: string[]
  pathTag?: string
  locked: boolean
  onChange: (setup: BuildSetup) => void
}) {
  const lockedTitle = locked ? "Fixed by this default preset" : undefined
  const innerWayOptions = innerWayEntriesForTag(pathTag)
  const availableWeaponSets = availableSetEntriesForTags(weaponSetDefinitions, martialArtTags, pathTag)
  const availableArmorSets = availableSetEntriesForTags(armorSetDefinitions, martialArtTags, pathTag)
  const setPanel = (
    title: string,
    key: "weaponSets" | "armorSets",
    definitions: typeof weaponSetDefinitions,
    entries: typeof availableWeaponSets,
  ) => (
    <Panel className="setup-placeholder-panel build-setup-panel">
      <PanelHeading>
        <div>
          <h2>{title}</h2>
        </div>
      </PanelHeading>
      <div className="gear-set-list">
        {entries.map(([setName, definition]) => {
          const selectedTier = setup[key][setName] ?? 0
          return (
            <div className="setup-field" key={setName}>
              <span>{gameText(definition.name)}</span>
              <div className="setup-option-control">
                <ButtonGroup cellWidth="5rem">
                  {[0, 2, 4].map(tier => (
                    <ButtonGroupOption
                      key={tier}
                      label={t(`system.setPieces.${tier}`)}
                      selected={selectedTier === tier}
                      disabled={locked}
                      title={lockedTitle}
                      onClick={() =>
                        onChange({
                          ...setup,
                          [key]: selectSetTier(setup[key], setName, tier as 0 | 2 | 4, definitions),
                        })
                      }
                    />
                  ))}
                </ButtonGroup>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
  return (
    <div className="build-setup-column" aria-label={t("ui.buildTab.buildSetup")}>
      <Panel className="setup-placeholder-panel build-setup-panel">
        <PanelHeading>
          <div>
            <h2>{t("ui.buildTab.innerWays")}</h2>
          </div>
        </PanelHeading>
        <div className="inner-way-list">
          {setup.innerWays.map((row, index) => (
            <div className="inner-way-row" key={index}>
              <select
                aria-label={t("ui.buildTab.buildInnerWay", { number: index + 1 })}
                value={innerWayOptions.some(([value]) => value === row.innerWay) ? row.innerWay : ""}
                disabled={locked}
                title={lockedTitle}
                onChange={event =>
                  onChange({
                    ...setup,
                    innerWays: setup.innerWays.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, innerWay: event.target.value } : item,
                    ),
                  })
                }
              >
                <option value="">{t("ui.buildTab.none")}</option>
                {innerWayOptions.map(([value, definition]) => (
                  <option
                    key={value}
                    value={value}
                    disabled={setup.innerWays.some((item, itemIndex) => itemIndex !== index && item.innerWay === value)}
                  >
                    {gameText(definition.name)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("ui.buildTab.buildInnerWayTier", { number: index + 1 })}
                value={row.tier}
                disabled={locked}
                title={lockedTitle}
                onChange={event =>
                  onChange({
                    ...setup,
                    innerWays: setup.innerWays.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, tier: event.target.value } : item,
                    ),
                  })
                }
              >
                {Array.from({ length: 7 }, (_, tier) => (
                  <option value={`T${tier}`} key={tier}>{`T${tier}`}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Panel>
      {setPanel(t("ui.buildTab.weaponSet"), "weaponSets", weaponSetDefinitions, availableWeaponSets)}
      {availableArmorSets.length > 0 &&
        setPanel(t("ui.buildTab.armorSet"), "armorSets", armorSetDefinitions, availableArmorSets)}
      <Panel className="setup-placeholder-panel build-setup-panel">
        <PanelHeading>
          <div>
            <h2>{t("ui.buildTab.bowRingSet")}</h2>
          </div>
        </PanelHeading>
        <ButtonGroup columns={4}>
          {Object.entries(bowRingSetDefinitions).map(([value, definition]) => (
            <ButtonGroupOption
              key={value}
              label={gameText(definition.name)}
              selected={setup.bowRingSet === value}
              disabled={locked}
              title={lockedTitle}
              onClick={() => onChange({ ...setup, bowRingSet: value })}
            />
          ))}
        </ButtonGroup>
      </Panel>
      <Panel className="setup-placeholder-panel build-setup-panel">
        <PanelHeading>
          <div>
            <h2>{t("ui.buildTab.arsenal")}</h2>
          </div>
        </PanelHeading>
        <ButtonGroup>
          {Object.entries(arsenalDefinitions).map(([value, definition]) => (
            <ButtonGroupOption
              key={value}
              label={gameText(definition.name)}
              selected={setup.arsenal === value}
              disabled={locked}
              title={lockedTitle}
              onClick={() => onChange({ ...setup, arsenal: value })}
            />
          ))}
        </ButtonGroup>
      </Panel>
      <Panel className="setup-placeholder-panel build-setup-panel build-affix-summary-panel">
        <PanelHeading>
          <div className="build-affix-summary-heading">
            <h2>{t("ui.buildTab.affixes")}</h2>
            <span>{t("ui.buildTab.affixTotal", { number: affixSummary.total })}</span>
          </div>
        </PanelHeading>
        {affixSummary.affixes.length > 0 ? (
          <ol className="build-affix-summary-list">
            {affixSummary.affixes.map(({ key, count }) => (
              <li key={key}>
                <span>{gameText(gearData.affixes[key]?.name ?? key)}</span>
                <strong>×{count}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="build-affix-summary-empty">{t("ui.buildTab.noAffixes")}</p>
        )}
      </Panel>
    </div>
  )
}

function BuildManagement({
  weapons,
  martialArtTags,
  pathTag,
  inventory,
  setup,
  usageCounts,
  locked,
  onInventoryChange,
  onSetupChange,
  build,
  measurement,
  activeRotation,
}: BuildManagementProps) {
  const gearTier = breakthroughProfile(measurement.environment.settings).gearTier
  const [selectedSlot, setSelectedSlot] = useState<GearSlot>("leftWeapon")
  const [editing, setEditing] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [draft, setDraft] = useState<GearDraft>(() => newDraft(gearTier))
  const [error, setError] = useState("")
  // The candidates currently on screen. Each card reports its own, so the set is what bounds how
  // much measuring a slot asks for, and an empty set means a slot costs nothing to look at.
  const [visibleItemIds, setVisibleItemIds] = useState<ReadonlySet<string>>(() => new Set())
  const selected = gearDefinitionForSlot(selectedSlot, weapons)
  const availableItems = useMemo(
    () =>
      inventory.items.filter(
        item => item.definitionId === selected.definitionId && gearItemSupportsSlot(item, selectedSlot),
      ),
    [inventory.items, selected.definitionId, selectedSlot],
  )
  const reportVisibility = useCallback((itemId: string, visible: boolean) => {
    setVisibleItemIds(previous => {
      if (previous.has(itemId) === visible) return previous
      const next = new Set(previous)
      if (visible) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }, [])
  const equippedItems = useMemo(
    () =>
      Object.fromEntries(
        gearSlots.map(slot => {
          const equippedId = inventory.equipped[slot]
          const item = inventory.items.find(
            candidate => candidate.id === equippedId && gearItemSupportsSlot(candidate, slot),
          )
          return [slot, item && (locked || isGearItemCompatible(item, slot, weapons)) ? item : undefined]
        }),
      ) as Partial<Record<GearSlot, GearItem>>,
    [inventory, weapons, locked],
  )
  const affixSummary = useMemo(() => summarizeGearAffixes(gearSlots.map(slot => equippedItems[slot])), [equippedItems])

  const equippedItemId = inventory.equipped[selectedSlot]
  const { reference, readingFor } = useGearComparison({
    build,
    slot: selectedSlot,
    candidates: availableItems,
    equippedId: equippedItemId,
    visibleItemIds,
    gearItems: inventory.items,
    context: measurement,
    rotation: activeRotation,
  })

  function selectSlot(slot: GearSlot) {
    setSelectedSlot(slot)
    setEditing(false)
    setEditingItemId(null)
    setPendingDeleteId(null)
    setDraft(newDraft(gearTier))
    setError("")
    // Another slot's cards report their own visibility, so what this one measured is dropped with it.
    setVisibleItemIds(emptySet)
  }

  function beginAdd() {
    if (editing && editingItemId === null) return
    setDraft(newDraft(gearTier))
    setError("")
    setEditingItemId(null)
    setPendingDeleteId(null)
    setEditing(true)
  }

  function beginEdit(item: GearItem) {
    setDraft(itemToDraft(item))
    setError("")
    setEditingItemId(item.id)
    setPendingDeleteId(null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditingItemId(null)
    setError("")
  }

  function updateLevel(level: GearLevel) {
    setDraft(current => capAndFilterGearDraft({ ...current, level }, selected.definition))
  }

  function updateRelayed(relayed: boolean) {
    setDraft(current => capAndFilterGearDraft(current, selected.definition, relayed))
  }

  function save() {
    const definition = selected.definition
    if (!definition) return
    const baseAffix = normalizeDraftValue(draft.baseAffix, gearData.affixes, "affix", draft.relayed, draft.level)
    const additionalAffixDrafts = draft.additionalAffixes.filter(affix => affix.key || affix.value.trim())
    const additionalAffixes = additionalAffixDrafts.map(affix =>
      normalizeDraftValue(affix, gearData.affixes, "affix", draft.relayed, draft.level),
    )
    const hasAttunementDraft = Boolean(draft.attunement.key || draft.attunement.value.trim())
    const attunement = hasAttunementDraft
      ? normalizeDraftValue(draft.attunement, attunementData, "attunement", draft.relayed, draft.level)
      : undefined
    if (!baseAffix) {
      setError(t("ui.buildTab.baseAffixValueError"))
      return
    }
    if (!baseAffixOptions.includes(baseAffix.key)) {
      setError(t("ui.buildTab.baseAffixAvailabilityError"))
      return
    }
    if (additionalAffixes.some(affix => !affix) || (hasAttunementDraft && !attunement)) {
      setError(t("ui.buildTab.optionalAttributeError"))
      return
    }
    if (attunement && !attunementOptions.includes(attunement.key)) {
      setError(t("ui.buildTab.attunementAvailabilityError"))
      return
    }
    const normalizedAdditional = additionalAffixes.filter((affix): affix is { key: string; value: number } =>
      Boolean(affix),
    )
    if (normalizedAdditional.some(affix => !additionalAffixOptions.includes(affix.key))) {
      setError(t("ui.buildTab.additionalAffixAvailabilityError"))
      return
    }
    if (new Set(normalizedAdditional.map(affix => affix.key)).size !== normalizedAdditional.length) {
      setError(t("ui.buildTab.duplicateAffixError"))
      return
    }
    const item: GearItem = {
      id: editingItemId ?? createGearId(),
      ...(definition.weapon ? {} : { slot: selectedSlot }),
      definitionId: selected.definitionId,
      level: draft.level,
      rarity: draft.rarity,
      ...(draft.relayed ? { relayed: true } : {}),
      baseAffix,
      additionalAffixes: normalizedAdditional,
      ...(attunement ? { attunement } : {}),
    }
    onInventoryChange(current => ({
      ...current,
      items: editingItemId
        ? current.items.map(candidate => (candidate.id === editingItemId ? item : candidate))
        : [...current.items, item],
    }))
    setEditing(false)
    setEditingItemId(null)
    setDraft(newDraft(gearTier))
    setError("")
  }

  function equip(item: GearItem) {
    setPendingDeleteId(null)
    onInventoryChange(current => ({
      ...current,
      equipped: {
        ...Object.fromEntries(Object.entries(current.equipped).filter(([, itemId]) => itemId !== item.id)),
        [selectedSlot]: item.id,
      },
    }))
  }

  function remove(item: GearItem) {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id)
      return
    }
    onInventoryChange(current => ({
      items: current.items.filter(candidate => candidate.id !== item.id),
      equipped: Object.fromEntries(Object.entries(current.equipped).filter(([, itemId]) => itemId !== item.id)),
    }))
    setPendingDeleteId(null)
    if (editingItemId === item.id) {
      setEditing(false)
      setEditingItemId(null)
      setDraft(newDraft(gearTier))
      setError("")
    }
  }

  const baseAffixOptions = selected.definition
    ? affixOptionsForGearDefinition(selected.definition, "baseAffixes", draft.level, draft.relayed)
    : noGearOptions
  const additionalAffixOptions = selected.definition
    ? affixOptionsForGearDefinition(selected.definition, "additionalAffixes", draft.level, draft.relayed)
    : noGearOptions
  const attunementOptions = cachedAttunementOptions(selected.definitionId, pathTag, martialArtTags)
  const selectedAdditionalKeys = useMemo(
    () => new Set(draft.additionalAffixes.map(affix => affix.key).filter(Boolean)),
    [draft.additionalAffixes],
  )

  return (
    <div className="build-page">
      <ResponsiveBuildOverview>
        <BuildSetupPanel
          key="setup"
          setup={setup}
          affixSummary={affixSummary}
          martialArtTags={martialArtTags}
          pathTag={pathTag}
          locked={locked}
          onChange={onSetupChange}
        />
        <div key="gear" className="build-management-grid">
          <Panel className="build-equipped-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.buildTab.equippedGear")}</h2>
                <p>
                  {locked
                    ? t("ui.buildTab.thisDefaultBuildUsesFixedPresetGearUse")
                    : t("ui.buildTab.selectASlotToEquipGearFromThe")}
                </p>
              </div>
            </PanelHeading>
            <div className="gear-card-grid">
              {gearSlots.map(slot => {
                const item = equippedItems[slot]
                const definition = item
                  ? gearData.gear[item.definitionId]
                  : gearDefinitionForSlot(slot, weapons).definition
                return (
                  <EquippedGearCard
                    key={slot}
                    slot={slot}
                    slotLabel={gearSlotLabel(slot)}
                    item={item}
                    name={item ? gameText(definition?.name) : undefined}
                    selected={!locked && selectedSlot === slot}
                    disabled={locked}
                    onSelect={() => selectSlot(slot)}
                  />
                )
              })}
            </div>
          </Panel>

          {!locked && (
            <Panel className="build-inventory-panel">
              <PanelHeading>
                <div>
                  <h2>{gearSlotLabel(selectedSlot)}</h2>
                  <p>
                    {t("ui.buildTab.shared")} {gameText(selected.definition?.name) || t("ui.buildTab.gear")}{" "}
                    {t("ui.buildTab.inventoryEditsAndDeletionsApplyToEveryBuild")}
                  </p>
                </div>
              </PanelHeading>
              <div className="gear-card-grid">
                {availableItems.map(item => {
                  const equipped = inventory.equipped[selectedSlot] === item.id
                  // The equipped card states that it is equipped, which is the whole reading; a
                  // candidate's difference from it goes in the same column as its usage count.
                  let status
                  if (!equipped) status = <GearDelta reading={readingFor(item.id)} reference={reference} />
                  return (
                    <AvailableGearCard
                      key={item.id}
                      item={item}
                      name={gameText(selected.definition?.name)}
                      equipped={equipped}
                      usageCount={usageCounts.get(item.id) ?? 0}
                      onEquip={() => equip(item)}
                      onEdit={() => beginEdit(item)}
                      onDelete={() => remove(item)}
                      deleting={pendingDeleteId === item.id}
                      onVisibilityChange={visible => reportVisibility(item.id, visible)}
                      status={status}
                    />
                  )
                })}
                <button
                  className="add-gear-card"
                  type="button"
                  onClick={beginAdd}
                  aria-label={t("ui.buildTab.addNamedGear", { name: gearSlotLabel(selectedSlot) })}
                  data-testid="add-gear"
                >
                  <span>
                    <IconPlus size="1em" aria-hidden />
                  </span>
                  <strong>{t("ui.buildTab.addGear")}</strong>
                </button>
              </div>
            </Panel>
          )}

          {!locked && selected.definition && (
            <Dialog
              open={editing}
              onClose={cancelEditing}
              className="gear-editor-modal"
              label={`${editingItemId !== null ? t("ui.buildTab.edit") : t("ui.buildTab.add")} ${gameText(selected.definition.name)}`}
            >
              {editing && (
                <GearEditor
                  definition={selected.definition}
                  definitionId={selected.definitionId}
                  definitionName={gameText(selected.definition.name)}
                  editingExisting={editingItemId !== null}
                  draft={draft}
                  error={error}
                  baseAffixOptions={baseAffixOptions}
                  additionalAffixOptions={additionalAffixOptions}
                  attunementOptions={attunementOptions}
                  selectedAdditionalKeys={selectedAdditionalKeys}
                  onDraftChange={setDraft}
                  onLevelChange={updateLevel}
                  onRelayedChange={updateRelayed}
                  onCancel={cancelEditing}
                  onSave={save}
                />
              )}
            </Dialog>
          )}
        </div>
      </ResponsiveBuildOverview>
    </div>
  )
}
