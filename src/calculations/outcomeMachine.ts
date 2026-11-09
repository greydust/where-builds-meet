import { nextBattlePeriodicTick } from "./outcomeTriggeredBuffs"
import {
  PROBABILITY_TICKS_PER_SECOND,
  PROBABILITY_TIME_BUCKET_TICKS,
  TINY_STATE_PROBABILITY,
} from "./probabilityStateMerging"

export type MachineEffect = Record<string, unknown>
export type MachineCellDefinition = {
  duration: number
  maximum?: number
  effect?: string
  refresh?: { extend: number; maximum: number }
  periodic?: {
    skill: string
    firstDelay: number
    interval: number
    tickOnExpire?: boolean
    expectedTickAlignment?: "battle"
  }
}
type MachineRequirement = { cell: string; minimum?: number; maximum?: number }
type MachineOperation = {
  type: "add" | "remove" | "emit" | "consumeHP"
  cell?: string
  amount?: number
  skill?: string
  ratio?: number
}
export type OutcomeMachineDefinition = {
  cells?: Record<string, MachineCellDefinition>
  expectedStackPromotion?: {
    cell: string
    threshold: number
    requires?: MachineRequirement[]
    /** Reuse this rule's operations when promotion reaches the cell maximum. */
    onMax: string
  }
  rules?: Record<
    string,
    {
      order: number
      requirement?: unknown
      outcome?: "affinity"
      /** Expected timelines extend an existing cell by chance × refresh.extend. */
      expectedRefresh?: boolean
      requires?: MachineRequirement[]
      read?: "before"
      operations: MachineOperation[]
    }
  >
}
type Cell = { stack: number; expires: number; next?: number; source: string }
type Branch = { probability: number; cells: Record<string, Cell>; pending: string[] }
export type MachineEmission = { token: string; skill: string; probability: number; source: string }

const ticks = (time: number) => Math.round(time * PROBABILITY_TICKS_PER_SECOND)
const seconds = (time: number) => time / PROBABILITY_TICKS_PER_SECOND
const matchesCells = (requirements: MachineRequirement[] | undefined, cells: Record<string, Cell>) =>
  requirements?.every(requirement => {
    const value = cells[requirement.cell]?.stack ?? 0
    return value >= (requirement.minimum ?? 0) && value <= (requirement.maximum ?? Infinity)
  }) ?? true
const clone = (branch: Branch): Branch => ({
  probability: branch.probability,
  cells: Object.fromEntries(Object.entries(branch.cells).map(([name, cell]) => [name, { ...cell }])),
  pending: [...branch.pending],
})

/** A joint distribution for linked outcome buffs and their native periodic clocks. */
export class OutcomeMachine {
  private branches: Branch[] = [{ probability: 1, cells: {}, pending: [] }]
  private cells: Record<string, MachineCellDefinition> = {}
  private rules: NonNullable<OutcomeMachineDefinition["rules"]> = {}
  private orderedRules: Array<[string, NonNullable<OutcomeMachineDefinition["rules"]>[string]]> = []
  private serial = 0
  private emissions = new Map<string, MachineEmission>()
  private sharedTicks = new Map<string, number>()
  private promotions: NonNullable<OutcomeMachineDefinition["expectedStackPromotion"]>[] = []
  private battleStart = 0
  maximumStates = 1

  constructor(definitions: OutcomeMachineDefinition[], privateSampled = false) {
    this.sampled = privateSampled
    for (const definition of definitions) {
      Object.assign(this.cells, definition.cells)
      Object.assign(this.rules, definition.rules)
      if (definition.expectedStackPromotion) this.promotions.push(definition.expectedStackPromotion)
    }
    this.orderedRules = Object.entries(this.rules).sort(([, left], [, right]) => left.order - right.order)
  }
  private sampled: boolean

  startBattle(time: number) {
    this.battleStart = time
  }

  private usesSharedClock(definition: MachineCellDefinition) {
    return !this.sampled && definition.periodic?.expectedTickAlignment === "battle"
  }

