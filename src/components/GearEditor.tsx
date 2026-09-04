import { useState, type Dispatch, type SetStateAction } from "react";
import { GearOcrModal } from "./GearOcrModal";
import {
  affixOptionsForGearDefinition,
  attunementData,
  clampGearRoll,
  gearData,
  maxGearRoll,
  type GearDefinition,
  type GearItem,
  type GearLevel,
  type GearRarity,
  type GearValueDefinition,
} from "../gear";
import type { GearOcrResult } from "../gearOcr";
import { gameText, t } from "../i18n";

export type GearValueDraft = { key: string; value: string };

export function gearRarityLabel(rarity: GearRarity) {
  return rarity === "Gold" ? t("system.gearRarity.gold") : t("system.gearRarity.purple");
}

export type GearDraft = {
  level: GearLevel;
  rarity: GearRarity;
  relayed: boolean;
  baseAffix: GearValueDraft;
  additionalAffixes: GearValueDraft[];
  attunement: GearValueDraft;
};

export const blankValue = (): GearValueDraft => ({ key: "", value: "" });
export const newDraft = (): GearDraft => ({
  level: 96,
  rarity: "Gold",
  relayed: false,
  baseAffix: blankValue(),
  additionalAffixes: Array.from({ length: 4 }, blankValue),
  attunement: blankValue(),
});

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}

function draftRollCap(
  key: string,
  definitions: Record<string, GearValueDefinition>,
  category: "affix" | "attunement",
  relayed: boolean,
  level: GearLevel,
) {
  const maximum = maxGearRoll(key, category, relayed, level);
  if (typeof maximum !== "number") return undefined;
  return definitions[key]?.percentage ? maximum * 100 : maximum;
}

function capDraftValue(
  value: GearValueDraft,
  definitions: Record<string, GearValueDefinition>,
  category: "affix" | "attunement",
  relayed: boolean,
  level: GearLevel,
) {
  const maximum = draftRollCap(value.key, definitions, category, relayed, level);
  const numericValue = Number(value.value);
  if (maximum === undefined || !value.value.trim() || !Number.isFinite(numericValue) || numericValue <= maximum)
    return value;
  return { ...value, value: formatNumber(maximum) };
}

export function capGearDraft(draft: GearDraft, relayed = draft.relayed): GearDraft {
  return {
    ...draft,
    relayed,
    baseAffix: capDraftValue(draft.baseAffix, gearData.affixes, "affix", relayed, draft.level),
    additionalAffixes: draft.additionalAffixes.map((affix) =>
      capDraftValue(affix, gearData.affixes, "affix", relayed, draft.level),
    ),
    attunement: capDraftValue(draft.attunement, attunementData, "attunement", relayed, draft.level),
  };
}

export function capAndFilterGearDraft(
  draft: GearDraft,
  definition: GearDefinition | undefined,
  relayed = draft.relayed,
): GearDraft {
  const capped = capGearDraft(draft, relayed);
  if (!definition) return capped;
  const allowedBase = affixOptionsForGearDefinition(definition, "baseAffixes", capped.level, capped.relayed);
  const allowedAdditional = affixOptionsForGearDefinition(
    definition,
    "additionalAffixes",
    capped.level,
    capped.relayed,
  );
  return {
    ...capped,
    baseAffix: allowedBase.includes(capped.baseAffix.key) ? capped.baseAffix : blankValue(),
    additionalAffixes: capped.additionalAffixes.map((affix) =>
      allowedAdditional.includes(affix.key) ? affix : blankValue(),
    ),
  };
}

