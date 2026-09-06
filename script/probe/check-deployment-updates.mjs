import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { retainAssets } from "../deploy/retain-assets.mjs";

const temporary = await mkdtemp(path.join(tmpdir(), "wwm-deployment-probe-"));
const originalFetch = globalThis.fetch;
const day = 24 * 60 * 60 * 1000;
const site = "https://example.test/where-builds-meet/";
let liveFiles = new Map();
const requested = [];
globalThis.fetch = async (url) => {
  const location = new URL(url);
  assert.equal(location.origin + location.pathname.split("/").slice(0, 2).join("/") + "/", site);
  requested.push(location.pathname);
  const body = liveFiles.get(location.pathname.slice("/where-builds-meet/".length));
  return new Response(body ?? "Not found", { status: body === undefined ? 404 : 200 });
};
const createBuild = async (name, files) => {
  const directory = path.join(temporary, name);
  await mkdir(path.join(directory, "assets"), { recursive: true });
  await writeFile(path.join(directory, "index.html"), name);
  for (const [file, content] of Object.entries(files)) await writeFile(path.join(directory, "assets", file), content);
  return directory;
};
const publish = async (directory) => {
  liveFiles = new Map([["asset-history.json", await readFile(path.join(directory, "asset-history.json"), "utf8")]]);
  for (const file of await readdir(path.join(directory, "assets")))
    liveFiles.set(`assets/${file}`, await readFile(path.join(directory, "assets", file), "utf8"));
};

