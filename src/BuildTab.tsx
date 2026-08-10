import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  gearBaseStats,
  gearData,
  gearDefinitionForSlot,
  gearSlots,
  isGearItemCompatible,
  resolveBuildInventory,
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
  locked: boolean;
  onInventoryChange: Dispatch<SetStateAction<GearInventory>>;
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
  const attunementDefinition = gearData.attunements[item.attunement.key];
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
    attunement: savedValueToDraft(item.attunement, gearData.attunements),
  };
}

export default function BuildTab({ weapons, buildState, onBuildStateChange }: BuildTabProps) {
  const [editingBuildId, setEditingBuildId] = useState(buildState.activeBuildId);
  const [editingName, setEditingName] = useState(false);
  const editingEntry = buildState.entries.find((entry) => entry.id === editingBuildId) ?? buildState.entries[0];
  if (!editingEntry) return null;
  const inventory = resolveBuildInventory(editingEntry);

  function updateInventory(update: SetStateAction<GearInventory>) {
    if (editingEntry.isDefault) return;
    onBuildStateChange((current) => ({
      ...current,
      entries: current.entries.map((entry) => {
        if (entry.id !== editingEntry.id) return entry;
        const currentInventory = entry.inventory ?? { items: [], equipped: {} };
        return { ...entry, inventory: typeof update === "function" ? update(currentInventory) : update };
      }),
    }));
  }

  function renameBuild(name: string) {
    onBuildStateChange((current) => ({ ...current, entries: current.entries.map((entry) => entry.id === editingEntry.id ? { ...entry, name } : entry) }));
  }

  function addBuild() {
    const id = `build-${Date.now()}`;
    onBuildStateChange((current) => ({ ...current, entries: [...current.entries, { id, name: "New Build", inventory: { items: [], equipped: {} } }] }));
    setEditingBuildId(id);
    setEditingName(true);
  }

  function activateBuild() {
    onBuildStateChange((current) => ({ ...current, activeBuildId: editingEntry.id }));
  }

  function removeBuild(id: string) {
    const entry = buildState.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.isDefault || !window.confirm(`Delete build "${entry.name}"?`)) return;
    const remaining = buildState.entries.filter((candidate) => candidate.id !== id);
    const fallback = remaining.find((candidate) => candidate.isDefault) ?? remaining[0];
    onBuildStateChange((current) => ({
      entries: current.entries.filter((candidate) => candidate.id !== id),
      activeBuildId: current.activeBuildId === id ? fallback?.id ?? "" : current.activeBuildId,
    }));
    if (editingBuildId === id) setEditingBuildId(fallback?.id ?? "");
  }

  return <section className="panel build-manager-panel"><div className="build-manager-layout">
    <aside className="build-list">
      <div className="build-list-heading"><span>Builds</span><button className="icon-button" type="button" aria-label="Add build" onClick={addBuild}>＋</button></div>
      {buildState.entries.map((entry) => <div className={`build-list-item ${entry.id === buildState.activeBuildId ? "active" : ""} ${entry.id === editingBuildId ? "editing" : ""}`} key={entry.id} role="button" tabIndex={0} onClick={() => { setEditingBuildId(entry.id); setEditingName(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { setEditingBuildId(entry.id); setEditingName(false); } }}>
        <span><strong>{entry.id === buildState.activeBuildId && <i className="active-build-icon" title="Active build">●</i>}{entry.name || "Unnamed Build"}</strong>{entry.isDefault && <small>Default preset</small>}</span>
        <button className="build-remove-button" type="button" aria-label={`Remove ${entry.name || "build"}`} disabled={entry.isDefault} onClick={(event) => { event.stopPropagation(); removeBuild(entry.id); }}>×</button>
      </div>)}
    </aside>
    <div className="build-editor-content">
      <div className="build-detail-heading"><div><span className="detail-kicker">Build</span>{editingName ? <input className="build-name-input" autoFocus value={editingEntry.name} onChange={(event) => renameBuild(event.target.value)} onBlur={() => setEditingName(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingName(false); }} /> : <h3>{editingEntry.name || "Unnamed Build"}<button className="icon-button" type="button" aria-label="Edit build name" onClick={() => setEditingName(true)}>✎</button></h3>}</div>
        <button className="button button-small build-active-button" type="button" disabled={editingEntry.id === buildState.activeBuildId} onClick={activateBuild}>{editingEntry.id === buildState.activeBuildId ? "Active Build" : "Make Active"}</button>
      </div>
      <BuildManagement key={editingEntry.id} weapons={weapons} inventory={inventory} locked={editingEntry.isDefault === true} onInventoryChange={updateInventory} />
    </div>
  </div></section>;
}

function BuildManagement({ weapons, inventory, locked, onInventoryChange }: BuildManagementProps) {
  const [selectedSlot, setSelectedSlot] = useState<GearSlot>("leftWeapon");
  const [editing, setEditing] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GearDraft>(newDraft);
  const [error, setError] = useState("");
  const selected = gearDefinitionForSlot(selectedSlot, weapons);
  const availableItems = inventory.items.filter((item) => item.slot === selectedSlot && item.definitionId === selected.definitionId);
  const equippedItems = useMemo(() => Object.fromEntries(gearSlots.map((slot) => {
    const equippedId = inventory.equipped[slot];
    const item = inventory.items.find((candidate) => candidate.id === equippedId && candidate.slot === slot);
    return [slot, item && (locked || isGearItemCompatible(item, weapons)) ? item : undefined];
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
    const attunement = normalizeDraftValue(draft.attunement, gearData.attunements);
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
      slot: selectedSlot,
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
    onInventoryChange((current) => ({ ...current, equipped: { ...current.equipped, [item.slot]: item.id } }));
  }

  function remove(item: GearItem) {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      return;
    }
    onInventoryChange((current) => ({
      items: current.items.filter((candidate) => candidate.id !== item.id),
      equipped: current.equipped[item.slot] === item.id ? { ...current.equipped, [item.slot]: undefined } : current.equipped,
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
    <section className="panel build-equipped-panel">
      <div className="panel-heading"><div><h2>Equipped Gear</h2><p>{locked ? "This default build uses fixed preset gear." : "Select a slot to manage its saved gear."}</p></div></div>
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
    </section>

    {!locked && <section className="panel build-inventory-panel">
      <div className="panel-heading"><div><h2>{gearData.slots[selectedSlot]}</h2><p>Available {selected.definition?.name ?? "gear"}</p></div></div>
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
      <div><h3>Attunement</h3><GearValueEditor label="Attunement" value={draft.attunement} options={definition.attunements} definitions={gearData.attunements} onChange={(attunement) => onDraftChange((current) => ({ ...current, attunement }))} /></div>
    </div>
    {error && <p className="editor-error" role="alert">{error}</p>}
    <div className="editor-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="button button-primary" type="button" onClick={onSave}>{editingExisting ? "Save Changes" : "Save"}</button></div>
  </section>;
}
