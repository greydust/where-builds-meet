import {
  periodicStateListFactory,
  mergePeriodicLists,
  type PeriodicStateList,
  type PeriodicStateStorage,
} from "./periodicStateLists"
import {
  mergeTinyProbabilityStates,
  PROBABILITY_TICKS_PER_SECOND,
  TINY_STATE_PROBABILITY,
} from "./probabilityStateMerging"

export const OUTCOME_BUFF_TICKS_PER_SECOND = PROBABILITY_TICKS_PER_SECOND

export type ExpectedOutcomeBuffSchedule = Record<string, Record<string, number>>

export function outcomeBuffTick(seconds: number | undefined) {
  return Math.round((seconds ?? 0) * OUTCOME_BUFF_TICKS_PER_SECOND)
}

export function outcomeProbability(value: number) {
  return Math.min(1, Math.max(0, value))
}

/** First strictly later grid boundary, never earlier than battle second one. */
export function nextBattlePeriodicTick(time: number, interval: number, origin: number) {
  const step = outcomeBuffTick(interval)
  const start = outcomeBuffTick(origin)
  return (
    (start + Math.max(1, Math.floor((outcomeBuffTick(time) - start) / step) + 1) * step) / OUTCOME_BUFF_TICKS_PER_SECOND
  )
}

export type MaxStackAction = { consume: "all"; trigger: string; triggerTags?: string[] }

export function maxStackActionFor(stack: number, maxStack: number | undefined, action?: MaxStackAction) {
  return action?.consume === "all" && maxStack !== undefined && stack >= maxStack ? action : undefined
}

type PeriodicPartition = { inactive: number; owners: Map<string, Map<number, PeriodicStateList>> }

/** Stack-indexed sorted expiration lists. Branches exist only until causal follow-ups finish. */
export class ExpectedPeriodicTracker {
  private sharedTick?: number
  private branches = new Map<string | undefined, PeriodicPartition>([[undefined, { inactive: 1, owners: new Map() }]])
  private readonly orderedStacks = new WeakMap<Map<number, PeriodicStateList>, [number, PeriodicStateList][]>()
  private readonly createList: () => PeriodicStateList
  private readonly interval: number
  private readonly firstTick: number
  private readonly tickOnExpire: boolean
  private readonly periodicDuration?: number
  private periodicExpiryOffset = 0
  private tickOrigin?: number | null

  constructor(
    interval: number,
    firstTick: number,
    tickOrigin?: number | null,
    storage: PeriodicStateStorage = "indexed",
    tickOnExpire = false,
    periodicDuration?: number,
  ) {
    this.periodicDuration = periodicDuration
    this.tickOnExpire = tickOnExpire
    this.interval = interval
    this.firstTick = firstTick
    this.tickOrigin = tickOrigin
    this.createList = periodicStateListFactory(storage)
  }

  /** Bind a shared clock that was waiting for battle start; existing applications are retained. */
  startBattle(time: number) {
    if (this.tickOrigin !== null) return
    this.tickOrigin = time
    this.advanceSharedTick(outcomeBuffTick(time + this.interval))
  }

  private partition(branch?: string) {
    let partition = this.branches.get(branch)
    if (!partition) this.branches.set(branch, (partition = { inactive: 0, owners: new Map() }))
    return partition
  }

  private list(partition: PeriodicPartition, source: string, stack: number) {
    let stacks = partition.owners.get(source)
    if (!stacks) partition.owners.set(source, (stacks = new Map()))
    let list = stacks.get(stack)
    if (!list) {
      stacks.set(stack, (list = this.createList()))
      this.orderedStacks.delete(stacks)
    }
    return list
  }

  private visitLists(visit: (list: PeriodicStateList, source: string, stack: number) => void) {
    for (const partition of this.branches.values())
      for (const [source, stacks] of partition.owners) {
        let ordered = this.orderedStacks.get(stacks)
        if (!ordered) {
          ordered = [...stacks].sort(([left], [right]) => left - right)
          this.orderedStacks.set(stacks, ordered)
        }
        for (const [stack, list] of ordered) if (list.size) visit(list, source, stack)
      }
  }

