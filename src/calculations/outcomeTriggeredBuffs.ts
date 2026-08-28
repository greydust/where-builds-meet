export const OUTCOME_BUFF_TICKS_PER_SECOND = 10_000;

export type ExpectedOutcomeBuffSchedule = Record<string, Record<string, number>>;

export function outcomeBuffTick(seconds: number | undefined) {
  return Math.round((seconds ?? 0) * OUTCOME_BUFF_TICKS_PER_SECOND);
}

export function outcomeProbability(value: number) {
  return Math.min(1, Math.max(0, value));
}
