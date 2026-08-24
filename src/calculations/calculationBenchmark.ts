export type CalculationBenchmarkPhase =
  | "timelineConstruction"
  | "timelineQueueOrdering"
  | "effectTriggering"
  | "damagePipeline"
  | "damageEntryConstruction"
  | "effectResolution"
  | "damageEventOrdering"
  | "damageEventTraversal"
  | "targetStatePropagation"
  | "eventListening"
  | "listenerRequirementEvaluation"
  | "replayConstruction"
  | "replayQueueInsertion"
  | "damageCalculation"
  | "damageStatResolution"
  | "damageStatEffectDetection"
  | "damageStatPipeline"
  | "damageEffectAggregation"
  | "damageEffectFieldAggregation"
  | "damageChannelSnapshot"
  | "damageAttunementAggregation"
  | "damageSharedMultiplierResolution"
  | "damageRateResolution"
  | "damageVariantCalculation"
  | "damagePhysicalChannel"
  | "damageAttributeChannels"
  | "damageOutcomeAggregation"
  | "targetHPUpdate"
  | "timingResolution"
  | "metricsAndBreakdown";

type PhaseMeasurement = { duration: number; calls: number };
type BenchmarkSession = {
  label: string;
  startedAt: number;
  phases: Map<CalculationBenchmarkPhase, PhaseMeasurement>;
};

const benchmarkEnabled = import.meta.env.DEV;
let activeSession: BenchmarkSession | undefined;

function currentTime() {
  return performance.now();
}

function recordPhase(phase: CalculationBenchmarkPhase, duration: number) {
  if (!activeSession) return;
  const current = activeSession.phases.get(phase) ?? { duration: 0, calls: 0 };
  current.duration += duration;
  current.calls += 1;
  activeSession.phases.set(phase, current);
}

export function startCalculationPhase() {
  return benchmarkEnabled && activeSession ? currentTime() : 0;
}

export function finishCalculationPhase(phase: CalculationBenchmarkPhase, startedAt: number) {
  if (!benchmarkEnabled || !activeSession || startedAt === 0) return;
  recordPhase(phase, currentTime() - startedAt);
}