  /** Marginal stack probabilities for a refreshing, finite-duration effect. */
  stackProbabilities(time: number) {
    const now = outcomeBuffTick(time)
    const probabilities = new Map<number, number>([[0, 1]])
    this.visitLists((list, _source, stack) => {
      for (let index = list.head; index >= 0; index = list.next(index)) {
        if (list.expires[index] <= now) continue
        probabilities.set(stack, (probabilities.get(stack) ?? 0) + list.mass[index])
        probabilities.set(0, probabilities.get(0)! - list.mass[index])
      }
    })
    probabilities.set(0, Math.max(0, probabilities.get(0)!))
    return probabilities
  }

  /** Expected seconds at maximum stacks before the next application or expiration. */
  maxStackDuration(start: number, end: number, maxStack: number) {
    const from = outcomeBuffTick(start)
    const until = outcomeBuffTick(end)
    let activeTicks = 0
    this.visitLists((list, _source, stack) => {
      if (stack !== maxStack) return
      for (let index = list.head; index >= 0; index = list.next(index))
        activeTicks += list.mass[index] * Math.max(0, Math.min(until, list.expires[index]) - from)
    })
    return activeTicks / OUTCOME_BUFF_TICKS_PER_SECOND
  }

  /** Joint tick/stack weights, normalized to the condition that this linked DOT ticks. */
  tickStackProbabilities(time: number) {
    const tick = outcomeBuffTick(time)
    const interval = outcomeBuffTick(this.interval)
    const probabilities = new Map<number, number>()
    let total = 0
    if (this.tickOrigin === null) return probabilities
    if (
      this.tickOrigin !== undefined &&
      (this.sharedTick === undefined ||
        tick < this.sharedTick ||
        (tick - outcomeBuffTick(this.tickOrigin)) % interval !== 0)
    )
      return probabilities
    this.visitLists((list, _source, stack) => {
      for (let index = list.head; index >= 0; index = list.next(index)) {
        if (!this.tickBeforeExpiry(tick, list.expires[index] - this.periodicExpiryOffset)) continue
        let mass = 0
        if (this.tickOrigin !== undefined)
          mass = list.mass[index] - (tick === this.sharedTick ? list.pending[index] : 0)
        else
          for (const [next, weight] of list.cadences[index] ?? []) {
            if (tick >= next && (tick - next) % interval === 0) mass += weight
          }
        probabilities.set(stack, (probabilities.get(stack) ?? 0) + mass)
        total += mass
      }
    })
    return total > 0
      ? new Map([...probabilities].map(([stack, probability]) => [stack, probability / total]))
      : new Map<number, number>()
  }

  private tickBeforeExpiry(tick: number, expiry: number) {
    return this.tickOnExpire ? tick <= expiry : tick < expiry
  }

  get stateCount() {
    let count = 0
    for (const partition of this.branches.values()) if (partition.inactive > 0) count++
    this.visitLists(list => {
      count += list.size
    })
    return count
  }

  private advanceSharedTick(tick: number) {
    if (this.sharedTick !== undefined && tick <= this.sharedTick) return
    this.sharedTick = tick
    this.visitLists(list => {
      for (let index = list.head; index >= 0; index = list.next(index)) list.pending[index] = 0
    })
  }

  private accumulateCadences(target: Map<number, number>, source: Map<number, number>, scale: number, now: number) {
    const interval = outcomeBuffTick(this.interval)
    for (const [tick, mass] of source) {
      const advanced = tick < now ? tick + Math.ceil((now - tick) / interval) * interval : tick
      target.set(advanced, (target.get(advanced) ?? 0) + mass * scale)
    }
  }

