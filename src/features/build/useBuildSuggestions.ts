import { useEffect, useRef, useState } from "react"

import type { BuildSuggestionResult } from "@/calculations/buildSuggestions"
import type { GearSearchInput } from "@/calculations/gearOptimization"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import type { BuildEntry, GearItem } from "@/gear"

// Memory only: navigation preserves completed advice; a page reload drops it.
const resultsByBuild = new Map<string, { key: string; result: BuildSuggestionResult }>()

/** Explicitly requested advice, retained per build until its inputs change or the page reloads. */
export function useBuildSuggestions(
  build: BuildEntry | undefined,
  items: GearItem[],
  context: MeasurementContext,
  rotation: RotationRecord | undefined,
) {
  const key = JSON.stringify([build, items, context, rotation])
  const owner = `${context.environment?.pathId ?? ""}:${build?.id ?? ""}`
  const held = resultsByBuild.get(owner)
  if (held && held.key !== key) resultsByBuild.delete(owner)
  const workerRef = useRef<Worker | undefined>(undefined)
  const [state, setState] = useState<{ key: string; busy?: boolean; error?: string }>()
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = undefined
    },
    [key],
  )
  const run = () => {
    if (!build || !rotation) return
    workerRef.current?.terminate()
    resultsByBuild.delete(owner)
    setState({ key, busy: true })
    try {
      const worker = new Worker(new URL("../../calculations/buildSuggestionsWorker.ts", import.meta.url), {
        type: "module",
      })
      workerRef.current = worker
      const finish = (value: { result?: BuildSuggestionResult; error?: string }) => {
        if (workerRef.current !== worker) return
        worker.terminate()
        workerRef.current = undefined
        if (value.result) resultsByBuild.set(owner, { key, result: value.result })
        setState({ key, error: value.error })
      }
      worker.onmessage = (event: MessageEvent<{ result?: BuildSuggestionResult; error?: string }>) => finish(event.data)
      worker.onerror = event => finish({ error: event.message })
      worker.onmessageerror = () => finish({ error: "message" })
      const input: GearSearchInput = { build, items, context, rotation }
      worker.postMessage(structuredClone(input))
    } catch (error) {
      workerRef.current?.terminate()
      workerRef.current = undefined
      setState({ key, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { ...(state?.key === key ? state : undefined), result: resultsByBuild.get(owner)?.result, run }
}
