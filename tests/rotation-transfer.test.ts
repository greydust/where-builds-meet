import { describe, expect, it } from "vitest"

import type { RotationEntry } from "../src/rotationTransfer.ts"

// Ported from script/probe/check-rotation-transfer.mjs.
describe("rotation-transfer", () => {
  it("Rotation export and import checks passed", async () => {
    const transfer = await import("../src/rotationTransfer.ts")
    const { normalizeStoredWeaponIds, weaponIds } = await import("../src/types.ts")

    const previousUniversalMartialArts = weaponIds.filter(
      weapon => weapon !== "skystrikeGauntlets" && weapon !== "rivenTwinblades",
    )
    expect(
      normalizeStoredWeaponIds(previousUniversalMartialArts).length === weaponIds.length,
      "A universal martial-art list saved before Draught must expand to include the new pair.",
    ).toBeTruthy()

    const defaultEntry: RotationEntry = {
      id: "dummy-1-min",
      isDefault: true,
      martialArts: ["snowparting", "phalanxbane"],
      rotation: { name: "Default", steps: [{ type: "skill", skill: "SnowpartingQStab" }] },
    }
    const customEntry: RotationEntry = {
      id: "custom-rotation",
      martialArts: ["snowparting", "phalanxbane"],
      rotation: {
        name: "Custom",
        targetHP: 123456,
        targetType: "DummyAttack",
        groupSize: 5,
        infiniteVitality: true,
        steps: [
          { type: "event", event: "Move", before: { trigger: 0, action: 1 }, distance: 0 },
          { type: "event", event: "SelfHP", before: { action: 0 }, currentHPRatio: 0.555 },
          { type: "event", event: "TakeDamage", startTime: 0.75, damage: 1234 },
          { type: "event", event: "HP", before: { action: 0 }, targetHPRatio: 0.75 },
          { type: "event", event: "Qi", before: { action: 0 }, targetQiRatio: 0.5 },
          { type: "event", event: "Buff", before: { action: "start" }, buff: "Flute", stack: 3 },
          { type: "event", event: "Debuff", before: { action: 0 }, debuff: "Controlled", stack: 2 },
          { type: "event", event: "Delay", duration: 1.25 },
          { type: "skill", skill: "SnowpartingQStab", causesBreak: true },
          { type: "event", event: "Controlled", startTime: 1.5, duration: 3 },
        ],
        start: { step: 8, action: 1 },
      },
    }
    const current: RotationEntry[] = [defaultEntry, customEntry]
    const serialized = JSON.parse(transfer.serializeRotationEntries(current))
    expect(
      serialized.length === 1 && serialized[0].id === customEntry.id && !("isDefault" in serialized[0]),
      "Bundled default rotations must not be persisted.",
    ).toBeTruthy()
    const exported = JSON.parse(transfer.exportRotationEntries(current))
    expect(
      exported.format === transfer.rotationExportFormat &&
        exported.version === transfer.rotationExportVersion &&
        exported.rotations.length === 1 &&
        exported.rotations[0].id === customEntry.id,
      "Rotation export must omit the bundled default.",
    ).toBeTruthy()
    expect(
      exported.rotations[0].martialArts.join(",") === "snowparting,phalanxbane",
      "Rotation export must retain martial-art eligibility tags.",
    ).toBeTruthy()

    const merged = transfer.mergeImportedRotationEntries(current, exported)
    expect(
      merged.importedCount === 1 && merged.entries.length === 3,
      "Rotation import must append custom rotations and skip the default.",
    ).toBeTruthy()
    expect(merged.importedIds[0] !== customEntry.id, "A colliding imported rotation ID must be remapped.").toBeTruthy()
    const imported = merged.entries.find(entry => entry.id === merged.importedIds[0])
    const importedStart = imported?.rotation.start
    expect(
      imported?.rotation.steps.length === 10 &&
        imported.rotation.targetHP === 123456 &&
        imported.rotation.targetType === "DummyAttack" &&
        imported.rotation.groupSize === 5 &&
        imported.rotation.infiniteVitality === true &&
        importedStart?.step === 8 &&
        importedStart.action === 1,
      "Rotation steps and start anchor must survive export and import.",
    ).toBeTruthy()

    const legacyGroupSizeImport = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      version: 8,
      rotations: [
        {
          id: "legacy-group-size",
          rotation: { name: "Legacy Group Size", steps: [{ type: "skill", skill: "SnowpartingQStab" }] },
        },
      ],
    })
    expect(
      legacyGroupSizeImport.entries.find(entry => entry.id === legacyGroupSizeImport.importedIds[0])?.rotation
        .groupSize === 1,
      "A rotation without group metadata must migrate to Solo.",
    ).toBeTruthy()
    const legacyTargetImport = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      rotations: [
        {
          id: "legacy-dummy-attack",
          rotation: {
            name: "Legacy Dummy Attack",
            dummyAttack: true,
            steps: [{ type: "skill", skill: "SnowpartingQStab" }],
          },
        },
        { id: "no-target", rotation: { name: "No Target", steps: [{ type: "skill", skill: "SnowpartingQStab" }] } },
        {
          id: "invalid-target",
          rotation: {
            name: "Invalid Target",
            targetType: "Dragon",
            steps: [{ type: "skill", skill: "SnowpartingQStab" }],
          },
        },
      ],
    })
    const importedTargetTypes = Object.fromEntries(
      legacyTargetImport.importedIds.map(id => [
        id.replace(/:imported$/, ""),
        legacyTargetImport.entries.find(entry => entry.id === id)?.rotation.targetType,
      ]),
    )
    expect(
      importedTargetTypes["legacy-dummy-attack"] === "DummyAttack" &&
        importedTargetTypes["no-target"] === "Dummy" &&
        importedTargetTypes["invalid-target"] === "Dummy",
      "The removed dummyAttack flag must migrate to the attacking dummy, and missing or unknown targets must fall back to the inert dummy.",
    ).toBeTruthy()
    expect(
      imported?.martialArts.join(",") === "snowparting,phalanxbane",
      "Rotation martial-art eligibility tags must survive export and import.",
    ).toBeTruthy()
    const firstImportedStep = imported?.rotation.steps[0]
    const firstImportedBefore =
      firstImportedStep && "before" in firstImportedStep ? firstImportedStep.before : undefined
    expect(
      firstImportedStep?.type === "event" &&
        firstImportedStep.event === "Move" &&
        firstImportedBefore?.trigger === 0 &&
        firstImportedBefore.action === 1 &&
        firstImportedStep.type === "event" &&
        firstImportedStep.event === "Move" &&
        firstImportedStep.distance === 0,
      "Attached event targets must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[1].event === "SelfHP" && imported.rotation.steps[1].currentHPRatio === 0.555,
      "Self HP events must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[2].event === "TakeDamage" &&
        imported.rotation.steps[2].startTime === 0.75 &&
        imported.rotation.steps[2].damage === 1234,
      "Take Damage events must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[3].event === "HP" && imported.rotation.steps[3].targetHPRatio === 0.75,
      "Target HP events must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[4].event === "Qi" && imported.rotation.steps[4].targetQiRatio === 0.5,
      "Qi events must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[5].event === "Buff" &&
        imported.rotation.steps[5].buff === "Flute" &&
        imported.rotation.steps[5].stack === 3,
      "Buff events and their stack counts must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[6].event === "Debuff" &&
        imported.rotation.steps[6].debuff === "Controlled" &&
        imported.rotation.steps[6].stack === 2,
      "Debuff events and their stack counts must survive export and import.",
    ).toBeTruthy()
    expect(
      imported?.rotation.steps[7].event === "Delay" && imported.rotation.steps[7].duration === 1.25,
      "Delay events and their durations must survive export and import.",
    ).toBeTruthy()

    const skillStartImport = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      rotations: [
        {
          id: "skill-start",
          rotation: { name: "Skill Start", steps: [{ type: "skill", skill: "SnowpartingQStab" }], start: { step: 0 } },
        },
      ],
    })
    const skillStartRotation = skillStartImport.entries.find(
      entry => entry.id === skillStartImport.importedIds[0],
    )?.rotation
    expect(
      skillStartRotation?.start?.step === 0 && skillStartRotation.start.action === undefined,
      "A skill-level start anchor must survive import without becoming hit 1.",
    ).toBeTruthy()

    const scarletSpinWithoutDuration = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      version: 9,
      rotations: [
        {
          id: "scarlet-spin-without-duration",
          rotation: { name: "Legacy Scarlet Spin", steps: [{ type: "skill", skill: "ScarletSpin" }] },
        },
      ],
    })
    expect(
      scarletSpinWithoutDuration.importedCount === 0,
      "Duration-less Scarlet Spin records must not cross the rotation import boundary.",
    ).toBeTruthy()

    const { migrateRotation } = await import("../src/application/rotationCatalog.ts")
    expect(
      migrateRotation({ name: "Duration-less Scarlet Spin", steps: [{ type: "skill", skill: "ScarletSpin" }] }).steps,
    ).toEqual([])

    const scarletSpinWithDuration = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      rotations: [
        {
          id: "scarlet-spin-with-duration",
          rotation: {
            name: "Duration-controlled Scarlet Spin",
            steps: [{ type: "skill", skill: "ScarletSpin", duration: 12 }],
          },
        },
      ],
    })
    expect(scarletSpinWithDuration.entries.at(-1)?.rotation.steps[0]).toMatchObject({
      skill: "ScarletSpin",
      duration: 12,
    })

    const automaticHPImport = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      rotations: [
        {
          id: "automatic-hp",
          rotation: {
            name: "Automatic HP",
            autoHP: true,
            steps: [
              { type: "event", event: "HP", before: { action: 0 }, targetHPRatio: 0.5 },
              { type: "skill", skill: "SnowpartingQStab" },
            ],
            start: { step: 1 },
          },
        },
      ],
    })
    const automaticHPRotation = automaticHPImport.entries.find(
      entry => entry.id === automaticHPImport.importedIds[0],
    )?.rotation
    expect(
      automaticHPRotation !== undefined &&
        !Object.hasOwn(automaticHPRotation, "autoHP") &&
        automaticHPRotation.steps.length === 2 &&
        automaticHPRotation.steps[0].event === "HP" &&
        automaticHPRotation.start?.step === 1,
      "Legacy Auto HP import must drop the flag while retaining manual HP events and the anchored skill.",
    ).toBeTruthy()
    const migratedExport = JSON.parse(transfer.exportRotationEntries(automaticHPImport.entries))
    const migratedRotation = migratedExport.rotations.find(
      (entry: { id: string }) => entry.id === automaticHPImport.importedIds[0],
    )
    expect(migratedRotation.rotation).toEqual(automaticHPRotation)
    expect(Object.hasOwn(migratedRotation.rotation, "autoHP")).toBe(false)

    const legacyExhaustedImport = transfer.mergeImportedRotationEntries(current, {
      ...exported,
      version: 2,
      rotations: [
        {
          id: "legacy-exhausted",
          rotation: {
            name: "Legacy Exhausted",
            steps: [
              { type: "event", event: "Exhausted", before: { action: 3 } },
              { type: "skill", skill: "SnowpartingQStab" },
            ],
          },
        },
      ],
    })
    const legacyExhausted = legacyExhaustedImport.entries.find(
      entry => entry.id === legacyExhaustedImport.importedIds[0],
    )?.rotation.steps[0]
    expect(
      legacyExhausted?.type === "event" &&
        legacyExhausted.event === "Qi" &&
        legacyExhausted.targetQiRatio === 0 &&
        "after" in legacyExhausted &&
        legacyExhausted.after?.action === 3 &&
        !("before" in legacyExhausted),
      "Legacy Exhausted attachments must migrate to after-action Qi depletion.",
    ).toBeTruthy()

    const partiallyInvalid = {
      ...exported,
      rotations: [
        { id: "invalid", rotation: { name: "Invalid", steps: [{ type: "event", event: "Unknown", startTime: 0 }] } },
        customEntry,
      ],
    }
    expect(
      transfer.mergeImportedRotationEntries(current, partiallyInvalid).importedCount === 1,
      "Malformed rotations must be skipped without blocking valid rotations.",
    ).toBeTruthy()

    let invalidFormatRejected = false
    try {
      transfer.mergeImportedRotationEntries(current, { version: 1, rotations: [] })
    } catch {
      invalidFormatRejected = true
    }
    expect(
      invalidFormatRejected,
      "Rotation import must reject files without the export format identifier.",
    ).toBeTruthy()
  })
})
