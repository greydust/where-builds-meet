import boshanQuyueSpearMartialArt from "@gamedata/martial-art/boshan-quyue-spear.json"
import everspringMartialArt from "@gamedata/martial-art/everspring-umbrella.json"
import heavenquakerSpearMartialArt from "@gamedata/martial-art/heavenquaker-spear.json"
import heavenwillMartialArt from "@gamedata/martial-art/heavenwill-gauntlets.json"
import infernalTwinbladesMartialArt from "@gamedata/martial-art/infernal-twinblades.json"
import inkwellFanMartialArt from "@gamedata/martial-art/inkwell-fan.json"
import jueyuXuanfengSpearMartialArt from "@gamedata/martial-art/jueyu-xuanfeng-spear.json"
import mortalRopeDartMartialArt from "@gamedata/martial-art/mortal-rope-dart.json"
import museflowWaistDrumMartialArt from "@gamedata/martial-art/museflow-waist-drum.json"
import namelessSpearMartialArt from "@gamedata/martial-art/nameless-spear.json"
import namelessSwordMartialArt from "@gamedata/martial-art/nameless-sword.json"
import panaceaFanMartialArt from "@gamedata/martial-art/panacea-fan.json"
import phalanxbaneMartialArt from "@gamedata/martial-art/phalanxbane-blade.json"
import rivenTwinbladesMartialArt from "@gamedata/martial-art/riven-twinblades.json"
import skygraspMartialArt from "@gamedata/martial-art/skygrasp-rope-dart.json"
import skystrikeGauntletsMartialArt from "@gamedata/martial-art/skystrike-gauntlets.json"
import snowpartingMartialArt from "@gamedata/martial-art/snowparting-blade.json"
import soulshadeUmbrellaMartialArt from "@gamedata/martial-art/soulshade-umbrella.json"
import stormbreakerMartialArt from "@gamedata/martial-art/stormbreaker-spear.json"
import strategicSwordMartialArt from "@gamedata/martial-art/strategic-sword.json"
import thundercryMartialArt from "@gamedata/martial-art/thundercry-blade.json"
import unfetteredMartialArt from "@gamedata/martial-art/unfettered-rope-dart.json"
import vernalUmbrellaMartialArt from "@gamedata/martial-art/vernal-umbrella.json"
import willowbendFanMartialArt from "@gamedata/martial-art/willowbend-fan.json"

import type { MartialArtTalent } from "@/data/martialArtTalents"
import type { WeaponFamily, WeaponId, CharacterStats } from "@/types"
import { weaponIds as allWeaponIds } from "@/types"

import type { SetupEffect } from "./setup"

export type MartialArtDefinition = {
  name: string
  weapon: WeaponFamily
  tag: string
  talent: MartialArtTalent<SetupEffect>[][]
}
export const martialArtDefinitions: Record<WeaponId, MartialArtDefinition> = {
  jueyuXuanfengSpear: jueyuXuanfengSpearMartialArt as MartialArtDefinition,
  boshanQuyueSpear: boshanQuyueSpearMartialArt as MartialArtDefinition,
  museflowWaistDrum: museflowWaistDrumMartialArt as MartialArtDefinition,
  willowbendFan: willowbendFanMartialArt as MartialArtDefinition,
  snowparting: snowpartingMartialArt as MartialArtDefinition,
  phalanxbane: phalanxbaneMartialArt as MartialArtDefinition,
  thundercry: thundercryMartialArt as MartialArtDefinition,
  stormbreaker: stormbreakerMartialArt as MartialArtDefinition,
  everspring: everspringMartialArt as MartialArtDefinition,
  unfettered: unfetteredMartialArt as MartialArtDefinition,
  heavenwill: heavenwillMartialArt as MartialArtDefinition,
  skygrasp: skygraspMartialArt as MartialArtDefinition,
  namelessSword: namelessSwordMartialArt as MartialArtDefinition,
  namelessSpear: namelessSpearMartialArt as MartialArtDefinition,
  strategicSword: strategicSwordMartialArt as MartialArtDefinition,
  heavenquakerSpear: heavenquakerSpearMartialArt as MartialArtDefinition,
  vernalUmbrella: vernalUmbrellaMartialArt as MartialArtDefinition,
  inkwellFan: inkwellFanMartialArt as MartialArtDefinition,
  panaceaFan: panaceaFanMartialArt as MartialArtDefinition,
  soulshadeUmbrella: soulshadeUmbrellaMartialArt as MartialArtDefinition,
  infernalTwinblades: infernalTwinbladesMartialArt as MartialArtDefinition,
  mortalRopeDart: mortalRopeDartMartialArt as MartialArtDefinition,
  skystrikeGauntlets: skystrikeGauntletsMartialArt as MartialArtDefinition,
  rivenTwinblades: rivenTwinbladesMartialArt as MartialArtDefinition,
}
export const weaponFamilyNames: Record<WeaponFamily, string> = {
  HengBlade: "Heng Blade",
  MoBlade: "Mo Blade",
  Spear: "Spear",
  Umbrella: "Umbrella",
  RopeDart: "Rope Dart",
  Gauntlet: "Gauntlet",
  Sword: "Sword",
  RibbonAndDrum: "Ribbon & Drum",
  Fan: "Fan",
  DualBlades: "Dual Blades",
}
export const weaponIdSet = new Set<WeaponId>(allWeaponIds)
export const isWeaponId = (value: unknown): value is WeaponId =>
  typeof value === "string" && weaponIdSet.has(value as WeaponId)

export const artStatByWeaponFamily: Record<WeaponFamily, keyof CharacterStats> = {
  HengBlade: "hengBladeDmgBoost",
  MoBlade: "moBladeDmgBoost",
  Spear: "spearDmgBoost",
  Umbrella: "umbrellaDmgBoost",
  RopeDart: "ropeDartDmgBoost",
  Gauntlet: "gauntletDmgBoost",
  Sword: "swordDmgBoost",
  RibbonAndDrum: "ribbonAndDrumDmgBoost",
  Fan: "fanDmgBoost",
  DualBlades: "dualBladesDmgBoost",
}
