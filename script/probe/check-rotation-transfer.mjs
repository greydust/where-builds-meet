import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const transfer = await viteServer.ssrLoadModule("/src/rotationTransfer.ts");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const defaultEntry = {
  id: "dummy-1-min",
  isDefault: true,
  martialArts: ["snowparting", "phalanxbane"],
  rotation: { name: "Default", steps: [{ type: "skill", skill: "SnowpartingQStab" }] },
};
const customEntry = {
  id: "custom-rotation",
  martialArts: ["snowparting", "phalanxbane"],
  rotation: {
    name: "Custom",
    steps: [
      { type: "event", event: "Move", before: { trigger: 0, action: 1 }, distance: 6 },
      { type: "event", event: "HP", before: { action: 0 }, currentHPRatio: 0.555 },
      { type: "event", event: "Buff", before: { action: "start" }, buff: "Flute", stack: 3 },
      { type: "event", event: "Debuff", before: { action: 0 }, debuff: "Controlled", stack: 2 },
      { type: "event", event: "Delay", duration: 1.25 },
      { type: "skill", skill: "SnowpartingQStab", causesBreak: true },
      { type: "event", event: "Controlled", startTime: 1.5, duration: 3 },
    ],
    start: { step: 5, action: 1 },
  },
};
const current = [defaultEntry, customEntry];
const serialized = JSON.parse(transfer.serializeRotationEntries(current));
assert(serialized.length === 1 && serialized[0].id === customEntry.id && !("isDefault" in serialized[0]), "Bundled default rotations must not be persisted.");
const exported = JSON.parse(transfer.exportRotationEntries(current));
assert(exported.format === transfer.rotationExportFormat && exported.version === 5 && exported.rotations.length === 1 && exported.rotations[0].id === customEntry.id, "Rotation export must omit the bundled default.");
assert(exported.rotations[0].martialArts.join(",") === "snowparting,phalanxbane", "Rotation export must retain martial-art eligibility tags.");

const merged = transfer.mergeImportedRotationEntries(current, exported);
assert(merged.importedCount === 1 && merged.entries.length === 3, "Rotation import must append custom rotations and skip the default.");
assert(merged.importedIds[0] !== customEntry.id, "A colliding imported rotation ID must be remapped.");
const imported = merged.entries.find((entry) => entry.id === merged.importedIds[0]);
assert(imported?.rotation.steps.length === 7 && imported.rotation.start.step === 5 && imported.rotation.start.action === 1, "Rotation steps and start anchor must survive export and import.");
assert(imported?.martialArts.join(",") === "snowparting,phalanxbane", "Rotation martial-art eligibility tags must survive export and import.");
assert(imported?.rotation.steps[0].event === "Move" && imported.rotation.steps[0].before.trigger === 0 && imported.rotation.steps[0].before.action === 1 && imported.rotation.steps[0].distance === 6, "Attached event targets must survive export and import.");
assert(imported?.rotation.steps[1].event === "HP" && imported.rotation.steps[1].currentHPRatio === 0.555, "HP events must survive export and import.");
assert(imported?.rotation.steps[2].event === "Buff" && imported.rotation.steps[2].buff === "Flute" && imported.rotation.steps[2].stack === 3, "Buff events and their stack counts must survive export and import.");
assert(imported?.rotation.steps[3].event === "Debuff" && imported.rotation.steps[3].debuff === "Controlled" && imported.rotation.steps[3].stack === 2, "Debuff events and their stack counts must survive export and import.");
assert(imported?.rotation.steps[4].event === "Delay" && imported.rotation.steps[4].duration === 1.25, "Delay events and their durations must survive export and import.");

const skillStartImport = transfer.mergeImportedRotationEntries(current, {
  ...exported,
  rotations: [{ id: "skill-start", rotation: { name: "Skill Start", steps: [{ type: "skill", skill: "SnowpartingQStab" }], start: { step: 0 } } }],
});
const skillStartRotation = skillStartImport.entries.find((entry) => entry.id === skillStartImport.importedIds[0])?.rotation;
assert(skillStartRotation?.start?.step === 0 && skillStartRotation.start.action === undefined, "A skill-level start anchor must survive import without becoming hit 1.");

const legacyExhaustedImport = transfer.mergeImportedRotationEntries(current, {
  ...exported,
  version: 2,
  rotations: [{ id: "legacy-exhausted", rotation: { name: "Legacy Exhausted", steps: [{ type: "event", event: "Exhausted", before: { action: 3 } }, { type: "skill", skill: "SnowpartingQStab" }] } }],
});
const legacyExhausted = legacyExhaustedImport.entries.find((entry) => entry.id === legacyExhaustedImport.importedIds[0])?.rotation.steps[0];
assert(legacyExhausted?.event === "Exhausted" && legacyExhausted.after?.action === 3 && !("before" in legacyExhausted), "Legacy Exhausted attachments must migrate from before to after.");

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
