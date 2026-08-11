import { useMemo, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import arsenalDefinitions from "../data/arsenal.json";
import bowRingSetDefinitions from "../data/bow-ring-set.json";
import gearSetDefinitions from "../data/gear-set.json";
import {
  defaultBuildSetup,
  attunementData,
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

type GearValueDraft = { key: string; value: string };
type GearDraft = {
  level: GearLevel;
  rarity: GearRarity;
  baseAffix: GearValueDraft;
  additionalAffixes: GearValueDraft[];
  attunement: GearValueDraft;
};

type BuildTabProps = {
  weapons: [WeaponId, WeaponId];
  buildState: BuildState;
  onBuildStateChange: Dispatch<SetStateAction<BuildState>>;
};

type BuildManagementProps = {
  weapons: [WeaponId, WeaponId];
  inventory: GearInventory;
  setup: BuildSetup;
  locked: boolean;
  onInventoryChange: Dispatch<SetStateAction<GearInventory>>;
  onSetupChange: (setup: BuildSetup) => void;
};

const blankValue = (): GearValueDraft => ({ key: "", value: "" });
const newDraft = (): GearDraft => ({
  level: 96,
  rarity: "Gold",
  baseAffix: blankValue(),
  additionalAffixes: Array.from({ length: 4 }, blankValue),
  attunement: blankValue(),
});

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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
  const attunementDefinition = attunementData[item.attunement.key];
  rows.push({ label: attunementDefinition?.name ?? item.attunement.key, value: displayValue(item.attunement.value, attunementDefinition), kind: "Attunement" });
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

function GearValueEditor({ label, value, options, definitions, disabledKeys = new Set(), onChange }: {
  label: string;
  value: GearValueDraft;
  options: string[];
  definitions: Record<string, GearValueDefinition>;
  disabledKeys?: Set<string>;
  onChange: (next: GearValueDraft) => void;
}) {
  const selectedDefinition = definitions[value.key];
  return <div className="gear-value-editor">
    <label><span>{label}</span><select aria-label={`${label} type`} value={value.key} onChange={(event) => onChange({ ...value, key: event.target.value })}>
      <option value="">Select an attribute</option>
      {options.map((key) => <option key={key} value={key} disabled={key !== value.key && disabledKeys.has(key)}>{definitions[key]?.name ?? key}</option>)}
    </select></label>
    <label className="gear-value-input"><span>Value</span><span><input aria-label={`${label} value`} type="number" min="0" step="0.01" value={value.value} onChange={(event) => onChange({ ...value, value: event.target.value })} />{selectedDefinition?.percentage && <i>%</i>}</span></label>
  </div>;
}

function createGearId() {
  return globalThis.crypto?.randomUUID?.() ?? `gear-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeDraftValue(draft: GearValueDraft, definitions: Record<string, GearValueDefinition>) {
  const definition = definitions[draft.key];
  const value = Number(draft.value);
  if (!definition || !draft.value.trim() || !Number.isFinite(value) || value < 0) return undefined;
  return { key: draft.key, value: definition.percentage ? value / 100 : value };
}

function savedValueToDraft(value: { key: string; value: number }, definitions: Record<string, GearValueDefinition>): GearValueDraft {
  return {
    key: value.key,
    value: formatNumber(definitions[value.key]?.percentage ? value.value * 100 : value.value),
  };
}

function itemToDraft(item: GearItem): GearDraft {
  return {
    level: item.level,
    rarity: item.rarity,
    baseAffix: savedValueToDraft(item.baseAffix, gearData.affixes),
    additionalAffixes: item.additionalAffixes.map((affix) => savedValueToDraft(affix, gearData.affixes)),
    attunement: savedValueToDraft(item.attunement, attunementData),
  };
}

export default function BuildTab({ weapons, buildState, onBuildStateChange }: BuildTabProps) {
  const [editingBuildId, setEditingBuildId] = useState(buildState.activeBuildId);
  const [editingName, setEditingName] = useState(false);
  const [transferStatus, setTransferStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const editingEntry = buildState.entries.find((entry) => entry.id === editingBuildId) ?? buildState.entries[0];
  if (!editingEntry) return null;
  const inventory = resolveBuildInventory(editingEntry, buildState.gearItems);
  const setup = resolveBuildSetup(editingEntry);

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

  function addBuild() {
    const id = `build-${Date.now()}`;
    onBuildStateChange((current) => ({ ...current, entries: [...current.entries, { id, name: "New Build", equipped: {}, setup: normalizeBuildSetup(defaultBuildSetup) }] }));
    setEditingBuildId(id);
    setEditingName(true);
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
    const remaining = buildState.entries.filter((candidate) => candidate.id !== id);
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

  return <section className="panel build-manager-panel"><div className="build-manager-layout">
    <aside className="build-list">
      <div className="build-list-heading"><span>Builds</span><button className="icon-button" type="button" aria-label="Add build" onClick={addBuild}>＋</button></div>
      <div className="build-list-entries">{buildState.entries.map((entry) => <div className={`build-list-item ${entry.id === buildState.activeBuildId ? "active" : ""} ${entry.id === editingBuildId ? "editing" : ""}`} key={entry.id} role="button" tabIndex={0} onClick={() => { setEditingBuildId(entry.id); setEditingName(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setEditingBuildId(entry.id); setEditingName(false); } }}>
          <span><strong>{entry.id === buildState.activeBuildId && <i className="active-build-icon" title="Active build">●</i>}{entry.name || "Unnamed Build"}</strong>{entry.isDefault && <small>Default preset</small>}</span>
          {!entry.isDefault && <button className="build-remove-button" type="button" aria-label={`Remove ${entry.name || "build"}`} onClick={(event) => { event.stopPropagation(); removeBuild(entry.id); }}>×</button>}
        </div>)}</div>
      <div className="build-transfer-actions">
        <div><button className="button button-secondary button-small" type="button" onClick={exportBuilds}>Export</button><label className="button button-secondary button-small build-import-button">Import<input type="file" accept="application/json,.json" aria-label="Import builds and gear" onChange={importBuilds} /></label></div>
        {transferStatus && <p className={transferStatus.error ? "error" : ""} role={transferStatus.error ? "alert" : "status"}>{transferStatus.message}</p>}
      </div>
    </aside>
    <div className="build-editor-content">
      <div className="build-detail-heading"><div><span className="detail-kicker">Build</span>{editingName ? <input className="build-name-input" autoFocus value={editingEntry.name} onChange={(event) => renameBuild(event.target.value)} onBlur={() => setEditingName(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingName(false); }} /> : <h3>{editingEntry.name || "Unnamed Build"}<button className="icon-button" type="button" aria-label="Edit build name" onClick={() => setEditingName(true)}>✎</button></h3>}</div>
        <button className="button button-small detail-active-button" type="button" disabled={editingEntry.id === buildState.activeBuildId} onClick={activateBuild}>{editingEntry.id === buildState.activeBuildId ? "Active" : "Make Active"}</button>
      </div>
      <BuildManagement key={editingEntry.id} weapons={weapons} inventory={inventory} setup={setup} locked={editingEntry.isDefault === true} onInventoryChange={updateInventory} onSetupChange={updateSetup} />
    </div>
  </div></section>;
}

function BuildSetupPanel({ setup, locked, onChange }: { setup: BuildSetup; locked: boolean; onChange: (setup: BuildSetup) => void }) {
  function updateGearSet(setName: keyof BuildSetup["gearSets"], tier: 0 | 2 | 4) {
    const otherSet = setName === "Cleftpeak" ? "RainWhisper" : "Cleftpeak";
    onChange({ ...setup, gearSets: { ...setup.gearSets, [setName]: tier, [otherSet]: Math.min(setup.gearSets[otherSet], 4 - tier) as 0 | 2 | 4 } });
  }

  const lockedTitle = locked ? "Fixed by this default preset" : undefined;
  return <div className="build-setup-column" aria-label="Build setup">
    <section className="panel setup-placeholder-panel build-setup-panel">
      <div className="panel-heading"><div><h2>Gear Set</h2></div></div>
      <div className="gear-set-list">
        {Object.entries(gearSetDefinitions).map(([setName, definition]) => {
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
      <div className="setup-option-list setup-option-list-wide">
        {Object.entries(arsenalDefinitions).map(([value, definition]) => <button className={setup.arsenal === value ? "selected" : ""} type="button" key={value} disabled={locked} title={lockedTitle} onClick={() => onChange({ ...setup, arsenal: value })}>{definition.name}</button>)}
      </div>
    </section>
  </div>;
}

function BuildManagement({ weapons, inventory, setup, locked, onInventoryChange, onSetupChange }: BuildManagementProps) {
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
    setDraft((current) => ({ ...current, level, baseAffix: blankValue(), additionalAffixes: Array.from({ length: 4 }, blankValue) }));
  }

  function save() {
    const definition = selected.definition;
    if (!definition) return;
    const baseAffix = normalizeDraftValue(draft.baseAffix, gearData.affixes);
    const additionalAffixes = draft.additionalAffixes.map((affix) => normalizeDraftValue(affix, gearData.affixes));
    const attunement = normalizeDraftValue(draft.attunement, attunementData);
    if (!baseAffix || additionalAffixes.some((affix) => !affix) || !attunement) {
      setError("Choose every attribute and enter a non-negative value.");
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
      baseAffix,
      additionalAffixes: normalizedAdditional,
      attunement,
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
  const selectedAdditionalKeys = new Set(draft.additionalAffixes.map((affix) => affix.key).filter(Boolean));

  return <div className="build-page">
    <div className="build-overview-grid"><section className="panel build-equipped-panel">
      <div className="panel-heading"><div><h2>Equipped Gear</h2><p>{locked ? "This default build uses fixed preset gear." : "Select a slot to equip gear from the shared inventory."}</p></div></div>
      <div className="equipped-gear-grid">
        {gearSlots.map((slot) => {
          const item = equippedItems[slot];
          const definition = item ? gearData.gear[item.definitionId] : gearDefinitionForSlot(slot, weapons).definition;
          return <button className={`equipped-gear-card ${!locked && selectedSlot === slot ? "selected" : ""}`} type="button" key={slot} disabled={locked} onClick={() => selectSlot(slot)} data-testid={`equipped-${slot}`}>
            <span className="gear-slot-name">{gearData.slots[slot]}</span>
            {item ? <><strong>{definition?.name}</strong><small>{item.level} {item.rarity}</small><GearBaseStatSummary item={item} /><GearAttributes item={item} compact /></> : <span className="gear-empty">No gear equipped</span>}
          </button>;
        })}
      </div>
    </section><BuildSetupPanel setup={setup} locked={locked} onChange={onSetupChange} /></div>

    {!locked && <section className="panel build-inventory-panel">
      <div className="panel-heading"><div><h2>{gearData.slots[selectedSlot]}</h2><p>Shared {selected.definition?.name ?? "gear"} inventory. Edits and deletions apply to every build.</p></div></div>
      <div className="available-gear-grid">
        {availableItems.map((item) => <article className={`available-gear-card ${inventory.equipped[selectedSlot] === item.id ? "equipped" : ""}`} key={item.id}>
          <div className="available-gear-heading"><div><strong>{selected.definition?.name}</strong><small>{item.level} {item.rarity}</small><GearBaseStatSummary item={item} /></div>{inventory.equipped[selectedSlot] === item.id && <span>Equipped</span>}</div>
          <GearAttributes item={item} />
          <div className="gear-card-actions">
            <button className="button button-primary button-small" type="button" disabled={inventory.equipped[selectedSlot] === item.id} onClick={() => equip(item)}>{inventory.equipped[selectedSlot] === item.id ? "Equipped" : "Equip"}</button>
            <button className="button button-secondary button-small" type="button" onClick={() => beginEdit(item)}>Edit</button>
            <button className={`button button-small ${pendingDeleteId === item.id ? "button-danger" : "button-secondary"}`} type="button" aria-label={pendingDeleteId === item.id ? "Confirm delete gear" : "Delete gear"} onClick={() => remove(item)}>{pendingDeleteId === item.id ? "Confirm Delete" : "Delete"}</button>
          </div>
        </article>)}
        <button className="add-gear-card" type="button" onClick={beginAdd} aria-label={`Add ${gearData.slots[selectedSlot]} gear`} data-testid="add-gear"><span>+</span><strong>Add gear</strong></button>
      </div>
    </section>}

    {!locked && editing && selected.definition && <GearEditor definition={selected.definition} definitionName={selected.definition.name} editingExisting={editingItemId !== null} draft={draft} error={error} baseAffixOptions={baseAffixOptions} additionalAffixOptions={additionalAffixOptions} selectedAdditionalKeys={selectedAdditionalKeys} onDraftChange={setDraft} onLevelChange={updateLevel} onCancel={() => { setEditing(false); setEditingItemId(null); setError(""); }} onSave={save} />}
  </div>;
}

function GearEditor({ definition, definitionName, editingExisting, draft, error, baseAffixOptions, additionalAffixOptions, selectedAdditionalKeys, onDraftChange, onLevelChange, onCancel, onSave }: {
  definition: GearDefinition;
  definitionName: string;
  editingExisting: boolean;
  draft: GearDraft;
  error: string;
  baseAffixOptions: string[];
  additionalAffixOptions: string[];
  selectedAdditionalKeys: Set<string>;
  onDraftChange: Dispatch<SetStateAction<GearDraft>>;
  onLevelChange: (level: GearLevel) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return <section className="panel gear-editor-panel" data-testid="gear-editor">
    <div className="panel-heading"><div><h2>{editingExisting ? "Edit" : "Add"} {definitionName}</h2><p>Percentage values are entered as percentage points.</p></div></div>
    <div className="gear-editor-meta">
      <label className="editor-field"><span>Level</span><select value={draft.level} onChange={(event) => onLevelChange(Number(event.target.value) as GearLevel)}><option value={96}>96</option><option value={91}>91</option></select></label>
      <label className="editor-field"><span>Rarity</span><select value={draft.rarity} onChange={(event) => onDraftChange((current) => ({ ...current, rarity: event.target.value as GearRarity }))}><option>Gold</option><option>Purple</option></select></label>
    </div>
    <div className="gear-editor-sections">
      <div><h3>Base affix</h3><GearValueEditor label="Base affix" value={draft.baseAffix} options={baseAffixOptions} definitions={gearData.affixes} onChange={(baseAffix) => onDraftChange((current) => ({ ...current, baseAffix }))} /></div>
      <div><h3>Additional affixes</h3><div className="gear-additional-affixes">{draft.additionalAffixes.map((affix, index) => <GearValueEditor key={index} label={`Additional affix ${index + 1}`} value={affix} options={additionalAffixOptions} definitions={gearData.affixes} disabledKeys={selectedAdditionalKeys} onChange={(nextAffix) => onDraftChange((current) => ({ ...current, additionalAffixes: current.additionalAffixes.map((currentAffix, currentIndex) => currentIndex === index ? nextAffix : currentAffix) }))} />)}</div></div>
      <div><h3>Attunement</h3><GearValueEditor label="Attunement" value={draft.attunement} options={definition.attunements} definitions={attunementData} onChange={(attunement) => onDraftChange((current) => ({ ...current, attunement }))} /></div>
    </div>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="button button-primary" type="button" onClick={onSave}>{editingExisting ? "Save Changes" : "Save"}</button></div>
  </section>;
}
