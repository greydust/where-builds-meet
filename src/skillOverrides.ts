import type { EffectDefinition, SkillRecord } from "./calculations/rotationTimeline";

export type SkillMap = Record<string, SkillRecord>;
export type SkillCategory =
  "Snowparting" | "Phalanxbane" | "Thundercry" | "Stormbreaker" | "Heavenwill" | "Skygrasp" | "Mystic" | "General";
export type EditorCategory = SkillCategory | "Buff" | "Debuff" | "DOT";
export type SkillOverrides = Partial<Record<EditorCategory, SkillMap>>;

export function resolveSkillCalculationDefinitions(
  defaultSkillMaps: Record<SkillCategory, SkillMap>,
  defaultEffectDefinitions: Record<string, EffectDefinition>,
  defaultDotDefinitions: SkillMap,
  overrides: SkillOverrides,
) {
  const skills = Object.assign(
    {},
    ...(Object.entries(defaultSkillMaps) as Array<[SkillCategory, SkillMap]>).map(([category, definitions]) => ({
      ...definitions,
      ...(overrides[category] ?? {}),
    })),
  ) as SkillMap;
  const dots = { ...defaultDotDefinitions, ...(overrides.DOT ?? {}) };
  const effectDefinitions = {
    ...defaultEffectDefinitions,
    ...(overrides.Buff ?? {}),
    ...(overrides.Debuff ?? {}),
    ...(overrides.DOT ?? {}),
  } as Record<string, EffectDefinition>;
  return { skills, dots, effectDefinitions };
}
