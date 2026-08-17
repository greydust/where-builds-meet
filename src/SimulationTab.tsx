import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./UiIcon";
import type { RotationSimulationBundle } from "./calculations/rotationCalculator";
import {
  selectSimulationPercentile,
  type SimulationRunResult,
  type SimulationSummary,
} from "./calculations/simulationCalculator";
import { startSimulation, type SimulationTask } from "./calculations/simulationWorkerClient";
import { t } from "./i18n";

type SimulationTabProps = {
  bundle?: RotationSimulationBundle;
  bundleKey?: string;
  rotationName?: string;
  buildName?: string;
};

const customPercentileStorageKey = "wwm-simulation-percentiles-v1";
const presetPercentiles = new Set([99, 95, 90, 75, 50]);

function loadCustomPercentiles() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(customPercentileStorageKey) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
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
    ].sort((left, right) => right - left);
  } catch {
    return [];
  }
}

const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const formatPercentage = (value: number) => `${value.toFixed(2)}%`;

export default function SimulationTab({ bundle, bundleKey, rotationName, buildName }: SimulationTabProps) {
  const [count, setCount] = useState("100");
  const [progress, setProgress] = useState({ completed: 0, total: 100 });
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SimulationSummary>();
  const [simulatedBundleKey, setSimulatedBundleKey] = useState("");
  const [simulatedRotationName, setSimulatedRotationName] = useState("");
  const [simulatedBuildName, setSimulatedBuildName] = useState("");
  const [customPercentiles, setCustomPercentiles] = useState<number[]>(loadCustomPercentiles);
  const [addingPercentile, setAddingPercentile] = useState(false);
  const [percentileDraft, setPercentileDraft] = useState("");
  const [percentileError, setPercentileError] = useState("");
  const [error, setError] = useState("");
  const taskRef = useRef<SimulationTask | undefined>(undefined);

  useEffect(() => () => taskRef.current?.cancel(), []);
  useEffect(
    () => sessionStorage.setItem(customPercentileStorageKey, JSON.stringify(customPercentiles)),
    [customPercentiles],
  );

  const addPercentile = () => {
    const percentile = Number(percentileDraft);
    if (!percentileDraft.trim() || !Number.isFinite(percentile) || percentile < 0 || percentile >= 100) {
      setPercentileError(t("ui.simulationTab.percentileRangeError"));
      return;
    }
    if (presetPercentiles.has(percentile)) {
      setPercentileError(t("ui.simulationTab.percentilePresetError", { percentile }));
      return;
    }
    if (customPercentiles.includes(percentile)) {
      setPercentileError(t("ui.simulationTab.percentileDuplicateError", { percentile }));
      return;
    }
    setCustomPercentiles((current) => [...current, percentile].sort((left, right) => right - left));
    setPercentileDraft("");
    setPercentileError("");
    setAddingPercentile(false);
  };

  const simulate = async () => {
    if (running) {
      taskRef.current?.cancel();
      return;
    }
    const runCount = Number(count);
    if (!bundle || !Number.isSafeInteger(runCount) || runCount < 1) {
      setError(bundle ? t("ui.simulationTab.invalidCountError") : t("ui.simulationTab.rotationPreparingError"));
      return;
    }
    setError("");
    setProgress({ completed: 0, total: runCount });
    setRunning(true);
    setSimulatedRotationName(rotationName ?? t("ui.simulationTab.activeRotation"));
    setSimulatedBuildName(buildName ?? t("ui.simulationTab.activeBuild"));
    const simulationBundleKey = bundleKey ?? "";
    const task = startSimulation(bundle, runCount, (completed, total) => setProgress({ completed, total }));
    taskRef.current = task;
    try {
      setSummary(await task.promise);
      setSimulatedBundleKey(simulationBundleKey);
    } catch (taskError) {
      if (taskError instanceof Error && taskError.message !== "Simulation cancelled") setError(taskError.message);
    } finally {
      if (taskRef.current === task) taskRef.current = undefined;
      setRunning(false);
    }
  };

  const percentComplete = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const outdated = Boolean(summary && simulatedBundleKey !== (bundleKey ?? ""));
  const resultRows: Array<{ label: string; percentile: number; result: SimulationRunResult }> = summary
    ? [
        { label: t("ui.simulationTab.best"), percentile: 101, result: summary.results.best },
        { label: "P99", percentile: 99, result: summary.results.p99 },
        { label: "P95", percentile: 95, result: summary.results.p95 },
        { label: "P90", percentile: 90, result: summary.results.p90 },
        { label: "P75", percentile: 75, result: summary.results.p75 },
        { label: t("ui.simulationTab.median"), percentile: 50, result: summary.results.median },
        ...customPercentiles.map((percentile) => ({
          label: `P${percentile}`,
          percentile,
          result: selectSimulationPercentile(summary.runs, percentile / 100),
        })),
      ].sort((left, right) => right.percentile - left.percentile)
    : [];
  return (
    <section className="panel simulation-panel">
      {summary && (
        <div className="panel-heading">
          <div>
            <p>
              {t("ui.simulationTab.rotation")} {simulatedRotationName} {t("ui.simulationTab.build")}{" "}
              {simulatedBuildName} · {summary.runCount.toLocaleString()} {t("ui.simulationTab.runs")}{" "}
              {formatNumber(summary.duration)}
              {t("ui.simulationTab.s")}{" "}
              {outdated && <span className="simulation-outdated">{t("ui.simulationTab.outdated")}</span>}
            </p>
          </div>
        </div>
      )}
      <div className="simulation-controls">
        <label className="editor-field">
          {t("ui.simulationTab.simulationCount")}
          <input
            type="number"
            min="1"
            step="1"
            value={count}
            disabled={running}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <button
          className={`button ${running ? "button-secondary" : "button-primary"}`}
          type="button"
          disabled={!bundle && !running}
          onClick={simulate}
        >
          {running ? t("ui.simulationTab.cancel") : t("ui.simulationTab.simulate")}
        </button>
      </div>
      <div className="simulation-percentile-settings">
        <div className="simulation-percentile-heading">
          <strong>{t("ui.simulationTab.customPercentiles")}</strong>
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={running || addingPercentile}
            onClick={() => {
              setAddingPercentile(true);
              setPercentileError("");
            }}
          >
            {t("ui.simulationTab.addPercentile")}
          </button>
        </div>
        {customPercentiles.length > 0 && (
          <div className="simulation-percentile-chips">
            {customPercentiles.map((percentile) => (
              <span className="simulation-percentile-chip" key={percentile}>
                {t("ui.simulationTab.p")}
                {percentile}
                <button
                  type="button"
                  aria-label={t("ui.simulationTab.removePercentile", { percentile })}
                  disabled={running}
                  onClick={() => setCustomPercentiles((current) => current.filter((value) => value !== percentile))}
                >
                  <UiIcon name="close" />
                </button>
              </span>
            ))}
          </div>
        )}
        {addingPercentile && (
          <div className="simulation-percentile-add">
            <label>
              <span>{t("ui.simulationTab.p")}</span>
              <input
                type="number"
                min="0"
                max="99.999999"
                step="any"
                autoFocus
                value={percentileDraft}
                onChange={(event) => setPercentileDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addPercentile();
                  if (event.key === "Escape") setAddingPercentile(false);
                }}
              />
            </label>
            <button className="button button-primary button-small" type="button" onClick={addPercentile}>
              {t("ui.simulationTab.add")}
            </button>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => {
                setAddingPercentile(false);
                setPercentileError("");
              }}
            >
              {t("ui.simulationTab.cancel")}
            </button>
          </div>
        )}
        {percentileError && (
          <p className="simulation-percentile-error" role="alert">
            {percentileError}
          </p>
        )}
      </div>
      {running && (
        <div className="simulation-progress" role="status" aria-live="polite">
          <progress max={progress.total} value={progress.completed} />
          <span>
            {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}{" "}
            {t("ui.simulationTab.progressRunsPrefix")}
            {percentComplete.toFixed(0)}
            %)
          </span>
        </div>
      )}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <div className="simulation-results">
          <div className="simulation-table" role="table" aria-label={t("ui.simulationTab.simulationPercentileResults")}>
            <div className="simulation-table-row simulation-table-header" role="row">
              <span>{t("ui.simulationTab.result")}</span>
              <span>{t("system.totalDamage")}</span>
              <span>{t("system.dps")}</span>
              <span>{t("system.abrasion")}</span>
              <span>{t("system.normal")}</span>
              <span>{t("system.critical")}</span>
              <span>{t("system.affinity")}</span>
            </div>
            {resultRows.map(({ label, result }) => (
              <div className="simulation-table-row" role="row" key={label}>
                <strong>{label}</strong>
                <span>{formatNumber(result.totalDamage)}</span>
                <span>{formatNumber(result.dps)}</span>
                <span>{formatPercentage(result.abrasionPercentage)}</span>
                <span>{formatPercentage(result.normalPercentage)}</span>
                <span>{formatPercentage(result.criticalPercentage)}</span>
                <span>{formatPercentage(result.affinityPercentage)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
