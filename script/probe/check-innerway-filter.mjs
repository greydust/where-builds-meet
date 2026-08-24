import { createServer } from "vite";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { innerWayDefinitions, innerWayEntriesForTag } = await viteServer.ssrLoadModule(
    "/src/data/innerWayDefinitions.ts",
  );
  const allTags = new Set(Object.values(innerWayDefinitions).flatMap((definition) => definition.tags ?? []));

  for (const tag of allTags) {
    const filtered = innerWayEntriesForTag(tag);
    assert(filtered.length > 0, `The ${tag} filter must return at least one Inner Way.`);
    assert(
      filtered.every(([, definition]) => definition.tags?.includes(tag)),
      `The ${tag} filter returned an Inner Way without that tag.`,
    );
    for (const [id, definition] of Object.entries(innerWayDefinitions)) {
      if (!definition.tags?.includes(tag)) continue;
      assert(
        filtered.some(([filteredId]) => filteredId === id),
        `The ${tag} filter omitted eligible Inner Way ${id}.`,
      );
    }
  }

  assert(innerWayEntriesForTag("__unknown_path_tag__").length === 0, "An unknown tag must return no Inner Ways.");
} finally {
  await viteServer.close();
}

console.log("Inner Way filter behavior checks passed.");
