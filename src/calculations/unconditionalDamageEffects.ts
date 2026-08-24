export const unconditionalDamageEffectFields = [
  "physicalAttackBonus",
  "bellstrikeAttackBonus",
  "stonesplitAttackBonus",
  "silkbindAttackBonus",
  "bamboocutAttackBonus",
  "bellstrikePenetration",
  "stonesplitPenetration",
  "silkbindPenetration",
  "bamboocutPenetration",
  "bellstrikeResistance",
  "stonesplitResistance",
  "silkbindResistance",
  "bamboocutResistance",
  "dmgBonus",
  "hpDMGBonus",
  "baseDMGBonus",
  "globalDmgBonus",
  "globalHPDMGBonus",
  "globalBellstrikeDMGBonus",
  "dotDamage",
  "physicalPenetration",
  "defenseBonus",
  "physicalResistance",
  "critDmgBonus",
  "affinityDmgBonus",
  "attributeDMGBonus",
] as const;

export type UnconditionalDamageEffectField = (typeof unconditionalDamageEffectFields)[number];
export type UnconditionalDamageEffects = Partial<Record<UnconditionalDamageEffectField, number>>;

const unconditionalDamageEffectFieldSet = new Set<string>(unconditionalDamageEffectFields);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function addUnconditionalDamageEffects(
  ...effects: Array<UnconditionalDamageEffects | undefined>
): UnconditionalDamageEffects {
  const result: UnconditionalDamageEffects = {};
  for (const effect of effects) {
    if (!effect) continue;
    for (const field of unconditionalDamageEffectFields) {
      const value = effect[field];
      if (typeof value !== "number" || !Number.isFinite(value) || value === 0) continue;
      const total = (result[field] ?? 0) + value;
      if (Math.abs(total) < 1e-12) delete result[field];
      else result[field] = total;
    }
  }
  return result;
}

export function subtractUnconditionalDamageEffects(
  total: UnconditionalDamageEffects | undefined,
  removed: UnconditionalDamageEffects | undefined,
): UnconditionalDamageEffects {
  if (!removed) return { ...(total ?? {}) };
  const negative = Object.fromEntries(
    Object.entries(removed).map(([field, value]) => [field, -value]),
  ) as UnconditionalDamageEffects;
  return addUnconditionalDamageEffects(total, negative);
}

export function splitUnconditionalDamageEffectRules(rules: unknown[] | undefined): {
  unconditional: UnconditionalDamageEffects;
  remaining: unknown[];
} {
  const unconditional: UnconditionalDamageEffects = {};
  const remaining: unknown[] = [];

  for (const rule of rules ?? []) {
    if (!isObject(rule) || Object.keys(rule).length !== 1 || !isObject(rule.effect)) {
      remaining.push(rule);
      continue;
    }
    const fields = Object.entries(rule.effect);
    if (
      fields.length === 0 ||
      fields.some(
        ([field, value]) =>
          !unconditionalDamageEffectFieldSet.has(field) || typeof value !== "number" || !Number.isFinite(value),
      )
    ) {
      remaining.push(rule);
      continue;
    }
    for (const [field, value] of fields) {
      const typedField = field as UnconditionalDamageEffectField;
      unconditional[typedField] = (unconditional[typedField] ?? 0) + (value as number);
    }
  }

  return { unconditional, remaining };
}
