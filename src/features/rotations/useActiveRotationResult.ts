import { useEffect, useMemo, useRef } from "react"

import { baselineMetricsWithPreviousComparisons } from "@/application/comparison"
import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { buildGraduationBundleSet, selectHighestGraduationResult } from "@/application/graduation"
import { resolveBaseline, resolveComparisonMetrics } from "@/application/resolveRotationMetrics"
import { rotationAvailableForWeapons, rotationRecordForEntry } from "@/application/rotationCatalog"
import { rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import { resolvePing } from "@/calculations/combatDefaults"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import { buildRotationCalculationBundle, measurementSubject } from "@/calculations/rotationCalculationBundle"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"
import type { RotationCalculationCategory } from "@/calculations/rotationMetrics"
import type { BuildEntry, GearItem } from "@/gear"
import { gameText } from "@/i18n"
import { publishNotice } from "@/notices"
import type { RotationEntry } from "@/rotationTransfer"
import { useDpsStore } from "@/stores/dpsStore"
import { useRotationStore, type ActiveRotationResult } from "@/stores/rotationStore"

/**
 * Resolves and publishes the rotation every other surface shows: its baseline, its graduation
 * reading, and (only while Main is visible) its comparisons.
 *
 * Nothing here needs the rotation editor, which is the point. The editor used to own this because
 * it ran the comparison sweep, so the character sheet's priority panels and the breakdown could
 * only be filled once it was opened. Every part of a rotation's result is a cache entry keyed by
 * the fingerprint of the bundle it came from, so the application resolves the same entries the
 * editor does and lands on the same numbers. Build and gear contents are explicit inputs, so
 * changing equipment refreshes shared results even before the editor has ever been mounted.
 */

type ActiveRotationInput = {
  comparisonsActive: boolean
  pathId: PathId
  build: BuildEntry | undefined
  gearItems: GearItem[]
  measurement: MeasurementContext
  activeRotationId: string
  defaultRotationId: string
  devMode: boolean
  weapons: [string, string]
}

/** The stored record for the active rotation, or undefined when none is available. */
function resolveActiveRotation(
  input: Pick<ActiveRotationInput, "devMode" | "weapons" | "activeRotationId" | "defaultRotationId">,
  storedEntries: RotationEntry[],
) {
  const entries = storedEntries.filter(
    entry => (input.devMode || !entry.test) && rotationAvailableForWeapons(entry, input.weapons as never),
  )
  const entry =
    entries.find(candidate => candidate.id === input.activeRotationId) ??
    entries.find(candidate => candidate.id === input.defaultRotationId) ??
    entries[0]
  if (!entry) return undefined
  const rotation = rotationRecordForEntry(entry)
  return { entry, rotation, name: entry.isDefault ? gameText(rotation.name) : rotation.name || "Active rotation" }
}

/** The graduation reading already held for every candidate, or undefined while any is missing. */
function cachedGraduationDps(prepared: ReturnType<typeof buildGraduationBundleSet>) {
  if (!prepared) return undefined
  const cached = prepared.candidates.flatMap(candidate => {
    const reading = useDpsStore.getState().peek("throughput", candidate.fingerprint)
    return reading ? [reading] : []
  })
  if (cached.length !== prepared.candidates.length) return undefined
  return selectHighestGraduationResult(cached)?.dps
}

export function useActiveRotationResult(input: ActiveRotationInput) {
  const {
    pathId,
    build,
    gearItems,
    measurement,
    activeRotationId,
    defaultRotationId,
    devMode,
    weapons,
    comparisonsActive,
  } = input
  const entries = useRotationStore(state => state.entries)
  const active = useMemo(
    () => resolveActiveRotation({ activeRotationId, defaultRotationId, devMode, weapons }, entries),
    [activeRotationId, defaultRotationId, devMode, weapons, entries],
  )
  // A published editor draft is the current rotation even after leaving the editor. Rebuild it
  // against new gear rather than letting the old draft block a shared baseline refresh.
  const draftRotation = useRotationStore(state => {
    const result = state.result
    return result?.draft && result.pathId === pathId && result.rotationId === active?.entry.id
      ? result.rotation
      : undefined
  })
  const rotation = draftRotation ?? active?.rotation
  const subject = useMemo(
    () => (rotation ? measurementSubject({ build, gearItems, context: measurement, rotation }) : undefined),
    [build, gearItems, measurement, rotation],
  )

  const revisionRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!active || !subject) return
    let cancelled = false
    const current = () => !cancelled
    const startedCategories = new Set<RotationCalculationCategory>()
    // One subject for both bundles, so the comparisons resolve against the baseline the store
    // already holds rather than a second assembly of the same rotation.
    const bundle = buildRotationCalculationBundle(subject)
    const cacheKey = rotationBundleFingerprint(bundle)
    const bundleKey = `${active.entry.id}:${cacheKey}`

    const graduation = buildGraduationBundleSet({
      pathId,
      martialArts: [...measurement.environment.settings.weapons],
      rotation: {
        ...subject.rotation,
        ping: resolvePing(subject.rotation.ping, measurement.environment.settings.ping),
      },
      breakthrough: measurement.environment.settings.breakthrough,
      globalDebuffs: measurement.environment.globalDebuffs,
      food: measurement.environment.setupSelections.food,
      enduranceFood: measurement.environment.setupSelections.enduranceFood,
      script: measurement.environment.setupSelections.script,
      divinecraft: measurement.environment.setupSelections.divinecraft,
      graduatedBuildIds: typedPathDefinitions[pathId].graduated,
      skillOverrides: measurement.environment.skillOverrides,
      previewId: measurement.environment.previewId,
    })

    // Compare calculation inputs, rather than effect runs: changing tab visibility or
    // recreating an equivalent input object must not interrupt useful shared work.
    const comparisonBundle = buildRotationComparisonBundle(subject)
    const revision = JSON.stringify([bundleKey, rotationBundleFingerprint(comparisonBundle), graduation?.fingerprint])
    if (revisionRef.current !== undefined && revisionRef.current !== revision) useDpsStore.getState().supersede()
    revisionRef.current = revision

    const publish = (metrics: ActiveRotationResult["metrics"], dps?: number) => {
      if (!current()) return
      useRotationStore
        .getState()
        .publish({
          pathId,
          rotationId: active.entry.id,
          rotationName: active.name,
          rotationIsDefault: active.entry.isDefault === true,
          rotation: subject.rotation,
          bundle,
          bundleKey,
          metrics,
          draft: draftRotation !== undefined,
          graduation: graduation ? { fingerprint: graduation.fingerprint, dps } : undefined,
        })
    }

    void (async () => {
      const store = useRotationStore.getState()
      try {
        store.startCategory("baseline")
        const resolved = await resolveBaseline(bundle)
        if (!current()) return
        store.settleCategory("baseline")
        // The totals are published before the comparisons, so the headline lands as soon as the
        // rotation itself is measured rather than waiting for the panels around it.
        const held = useRotationStore.getState().result
        publish(
          baselineMetricsWithPreviousComparisons(
            resolved.baseline.metrics,
            held?.bundleKey === bundleKey ? held.metrics : undefined,
          ),
          cachedGraduationDps(graduation),
        )

        // Only Main consumes variants. Other tabs still receive the full baseline: timeline,
        // action breakdowns, totals and the immutable bundle needed by Simulation.
        const comparisons = comparisonsActive
          ? resolveComparisonMetrics({
              bundle: comparisonBundle,
              baselineKey: cacheKey,
              baseline: () => resolved.baseline,
              onCategoryStarted: category => {
                if (!current()) return
                startedCategories.add(category)
                useRotationStore.getState().startCategory(category)
              },
              onCategoryProgress: (category, progress) => {
                if (current()) useRotationStore.getState().progressCategory(category, progress)
              },
              onCategoryResolved: (merged, category) => {
                if (!current()) return
                const latest = useRotationStore.getState().result
                publish(
                  merged,
                  latest?.bundleKey === bundleKey ? latest.graduation?.dps : cachedGraduationDps(graduation),
                )
                startedCategories.delete(category)
                useRotationStore.getState().settleCategory(category)
              },
            })
          : Promise.resolve()
        const graduationResult =
          graduation && cachedGraduationDps(graduation) === undefined
            ? Promise.all(
                graduation.candidates.map(candidate =>
                  useDpsStore
                    .getState()
                    .ensure({
                      kind: "throughput",
                      cacheKey: candidate.fingerprint,
                      build: () => candidate.bundle,
                      priority: 390,
                    }),
                ),
              ).then(readings => {
                const latest = useRotationStore.getState().result
                if (current() && latest?.bundleKey === bundleKey)
                  publish(latest.metrics, selectHighestGraduationResult(readings)?.dps)
              })
            : Promise.resolve()
        await Promise.all([comparisons, graduationResult])
      } catch (error) {
        if (!current()) return
        if (error instanceof Error && /superseded|disposed/.test(error.message)) return
        publishNotice({
          id: "rotation-calculation",
          error: true,
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        if (current()) {
          store.settleCategory("baseline")
          for (const category of startedCategories) store.settleCategory(category)
        }
      }
    })()
    return () => {
      cancelled = true
      for (const category of startedCategories) useRotationStore.getState().settleCategory(category)
    }
  }, [active, subject, pathId, measurement, draftRotation, comparisonsActive])
}
