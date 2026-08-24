import { createServer } from "vite";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
class MemoryStorage {
  #values = new Map();
  get length() {
    return this.#values.size;
  }
  clear() {
    this.#values.clear();
  }
  getItem(key) {
    return this.#values.get(String(key)) ?? null;
  }
  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }
  removeItem(key) {
    this.#values.delete(String(key));
  }
  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

const localStorage = new MemoryStorage();
const firstTabStorage = new MemoryStorage();
globalThis.window = { localStorage, sessionStorage: firstTabStorage };
const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { getPersistentItem, migrateSessionStorage, removePersistentItem, setPersistentItem } =
    await viteServer.ssrLoadModule("/src/persistentStorage.ts");

  firstTabStorage.setItem("legacy", "rotation-data");
  assert(getPersistentItem("legacy") === "rotation-data", "A legacy session value must remain readable.");
  assert(localStorage.getItem("legacy") === "rotation-data", "A legacy session value must migrate to local storage.");
  assert(firstTabStorage.getItem("legacy") === null, "A migrated session value must be removed.");

  firstTabStorage.setItem("eager-a", "a");
  firstTabStorage.setItem("eager-b", "b");
  migrateSessionStorage();
  assert(
    localStorage.getItem("eager-a") === "a" && localStorage.getItem("eager-b") === "b",
    "App startup must eagerly migrate every remaining session value.",
  );
  assert(firstTabStorage.length === 0, "Startup migration must leave no legacy session values behind.");

  firstTabStorage.setItem("precedence", "stale-session-data");
  localStorage.setItem("precedence", "durable-data");
  assert(getPersistentItem("precedence") === "durable-data", "Durable data must take precedence over session data.");
  assert(firstTabStorage.getItem("precedence") === null, "A stale session copy must be removed.");

  const secondTabStorage = new MemoryStorage();
  globalThis.window.sessionStorage = secondTabStorage;
  assert(getPersistentItem("legacy") === "rotation-data", "Migrated data must be available in another tab.");
  setPersistentItem("saved", "value");
  assert(localStorage.getItem("saved") === "value", "New values must be written to local storage.");
  assert(secondTabStorage.getItem("saved") === null, "New values must not be written to session storage.");

  secondTabStorage.setItem("saved", "old-value");
  removePersistentItem("saved");
  assert(
    localStorage.getItem("saved") === null && secondTabStorage.getItem("saved") === null,
    "Removing a value must clear both durable and legacy storage.",
  );
} finally {
  await viteServer.close();
  delete globalThis.window;
}

console.log("Persistent storage migration checks passed.");
