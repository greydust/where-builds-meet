/** Storage alternatives for sorted expiration lists; probability math lives in the tracker. */
export type PeriodicStateStorage = "packed" | "indexed"
export type PeriodicCadences = Map<number, number> | undefined

export interface PeriodicStateList {
  expires: number[]
  mass: number[]
  pending: number[]
  cadences: PeriodicCadences[]
  head: number
  readonly tail: number
  size: number
  next(index: number): number
  shift(): void
  add(expires: number, mass: number, pending: number, cadences?: PeriodicCadences): void
  insertAfter(previous: number, expires: number, mass: number, pending: number, cadences?: PeriodicCadences): number
  removeAfter(previous: number): void
  /** Update in place and remove rejected entries, in one traversal. */
  retain(visit: (index: number) => boolean): void
}

function mergeAt(list: PeriodicStateList, index: number, mass: number, pending: number, cadences: PeriodicCadences) {
  list.mass[index] += mass
  list.pending[index] += pending
  if (cadences) {
    const target = (list.cadences[index] ??= new Map())
    for (const [tick, probability] of cadences) target.set(tick, (target.get(tick) ?? 0) + probability)
  }
}

/** Dense numeric arrays. Head removal is O(1); an update pass compacts survivors. */
class PackedPeriodicList implements PeriodicStateList {
  expires: number[] = []
  mass: number[] = []
  pending: number[] = []
  cadences: PeriodicCadences[] = []
  head = -1
  get tail() {
    return this.head < 0 ? -1 : this.expires.length - 1
  }
  get size() {
    return this.head < 0 ? 0 : this.expires.length - this.head
  }
  next(index: number) {
    return index + 1 < this.expires.length ? index + 1 : -1
  }
  shift() {
    this.head = this.next(this.head)
    if (this.head < 0) this.clear()
  }
  private clear() {
    this.expires.length = this.mass.length = this.pending.length = this.cadences.length = 0
  }
  add(expires: number, mass: number, pending: number, cadences?: PeriodicCadences) {
    if (!(mass > 0)) return
    let index = this.expires.length
    while (index > Math.max(0, this.head) && this.expires[index - 1] >= expires) index--
    if (this.expires[index] === expires) {
      mergeAt(this, index, mass, pending, cadences)
      return
    }
    if (index === this.expires.length) {
      this.expires.push(expires)
      this.mass.push(mass)
      this.pending.push(pending)
      this.cadences.push(cadences)
    } else {
      this.expires.splice(index, 0, expires)
      this.mass.splice(index, 0, mass)
      this.pending.splice(index, 0, pending)
      this.cadences.splice(index, 0, cadences)
    }
    if (this.head < 0) this.head = 0
  }
  insertAfter(previous: number, expires: number, mass: number, pending: number, cadences?: PeriodicCadences) {
    const index = previous < 0 ? Math.max(0, this.head) : previous + 1
    this.expires.splice(index, 0, expires)
    this.mass.splice(index, 0, mass)
    this.pending.splice(index, 0, pending)
    this.cadences.splice(index, 0, cadences)
    if (this.head < 0) this.head = index
    return index
  }
  removeAfter(previous: number) {
    if (previous < 0) {
      this.shift()
      return
    }
    const index = previous + 1
    this.expires.splice(index, 1)
    this.mass.splice(index, 1)
    this.pending.splice(index, 1)
    this.cadences.splice(index, 1)
  }
  retain(visit: (index: number) => boolean) {
    let write = 0
    for (let read = this.head; read >= 0 && read < this.expires.length; read++) {
      if (!visit(read)) continue
      this.expires[write] = this.expires[read]
      this.mass[write] = this.mass[read]
      this.pending[write] = this.pending[read]
      this.cadences[write] = this.cadences[read]
      write++
    }
    this.expires.length = this.mass.length = this.pending.length = this.cadences.length = write
    this.head = write ? 0 : -1
  }
}

/** One reusable numeric arena per tracker; lists contain indices rather than node objects. */
class PeriodicArena {
  expires: number[] = []
  mass: number[] = []
  pending: number[] = []
  cadences: PeriodicCadences[] = []
  links: number[] = []
  free = -1
  allocate(expires: number, mass: number, pending: number, cadences: PeriodicCadences) {
    const index = this.free < 0 ? this.links.length : this.free
    if (this.free >= 0) this.free = this.links[index]
    this.expires[index] = expires
    this.mass[index] = mass
    this.pending[index] = pending
    this.cadences[index] = cadences
    this.links[index] = -1
    return index
  }
  release(index: number) {
    this.cadences[index] = undefined
    this.links[index] = this.free
    this.free = index
  }
}

