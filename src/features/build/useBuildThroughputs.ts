import { useEffect, useMemo, useState } from "react"

import { buildMeasurement, type MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import type { BuildEntry, GearItem } from "@/gear"
import { useDpsStore } from "@/stores/dpsStore"

/** Something to measure, under a name the caller chose. The name is not part of the identity. */
export type ThroughputTarget = { key: string; build: BuildEntry | undefined; gearItems?: GearItem[] }

type Measured = { key: string; cacheKey?: string; bundle?: ReturnType<typeof buildMeasurement>["bundle"] }

/** What a target measured to, and the exact inputs it was measured from. */
type Resolved = {
  build: BuildEntry
  gearItems: GearItem[]
  rotation: RotationRecord
  cacheKey: string
  bundle: ReturnType<typeof buildMeasurement>["bundle"]
}

/**
 * Bundles already built for a given sheet, per target key.
 *
 * A measurement cannot be requested until its key exists, and the key is the bundle's own
 * fingerprint, so building the bundle is the whole cost of asking. Which targets are asked for
 * changes as the gear inventory scrolls, but what any one of them measures to does not, so without
 * this a card arriving rebuilds every candidate already on screen, once per frame of the scroll.
 *
 * Keyed on the context weakly, so a bundle is dropped with the sheet it was resolved from rather
 * than outliving it, and every entry is checked against the inputs it was built from, so a reused
 * bundle is one the current render would have produced itself.
 */
const bundlesByContext = new WeakMap<MeasurementContext, Map<string, Resolved>>()

function measurementFor(input: {
  key: string
  build: BuildEntry
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord
}): Pick<Measured, "cacheKey" | "bundle"> {
  const held = bundlesByContext.get(input.context) ?? new Map<string, Resolved>()
  bundlesByContext.set(input.context, held)
  const previous = held.get(input.key)
  if (
    previous &&
    previous.build === input.build &&
    previous.gearItems === input.gearItems &&
    previous.rotation === input.rotation
  )
    return { cacheKey: previous.cacheKey, bundle: previous.bundle }
  const { bundle, cacheKey } = buildMeasurement({
    build: input.build,
    gearItems: input.gearItems,
    context: input.context,
    rotation: input.rotation,
  })
  held.set(input.key, { build: input.build, gearItems: input.gearItems, rotation: input.rotation, cacheKey, bundle })
  return { cacheKey, bundle }
}

/**
 * The throughput of several builds at once, each under a key the caller chose.
 *
 * Every reading is a whole rotation, so the cost of asking for one is the cost of a baseline and
 * the number of them has to be chosen deliberately: the build list measures the build on screen
 * and the active one, and the gear inventory measures the slot's candidates against the item it
 * has equipped. A reading is shown only while it still describes the build and rotation currently
 * on screen, so the key a measurement was made under is compared during render rather than
 * cleared in an effect, and changing selection shows nothing for one render instead of arranging a
 * second render to remove what is there.
 *
 * The active build's reading is nearly free, because its baseline is already calculated for the
 * rotation editor and the bundle here produces the same key, so the worker holding that baseline
 * answers without running the rotation again.
 */
export function useBuildThroughputs(input: {
  targets: readonly ThroughputTarget[]
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
  /** Editor sweeps wait for typing to pause and schedule one candidate at a time. */
  editorSweep?: boolean
}): Record<string, ThroughputReading | undefined> {
  const { targets, gearItems, context, rotation, editorSweep = false } = input
  const [settled, setSettled] = useState<Record<string, { cacheKey: string; reading: ThroughputReading }>>({})

  const measured = useMemo<Measured[]>(
    () =>
      targets.map(target => {
        if (!target.build || !rotation) return { key: target.key }
        return {
          key: target.key,
          ...measurementFor({
            key: target.key,
            build: target.build,
            gearItems: target.gearItems ?? gearItems,
            context,
            rotation,
          }),
        }
      }),
    [targets, gearItems, context, rotation],
  )

  // The cache keys are the identity of the work, so they and not the array decide whether the
  // set of measurements has changed. A caller may rebuild its target array every render.
  const requested = measured.map(entry => entry.cacheKey).join("|")

  useEffect(() => {
    let current = true
    const measure = async (entry: Measured) => {
      // A reading already held costs nothing to ask for, and is the common case on a revisit.
      if (!entry.cacheKey) return
      const { key, cacheKey, bundle } = entry
      const cached = useDpsStore.getState().peek("throughput", cacheKey)
      if (cached) {
        // Keep the editor's reference even if other readings evict it during the sweep.
        if (editorSweep && current) setSettled(previous => ({ ...previous, [key]: { cacheKey, reading: cached } }))
        return
      }
      await useDpsStore
        .getState()
        .ensure({ kind: "throughput", cacheKey, build: () => bundle!, priority: 120 })
        .then(reading => {
          if (current) setSettled(previous => ({ ...previous, [key]: { cacheKey, reading } }))
        })
        .catch(() => {
          // A superseded or torn-down worker rejects. The reading is then simply absent until
          // something asks again, which is the same as never having measured it.
        })
    }
    const run = () => {
      if (editorSweep) {
        void (async () => {
          for (const entry of measured) {
            if (!current) return
            // Bound obsolete work to the current request when typing supersedes a sweep.
            // oxlint-disable-next-line no-await-in-loop
            await measure(entry)
          }
        })()
      } else for (const entry of measured) void measure(entry)
    }
    const timer = editorSweep ? setTimeout(run, 300) : undefined
    if (!editorSweep) run()
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [requested, measured, editorSweep])

  return Object.fromEntries(
    measured.map(entry => {
      if (!entry.cacheKey) return [entry.key, undefined]
      const known = settled[entry.key]
      if (known?.cacheKey === entry.cacheKey) return [entry.key, known.reading]
      return [entry.key, useDpsStore.getState().peek("throughput", entry.cacheKey)]
    }),
  )
}
