function availableStorage(name: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return undefined;
  try {
    return window[name];
  } catch {
    return undefined;
  }
}

function readItem(storage: Storage | undefined, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function removeItem(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // A blocked legacy store must not prevent durable storage from loading.
  }
}

export function getPersistentItem(key: string) {
  const persistent = availableStorage("localStorage");
  const legacySession = availableStorage("sessionStorage");
  const saved = readItem(persistent, key);
  if (saved !== null) {
    removeItem(legacySession, key);
    return saved;
  }

  const legacy = readItem(legacySession, key);
  if (legacy === null) return null;
  try {
    persistent?.setItem(key, legacy);
    if (readItem(persistent, key) === legacy) removeItem(legacySession, key);
  } catch {
    // Preserve the session value when durable storage is unavailable.
  }
  return legacy;
}

export function setPersistentItem(key: string, value: string) {
  const persistent = availableStorage("localStorage");
  if (!persistent) throw new Error("Persistent browser storage is unavailable.");
  persistent.setItem(key, value);
  removeItem(availableStorage("sessionStorage"), key);
}

export function removePersistentItem(key: string) {
  removeItem(availableStorage("localStorage"), key);
  removeItem(availableStorage("sessionStorage"), key);
}

export function migrateSessionStorage() {
  const legacySession = availableStorage("sessionStorage");
  if (!legacySession) return;
  const keys = Array.from({ length: legacySession.length }, (_, index) => legacySession.key(index)).filter(
    (key): key is string => key !== null,
  );
  keys.forEach(getPersistentItem);
}
