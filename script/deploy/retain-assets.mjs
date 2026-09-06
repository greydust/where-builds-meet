import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const retentionMs = 7 * 24 * 60 * 60 * 1000;
const assetName = /^[A-Za-z0-9_.-]+$/;

async function fetchRequired(url) {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Unable to retain deployed asset ${url}: HTTP ${response.status}`);
  return response;
}

export async function retainAssets({ dist, previous, site, now = Date.now() }) {
  const assetsDirectory = path.join(dist, "assets");
  const currentFiles = await readdir(assetsDirectory, { withFileTypes: true });
  const assets = {};
  for (const file of currentFiles) {
    if (!file.isFile() || !assetName.test(file.name)) throw new Error(`Unexpected build asset: ${file.name}`);
    assets[file.name] = null;
  }

  // Read the live inventory even after Actions artifacts expire. On the first
  // rollout only, the previous Pages artifact supplies the pre-inventory build.
  const inventoryUrl = new URL("asset-history.json", site.endsWith("/") ? site : `${site}/`);
  inventoryUrl.searchParams.set("check", String(now));
  const response = await fetch(inventoryUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  let previousAssets;
  let fromArchive = false;
  switch (response.status) {
    case 200:
      previousAssets = (await response.json()).assets;
      break;
    case 404:
      fromArchive = true;
      try {
        previousAssets = JSON.parse(await readFile(path.join(previous, "asset-history.json"), "utf8")).assets;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        previousAssets = {};
        // Missing archives fail deployment instead of silently dropping live chunks.
        for (const file of await readdir(path.join(previous, "assets"))) previousAssets[file] = null;
      }
      break;
    default:
      throw new Error(`Unable to read deployed asset inventory: HTTP ${response.status}`);
  }
  if (!previousAssets || typeof previousAssets !== "object" || Array.isArray(previousAssets))
    throw new Error("Invalid deployed asset inventory.");
  await mkdir(assetsDirectory, { recursive: true });
  for (const [name, previousExpiry] of Object.entries(previousAssets)) {
    if (!assetName.test(name) || name === "." || name === "..") throw new Error(`Invalid retained asset: ${name}`);
    if (previousExpiry !== null && (typeof previousExpiry !== "number" || !Number.isFinite(previousExpiry)))
      throw new Error(`Invalid retention deadline for ${name}`);
    if (Object.hasOwn(assets, name)) continue;
    const expiresAt = previousExpiry ?? now + retentionMs;
    if (expiresAt <= now) continue;
    const destination = path.join(assetsDirectory, name);
    if (fromArchive) await copyFile(path.join(previous, "assets", name), destination);
    else {
      const asset = await fetchRequired(new URL(`assets/${name}`, inventoryUrl));
      await writeFile(destination, Buffer.from(await asset.arrayBuffer()));
    }
    assets[name] = expiresAt;
  }
  await writeFile(path.join(dist, "asset-history.json"), JSON.stringify({ assets }, null, 2) + "\n");
  console.log(
    `Published ${currentFiles.length} current and ${Object.keys(assets).length - currentFiles.length} retained assets.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [dist, previous, site] = process.argv.slice(2);
  if (!dist || !previous || !site) throw new Error("Usage: retain-assets.mjs <dist> <previous-site> <site-url>");
  await retainAssets({ dist, previous, site });
}
