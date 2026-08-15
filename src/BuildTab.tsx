import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent as ReactClipboardEvent, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { UiIcon } from "./UiIcon";
import arsenalDefinitions from "../data/arsenal.json";
import bowRingSetDefinitions from "../data/bow-ring-set.json";
import gearSetDefinitions from "../data/gear-set.json";
import frostCladNight from "../data/innerway/frost-clad-night.json";
import moraleChant from "../data/innerway/morale-chant.json";
import steadfastDevotion from "../data/innerway/steadfast-devotion.json";
import throatPiercingArt from "../data/innerway/throat-piercing-art.json";
import breakingPoint from "../data/innerway/breaking-point.json";
import envigoratedWarrior from "../data/innerway/envigorated-warrior.json";
import {
  defaultBuildSetup,
  attunementData,
  attunementsForGearDefinition,
  buildEntryAvailableForWeapons,
  buildEntryWeapons,
  clampGearRoll,
  exportBuildState,
  gearBaseStats,
  gearData,
  gearDefinitionForSlot,
  gearItemSupportsSlot,
  gearSlots,
  isGearItemCompatible,
  maxGearRoll,
  mergeImportedBuildState,
  normalizeBuildSetup,
  resolveBuildInventory,
  resolveBuildSetup,
  type BuildSetup,
  type BuildState,
  type GearDefinition,
  type GearInventory,
  type GearItem,
  type GearLevel,
  type GearRarity,
  type GearSlot,
  type GearValueDefinition,
} from "./gear";
import type { WeaponId } from "./types";
import { recognizeGearImage } from "./gearOcr";
import { officialGearBookmarklet } from "./officialGearBookmarklet";

const innerWayDefinitions = {
  FrostCladNight: frostCladNight,
  MoraleChant: moraleChant,
  SteadfastDevotion: steadfastDevotion,
  ThroatPiercingArt: throatPiercingArt,
  BreakingPoint: breakingPoint,
  EnvigoratedWarrior: envigoratedWarrior,
} as Record<string, { name: string; tags?: string[] }>;

type GearValueDraft = { key: string; value: string };
type GearDraft = {
  level: GearLevel;
  rarity: GearRarity;
  relayed: boolean;
  baseAffix: GearValueDraft;
  additionalAffixes: GearValueDraft[];
  attunement: GearValueDraft;
};

