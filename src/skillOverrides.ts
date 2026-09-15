import type { EffectDefinition, SkillRecord } from "./calculations/rotationTimeline";

export type SkillMap = Record<string, SkillRecord>;
export type SkillCategory =
  | "Snowparting"
  | "Phalanxbane"
  | "Thundercry"
  | "Stormbreaker"
  | "Heavenwill"
  | "Skygrasp"
  | "Panacea"
  | "Soulshade"
  | "Infernal"
  | "Mortal"
  | "Mystic"
  | "General";
export type EditorCategory = SkillCategory | "Buff" | "Debuff" | "DOT";
export type SkillOverrides = Partial<Record<EditorCategory, SkillMap>>;

export function deserializeSkillOverrides(value: unknown): SkillOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const stored = value as Record<string, unknown>;
  const currentCoefficients = stored.version === 2 || stored.version === 3;
  const exclusiveSegments = stored.version === 3;
  const migrate = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(migrate);
    if (!entry || typeof entry !== "object") return entry;
    const record = Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, migrate(child)]));
    if (record.stackDamage !== undefined) {
      if (record.stackDamage === true && record.tickOnExpire === undefined) record.tickOnExpire = false;
      delete record.stackDamage;
    }
    if (
      !exclusiveSegments &&
      record.function === "segment" &&
      Array.isArray(record.param2) &&
      Array.isArray(record.param3)
    ) {
      // The next representable number preserves every finite input of the old <= comparison.
      const bytes = new DataView(new ArrayBuffer(8));
      const maxIndex = record.param2.indexOf(Number.MAX_VALUE);
      if (maxIndex >= 0) {
        record.param2 = record.param2.slice(0, maxIndex);
        record.param3 = record.param3.slice(0, maxIndex + 1);
      }
      record.param2 = (record.param2 as unknown[]).map((threshold) => {
        if (typeof threshold !== "number" || !Number.isFinite(threshold)) return threshold;
        if (threshold === 0) return Number.MIN_VALUE;
        bytes.setFloat64(0, threshold);
        bytes.setBigUint64(0, bytes.getBigUint64(0) + (threshold > 0 ? 1n : -1n));
        return bytes.getFloat64(0);
      });
    }
    switch (record.type) {
      case "damage":
        if (!currentCoefficients && record.attrCoef === undefined) record.attrCoef = record.phyCoef ?? 0;
        break;
      case "heal":
        if (!currentCoefficients && record.silkbindCoef === undefined) record.silkbindCoef = record.phyCoef ?? 0;
        break;
    }
    return record;
  };
  return migrate(currentCoefficients ? (stored.overrides ?? {}) : value) as SkillOverrides;
}

export function serializeSkillOverrides(overrides: SkillOverrides) {
  return JSON.stringify({ version: 3, overrides });
}

export function resolveSkillCalculationDefinitions(
  defaultSkillMaps: Record<SkillCategory, SkillMap>,
  defaultEffectDefinitions: Record<string, EffectDefinition>,
  defaultDotDefinitions: SkillMap,
  overrides: SkillOverrides,
) {
  const skills = Object.assign(
    {},
    ...(Object.entries(defaultSkillMaps) as Array<[SkillCategory, SkillMap]>).map(([category, definitions]) =>
      Object.assign({}, definitions, overrides[category]),
    ),
  ) as SkillMap;
  const dots = { ...defaultDotDefinitions, ...overrides.DOT };
  const effectDefinitions = {
    ...defaultEffectDefinitions,
    ...overrides.Buff,
    ...overrides.Debuff,
    ...overrides.DOT,
  } as Record<string, EffectDefinition>;
  return { skills, dots, effectDefinitions };
}