  private compact() {
    const groups = new Map<string, Branch>()
    for (const branch of this.branches) {
      if (!(branch.probability > 0)) continue
      const tiny = branch.probability < TINY_STATE_PROBABILITY
      const key = JSON.stringify([
        branch.pending,
        Object.keys(branch.cells)
          .sort()
          .map(name => {
            const cell = branch.cells[name]
            return tiny
              ? [
                  name,
                  cell.stack,
                  cell.next === undefined ? undefined : Math.floor(cell.next / PROBABILITY_TIME_BUCKET_TICKS),
                ]
              : [name, cell.stack, cell.next, cell.expires]
          }),
        tiny,
      ])
      const previous = groups.get(key)
      if (!previous) groups.set(key, branch)
      else {
        const weight = branch.probability / (previous.probability + branch.probability)
        if (tiny)
          for (const name of Object.keys(previous.cells)) {
            const cell = previous.cells[name]
            if (Number.isFinite(cell.expires)) cell.expires += (branch.cells[name].expires - cell.expires) * weight
            if (cell.next !== undefined)
              cell.next =
                Math.ceil(
                  (cell.next + (branch.cells[name].next! - cell.next) * weight) / PROBABILITY_TIME_BUCKET_TICKS,
                ) * PROBABILITY_TIME_BUCKET_TICKS
          }
        previous.probability += branch.probability
      }
    }
    this.branches = [...groups.values()]
    this.maximumStates = Math.max(this.maximumStates, this.branches.length)
  }

  private emit(branch: Branch, skill: string, token: string, source: string) {
    branch.pending.push(token)
    const previous = this.emissions.get(token)
    if (previous) previous.probability += branch.probability
    else this.emissions.set(token, { token, skill, probability: branch.probability, source })
  }

  private add(branch: Branch, name: string, amount: number, now: number, source: string, refreshChance = 1) {
    const definition = this.cells[name]
    if (!definition) throw new Error(`Unknown outcome-machine cell: ${name}`)
    const existing = branch.cells[name]
    const duration = definition.duration < 0 ? Infinity : ticks(definition.duration)
    const expires =
      existing && definition.refresh
        ? Math.min(
            now + ticks(definition.refresh.maximum),
            existing.expires + ticks(definition.refresh.extend * refreshChance),
          )
        : now + duration
    const sharedClock = this.usesSharedClock(definition)
    if (sharedClock && definition.periodic) {
      const next = ticks(nextBattlePeriodicTick(seconds(now), definition.periodic.interval, this.battleStart))
      this.sharedTicks.set(name, Math.max(this.sharedTicks.get(name) ?? next, next))
    }
    branch.cells[name] = {
      stack: Math.min(definition.maximum ?? 1, (existing?.stack ?? 0) + amount),
      expires,
      source: definition.periodic ? source : "",
      ...(definition.periodic && !sharedClock
        ? { next: existing?.next ?? now + ticks(definition.periodic.firstDelay) }
        : {}),
    }
  }

  private applyOperations(
    branch: Branch,
    operations: MachineOperation[],
    now: number,
    source: string,
    token: string,
    refreshChance = 1,
  ) {
    let hpCost = 0
    for (const operation of operations)
      switch (operation.type) {
        case "add":
          this.add(branch, operation.cell!, operation.amount ?? 1, now, source, refreshChance)
          break
        case "remove":
          delete branch.cells[operation.cell!]
          break
        case "emit":
          this.emit(branch, operation.skill!, token, source)
          break
        case "consumeHP":
          hpCost += branch.probability * (operation.ratio ?? 0)
          break
      }
    return hpCost
  }

  private promoteRareStacks(now: number, source: string, serial: number) {
    if (this.sampled) return 0
    let hpCost = 0
    for (const promotion of this.promotions) {
      const maximum = this.cells[promotion.cell].maximum ?? 1
      // Ascending order transfers a rare tail into the next stack's total mass.
      for (let stack = 0; stack < maximum; stack++) {
        const candidates = this.branches.filter(
          branch =>
            matchesCells(promotion.requires, branch.cells) && (branch.cells[promotion.cell]?.stack ?? 0) === stack,
        )
        const probability = candidates.reduce((sum, branch) => sum + branch.probability, 0)
        if (!(probability > 0 && probability < promotion.threshold)) continue
        for (const branch of candidates) {
          // Conditional proc follow-ups retain their branch until acknowledged.
          if (branch.pending.length) continue
          this.add(branch, promotion.cell, 1, now, source)
          if (stack + 1 === maximum)
            hpCost += this.applyOperations(
              branch,
              this.rules[promotion.onMax].operations,
              now,
              source,
              `hit:${serial}:${promotion.onMax}`,
            )
        }
      }
    }
    return hpCost
  }

