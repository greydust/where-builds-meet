import * as v from "valibot"

const unknownRecord = v.record(v.string(), v.unknown())

export const gearItemInputSchema = v.looseObject({
  id: v.string(),
  definitionId: v.string(),
  level: v.pipe(v.number(), v.finite()),
  rarity: v.string(),
  baseAffix: unknownRecord,
  additionalAffixes: v.optional(v.array(unknownRecord)),
  slot: v.optional(v.string()),
  relayed: v.optional(v.boolean()),
  turnedAffixIndex: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3))),
  attunement: v.optional(unknownRecord),
})

export const gearInventoryInputSchema = v.looseObject({
  items: v.optional(v.array(v.unknown())),
  equipped: v.optional(unknownRecord),
})

export const buildEntryInputSchema = v.looseObject({
  id: v.string(),
  name: v.string(),
  martialArts: v.optional(v.array(v.string())),
  equipped: v.optional(unknownRecord),
  setup: v.optional(v.unknown()),
  isDefault: v.optional(v.boolean()),
  presetId: v.optional(v.string()),
})

export const storedBuildStateSchema = v.looseObject({
  version: v.optional(v.number()),
  entries: v.optional(v.array(v.unknown())),
  gearItems: v.optional(v.array(v.unknown())),
})

export const buildExportInputSchema = v.looseObject({
  format: v.string(),
  version: v.pipe(v.number(), v.finite()),
  gearItems: v.array(v.unknown()),
  builds: v.array(v.unknown()),
})
