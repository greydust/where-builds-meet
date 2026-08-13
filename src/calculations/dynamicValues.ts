export type DynamicParameters = Record<string, number | undefined>;

export function resolveSegmentValue(value: unknown, parameters: DynamicParameters): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const definition = value as Record<string, unknown>;
  if (definition.function !== "segment" || !Array.isArray(definition.param2) || !Array.isArray(definition.param3)) return undefined;
  const parameter = typeof definition.param1 === "number"
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
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || typeof result !== "number" || !Number.isFinite(result)) return undefined;
    if (parameter <= threshold) return result;
  }
  const overflowResult = results[thresholds.length];
  return typeof overflowResult === "number" && Number.isFinite(overflowResult) ? overflowResult : undefined;
}
