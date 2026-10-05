import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type { RotationPriority } from "@/calculations/rotationMetrics"

// Ported from script/probe/check-stat-priority-display.mjs.
describe("stat-priority-display", () => {
  it("stat-priority-display checks", async () => {
    const { statPriorityDisplayRows, nextStatPriorityMode } = await import("../src/statPriorityDisplay.ts")
    const { maxGearRoll } = await import("../src/gear.ts")
    const maxAffix = maxGearRoll("maxPhys", "affix", false, 96)
    assert(maxAffix, "Max Physical Attack must have a rolled maximum at level 96.")
    const ratio = (maxGearRoll("maxPhys", "affix", true, 96) ?? maxAffix) / maxAffix
    const rows: RotationPriority[] = [
      { label: "A", maxRoll: 100, dpsDifference: 100, increase: 10, hpsDifference: 20, healingIncrease: 2 },
      { label: "B", maxRoll: 80, dpsDifference: 97, increase: 9.7, hpsDifference: 0, healingIncrease: 0 },
      { label: "Healing", maxRoll: 50, dpsDifference: 0, increase: 0, hpsDifference: 10, healingIncrease: 1 },
      { label: "Zero", dpsDifference: 0, increase: 0, hpsDifference: 0, healingIncrease: 0 },
      { label: "Negative", maxRoll: 5, dpsDifference: -10, increase: -1, hpsDifference: -5, healingIncrease: -0.5 },
    ]
    const original: RotationPriority[] = structuredClone(rows)
    rows.forEach(Object.freeze)
    Object.freeze(rows)
    const max = statPriorityDisplayRows(rows, "max")
    assert.deepEqual(
      max.map(({ rollKind: _rollKind, ...row }) => row),
      original,
    )
    const relayed = statPriorityDisplayRows(rows, "relayed")
    for (const result of relayed) {
      const row = original.find(candidate => candidate.label === result.label)
      assert(row, `Expected a source row labelled ${result.label}.`)
      for (const key of ["maxRoll", "dpsDifference", "increase", "hpsDifference", "healingIncrease"] as const)
        assert.equal(result[key], row[key] === undefined ? undefined : row[key] * ratio)
    }
    const combined = statPriorityDisplayRows(rows, "both")
    assert.equal(combined.length, rows.length * 2)
    assert.deepEqual(
      combined.slice(0, 4).map(row => `${row.label}:${row.rollKind}`),
      ["A:max", "B:max", "A:relayed", "B:relayed"],
    )
    assert.deepEqual(
      combined.slice(-2).map(row => row.rollKind),
      ["relayed", "max"],
      "Negative deltas sort by projected impact too",
    )
    for (let index = 1; index < combined.length; index++) {
      const previous = combined[index - 1],
        current = combined[index]
      assert.ok(
        previous.dpsDifference > current.dpsDifference ||
          (previous.dpsDifference === current.dpsDifference && previous.hpsDifference >= current.hpsDifference),
      )
    }
    assert.deepEqual(rows, original, "Display modes cannot mutate the centralized calculation result")
    assert.deepEqual(statPriorityDisplayRows([], "both"), [])
    assert.equal(nextStatPriorityMode("max"), "relayed")
    assert.equal(nextStatPriorityMode("relayed"), "both")
    assert.equal(nextStatPriorityMode("both"), "max")
  })
})
