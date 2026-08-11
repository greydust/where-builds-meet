import { useEffect, useRef, useState } from "react";
import type { RotationSimulationBundle } from "./calculations/rotationCalculator";
import type { SimulationSummary } from "./calculations/simulationCalculator";
import { startSimulation, type SimulationTask } from "./calculations/simulationWorkerClient";

type SimulationTabProps = {
  bundle?: RotationSimulationBundle;
  bundleKey?: string;
  rotationName?: string;
  buildName?: string;
};

const rows: Array<[keyof SimulationSummary["results"], string]> = [
  ["best", "Best"],
  ["p99", "P99"],
  ["p95", "P95"],
  ["p90", "P90"],
  ["p75", "P75"],
  ["median", "Median"],
];

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
  const [error, setError] = useState("");
  const taskRef = useRef<SimulationTask | undefined>(undefined);

  useEffect(() => () => taskRef.current?.cancel(), []);

  const simulate = async () => {
    if (running) {
      taskRef.current?.cancel();
      return;
    }
    const runCount = Number(count);
    if (!bundle || !Number.isSafeInteger(runCount) || runCount < 1) {
      setError(bundle ? "Simulation count must be a positive whole number." : "The active rotation is still being prepared.");
      return;
    }
    setError("");
    setProgress({ completed: 0, total: runCount });
    setRunning(true);
    setSimulatedRotationName(rotationName ?? "Active rotation");
    setSimulatedBuildName(buildName ?? "Active build");
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

  const percentComplete = progress.total > 0 ? progress.completed / progress.total * 100 : 0;
  const outdated = Boolean(summary && simulatedBundleKey !== (bundleKey ?? ""));
  return <section className="panel simulation-panel">
    <div className="panel-heading"><div><h2>Simulation {outdated && <span className="simulation-outdated">Outdated</span>}</h2>{summary && <p>Rotation: {simulatedRotationName} · Build: {simulatedBuildName} · {summary.runCount.toLocaleString()} runs · {formatNumber(summary.duration)}s</p>}</div></div>
    <div className="simulation-controls">
      <label className="editor-field">Simulation count<input type="number" min="1" step="1" value={count} disabled={running} onChange={(event) => setCount(event.target.value)} /></label>
      <button className={`button ${running ? "button-secondary" : "button-primary"}`} type="button" disabled={!bundle && !running} onClick={simulate}>{running ? "Cancel" : "Simulate"}</button>
    </div>
    {running && <div className="simulation-progress" role="status" aria-live="polite">
      <progress max={progress.total} value={progress.completed} />
      <span>{progress.completed.toLocaleString()} / {progress.total.toLocaleString()} runs ({percentComplete.toFixed(0)}%)</span>
    </div>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    {summary && <div className="simulation-results">
      <div className="simulation-table" role="table" aria-label="Simulation percentile results">
        <div className="simulation-table-row simulation-table-header" role="row"><span>Result</span><span>Total Damage</span><span>DPS</span><span>Abrasion</span><span>Normal</span><span>Critical</span><span>Affinity</span></div>
        {rows.map(([key, label]) => {
          const result = summary.results[key];
          return <div className="simulation-table-row" role="row" key={key}><strong>{label}</strong><span>{formatNumber(result.totalDamage)}</span><span>{formatNumber(result.dps)}</span><span>{formatPercentage(result.abrasionPercentage)}</span><span>{formatPercentage(result.normalPercentage)}</span><span>{formatPercentage(result.criticalPercentage)}</span><span>{formatPercentage(result.affinityPercentage)}</span></div>;
        })}
      </div>
    </div>}
  </section>;
}
