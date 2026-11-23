/// <reference lib="webworker" />
import { calculateBuildSuggestions } from "./buildSuggestions"
import type { GearSearchInput } from "./gearOptimization"

self.onmessage = (event: MessageEvent<GearSearchInput>) => {
  try {
    self.postMessage({ result: calculateBuildSuggestions(event.data) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
