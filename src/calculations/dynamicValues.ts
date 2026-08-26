export type DynamicParameters = Record<string, number | undefined>;
export type DynamicSwitchParameters = Record<string, unknown>;

export type SwitchValue = {
  function: "switch";
  param1: string;
  param2: Record<string, unknown>;
  fallback?: unknown;
  resolveAt?: "skillStart";
};

const finiteNumber = (value: unknown): number | undefined => {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function resolveMultiplyValue(value: unknown, parameters: DynamicParameters): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const definition = value as Record<string, unknown>;
  if (definition.function !== "multiply") return undefined;
  const left = typeof definition.param1 === "string" ? parameters[definition.param1] : finiteNumber(definition.param1);
  const right =
    typeof definition.param2 === "string" && definition.param2 in parameters
      ? parameters[definition.param2]
      : finiteNumber(definition.param2);
  return typeof left === "number" && Number.isFinite(left) && typeof right === "number" && Number.isFinite(right)
    ? left * right
    : undefined;
}

export function resolveSegmentValue(value: unknown, parameters: DynamicParameters): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const definition = value as Record<string, unknown>;
  if (definition.function !== "segment" || !Array.isArray(definition.param2) || !Array.isArray(definition.param3))
    return undefined;
  const parameter =
    typeof definition.param1 === "number"
      ? definition.param1
      : typeof definition.param1 === "string"
        ? parameters[definition.param1]
        : undefined;
  if (typeof parameter !== "number" || !Number.isFinite(parameter)) return undefined;
  const thresholds = definition.param2;
  const results = definition.param3;
  if (results.length < thresholds.length + 1) return undefined;
  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index];
    const result = results[index];
    if (
      typeof threshold !== "number" ||
      !Number.isFinite(threshold) ||
      typeof result !== "number" ||
      !Number.isFinite(result)
    )
      return undefined;
    if (parameter <= threshold) return result;
  }
  const overflowResult = results[thresholds.length];
  return typeof overflowResult === "number" && Number.isFinite(overflowResult) ? overflowResult : undefined;
}

export function resolveSwitchValue(value: unknown, parameters: DynamicSwitchParameters): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const definition = value as Record<string, unknown>;
  if (
    definition.function !== "switch" ||
    typeof definition.param1 !== "string" ||
    !definition.param2 ||
    typeof definition.param2 !== "object" ||
    Array.isArray(definition.param2)
  )
    return undefined;
  const selected = parameters[definition.param1];
  const cases = definition.param2 as Record<string, unknown>;
  if (
    (typeof selected === "string" || typeof selected === "number" || typeof selected === "boolean") &&
    Object.prototype.hasOwnProperty.call(cases, String(selected))
  )
    return cases[String(selected)];
  return definition.fallback;
}
