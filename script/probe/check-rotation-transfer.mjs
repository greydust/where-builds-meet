import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const transfer = await viteServer.ssrLoadModule("/src/rotationTransfer.ts");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const defaultEntry = {
  id: "dummy-1-min",
  isDefault: true,
  rotation: { name: "Default", steps: [{ type: "skill", skill: "SnowpartingQStab" }] },
};
const customEntry = {
  id: "custom-rotation",
  rotation: {
    name: "Custom",
    steps: [
      { type: "skill", skill: "SnowpartingQStab", causesBreak: true },
      { type: "event", event: "Controlled", startTime: 1.5, duration: 3 },
    ],
    start: { step: 0, action: 1 },
  },
};
const current = [defaultEntry, customEntry];
const serialized = JSON.parse(transfer.serializeRotationEntries(current));
assert(serialized.length === 1 && serialized[0].id === customEntry.id && !("isDefault" in serialized[0]), "Bundled default rotations must not be persisted.");
const exported = JSON.parse(transfer.exportRotationEntries(current));
assert(exported.format === transfer.rotationExportFormat && exported.version === 1 && exported.rotations.length === 1 && exported.rotations[0].id === customEntry.id, "Rotation export must omit the bundled default.");

const merged = transfer.mergeImportedRotationEntries(current, exported);
assert(merged.importedCount === 1 && merged.entries.length === 3, "Rotation import must append custom rotations and skip the default.");
assert(merged.importedIds[0] !== customEntry.id, "A colliding imported rotation ID must be remapped.");
const imported = merged.entries.find((entry) => entry.id === merged.importedIds[0]);
assert(imported?.rotation.steps.length === 2 && imported.rotation.start.step === 0 && imported.rotation.start.action === 1, "Rotation steps and start anchor must survive export and import.");

const skillStartImport = transfer.mergeImportedRotationEntries(current, {
  ...exported,
  rotations: [{ id: "skill-start", rotation: { name: "Skill Start", steps: [{ type: "skill", skill: "SnowpartingQStab" }], start: { step: 0 } } }],
});
const skillStartRotation = skillStartImport.entries.find((entry) => entry.id === skillStartImport.importedIds[0])?.rotation;
assert(skillStartRotation?.start?.step === 0 && skillStartRotation.start.action === undefined, "A skill-level start anchor must survive import without becoming hit 1.");

const partiallyInvalid = {
  ...exported,
  rotations: [
    { id: "invalid", rotation: { name: "Invalid", steps: [{ type: "event", event: "Unknown", startTime: 0 }] } },
    customEntry,
  ],
};
assert(transfer.mergeImportedRotationEntries(current, partiallyInvalid).importedCount === 1, "Malformed rotations must be skipped without blocking valid rotations.");

let invalidFormatRejected = false;
try {
  transfer.mergeImportedRotationEntries(current, { version: 1, rotations: [] });
} catch {
  invalidFormatRejected = true;
}
assert(invalidFormatRejected, "Rotation import must reject files without the export format identifier.");

console.log("Rotation export and import checks passed.");
await viteServer.close();