function GearValueEditor({
  label,
  value,
  options,
  definitions,
  category,
  relayed,
  level,
  disabledKeys = new Set(),
  onChange,
}: {
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
  return (
    <div className="gear-value-editor">
      <label>
        <span>{label}</span>
        <select
          aria-label={t("ui.buildTab.namedType", { name: label })}
          value={value.key}
          onChange={(event) =>
            onChange(capDraftValue({ ...value, key: event.target.value }, definitions, category, relayed, level))
          }
        >
          <option value="">{t("ui.buildTab.selectAnAttribute")}</option>
          {options.map((key) => (
            <option key={key} value={key} disabled={key !== value.key && disabledKeys.has(key)}>
              {gameText(definitions[key]?.name ?? key)}
            </option>
          ))}
        </select>
      </label>
      <label className="gear-value-input">
        <span>{t("ui.buildTab.value")}</span>
        <span>
          <input
            aria-label={t("ui.buildTab.namedValue", { name: label })}
            type="number"
            min="0"
            max={maximum}
            step="0.01"
            value={value.value}
            onChange={(event) =>
              onChange(capDraftValue({ ...value, value: event.target.value }, definitions, category, relayed, level))
            }
          />
          {selectedDefinition?.percentage && <i>%</i>}
        </span>
      </label>
    </div>
  );
}

export function createGearId() {
  return globalThis.crypto?.randomUUID?.() ?? `gear-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeDraftValue(
  draft: GearValueDraft,
  definitions: Record<string, GearValueDefinition>,
  category: "affix" | "attunement",
  relayed: boolean,
  level: GearLevel,
) {
  const definition = definitions[draft.key];
  const value = Number(draft.value);
  if (!definition || !draft.value.trim() || !Number.isFinite(value) || value < 0) return undefined;
  const storedValue = definition.percentage ? value / 100 : value;
  return { key: draft.key, value: clampGearRoll(draft.key, storedValue, category, relayed, level) };
}

export function savedValueToDraft(
  value: { key: string; value: number },
  definitions: Record<string, GearValueDefinition>,
): GearValueDraft {
  return {
    key: value.key,
    value: formatNumber(definitions[value.key]?.percentage ? value.value * 100 : value.value),
  };
}

export function itemToDraft(item: GearItem): GearDraft {
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

export function GearEditor({
  definition,
  definitionId,
  definitionName,
  editingExisting,
  draft,
  error,
  baseAffixOptions,
  additionalAffixOptions,
  attunementOptions,
  selectedAdditionalKeys,
  onDraftChange,
  onLevelChange,
  onRelayedChange,
  onCancel,
  onSave,
}: {
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
  onRelayedChange: (relayed: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [ocrOpen, setOcrOpen] = useState(false);

  const importOcrResult = (result: GearOcrResult) => {
    const importedAdditional = result.additionalAffixes
      .slice(0, 4)
      .map((affix) => savedValueToDraft(affix, gearData.affixes));
    onDraftChange((current) =>
      capGearDraft({
        ...current,
        level: result.level,
        rarity: result.rarity,
        relayed: result.relayed,
        baseAffix: result.baseAffix ? savedValueToDraft(result.baseAffix, gearData.affixes) : blankValue(),
        additionalAffixes: [
          ...importedAdditional,
          ...Array.from({ length: 4 - importedAdditional.length }, blankValue),
        ],
        attunement: result.attunement ? savedValueToDraft(result.attunement, attunementData) : blankValue(),
      }),
    );
  };
  const maxValue = (
    value: GearValueDraft,
    definitions: Record<string, GearValueDefinition>,
    category: "affix" | "attunement",
    relayed: boolean,
    level: GearLevel,
  ) => {
    const roll = maxGearRoll(value.key, category, relayed, level);
    return typeof roll === "number" ? savedValueToDraft({ key: value.key, value: roll }, definitions) : value;
  };
  const applyMax = () =>
    onDraftChange((current) => {
      return {
        ...current,
        baseAffix: maxValue(current.baseAffix, gearData.affixes, "affix", current.relayed, current.level),
        additionalAffixes: current.additionalAffixes.map((affix) =>
          maxValue(affix, gearData.affixes, "affix", current.relayed, current.level),
        ),
        attunement: maxValue(current.attunement, attunementData, "attunement", current.relayed, current.level),
      };
    });
  return (
    <section className="panel gear-editor-panel" data-testid="gear-editor">
      <div className="panel-heading">
        <div>
          <h2>
            {editingExisting ? t("ui.buildTab.edit") : t("ui.buildTab.add")} {definitionName}
          </h2>
          <p>{t("ui.buildTab.percentageValuesAreEnteredAsPercentagePoints")}</p>
        </div>
        {!editingExisting && (
          <button className="button button-secondary button-small" type="button" onClick={() => setOcrOpen(true)}>
            {t("ui.buildTab.importFromImage")}
          </button>
        )}
      </div>
      <div className="gear-editor-meta">
        <label className="editor-field">
          <span>{t("ui.buildTab.level")}</span>
          <select value={draft.level} onChange={(event) => onLevelChange(Number(event.target.value) as GearLevel)}>
            <option value={96}>96</option>
            <option value={91}>91</option>
          </select>
        </label>
        <label className="editor-field">
          <span>{t("ui.buildTab.rarity")}</span>
          <select
            value={draft.rarity}
            onChange={(event) => onDraftChange((current) => ({ ...current, rarity: event.target.value as GearRarity }))}
          >
            <option value="Gold">{gearRarityLabel("Gold")}</option>
            <option value="Purple">{gearRarityLabel("Purple")}</option>
          </select>
        </label>
        <div className="gear-editor-roll-controls">
          <label className="gear-relayed-toggle">
            <input
              type="checkbox"
              checked={draft.relayed}
              onChange={(event) => onRelayedChange(event.target.checked)}
            />
            <span>{t("ui.buildTab.relayedOptionLabel")}</span>
          </label>
          <button className="button button-secondary button-small" type="button" onClick={applyMax}>
            {t("ui.buildTab.max")}
          </button>
        </div>
      </div>
      <div className="gear-editor-sections">
        <div>
          <h3>{t("ui.buildTab.baseAffix")}</h3>
          <GearValueEditor
            label={t("ui.buildTab.baseAffix")}
            value={draft.baseAffix}
            options={baseAffixOptions}
            definitions={gearData.affixes}
            category="affix"
            relayed={draft.relayed}
            level={draft.level}
            onChange={(baseAffix) => onDraftChange((current) => ({ ...current, baseAffix }))}
          />
        </div>
        <div>
          <h3>{t("ui.buildTab.additionalAffixesOptional")}</h3>
          <div className="gear-additional-affixes">
            {draft.additionalAffixes.map((affix, index) => (
              <GearValueEditor
                key={index}
                label={t("ui.buildTab.additionalAffixNumber", { number: index + 1 })}
                value={affix}
                options={additionalAffixOptions}
                definitions={gearData.affixes}
                category="affix"
                relayed={draft.relayed}
                level={draft.level}
                disabledKeys={selectedAdditionalKeys}
                onChange={(nextAffix) =>
                  onDraftChange((current) => ({
                    ...current,
                    additionalAffixes: current.additionalAffixes.map((currentAffix, currentIndex) =>
                      currentIndex === index ? nextAffix : currentAffix,
                    ),
                  }))
                }
              />
            ))}
          </div>
        </div>
        <div>
          <h3>{t("ui.buildTab.attunementOptional")}</h3>
          <GearValueEditor
            label={t("ui.buildTab.attunement")}
            value={draft.attunement}
            options={attunementOptions}
            definitions={attunementData}
            category="attunement"
            relayed={draft.relayed}
            level={draft.level}
            onChange={(attunement) => onDraftChange((current) => ({ ...current, attunement }))}
          />
        </div>
      </div>
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
      <div className="editor-actions">
        <button className="button button-secondary" type="button" onClick={onCancel}>
          {t("ui.buildTab.cancel")}
        </button>
        <button className="button button-primary" type="button" onClick={onSave}>
          {editingExisting ? t("ui.buildTab.saveChanges") : t("ui.buildTab.save")}
        </button>
      </div>
      <GearOcrModal
        open={ocrOpen}
        definitionId={definitionId}
        definitionName={definitionName}
        onClose={() => setOcrOpen(false)}
        onImport={importOcrResult}
      />
    </section>
  );
}
