import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { EditorTimelineResult } from "@/calculations/editorTimeline"
import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import type { RotationRecord, RotationStep, TimelineBuildInput, TimelineRow } from "@/calculations/rotationTimeline"
import type { TransportResult } from "@/calculations/rotationWorkerTransport"
import type { EditorRevision } from "@/editorTimelinePreview"

import { castStep } from "./helpers/rotationSteps"
import { rowWithId } from "./helpers/timelineRows"

/** The single timeline row the spec reads for the ordered step at `index`. */
function rowWithIndex(rows: readonly TimelineRow[], index: number): TimelineRow {
  const row = rows.find(candidate => candidate.rotationIndex === index)
  assert(row, `Expected a timeline row for rotation step ${index}.`)
  return row
}

/** An editor-timeline dispatch answers an editor timeline, not any other result. */
function editorResult(result: TransportResult): EditorTimelineResult {
  assert("fingerprint" in result, "An editor-timeline dispatch must resolve an editor timeline result.")
  return result
}

// Ported from script/probe/check-editor-timeline-worker.mjs.
describe("editor-timeline-worker", () => {
  it("Editor timeline worker probe passed: live cooldown waits, stable authored input, anchors, pending edits, stale-result rejection, and baseline reuse", async () => {
    try {
      const { calculateEditorTimeline } = await import("@/calculations/editorTimeline.ts")
      const { pendingEditorTimeline, sameEditorRevision } = await import("@/editorTimelinePreview.ts")
      const { calculateRotationBaseline } = await import("@/calculations/rotationCalculator.ts")
      const { emptyStats } = await import("@/data/statDefinitions.ts")
      const { calculateDerivedStats } = await import("@/calculations/effectiveStats.ts")
      const rotation: RotationRecord = {
        name: "Async editor",
        start: { step: 1 },
        steps: [castStep("Hit"), castStep("Hit")],
      }
      const input: TimelineBuildInput = {
        rotation,
        skills: { Hit: { castTime: 1, cooldown: 10, action: [{ type: "damage", time: 0, phyCoef: 1, attrCoef: 0 }] } },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      }
      const resolved = calculateEditorTimeline(input)
      assert.equal(resolved.rotation, rotation)
      assert(resolved.rotation.start, "The editor timeline must keep the authored anchor.")
      assert.equal(resolved.rotation.start.step, 1)
      assert.equal(rowWithIndex(resolved.timeline, 1).startTime, 10)
      assert.deepEqual(calculateEditorTimeline({ ...input, rotation: resolved.rotation }).rotation, resolved.rotation)

      const draft = {
        ...resolved.rotation,
        steps: [resolved.rotation.steps[1], castStep("New"), resolved.rotation.steps[0]],
      }
      const pending = pendingEditorTimeline({ ...input, rotation: draft }, resolved)
      assert.deepEqual(
        pending.map(row => row.id),
        resolved.timeline.map(row => row.id),
      )
      assert.deepEqual(
        pending.map(row => row.startTime),
        resolved.timeline.map(row => row.startTime),
      )
      assert.ok(
        pending.some(
          row => row.step.type === "event" && row.step.event === "Delay" && row.step.automatic === "cooldown",
        ),
        "Generated waits remain mounted",
      )
      assert.equal(rowWithId(pending, "rotation-0").rotationIndex, 2)
      assert.equal(rowWithId(pending, "rotation-1").rotationIndex, 0)
      assert.ok(
        pending.every(row => !row.pendingCalculation),
        "Keep chronological display order",
      )
      // Each edit is a distinct object, because the preview tracks them by identity.
      const changed = castStep("New")
      const changedAgain = castStep("Newest")
      const replacements = new WeakMap<RotationStep, RotationStep>([
        [rotation.steps[0], changed],
        [changed, changedAgain],
      ])
      const edited = pendingEditorTimeline(
        { ...input, rotation: { ...rotation, steps: [changedAgain] } },
        resolved,
        replacements,
      )
      assert.equal(
        rowWithId(edited, "rotation-0").rotationIndex,
        0,
        "Repeated edits keep targeting the same draft step",
      )
      assert.equal(
        rowWithId(edited, "rotation-1").rotationIndex,
        undefined,
        "Deleted rows cannot edit a different step",
      )
      assert.equal(rowWithId(edited, "rotation-0").step.skill, "Hit", "Display changes atomically on completion")
      const initial = pendingEditorTimeline({ ...input, rotation: draft })
      assert.ok(initial.every(row => row.pendingCalculation && row.actions.length === 0))
      const revision: EditorRevision = { id: "a", context: "build", rotation }
      assert.ok(sameEditorRevision(revision, { ...revision }))
      for (const changed of [{ rotation: structuredClone(rotation) }, { id: "b" }, { context: "new build" }]) {
        assert.equal(sameEditorRevision(revision, { ...revision, ...changed }), false)
      }

      const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
      const enemy = {
        name: "Probe",
        level: 1,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      }
      const bundle: RotationSimulationBundle = {
        timeline: { ...input, rotation: resolved.rotation },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        attunement: emptyAttunementStats,
        weapons: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }
      assert.ok(calculateRotationBaseline(bundle).duration > 0)

      const workers: ControlledWorker[] = []
      /** The job the transport last posted, and whether it has been terminated. */
      type PendingMessage = { id: string }
      class ControlledWorker {
        listeners = new Map<string, (event: MessageEvent) => void>()
        message: PendingMessage | undefined
        terminated = false
        constructor() {
          workers.push(this)
        }
        addEventListener(type: string, listener: (event: MessageEvent) => void) {
          this.listeners.set(type, listener)
        }
        postMessage(message: PendingMessage) {
          this.message = message
        }
        terminate() {
          this.terminated = true
        }
        reply(result: EditorTimelineResult) {
          const listener = this.listeners.get("message")
          assert(listener, "The transport must listen for this worker's messages.")
          assert(this.message, "The transport must post a job before a reply is delivered.")
          listener({ data: { id: this.message.id, editorTimeline: result } } as MessageEvent)
        }
      }
      // A browser global is not buildable by hand in a spec; the double implements the
      // three members the transport uses.
      globalThis.Worker = ControlledWorker as unknown as typeof Worker
      const client = await import("@/calculations/rotationWorkerTransport.ts")
      let currentRevision = revision
      let accepted
      const first = client.dispatchCalculation({ mode: "editorTimeline", bundle, key: "editor:a" }).then(result => {
        if (sameEditorRevision(currentRevision, revision)) accepted = result
      })
      currentRevision = { ...revision, rotation: draft }
      workers[0].reply({ ...resolved, fingerprint: "old" })
      await first
      assert.equal(accepted, undefined, "Late completion must not replace a newer edit")
      client.supersedeCalculations()
      assert.ok(!workers[0].terminated, "An idle prepared-timeline worker should survive batch supersession")
      const second = client.dispatchCalculation({ mode: "editorTimeline", bundle, key: "editor:a" })
      workers[0].reply({ ...resolved, fingerprint: "latest" })
      assert.equal(editorResult(await second).fingerprint, "latest")
      const obsolete = client.dispatchCalculation({ mode: "editorTimeline", bundle, key: "editor:a" })
      const rejected = assert.rejects(obsolete, /superseded/)
      client.cancelCalculation("editor:a")
      assert.ok(workers[0].terminated, "An obsolete running editor build is terminated")
      const replacement = client.dispatchCalculation({ mode: "editorTimeline", bundle, key: "editor:a" })
      workers[0].reply({ ...resolved, fingerprint: "cancelled" })
      workers[1].reply({ ...resolved, fingerprint: "replacement" })
      await rejected
      assert.equal(editorResult(await replacement).fingerprint, "replacement")
      client.disposeCalculationWorkers()
    } finally {
      Reflect.deleteProperty(globalThis, "Worker")
    }
  })
})
