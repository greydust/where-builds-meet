import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react";
import { UiIcon } from "./UiIcon";
import { Modal } from "./ui/Modal";
import {
  GearEditor,
  capAndFilterGearDraft,
  createGearId,
  formatNumber,
  gearRarityLabel,
  itemToDraft,
  newDraft,
  normalizeDraftValue,
  type GearDraft,
} from "./components/GearEditor";
import arsenalDefinitions from "../data/arsenal.json";
import bowRingSetDefinitions from "../data/bow-ring-set.json";
import { innerWayEntriesForTag } from "./data/innerWayDefinitions";
import {
  defaultBuildSetup,
  duplicateBuildState,
  armorSetDefinitions,
  attunementData,
  attunementsForGearDefinition,
  availableSetEntriesForTags,
  affixOptionsForGearDefinition,
  buildEntryAvailableForMartialArts,
  buildEntryAvailableForPath,
  buildEntryIsTestPreset,
  buildEntryMartialArts,
  exportBuildState,
  gearBaseStats,
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
  type BuildState,
  type GearInventory,
  type GearItem,
  type GearLevel,
  type GearSlot,
} from "./gear";
import type { WeaponId } from "./types";
import { createOfficialGearBookmarklet } from "./officialGearBookmarklet";
import { dataText, gameText, t } from "./i18n";

function gearSlotLabel(slot: GearSlot) {
  return dataText(`system.gearSlot.${slot}`, gearData.slots[slot]);
}

function buildEntryDisplayName(entry: Pick<BuildEntry, "name" | "isDefault">) {
  return (entry.isDefault ? gameText(entry.name) : entry.name) || "Unnamed Build";
}

type BuildTabProps = {
  weapons: [WeaponId, WeaponId];
  martialArtTags: string[];
  pathTag?: string;
  buildGroup: string;
  graduatedBuildId: string;
  devMode: boolean;
  buildState: BuildState;
  onBuildStateChange: Dispatch<SetStateAction<BuildState>>;
  onActiveBuildChange: (id: string) => void;
  onSelectBuildWeapons: (weapons: [WeaponId, WeaponId]) => boolean;
};

type BuildManagementProps = {
  weapons: [WeaponId, WeaponId];
  martialArtTags: string[];
  pathTag?: string;
  inventory: GearInventory;
  setup: BuildSetup;
  usageCounts: ReadonlyMap<string, number>;
  locked: boolean;
  onInventoryChange: Dispatch<SetStateAction<GearInventory>>;
  onSetupChange: (setup: BuildSetup) => void;
};

const stackedBuildLayoutQuery = "(max-width: 80em)";

function subscribeToStackedBuildLayout(callback: () => void) {
  const query = window.matchMedia(stackedBuildLayoutQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function stackedBuildLayoutSnapshot() {
  return window.matchMedia(stackedBuildLayoutQuery).matches;
}

function ResponsiveBuildOverview({ children, setup }: { children: ReactElement; setup: ReactElement }) {
  const setupFirst = useSyncExternalStore(subscribeToStackedBuildLayout, stackedBuildLayoutSnapshot, () => false);
  return <div className="build-overview-grid">{setupFirst ? [setup, children] : [children, setup]}</div>;
}

function displayValue(value: number, definition?: { percentage?: boolean }) {
  return `${formatNumber(definition?.percentage ? value * 100 : value)}${definition?.percentage ? "%" : ""}`;
}

function itemAttributes(item: GearItem) {
  const rows: Array<{ label: string; value: string; kind: string }> = [];
  const baseDefinition = gearData.affixes[item.baseAffix.key];
  rows.push({
    label: gameText(baseDefinition?.name ?? item.baseAffix.key),
    value: displayValue(item.baseAffix.value, baseDefinition),
    kind: "Base affix",
  });
  for (const affix of item.additionalAffixes) {
    const definition = gearData.affixes[affix.key];
    rows.push({
      label: gameText(definition?.name ?? affix.key),
      value: displayValue(affix.value, definition),
      kind: "Affix",
    });
  }
  if (item.attunement) {
    const attunementDefinition = attunementData[item.attunement.key];
    rows.push({
      label: gameText(attunementDefinition?.name ?? item.attunement.key),
      value: displayValue(item.attunement.value, attunementDefinition),
      kind: "Attunement",
    });
  }
  return rows;
}

function GearBaseStatSummary({ item }: { item: GearItem }) {
  const stats = gearBaseStats(item);
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
    );
  }
  if (typeof stats.minPhys === "number")
    return (
      <span className="gear-base-stats">
        <span className="gear-base-stat">
          {t("stat.minPhys")} <strong>{formatNumber(stats.minPhys)}</strong>
        </span>
      </span>
    );
  if (typeof stats.maxPhys === "number")
    return (
      <span className="gear-base-stats">
        <span className="gear-base-stat">
          {t("stat.maxPhys")} <strong>{formatNumber(stats.maxPhys)}</strong>
        </span>
      </span>
    );
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
    );
  return null;
}

