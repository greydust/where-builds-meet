import type {
  RotationSimulationBaseline,
  RotationSimulationBundle,
  RotationSimulationVariant,
} from "./rotationCalculator";
import type { RotationMetrics } from "./rotationMetrics";

export function calculationFingerprint(value: unknown) {
  const serialized = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${serialized.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function calculationVariant(variant: RotationSimulationVariant) {
  if (!variant.timeline) return variant;
  const { name: _displayName, ...rotation } = variant.timeline.rotation;
  return { ...variant, timeline: { ...variant.timeline, rotation } };
}

export function rotationBundleFingerprint(bundle: RotationSimulationBundle) {
  const { name: _displayName, ...rotation } = bundle.timeline.rotation;
  return calculationFingerprint({
    martialArts: [...bundle.weapons],
    ...bundle,
    timeline: { ...bundle.timeline, rotation },
  });
}

export function rotationVariantFingerprint(
  category: string,
  field: string,
  group: string | undefined,
  variant: RotationSimulationVariant,
) {
  return calculationFingerprint({ category, field, group, variant: calculationVariant(variant) });
}

function writeBounded<Value>(cache: Map<string, Value>, key: string, value: Value, maximumEntries: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maximumEntries) cache.delete(cache.keys().next().value!);
}

export class RotationCalculationCache {
  readonly #baselines = new Map<string, RotationSimulationBaseline>();
  readonly #variants = new Map<string, RotationMetrics>();

  baseline(fingerprint: string) {
    return this.#baselines.get(fingerprint);
  }

  storeBaseline(fingerprint: string, result: RotationSimulationBaseline) {
    writeBounded(this.#baselines, fingerprint, result, 64);
  }

  variant(fingerprint: string, variantFingerprint: string) {
    return this.#variants.get(`${fingerprint}:${variantFingerprint}`);
  }

  storeVariant(fingerprint: string, variantFingerprint: string, result: RotationMetrics) {
    writeBounded(this.#variants, `${fingerprint}:${variantFingerprint}`, result, 4096);
  }
}
