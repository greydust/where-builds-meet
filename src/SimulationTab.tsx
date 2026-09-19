import { IconTrash, IconX } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"

import type { RotationSimulationBundle } from "./calculations/rotationCalculator"
import {
  selectSimulationPercentile,
  type SimulationRunResult,
  type SimulationSummary,
} from "./calculations/simulationCalculator"
import { startSimulation, type SimulationTask } from "./calculations/simulationWorkerClient"
import { t } from "./i18n"
import { publishNotice, dismissNotice } from "./notices"
import { getPersistentItem, setPersistentItem } from "./persistentStorage"
import { Button } from "./ui/Button"
import { Chip } from "./ui/Chip"
import { Panel } from "./ui/Panel"

type SimulationTabProps = {
  bundle?: RotationSimulationBundle
  bundleKey?: string
  rotationName?: string
  buildName?: string
}

type SimulationRecord = {
  id: number
  summary: SimulationSummary
  bundleKey: string
  rotationName: string
  buildName: string
}

const customPercentileStorageKey = "wwm-simulation-percentiles-v1"
const presetPercentiles = new Set([99, 95, 90, 75, 50])

function loadCustomPercentiles() {
  try {
    const saved = JSON.parse(getPersistentItem(customPercentileStorageKey) ?? "[]") as unknown
    if (!Array.isArray(saved)) return []
    return [
      ...new Set(
        saved.filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0 &&
            value < 100 &&
            !presetPercentiles.has(value),
        ),
      ),
    ].sort((left, right) => right - left)
  } catch {
    return []
  }
}

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const formatPercentage = (value: number) => `${value.toFixed(2)}%`

function simulationResultRows(summary: SimulationSummary, customPercentiles: number[]) {
  return [
    { label: t("ui.simulationTab.best"), percentile: 101, result: summary.results.best },
    { label: "P99", percentile: 99, result: summary.results.p99 },
    { label: "P95", percentile: 95, result: summary.results.p95 },
    { label: "P90", percentile: 90, result: summary.results.p90 },
    { label: "P75", percentile: 75, result: summary.results.p75 },
    { label: t("ui.simulationTab.median"), percentile: 50, result: summary.results.median },
    ...customPercentiles.map(percentile => ({
      label: `P${percentile}`,
      percentile,
      result: selectSimulationPercentile(summary.runs, percentile / 100),
    })),
  ].sort((left, right) => right.percentile - left.percentile)
}

