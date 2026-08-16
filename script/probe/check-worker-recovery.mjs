import { createServer } from "vite";

const metrics = {
  totalDamage: 100,
  dps: 10,
  breakdown: { skills: [], casts: [], categories: [], damageTypes: [] },
  statPriority: [],
  attunementPriority: [],
  innerWayPriority: [],
  setupComparisons: {},
};

let workersCreated = 0;

class RecoveringWorker {
  listeners = new Map();

  constructor() {
    workersCreated += 1;
    this.instance = workersCreated;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message) {
    queueMicrotask(() => {
      const type = this.instance === 1 ? "error" : "message";
      const event = type === "error" ? { message: "Worker load interrupted" } : { data: { id: message.id, metrics } };
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    });
  }

  terminate() {}
}

globalThis.Worker = RecoveringWorker;

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { disposeRotationCalculationWorker, requestRotationCalculation } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationWorkerClient.ts",
  );
  const result = await requestRotationCalculation({
    duration: 1,
    baseline: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  if (result.dps !== metrics.dps) throw new Error("The interrupted calculation did not recover.");
  if (workersCreated !== 2) throw new Error(`Expected one replacement worker, but created ${workersCreated}.`);
  disposeRotationCalculationWorker();
  console.log("Worker recovery probe passed.");
} finally {
  await viteServer.close();
}
