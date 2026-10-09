import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"

import { skillCategoryLabel, skillDisplayName } from "@/application/formatting"
import { currentCombatDefinitions, type CombatDefinitions } from "@/application/gameData/previews"
import { defaultEditorMaps, editorSkillIds, skillCategoryByWeapon } from "@/application/gameData/skills"
import { hasSkillOverrides } from "@/application/persistence/skillOverrides"
import { baseSkillCastTime } from "@/application/rotationCatalog"
import {
  expandedSkillActionLayout,
  expandedSkillBaseCastTime,
  type EditableObject,
  type SkillRecord,
} from "@/calculations/rotationTimeline"
import { t } from "@/i18n"
import { publishNotice, dismissNotice } from "@/notices"
import { type EditorCategory, type SkillMap, type SkillOverrides } from "@/skillOverrides"
import { type WeaponId } from "@/types"
import { Button } from "@/ui/Button"
import { NumberInput } from "@/ui/NumberInput"
import { Panel } from "@/ui/Panel"
import { Tab } from "@/ui/Tab"

function skillToDraft(skill: SkillRecord) {
  const { name = "", shortName = "", castTime = 0, action = [], modifier = [], tags = [] } = skill
  const toObjects = (items: unknown[]) =>
    items.map(item => (item && typeof item === "object" && !Array.isArray(item) ? (item as EditableObject) : {}))
  const stackEffects = Array.isArray(skill.stackEffects) ? skill.stackEffects : []
  const periodicActions = Array.isArray(skill.periodic?.action) ? skill.periodic.action : []
  const isDot = tags.includes("DOT")
  return {
    name,
    shortName,
    description: asString(skill.description),
    refresh: skill.refresh !== false,
    castTime: String(baseSkillCastTime(skill)),
    originalCastTime: castTime,
    cooldown: typeof skill.cooldown === "number" ? String(skill.cooldown) : "",
    duration: typeof skill.duration === "number" ? String(skill.duration) : "",
    maxStack: typeof skill.maxStack === "number" ? String(skill.maxStack) : "",
    periodicInterval: typeof skill.periodic?.interval === "number" ? String(skill.periodic.interval) : "",
    firstTick: typeof skill.periodic?.firstTick === "number" ? String(skill.periodic.firstTick) : "",
    resetOnRefresh: skill.periodic?.resetOnRefresh === true,
    tags: tags.join(", "),
    actionItems: toObjects(isDot ? periodicActions : action),
    modifierItems: toObjects(modifier),
    effectItems: toObjects(Array.isArray(skill.effect) ? skill.effect : []),
    stackEffectGroups: stackEffects.map(group => toObjects(Array.isArray(group) ? group : [])),
  }
}

const actionTypes = [
  "damage",
  "replay",
  "consume",
  "apply",
  "trigger",
  "extend",
  "clearCD",
  "setResource",
  "addResource",
  "consumeResource",
]
const conditionTargets = [
  "self",
  "target",
  "skillTag",
  "martialArt",
  "equippedMartialArt",
  "currentMartialArt",
  "currentWeapon",
  "resource",
  "skillCooldown",
]
const effectFields = [
  "castTimeModifier",
  "castTimeMultiplier",
  "baseDMGBonus",
  "hpDMGBonus",
  "globalDmgBonus",
  "globalHPDMGBonus",
  "globalBellstrikeDMGBonus",
  "dotDamage",
  "replayDmgBonus",
  "dmgBonus",
  "defenseBonus",
  "physicalPenetration",
  "formlessPenetration",
  "physicalResistance",
  "bellstrikeResistance",
  "stonesplitResistance",
  "silkbindResistance",
  "bamboocutResistance",
  "critDmgBonus",
  "affinityDmgBonus",
  "SteadfastGuaranteedCrit",
  "enhanceDrunkenPoet",
]
const booleanEffectFields = new Set(["SteadfastGuaranteedCrit", "enhanceDrunkenPoet"])

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function itemSummary(item: string, index: number, kind: "action" | "modifier" | "effect") {
  try {
    const parsed = JSON.parse(item) as EditableObject
    if (kind === "effect") {
      const payload =
        parsed.effect && typeof parsed.effect === "object" && !Array.isArray(parsed.effect)
          ? (parsed.effect as EditableObject)
          : parsed
      const fields = Object.keys(payload).filter(field => field !== "requirement")
      return `${index + 1}. ${fields.join(", ") || "effect"}`
    }
    const type = typeof parsed.type === "string" ? parsed.type : kind
    const time = typeof parsed.time === "number" ? ` at ${parsed.time}s` : ""
    return `${index + 1}. ${type}${time}`
  } catch {
    return `${index + 1}. ${kind}`
  }
}

function updateObjectField(object: EditableObject, field: string, value: unknown) {
  return { ...object, [field]: value }
}

function RequirementEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const wrapper =
    value && typeof value === "object" && !Array.isArray(value) && (value as EditableObject).resolveAt === "skillStart"
      ? (value as EditableObject)
      : undefined
  const requirements = Array.isArray(wrapper?.operand)
    ? (wrapper.operand as unknown[])
    : Array.isArray(value)
      ? (value as unknown[])
      : []
  const emit = (next: unknown[]) => onChange(wrapper ? { ...wrapper, operand: next } : next)
  function editLeaf(leaf: unknown, field: string, fieldValue: string) {
    const current = leaf && typeof leaf === "object" && !Array.isArray(leaf) ? (leaf as EditableObject) : {}
    return { ...current, [field]: fieldValue }
  }
  function updateLeaf(index: number, field: string, fieldValue: string) {
    const next = [...requirements]
    next[index] = editLeaf(next[index], field, fieldValue)
    emit(next)
  }
  function updateOrLeaf(
    groupIndex: number,
    operandIndex: number,
    field: string,
    fieldValue: string,
    nestedIndex?: number,
  ) {
    const group = requirements[groupIndex] as EditableObject
    const operands = Array.isArray(group.operand) ? [...group.operand] : []
    if (nestedIndex === undefined) operands[operandIndex] = editLeaf(operands[operandIndex], field, fieldValue)
    else {
      const nested = Array.isArray(operands[operandIndex]) ? [...(operands[operandIndex] as unknown[])] : []
      nested[nestedIndex] = editLeaf(nested[nestedIndex], field, fieldValue)
      operands[operandIndex] = nested
    }
    const next = [...requirements]
    next[groupIndex] = { ...group, operand: operands }
    emit(next)
  }
  function addOrGroup() {
    emit([
      ...requirements,
      {
        operator: "or",
        operand: [
          { target: "self", value: "" },
          { target: "self", value: "" },
        ],
      },
    ])
  }
  function addOrOperand(groupIndex: number) {
    const group = requirements[groupIndex] as EditableObject
    const next = [...requirements]
    next[groupIndex] = {
      ...group,
      operand: [...(Array.isArray(group.operand) ? group.operand : []), { target: "self", value: "" }],
    }
    emit(next)
  }
  function removeOrOperand(groupIndex: number, operandIndex: number, nestedIndex?: number) {
    const group = requirements[groupIndex] as EditableObject
    const operands = Array.isArray(group.operand) ? [...group.operand] : []
    if (nestedIndex === undefined) operands.splice(operandIndex, 1)
    else {
      const nested = Array.isArray(operands[operandIndex]) ? [...(operands[operandIndex] as unknown[])] : []
      nested.splice(nestedIndex, 1)
      operands[operandIndex] = nested
    }
    const next = [...requirements]
    next[groupIndex] = { ...group, operand: operands }
    emit(next)
  }
  const addLeaf = () => emit([...requirements, { target: "self", value: "" }])
  const remove = (index: number) => emit(requirements.filter((_, itemIndex) => itemIndex !== index))
  return (
    <div className="requirement-editor">
      <div className="sub-editor-heading">
        <span>
          {t("ui.app.requirements")} <small>{t("ui.app.allConditionsMustPass")}</small>
        </span>
        <div className="sub-editor-buttons">
          <Button size="small" type="button" onClick={addLeaf}>
            {t("ui.app.addCondition")}
          </Button>
          <Button size="small" type="button" onClick={addOrGroup}>
            {t("ui.app.addOr")}
          </Button>
        </div>
      </div>
      {requirements.length === 0 && <span className="sub-editor-empty">{t("ui.app.noRequirements")}</span>}
      {requirements.map((requirement, index) => {
        const item =
          requirement && typeof requirement === "object" && !Array.isArray(requirement)
            ? (requirement as EditableObject)
            : {}
        if (item.operator === "or") {
          const operands = Array.isArray(item.operand) ? item.operand : []
          return (
            <div className="or-condition" key={index}>
              <div className="or-condition-heading">
                <span>{t("ui.app.orGroup")}</span>
                <button type="button" onClick={() => remove(index)}>
                  {t("ui.app.remove")}
                </button>
              </div>
              {operands.map((operand, operandIndex) =>
                Array.isArray(operand) ? (
                  <div className="and-group" key={operandIndex}>
                    <small>{t("ui.app.andGroup")}</small>
                    {operand.map((leaf, nestedIndex) => (
                      <div className="condition-row" key={nestedIndex}>
                        <select
                          value={asString((leaf as EditableObject)?.target) || "self"}
                          onChange={event =>
                            updateOrLeaf(index, operandIndex, "target", event.target.value, nestedIndex)
                          }
                        >
                          {conditionTargets.map(target => (
                            <option key={target}>{target}</option>
                          ))}
                        </select>
                        <input
                          value={asString((leaf as EditableObject)?.value)}
                          placeholder={t("ui.app.value")}
                          onChange={event =>
                            updateOrLeaf(index, operandIndex, "value", event.target.value, nestedIndex)
                          }
                        />
                        <button
                          type="button"
                          aria-label={t("ui.app.removeAlternative")}
                          onClick={() => removeOrOperand(index, operandIndex, nestedIndex)}
                        >
                          <IconX size="1em" aria-hidden />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="condition-row" key={operandIndex}>
                    <select
                      value={asString((operand as EditableObject)?.target) || "self"}
                      onChange={event => updateOrLeaf(index, operandIndex, "target", event.target.value)}
                    >
                      {conditionTargets.map(target => (
                        <option key={target}>{target}</option>
                      ))}
                    </select>
                    <input
                      value={asString((operand as EditableObject)?.value)}
                      placeholder={t("ui.app.value")}
                      onChange={event => updateOrLeaf(index, operandIndex, "value", event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={t("ui.app.removeAlternative")}
                      onClick={() => removeOrOperand(index, operandIndex)}
                    >
                      <IconX size="1em" aria-hidden />
                    </button>
                  </div>
                ),
              )}
              <Button size="small" type="button" onClick={() => addOrOperand(index)}>
                {t("ui.app.addAlternative")}
              </Button>
            </div>
          )
        }
        return (
          <div className="condition-row" key={index}>
            <select
              value={asString(item.target) || "self"}
              onChange={event => updateLeaf(index, "target", event.target.value)}
            >
              {conditionTargets.map(target => (
                <option key={target}>{target}</option>
              ))}
            </select>
            <input
              value={asString(item.value)}
              placeholder={t("ui.app.value")}
              onChange={event => updateLeaf(index, "value", event.target.value)}
            />
            <button type="button" aria-label={t("ui.app.removeCondition")} onClick={() => remove(index)}>
              <IconX size="1em" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) {
  return (
    <label className="detail-field">
      <span>{label}</span>
      <NumberInput
        commitMode="immediate"
        step="0.0001"
        value={typeof value === "number" ? value : ""}
        onChange={raw => onChange(Number(raw))}
      />
    </label>
  )
}

function ActionDetails({
  item,
  onChange,
  skillIds,
}: {
  item: EditableObject
  onChange: (item: EditableObject) => void
  skillIds: string[]
}) {
  const type = asString(item.type) || "damage"
  const isResourceAction = type === "setResource" || type === "addResource" || type === "consumeResource"
  const set = (field: string, value: unknown) => onChange(updateObjectField(item, field, value))
  const consumeValueObject =
    item.value && typeof item.value === "object" && !Array.isArray(item.value)
      ? (item.value as EditableObject)
      : undefined
  const firstConsume = consumeValueObject?.operator === "first"
  const consumeResolvesAtSkillStart = firstConsume && consumeValueObject.resolveAt === "skillStart"
  const requirementObject =
    item.requirement && typeof item.requirement === "object" && !Array.isArray(item.requirement)
      ? (item.requirement as EditableObject)
      : undefined
  const requirementResolvesAtSkillStart =
    requirementObject?.resolveAt === "skillStart" && Array.isArray(requirementObject.operand)
  const consumeText = firstConsume
    ? Array.isArray(consumeValueObject?.operand)
      ? (consumeValueObject.operand as unknown[]).map(asString).join(", ")
      : ""
    : asString(item.value)
  function setConsumeMode(mode: string) {
    const current = consumeText
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
    set(
      "value",
      mode === "first"
        ? { operator: "first", operand: current, ...(consumeResolvesAtSkillStart ? { resolveAt: "skillStart" } : {}) }
        : (current[0] ?? ""),
    )
  }
  function setConsumeText(value: string) {
    set(
      "value",
      firstConsume
        ? {
            operator: "first",
            operand: value
              .split(",")
              .map(part => part.trim())
              .filter(Boolean),
            ...(consumeResolvesAtSkillStart ? { resolveAt: "skillStart" } : {}),
          }
        : value,
    )
  }
  function setConsumeResolveAtSkillStart(enabled: boolean) {
    if (!firstConsume) return
    const nextValue = { ...consumeValueObject }
    if (enabled) nextValue.resolveAt = "skillStart"
    else delete nextValue.resolveAt
    set("value", nextValue)
  }
  function setRequirementResolveAtSkillStart(enabled: boolean) {
    const operand = requirementResolvesAtSkillStart
      ? (requirementObject?.operand as unknown[])
      : Array.isArray(item.requirement)
        ? item.requirement
        : []
    set("requirement", enabled ? { resolveAt: "skillStart", operand } : operand)
  }
  return (
    <div className="structured-detail">
      <div className="detail-fields">
        <label className="detail-field">
          <span>{t("ui.app.type")}</span>
          <select value={type} onChange={event => set("type", event.target.value)}>
            {actionTypes.map(actionType => (
              <option key={actionType}>{actionType}</option>
            ))}
          </select>
        </label>
        <NumberField label={t("ui.app.time")} value={item.time} onChange={value => set("time", value)} />
      </div>
      {(type === "damage" || type === "heal") && (
        <div className="detail-fields detail-fields-four">
          <NumberField
            label={t("ui.app.physicalCoefficient")}
            value={item.phyCoef}
            onChange={value => set("phyCoef", value)}
          />
          {type === "heal" ? (
            <NumberField
              label={t("ui.app.silkbindCoefficient")}
              value={item.silkbindCoef}
              onChange={value => set("silkbindCoef", value)}
            />
          ) : (
            <NumberField
              label={t("ui.app.attributeCoefficient")}
              value={item.attrCoef}
              onChange={value => set("attrCoef", value)}
            />
          )}
          <NumberField
            label={t("ui.app.physicalBonus")}
            value={item.phyBonus}
            onChange={value => set("phyBonus", value)}
          />
          <NumberField
            label={t("ui.app.attributeBonus")}
            value={item.attrBonus}
            onChange={value => set("attrBonus", value)}
          />
        </div>
      )}
      {type === "replay" && (
        <div className="detail-fields">
          <NumberField label={t("ui.app.coefficient")} value={item.coef} onChange={value => set("coef", value)} />
        </div>
      )}
      {(type === "apply" || type === "extend" || type === "clearCD") && (
        <div className="detail-fields">
          <label className="detail-field">
            <span>{t("ui.app.target")}</span>
            <select value={asString(item.target) || "self"} onChange={event => set("target", event.target.value)}>
              <option value="self">{"self"}</option>
              <option value="target">{"target"}</option>
            </select>
          </label>
          <label className="detail-field">
            <span>{t("ui.app.value")}</span>
            <input value={asString(item.value)} onChange={event => set("value", event.target.value)} />
          </label>
        </div>
      )}
      {type === "consume" && (
        <div className="detail-fields consume-fields">
          <label className="detail-field">
            <span>{t("ui.app.target")}</span>
            <select value={asString(item.target) || "self"} onChange={event => set("target", event.target.value)}>
              <option value="self">{"self"}</option>
              <option value="target">{"target"}</option>
            </select>
          </label>
          <label className="detail-field">
            <span>{t("ui.app.valueMode")}</span>
            <select value={firstConsume ? "first" : "name"} onChange={event => setConsumeMode(event.target.value)}>
              <option value="name">{t("ui.app.singleName")}</option>
              <option value="first">{t("ui.app.firstAvailable")}</option>
            </select>
          </label>
          <label className="detail-field consume-value-field">
            <span>{firstConsume ? t("ui.app.valuesCommaSeparated") : t("ui.app.value")}</span>
            <input value={consumeText} onChange={event => setConsumeText(event.target.value)} />
          </label>
        </div>
      )}
      {isResourceAction && (
        <div className="detail-fields">
          <label className="detail-field">
            <span>{t("ui.app.value")}</span>
            <input value={asString(item.value)} onChange={event => set("value", event.target.value)} />
          </label>
          {type === "consumeResource" && item.amount === "all" ? (
            <label className="checkbox-field">
              <input type="checkbox" checked onChange={() => set("amount", 0)} />
              <span>{t("ui.app.all")}</span>
            </label>
          ) : (
            <>
              <NumberField label={t("ui.app.amount")} value={item.amount} onChange={value => set("amount", value)} />
              {type === "consumeResource" && (
                <label className="checkbox-field">
                  <input type="checkbox" checked={false} onChange={() => set("amount", "all")} />
                  <span>{t("ui.app.all")}</span>
                </label>
              )}
            </>
          )}
        </div>
      )}
      {(type === "apply" || type === "consume") && (
        <div className="detail-fields">
          {type === "consume" && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={item.stack === "all"}
                onChange={event => set("stack", event.target.checked ? "all" : 1)}
              />
              <span>{t("ui.app.allStacks")}</span>
            </label>
          )}
          {type === "consume" && firstConsume && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={consumeResolvesAtSkillStart}
                onChange={event => setConsumeResolveAtSkillStart(event.target.checked)}
              />
              <span>{t("ui.app.resolveAtSkillStart")}</span>
            </label>
          )}
          {item.stack !== "all" && (
            <NumberField label={t("ui.app.stack")} value={item.stack} onChange={value => set("stack", value)} />
          )}
          {type === "apply" && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={item.reapply === true}
                onChange={event => set("reapply", event.target.checked)}
              />
              <span>{t("ui.app.reapply")}</span>
            </label>
          )}
        </div>
      )}
      {(type === "apply" || type === "extend") && (
        <NumberField label={t("ui.app.duration")} value={item.duration} onChange={value => set("duration", value)} />
      )}
      {type === "trigger" && (
        <label className="detail-field">
          <span>{t("ui.app.triggeredSkill")}</span>
          <select value={asString(item.value)} onChange={event => set("value", event.target.value)}>
            <option value="">{t("ui.app.selectASkill")}</option>
            {skillIds.map(skillId => (
              <option key={skillId}>{skillId}</option>
            ))}
          </select>
        </label>
      )}
      {(type === "apply" || type === "trigger" || type === "extend" || type === "clearCD" || isResourceAction) && (
        <>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={requirementResolvesAtSkillStart}
              onChange={event => setRequirementResolveAtSkillStart(event.target.checked)}
            />
            <span>{t("ui.app.resolveAtSkillStart")}</span>
          </label>
          <RequirementEditor value={item.requirement} onChange={value => set("requirement", value)} />
        </>
      )}
    </div>
  )
}

function ModifierDetails({ item, onChange }: { item: EditableObject; onChange: (item: EditableObject) => void }) {
  const set = (field: string, value: unknown) => onChange(updateObjectField(item, field, value))
  const effect =
    item.effect && typeof item.effect === "object" && !Array.isArray(item.effect) ? (item.effect as EditableObject) : {}
  const effectEntries = Object.entries(effect)
  function updateEffect(field: string, value: unknown) {
    set("effect", { ...effect, [field]: value })
  }
  function addEffect() {
    const field = effectFields.find(candidate => !(candidate in effect))
    if (field) updateEffect(field, booleanEffectFields.has(field) ? false : 0)
  }
  function removeEffect(field: string) {
    const next = { ...effect }
    delete next[field]
    set("effect", next)
  }
  return (
    <div className="structured-detail">
      <RequirementEditor value={item.requirement} onChange={value => set("requirement", value)} />
      <div className="sub-editor-heading">
        <span>{t("ui.app.effects")}</span>
        <Button size="small" type="button" onClick={addEffect}>
          {t("ui.app.addEffect")}
        </Button>
      </div>
      {effectEntries.map(([field, value]) => (
        <div className="effect-row" key={field}>
          <select
            value={field}
            onChange={event => {
              const next = { ...effect }
              const nextField = event.target.value
              if (nextField !== field) {
                next[nextField] = next[field]
                delete next[field]
                set("effect", next)
              }
            }}
          >
            {!effectFields.includes(field) && <option value={field}>{field}</option>}
            {effectFields.map(effectField => (
              <option key={effectField}>{effectField}</option>
            ))}
          </select>
          <EffectValueEditor value={value} onChange={nextValue => updateEffect(field, nextValue)} />
          <button type="button" aria-label={t("ui.app.removeEffect")} onClick={() => removeEffect(field)}>
            <IconX size="1em" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}

function DynamicByStackValueEditor({
  value,
  onChange,
}: {
  value: EditableObject
  onChange: (value: EditableObject) => void
}) {
  return (
    <div className="dynamic-effect-editor">
      <label className="detail-field">
        <span>{t("ui.app.effect")}</span>
        <input
          value={asString(value.param1)}
          onChange={event => onChange({ ...value, function: "byStack", param1: event.target.value })}
        />
      </label>
      <label className="detail-field">
        <span>{t("ui.app.valuePerStack")}</span>
        <input
          type="number"
          step="0.0001"
          value={typeof value.param2 === "number" ? value.param2 : ""}
          onChange={event => onChange({ ...value, function: "byStack", param2: Number(event.target.value) })}
        />
      </label>
      <label className="detail-field">
        <span>{t("ui.app.target")}</span>
        <select
          value={value.target === "target" ? "target" : "self"}
          onChange={event => onChange({ ...value, function: "byStack", target: event.target.value })}
        >
          <option value="self">{"self"}</option>
          <option value="target">{"target"}</option>
        </select>
      </label>
    </div>
  )
}

function DynamicMultiplyValueEditor({
  value,
  onChange,
}: {
  value: EditableObject
  onChange: (value: EditableObject) => void
}) {
  return (
    <div className="dynamic-effect-editor">
      <label className="detail-field">
        <span>{t("ui.app.parameter")}</span>
        <input
          value={asString(value.param1)}
          onChange={event => onChange({ ...value, function: "multiply", param1: event.target.value })}
        />
      </label>
      <label className="detail-field">
        <span>{t("ui.app.multiplier")}</span>
        <input
          type="number"
          step="0.0001"
          value={typeof value.param2 === "number" || typeof value.param2 === "string" ? value.param2 : ""}
          onChange={event => onChange({ ...value, function: "multiply", param2: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}

function DynamicSegmentValueEditor({
  value,
  onChange,
}: {
  value: EditableObject
  onChange: (value: EditableObject) => void
}) {
  const thresholds = Array.isArray(value.param2) ? value.param2.map(item => asNumber(item)) : []
  const results = Array.isArray(value.param3) ? value.param3.map(item => asNumber(item)) : []
  const resizeResults = (nextThresholds: number[]) =>
    Array.from({ length: nextThresholds.length + 1 }, (_, index) => results[index] ?? 0)
  return (
    <div className="dynamic-effect-editor">
      <label className="detail-field">
        <span>{t("ui.app.parameter")}</span>
        <input
          value={typeof value.param1 === "number" ? value.param1 : asString(value.param1)}
          onChange={event => onChange({ ...value, function: "segment", param1: event.target.value })}
        />
      </label>
      <div className="sub-editor-heading">
        <span>{t("ui.app.thresholds")}</span>
        <Button
          size="small"
          type="button"
          onClick={() => {
            const nextThresholds = [...thresholds, 0]
            onChange({ ...value, function: "segment", param2: nextThresholds, param3: resizeResults(nextThresholds) })
          }}
        >
          {t("ui.app.add")}
        </Button>
      </div>
      <div className="dynamic-effect-values">
        {thresholds.map((item, index) => (
          <div key={index}>
            <input
              aria-label={t("ui.app.thresholdNumber", { number: index + 1 })}
              type="number"
              step="0.0001"
              value={item}
              onChange={event =>
                onChange({
                  ...value,
                  function: "segment",
                  param2: thresholds.map((threshold, thresholdIndex) =>
                    thresholdIndex === index ? Number(event.target.value) : threshold,
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label={t("ui.app.removeThresholdNumber", { number: index + 1 })}
              onClick={() => {
                const nextThresholds = thresholds.filter((_, thresholdIndex) => thresholdIndex !== index)
                const nextResults = results.filter((_, resultIndex) => resultIndex !== index)
                onChange({
                  ...value,
                  function: "segment",
                  param2: nextThresholds,
                  param3: Array.from(
                    { length: nextThresholds.length + 1 },
                    (_, resultIndex) => nextResults[resultIndex] ?? 0,
                  ),
                })
              }}
            >
              <IconX size="1em" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="sub-editor-heading">
        <span>{t("ui.app.segmentValues")}</span>
      </div>
      <div className="dynamic-effect-values">
        {Array.from({ length: thresholds.length + 1 }, (_, index) => results[index] ?? 0).map((item, index) => (
          <div key={index}>
            <input
              aria-label={t("ui.app.segmentValueNumber", { number: index + 1 })}
              type="number"
              step="0.0001"
              value={item}
              onChange={event =>
                onChange({
                  ...value,
                  function: "segment",
                  param3: Array.from({ length: thresholds.length + 1 }, (_, resultIndex) =>
                    resultIndex === index ? Number(event.target.value) : (results[resultIndex] ?? 0),
                  ),
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function EffectValueEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const objectValue =
    value && typeof value === "object" && !Array.isArray(value) ? (value as EditableObject) : undefined
  const dynamicValue =
    objectValue?.function === "byStack" || objectValue?.function === "segment" || objectValue?.function === "multiply"
      ? objectValue
      : undefined
  const kind =
    dynamicValue?.function === "byStack"
      ? "byStack"
      : dynamicValue?.function === "segment"
        ? "segment"
        : dynamicValue?.function === "multiply"
          ? "multiply"
          : typeof value === "boolean"
            ? "boolean"
            : typeof value === "string"
              ? "text"
              : "number"
  return (
    <div className="effect-value-editor">
      <select
        aria-label={t("ui.app.effectValueType")}
        value={kind}
        onChange={event => {
          const nextKind = event.target.value
          onChange(
            nextKind === "byStack"
              ? { function: "byStack", param1: "", param2: 0.2, target: "self" }
              : nextKind === "segment"
                ? { function: "segment", param1: "actionTime", param2: [], param3: [0] }
                : nextKind === "multiply"
                  ? { function: "multiply", param1: "missingHPPercentage", param2: 0.0045 }
                  : nextKind === "boolean"
                    ? false
                    : nextKind === "text"
                      ? ""
                      : 0,
          )
        }}
      >
        <option value="number">{"number"}</option>
        <option value="boolean">{"boolean"}</option>
        <option value="byStack">{"byStack"}</option>
        <option value="segment">{"segment"}</option>
        <option value="multiply">{"multiply"}</option>
        <option value="text">{"text"}</option>
      </select>
      {kind === "byStack" && dynamicValue ? (
        <DynamicByStackValueEditor value={dynamicValue} onChange={onChange} />
      ) : kind === "segment" && dynamicValue ? (
        <DynamicSegmentValueEditor value={dynamicValue} onChange={onChange} />
      ) : kind === "multiply" && dynamicValue ? (
        <DynamicMultiplyValueEditor value={dynamicValue} onChange={onChange} />
      ) : kind === "boolean" ? (
        <label className="checkbox-field">
          <input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} />
          <span>{value === true ? "true" : "false"}</span>
        </label>
      ) : (
        <input
          type={kind === "number" ? "number" : "text"}
          step={kind === "number" ? "0.0001" : undefined}
          value={kind === "number" ? (typeof value === "number" ? value : "") : asString(value)}
          onChange={event => onChange(kind === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
    </div>
  )
}

function EffectRuleDetails({ item, onChange }: { item: EditableObject; onChange: (item: EditableObject) => void }) {
  const wrapped = item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
  const effect = wrapped
    ? (item.effect as EditableObject)
    : Object.fromEntries(Object.entries(item).filter(([field]) => field !== "requirement"))
  const effectEntries = Object.entries(effect)
  function setEffect(nextEffect: EditableObject) {
    if (wrapped) onChange({ ...item, effect: nextEffect })
    else onChange({ ...(Array.isArray(item.requirement) ? { requirement: item.requirement } : {}), ...nextEffect })
  }
  function updateEffect(field: string, value: unknown) {
    setEffect({ ...effect, [field]: value })
  }
  function addEffect() {
    const field = effectFields.find(candidate => !(candidate in effect))
    if (field) updateEffect(field, booleanEffectFields.has(field) ? false : 0)
  }
  function removeEffect(field: string) {
    const next = { ...effect }
    delete next[field]
    setEffect(next)
  }
  return (
    <div className="structured-detail">
      <RequirementEditor value={item.requirement} onChange={requirement => onChange({ ...item, requirement })} />
      <div className="sub-editor-heading">
        <span>
          {t("ui.app.effects")} <small>({wrapped ? t("ui.app.wrapped") : t("ui.app.direct")})</small>
        </span>
        <Button size="small" type="button" onClick={addEffect}>
          {t("ui.app.addEffect")}
        </Button>
      </div>
      {effectEntries.length === 0 && <span className="sub-editor-empty">{t("ui.app.noEffects")}</span>}
      {effectEntries.map(([field, value]) => (
        <div className="effect-row effect-rule-row" key={field}>
          <select
            value={field}
            onChange={event => {
              const next = { ...effect }
              const nextField = event.target.value
              if (nextField !== field) {
                next[nextField] = next[field]
                delete next[field]
                setEffect(next)
              }
            }}
          >
            {!effectFields.includes(field) && <option value={field}>{field}</option>}
            {effectFields.map(effectField => (
              <option key={effectField}>{effectField}</option>
            ))}
          </select>
          <EffectValueEditor value={value} onChange={nextValue => updateEffect(field, nextValue)} />
          <button
            type="button"
            aria-label={t("ui.app.removeNamedEffect", { name: field })}
            onClick={() => removeEffect(field)}
          >
            <IconX size="1em" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}

function ArrayItemEditor({
  label,
  kind,
  items,
  onChange,
  skillIds,
}: {
  label: string
  kind: "action" | "modifier" | "effect"
  items: EditableObject[]
  onChange: (items: EditableObject[]) => void
  skillIds: string[]
}) {
  const [expanded, setExpanded] = useState<number | null>(items.length ? 0 : null)

  function updateItem(index: number, value: EditableObject) {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  function addItem() {
    const item: EditableObject = kind === "action" ? { type: "damage", time: 0 } : { requirement: [], effect: {} }
    const next = [...items, item]
    onChange(next)
    setExpanded(next.length - 1)
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    setExpanded(target)
  }

  function deleteItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index))
    setExpanded(null)
  }

  return (
    <section className="array-editor">
      <div className="array-editor-heading">
        <span>{label}</span>
        <Button size="small" type="button" onClick={addItem}>
          {t("ui.app.add")}
        </Button>
      </div>
      {items.length === 0 && (
        <p className="array-editor-empty">
          {t("ui.app.no")} {label.toLowerCase()} {t("ui.app.yet")}
        </p>
      )}
      <div className="array-editor-list">
        {items.map((item, index) => {
          return (
            <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={index}>
              <div className="array-item-header">
                <button
                  className="array-item-toggle"
                  type="button"
                  onClick={() => setExpanded(expanded === index ? null : index)}
                >
                  {itemSummary(JSON.stringify(item), index, kind)}
                </button>
                <div className="array-item-controls">
                  <button
                    type="button"
                    aria-label={t("ui.app.moveUp")}
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    <IconChevronUp size="1em" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={t("ui.app.moveDown")}
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    <IconChevronDown size="1em" aria-hidden />
                  </button>
                  <button type="button" aria-label={t("ui.app.delete")} onClick={() => deleteItem(index)}>
                    <IconX size="1em" aria-hidden />
                  </button>
                </div>
              </div>
              {expanded === index && (
                <div className="array-item-detail">
                  {kind === "action" ? (
                    <ActionDetails item={item} onChange={next => updateItem(index, next)} skillIds={skillIds} />
                  ) : kind === "modifier" ? (
                    <ModifierDetails item={item} onChange={next => updateItem(index, next)} />
                  ) : (
                    <EffectRuleDetails item={item} onChange={next => updateItem(index, next)} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StackEffectsEditor({
  groups,
  onChange,
  skillIds,
}: {
  groups: EditableObject[][]
  onChange: (groups: EditableObject[][]) => void
  skillIds: string[]
}) {
  const [expanded, setExpanded] = useState<number | null>(groups.length ? 0 : null)
  function moveGroup(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= groups.length) return
    const next = [...groups]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    setExpanded(target)
  }
  return (
    <section className="array-editor stack-effects-editor">
      <div className="array-editor-heading">
        <span>{t("ui.app.stackEffects")}</span>
        <Button
          size="small"
          type="button"
          onClick={() => {
            const next = [...groups, []]
            onChange(next)
            setExpanded(next.length - 1)
          }}
        >
          {t("ui.app.addStack")}
        </Button>
      </div>
      {groups.length === 0 && <p className="array-editor-empty">{t("ui.app.noStackEffectsYet")}</p>}
      <div className="array-editor-list">
        {groups.map((group, index) => (
          <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={index}>
            <div className="array-item-header">
              <button
                className="array-item-toggle"
                type="button"
                onClick={() => setExpanded(expanded === index ? null : index)}
              >
                {t("ui.app.stack")} {index + 1} · {group.length} {t("ui.app.stackEffectCountNoun")}
                {group.length === 1 ? "" : t("ui.app.s")}
              </button>
              <div className="array-item-controls">
                <button
                  type="button"
                  aria-label={t("ui.app.moveStackUp")}
                  disabled={index === 0}
                  onClick={() => moveGroup(index, -1)}
                >
                  <IconChevronUp size="1em" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("ui.app.moveStackDown")}
                  disabled={index === groups.length - 1}
                  onClick={() => moveGroup(index, 1)}
                >
                  <IconChevronDown size="1em" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("ui.app.deleteStack")}
                  onClick={() => {
                    onChange(groups.filter((_, groupIndex) => groupIndex !== index))
                    setExpanded(null)
                  }}
                >
                  <IconX size="1em" aria-hidden />
                </button>
              </div>
            </div>
            {expanded === index && (
              <div className="array-item-detail">
                <ArrayItemEditor
                  label={t("ui.app.stackEffectsNumber", { number: index + 1 })}
                  kind="effect"
                  items={group}
                  skillIds={skillIds}
                  onChange={items =>
                    onChange(groups.map((candidate, groupIndex) => (groupIndex === index ? items : candidate)))
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export function SkillEditorTab({
  weapons,
  overrides,
  preview = currentCombatDefinitions,
  onOverridesChange,
}: {
  weapons: [WeaponId, WeaponId]
  overrides: SkillOverrides
  /**
   * The registries the selected preview resolved to. The editor edits what is being
   * calculated, so its Default control means "this preview's value" rather than the
   * shipped one, and a record a preview adds appears here like any other.
   */
  preview?: CombatDefinitions
  onOverridesChange: (overrides: SkillOverrides) => void
}) {
  const [category, setCategory] = useState<EditorCategory>("Snowparting")
  /**
   * The editor's records, resolved against the selected preview. Only records the shipped
   * data already defines are listed: a preview supplies a version of a record, and the records
   * it introduces alongside one are its own sub-actions, which are not independently editable.
   */
  const editorMaps = useMemo(() => {
    const maps = {} as Record<EditorCategory, SkillMap>
    for (const [mapCategory, records] of Object.entries(defaultEditorMaps) as Array<[EditorCategory, SkillMap]>) {
      const resolved =
        mapCategory === "Buff" || mapCategory === "Debuff" || mapCategory === "DOT"
          ? preview.effectDefinitions
          : preview.skillMaps[mapCategory]
      maps[mapCategory] = Object.fromEntries(
        Object.entries(records).map(([id, record]) => [id, (resolved[id] ?? record) as SkillRecord]),
      )
    }
    return maps
  }, [preview])

  const [selectedSkill, setSelectedSkill] = useState(Object.keys(editorMaps.Snowparting)[0])
  const [draft, setDraft] = useState(() => skillToDraft(editorMaps.Snowparting[selectedSkill]))
  const [error, setError] = useState("")
  const setStatus = (message: string) => {
    if (message) publishNotice({ id: "skill-save", message })
    else dismissNotice("skill-save")
  }

  const skills = useMemo(() => ({ ...editorMaps[category], ...overrides[category] }), [editorMaps, category, overrides])
  const skillIds = useMemo(() => Object.keys(skills), [skills])
  const combinedCastLayout = draftSkillLayout()
  function draftSkillLayout() {
    const selected = skills[selectedSkill]
    if (!selected?.subAction?.length) return undefined
    const definitions = {
      ...Object.assign(
        {},
        ...Object.entries(preview.skillMaps).map(([key, records]) =>
          Object.assign({}, records, overrides[key as EditorCategory]),
        ),
      ),
      [selectedSkill]: { ...selected, castTime: Number(draft.castTime) },
    }
    return {
      ...expandedSkillActionLayout(selectedSkill, definitions),
      castTime: expandedSkillBaseCastTime(selectedSkill, definitions),
    }
  }
  const editorModified = hasSkillOverrides(overrides)
  const visibleCategories = useMemo<EditorCategory[]>(() => {
    const martialCategories = weapons.flatMap(weapon => {
      const item = skillCategoryByWeapon[weapon]
      return item ? [item] : []
    })
    return [
      ...new Set<EditorCategory>([...martialCategories, "Mystic", "General", "Buff", "Debuff", "DOT"]),
    ] as EditorCategory[]
  }, [weapons])

  if (!visibleCategories.includes(category)) setCategory(visibleCategories[0])
  const [prevSkillCategory, setPrevSkillCategory] = useState(category)
  if (prevSkillCategory !== category) {
    setPrevSkillCategory(category)
    setSelectedSkill(Object.keys(editorMaps[category])[0])
  }
  const [draftSkillSource, setDraftSkillSource] = useState<{
    selectedSkill: string
    skills: typeof skills
    skillIds: string[]
  } | null>(null)
  const draftSkill = skills[selectedSkill] ?? skills[skillIds[0]]
  if (
    draftSkill &&
    (draftSkillSource === null ||
      draftSkillSource.selectedSkill !== selectedSkill ||
      draftSkillSource.skills !== skills ||
      draftSkillSource.skillIds !== skillIds)
  ) {
    setDraftSkillSource({ selectedSkill, skills, skillIds })
    setDraft(skillToDraft(draftSkill))
    setError("")
  }
  useEffect(() => {
    dismissNotice("skill-save")
  }, [draftSkillSource])

  function selectSkill(id: string) {
    setSelectedSkill(id)
  }

  function save() {
    try {
      const isDefinition = category === "Buff" || category === "Debuff"
      const optionalNumber = (value: string, label: string) => {
        if (!value.trim()) return undefined
        const number = Number(value)
        if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`)
        return number
      }
      let updatedSkill: SkillRecord
      if (isDefinition) {
        updatedSkill = {
          ...skills[selectedSkill],
          name: draft.name,
          description: draft.description,
          refresh: draft.refresh,
          duration: optionalNumber(draft.duration, "Duration"),
          cooldown: optionalNumber(draft.cooldown, "Cooldown"),
          maxStack: optionalNumber(draft.maxStack, "Max stack"),
          effect: draft.effectItems,
          stackEffects: draft.stackEffectGroups,
        }
      } else {
        const action = draft.actionItems
        const modifier = draft.modifierItems
        const actionTimes = action.map(item => item.time)
        if (actionTimes.some(time => typeof time !== "number" || !Number.isFinite(time))) {
          throw new Error("Every action must have a numeric time.")
        }
        const numericActionTimes = actionTimes as number[]
        const firstOutOfOrder = numericActionTimes.findIndex(
          (time, index) => index > 0 && time < numericActionTimes[index - 1],
        )
        if (firstOutOfOrder !== -1) {
          throw new Error(
            `Actions are out of order: action ${firstOutOfOrder + 1} occurs before action ${firstOutOfOrder}.`,
          )
        }
        const parsedCastTime = category === "DOT" ? undefined : Number(draft.castTime)
        if (parsedCastTime !== undefined && !Number.isFinite(parsedCastTime))
          throw new Error("Cast time must be a number.")
        const originalFallback = baseSkillCastTime({ castTime: draft.originalCastTime })
        const castTime =
          parsedCastTime !== undefined && draft.castTime === String(originalFallback)
            ? draft.originalCastTime
            : parsedCastTime
        updatedSkill = {
          ...skills[selectedSkill],
          name: draft.name,
          shortName: draft.shortName.trim() || undefined,
          ...(castTime === undefined ? {} : { castTime }),
          cooldown: optionalNumber(draft.cooldown, "Cooldown"),
          action,
          modifier,
          tags: draft.tags
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean),
          ...(category === "DOT"
            ? {
                action: undefined,
                periodic: {
                  interval: optionalNumber(draft.periodicInterval, "Periodic interval"),
                  firstTick: optionalNumber(draft.firstTick, "First tick"),
                  resetOnRefresh: draft.resetOnRefresh,
                  action,
                },
                duration: optionalNumber(draft.duration, "Duration"),
                maxStack: optionalNumber(draft.maxStack, "Max stack"),
                refresh: draft.refresh,
              }
            : {}),
        }
      }
      const nextCategoryOverrides = { ...overrides[category] }
      if (JSON.stringify(updatedSkill) === JSON.stringify(editorMaps[category][selectedSkill])) {
        delete nextCategoryOverrides[selectedSkill]
      } else {
        nextCategoryOverrides[selectedSkill] = updatedSkill
      }
      const nextOverrides: SkillOverrides = { ...overrides }
      if (Object.keys(nextCategoryOverrides).length > 0) nextOverrides[category] = nextCategoryOverrides
      else delete nextOverrides[category]
      onOverridesChange(nextOverrides)
      setStatus(t("ui.app.savedForThisSession"))
      setError("")
    } catch (saveError) {
      publishNotice({
        id: "skill-save",
        error: true,
        message: saveError instanceof Error ? saveError.message : t("ui.app.recordSaveError"),
      })
    }
  }

  function restoreDefault() {
    const nextCategoryOverrides = { ...overrides[category] }
    delete nextCategoryOverrides[selectedSkill]
    const nextOverrides: SkillOverrides = { ...overrides }
    if (Object.keys(nextCategoryOverrides).length > 0) nextOverrides[category] = nextCategoryOverrides
    else delete nextOverrides[category]
    onOverridesChange(nextOverrides)
    setDraft(skillToDraft(editorMaps[category][selectedSkill]))
    setError("")
    setStatus("")
  }

  function restoreAllDefaults() {
    onOverridesChange({})
    setDraft(skillToDraft(editorMaps[category][selectedSkill]))
    setError("")
    setStatus("")
  }

  const isDefinitionCategory = category === "Buff" || category === "Debuff"

  return (
    <>
      <Panel className="skill-editor-panel">
        <div className="skill-editor-toolbar">
          <div className="skill-category-tabs" role="tablist" aria-label={t("ui.app.skillCategories")}>
            {visibleCategories.map(item => {
              const categoryModified = Object.keys(overrides[item] ?? {}).length > 0
              return (
                <Tab
                  key={item}
                  className="category-tab"
                  active={category === item}
                  modified={categoryModified}
                  onClick={() => setCategory(item)}
                >
                  {skillCategoryLabel(item)}
                </Tab>
              )
            })}
          </div>
          <Tab
            className="category-tab skill-editor-reset"
            modified={editorModified}
            disabled={!editorModified}
            onClick={restoreAllDefaults}
          >
            {t("ui.app.reset")}
          </Tab>
        </div>
        <div className="skill-editor-layout">
          <aside className="skill-list" aria-label={t("ui.app.namedSkills", { name: category })}>
            {skillIds.map(id => (
              <Tab
                key={id}
                className="skill-list-item"
                active={selectedSkill === id}
                modified={Boolean(overrides[category]?.[id])}
                onClick={() => selectSkill(id)}
              >
                <strong>{skillDisplayName(skills[id], id)}</strong>
                <small>{id}</small>
              </Tab>
            ))}
          </aside>
          <div className="skill-detail">
            <div className="skill-detail-heading">
              <div>
                <span className="detail-kicker">{category}</span>
                <h3>{skillDisplayName(skills[selectedSkill], selectedSkill)}</h3>
              </div>
            </div>
            {isDefinitionCategory ? (
              <>
                <div className="skill-basic-fields definition-basic-fields">
                  <label className="editor-field">
                    <span>{t("ui.app.name")}</span>
                    <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.maxStack")}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.maxStack}
                      onChange={event => setDraft({ ...draft, maxStack: event.target.value })}
                    />
                  </label>
                  <label className="editor-field editor-field-wide">
                    <span>{t("ui.app.description")}</span>
                    <input
                      value={draft.description}
                      onChange={event => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.duration")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={draft.duration}
                      onChange={event => setDraft({ ...draft, duration: event.target.value })}
                    />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.cooldown")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={draft.cooldown}
                      onChange={event => setDraft({ ...draft, cooldown: event.target.value })}
                    />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.refreshDuration")}</span>
                    <input
                      type="checkbox"
                      checked={draft.refresh}
                      onChange={event => setDraft({ ...draft, refresh: event.target.checked })}
                    />
                  </label>
                </div>
                <div className="structured-editor-grid">
                  <ArrayItemEditor
                    label={t("ui.app.effects")}
                    kind="effect"
                    items={draft.effectItems}
                    onChange={effectItems => setDraft({ ...draft, effectItems })}
                    skillIds={editorSkillIds}
                  />
                  <StackEffectsEditor
                    groups={draft.stackEffectGroups}
                    onChange={stackEffectGroups => setDraft({ ...draft, stackEffectGroups })}
                    skillIds={editorSkillIds}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="skill-basic-fields">
                  <label className="editor-field">
                    <span>{t("ui.app.name")}</span>
                    <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.shortName")}</span>
                    <input
                      value={draft.shortName}
                      onChange={event => setDraft({ ...draft, shortName: event.target.value })}
                    />
                  </label>
                  {category === "DOT" ? (
                    <>
                      <label className="editor-field">
                        <span>{t("ui.app.interval")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.periodicInterval}
                          onChange={event => setDraft({ ...draft, periodicInterval: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.firstTick")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.firstTick}
                          onChange={event => setDraft({ ...draft, firstTick: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.duration")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.duration}
                          onChange={event => setDraft({ ...draft, duration: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.maxStack")}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={draft.maxStack}
                          onChange={event => setDraft({ ...draft, maxStack: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.refreshDuration")}</span>
                        <input
                          type="checkbox"
                          checked={draft.refresh}
                          onChange={event => setDraft({ ...draft, refresh: event.target.checked })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.resetPeriodOnRefresh")}</span>
                        <input
                          type="checkbox"
                          checked={draft.resetOnRefresh}
                          onChange={event => setDraft({ ...draft, resetOnRefresh: event.target.checked })}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="editor-field">
                        <span>{t(combinedCastLayout ? "ui.app.wrapperCastTime" : "ui.app.castTime")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.castTime}
                          onChange={event => setDraft({ ...draft, castTime: event.target.value })}
                        />
                      </label>
                      {combinedCastLayout && (
                        <label className="editor-field">
                          <span>
                            {t("ui.app.combinedCastTime")}
                            {combinedCastLayout.conditional && <small> — {t("ui.app.combatDependentCastTime")}</small>}
                          </span>
                          <input readOnly value={`${Number(combinedCastLayout.castTime.toFixed(4))}s`} />
                        </label>
                      )}
                      <label className="editor-field">
                        <span>{t("ui.app.cooldown")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.cooldown}
                          onChange={event => setDraft({ ...draft, cooldown: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                  <label className="editor-field editor-field-wide">
                    <span>
                      {t("ui.app.tags")} <small>{t("ui.app.commaSeparated")}</small>
                    </span>
                    <input value={draft.tags} onChange={event => setDraft({ ...draft, tags: event.target.value })} />
                  </label>
                </div>
                <div className="json-editor-grid">
                  <ArrayItemEditor
                    label={t("ui.app.actions")}
                    kind="action"
                    items={draft.actionItems}
                    onChange={actionItems => setDraft({ ...draft, actionItems })}
                    skillIds={editorSkillIds}
                  />
                  <ArrayItemEditor
                    label={t("ui.app.modifiers")}
                    kind="modifier"
                    items={draft.modifierItems}
                    onChange={modifierItems => setDraft({ ...draft, modifierItems })}
                    skillIds={editorSkillIds}
                  />
                </div>
              </>
            )}
            {error && <p className="editor-error">{error}</p>}
            <div className="editor-actions">
              <Button variant="secondary" type="button" onClick={restoreDefault}>
                {t("ui.app.default")}
              </Button>
              <Button variant="primary" type="button" onClick={save}>
                {t("ui.app.save")}
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </>
  )
}