function reportBenchmark(session: BenchmarkSession, totalDuration: number) {
  const measurement = (phase: CalculationBenchmarkPhase) => session.phases.get(phase) ?? { duration: 0, calls: 0 };
  const duration = (phase: CalculationBenchmarkPhase) => measurement(phase).duration;
  const rows: Array<{
    scope: "total" | "top-level" | "subphase" | "remainder";
    phase: string;
    milliseconds: number;
    percent: number;
    calls: number | string;
  }> = [];
  const addRow = (
    scope: (typeof rows)[number]["scope"],
    phase: string,
    milliseconds: number,
    calls: number | string,
  ) => {
    const normalizedDuration = Math.max(0, milliseconds);
    rows.push({
      scope,
      phase,
      milliseconds: Number(normalizedDuration.toFixed(3)),
      percent: Number((totalDuration > 0 ? (normalizedDuration / totalDuration) * 100 : 0).toFixed(2)),
      calls,
    });
  };

  addRow("total", "Worker calculation", totalDuration, 1);
  const topLevelPhases: Array<[CalculationBenchmarkPhase, string]> = [
    ["timelineConstruction", "Timeline construction"],
    ["damagePipeline", "Damage entry and event pipeline"],
    ["timingResolution", "Anchor and duration resolution"],
    ["metricsAndBreakdown", "Metrics and breakdown aggregation"],
  ];
  topLevelPhases.forEach(([phase, label]) => addRow("top-level", label, duration(phase), measurement(phase).calls));
  const measuredTopLevel = topLevelPhases.reduce((total, [phase]) => total + duration(phase), 0);
  addRow("remainder", "Worker orchestration and unclassified", totalDuration - measuredTopLevel, "derived");

  const subphases: Array<[CalculationBenchmarkPhase, string]> = [
    ["timelineQueueOrdering", "Timeline queue sorting and removal"],
    ["effectTriggering", "Timeline effect-trigger evaluation"],
    ["damageEntryConstruction", "Damage entry/context construction"],
    ["effectResolution", "Active effect resolution"],
    ["damageEventOrdering", "Target-state/damage stream ordering"],
    ["damageEventTraversal", "Ordered damage-event traversal (parent)"],
    ["targetStatePropagation", "Target-state propagation"],
    ["damageCalculation", "Real damage formula calculation"],
    ["damageStatResolution", "Per-hit stat/effective-stat resolution"],
    ["damageStatEffectDetection", "Stat-effect detection"],
    ["damageStatPipeline", "Stat/effective-stat pipeline execution"],
    ["damageEffectAggregation", "Effect and attunement aggregation"],
    ["damageEffectFieldAggregation", "Damage-effect field aggregation"],
    ["damageChannelSnapshot", "Resolved attack-channel snapshot"],
    ["damageAttunementAggregation", "Matching attunement aggregation"],
    ["damageSharedMultiplierResolution", "Shared damage-multiplier resolution"],
    ["damageRateResolution", "Outcome-rate and conversion resolution"],
    ["damageVariantCalculation", "Damage variant evaluation (parent)"],
    ["damagePhysicalChannel", "Physical-channel variant math"],
    ["damageAttributeChannels", "Attribute-channel variant math"],
    ["damageOutcomeAggregation", "Outcome weighting and result assembly"],
    ["eventListening", "Damage-event listener dispatch (parent)"],
    ["listenerRequirementEvaluation", "Listener cooldown and requirement checks"],
    ["replayConstruction", "Replay row and damage-entry construction"],
    ["replayQueueInsertion", "Replay ordered-queue insertion"],
    ["targetHPUpdate", "Post-hit target HP update"],
  ];
  subphases.forEach(([phase, label]) => addRow("subphase", label, duration(phase), measurement(phase).calls));

  addRow(
    "remainder",
    "Other timeline construction",
    duration("timelineConstruction") - duration("timelineQueueOrdering") - duration("effectTriggering"),
    "derived",
  );
  addRow(
    "remainder",
    "Other damage-entry construction",
    duration("damageEntryConstruction") - duration("effectResolution"),
    "derived",
  );
  addRow(
    "remainder",
    "Other ordered damage-event traversal",
    duration("damageEventTraversal") -
      duration("targetStatePropagation") -
      duration("damageCalculation") -
      duration("eventListening") -
      duration("targetHPUpdate"),
    "derived",
  );
  addRow(
    "remainder",
    "Other real damage formula work",
    duration("damageCalculation") -
      duration("damageStatResolution") -
      duration("damageEffectAggregation") -
      duration("damageRateResolution") -
      duration("damageVariantCalculation") -
      duration("damageOutcomeAggregation"),
    "derived",
  );
  addRow(
    "remainder",
    "Other per-hit stat resolution",
    duration("damageStatResolution") - duration("damageStatEffectDetection") - duration("damageStatPipeline"),
    "derived",
  );
  addRow(
    "remainder",
    "Other effect and attunement aggregation",
    duration("damageEffectAggregation") -
      duration("damageEffectFieldAggregation") -
      duration("damageChannelSnapshot") -
      duration("damageAttunementAggregation") -
      duration("damageSharedMultiplierResolution"),
    "derived",
  );
  addRow(
    "remainder",
    "Other damage variant work",
    duration("damageVariantCalculation") - duration("damagePhysicalChannel") - duration("damageAttributeChannels"),
    "derived",
  );
  addRow(
    "remainder",
    "Other damage-event listener dispatch",
    duration("eventListening") -
      duration("listenerRequirementEvaluation") -
      duration("replayConstruction") -
      duration("replayQueueInsertion"),
    "derived",
  );
  console.groupCollapsed(`[Damage benchmark] ${session.label} — ${totalDuration.toFixed(2)} ms`);
  console.table(rows);
  console.groupEnd();
}

export function withCalculationBenchmark<T>(label: string, operation: () => T): T {
  if (!benchmarkEnabled || activeSession) return operation();
  const session: BenchmarkSession = { label, startedAt: currentTime(), phases: new Map() };
  activeSession = session;
  try {
    return operation();
  } finally {
    const totalDuration = currentTime() - session.startedAt;
    activeSession = undefined;
    reportBenchmark(session, totalDuration);
  }
}