  /** Expiry precedes a coincident hit/tick, matching the ordinary shared event loop. */
  advance(time: number) {
    const now = ticks(time)
    const serial = this.serial++
    let changed = false
    for (const branch of this.branches)
      for (const [name, cell] of Object.entries(branch.cells)) {
        const definition = this.cells[name]
        const periodic = definition.periodic
        const sharedClock = this.usesSharedClock(definition)
        const next = sharedClock ? this.sharedTicks.get(name) : cell.next
        if (
          next !== undefined &&
          next <= now &&
          periodic &&
          (next < cell.expires || (periodic.tickOnExpire && next <= cell.expires))
        ) {
          this.emit(branch, periodic.skill, `timer:${serial}:${name}`, cell.source)
          if (!sharedClock) cell.next = next + ticks(periodic.interval)
          changed = true
        }
        if (cell.expires <= now) {
          delete branch.cells[name]
          changed = true
        }
      }
    for (const [name, next] of this.sharedTicks) {
      if (next <= now)
        this.sharedTicks.set(
          name,
          ticks(nextBattlePeriodicTick(time, this.cells[name].periodic!.interval, this.battleStart)),
        )
    }
    if (changed) this.compact()
  }

  nextTime() {
    let next = Infinity
    for (const branch of this.branches)
      for (const [name, cell] of Object.entries(branch.cells)) {
        const definition = this.cells[name]
        const periodic = definition.periodic
        const tick = this.usesSharedClock(definition) ? this.sharedTicks.get(name) : cell.next
        if (tick !== undefined && periodic && (tick < cell.expires || (periodic.tickOnExpire && tick <= cell.expires)))
          next = Math.min(next, tick)
      }
    return seconds(next)
  }

  distribution(effects: (definition: string, stack: number) => MachineEffect[], token?: string) {
    const branches = token ? this.branches.filter(branch => branch.pending.includes(token)) : this.branches
    const total = branches.reduce((sum, branch) => sum + branch.probability, 0)
    const grouped = new Map<string, { probability: number; effects: MachineEffect[] }>()
    for (const branch of branches) {
      const resolved = Object.entries(branch.cells).flatMap(([name, cell]) => {
        const definition = this.cells[name].effect
        return definition ? effects(definition, cell.stack) : []
      })
      const key = JSON.stringify(resolved)
      const previous = grouped.get(key)
      if (previous) previous.probability += branch.probability / total
      else grouped.set(key, { probability: branch.probability / total, effects: resolved })
    }
    return [...grouped.values()]
  }

  settle(
    time: number,
    source: string,
    passes: (requirement: unknown) => boolean,
    effects: (definition: string, stack: number) => MachineEffect[],
    affinity: (effects: MachineEffect[]) => number,
    sampledOutcome?: string,
    token?: string,
  ) {
    const now = ticks(time)
    const serial = this.serial++
    const next: Branch[] = []
    let hpCost = 0
    const rules = this.orderedRules.filter(([, rule]) => passes(rule.requirement))
    for (const original of this.branches) {
      if (token && !original.pending.includes(token)) {
        next.push(original)
        continue
      }
      const before = original.cells
      const affinityRules = rules.filter(
        ([, rule]) => rule.outcome === "affinity" && (rule.read !== "before" || matchesCells(rule.requires, before)),
      )
      let chance = 0
      if (affinityRules.length) {
        if (this.sampled) chance = Number(sampledOutcome === "affinity")
        else {
          const resolved = Object.entries(before).flatMap(([name, cell]) =>
            this.cells[name].effect ? effects(this.cells[name].effect!, cell.stack) : [],
          )
          chance = Math.min(1, Math.max(0, affinity(resolved)))
        }
      }
      const needsSplit = affinityRules.some(([, rule]) => this.sampled || !rule.expectedRefresh)
      const outcomes: Array<[boolean, number]> = needsSplit
        ? [
            [true, chance],
            [false, 1 - chance],
          ]
        : [[false, 1]]
      for (const [isAffinity, probability] of outcomes) {
        if (probability <= 0) continue
        const branch = clone(original)
        branch.probability *= probability
        if (token) branch.pending = branch.pending.filter(value => value !== token)
        for (const [id, rule] of rules) {
          const expectedRefresh = !this.sampled && rule.expectedRefresh
          if (rule.outcome === "affinity" && !isAffinity && !expectedRefresh) continue
          const observed = rule.read === "before" ? before : branch.cells
          if (!matchesCells(rule.requires, observed)) continue
          hpCost += this.applyOperations(
            branch,
            rule.operations,
            now,
            source,
            `hit:${serial}:${id}`,
            expectedRefresh ? chance : 1,
          )
        }
        next.push(branch)
      }
    }
    this.branches = next
    hpCost += this.promoteRareStacks(now, source, serial)
    this.compact()
    return hpCost
  }

  drainEmissions() {
    const result = [...this.emissions.values()]
    this.emissions.clear()
    return result
  }
}