  apply(
    time: number,
    chance: number,
    duration: number,
    maxStack: number,
    gain: number,
    source: string,
    onMaxStack?: MaxStackAction,
    emittedBranch?: string,
    onlyBranch?: string,
  ) {
    const now = outcomeBuffTick(time)
    if (this.tickOrigin !== undefined && this.tickOrigin !== null) {
      const origin = outcomeBuffTick(this.tickOrigin)
      const interval = outcomeBuffTick(this.interval)
      this.advanceSharedTick(origin + Math.max(1, Math.ceil((now - origin) / interval)) * interval)
    }
    const expiry = now + outcomeBuffTick(duration)
    this.periodicExpiryOffset =
      this.periodicDuration === undefined ? 0 : outcomeBuffTick(duration - this.periodicDuration)
    const affected = onlyBranch === undefined ? [...this.branches.values()] : [this.branches.get(onlyBranch)]
    let thresholdProbability = 0
    for (const partition of affected) {
      if (!partition) continue
      const stackValues = new Set<number>()
      // Expired entries become inactive before this hit's transition.
      for (const stacks of partition.owners.values()) {
        for (const stack of stacks.keys()) stackValues.add(stack)
        for (const list of stacks.values()) {
          if (!list) continue
          while (list.head >= 0 && list.expires[list.head] <= now) {
            partition.inactive += list.mass[list.head]
            list.shift()
          }
        }
      }
      for (const stack of [...stackValues].sort((a, b) => b - a)) {
        let gained = 0,
          pending = 0
        const cadence = this.tickOrigin === undefined ? new Map<number, number>() : undefined
        for (const stacks of partition.owners.values()) {
          const list = stacks.get(stack)
          if (!list?.size) continue
          list.retain(index => {
            const mass = list.mass[index]
            gained += mass * chance
            // A linked DOT can have expired while its longer debuff still has stacks.
            // Reapplication at the unprocessed boundary must wait for the next tick.
            const startsFreshTick = now === this.sharedTick && list.expires[index] - this.periodicExpiryOffset <= now
            pending += (startsFreshTick ? mass : list.pending[index]) * chance
            const times = list.cadences[index]
            if (cadence && times) {
              if (list.expires[index] - this.periodicExpiryOffset <= now) {
                const next = now + outcomeBuffTick(this.firstTick)
                cadence.set(next, (cadence.get(next) ?? 0) + mass * chance)
              } else this.accumulateCadences(cadence, times, chance, now)
            }
            list.mass[index] = mass * (1 - chance)
            list.pending[index] *= 1 - chance
            if (times) for (const [tick, value] of times) times.set(tick, value * (1 - chance))
            return list.mass[index] > 0
          })
        }
        if (!(gained > 0)) continue
        if (maxStackActionFor(stack + gain, maxStack, onMaxStack)) thresholdProbability += gained
        else this.list(partition, source, Math.min(maxStack, stack + gain)).add(expiry, gained, pending, cadence)
      }
      const gained = partition.inactive * chance
      partition.inactive *= 1 - chance
      if (gained > 0) {
        if (maxStackActionFor(gain, maxStack, onMaxStack)) thresholdProbability += gained
        else if (gain === 0) partition.inactive += gained
        else
          this.list(partition, source, Math.min(maxStack, gain)).add(
            expiry,
            gained,
            now === this.sharedTick ? gained : 0,
            this.tickOrigin === undefined ? new Map([[now + outcomeBuffTick(this.firstTick), gained]]) : undefined,
          )
      }
      for (const [owner, stacks] of partition.owners)
        if (![...stacks.values()].some(list => list.size)) partition.owners.delete(owner)
    }
    // Never feed threshold-created zero-stack mass back through the original hit.
    if (thresholdProbability > 0) this.partition(emittedBranch).inactive += thresholdProbability
    return thresholdProbability
  }

  expire(time: number, source: string, chance: number, branch: string) {
    const tick = outcomeBuffTick(time)
    let expired = 0
    for (const partition of this.branches.values()) {
      const stacks = partition.owners.get(source)
      if (!stacks) continue
      for (const list of stacks.values()) {
        if (!list) continue
        // Chronological scheduling consumes heads in O(1), without compacting the list.
        if (list.head >= 0 && list.expires[list.head] === tick) {
          expired += list.mass[list.head]
          list.shift()
        } else if (list.head >= 0 && list.expires[list.head] < tick) {
          // Direct tracker queries can address a later expiry without advancing earlier ones.
          list.retain(index => {
            if (list.expires[index] !== tick) return true
            expired += list.mass[index]
            return false
          })
        }
      }
      if (![...stacks.values()].some(list => list.size)) partition.owners.delete(source)
    }
    const probability = expired * chance
    if (expired > probability) this.partition().inactive += expired - probability
    if (probability > 0) this.partition(branch).inactive += probability
    return probability
  }

  releaseBranch(branch: string) {
    const partition = this.branches.get(branch)
    if (!partition) return
    this.branches.delete(branch)
    const target = this.partition()
    target.inactive += partition.inactive
    for (const [source, stacks] of partition.owners)
      for (const [stack, list] of stacks) {
        if (!list?.size) continue
        const destination = this.list(target, source, stack)
        mergePeriodicLists(destination, list)
      }
  }