type BuildTabProps = {
  weapons: [WeaponId, WeaponId];
  martialArtTags: string[];
  pathTag?: string;
  buildState: BuildState;
  onBuildStateChange: Dispatch<SetStateAction<BuildState>>;
  onSelectBuildWeapons: (weapons: [WeaponId, WeaponId]) => void;
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

const blankValue = (): GearValueDraft => ({ key: "", value: "" });
const newDraft = (): GearDraft => ({
  level: 96,
  rarity: "Gold",
  relayed: false,
  baseAffix: blankValue(),
  additionalAffixes: Array.from({ length: 4 }, blankValue),
  attunement: blankValue(),
});

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

function displayValue(value: number, definition?: { percentage?: boolean }) {
  return `${formatNumber(definition?.percentage ? value * 100 : value)}${definition?.percentage ? "%" : ""}`;
}

function itemAttributes(item: GearItem) {
  const rows: Array<{ label: string; value: string; kind: string }> = [];
  const baseDefinition = gearData.affixes[item.baseAffix.key];
  rows.push({ label: baseDefinition?.name ?? item.baseAffix.key, value: displayValue(item.baseAffix.value, baseDefinition), kind: "Base affix" });
  for (const affix of item.additionalAffixes) {
    const definition = gearData.affixes[affix.key];
    rows.push({ label: definition?.name ?? affix.key, value: displayValue(affix.value, definition), kind: "Affix" });
  }
  if (item.attunement) {
    const attunementDefinition = attunementData[item.attunement.key];
    rows.push({ label: attunementDefinition?.name ?? item.attunement.key, value: displayValue(item.attunement.value, attunementDefinition), kind: "Attunement" });
  }
  return rows;
}

function GearBaseStatSummary({ item }: { item: GearItem }) {
  const stats = gearBaseStats(item);
  if (typeof stats.minPhys === "number" && typeof stats.maxPhys === "number") {
    return <span className="gear-base-stat">Physical Attack <strong>{formatNumber(stats.minPhys)}~{formatNumber(stats.maxPhys)}</strong></span>;
  }
  if (typeof stats.minPhys === "number") return <span className="gear-base-stat">Min Physical Attack <strong>{formatNumber(stats.minPhys)}</strong></span>;
  if (typeof stats.maxPhys === "number") return <span className="gear-base-stat">Max Physical Attack <strong>{formatNumber(stats.maxPhys)}</strong></span>;
  return null;
}

function GearAttributes({ item, compact = false }: { item: GearItem; compact?: boolean }) {
  return <div className={`gear-attribute-list ${compact ? "compact" : ""}`}>{itemAttributes(item).map((row, index) => <div className={`gear-attribute ${row.kind === "Attunement" ? "gear-attunement-attribute" : ""}`} key={`${row.kind}-${row.label}-${index}`}><span>{row.kind === "Attunement" && <small>{row.kind}</small>}{row.label}</span><strong>{row.value}</strong></div>)}</div>;
}

function RelayedIndicator({ item }: { item?: GearItem }) {
  return item?.relayed ? <span className="gear-relayed-indicator" aria-label="Relayed gear" title="Relayed gear"><UiIcon name="up" /></span> : null;
}

function draftRollCap(key: string, definitions: Record<string, GearValueDefinition>, category: "affix" | "attunement", relayed: boolean, level: GearLevel) {
  const maximum = maxGearRoll(key, category, relayed, level);
  if (typeof maximum !== "number") return undefined;
  return definitions[key]?.percentage ? maximum * 100 : maximum;
}

function capDraftValue(value: GearValueDraft, definitions: Record<string, GearValueDefinition>, category: "affix" | "attunement", relayed: boolean, level: GearLevel) {
  const maximum = draftRollCap(value.key, definitions, category, relayed, level);
  const numericValue = Number(value.value);
  if (maximum === undefined || !value.value.trim() || !Number.isFinite(numericValue) || numericValue <= maximum) return value;
  return { ...value, value: formatNumber(maximum) };
}

function capGearDraft(draft: GearDraft, relayed = draft.relayed): GearDraft {
  return {
    ...draft,
    relayed,
    baseAffix: capDraftValue(draft.baseAffix, gearData.affixes, "affix", relayed, draft.level),
    additionalAffixes: draft.additionalAffixes.map((affix) => capDraftValue(affix, gearData.affixes, "affix", relayed, draft.level)),
    attunement: capDraftValue(draft.attunement, attunementData, "attunement", relayed, draft.level),
  };
}

function GearValueEditor({ label, value, options, definitions, category, relayed, level, disabledKeys = new Set(), onChange }: {
  label: string;
  value: GearValueDraft;
  options: string[];
  definitions: Record<string, GearValueDefinition>;
  category: "affix" | "attunement";
  relayed: boolean;
  level: GearLevel;
  disabledKeys?: Set<string>;
  onChange: (next: GearValueDraft) => void;
}) {
  const selectedDefinition = definitions[value.key];
  const maximum = draftRollCap(value.key, definitions, category, relayed, level);
  return <div className="gear-value-editor">
    <label><span>{label}</span><select aria-label={`${label} type`} value={value.key} onChange={(event) => onChange(capDraftValue({ ...value, key: event.target.value }, definitions, category, relayed, level))}>
      <option value="">Select an attribute</option>
      {options.map((key) => <option key={key} value={key} disabled={key !== value.key && disabledKeys.has(key)}>{definitions[key]?.name ?? key}</option>)}
    </select></label>
    <label className="gear-value-input"><span>Value</span><span><input aria-label={`${label} value`} type="number" min="0" max={maximum} step="0.01" value={value.value} onChange={(event) => onChange(capDraftValue({ ...value, value: event.target.value }, definitions, category, relayed, level))} />{selectedDefinition?.percentage && <i>%</i>}</span></label>
  </div>;
}

function createGearId() {
  return globalThis.crypto?.randomUUID?.() ?? `gear-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDraftValue(draft: GearValueDraft, definitions: Record<string, GearValueDefinition>, category: "affix" | "attunement", relayed: boolean, level: GearLevel) {
  const definition = definitions[draft.key];
  const value = Number(draft.value);
  if (!definition || !draft.value.trim() || !Number.isFinite(value) || value < 0) return undefined;
  const storedValue = definition.percentage ? value / 100 : value;
  return { key: draft.key, value: clampGearRoll(draft.key, storedValue, category, relayed, level) };
}

function savedValueToDraft(value: { key: string; value: number }, definitions: Record<string, GearValueDefinition>): GearValueDraft {
  return {
    key: value.key,
    value: formatNumber(definitions[value.key]?.percentage ? value.value * 100 : value.value),
  };
}

function itemToDraft(item: GearItem): GearDraft {
  const additionalAffixes = item.additionalAffixes.map((affix) => savedValueToDraft(affix, gearData.affixes));
  return {
    level: item.level,
    rarity: item.rarity,
    relayed: item.relayed === true,
    baseAffix: savedValueToDraft(item.baseAffix, gearData.affixes),
    additionalAffixes: [...additionalAffixes, ...Array.from({ length: 4 - additionalAffixes.length }, blankValue)],
    attunement: item.attunement ? savedValueToDraft(item.attunement, attunementData) : blankValue(),
  };
}

export default function BuildTab({ weapons, martialArtTags, pathTag, buildState, onBuildStateChange, onSelectBuildWeapons }: BuildTabProps) {
  const [editingBuildId, setEditingBuildId] = useState(buildState.activeBuildId);
  const [editingName, setEditingName] = useState(false);
  const [transferStatus, setTransferStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [officialImportText, setOfficialImportText] = useState("");
  const [officialImportError, setOfficialImportError] = useState("");
  const officialImportDialogRef = useRef<HTMLDialogElement>(null);
  const officialBookmarkletRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    officialBookmarkletRef.current?.setAttribute("href", officialGearBookmarklet);
  }, []);
  const listedEntries = buildState.entries.filter((entry) => !entry.isDefault || buildEntryAvailableForWeapons(entry, weapons));
  const editingEntry = listedEntries.find((entry) => entry.id === editingBuildId) ?? listedEntries[0];
  useEffect(() => {
    if (editingEntry && editingEntry.id !== editingBuildId) setEditingBuildId(editingEntry.id);
  }, [editingBuildId, editingEntry]);
  function addBuild() {
    const id = `build-${Date.now()}`;
    onBuildStateChange((current) => ({ ...current, entries: [...current.entries, { id, name: "New Build", weapons: [...weapons], equipped: {}, setup: normalizeBuildSetup(defaultBuildSetup) }] }));
    setEditingBuildId(id);
    setEditingName(true);
  }
  if (!editingEntry) return <section className="panel build-manager-panel"><div className="build-manager-layout"><aside className="build-list"><div className="build-list-heading"><span>Builds</span><button className="button button-secondary button-small" type="button" onClick={addBuild}>New Build</button></div><p className="array-editor-empty">No builds match the selected weapons.</p></aside></div></section>;
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
          const candidateEquipped = entry.id === editingEntry.id ? nextInventory.equipped : entry.equipped ?? {};
          const equipped = Object.fromEntries(gearSlots.flatMap((slot) => {
            const itemId = candidateEquipped[slot];
            const item = itemId ? availableItems.get(itemId) : undefined;
            return item && gearItemSupportsSlot(item, slot) ? [[slot, itemId]] : [];
          })) as Partial<Record<GearSlot, string>>;
          return { ...entry, equipped };
        }),
      };
    });
  }

  function renameBuild(name: string) {
    onBuildStateChange((current) => ({ ...current, entries: current.entries.map((entry) => entry.id === editingEntry.id ? { ...entry, name } : entry) }));
  }

  function activateBuild() {
    onBuildStateChange((current) => ({ ...current, activeBuildId: editingEntry.id }));
  }

  function updateSetup(nextSetup: BuildSetup) {
    if (editingEntry.isDefault) return;
    onBuildStateChange((current) => ({
      ...current,
      entries: current.entries.map((entry) => entry.id === editingEntry.id ? { ...entry, setup: normalizeBuildSetup(nextSetup) } : entry),
    }));
  }

  function removeBuild(id: string) {
    const entry = buildState.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.isDefault || !window.confirm(`Delete build "${entry.name}"?`)) return;
    const remaining = listedEntries.filter((candidate) => candidate.id !== id);
    const fallback = remaining.find((candidate) => candidate.isDefault) ?? remaining[0];
    onBuildStateChange((current) => ({
      ...current,
      entries: current.entries.filter((candidate) => candidate.id !== id),
      activeBuildId: current.activeBuildId === id ? fallback?.id ?? "" : current.activeBuildId,
    }));
    if (editingBuildId === id) setEditingBuildId(fallback?.id ?? "");
  }

  function exportBuilds() {
    const exportedBuildCount = buildState.entries.filter((entry) => !entry.isDefault).length;
    const blob = new Blob([exportBuildState(buildState)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `where-builds-meet-builds-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setTransferStatus({ message: `Exported ${buildState.gearItems.length} gear and ${exportedBuildCount} builds.` });
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
      setTransferStatus({ message: `Imported ${result.importedGearCount} gear and ${result.importedBuildCount} builds.` });
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : "The build file could not be imported.", error: true });
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
      if (result.importedGearCount + result.reusedGearCount !== official.gearCount || result.importedBuildCount !== 1) throw new Error("Some dashboard gear did not pass build validation and was not imported.");
      official.warnings.forEach((warning) => console.warn(`[Official gear import] ${warning}`));
      onBuildStateChange(result.state);
      setEditingBuildId(result.importedBuildIds[0]);
      setEditingName(false);
      setTransferStatus({ message: `Imported a build from ${official.roleName} with ${result.importedGearCount} new gear${result.reusedGearCount ? ` and ${result.reusedGearCount} reused gear` : ""}.` });
      officialImportDialogRef.current?.close();
    } catch (error) {
      setOfficialImportError(error instanceof Error ? error.message : "The pasted dashboard data could not be imported.");
    }
  }

  function selectBuild(entry: typeof editingEntry) {
    if (!buildEntryAvailableForWeapons(entry, weapons)) {
      const entryWeapons = buildEntryWeapons(entry);
      if (entryWeapons.length === 2) onSelectBuildWeapons([entryWeapons[0], entryWeapons[1]]);
    }
    setEditingBuildId(entry.id);
    setEditingName(false);
  }

  return <section className="panel build-manager-panel"><div className="build-manager-layout">
    <aside className="build-list">
      <div className="build-list-heading"><span>Builds</span><button className="button button-secondary button-small" type="button" onClick={addBuild}>New Build</button></div>
      <div className="build-list-entries">{listedEntries.map((entry) => { const incompatible = !buildEntryAvailableForWeapons(entry, weapons); return <div className={`build-list-item ${entry.id === buildState.activeBuildId ? "active" : ""} ${entry.id === editingBuildId ? "editing" : ""} ${incompatible ? "incompatible" : ""}`} key={entry.id} role="button" tabIndex={0} title={incompatible ? "Select this build and switch to its weapons" : undefined} onClick={() => selectBuild(entry)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectBuild(entry); }}>
          <span><strong>{entry.id === buildState.activeBuildId && <i className="active-build-icon" title="Active build"><UiIcon name="active" /></i>}{entry.name || "Unnamed Build"}</strong>{entry.isDefault && <small>Default preset</small>}</span>
          {!entry.isDefault && <button className="build-remove-button" type="button" aria-label={`Remove ${entry.name || "build"}`} onClick={(event) => { event.stopPropagation(); removeBuild(entry.id); }}><UiIcon name="close" /></button>}
        </div>; })}</div>
      <div className="build-transfer-actions">
        <div><button className="button button-secondary button-small" type="button" onClick={exportBuilds}>Export</button><label className="button button-secondary button-small build-import-button">Import<input type="file" accept="application/json,.json" aria-label="Import builds and gear" onChange={importBuilds} /></label></div>
        <button className="button button-secondary button-small build-official-import-button" type="button" onClick={openOfficialImport}>Import from Official</button>
        {transferStatus && <p className={transferStatus.error ? "error" : ""} role={transferStatus.error ? "alert" : "status"}>{transferStatus.message}</p>}
      </div>
    </aside>
    <div className="build-editor-content">
      <div className="build-detail-heading"><div>{editingName ? <input className="build-name-input" autoFocus value={editingEntry.name} onChange={(event) => renameBuild(event.target.value)} onBlur={() => setEditingName(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingName(false); }} /> : <h3>{editingEntry.name || "Unnamed Build"}<button className="icon-button" type="button" aria-label="Edit build name" onClick={() => setEditingName(true)}><UiIcon name="edit" /></button></h3>}</div>
        <button className="button button-small detail-active-button" type="button" disabled={editingEntry.id === buildState.activeBuildId} onClick={activateBuild}>{editingEntry.id === buildState.activeBuildId ? "Active" : "Make Active"}</button>
      </div>
      <BuildManagement key={editingEntry.id} weapons={weapons} martialArtTags={martialArtTags} pathTag={pathTag} inventory={inventory} setup={setup} usageCounts={usageCounts} locked={editingEntry.isDefault === true} onInventoryChange={updateInventory} onSetupChange={updateSetup} />
    </div>
  </div>
  <dialog className="official-import-dialog" ref={officialImportDialogRef} onClose={() => setOfficialImportError("")}>
    <div className="official-import-heading"><div><span className="detail-kicker">Official Dashboard</span><h2>Import equipped gear</h2></div><button className="icon-button" type="button" aria-label="Close official import" onClick={() => officialImportDialogRef.current?.close()}><UiIcon name="close" /></button></div>
    <ol className="official-import-steps">
      <li>Drag <a className="button button-primary official-bookmarklet" ref={officialBookmarkletRef}>Export WWM Gear</a> to your browser bookmarks bar.</li>
      <li>Open the <a href="https://www.wherewindsmeetgame.com/m/2025h5sjgj/en/" target="_blank" rel="noreferrer">official Where Winds Meet dashboard</a> and log in.</li>
      <li>Click the saved bookmark. It copies your equipped gear data without copying your login token.</li>
      <li>Return here and paste the copied JSON below.</li>
    </ol>
    <textarea aria-label="Official dashboard gear JSON" placeholder="Paste the copied dashboard JSON here" value={officialImportText} onChange={(event) => { setOfficialImportText(event.target.value); setOfficialImportError(""); }} />
    {officialImportError && <p className="editor-error" role="alert">{officialImportError}</p>}
    <div className="official-import-actions"><button className="button button-secondary" type="button" onClick={() => officialImportDialogRef.current?.close()}>Cancel</button><button className="button button-primary" type="button" disabled={!officialImportText.trim()} onClick={importFromOfficial}>Import Gear</button></div>
    <p className="official-import-privacy">The bookmark runs only on the official dashboard. Where Builds Meet receives only the JSON you paste here.</p>
  </dialog>
  </section>;
}

