import type { DamageOutcome } from "./damage";

export const OUTCOME_BUFF_TICKS_PER_SECOND = 10_000;

export type OutcomeTriggeredBuff = {
  name: string;
  outcome: DamageOutcome;
  durationTicks: number;
  maxStack: number;
  physicalAttackBonusPerStack: number;
};

export type ExpectedOutcomeBuffSchedule = Record<string, Record<string, number>>;

type StackDistribution = Map<number, Map<number, number>>;
type ConcreteBuffState = { stack: number; expiresAtTick: number };

function addProbability(distribution: StackDistribution, stack: number, expiresAtTick: number, probability: number) {
  if (probability <= 0) return;
  const expiries = distribution.get(stack) ?? new Map<number, number>();
  expiries.set(expiresAtTick, (expiries.get(expiresAtTick) ?? 0) + probability);
  distribution.set(stack, expiries);
}

function activeDistribution(distribution: StackDistribution, tick: number): StackDistribution {
  const active = new Map<number, Map<number, number>>();
  for (const [stack, expiries] of distribution) {
    for (const [expiresAtTick, probability] of expiries) {
      if (stack > 0 && expiresAtTick <= tick) addProbability(active, 0, 0, probability);
      else addProbability(active, stack, expiresAtTick, probability);
    }
  }
  return active;
}

export class ExpectedOutcomeBuffTracker {
  private readonly distributions = new Map<string, StackDistribution>();

  expectedStack(buff: OutcomeTriggeredBuff, tick: number) {
    const distribution = activeDistribution(
      this.distributions.get(buff.name) ?? new Map([[0, new Map([[0, 1]])]]),
      tick,
    );
    this.distributions.set(buff.name, distribution);
    let expected = 0;
    for (const [stack, expiries] of distribution)
      for (const probability of expiries.values()) expected += stack * probability;
    return expected;
  }

  resolveOutcome(buff: OutcomeTriggeredBuff, tick: number, probability: number) {
    const chance = Math.min(1, Math.max(0, probability));
    const current = activeDistribution(this.distributions.get(buff.name) ?? new Map([[0, new Map([[0, 1]])]]), tick);
    const next: StackDistribution = new Map();
    for (const [stack, expiries] of current) {
      for (const [expiresAtTick, stateProbability] of expiries) {
        addProbability(next, stack, expiresAtTick, stateProbability * (1 - chance));
        addProbability(next, Math.min(buff.maxStack, stack + 1), tick + buff.durationTicks, stateProbability * chance);
      }
    }
    this.distributions.set(buff.name, next);
  }
}

export class SimulatedOutcomeBuffTracker {
  private readonly states = new Map<string, ConcreteBuffState>();

  stack(buff: OutcomeTriggeredBuff, tick: number) {
    const state = this.states.get(buff.name);
    if (!state || (state.stack > 0 && state.expiresAtTick <= tick)) {
      this.states.set(buff.name, { stack: 0, expiresAtTick: 0 });
      return 0;
    }
    return state.stack;
  }

  resolveOutcome(buff: OutcomeTriggeredBuff, tick: number) {
    const stack = this.stack(buff, tick);
    this.states.set(buff.name, {
      stack: Math.min(buff.maxStack, stack + 1),
      expiresAtTick: tick + buff.durationTicks,
    });
  }
}

export function outcomeBuffTick(seconds: number | undefined) {
  return Math.round((seconds ?? 0) * OUTCOME_BUFF_TICKS_PER_SECOND);
}
