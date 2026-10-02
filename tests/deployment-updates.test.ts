import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { build } from "esbuild"
import { describe, it } from "vitest"

import { retainAssets } from "../script/deploy/retain-assets.mjs"
import { documentWithVisibility, urlOf, windowWithLifecycle } from "./helpers/domStubs"

// Ported from script/probe/check-deployment-updates.mjs.
describe("deployment-updates", () => {
  it("Deployment asset retention, expiry, update detection, import fallback, and explicit reload checks passed", async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), "wwm-deployment-probe-"))
    const originalFetch = globalThis.fetch
    const day = 24 * 60 * 60 * 1000
    const site = "https://example.test/where-builds-meet/"
    let liveFiles = new Map<string, string>()
    const requested: string[] = []
    globalThis.fetch = async input => {
      const location = new URL(urlOf(input))
      assert.equal(location.origin + location.pathname.split("/").slice(0, 2).join("/") + "/", site)
      requested.push(location.pathname)
      const body = liveFiles.get(location.pathname.slice("/where-builds-meet/".length))
      return new Response(body ?? "Not found", { status: body === undefined ? 404 : 200 })
    }
    const createBuild = async (name: string, files: Record<string, string>) => {
      const directory = path.join(temporary, name)
      await mkdir(path.join(directory, "assets"), { recursive: true })
      await writeFile(path.join(directory, "index.html"), name)
      await Promise.all(
        Object.entries(files).map(([file, content]) => writeFile(path.join(directory, "assets", file), content)),
      )
      return directory
    }
    const publish = async (directory: string) => {
      liveFiles = new Map([["asset-history.json", await readFile(path.join(directory, "asset-history.json"), "utf8")]])
      const assetFiles = await readdir(path.join(directory, "assets"))
      const assetContents = await Promise.all(
        assetFiles.map(async file => [file, await readFile(path.join(directory, "assets", file), "utf8")] as const),
      )
      for (const [file, content] of assetContents) liveFiles.set(`assets/${file}`, content)
    }

    // Installed before the try so teardown can restore them unconditionally.

    const navigations: string[] = []

    const lifecycle = windowWithLifecycle({
      href: `${site}?existing=1#rotation`,

      onNavigate: url => navigations.push(url),

      intervalMs: 60000,
    })

    const documentStub = documentWithVisibility()

    try {
      const previous = await createBuild("legacy", { "old-123.js": "legacy lazy chunk", "shared-123.js": "shared" })
      const first = await createBuild("first", { "new-456.js": "new chunk", "shared-123.js": "shared" })
      await retainAssets({ dist: first, previous, site, now: 10 * day })
      assert.equal(await readFile(path.join(first, "assets/old-123.js"), "utf8"), "legacy lazy chunk")
      assert.equal(await readFile(path.join(first, "index.html"), "utf8"), "first")
      await publish(first)
      const firstHistory = liveFiles.get("asset-history.json")
      assert(firstHistory, "Publishing must record the asset history.")
      assert.deepEqual(JSON.parse(firstHistory).assets, {
        "new-456.js": null,
        "shared-123.js": null,
        "old-123.js": 17 * day,
      })

      const second = await createBuild("second", { "latest-789.js": "latest chunk", "shared-123.js": "shared" })
      await retainAssets({ dist: second, previous: "absent-archive", site, now: 12 * day })
      await publish(second)
      const secondHistory = liveFiles.get("asset-history.json")
      assert(secondHistory, "Publishing must record the asset history.")
      const inventory = JSON.parse(secondHistory).assets
      assert.equal(inventory["old-123.js"], 17 * day, "Subsequent releases must not extend retired assets' deadlines.")
      assert.equal(inventory["new-456.js"], 19 * day, "A replaced current asset receives seven days from replacement.")
      assert.equal(liveFiles.get("assets/old-123.js"), "legacy lazy chunk")
      assert(!requested.includes("/where-builds-meet/assets/shared-123.js"), "Current assets must not be overwritten.")

      const third = await createBuild("third", { "latest-789.js": "latest chunk", "shared-123.js": "shared" })
      await retainAssets({ dist: third, previous: "absent-archive", site, now: 17 * day })
      assert(!(await readdir(path.join(third, "assets"))).includes("old-123.js"), "Expired assets must be pruned.")
      assert.equal(await readFile(path.join(third, "assets/new-456.js"), "utf8"), "new chunk")
      liveFiles.delete("assets/new-456.js")
      const missing = await createBuild("missing", { "fourth-012.js": "fourth chunk" })
      await assert.rejects(
        retainAssets({ dist: missing, previous, site, now: 17 * day }),
        /Unable to retain deployed asset/,
      )

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
      })
      const updates = (await import(
        `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
      )) as typeof import("../src/deploymentUpdates") & typeof import("../src/notices")
      let version = "running"
      let offline = false
      let checks = 0
      globalThis.fetch = async (input, options) => {
        checks++
        assert(options, "The version check must be fetched with options.")
        const location = new URL(urlOf(input))
        assert.equal(location.pathname, "/where-builds-meet/version.json")
        assert.equal(options.cache, "no-store")
        assert(location.searchParams.has("check"))
        if (offline) throw new Error("offline")
        return Response.json({ version })
      }
      const flush = () => new Promise<void>(resolve => setImmediate(resolve))
      let notices = 0
      const unsubscribe = updates.subscribeToNotices(() => notices++)
      const stop = updates.startDeploymentUpdates()
      await flush()
      assert.equal(updates.getDeploymentUpdate(), "current")
      offline = true
      await lifecycle.runPeriodicCheck()
      assert.equal(updates.getDeploymentUpdate(), "current", "Offline checks must not announce a new deployment.")
      const importError = new TypeError("Failed to fetch dynamically imported module")
      lifecycle.events.dispatchEvent(Object.assign(new Event("vite:preloadError"), { payload: importError }))
      await flush()
      assert.equal(updates.getDeploymentUpdate(), "load-error")
      assert(
        updates.isDeploymentImportError(importError),
        "Feature boundaries must recognize the actual import rejection.",
      )
      assert(!updates.isDeploymentImportError(new Error("unrelated")))
      offline = false
      version = "new-release"
      lifecycle.events.dispatchEvent(new Event("online"))
      await flush()
      assert.equal(updates.getDeploymentUpdate(), "available")
      assert.equal(notices, 2)
      await lifecycle.runPeriodicCheck()
      assert.equal(notices, 2, "Repeated checks must not reannounce the same update.")
      updates.publishNotice({ id: "build-import", message: "Invalid build file", error: true })
      updates.publishNotice({ id: "rotation-transfer", message: "Imported rotation" })
      assert.equal(updates.getNotices().length, 3, "Independent notices must coexist with a deployment notice.")
      updates.publishNotice({ id: "build-import", message: "Corrected build file" })
      assert.equal(updates.getNotices().length, 3, "A source replaces its previous message without duplicating it.")
      const corrected = updates.getNotices().find(notice => notice.id === "build-import")
      assert(corrected, "The corrected notice must be the one still listed.")
      assert.equal(corrected.message, "Corrected build file")
      updates.dismissNotice("build-import")
      assert.deepEqual(
        updates.getNotices().map(notice => notice.id),
        ["deployment", "rotation-transfer"],
      )
      updates.dismissNotice("deployment")
      await lifecycle.runPeriodicCheck()
      assert(
        !updates.getNotices().some(notice => notice.id === "deployment"),
        "Dismissed updates must not reappear every minute.",
      )
      assert.equal(navigations.length, 0, "Detecting a release or import error must never reload automatically.")
      documentStub.setVisibility("hidden")
      const beforeHiddenCheck = checks
      await lifecycle.runPeriodicCheck()
      assert.equal(checks, beforeHiddenCheck)
      updates.reloadDeployment()
      assert.equal(navigations.length, 1)
      const reload = new URL(navigations[0])
      assert.equal(reload.searchParams.get("existing"), "1")
      assert.equal(reload.hash, "#rotation")
      assert(reload.searchParams.has("app-reload"))
      stop()
      unsubscribe()
      documentStub.setVisibility("visible")
      lifecycle.events.dispatchEvent(new Event("focus"))
      assert.equal(checks, beforeHiddenCheck, "Cleanup must remove event listeners and timers.")
    } finally {
      globalThis.fetch = originalFetch
      lifecycle.restore()
      documentStub.restore()
      await rm(temporary, { recursive: true, force: true })
    }
  })
})
