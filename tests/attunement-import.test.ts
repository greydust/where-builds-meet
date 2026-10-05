import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { AttunementStats, DamageContext } from "@/calculations/damage"
import type { SkillRecord } from "@/calculations/rotationTimeline"

import { assertClose } from "./helpers/floatEquality"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { skillActions } from "./helpers/shippedData"
import { weaponPair } from "./helpers/weaponPair"

// Ported from script/probe/check-attunement-import.mjs.
describe("attunement-import", () => {
  it("attunement-import checks", async () => {
    const close = (actual: number, expected: number, label: string) => assertClose(actual, expected, 1e-9, label)
    const { parseOfficialGearExport } = await import("../src/officialGearImport.ts")
    const { mergeImportedBuildState, calculateEquippedGearEffects, maxGearRoll } = await import("../src/gear.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { calculateHealingBreakdown } = await import("../src/calculations/healing.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const cases: Array<[number, string]> = [
      [279551, "driftcleaveDeepdazeBoost"],
      [279552, "skystrikeSpecialBoost"],
      [279553, "skystrikeMartialBoost"],
      [279554, "rivenLightBoost"],
      [279555, "rivenMartialBoost"],
      [279751, "heavenwillChargedBoost"],
      [279752, "heavenwillMartialBoost"],
      [279753, "heavenwillLightVariedComboBoost"],
      [279754, "skygraspHeavyBoost"],
      [279755, "skygraspSpecialBoost"],
      [279901, "snowpartingMartialBoost"],
      [279902, "snowpartingChargedBoost"],
      [279903, "snowpartingVariedComboBoost"],
      [279904, "phalanxbaneMartialBoost"],
      [279905, "phalanxbaneChargedBoost"],
      [280201, "thundercryShieldBoost"],
      [280202, "thundercryChargedBoost"],
      [280203, "thundercrySpecialBoost"],
      [280204, "stormbreakerChargedBoost"],
      [280205, "stormbreakerSpecialBoost"],
      [280401, "panaceaMartialHealingBoost"],
      [280402, "panaceaSpecialHealingBoost"],
      [280403, "panaceaHealingSkillBoost"],
      [280404, "soulshadeMartialHealingBoost"],
      [280405, "soulshadeSpecialHealingBoost"],
      [280601, "everspringMartialBoost"],
      [280602, "everspringSpecialBoost"],
      [280603, "unfetteredMartialBoost"],
      [280604, "unfetteredChargedBoost"],
      [280605, "unfetteredSpecialBoost"],
      [280001, "namelessSwordMartialBoost"],
      [280002, "namelessSwordChargedBoost"],
      [280003, "namelessSwordSpecialBoost"],
      [280004, "namelessSpearChargedBoost"],
      [280005, "namelessSpearSpecialBoost"],
      [280101, "strategicSwordMartialBoost"],
      [280102, "strategicSwordSpecialBoost"],
      [280103, "strategicSwordBleedingBoost"],
      [280104, "heavenquakerMartialBoost"],
      [280105, "heavenquakerChargedBoost"],
      [280301, "inkwellChargedBoost"],
      [280302, "inkwellSpecialPursuitBoost"],
      [280303, "vernalMartialBoost"],
      [280304, "vernalProjectile280304Boost"],
      [280305, "vernalProjectile280305Boost"],
      [280306, "vernalLightHeavyVariedComboBoost"],
      [280501, "infernalMartialBoost"],
      [280502, "infernalEmpoweredLightBoost"],
      [280503, "infernalSpecialBoost"],
      [280504, "mortalMartialBoost"],
      [280505, "mortalRodentBoost"],
    ]
    const imported = new Map()
    for (const [id, key] of cases) {
      for (const value of [0.047, 4.7]) {
        const parsed = parseOfficialGearExport(
          {
            roleName: "Attunement import",
            wearEquipsDetailed: {
              3: {
                exVo: {
                  baseAttrs: { W_DEF: 22, HP_MAX: 5774 },
                  baseAffixes: [
                    { equipmentDetails: [9743004, 0.0846, 5, 0, true] },
                    { equipmentDetails: [id, value, 5, 0, true] },
                  ],
                },
              },
            },
          },
          ["snowparting", "phalanxbane"],
        )
        const merged = mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue)
        assert.equal(merged.importedGearCount, 1, `Attunement ${id} survives normal gear validation`)
        const item = merged.state.gearItems[0]
        assert.equal(item.attunement?.key, key, `Official ID ${id} resolves to its attunement`)
        close(item.attunement.value, 0.047, `Official ID ${id} preserves its roll`)
        const equipped = calculateEquippedGearEffects(
          { items: merged.state.gearItems, equipped: merged.state.entries[0].equipped ?? {} },
          weaponPair(["snowparting", "phalanxbane"]),
        )
        close(
          equipped.attunement[key as keyof typeof equipped.attunement] ?? 0,
          0.047,
          `Official ID ${id} reaches equipped calculation inputs`,
        )
        imported.set(id, equipped.attunement)
      }
    }
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      minBellstrike: 100,
      maxBellstrike: 100,
      minSilkbind: 100,
      maxSilkbind: 100,
      precision: 1,
    }
    const enemy = {
      name: "Attunement probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const context = (attunement: Partial<AttunementStats>, skillTags: string[]): DamageContext => ({
      stats,
      attunement: { ...emptyAttunementStats, ...attunement },
      skillTags,
      weapons: [],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    })
    const damage = (attunement: Partial<AttunementStats>, tags: string[]) =>
      calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, context(attunement, tags)).total
    const matchingCases: Array<[number, string[]]> = [
      [279551, ["Deepdaze"]],
      [279552, ["SkystrikeGauntlets", "Special"]],
      [279553, ["SkystrikeGauntlets", "MartialArt"]],
      [279554, ["RivenTwinblades", "Light"]],
      [279555, ["RivenTwinblades", "MartialArt"]],
      [280001, ["NamelessSword", "MartialArt"]],
      [280002, ["NamelessSword", "Charged"]],
      [280003, ["NamelessSword", "Special"]],
      [280004, ["NamelessSpear", "Charged"]],
      [280005, ["NamelessSpear", "Special"]],
      [280101, ["StrategicSword", "MartialArt"]],
      [280102, ["StrategicSword", "Special"]],
      [280103, ["StrategicSword", "Bleed"]],
      [280104, ["HeavenQuakerSpear", "MartialArt"]],
      [280105, ["HeavenQuakerSpear", "Charged"]],
      [280301, ["InkwellFan", "Charged"]],
      [280302, ["InkwellFan", "Special"]],
      [280302, ["InkwellFan", "Pursuit"]],
      [280303, ["VernalUmbrella", "MartialArt"]],
      [280304, ["VernalUmbrella", "FrequentProjectile"]],
      [280305, ["VernalUmbrella", "FrequentProjectile"]],
      [280306, ["VernalUmbrella", "Light"]],
      [280306, ["VernalUmbrella", "Heavy"]],
      [280306, ["VernalUmbrella", "VariedCombo"]],
      [280501, ["InfernalTwinblades", "MartialArt"]],
      [280502, ["InfernalTwinblades", "Light", "Empowered"]],
      [280503, ["InfernalTwinblades", "Special"]],
      [280504, ["MortalRopeDart", "MartialArt"]],
      [280505, ["MortalRopeDart", "Rodent"]],
    ]
    for (const [id, tags] of matchingCases) {
      const match = cases.find(([candidate]) => candidate === id)
      assert(match, `Expected imported case ${id} to resolve to an attunement key.`)
      const key = match[1]
      const maxRoll = maxGearRoll(key, "attunement", false, 96)
      close(
        damage({ [key]: maxRoll }, tags) / damage({}, tags),
        1.06,
        `Level 96 maximum for ${id} boosts matching damage by 6%`,
      )
      close(damage(imported.get(id), tags) / damage({}, tags), 1.047, `Imported ${id} boosts matching damage once`)
      for (let index = 0; index < tags.length; index++) {
        const missing = tags.filter((_, i) => i !== index)
        close(
          damage(imported.get(id), missing),
          damage({}, missing),
          `Imported ${id} requires every configured skill tag`,
        )
      }
    }
    for (const buffs of [[], ["InebriateDeepdaze"]] as string[][]) {
      for (const tags of [
        ["Deepdaze"],
        ["SkystrikeGauntlets", "Deepdaze"],
        ["RivenTwinblades", "Deepdaze"],
        ["SkystrikeGauntlets"],
        ["RivenTwinblades"],
        ["InebriateDeepdaze"],
      ] as string[][]) {
        const baseline = calculateDamageBreakdown({ phyCoef: 1 }, { ...context({}, tags), buffs }).total
        const boosted = calculateDamageBreakdown(
          { phyCoef: 1 },
          { ...context(imported.get(279551), tags), buffs },
        ).total
        close(
          boosted / baseline,
          tags.includes("Deepdaze") ? 1.047 : 1,
          `Driftcleave matches the Deepdaze skill tag independently of buffs: ${tags}`,
        )
      }
    }
    for (const [id, tags, matches] of [
      [280302, ["InkwellFan", "Special"], true],
      [280302, ["InkwellFan", "Pursuit"], true],
      [280302, ["InkwellFan", "Special", "Pursuit"], true],
      [280302, ["InkwellFan", "Charged"], false],
      [280302, ["Special", "Pursuit"], false],
      [280304, ["VernalUmbrella", "Projectile", "Ballistic"], false],
      [280305, ["VernalUmbrella", "Projectile", "Ballistic"], false],
      [280304, ["SoulshadeUmbrella", "FrequentProjectile"], false],
      [280305, ["SoulshadeUmbrella", "FrequentProjectile"], false],
      [280306, ["VernalUmbrella", "Light", "Heavy", "VariedCombo"], true],
      [280306, ["VernalUmbrella", "MartialArt"], false],
      [280306, ["VernalUmbrella", "FrequentProjectile"], false],
      [280306, ["InkwellFan", "Light", "Heavy", "VariedCombo"], false],
      [279753, ["HeavenwillGauntlets", "Light", "VariedCombo"], true],
      [279753, ["HeavenwillGauntlets", "Heavy", "VariedCombo"], true],
      [279753, ["HeavenwillGauntlets", "Light", "Heavy", "VariedCombo"], true],
      [279753, ["HeavenwillGauntlets", "Light"], false],
      [279753, ["HeavenwillGauntlets", "Heavy"], false],
      [279753, ["HeavenwillGauntlets", "VariedCombo"], false],
      [279753, ["Light", "VariedCombo"], false],
    ] as Array<[number, string[], boolean]>) {
      close(damage(imported.get(id), tags) / damage({}, tags), matches ? 1.047 : 1, `${id}: ${tags.join(" + ")}`)
    }
    for (const id of [280201]) {
      const tags = [
        "InkwellFan",
        "Special",
        "Pursuit",
        "VernalUmbrella",
        "Ballistic",
        "Projectile",
        "FrequentProjectile",
        "ThundercryBlade",
        "Shield",
      ]
      close(damage(imported.get(id), tags), damage({}, tags), `Deferred ${id} preserves gear without inventing damage`)
    }
    for (const [id, tags] of [
      [280401, ["PanaceaFan", "MartialArt"]],
      [280402, ["PanaceaFan", "Special"]],
      [280403, ["PanaceaFan", "Heavy"]],
      [280404, ["SoulshadeUmbrella", "MartialArt"]],
      [280405, ["SoulshadeUmbrella", "Special"]],
    ] as Array<[number, string[]]>) {
      const healing = (attunement: Partial<AttunementStats>) =>
        calculateHealingBreakdown({ phyCoef: 1, silkbindCoef: 1 }, context(attunement, tags)).total
      close(healing(imported.get(id)) / healing({}), 1.047, `Imported ${id} retains existing healing behavior`)
      close(damage(imported.get(id), tags), damage({}, tags), `Healing attunement ${id} does not boost damage`)
    }
    const panacea = asSkillRecords((await import("../data/skill/panacea-fan.json")).default)
    const soulshade = asSkillRecords((await import("../data/skill/soulshade-umbrella.json")).default)
    const delugeBuffs = asEffectDefinitions((await import("../data/buff/silkbind-deluge.json")).default)
    for (const [id, skills, supported] of [
      [
        280401,
        panacea,
        new Set(["CloudburstHealing", "CloudburstHealingCancel", "EndlessCloud", "EndlessCloudCancel"]),
      ],
      [280404, soulshade, new Set(["FloatingGrace"])],
    ] as Array<[number, Record<string, SkillRecord>, Set<string>]>) {
      for (const [skillId, definition] of [
        ...Object.entries(skills),
        ...Object.entries(delugeBuffs).map(([id, effect]): [string, SkillRecord] => [
          id,
          { ...effect, action: effect.action ?? [] },
        ]),
      ] as Array<[string, SkillRecord]>) {
        for (const action of skillActions(definition)) {
          if (action.type !== "heal") continue
          const tags = definition.tags ?? []
          const baseline = calculateHealingBreakdown(action, context({}, tags)).total
          const boosted = calculateHealingBreakdown(action, context(imported.get(id), tags)).total
          close(boosted / baseline, supported.has(skillId) ? 1.047 : 1, `${id} healing scope: ${skillId}`)
        }
      }
    }
  })
})
