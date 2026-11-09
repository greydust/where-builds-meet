import adaptiveSteel from "@gamedata/innerway/adaptive-steel.json"
import artOfResistance from "@gamedata/innerway/art-of-resistance.json"
import battleAnthem from "@gamedata/innerway/battle-anthem.json"
import bitterSeasons from "@gamedata/innerway/bitter-seasons.json"
import bladesWill from "@gamedata/innerway/blades-will.json"
import blossomBarrage from "@gamedata/innerway/blossom-barrage.json"
import breakingPoint from "@gamedata/innerway/breaking-point.json"
import celestialVigor from "@gamedata/innerway/celestial-vigor.json"
import divineRoulette from "@gamedata/innerway/divine-roulette.json"
import echoesOfOblivion from "@gamedata/innerway/echoes-of-oblivion.json"
import empiricalEdge from "@gamedata/innerway/empirical-edge.json"
import envigoratedWarrior from "@gamedata/innerway/envigorated-warrior.json"
import eonpour from "@gamedata/innerway/eonpour.json"
import esotericRevival from "@gamedata/innerway/esoteric-revival.json"
import evasiveCharge from "@gamedata/innerway/evasive-charge.json"
import eveningSnow from "@gamedata/innerway/evening-snow.json"
import exquisiteScenery from "@gamedata/innerway/exquisite-scenery.json"
import fivefoldBleed from "@gamedata/innerway/fivefold-bleed.json"
import frostCladNight from "@gamedata/innerway/frost-clad-night.json"
import fuLiangYiYe from "@gamedata/innerway/fu-liang-yi-ye.json"
import furyHarvest from "@gamedata/innerway/fury-harvest.json"
import gourdToss from "@gamedata/innerway/gourd-toss.json"
import harmonySong from "@gamedata/innerway/harmony-song.json"
import heartOfFire from "@gamedata/innerway/heart-of-fire.json"
import inkAndStrings from "@gamedata/innerway/ink-and-strings.json"
import insightfulStrike from "@gamedata/innerway/insightful-strike.json"
import lightAndShadowAlike from "@gamedata/innerway/light-and-shadow-alike.json"
import lightAnew from "@gamedata/innerway/light-anew.json"
import mendingLoom from "@gamedata/innerway/mending-loom.json"
import mingFeiTongPan from "@gamedata/innerway/ming-fei-tong-pan.json"
import mistwing from "@gamedata/innerway/mistwing.json"
import moraleChant from "@gamedata/innerway/morale-chant.json"
import mountainsMight from "@gamedata/innerway/mountains-might.json"
import phantomRally from "@gamedata/innerway/phantom-rally.json"
import restoringBlossom from "@gamedata/innerway/restoring-blossom.json"
import riptideReflex from "@gamedata/innerway/riptide-reflex.json"
import rockSolid from "@gamedata/innerway/rock-solid.json"
import royalRemedy from "@gamedata/innerway/royal-remedy.json"
import sandswirlTail from "@gamedata/innerway/sandswirl-tail.json"
import seasonalEdge from "@gamedata/innerway/seasonal-edge.json"
import shadowAssault from "@gamedata/innerway/shadow-assault.json"
import shenDuanQingFeng from "@gamedata/innerway/shen-duan-qing-feng.json"
import skyGripped from "@gamedata/innerway/sky-gripped.json"
import skyspeak from "@gamedata/innerway/skyspeak.json"
import soaringHigh from "@gamedata/innerway/soaring-high.json"
import songOfTang from "@gamedata/innerway/song-of-tang.json"
import starReacher from "@gamedata/innerway/star-reacher.json"
import steadfastDevotion from "@gamedata/innerway/steadfast-devotion.json"
import steadfastStance from "@gamedata/innerway/steadfast-stance.json"
import suiXingQieTao from "@gamedata/innerway/sui-xing-qie-tao.json"
import swordHorizon from "@gamedata/innerway/sword-horizon.json"
import swordMorph from "@gamedata/innerway/sword-morph.json"
import throatPiercingArt from "@gamedata/innerway/throat-piercing-art.json"
import thunderousBloom from "@gamedata/innerway/thunderous-bloom.json"
import towlineSweep from "@gamedata/innerway/towline-sweep.json"
import trappedBeast from "@gamedata/innerway/trapped-beast.json"
import vendetta from "@gamedata/innerway/vendetta.json"
import vitalLeech from "@gamedata/innerway/vital-leech.json"
import volutefit from "@gamedata/innerway/volutefit.json"
import wildfireSpark from "@gamedata/innerway/wildfire-spark.json"
import wildfireSurge from "@gamedata/innerway/wildfire-surge.json"
import windBeneathWings from "@gamedata/innerway/wind-beneath-wings.json"
import wolfchasersArt from "@gamedata/innerway/wolfchasers-art.json"
import yueYongFangYuan from "@gamedata/innerway/yue-yong-fang-yuan.json"
import zephyrWhispers from "@gamedata/innerway/zephyr-whispers.json"