function SimulationResultCard({
  record,
  customPercentiles,
  currentBundleKey,
  onDelete,
}: {
  record: SimulationRecord
  customPercentiles: number[]
  currentBundleKey: string
  onDelete: (id: number) => void
}) {
  const current = record.bundleKey === currentBundleKey
  const statusLabel = current ? t("ui.simulationTab.current") : t("ui.simulationTab.outdated")
  const resultRows: Array<{ label: string; percentile: number; result: SimulationRunResult }> = simulationResultRows(
    record.summary,
    customPercentiles,
  )
  const hasHealing = resultRows.some(({ result }) => result.totalHealing > 0)
  return (
    <article className="simulation-record">
      <header className="simulation-record-heading">
        <p>
          <span>
            {t("ui.simulationTab.rotation")} {record.rotationName}
          </span>
          <span>
            {t("ui.simulationTab.build")} {record.buildName}
          </span>
          <span>
            {record.summary.runCount.toLocaleString()} {t("ui.simulationTab.runs")}{" "}
            {formatNumber(record.summary.duration)}
            {t("ui.simulationTab.s")}
          </span>
          <Chip className={current ? "simulation-current" : "simulation-outdated"}>{statusLabel}</Chip>
        </p>
        <button
          className="simulation-record-delete"
          type="button"
          aria-label={t("ui.simulationTab.deleteResult")}
          onClick={() => onDelete(record.id)}
        >
          <IconTrash size="1em" aria-hidden />
        </button>
      </header>
      <div className="simulation-results">
        <table
          className={`simulation-table${hasHealing ? " with-healing" : ""}`}
          aria-label={t("ui.simulationTab.simulationPercentileResults")}
        >
          <tbody>
            <tr className="simulation-table-row simulation-table-header">
              <th scope="col">{t("ui.simulationTab.result")}</th>
              <th scope="col">{t("system.totalDamage")}</th>
              <th scope="col">{t("system.dps")}</th>
              {hasHealing ? (
                <th scope="col" className="healing-value">
                  {t("system.hps")}
                </th>
              ) : null}
              <th scope="col">{t("system.abrasion")}</th>
              <th scope="col">{t("system.normal")}</th>
              <th scope="col">{t("system.critical")}</th>
              <th scope="col">{t("system.affinity")}</th>
              {hasHealing ? (
                <>
                  <th scope="col" className="healing-value">
                    {t("ui.simulationTab.healingOutcome", { outcome: t("system.normal") })}
                  </th>
                  <th scope="col" className="healing-value">
                    {t("ui.simulationTab.healingOutcome", { outcome: t("system.critical") })}
                  </th>
                </>
              ) : null}
            </tr>
            {resultRows.map(({ label, result }) => (
              <tr className="simulation-table-row" key={label}>
                <th scope="row">
                  <strong>{label}</strong>
                </th>
                <td>{formatNumber(result.totalDamage)}</td>
                <td>{formatNumber(result.dps)}</td>
                {hasHealing ? <td className="healing-value">{formatNumber(result.hps)}</td> : null}
                <td>{formatPercentage(result.abrasionPercentage)}</td>
                <td>{formatPercentage(result.normalPercentage)}</td>
                <td>{formatPercentage(result.criticalPercentage)}</td>
                <td>{formatPercentage(result.affinityPercentage)}</td>
                {hasHealing ? (
                  <>
                    <td className="healing-value">{formatPercentage(result.healingNormalPercentage)}</td>
                    <td className="healing-value">{formatPercentage(result.healingCriticalPercentage)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export default function SimulationTab({ bundle, bundleKey, rotationName, buildName }: SimulationTabProps) {
  const [count, setCount] = useState("100")
  const [progress, setProgress] = useState({ completed: 0, total: 100 })
  const [running, setRunning] = useState(false)
  const [records, setRecords] = useState<SimulationRecord[]>([])
  const [customPercentiles, setCustomPercentiles] = useState<number[]>(loadCustomPercentiles)
  const [addingPercentile, setAddingPercentile] = useState(false)
  const [percentileDraft, setPercentileDraft] = useState("")
  const [percentileError, setPercentileError] = useState("")
  const [error, setError] = useState("")
  const taskRef = useRef<SimulationTask | undefined>(undefined)
  const nextRecordIdRef = useRef(1)
  const percentileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => taskRef.current?.cancel(), [])
  useEffect(() => {
    if (addingPercentile) percentileInputRef.current?.focus()
  }, [addingPercentile])
  useEffect(() => setPersistentItem(customPercentileStorageKey, JSON.stringify(customPercentiles)), [customPercentiles])

  const addPercentile = () => {
    const percentile = Number(percentileDraft)
    if (!percentileDraft.trim() || !Number.isFinite(percentile) || percentile < 0 || percentile >= 100) {
      setPercentileError(t("ui.simulationTab.percentileRangeError"))
      return
    }
    if (presetPercentiles.has(percentile)) {
      setPercentileError(t("ui.simulationTab.percentilePresetError", { percentile }))
      return
    }
    if (customPercentiles.includes(percentile)) {
      setPercentileError(t("ui.simulationTab.percentileDuplicateError", { percentile }))
      return
    }
    setCustomPercentiles(current => [...current, percentile].sort((left, right) => right - left))
    setPercentileDraft("")
    setPercentileError("")
    setAddingPercentile(false)
  }

  const simulate = async () => {
    if (running) {
      taskRef.current?.cancel()
      return
    }
    const runCount = Number(count)
    if (!bundle || !Number.isSafeInteger(runCount) || runCount < 1) {
      setError(bundle ? t("ui.simulationTab.invalidCountError") : t("ui.simulationTab.rotationPreparingError"))
      return
    }
    setError("")
    dismissNotice("simulation")
    setProgress({ completed: 0, total: runCount })
    setRunning(true)
    const simulationBundleKey = bundleKey ?? ""
    const simulationRotationName = rotationName ?? t("ui.simulationTab.activeRotation")
    const simulationBuildName = buildName ?? t("ui.simulationTab.activeBuild")
    const task = startSimulation(bundle, runCount, (completed, total) => setProgress({ completed, total }))
    taskRef.current = task
    try {
      const summary = await task.promise
      const record: SimulationRecord = {
        id: nextRecordIdRef.current,
        summary,
        bundleKey: simulationBundleKey,
        rotationName: simulationRotationName,
        buildName: simulationBuildName,
      }
      nextRecordIdRef.current += 1
      setRecords(current => [record, ...current])
    } catch (taskError) {
      if (taskError instanceof Error && taskError.message !== "Simulation cancelled")
        publishNotice({ id: "simulation", error: true, message: taskError.message })
    } finally {
      if (taskRef.current === task) taskRef.current = undefined
      setRunning(false)
    }
  }

  const percentComplete = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0
  return (
    <Panel className="simulation-panel">
      <div className="simulation-controls">
        <label className="editor-field">
          {t("ui.simulationTab.simulationCount")}
          <input
            type="number"
            min="1"
            step="1"
            value={count}
            disabled={running}
            onChange={event => setCount(event.target.value)}
          />
        </label>
        <Button
          className={`${running ? "button-secondary" : "button-primary"}`}
          type="button"
          disabled={!bundle && !running}
          onClick={simulate}
        >
          {running ? t("ui.simulationTab.cancel") : t("ui.simulationTab.simulate")}
        </Button>
      </div>
      <div className="simulation-percentile-settings">
        <div className="simulation-percentile-heading">
          <strong>{t("ui.simulationTab.customPercentiles")}</strong>
          <Button
            className="button-secondary button-small"
            type="button"
            disabled={running || addingPercentile}
            onClick={() => {
              setAddingPercentile(true)
              setPercentileError("")
            }}
          >
            {t("ui.simulationTab.addPercentile")}
          </Button>
        </div>
        {customPercentiles.length > 0 && (
          <div className="simulation-percentile-chips">
            {customPercentiles.map(percentile => (
              <Chip className="simulation-percentile-chip" key={percentile}>
                {t("ui.simulationTab.p")}
                {percentile}
                <button
                  type="button"
                  aria-label={t("ui.simulationTab.removePercentile", { percentile })}
                  disabled={running}
                  onClick={() => setCustomPercentiles(current => current.filter(value => value !== percentile))}
                >
                  <IconX size="1em" aria-hidden />
                </button>
              </Chip>
            ))}
          </div>
        )}
        {addingPercentile && (
          <div className="simulation-percentile-add">
            <label>
              <span>{t("ui.simulationTab.p")}</span>
              <input
                ref={percentileInputRef}
                type="number"
                min="0"
                max="99.999999"
                step="any"
                value={percentileDraft}
                onChange={event => setPercentileDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") addPercentile()
                  if (event.key === "Escape") setAddingPercentile(false)
                }}
              />
            </label>
            <Button className="button-primary button-small" type="button" onClick={addPercentile}>
              {t("ui.simulationTab.add")}
            </Button>
            <Button
              className="button-secondary button-small"
              type="button"
              onClick={() => {
                setAddingPercentile(false)
                setPercentileError("")
              }}
            >
              {t("ui.simulationTab.cancel")}
            </Button>
          </div>
        )}
        {percentileError && (
          <p className="simulation-percentile-error" role="alert">
            {percentileError}
          </p>
        )}
      </div>
      {running && (
        <output className="simulation-progress" aria-live="polite">
          <progress max={progress.total} value={progress.completed} />
          <span>
            {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}{" "}
            {t("ui.simulationTab.progressRunsPrefix")}
            {percentComplete.toFixed(0)}
            %)
          </span>
        </output>
      )}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
      {records.length > 0 && (
        <div className="simulation-history">
          {records.map(record => (
            <SimulationResultCard
              key={record.id}
              record={record}
              customPercentiles={customPercentiles}
              currentBundleKey={bundleKey ?? ""}
              onDelete={id => setRecords(current => current.filter(candidate => candidate.id !== id))}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