  /** Expiration order is obtained from list heads, not a map of all future wakeups. */
  nextExpiration(afterTime = Number.NEGATIVE_INFINITY) {
    const after = Math.round(afterTime * OUTCOME_BUFF_TICKS_PER_SECOND)
    let earliest = Infinity
    this.visitLists(list => {
      let index = list.head
      while (index >= 0 && list.expires[index] <= after) index = list.next(index)
      if (index >= 0) earliest = Math.min(earliest, list.expires[index])
    })
    return Number.isFinite(earliest) ? earliest / OUTCOME_BUFF_TICKS_PER_SECOND : undefined
  }

  expirationSources(time: number) {
    const tick = outcomeBuffTick(time)
    const sources = new Set<string>()
    this.visitLists((list, source) => {
      let index = list.head
      while (index >= 0 && list.expires[index] < tick) index = list.next(index)
      if (index >= 0 && list.expires[index] === tick) sources.add(source)
    })
    return sources
  }

  expirationProbability(time: number, source: string) {
    const tick = outcomeBuffTick(time)
    let probability = 0
    for (const partition of this.branches.values()) {
      const stacks = partition.owners.get(source)
      if (!stacks) continue
      for (const list of stacks.values()) {
        if (!list) continue
        for (let index = list.head; index >= 0 && list.expires[index] <= tick; index = list.next(index))
          if (list.expires[index] === tick) probability += list.mass[index]
      }
    }
    return probability
  }

  /** Merge released tiny states by time bucket, weighting stacks and retaining source mass as a mixture. */
  mergeTinyExpirations(_time: number) {
    const partition = this.branches.get(undefined)
    if (!partition) return false
    const states = []
    for (const [source, stacks] of partition.owners)
      for (const [stack, list] of stacks)
        for (let index = list.head; index >= 0; index = list.next(index)) {
          const probability = list.mass[index]
          if (probability >= TINY_STATE_PROBABILITY) continue
          states.push({
            list,
            index,
            stack,
            expires: list.expires[index],
            probability,
            pendingFraction: list.pending[index] / probability,
            owners: new Map([[source, probability]]),
            cadences: list.cadences[index],
          })
        }
    if (states.length < 2) return false
    const merged = mergeTinyProbabilityStates(states, ["expires"], ["stack", "pendingFraction"], (left, right) => {
      const owners = new Map(left.owners)
      for (const [source, probability] of right.owners) owners.set(source, (owners.get(source) ?? 0) + probability)
      const cadences = left.cadences || right.cadences ? new Map(left.cadences) : undefined
      if (cadences)
        for (const [tick, probability] of right.cadences ?? [])
          cadences.set(tick, (cadences.get(tick) ?? 0) + probability)
      return { ...left, owners, cadences }
    })
    if (merged.length === states.length) return false
    const originals = new Set(states)
    const unchanged = new Set(merged.filter(state => originals.has(state)))
    const removals = new Map<PeriodicStateList, Set<number>>()
    for (const state of states) {
      if (unchanged.has(state)) continue
      let indices = removals.get(state.list)
      if (!indices) removals.set(state.list, (indices = new Set()))
      indices.add(state.index)
    }
    // Significant states and singleton rare states stay in their original slots.
    for (const [list, indices] of removals) list.retain(index => !indices.has(index))
    for (const [source, stacks] of partition.owners) {
      for (const [stack, list] of stacks)
        if (!list.size) {
          stacks.delete(stack)
          this.orderedStacks.delete(stacks)
        }
      if (!stacks.size) partition.owners.delete(source)
    }
    for (const state of merged) {
      if (originals.has(state)) continue
      const cadences = state.cadences
        ? mergeTinyProbabilityStates(
            [...state.cadences].map(([tick, probability]) => ({ tick, probability })),
            ["tick"],
            [],
          )
        : undefined
      for (const [source, probability] of state.owners) {
        const fraction = probability / state.probability
        this.list(partition, source, state.stack).add(
          state.expires,
          probability,
          state.pendingFraction * probability,
          cadences ? new Map(cadences.map(cadence => [cadence.tick, cadence.probability * fraction])) : undefined,
        )
      }
    }
    return true
  }

  consumeTick(time: number) {
    if (this.tickOrigin === null) return
    const tick = outcomeBuffTick(time),
      interval = outcomeBuffTick(this.interval)
    if (this.tickOrigin !== undefined) {
      this.advanceSharedTick(outcomeBuffTick(nextBattlePeriodicTick(time, this.interval, this.tickOrigin)))
      return
    }
    this.visitLists(list => {
      for (let index = list.head; index >= 0; index = list.next(index)) {
        const times = list.cadences[index]
        if (!times) continue
        // Snapshot: the loop deletes and re-inserts entries in `times`, so it must not iterate the live map.
        const pending = [...times]
        for (const [next, mass] of pending) {
          if (next > tick) continue
          const advanced = next + (Math.floor((tick - next) / interval) + 1) * interval
          times.delete(next)
          times.set(advanced, (times.get(advanced) ?? 0) + mass)
        }
      }
    })
  }