try {
  const previous = await createBuild("legacy", { "old-123.js": "legacy lazy chunk", "shared-123.js": "shared" });
  const first = await createBuild("first", { "new-456.js": "new chunk", "shared-123.js": "shared" });
  await retainAssets({ dist: first, previous, site, now: 10 * day });
  assert.equal(await readFile(path.join(first, "assets/old-123.js"), "utf8"), "legacy lazy chunk");
  assert.equal(await readFile(path.join(first, "index.html"), "utf8"), "first");
  await publish(first);
  assert.deepEqual(JSON.parse(liveFiles.get("asset-history.json")).assets, {
    "new-456.js": null,
    "shared-123.js": null,
    "old-123.js": 17 * day,
  });

  const second = await createBuild("second", { "latest-789.js": "latest chunk", "shared-123.js": "shared" });
  await retainAssets({ dist: second, previous: "absent-archive", site, now: 12 * day });
  await publish(second);
  const inventory = JSON.parse(liveFiles.get("asset-history.json")).assets;
  assert.equal(inventory["old-123.js"], 17 * day, "Subsequent releases must not extend retired assets' deadlines.");
  assert.equal(inventory["new-456.js"], 19 * day, "A replaced current asset receives seven days from replacement.");
  assert.equal(liveFiles.get("assets/old-123.js"), "legacy lazy chunk");
  assert(!requested.includes("/where-builds-meet/assets/shared-123.js"), "Current assets must not be overwritten.");

  const third = await createBuild("third", { "latest-789.js": "latest chunk", "shared-123.js": "shared" });
  await retainAssets({ dist: third, previous: "absent-archive", site, now: 17 * day });
  assert(!(await readdir(path.join(third, "assets"))).includes("old-123.js"), "Expired assets must be pruned.");
  assert.equal(await readFile(path.join(third, "assets/new-456.js"), "utf8"), "new chunk");
  liveFiles.delete("assets/new-456.js");
  const missing = await createBuild("missing", { "fourth-012.js": "fourth chunk" });
  await assert.rejects(
    retainAssets({ dist: missing, previous, site, now: 17 * day }),
    /Unable to retain deployed asset/,
  );

  const output = await build({
    stdin: {
      contents: 'export * from "./src/deploymentUpdates"; export * from "./src/notices";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    define: {
      "import.meta.env.PROD": "true",
      "import.meta.env.BASE_URL": JSON.stringify("/where-builds-meet/"),
      __APP_VERSION__: JSON.stringify("running"),
    },
  });
  const updates = await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
  );
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  let periodicCheck;
  const navigations = [];
  globalThis.window = Object.assign(windowEvents, {
    location: {
      origin: "https://example.test",
      href: site + "?existing=1#rotation",
      replace: (url) => navigations.push(url),
    },
    setInterval: (callback, delay) => {
      assert.equal(delay, 60000);
      periodicCheck = callback;
      return 1;
    },
    clearInterval: () => {
      periodicCheck = undefined;
    },
  });
  globalThis.document = Object.assign(documentEvents, { visibilityState: "visible" });
  let version = "running";
  let offline = false;
  let checks = 0;
  globalThis.fetch = async (url, options) => {
    checks++;
    assert.equal(new URL(url).pathname, "/where-builds-meet/version.json");
    assert.equal(options.cache, "no-store");
    assert(new URL(url).searchParams.has("check"));
    if (offline) throw new Error("offline");
    return Response.json({ version });
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  let notices = 0;
  const unsubscribe = updates.subscribeToNotices(() => notices++);
  const stop = updates.startDeploymentUpdates();
  await flush();
  assert.equal(updates.getDeploymentUpdate(), "current");
  offline = true;
  await periodicCheck();
  assert.equal(updates.getDeploymentUpdate(), "current", "Offline checks must not announce a new deployment.");
  const importError = new TypeError("Failed to fetch dynamically imported module");
  windowEvents.dispatchEvent(Object.assign(new Event("vite:preloadError"), { payload: importError }));
  await flush();
  assert.equal(updates.getDeploymentUpdate(), "load-error");
  assert(
    updates.isDeploymentImportError(importError),
    "Feature boundaries must recognize the actual import rejection.",
  );
  assert(!updates.isDeploymentImportError(new Error("unrelated")));
  offline = false;
  version = "new-release";
  windowEvents.dispatchEvent(new Event("online"));
  await flush();
  assert.equal(updates.getDeploymentUpdate(), "available");
  assert.equal(notices, 2);
  await periodicCheck();
  assert.equal(notices, 2, "Repeated checks must not reannounce the same update.");
  updates.publishNotice({ id: "build-import", message: "Invalid build file", error: true });
  updates.publishNotice({ id: "rotation-transfer", message: "Imported rotation" });
  assert.equal(updates.getNotices().length, 3, "Independent notices must coexist with a deployment notice.");
  updates.publishNotice({ id: "build-import", message: "Corrected build file" });
  assert.equal(updates.getNotices().length, 3, "A source replaces its previous message without duplicating it.");
  assert.equal(updates.getNotices().find((notice) => notice.id === "build-import").message, "Corrected build file");
  updates.dismissNotice("build-import");
  assert.deepEqual(
    updates.getNotices().map((notice) => notice.id),
    ["deployment", "rotation-transfer"],
  );
  updates.dismissNotice("deployment");
  await periodicCheck();
  assert(
    !updates.getNotices().some((notice) => notice.id === "deployment"),
    "Dismissed updates must not reappear every minute.",
  );
  assert.equal(navigations.length, 0, "Detecting a release or import error must never reload automatically.");
  document.visibilityState = "hidden";
  const beforeHiddenCheck = checks;
  await periodicCheck();
  assert.equal(checks, beforeHiddenCheck);
  updates.reloadDeployment();
  assert.equal(navigations.length, 1);
  const reload = new URL(navigations[0]);
  assert.equal(reload.searchParams.get("existing"), "1");
  assert.equal(reload.hash, "#rotation");
  assert(reload.searchParams.has("app-reload"));
  stop();
  unsubscribe();
  document.visibilityState = "visible";
  windowEvents.dispatchEvent(new Event("focus"));
  assert.equal(checks, beforeHiddenCheck, "Cleanup must remove event listeners and timers.");
  console.log(
    "Deployment asset retention, expiry, update detection, import fallback, and explicit reload checks passed.",
  );
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.window;
  delete globalThis.document;
  await rm(temporary, { recursive: true, force: true });
}