function BuildSetupPanel({ setup, martialArtTags, pathTag, locked, onChange }: { setup: BuildSetup; martialArtTags: string[]; pathTag?: string; locked: boolean; onChange: (setup: BuildSetup) => void }) {
  function updateGearSet(setName: keyof BuildSetup["gearSets"], tier: 0 | 2 | 4) {
    const otherSet = setName === "Cleftpeak" ? "RainWhisper" : "Cleftpeak";
    onChange({ ...setup, gearSets: { ...setup.gearSets, [setName]: tier, [otherSet]: Math.min(setup.gearSets[otherSet], 4 - tier) as 0 | 2 | 4 } });
  }

  const lockedTitle = locked ? "Fixed by this default preset" : undefined;
  const innerWayOptions = Object.entries(innerWayDefinitions).filter(([, definition]) => !pathTag || definition.tags?.includes(pathTag));
  return <div className="build-setup-column" aria-label="Build setup">
    <section className="panel setup-placeholder-panel build-setup-panel">
      <div className="panel-heading"><div><h2>Inner Ways</h2></div></div>
      <div className="inner-way-list">
        {setup.innerWays.map((row, index) => <div className="inner-way-row" key={index}>
          <select aria-label={`Build inner way ${index + 1}`} value={innerWayOptions.some(([value]) => value === row.innerWay) ? row.innerWay : ""} disabled={locked} title={lockedTitle} onChange={(event) => onChange({ ...setup, innerWays: setup.innerWays.map((item, itemIndex) => itemIndex === index ? { ...item, innerWay: event.target.value } : item) })}>
            <option value="">None</option>
            {innerWayOptions.map(([value, definition]) => <option key={value} value={value} disabled={setup.innerWays.some((item, itemIndex) => itemIndex !== index && item.innerWay === value)}>{definition.name}</option>)}
          </select>
          <select aria-label={`Build inner way ${index + 1} tier`} value={row.tier} disabled={locked} title={lockedTitle} onChange={(event) => onChange({ ...setup, innerWays: setup.innerWays.map((item, itemIndex) => itemIndex === index ? { ...item, tier: event.target.value } : item) })}>
            {Array.from({ length: 7 }, (_, tier) => <option key={tier}>T{tier}</option>)}
          </select>
        </div>)}
      </div>
    </section>
    <section className="panel setup-placeholder-panel build-setup-panel">
      <div className="panel-heading"><div><h2>Gear Set</h2></div></div>
      <div className="gear-set-list">
        {Object.entries(gearSetDefinitions).filter(([, definition]) => (!pathTag || definition.tags.includes(pathTag)) && [...new Set(martialArtTags)].every((tag) => definition.tags.includes(tag))).map(([setName, definition]) => {
          const selectedTier = setup.gearSets[setName as keyof BuildSetup["gearSets"]];
          return <div className="setup-field" key={setName}><span>{definition.name}</span><div className="setup-option-control"><div className="setup-option-list">
            {[0, 2, 4].map((tier) => <button className={selectedTier === tier ? "selected" : ""} type="button" key={tier} disabled={locked} title={lockedTitle} onClick={() => updateGearSet(setName as keyof BuildSetup["gearSets"], tier as 0 | 2 | 4)}>{tier === 0 ? "0 piece" : `${tier} pieces`}</button>)}
          </div></div></div>;
        })}
      </div>
    </section>
    <section className="panel setup-placeholder-panel build-setup-panel">
      <div className="panel-heading"><div><h2>Bow/Ring Set</h2></div></div>
      <div className="setup-option-list setup-option-list-wide">
        {Object.entries(bowRingSetDefinitions).map(([value, definition]) => <button className={setup.bowRingSet === value ? "selected" : ""} type="button" key={value} disabled={locked} title={lockedTitle} onClick={() => onChange({ ...setup, bowRingSet: value })}>{definition.name}</button>)}
      </div>
    </section>
    <section className="panel setup-placeholder-panel build-setup-panel">
      <div className="panel-heading"><div><h2>Arsenal</h2></div></div>
      <div className="setup-option-list setup-option-list-arsenal">
        {Object.entries(arsenalDefinitions).map(([value, definition]) => <button className={setup.arsenal === value ? "selected" : ""} type="button" key={value} disabled={locked} title={lockedTitle} onClick={() => onChange({ ...setup, arsenal: value })}>{definition.name}</button>)}
      </div>
    </section>
  </div>;
}

