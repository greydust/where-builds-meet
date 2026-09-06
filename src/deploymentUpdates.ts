import { publishNotice } from "./notices";
import { t } from "./i18n";

type UpdateState = "current" | "available" | "load-error";

let state: UpdateState = "current";
const importErrors = new Set<unknown>();

export function getDeploymentUpdate() {
  return state;
}
export function isDeploymentImportError(error: unknown) {
  return importErrors.has(error);
}

function publish(next: UpdateState) {
  if (state === next) return;
  state = next;
  switch (next) {
    case "available":
      publishNotice({
        id: "deployment",
        message: () => t("ui.notices.updateMessage"),
        action: { label: () => t("ui.deployment.reload"), run: reloadDeployment },
      });
      break;
    case "load-error":
      publishNotice({
        id: "deployment",
        error: true,
        message: () => t("ui.notices.moduleError"),
        action: { label: () => t("ui.deployment.reload"), run: reloadDeployment },
      });
      break;
    case "current":
      break;
  }
}

export function startDeploymentUpdates() {
  if (!import.meta.env.PROD) return () => {};
  let checking = false;
  let stopped = false;
  const check = async () => {
    if (checking || stopped || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const url = new URL(`${import.meta.env.BASE_URL}version.json`, window.location.origin);
      url.searchParams.set("check", String(Date.now()));
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return;
      const result: unknown = await response.json();
      if (
        !stopped &&
        result &&
        typeof result === "object" &&
        "version" in result &&
        typeof result.version === "string" &&
        result.version !== __APP_VERSION__
      )
        publish("available");
    } catch {
      // Offline checks must not interrupt editing or claim a new release exists.
    } finally {
      checking = false;
    }
  };
  const onImportError = (event: Event) => {
    importErrors.add((event as Event & { payload: unknown }).payload);
    if (state !== "available") publish("load-error");
    void check();
    // Leave the rejection intact so the feature boundary can catch React.lazy failures.
  };
  window.addEventListener("vite:preloadError", onImportError);
  window.addEventListener("focus", check);
  window.addEventListener("online", check);
  document.addEventListener("visibilitychange", check);
  const interval = window.setInterval(check, 60000);
  void check();
  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener("vite:preloadError", onImportError);
    window.removeEventListener("focus", check);
    window.removeEventListener("online", check);
    document.removeEventListener("visibilitychange", check);
  };
}

export function reloadDeployment() {
  const url = new URL(window.location.href);
  url.searchParams.set("app-reload", String(Date.now()));
  window.location.replace(url.href);
}
