import { readFile, writeFile } from "node:fs/promises";

await Promise.all(
  ["data/skill/snowparting-blade.json", "data/skill/phalanxbane-blade.json"].map(async (path) => {
    const skills = JSON.parse(await readFile(path, "utf8"));
    for (const skill of Object.values(skills)) {
      if (skill.hitCount !== undefined) continue;
      const actions = skill.action ?? skill.damage ?? [];
      skill.hitCount = Array.isArray(actions) ? actions.filter((entry) => entry.type === "damage").length : 0;
    }
    await writeFile(path, `${JSON.stringify(skills, null, 2)}\n`);
    console.log(`Updated ${path}`);
  }),
);