function BuildManagement({ weapons, martialArtTags, pathTag, inventory, setup, usageCounts, locked, onInventoryChange, onSetupChange }: BuildManagementProps) {
  const [selectedSlot, setSelectedSlot] = useState<GearSlot>("leftWeapon");
  const [editing, setEditing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GearDraft>(newDraft);
  const [error, setError] = useState("");
  const selected = gearDefinitionForSlot(selectedSlot, weapons);
  const availableItems = inventory.items.filter((item) => item.definitionId === selected.definitionId && gearItemSupportsSlot(item, selectedSlot));
  const equippedItems = useMemo(() => Object.fromEntries(gearSlots.map((slot) => {
    const equippedId = inventory.equipped[slot];
    const item = inventory.items.find((candidate) => candidate.id === equippedId && gearItemSupportsSlot(candidate, slot));
    return [slot, item && (locked || isGearItemCompatible(item, slot, weapons)) ? item : undefined];
  })) as Partial<Record<GearSlot, GearItem>>, [inventory, weapons, locked]);

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

  function updateLevel(level: GearLevel) {
    setDraft((current) => capGearDraft({ ...current, level, baseAffix: blankValue(), additionalAffixes: Array.from({ length: 4 }, blankValue) }));
  }

  function save() {
    const definition = selected.definition;
    if (!definition) return;
    const baseAffix = normalizeDraftValue(draft.baseAffix, gearData.affixes, "affix", draft.relayed, draft.level);
    const additionalAffixDrafts = draft.additionalAffixes.filter((affix) => affix.key || affix.value.trim());
    const additionalAffixes = additionalAffixDrafts.map((affix) => normalizeDraftValue(affix, gearData.affixes, "affix", draft.relayed, draft.level));
    const hasAttunementDraft = Boolean(draft.attunement.key || draft.attunement.value.trim());
    const attunement = hasAttunementDraft ? normalizeDraftValue(draft.attunement, attunementData, "attunement", draft.relayed, draft.level) : undefined;
    if (!baseAffix) {
      setError("Choose a base affix and enter a non-negative value.");
      return;
    }
    if (additionalAffixes.some((affix) => !affix) || (hasAttunementDraft && !attunement)) {
      setError("Complete or clear each optional attribute.");
      return;
    }
    if (attunement && !attunementOptions.includes(attunement.key)) {
      setError("Choose an attunement available for the current path.");
      return;
    }
    const normalizedAdditional = additionalAffixes.filter((affix): affix is { key: string; value: number } => Boolean(affix));
    if (new Set(normalizedAdditional.map((affix) => affix.key)).size !== normalizedAdditional.length) {
      setError("Additional affixes cannot be duplicated.");
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
        ? current.items.map((candidate) => candidate.id === editingItemId ? item : candidate)
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

  const levelKey = String(draft.level);
  const baseAffixOptions = selected.definition?.baseAffixes[levelKey] ?? [];
  const additionalAffixOptions = selected.definition?.additionalAffixes[levelKey] ?? [];
  const attunementOptions = (selected.definition ? attunementsForGearDefinition(selected.definition) : []).filter((key) => {
    const tags = attunementData[key]?.tags ?? [];
    if (tags.includes("Weapon")) return true;
    return (!pathTag || tags.includes(pathTag)) && martialArtTags.some((tag) => tags.includes(tag));
  });
  const selectedAdditionalKeys = new Set(draft.additionalAffixes.map((affix) => affix.key).filter(Boolean));

  return <div className="build-page">
    <div className="build-overview-grid"><section className="panel build-equipped-panel">
      <div className="panel-heading"><div><h2>Equipped Gear</h2><p>{locked ? "This default build uses fixed preset gear. Use New Build to create your own build." : "Select a slot to equip gear from the shared inventory."}</p></div></div>
      <div className="equipped-gear-grid">
        {gearSlots.map((slot) => {
          const item = equippedItems[slot];
          const definition = item ? gearData.gear[item.definitionId] : gearDefinitionForSlot(slot, weapons).definition;
          return <button className={`equipped-gear-card ${!locked && selectedSlot === slot ? "selected" : ""}`} type="button" key={slot} disabled={locked} onClick={() => selectSlot(slot)} data-testid={`equipped-${slot}`}>
            <RelayedIndicator item={item} />
            <span className="gear-slot-name">{gearData.slots[slot]}</span>
            {item ? <><strong>{definition?.name}</strong><small>{item.level} {item.rarity}</small><GearBaseStatSummary item={item} /><GearAttributes item={item} compact /></> : <span className="gear-empty">No gear equipped</span>}
          </button>;
        })}
      </div>
    </section><BuildSetupPanel setup={setup} martialArtTags={martialArtTags} pathTag={pathTag} locked={locked} onChange={onSetupChange} /></div>

    {!locked && <section className="panel build-inventory-panel">
      <div className="panel-heading"><div><h2>{gearData.slots[selectedSlot]}</h2><p>Shared {selected.definition?.name ?? "gear"} inventory. Edits and deletions apply to every build.</p></div></div>
      <div className="available-gear-grid">
        {availableItems.map((item) => <article className={`available-gear-card ${inventory.equipped[selectedSlot] === item.id ? "equipped" : ""} ${item.relayed ? "relayed" : ""}`} key={item.id}>
          <RelayedIndicator item={item} />
          <div className="available-gear-heading"><div><strong>{selected.definition?.name}</strong><small>{item.level} {item.rarity}</small><GearBaseStatSummary item={item} /></div><div className="available-gear-status">{inventory.equipped[selectedSlot] === item.id && <span>Equipped</span>}<small>Used in {usageCounts.get(item.id) ?? 0} {(usageCounts.get(item.id) ?? 0) === 1 ? "build" : "builds"}</small></div></div>
          <GearAttributes item={item} />
          <div className="gear-card-actions">
            <button className="button button-primary button-small" type="button" disabled={inventory.equipped[selectedSlot] === item.id} onClick={() => equip(item)}>{inventory.equipped[selectedSlot] === item.id ? "Equipped" : "Equip"}</button>
            <button className="button button-secondary button-small" type="button" onClick={() => beginEdit(item)}>Edit</button>
            <button className={`button button-small ${pendingDeleteId === item.id ? "button-danger" : "button-secondary"}`} type="button" aria-label={pendingDeleteId === item.id ? "Confirm delete gear" : "Delete gear"} onClick={() => remove(item)}>{pendingDeleteId === item.id ? "Confirm Delete" : "Delete"}</button>
          </div>
        </article>)}
        <button className="add-gear-card" type="button" onClick={beginAdd} aria-label={`Add ${gearData.slots[selectedSlot]} gear`} data-testid="add-gear"><span><UiIcon name="plus" /></span><strong>Add gear</strong></button>
      </div>
    </section>}

    {!locked && editing && selected.definition && <GearEditor definition={selected.definition} definitionId={selected.definitionId} definitionName={selected.definition.name} editingExisting={editingItemId !== null} draft={draft} error={error} baseAffixOptions={baseAffixOptions} additionalAffixOptions={additionalAffixOptions} attunementOptions={attunementOptions} selectedAdditionalKeys={selectedAdditionalKeys} onDraftChange={setDraft} onLevelChange={updateLevel} onCancel={() => { setEditing(false); setEditingItemId(null); setError(""); }} onSave={save} />}
  </div>;
}

function GearEditor({ definition, definitionId, definitionName, editingExisting, draft, error, baseAffixOptions, additionalAffixOptions, attunementOptions, selectedAdditionalKeys, onDraftChange, onLevelChange, onCancel, onSave }: {
  definition: GearDefinition;
  definitionId: string;
  definitionName: string;
  editingExisting: boolean;
  draft: GearDraft;
  error: string;
  baseAffixOptions: string[];
  additionalAffixOptions: string[];
  attunementOptions: string[];
  selectedAdditionalKeys: Set<string>;
  onDraftChange: Dispatch<SetStateAction<GearDraft>>;
  onLevelChange: (level: GearLevel) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const ocrDialogRef = useRef<HTMLDialogElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrDragging, setOcrDragging] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrPreview, setOcrPreview] = useState("");

  useEffect(() => {
    const dialog = ocrDialogRef.current;
    if (!dialog) return;
    if (ocrOpen && !dialog.open) dialog.showModal();
    else if (!ocrOpen && dialog.open) dialog.close();
  }, [ocrOpen]);

  useEffect(() => () => {
    if (ocrPreview) URL.revokeObjectURL(ocrPreview);
  }, [ocrPreview]);

  const openOcr = () => {
    setOcrPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    if (ocrInputRef.current) ocrInputRef.current.value = "";
    setOcrError("");
    setOcrStatus("");
    setOcrProgress(0);
    setOcrDragging(false);
    setOcrOpen(true);
  };
  const closeOcr = () => {
    if (!ocrBusy) setOcrOpen(false);
  };
  const importImage = async (file?: File) => {
    if (!file || ocrBusy) return;
    if (file.size > 15 * 1024 * 1024) {
      setOcrError("The image is larger than 15 MB. Crop or resize it and try again.");
      return;
    }
    setOcrError("");
    setOcrBusy(true);
    setOcrStatus("Loading OCR model");
    setOcrProgress(0);
    setOcrPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    try {
      const result = await recognizeGearImage(file, (progress, status) => {
        setOcrProgress(Math.max(0, Math.min(1, progress)));
        setOcrStatus(status);
      });
      if (result.definitionId !== definitionId) {
        const recognizedName = gearData.gear[result.definitionId]?.name ?? result.definitionId;
        throw new Error(`This image contains ${recognizedName}, but the current editor expects ${definitionName}. Open the matching gear slot and try again.`);
      }
      onDraftChange((current) => capGearDraft({
        ...current,
        level: result.level,
        rarity: result.rarity,
        relayed: result.relayed,
        baseAffix: savedValueToDraft(result.baseAffix, gearData.affixes),
        additionalAffixes: result.additionalAffixes.map((affix) => savedValueToDraft(affix, gearData.affixes)),
        attunement: savedValueToDraft(result.attunement, attunementData),
      }));
      setOcrOpen(false);
    } catch (caught) {
      setOcrError(caught instanceof Error ? caught.message : "The image could not be imported.");
    } finally {
      setOcrBusy(false);
      setOcrStatus("");
    }
  };
  const selectOcrFile = (event: ChangeEvent<HTMLInputElement>) => {
    void importImage(event.target.files?.[0]);
    event.target.value = "";
  };
  const dropOcrFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOcrDragging(false);
    void importImage(event.dataTransfer.files?.[0]);
  };
  const pasteOcrImage = (event: ReactClipboardEvent<HTMLDialogElement>) => {
    const clipboardFile = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile()
      ?? Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (!clipboardFile) {
      setOcrError("The clipboard does not contain an image. Copy a screenshot and paste again.");
      return;
    }
    event.preventDefault();
    void importImage(clipboardFile);
  };
  const maxValue = (value: GearValueDraft, definitions: Record<string, GearValueDefinition>, category: "affix" | "attunement", relayed: boolean, level: GearLevel) => {
    const roll = maxGearRoll(value.key, category, relayed, level);
    return typeof roll === "number" ? savedValueToDraft({ key: value.key, value: roll }, definitions) : value;
  };
  const applyMax = () => onDraftChange((current) => {
    return {
      ...current,
      baseAffix: maxValue(current.baseAffix, gearData.affixes, "affix", current.relayed, current.level),
      additionalAffixes: current.additionalAffixes.map((affix) => maxValue(affix, gearData.affixes, "affix", current.relayed, current.level)),
      attunement: maxValue(current.attunement, attunementData, "attunement", current.relayed, current.level),
    };
  });
  return <section className="panel gear-editor-panel" data-testid="gear-editor">
    <div className="panel-heading"><div><h2>{editingExisting ? "Edit" : "Add"} {definitionName}</h2><p>Percentage values are entered as percentage points.</p></div>{!editingExisting && <button className="button button-secondary button-small" type="button" onClick={openOcr}>Import from Image</button>}</div>
    <div className="gear-editor-meta">
      <label className="editor-field"><span>Level</span><select value={draft.level} onChange={(event) => onLevelChange(Number(event.target.value) as GearLevel)}><option value={96}>96</option><option value={91}>91</option></select></label>
      <label className="editor-field"><span>Rarity</span><select value={draft.rarity} onChange={(event) => onDraftChange((current) => ({ ...current, rarity: event.target.value as GearRarity }))}><option>Gold</option><option>Purple</option></select></label>
      <div className="gear-editor-roll-controls"><label className="gear-relayed-toggle"><input type="checkbox" checked={draft.relayed} onChange={(event) => { const relayed = event.target.checked; onDraftChange((current) => capGearDraft(current, relayed)); }} /><span>Relayed</span></label><button className="button button-secondary button-small" type="button" onClick={applyMax}>Max</button></div>
    </div>
    <div className="gear-editor-sections">
      <div><h3>Base affix</h3><GearValueEditor label="Base affix" value={draft.baseAffix} options={baseAffixOptions} definitions={gearData.affixes} category="affix" relayed={draft.relayed} level={draft.level} onChange={(baseAffix) => onDraftChange((current) => ({ ...current, baseAffix }))} /></div>
      <div><h3>Additional affixes (optional)</h3><div className="gear-additional-affixes">{draft.additionalAffixes.map((affix, index) => <GearValueEditor key={index} label={`Additional affix ${index + 1}`} value={affix} options={additionalAffixOptions} definitions={gearData.affixes} category="affix" relayed={draft.relayed} level={draft.level} disabledKeys={selectedAdditionalKeys} onChange={(nextAffix) => onDraftChange((current) => ({ ...current, additionalAffixes: current.additionalAffixes.map((currentAffix, currentIndex) => currentIndex === index ? nextAffix : currentAffix) }))} />)}</div></div>
      <div><h3>Attunement (optional)</h3><GearValueEditor label="Attunement" value={draft.attunement} options={attunementOptions} definitions={attunementData} category="attunement" relayed={draft.relayed} level={draft.level} onChange={(attunement) => onDraftChange((current) => ({ ...current, attunement }))} /></div>
    </div>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="button button-primary" type="button" onClick={onSave}>{editingExisting ? "Save Changes" : "Save"}</button></div>
    <dialog className="gear-ocr-dialog" ref={ocrDialogRef} onPaste={pasteOcrImage} onCancel={(event) => { if (ocrBusy) event.preventDefault(); }} onClose={() => setOcrOpen(false)}>
      <div className="gear-ocr-heading"><div><h2>Import {definitionName} from image</h2><p>Use a clear, uncropped gear details screenshot. Recognition runs locally in your browser.</p></div><button className="button button-secondary button-small" type="button" disabled={ocrBusy} onClick={closeOcr}>Close</button></div>
      <div className="gear-ocr-grid">
        <div className={`gear-ocr-dropzone ${ocrDragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setOcrDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOcrDragging(false); }} onDrop={dropOcrFile}>
          {ocrPreview ? <img src={ocrPreview} alt="Selected gear screenshot" /> : <div><strong>Drop a screenshot or directly paste</strong><span>Press Ctrl+V, or use PNG, JPEG, or WebP; up to 15 MB</span></div>}
          <input ref={ocrInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={selectOcrFile} hidden />
          <button className="button button-primary" type="button" disabled={ocrBusy} onClick={() => ocrInputRef.current?.click()}>{ocrPreview ? "Choose another image" : "Choose image"}</button>
        </div>
        <figure className="gear-ocr-example"><img src={`${import.meta.env.BASE_URL}ocr/mo-blade-example.png`} alt="Example Mo Blade gear details screenshot" /><figcaption>Example: include the rarity color, gear type, tier, every affix, and attunement.</figcaption></figure>
      </div>
      {ocrBusy && <div className="gear-ocr-progress" aria-live="polite"><div><span>{ocrStatus || "Reading image"}</span><span>{Math.round(ocrProgress * 100)}%</span></div><progress max={1} value={ocrProgress} /></div>}
      {ocrError && <p className="editor-error gear-ocr-error" role="alert">{ocrError}</p>}
    </dialog>
  </section>;
}
