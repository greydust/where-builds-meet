/** Common 0.1 ms clock and merge policy for expected probability models. */
export const PROBABILITY_TICKS_PER_SECOND = 10_000
export const TINY_STATE_PROBABILITY = 1e-5
export const PROBABILITY_TIME_BUCKET_TICKS = 0.1 * PROBABILITY_TICKS_PER_SECOND

/** Only probability and time buckets determine eligibility; every numeric state field is weighted. */
export function mergeTinyProbabilityStates<T extends { probability: number }>(
  states: Iterable<T>,
  timingKeys: readonly (keyof T)[],
  valueKeys: readonly (keyof T)[],
  combinePayload?: (left: T, right: T) => T,
  threshold = TINY_STATE_PROBABILITY,
  bucketTicks = PROBABILITY_TIME_BUCKET_TICKS,
): T[] {
  const result: T[] = []
  const keys = [...timingKeys, ...valueKeys]
  const groups = new Map<
    string,
    { first: T; payload: T; resultIndex: number; probability: number; offsets?: number[] }
  >()
  for (const state of states) {
    if (state.probability >= threshold) {
      result.push(state)
      continue
    }
    let bucket = ""
    for (const key of timingKeys) bucket += `:${Math.floor(Number(state[key]) / bucketTicks)}`
    const group = groups.get(bucket)
    if (!group) {
      groups.set(bucket, { first: state, payload: state, resultIndex: result.length, probability: state.probability })
      result.push(state)
      continue
    }
    group.offsets ??= keys.map(() => 0)
    group.probability += state.probability
    if (combinePayload) group.payload = combinePayload(group.payload, state)
    for (let index = 0; index < keys.length; index++) {
      const value = Number(state[keys[index]])
      const origin = Number(group.first[keys[index]])
      // Equal infinite sentinels share a bucket and remain infinite.
      if (value !== origin) group.offsets[index] += (value - origin) * state.probability
    }
  }
  for (const group of groups.values()) {
    if (!group.offsets) continue
    const merged = { ...group.payload, probability: group.probability }
    for (let index = 0; index < keys.length; index++) {
      const origin = Number(group.first[keys[index]])
      const offset = group.offsets[index] / group.probability
      let value = origin + offset
      if (index < timingKeys.length) value = Number.isInteger(origin) ? origin + Math.round(offset) : Math.round(value)
      merged[keys[index]] = value as T[keyof T]
    }
    result[group.resultIndex] = merged
  }
  return result
}
