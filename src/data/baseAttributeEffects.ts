import type { CharacterStats } from "../types";
import type { StatEffectContainer, StatEffectValues } from "../calculations/statEffects";

export type BaseAttributeKey = "body" | "power" | "defense" | "agility" | "momentum";
export type BaseAttributeData = Record<BaseAttributeKey, Partial<Record<keyof CharacterStats, number>>>;

export function createBaseAttributeEffects(baseAttributeData: BaseAttributeData): StatEffectContainer[] {
  return Object.entries(baseAttributeData).map(([source, conversions]) => ({
    stat: Object.fromEntries(Object.entries(conversions).map(([target, multiplier]) => [
      target,
      { formula: { source, multiplier } },
    ])) as StatEffectValues,
  }));
}