function GearAttributes({ item, compact = false }: { item: GearItem; compact?: boolean }) {
  return (
    <div className={`gear-attribute-list ${compact ? "compact" : ""}`}>
      {itemAttributes(item).map((row, index) => (
        <div
          className={`gear-attribute ${row.kind === "Attunement" ? "gear-attunement-attribute" : ""}`}
          key={`${row.kind}-${row.label}-${index}`}
        >
          <span>
            {row.kind === "Attunement" && <small>{t("ui.buildTab.attunement")}</small>}
            {row.label}
          </span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function RelayedIndicator({ item }: { item?: GearItem }) {
  return item?.relayed ? (
    <span
      className="gear-relayed-indicator"
      aria-label={t("ui.buildTab.relayedGear")}
      title={t("ui.buildTab.relayedGear")}
    >
      <UiIcon name="arrowUp" />
    </span>
  ) : null;
}

export default function BuildTab({
  weapons,
  martialArtTags,
  pathTag,
  buildGroup,
  graduatedBuildId,
  devMode,
  buildState,
  onBuildStateChange,
  onActiveBuildChange,
  onSelectBuildWeapons,
}: BuildTabProps) {
  const [editingBuildId, setEditingBuildId] = useState(buildState.activeBuildId);
  const [editingName, setEditingName] = useState(false);
  const [officialImportText, setOfficialImportText] = useState("");
  const [officialImportError, setOfficialImportError] = useState("");
  const officialImportDialogRef = useRef<HTMLDialogElement>(null);
  const officialBookmarkletRef = useRef<HTMLAnchorElement>(null);
  const officialGearBookmarklet = createOfficialGearBookmarklet({
    noGearData: t("ui.buildTab.bookmarkletNoGearData"),
    copyPrompt: t("ui.buildTab.bookmarkletCopyPrompt"),
    copySuccess: t("ui.buildTab.bookmarkletCopySuccess"),
    notLoggedIn: t("ui.buildTab.bookmarkletNotLoggedIn"),
    unreadableData: t("ui.buildTab.bookmarkletUnreadableData"),
    dashboardUnreachable: t("ui.buildTab.bookmarkletDashboardUnreachable"),
  });
  useEffect(() => {
    officialBookmarkletRef.current?.setAttribute("href", officialGearBookmarklet);
  }, [officialGearBookmarklet]);
  const listedEntries = buildState.entries.filter(
    (entry) =>
      (devMode || !buildEntryIsTestPreset(entry)) &&
      (!entry.isDefault || buildEntryAvailableForPath(entry, buildGroup, weapons)),
  );
  const editingEntry = listedEntries.find((entry) => entry.id === editingBuildId) ?? listedEntries[0];
  useEffect(() => {
    if (editingEntry && editingEntry.id !== editingBuildId) setEditingBuildId(editingEntry.id);
  }, [editingBuildId, editingEntry]);
  function addBuild() {
    const id = `build-${Date.now()}`;
    onBuildStateChange((current) => ({
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
    }));
    setEditingBuildId(id);
    setEditingName(true);
  }
  if (!editingEntry)
    return (
      <section className="panel build-manager-panel">
        <div className="build-manager-layout">
          <aside className="build-list">
            <div className="build-list-heading">
              <span>{t("ui.buildTab.builds")}</span>
              <button className="button button-secondary button-small" type="button" onClick={addBuild}>
                {t("ui.buildTab.newBuild")}
              </button>
            </div>
            <p className="array-editor-empty">{t("ui.buildTab.noBuildsMatchTheSelectedMartialArts")}</p>
          </aside>
        </div>
      </section>
    );
  const inventory = resolveBuildInventory(editingEntry, buildState.gearItems, weapons);
  const setup = resolveBuildSetup(editingEntry);
  const usageCounts = new Map<string, number>();
  for (const entry of buildState.entries) {
    if (entry.isDefault) continue;
    for (const itemId of new Set(Object.values(entry.equipped ?? {}))) {
      if (itemId) usageCounts.set(itemId, (usageCounts.get(itemId) ?? 0) + 1);
    }
  }

  function updateInventory(update: SetStateAction<GearInventory>) {
    if (editingEntry.isDefault) return;
    onBuildStateChange((current) => {
      const currentEntry = current.entries.find((entry) => entry.id === editingEntry.id);
      if (!currentEntry || currentEntry.isDefault) return current;
      const currentInventory = { items: current.gearItems, equipped: currentEntry.equipped ?? {} };
      const nextInventory = typeof update === "function" ? update(currentInventory) : update;
      const availableItems = new Map(nextInventory.items.map((item) => [item.id, item]));
      return {
        ...current,
        gearItems: nextInventory.items,
        entries: current.entries.map((entry) => {
          if (entry.isDefault) return entry;
          const candidateEquipped = entry.id === editingEntry.id ? nextInventory.equipped : (entry.equipped ?? {});
          const equipped = Object.fromEntries(
            gearSlots.flatMap((slot) => {
              const itemId = candidateEquipped[slot];
              const item = itemId ? availableItems.get(itemId) : undefined;
              return item && gearItemSupportsSlot(item, slot) ? [[slot, itemId]] : [];
            }),
          ) as Partial<Record<GearSlot, string>>;
          return { ...entry, equipped };
        }),
      };
    });
  }

  function renameBuild(name: string) {
    onBuildStateChange((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === editingEntry.id && !entry.isDefault ? { ...entry, name } : entry,
      ),
    }));
  }

  function activateBuild() {
    onActiveBuildChange(editingEntry.id);
  }

  function duplicateBuild() {
    const id = `build-${Date.now()}`;
    const name = t("ui.buildTab.copyOfNamedBuild", { name: buildEntryDisplayName(editingEntry) });
    onBuildStateChange((current) => duplicateBuildState(current, editingEntry.id, { id, name }));
    setEditingBuildId(id);
    setEditingName(false);
  }

  function updateSetup(nextSetup: BuildSetup) {
    if (editingEntry.isDefault) return;
    onBuildStateChange((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.id === editingEntry.id ? { ...entry, setup: normalizeBuildSetup(nextSetup) } : entry,
      ),
    }));
  }

  function removeBuild(id: string) {
    const entry = buildState.entries.find((candidate) => candidate.id === id);
    if (
      !entry ||
      entry.isDefault ||
      !window.confirm(t("ui.buildTab.deleteNamedBuildConfirmation", { name: buildEntryDisplayName(entry) }))
    )
      return;
    const remaining = listedEntries.filter((candidate) => candidate.id !== id);
    const fallback = remaining.find((candidate) => candidate.isDefault) ?? remaining[0];
    onBuildStateChange((current) => ({
      ...current,
      entries: current.entries.filter((candidate) => candidate.id !== id),
    }));
    if (buildState.activeBuildId === id && fallback) onActiveBuildChange(fallback.id);
    if (editingBuildId === id) setEditingBuildId(fallback?.id ?? "");
  }

  function exportBuilds() {
    const blob = new Blob([exportBuildState(buildState)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `where-builds-meet-builds-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importBuilds(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const result = mergeImportedBuildState(buildState, JSON.parse(await file.text()) as unknown);
      onBuildStateChange(result.state);
      if (result.importedBuildIds[0]) {
        setEditingBuildId(result.importedBuildIds[0]);
        setEditingName(false);
      }
    } catch (error) {
      console.error("[Build import] Could not import the selected file.", error);
    }
  }

  function openOfficialImport() {
    setOfficialImportText("");
    setOfficialImportError("");
    officialImportDialogRef.current?.showModal();
  }

  async function importFromOfficial() {
    try {
      const { parseOfficialGearExport } = await import("./officialGearImport");
      const official = parseOfficialGearExport(JSON.parse(officialImportText), weapons);
      const result = mergeImportedBuildState(buildState, official.exportValue, { reuseIdenticalGear: true });
      if (result.importedGearCount + result.reusedGearCount !== official.gearCount || result.importedBuildCount !== 1)
        throw new Error(t("ui.buildTab.dashboardValidationError"));
      official.warnings.forEach((warning) => console.warn(`[Official gear import] ${warning}`));
      onBuildStateChange(result.state);
      setEditingBuildId(result.importedBuildIds[0]);
      setEditingName(false);
      officialImportDialogRef.current?.close();
    } catch (error) {
      setOfficialImportError(error instanceof Error ? error.message : t("ui.buildTab.dashboardImportError"));
    }
  }

  function selectBuild(entry: typeof editingEntry) {
    if (!buildEntryAvailableForMartialArts(entry, weapons)) {
      const entryMartialArts = buildEntryMartialArts(entry);
      if (entryMartialArts.length !== 2 || !onSelectBuildWeapons([entryMartialArts[0], entryMartialArts[1]])) return;
    }
    setEditingBuildId(entry.id);
    setEditingName(false);
  }

  return (
    <section className="panel build-manager-panel">
      <div className="build-manager-layout">
        <aside className="build-list">
          <div className="build-list-heading">
            <span>{t("ui.buildTab.builds")}</span>
            <button className="button button-secondary button-small" type="button" onClick={addBuild}>
              {t("ui.buildTab.newBuild")}
            </button>
          </div>
          <div className="build-list-entries">
            {listedEntries.map((entry) => {
              const incompatible = !buildEntryAvailableForMartialArts(entry, weapons);
              return (
                <div
                  className={`build-list-item ${entry.id === buildState.activeBuildId ? "active" : ""} ${entry.id === editingBuildId ? "editing" : ""} ${incompatible ? "incompatible" : ""}`}
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  title={incompatible ? t("ui.buildTab.selectThisBuildAndSwitchToItsMartial") : undefined}
                  onClick={() => selectBuild(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") selectBuild(entry);
                  }}
                >
                  <span>
                    <strong>
                      {entry.id === buildState.activeBuildId && (
                        <i className="active-build-icon" title={t("ui.buildTab.activeBuild")}>
                          <UiIcon name="active" />
                        </i>
                      )}
                      {buildEntryDisplayName(entry)}
                    </strong>
                    {entry.isDefault && (
                      <small>
                        {entry.presetId === graduatedBuildId
                          ? t("ui.buildTab.graduatePreset")
                          : t("ui.buildTab.defaultPreset")}
                      </small>
                    )}
                  </span>
                  {!entry.isDefault && (
                    <button
                      className="build-remove-button"
                      type="button"
                      aria-label={t("ui.buildTab.removeNamedBuild", { name: entry.name || t("ui.buildTab.build") })}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeBuild(entry.id);
                      }}
                    >
                      <UiIcon name="close" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="build-transfer-actions">
            <div>
              <button className="button button-secondary button-small" type="button" onClick={exportBuilds}>
                {t("ui.buildTab.export")}
              </button>
              <label className="button button-secondary button-small build-import-button">
                {t("ui.buildTab.import")}
                <input
                  type="file"
                  accept="application/json,.json"
                  aria-label={t("ui.buildTab.importBuildsAndGear")}
                  onChange={importBuilds}
                />
              </label>
            </div>
            <button
              className="button button-secondary button-small build-official-import-button"
              type="button"
              onClick={openOfficialImport}
            >
              {t("ui.buildTab.importFromOfficial")}
            </button>
          </div>
        </aside>
        <div className="build-editor-content">
          <div className="build-detail-heading">
            <div>
              {editingName && !editingEntry.isDefault ? (
                <input
                  className="build-name-input"
                  autoFocus
                  value={editingEntry.name}
                  onChange={(event) => renameBuild(event.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setEditingName(false);
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
                      <UiIcon name="edit" />
                    </button>
                  ) : null}
                </h3>
              )}
            </div>
            <div className="detail-active-actions">
              <button className="button button-secondary button-small" type="button" onClick={duplicateBuild}>
                {t("ui.app.duplicate")}
              </button>
              <button
                className="button button-small detail-active-button"
                type="button"
                disabled={editingEntry.id === buildState.activeBuildId}
                onClick={activateBuild}
              >
                {editingEntry.id === buildState.activeBuildId
                  ? t("ui.buildTab.activeBuildAction")
                  : t("ui.buildTab.makeActive")}
              </button>
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
          />
        </div>
      </div>
      <dialog
        className="official-import-dialog"
        ref={officialImportDialogRef}
        onClose={() => setOfficialImportError("")}
      >
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
            <UiIcon name="close" />
          </button>
        </div>
        <ol className="official-import-steps">
          <li>
            {t("ui.buildTab.drag")}{" "}
            <a className="button button-primary official-bookmarklet" ref={officialBookmarkletRef}>
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
          onChange={(event) => {
            setOfficialImportText(event.target.value);
            setOfficialImportError("");
          }}
        />
        {officialImportError && (
          <p className="editor-error" role="alert">
            {officialImportError}
          </p>
        )}
        <div className="official-import-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => officialImportDialogRef.current?.close()}
          >
            {t("ui.buildTab.cancel")}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!officialImportText.trim()}
            onClick={importFromOfficial}
          >
            {t("ui.buildTab.importGear")}
          </button>
        </div>
        <p className="official-import-privacy">{t("ui.buildTab.theBookmarkRunsOnlyOnTheOfficialDashboard")}</p>
      </dialog>
    </section>
  );
}

function BuildSetupPanel({
  setup,
  affixSummary,
  martialArtTags,
  pathTag,
  locked,
  onChange,
}: {
  setup: BuildSetup;
  affixSummary: GearAffixSummary;
  martialArtTags: string[];
  pathTag?: string;
  locked: boolean;
  onChange: (setup: BuildSetup) => void;
}) {
  const lockedTitle = locked ? "Fixed by this default preset" : undefined;
  const innerWayOptions = innerWayEntriesForTag(pathTag);
  const availableWeaponSets = availableSetEntriesForTags(weaponSetDefinitions, martialArtTags, pathTag);
  const availableArmorSets = availableSetEntriesForTags(armorSetDefinitions, martialArtTags, pathTag);
  const setPanel = (
    title: string,
    key: "weaponSets" | "armorSets",
    definitions: typeof weaponSetDefinitions,
    entries: typeof availableWeaponSets,
  ) => (
    <section className="panel setup-placeholder-panel build-setup-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="gear-set-list">
        {entries.map(([setName, definition]) => {
          const selectedTier = setup[key][setName] ?? 0;
          return (
            <div className="setup-field" key={setName}>
              <span>{gameText(definition.name)}</span>
              <div className="setup-option-control">
                <div className="setup-option-list">
                  {[0, 2, 4].map((tier) => (
                    <button
                      className={selectedTier === tier ? "selected" : ""}
                      type="button"
                      key={tier}
                      disabled={locked}
                      title={lockedTitle}
                      onClick={() =>
                        onChange({
                          ...setup,
                          [key]: selectSetTier(setup[key], setName, tier as 0 | 2 | 4, definitions),
                        })
                      }
                    >
                      {t(`system.setPieces.${tier}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
  return (
    <div className="build-setup-column" aria-label={t("ui.buildTab.buildSetup")}>
      <section className="panel setup-placeholder-panel build-setup-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("ui.buildTab.innerWays")}</h2>
          </div>
        </div>
        <div className="inner-way-list">
          {setup.innerWays.map((row, index) => (
            <div className="inner-way-row" key={index}>
              <select
                aria-label={t("ui.buildTab.buildInnerWay", { number: index + 1 })}
                value={innerWayOptions.some(([value]) => value === row.innerWay) ? row.innerWay : ""}
                disabled={locked}
                title={lockedTitle}
                onChange={(event) =>
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
                onChange={(event) =>
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
      </section>
      {setPanel(t("ui.buildTab.weaponSet"), "weaponSets", weaponSetDefinitions, availableWeaponSets)}
      {availableArmorSets.length > 0 &&
        setPanel(t("ui.buildTab.armorSet"), "armorSets", armorSetDefinitions, availableArmorSets)}
      <section className="panel setup-placeholder-panel build-setup-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("ui.buildTab.bowRingSet")}</h2>
          </div>
        </div>
        <div className="setup-option-list setup-option-list-wide">
          {Object.entries(bowRingSetDefinitions).map(([value, definition]) => (
            <button
              className={setup.bowRingSet === value ? "selected" : ""}
              type="button"
              key={value}
              disabled={locked}
              title={lockedTitle}
              onClick={() => onChange({ ...setup, bowRingSet: value })}
            >
              {gameText(definition.name)}
            </button>
          ))}
        </div>
      </section>
      <section className="panel setup-placeholder-panel build-setup-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("ui.buildTab.arsenal")}</h2>
          </div>
        </div>
        <div className="setup-option-list setup-option-list-arsenal">
          {Object.entries(arsenalDefinitions).map(([value, definition]) => (
            <button
              className={setup.arsenal === value ? "selected" : ""}
              type="button"
              key={value}
              disabled={locked}
              title={lockedTitle}
              onClick={() => onChange({ ...setup, arsenal: value })}
            >
              {gameText(definition.name)}
            </button>
          ))}
        </div>
      </section>
      <section className="panel setup-placeholder-panel build-setup-panel build-affix-summary-panel">
        <div className="panel-heading">
          <div className="build-affix-summary-heading">
            <h2>{t("ui.buildTab.affixes")}</h2>
            <span>{t("ui.buildTab.affixTotal", { number: affixSummary.total })}</span>
          </div>
        </div>
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
      </section>
    </div>
  );
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
}: BuildManagementProps) {
  const [selectedSlot, setSelectedSlot] = useState<GearSlot>("leftWeapon");
  const [editing, setEditing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GearDraft>(newDraft);
  const [error, setError] = useState("");
  const selected = gearDefinitionForSlot(selectedSlot, weapons);
  const availableItems = inventory.items.filter(
    (item) => item.definitionId === selected.definitionId && gearItemSupportsSlot(item, selectedSlot),
  );
  const equippedItems = useMemo(
    () =>
      Object.fromEntries(
        gearSlots.map((slot) => {
          const equippedId = inventory.equipped[slot];
          const item = inventory.items.find(
            (candidate) => candidate.id === equippedId && gearItemSupportsSlot(candidate, slot),
          );
          return [slot, item && (locked || isGearItemCompatible(item, slot, weapons)) ? item : undefined];
        }),
      ) as Partial<Record<GearSlot, GearItem>>,
    [inventory, weapons, locked],
  );
  const affixSummary = useMemo(
    () => summarizeGearAffixes(gearSlots.map((slot) => equippedItems[slot])),
    [equippedItems],
  );

  function selectSlot(slot: GearSlot) {
    setSelectedSlot(slot);
    setEditing(false);
    setEditingItemId(null);
    setPendingDeleteId(null);
    setDraft(newDraft());
    setError("");
  }

  function beginAdd() {
    if (editing && editingItemId === null) return;
    setDraft(newDraft());
    setError("");
    setEditingItemId(null);
    setPendingDeleteId(null);
    setEditing(true);
  }

  function beginEdit(item: GearItem) {
    setDraft(itemToDraft(item));
    setError("");
    setEditingItemId(item.id);
    setPendingDeleteId(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditingItemId(null);
    setError("");
  }

  function updateLevel(level: GearLevel) {
    setDraft((current) => capAndFilterGearDraft({ ...current, level }, selected.definition));
  }

  function updateRelayed(relayed: boolean) {
    setDraft((current) => capAndFilterGearDraft(current, selected.definition, relayed));
  }

  function save() {
    const definition = selected.definition;
    if (!definition) return;
    const baseAffix = normalizeDraftValue(draft.baseAffix, gearData.affixes, "affix", draft.relayed, draft.level);
    const additionalAffixDrafts = draft.additionalAffixes.filter((affix) => affix.key || affix.value.trim());
    const additionalAffixes = additionalAffixDrafts.map((affix) =>
      normalizeDraftValue(affix, gearData.affixes, "affix", draft.relayed, draft.level),
    );
    const hasAttunementDraft = Boolean(draft.attunement.key || draft.attunement.value.trim());
    const attunement = hasAttunementDraft
      ? normalizeDraftValue(draft.attunement, attunementData, "attunement", draft.relayed, draft.level)
      : undefined;
    if (!baseAffix) {
      setError(t("ui.buildTab.baseAffixValueError"));
      return;
    }
    if (!baseAffixOptions.includes(baseAffix.key)) {
      setError(t("ui.buildTab.baseAffixAvailabilityError"));
      return;
    }
    if (additionalAffixes.some((affix) => !affix) || (hasAttunementDraft && !attunement)) {
      setError(t("ui.buildTab.optionalAttributeError"));
      return;
    }
    if (attunement && !attunementOptions.includes(attunement.key)) {
      setError(t("ui.buildTab.attunementAvailabilityError"));
      return;
    }
    const normalizedAdditional = additionalAffixes.filter((affix): affix is { key: string; value: number } =>
      Boolean(affix),
    );
    if (normalizedAdditional.some((affix) => !additionalAffixOptions.includes(affix.key))) {
      setError(t("ui.buildTab.additionalAffixAvailabilityError"));
      return;
    }
    if (new Set(normalizedAdditional.map((affix) => affix.key)).size !== normalizedAdditional.length) {
      setError(t("ui.buildTab.duplicateAffixError"));
      return;
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
    };
    onInventoryChange((current) => ({
      ...current,
      items: editingItemId
        ? current.items.map((candidate) => (candidate.id === editingItemId ? item : candidate))
        : [...current.items, item],
    }));
    setEditing(false);
    setEditingItemId(null);
    setDraft(newDraft());
    setError("");
  }

  function equip(item: GearItem) {
    setPendingDeleteId(null);
    onInventoryChange((current) => ({
      ...current,
      equipped: {
        ...Object.fromEntries(Object.entries(current.equipped).filter(([, itemId]) => itemId !== item.id)),
        [selectedSlot]: item.id,
      },
    }));
  }

  function remove(item: GearItem) {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      return;
    }
    onInventoryChange((current) => ({
      items: current.items.filter((candidate) => candidate.id !== item.id),
      equipped: Object.fromEntries(Object.entries(current.equipped).filter(([, itemId]) => itemId !== item.id)),
    }));
    setPendingDeleteId(null);
    if (editingItemId === item.id) {
      setEditing(false);
      setEditingItemId(null);
      setDraft(newDraft());
      setError("");
    }
  }

  const baseAffixOptions = selected.definition
    ? affixOptionsForGearDefinition(selected.definition, "baseAffixes", draft.level, draft.relayed)
    : [];
  const additionalAffixOptions = selected.definition
    ? affixOptionsForGearDefinition(selected.definition, "additionalAffixes", draft.level, draft.relayed)
    : [];
  const attunementOptions = (selected.definition ? attunementsForGearDefinition(selected.definition) : []).filter(
    (key) => {
      const tags = attunementData[key]?.tags ?? [];
      if (tags.includes("Weapon")) return true;
      return (!pathTag || tags.includes(pathTag)) && martialArtTags.some((tag) => tags.includes(tag));
    },
  );
  const selectedAdditionalKeys = new Set(draft.additionalAffixes.map((affix) => affix.key).filter(Boolean));

  return (
    <div className="build-page">
      <ResponsiveBuildOverview
        setup={
          <BuildSetupPanel
            key="setup"
            setup={setup}
            affixSummary={affixSummary}
            martialArtTags={martialArtTags}
            pathTag={pathTag}
            locked={locked}
            onChange={onSetupChange}
          />
        }
      >
        <div key="gear" className="build-management-grid">
          <section className="panel build-equipped-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.buildTab.equippedGear")}</h2>
                <p>
                  {locked
                    ? t("ui.buildTab.thisDefaultBuildUsesFixedPresetGearUse")
                    : t("ui.buildTab.selectASlotToEquipGearFromThe")}
                </p>
              </div>
            </div>
            <div className="equipped-gear-grid">
              {gearSlots.map((slot) => {
                const item = equippedItems[slot];
                const definition = item
                  ? gearData.gear[item.definitionId]
                  : gearDefinitionForSlot(slot, weapons).definition;
                return (
                  <button
                    className={`equipped-gear-card ${!locked && selectedSlot === slot ? "selected" : ""}`}
                    type="button"
                    key={slot}
                    disabled={locked}
                    onClick={() => selectSlot(slot)}
                    data-testid={`equipped-${slot}`}
                  >
                    <RelayedIndicator item={item} />
                    <span className="gear-slot-name">{gearSlotLabel(slot)}</span>
                    {item ? (
                      <>
                        <strong>{gameText(definition?.name)}</strong>
                        <small>
                          {item.level} {gearRarityLabel(item.rarity)}
                        </small>
                        <GearBaseStatSummary item={item} />
                        <GearAttributes item={item} compact />
                      </>
                    ) : (
                      <span className="gear-empty">{t("ui.buildTab.noGearEquipped")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {!locked && (
            <section className="panel build-inventory-panel">
              <div className="panel-heading">
                <div>
                  <h2>{gearSlotLabel(selectedSlot)}</h2>
                  <p>
                    {t("ui.buildTab.shared")} {gameText(selected.definition?.name) || t("ui.buildTab.gear")}{" "}
                    {t("ui.buildTab.inventoryEditsAndDeletionsApplyToEveryBuild")}
                  </p>
                </div>
              </div>
              <div className="available-gear-grid">
                {availableItems.map((item) => (
                  <article
                    className={`available-gear-card ${inventory.equipped[selectedSlot] === item.id ? "equipped" : ""} ${item.relayed ? "relayed" : ""}`}
                    key={item.id}
                  >
                    <RelayedIndicator item={item} />
                    <div className="available-gear-heading">
                      <div>
                        <strong>{gameText(selected.definition?.name)}</strong>
                        <small>
                          {item.level} {gearRarityLabel(item.rarity)}
                        </small>
                        <GearBaseStatSummary item={item} />
                      </div>
                      <div className="available-gear-status">
                        {inventory.equipped[selectedSlot] === item.id && (
                          <span>{t("ui.buildTab.equippedGearStatus")}</span>
                        )}
                        <small>
                          {t("ui.buildTab.usedIn")} {usageCounts.get(item.id) ?? 0}{" "}
                          {(usageCounts.get(item.id) ?? 0) === 1
                            ? t("ui.buildTab.build")
                            : t("ui.buildTab.buildCountNoun")}
                        </small>
                      </div>
                    </div>
                    <GearAttributes item={item} />
                    <div className="gear-card-actions">
                      <button
                        className="button button-primary button-small"
                        type="button"
                        disabled={inventory.equipped[selectedSlot] === item.id}
                        onClick={() => equip(item)}
                      >
                        {inventory.equipped[selectedSlot] === item.id
                          ? t("ui.buildTab.equippedGearStatus")
                          : t("ui.buildTab.equip")}
                      </button>
                      <button
                        className="button button-secondary button-small"
                        type="button"
                        onClick={() => beginEdit(item)}
                      >
                        {t("ui.buildTab.edit")}
                      </button>
                      <button
                        className={`button button-small ${pendingDeleteId === item.id ? "button-danger" : "button-secondary"}`}
                        type="button"
                        aria-label={
                          pendingDeleteId === item.id ? t("ui.buildTab.confirmDeleteGear") : t("ui.buildTab.deleteGear")
                        }
                        onClick={() => remove(item)}
                      >
                        {pendingDeleteId === item.id ? t("ui.buildTab.confirmDelete") : t("ui.buildTab.delete")}
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  className="add-gear-card"
                  type="button"
                  onClick={beginAdd}
                  aria-label={t("ui.buildTab.addNamedGear", { name: gearSlotLabel(selectedSlot) })}
                  data-testid="add-gear"
                >
                  <span>
                    <UiIcon name="plus" />
                  </span>
                  <strong>{t("ui.buildTab.addGear")}</strong>
                </button>
              </div>
            </section>
          )}

          {!locked && selected.definition && (
            <Modal
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
            </Modal>
          )}
        </div>
      </ResponsiveBuildOverview>
    </div>
  );
}