  nextTick(afterTime: number, includeCurrentTime = false) {
    if (this.tickOrigin === null) return undefined
    const after = outcomeBuffTick(afterTime) + (includeCurrentTime ? 0 : 1),
      interval = outcomeBuffTick(this.interval)
    if (this.tickOrigin !== undefined) {
      if (this.sharedTick === undefined) return undefined
      const origin = outcomeBuffTick(this.tickOrigin)
      const first = Math.max(this.sharedTick, origin + Math.max(1, Math.ceil((after - origin) / interval)) * interval)
      for (const tick of [first, first + interval]) {
        let active = false
        this.visitLists(list => {
          for (let index = list.head; !active && index >= 0; index = list.next(index))
            if (
              this.tickBeforeExpiry(tick, list.expires[index]) &&
              list.mass[index] - (tick === this.sharedTick ? list.pending[index] : 0) > 0
            )
              active = true
        })
        if (active) return tick / OUTCOME_BUFF_TICKS_PER_SECOND
      }
      return undefined
    }
    let earliest = Infinity
    this.visitLists(list => {
      for (let index = list.head; index >= 0; index = list.next(index))
        for (const next of list.cadences[index]?.keys() ?? []) {
          const tick = next < after ? next + Math.ceil((after - next) / interval) * interval : next
          if (this.tickBeforeExpiry(tick, list.expires[index])) earliest = Math.min(earliest, tick)
        }
    })
    return Number.isFinite(earliest) ? earliest / OUTCOME_BUFF_TICKS_PER_SECOND : undefined
  }

  tickAt(time: number) {
    const tick = outcomeBuffTick(time),
      interval = outcomeBuffTick(this.interval)
    const result = { time, probability: 0, sources: {} as Record<string, number> }
    if (this.tickOrigin === null) return result
    if (
      this.tickOrigin !== undefined &&
      (this.sharedTick === undefined ||
        tick < this.sharedTick ||
        (tick - outcomeBuffTick(this.tickOrigin)) % interval !== 0)
    )
      return result
    this.visitLists((list, source) => {
      for (let index = list.head; index >= 0; index = list.next(index)) {
        if (!this.tickBeforeExpiry(tick, list.expires[index])) continue
        let mass = 0
        if (this.tickOrigin !== undefined)
          mass = list.mass[index] - (tick === this.sharedTick ? list.pending[index] : 0)
        else
          for (const [next, weight] of list.cadences[index] ?? [])
            if (tick >= next && (tick - next) % interval === 0) mass += weight
        result.probability += mass
        result.sources[source] = (result.sources[source] ?? 0) + mass
      }
    })
    return result
  }
}

/** Cooldown readiness distribution for outcome-dependent resource procs. */
export class OutcomeCooldownTracker {
  private readiness = new Map<number, number>([[-Infinity, 1]])

  resolve(time: number, probability: number, cooldown: number): number {
    const chance = outcomeProbability(probability)
    const next = new Map<number, number>()
    const add = (readyAt: number, weight: number) => {
      if (weight > 0) next.set(readyAt, (next.get(readyAt) ?? 0) + weight)
    }
    let proc = 0
    for (const [readyAt, weight] of this.readiness) {
      if (readyAt > time) add(readyAt, weight)
      else {
        proc += weight * chance
        add(-Infinity, weight * (1 - chance))
        add(time + cooldown, weight * chance)
      }
    }
    const merged = mergeTinyProbabilityStates(
      [...next].map(([readyAt, probability]) => ({
        readyAt,
        readyAtTick: readyAt * OUTCOME_BUFF_TICKS_PER_SECOND,
        probability,
      })),
      ["readyAtTick"],
      ["readyAt"],
    )
    this.readiness = new Map()
    for (const state of merged) {
      const readyAt =
        state.readyAtTick === state.readyAt * OUTCOME_BUFF_TICKS_PER_SECOND
          ? state.readyAt
          : state.readyAtTick / OUTCOME_BUFF_TICKS_PER_SECOND
      this.readiness.set(readyAt, (this.readiness.get(readyAt) ?? 0) + state.probability)
    }
    return proc
  }
}