import { effectForSoloLevel } from "./soloLevelEffects"

/**
 * A tier's authored effect, as the data files carry it. The rule that applies it
 * supplies `source` and `tier` around this, which is what `InnerWayEffectRule`
 * adds. Solo Level tables live under `rawStat` until they are resolved.
 */
export type InnerWayTierEffect = {
  trigger?: Record<string, unknown>[]
  effect?: Record<string, unknown>[]
  listen?: Record<string, unknown>[]
  [key: string]: unknown
}

export type InnerWayDefinition = {
  name: string
  tags?: string[]
  altersTimeline: boolean
  effect: Record<string, InnerWayTierEffect>
}

export const innerWayDefinitions = {
  YueYongFangYuan: yueYongFangYuan,
  ShenDuanQingFeng: shenDuanQingFeng,
  FuLiangYiYe: fuLiangYiYe,
  MingFeiTongPan: mingFeiTongPan,
  SuiXingQieTao: suiXingQieTao,
  BladesWill: bladesWill,
  InkAndStrings: inkAndStrings,
  ZephyrWhispers: zephyrWhispers,
  HarmonySong: harmonySong,
  FrostCladNight: frostCladNight,
  MoraleChant: moraleChant,
  SteadfastDevotion: steadfastDevotion,
  ThroatPiercingArt: throatPiercingArt,
  BreakingPoint: breakingPoint,
  EnvigoratedWarrior: envigoratedWarrior,
  EmpiricalEdge: empiricalEdge,
  ExquisiteScenery: exquisiteScenery,
  ArtOfResistance: artOfResistance,
  BattleAnthem: battleAnthem,
  AdaptiveSteel: adaptiveSteel,
  SoaringHigh: soaringHigh,
  SkyGripped: skyGripped,
  RoyalRemedy: royalRemedy,
  FuryHarvest: furyHarvest,
  InsightfulStrike: insightfulStrike,
  SeasonalEdge: seasonalEdge,
  FivefoldBleed: fivefoldBleed,
  WindBeneathWings: windBeneathWings,
  EveningSnow: eveningSnow,
  SteadfastStance: steadfastStance,
  ShadowAssault: shadowAssault,
  SandswirlTail: sandswirlTail,
  BitterSeasons: bitterSeasons,
  VitalLeech: vitalLeech,
  DivineRoulette: divineRoulette,
  EvasiveCharge: evasiveCharge,
  LightAndShadowAlike: lightAndShadowAlike,
  HeartOfFire: heartOfFire,
  MountainsMight: mountainsMight,
  WildfireSpark: wildfireSpark,
  SwordMorph: swordMorph,
  WolfchasersArt: wolfchasersArt,
  SwordHorizon: swordHorizon,
  GourdToss: gourdToss,
  ThunderousBloom: thunderousBloom,
  StarReacher: starReacher,
  BlossomBarrage: blossomBarrage,
  RestoringBlossom: restoringBlossom,
  EsotericRevival: esotericRevival,
  MendingLoom: mendingLoom,
  TrappedBeast: trappedBeast,
  RockSolid: rockSolid,
  EchoesOfOblivion: echoesOfOblivion,
  Vendetta: vendetta,
  RiptideReflex: riptideReflex,
  PhantomRally: phantomRally,
  TowlineSweep: towlineSweep,
  LightAnew: lightAnew,
  SongOfTang: songOfTang,
  WildfireSurge: wildfireSurge,
  CelestialVigor: celestialVigor,
  Eonpour: eonpour,
  Skyspeak: skyspeak,
  Mistwing: mistwing,
  Volutefit: volutefit,
} satisfies Record<string, InnerWayDefinition>

export function innerWayAvailableForTag(innerWay: string, requiredTag?: string) {
  if (!innerWay || !requiredTag) return true
  const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as InnerWayDefinition | undefined
  return definition?.tags?.includes(requiredTag) === true
}

/** Eligible entries for the path selectors, ordered by the data name rather than registry order. */
export function innerWayEntriesForTag(requiredTag?: string) {
  return Object.entries(innerWayDefinitions)
    .filter(([innerWay]) => innerWayAvailableForTag(innerWay, requiredTag))
    .toSorted(([, left], [, right]) => left.name.localeCompare(right.name))
}

/** Resolve authored Solo Level tables before effects enter the shared stat pipeline. */
export function innerWayDefinitionForSoloLevel(definition: InnerWayDefinition, soloLevel: number): InnerWayDefinition {
  if (!Number.isInteger(soloLevel) || soloLevel < 0) throw new RangeError("Invalid Solo Level: " + soloLevel)
  const effect = Object.fromEntries(
    Object.entries(definition.effect).map(([id, value]) => {
      const tier = value as InnerWayTierEffect
      if (!tier.effect) return [id, tier]
      return [
        id,
        { ...tier, effect: tier.effect.map(item => effectForSoloLevel(item, soloLevel, definition.name + " " + id)) },
      ]
    }),
  )
  return { ...definition, effect }
}