class IndexedPeriodicList implements PeriodicStateList {
  head = -1
  tail = -1
  size = 0
  expires: number[]
  mass: number[]
  pending: number[]
  cadences: PeriodicCadences[]
  private arena: PeriodicArena
  constructor(arena: PeriodicArena) {
    this.arena = arena
    this.expires = arena.expires
    this.mass = arena.mass
    this.pending = arena.pending
    this.cadences = arena.cadences
  }
  next(index: number) {
    return this.arena.links[index]
  }
  shift() {
    const old = this.head
    this.head = this.next(old)
    this.arena.release(old)
    this.size--
    if (this.head < 0) this.tail = -1
  }
  insertAfter(previous: number, expires: number, mass: number, pending: number, cadences?: PeriodicCadences) {
    const current = previous < 0 ? this.head : this.next(previous)
    const index = this.arena.allocate(expires, mass, pending, cadences)
    this.arena.links[index] = current
    if (previous < 0) this.head = index
    else this.arena.links[previous] = index
    if (current < 0) this.tail = index
    this.size++
    return index
  }
  removeAfter(previous: number) {
    if (previous < 0) {
      this.shift()
      return
    }
    const index = this.next(previous)
    const next = this.next(index)
    this.arena.links[previous] = next
    if (next < 0) this.tail = previous
    this.arena.release(index)
    this.size--
  }
  add(expires: number, mass: number, pending: number, cadences?: PeriodicCadences) {
    if (!(mass > 0)) return
    if (this.tail >= 0 && this.expires[this.tail] === expires) {
      mergeAt(this, this.tail, mass, pending, cadences)
      return
    }
    let previous = this.tail
    let current = -1
    if (this.tail >= 0 && expires < this.expires[this.tail]) {
      previous = -1
      current = this.head
      while (current >= 0 && this.expires[current] < expires) {
        previous = current
        current = this.next(current)
      }
      if (current >= 0 && this.expires[current] === expires) {
        mergeAt(this, current, mass, pending, cadences)
        return
      }
    }
    const index = this.arena.allocate(expires, mass, pending, cadences)
    this.arena.links[index] = current
    if (previous < 0) this.head = index
    else this.arena.links[previous] = index
    if (current < 0) this.tail = index
    this.size++
  }
  retain(visit: (index: number) => boolean) {
    let previous = -1
    for (let index = this.head; index >= 0;) {
      const next = this.next(index)
      if (visit(index)) previous = index
      else {
        if (previous < 0) this.head = next
        else this.arena.links[previous] = next
        if (next < 0) this.tail = previous
        this.arena.release(index)
        this.size--
      }
      index = next
    }
  }
}

export function periodicStateListFactory(storage: PeriodicStateStorage): () => PeriodicStateList {
  switch (storage) {
    case "packed":
      return () => new PackedPeriodicList()
    case "indexed": {
      const arena = new PeriodicArena()
      return () => new IndexedPeriodicList(arena)
    }
  }
}

/** Merge two sorted lists with a forward-only destination cursor, never a search per source entry. */
export function mergePeriodicLists(destination: PeriodicStateList, source: PeriodicStateList) {
  if (source.head < 0) return
  // Ordinary fixed-duration follow-ups append at the current expiration.
  let previous =
    destination.tail >= 0 && destination.expires[destination.tail] < source.expires[source.head] ? destination.tail : -1
  if (destination.tail >= 0 && destination.expires[destination.tail] === source.expires[source.head]) {
    const index = source.head
    mergeAt(destination, destination.tail, source.mass[index], source.pending[index], source.cadences[index])
    previous = destination.tail
    source.shift()
  }
  while (source.head >= 0) {
    const index = source.head
    const expires = source.expires[index]
    let current = previous < 0 ? destination.head : destination.next(previous)
    while (current >= 0 && destination.expires[current] < expires) {
      previous = current
      current = destination.next(current)
    }
    if (current >= 0 && destination.expires[current] === expires) {
      mergeAt(destination, current, source.mass[index], source.pending[index], source.cadences[index])
      previous = current
    } else {
      previous = destination.insertAfter(
        previous,
        expires,
        source.mass[index],
        source.pending[index],
        source.cadences[index],
      )
    }
    source.shift()
  }
}
