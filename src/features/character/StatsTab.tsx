import { IconRotate, IconX } from "@tabler/icons-react"
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"

import {
  attunementAvailableForSettings,
  availableSetEntriesForSettings,
  innerWayAvailableForPath,
} from "../../application/characterComposition"
import type { CharacterState, PathId, SetupSelections } from "../../application/contracts"
import { deltaPrefix, formatDelta, formatNumber, throughputDeltaClass } from "../../application/formatting"
import { artStatByWeaponFamily, martialArtDefinitions } from "../../application/gameData/martialArts"
import { typedPathDefinitions } from "../../application/gameData/paths"
import {
  breakthroughProfile,
  scriptDisplayOrder,
  divinecraftDisplayOrder,
  typedArmorSetDefinitions,
  typedArsenalDefinitions,
  typedBowRingSetDefinitions,
  typedBreakthroughProfiles,
  typedDivinecraftDefinitions,
  typedFoodDefinitions,
  typedScriptDefinitions,
  typedWeaponSetDefinitions,
  type GearSetDefinition,
} from "../../application/gameData/setup"
import { percentageAttunementKeys } from "../../application/persistence/attunements"
import { statDefinition } from "../../application/persistence/stats"
import { CalculationStatus } from "../../application/results/CalculationStatus"
import { emptyPriorityRows, PriorityPanel } from "../../application/results/PriorityPanel"
import { type AttunementOverrides } from "../../calculations/attunementStats"
import { type AttunementStats } from "../../calculations/damage"
import { type RotationMetrics } from "../../calculations/rotationMetrics"
import { type CharacterStatOverrides } from "../../calculations/statEffects"
import {
  characterProfileMatches,
  exportCharacterProfiles,
  mergeImportedCharacterProfiles,
  type CharacterProfile,
} from "../../characterProfiles"
import { innerWayEntriesForTag } from "../../data/innerWayDefinitions"
import { attunementData, selectSetTier, type BuildSetup, type BuildSetupOverrides } from "../../gear"
import {
  globalDebuffRows,
  globalDebuffStorageKey,
  loadGlobalDebuffs,
  type GlobalDebuffState,
} from "../../globalDebuffs"
import { dataText, gameText, t } from "../../i18n"
import { publishNotice, dismissNotice } from "../../notices"
import { setPersistentItem } from "../../persistentStorage"
import { type CharacterStats } from "../../types"
import { Button } from "../../ui/Button"
import { Panel, PanelHeading } from "../../ui/Panel"
import { CalculatedStatField } from "./CalculatedStatField"
import { StatPair } from "./StatPair"

export function StatsTab({
  character,
  pathId,
  statOverrides,
  attunementOverrides,
  characterProfiles,
  buildSetupOverrides,
  onStatChange,
  onStatReset,
  onAttunementChange,
  onAttunementReset,
  onApplyCharacterProfile,
  onCharacterProfilesChange,
  onBreakthroughChange,
  onBuildSetupChange,
  onBuildSetupReset,
  rotationMetrics,
  graduationDps,
  activeBuildName,
  activeRotationName,
  onInnerWayChange,
  onSetupSelectionChange,
}: {
  character: CharacterState
  pathId: PathId
  statOverrides: CharacterStatOverrides
  attunementOverrides: AttunementOverrides
  characterProfiles: CharacterProfile[]
  buildSetupOverrides: BuildSetupOverrides
  onStatChange: (key: keyof CharacterStats, value: number) => void
  onStatReset: (key: keyof CharacterStats) => void
  onAttunementChange: (key: keyof AttunementStats, value: number) => void
  onAttunementReset: (key: keyof AttunementStats) => void
  onApplyCharacterProfile: (profile?: CharacterProfile) => void
  onCharacterProfilesChange: (profiles: CharacterProfile[]) => void
  onBreakthroughChange: (breakthrough: string) => void
  onBuildSetupChange: <K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) => void
  onBuildSetupReset: (key: keyof BuildSetup) => void
  rotationMetrics?: RotationMetrics
  graduationDps?: number
  activeBuildName: string
  activeRotationName: string
  onInnerWayChange: () => void
  onSetupSelectionChange: (key: keyof SetupSelections, value: string) => void
}) {
  const { stats, derivedStats, displayedAttunementStats: attunementStats, buildSetup, settings } = character
  const showHealingStats = pathId === "silkbindDeluge"
  const breakthrough = breakthroughProfile(settings)
  const { food, script, divinecraft } = character.setupSelections
  const [globalDebuffs, setGlobalDebuffs] = useState(loadGlobalDebuffs)
  const [attunementDrafts, setAttunementDrafts] = useState<Partial<Record<keyof AttunementStats, string>>>({})
  const [newProfileName, setNewProfileName] = useState("")
  const profileDialogRef = useRef<HTMLDialogElement>(null)
  const profileImportInputRef = useRef<HTMLInputElement>(null)
  const graduationRate =
    rotationMetrics && graduationDps && graduationDps > 0 ? (rotationMetrics.dps / graduationDps) * 100 : undefined

  useEffect(() => setPersistentItem(globalDebuffStorageKey, JSON.stringify(globalDebuffs)), [globalDebuffs])

  const { arsenal, bowRingSet, innerWays } = buildSetup
  const currentProfileData = useMemo(
    () => ({ statOverrides, attunementOverrides, innerWays, buildSetup }),
    [statOverrides, attunementOverrides, innerWays, buildSetup],
  )
  const matchingProfile = characterProfiles.find(profile => characterProfileMatches(profile, currentProfileData))
  const isCalculated =
    Object.keys(statOverrides).length === 0 &&
    Object.keys(attunementOverrides).length === 0 &&
    Object.keys(buildSetupOverrides).length === 0
  const [selectedProfileId, setSelectedProfileId] = useState(() =>
    isCalculated ? "__calculated" : (matchingProfile?.id ?? "__modified"),
  )

  if (selectedProfileId === "__calculated") {
    if (!isCalculated) setSelectedProfileId("__modified")
  } else if (selectedProfileId !== "__modified") {
    const selectedProfile = characterProfiles.find(({ id }) => id === selectedProfileId)
    if (!selectedProfile) setSelectedProfileId(isCalculated ? "__calculated" : "__modified")
  }
  useEffect(() => {
    if (selectedProfileId === "__calculated" || selectedProfileId === "__modified") return
    const selectedProfile = characterProfiles.find(({ id }) => id === selectedProfileId)
    if (!selectedProfile || characterProfileMatches(selectedProfile, currentProfileData)) return
    onCharacterProfilesChange(
      characterProfiles.map(profile =>
        profile.id === selectedProfileId
          ? {
              ...profile,
              statOverrides: { ...statOverrides },
              attunementOverrides: { ...attunementOverrides },
              innerWays: innerWays.map(row => ({ ...row })),
              buildSetup: {
                ...buildSetup,
                innerWays: innerWays.map(row => ({ ...row })),
                weaponSets: { ...buildSetup.weaponSets },
                armorSets: { ...buildSetup.armorSets },
              },
            }
          : profile,
      ),
    )
  }, [
    attunementOverrides,
    buildSetup,
    characterProfiles,
    currentProfileData,
    innerWays,
    onCharacterProfilesChange,
    selectedProfileId,
    statOverrides,
  ])

  function applyProfile(profile?: CharacterProfile) {
    setAttunementDrafts({})
    onApplyCharacterProfile(profile)
    onInnerWayChange()
  }

  function selectProfile(profile?: CharacterProfile) {
    setSelectedProfileId(profile?.id ?? "__calculated")
    applyProfile(profile)
  }

  function createProfile() {
    const name = newProfileName.trim()
    if (!name) return
    const usedIds = new Set(characterProfiles.map(({ id }) => id))
    const baseId = `character-profile-${Date.now()}`
    let id = baseId
    let suffix = 2
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`
    onCharacterProfilesChange([
      ...characterProfiles,
      {
        id,
        name,
        statOverrides: { ...statOverrides },
        attunementOverrides: { ...attunementOverrides },
        innerWays: innerWays.map(row => ({ ...row })),
        buildSetup: {
          ...buildSetup,
          innerWays: innerWays.map(row => ({ ...row })),
          weaponSets: { ...buildSetup.weaponSets },
          armorSets: { ...buildSetup.armorSets },
        },
      },
    ])
    setSelectedProfileId(id)
    setNewProfileName("")
    publishNotice({ id: "profile-transfer", message: t("ui.app.profileSaved", { name }) })
  }

  function exportProfiles() {
    const blob = new Blob([exportCharacterProfiles(characterProfiles)], { type: "application/json" })
    const href = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = href
    link.download = `where-builds-meet-character-profiles-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(href)
    publishNotice({
      id: "profile-transfer",
      message: t("ui.app.profilesExported", { count: characterProfiles.length }),
    })
  }

  async function importProfiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const result = mergeImportedCharacterProfiles(characterProfiles, JSON.parse(await file.text()))
      onCharacterProfilesChange(result.profiles)
      publishNotice({ id: "profile-transfer", message: t("ui.app.profilesImported", { count: result.importedCount }) })
    } catch (error) {
      publishNotice({
        id: "profile-transfer",
        message: error instanceof Error ? error.message : t("ui.app.profileImportError"),
        error: true,
      })
    }
  }

  function commitAttunement(key: keyof AttunementStats, rawValue: string) {
    const displayedValue = Number(rawValue)
    const normalizedValue = Number.isFinite(displayedValue) ? displayedValue : 0
    const nextValue = percentageAttunementKeys.has(key) ? normalizedValue / 100 : normalizedValue
    setAttunementDrafts(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
    onAttunementChange(key, nextValue)
  }

  function resetAttunement(key: keyof AttunementStats) {
    setAttunementDrafts(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
    onAttunementReset(key)
  }

  function updateGlobalDebuff<K extends keyof GlobalDebuffState>(key: K, value: GlobalDebuffState[K]) {
    const next = { ...globalDebuffs, [key]: value }
    setPersistentItem(globalDebuffStorageKey, JSON.stringify(next))
    setGlobalDebuffs(next)
    onInnerWayChange()
  }

  const physicalRows = [
    [statDefinition("minPhys"), statDefinition("maxPhys")],
    [statDefinition("power"), statDefinition("agility")],
    [statDefinition("momentum"), statDefinition("precision")],
    [statDefinition("crit"), statDefinition("directCrit")],
    [statDefinition("affinity"), statDefinition("directAffinity")],
  ]
  const bodyStat = statDefinition("body")
  const defenseStat = statDefinition("defense")
  const maxHpStat = statDefinition("maxHp")
  const physicalDefenseStat = statDefinition("physicalDefense")
  const martialRows = [
    [statDefinition("minBellstrike"), statDefinition("maxBellstrike")],
    [statDefinition("minStonesplit"), statDefinition("maxStonesplit")],
    [statDefinition("minSilkbind"), statDefinition("maxSilkbind")],
    [statDefinition("minBamboocut"), statDefinition("maxBamboocut")],
  ]
  const selectedArtStats = Array.from(
    new Set(settings.weapons.map(weapon => artStatByWeaponFamily[martialArtDefinitions[weapon].weapon])),
  ).map(statDefinition)
  const penetrationRows = [
    [statDefinition("bellstrikePenetration"), statDefinition("silkbindPenetration")],
    [statDefinition("stonesplitPenetration"), statDefinition("bamboocutPenetration")],
  ]
  const innerWayOptions = [
    ["", t("ui.app.none")],
    ...innerWayEntriesForTag(typedPathDefinitions[pathId].tag).map(
      ([value, definition]) =>
        [value, dataText(`system.innerWay.${value.charAt(0).toLowerCase()}${value.slice(1)}`, definition.name)] as [
          string,
          string,
        ],
    ),
  ]
  const attunementFields = Object.entries(attunementData)
    .filter(([key]) => attunementAvailableForSettings(key, pathId, settings))
    .map(
      ([key, definition]) =>
        [
          key as keyof AttunementStats,
          dataText(`system.attunement.${key}`, definition.name),
          definition.percentage ? "%" : "",
        ] as const,
    )
  const armorAttunementStart = attunementFields.findIndex(([key]) => attunementData[key]?.tags.includes("Armor"))
  const availableWeaponSets = availableSetEntriesForSettings(typedWeaponSetDefinitions, settings, pathId)
  const availableArmorSets = availableSetEntriesForSettings(typedArmorSetDefinitions, settings, pathId)
  const setupStatus = (group: string, value: string, active: boolean) => {
    if (active) return <small className="setup-active-label">{t("ui.app.active")}</small>
    const comparison = rotationMetrics?.setupComparisons[group]?.find(row => row.label === value)
    return comparison ? (
      <small className="setup-delta-label">
        <span className={throughputDeltaClass(comparison.dpsDifference, "damage")}>
          {deltaPrefix(comparison.dpsDifference)}
          {formatDelta(comparison.dpsDifference)} {t("system.dps")}
        </span>
        <span className={throughputDeltaClass(comparison.increase, "damage")}>
          ({deltaPrefix(comparison.increase)}
          {formatDelta(comparison.increase)}%)
        </span>
        {rotationMetrics && rotationMetrics.hps > 0 ? (
          <>
            <span className={throughputDeltaClass(comparison.hpsDifference, "healing")}>
              {deltaPrefix(comparison.hpsDifference)}
              {formatDelta(comparison.hpsDifference)} {t("system.hps")}
            </span>
            <span className={throughputDeltaClass(comparison.healingIncrease, "healing")}>
              ({deltaPrefix(comparison.healingIncrease)}
              {formatDelta(comparison.healingIncrease)}%)
            </span>
          </>
        ) : null}
      </small>
    ) : (
      <small className="setup-inactive-label">—</small>
    )
  }
  const setPanel = (
    title: string,
    key: "weaponSets" | "armorSets",
    definitions: Record<string, GearSetDefinition>,
    entries: Array<[string, GearSetDefinition]>,
  ) => (
    <Panel className="setup-placeholder-panel">
      <PanelHeading>
        <div>
          <h2>{title}</h2>
          <CalculationStatus category={key} />
        </div>
        {buildSetupOverrides[key] && (
          <button
            className="stat-reset-button"
            type="button"
            aria-label={t("ui.app.resetNamedValue", { name: title })}
            title={t("ui.app.resetToBuildValue")}
            onClick={() => onBuildSetupReset(key)}
          >
            <IconRotate size="1em" aria-hidden />
          </button>
        )}
      </PanelHeading>
      <div className="gear-set-list">
        {entries.map(([setName, definition]) => {
          const selectedTier = buildSetup[key][setName] ?? 0
          return (
            <div className="setup-field" key={setName}>
              <span>{gameText(definition.name)}</span>
              <div className="setup-option-control">
                <div className="setup-option-list">
                  {[0, 2, 4].map(tier => (
                    <button
                      className={selectedTier === tier ? "selected" : ""}
                      type="button"
                      key={tier}
                      onClick={() =>
                        onBuildSetupChange(key, selectSetTier(buildSetup[key], setName, tier as 0 | 2 | 4, definitions))
                      }
                    >
                      {t(`system.setPieces.${tier}`)}
                      <span>{setupStatus(`${key}:${setName}`, String(tier), selectedTier === tier)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
  const globalDebuffOption = (key: (typeof globalDebuffRows)[number]["key"], value: boolean, label: string) => {
    const active = globalDebuffs[key] === value
    const optionValue = value ? "on" : "off"
    return (
      <button
        className={active ? "selected" : ""}
        type="button"
        key={optionValue}
        onClick={() => updateGlobalDebuff(key, value)}
      >
        {label}
        <span>{setupStatus(`debuff:${key}`, optionValue, active)}</span>
      </button>
    )
  }
  const floatingGraceOptionLabel = (value: GlobalDebuffState["floatingGrace"]) => {
    switch (value) {
      case "none":
        return t("ui.app.none")
      case "mixed":
        return t("data.path.mixed.name")
      case "deluge":
        return t("system.path.deluge")
    }
  }

  return (
    <>
      <div className="app-layout">
        <div className="character-stats-column">
          <Panel className="stats-panel">
            <PanelHeading className="character-stats-heading">
              <div>
                <h2>{t("ui.app.characterStats")}</h2>
              </div>
              <div className="character-profile-controls">
                <select
                  aria-label={t("ui.app.characterProfile")}
                  value={selectedProfileId}
                  onChange={event => {
                    if (event.target.value === "__calculated") selectProfile()
                    else selectProfile(characterProfiles.find(({ id }) => id === event.target.value))
                  }}
                >
                  <option value="__calculated">{t("ui.app.calculated")}</option>
                  {selectedProfileId === "__modified" && (
                    <option value="__modified" disabled>
                      {t("ui.app.unsavedChanges")}
                    </option>
                  )}
                  {characterProfiles.map(profile => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    dismissNotice("profile-transfer")
                    profileDialogRef.current?.showModal()
                  }}
                >
                  {t("ui.app.profiles")}
                </Button>
                <Button variant="secondary" type="button" onClick={() => selectProfile()}>
                  {t("ui.app.reset")}
                </Button>
              </div>
            </PanelHeading>
            <div className="stats-grid">
              {physicalRows.map(([left, right], index) => (
                <StatPair key={left.key}>
                  <CalculatedStatField
                    definition={left}
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                    derivedLabel={
                      index === 0
                        ? t("ui.app.effectiveMinAttack", { name: t("system.damageType.physical") })
                        : index === 3
                          ? t("ui.app.effectiveCritical")
                          : index === 4
                            ? t("ui.app.effectiveAffinity")
                            : undefined
                    }
                    derivedValue={
                      index === 0
                        ? derivedStats.effectiveMinPhys
                        : index === 3
                          ? derivedStats.effectiveCrit * 100
                          : index === 4
                            ? derivedStats.effectiveAffinity * 100
                            : undefined
                    }
                    derivedUnit={index === 3 || index === 4 ? "%" : undefined}
                  />
                  <CalculatedStatField
                    definition={right}
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                    derivedLabel={
                      index === 0
                        ? t("ui.app.effectiveMaxAttack", { name: t("system.damageType.physical") })
                        : index === 2
                          ? t("ui.app.effectivePrecision")
                          : index === 3
                            ? t("ui.app.finalCritical")
                            : index === 4
                              ? t("ui.app.finalAffinity")
                              : undefined
                    }
                    derivedValue={
                      index === 0
                        ? derivedStats.effectiveMaxPhys
                        : index === 2
                          ? derivedStats.effectivePrecision * 100
                          : index === 3
                            ? derivedStats.finalCrit * 100
                            : index === 4
                              ? derivedStats.finalAffinity * 100
                              : undefined
                    }
                    derivedUnit={index === 2 || index === 3 || index === 4 ? "%" : undefined}
                  />
                </StatPair>
              ))}
              {martialRows.map(([left, right], index) => (
                <StatPair key={left.key}>
                  <CalculatedStatField
                    definition={left}
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                    derivedLabel={t("ui.app.effectiveMinAttack", {
                      name: t(`system.damageType.${["bellstrike", "stonesplit", "silkbind", "bamboocut"][index]}`),
                    })}
                    derivedValue={
                      derivedStats[
                        [
                          "effectiveMinBellstrike",
                          "effectiveMinStonesplit",
                          "effectiveMinSilkbind",
                          "effectiveMinBamboocut",
                        ][index] as keyof typeof derivedStats
                      ] as number
                    }
                  />
                  <CalculatedStatField
                    definition={right}
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                    derivedLabel={t("ui.app.effectiveMaxAttack", {
                      name: t(`system.damageType.${["bellstrike", "stonesplit", "silkbind", "bamboocut"][index]}`),
                    })}
                    derivedValue={
                      derivedStats[
                        [
                          "effectiveMaxBellstrike",
                          "effectiveMaxStonesplit",
                          "effectiveMaxSilkbind",
                          "effectiveMaxBamboocut",
                        ][index] as keyof typeof derivedStats
                      ] as number
                    }
                  />
                </StatPair>
              ))}
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("minVoidAttack")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={statDefinition("maxVoidAttack")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              {penetrationRows.map(([left, right]) => (
                <StatPair key={left.key}>
                  <CalculatedStatField
                    definition={left}
                    compact
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                  />
                  <CalculatedStatField
                    definition={right}
                    compact
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                  />
                </StatPair>
              ))}
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("critDmgBonus")}
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                  derivedLabel={t("ui.app.effectiveNamedStat", {
                    name: gameText(statDefinition("critDmgBonus").label),
                  })}
                  derivedValue={derivedStats.effectiveCritDmgBonus * 100}
                  derivedUnit="%"
                  compact
                />
                <CalculatedStatField
                  definition={statDefinition("affinityDmgBonus")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("physDmgBonus")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={statDefinition("bellstrikeDmgBonus")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("stonesplitDmgBonus")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={statDefinition("bamboocutDmgBonus")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("silkbindDmgBonus")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("allMartialArts")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={statDefinition("vsBossDmg")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              <StatPair>
                {selectedArtStats.map(definition => (
                  <CalculatedStatField
                    definition={definition}
                    compact
                    key={definition.key}
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                  />
                ))}
              </StatPair>
              <StatPair>
                <CalculatedStatField
                  definition={statDefinition("singleTargetMysticDmgBoost")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={statDefinition("areaMysticDmgBoost")}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              {showHealingStats ? (
                <StatPair>
                  <CalculatedStatField
                    definition={statDefinition("criticalHealingBonus")}
                    compact
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                  />
                  <CalculatedStatField
                    definition={statDefinition("silkbindHealingBonus")}
                    compact
                    stats={stats}
                    statOverrides={statOverrides}
                    onStatChange={onStatChange}
                    onStatReset={onStatReset}
                  />
                </StatPair>
              ) : null}
              <StatPair>
                <CalculatedStatField
                  definition={maxHpStat}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={bodyStat}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
              <StatPair>
                <CalculatedStatField
                  definition={physicalDefenseStat}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
                <CalculatedStatField
                  definition={defenseStat}
                  compact
                  stats={stats}
                  statOverrides={statOverrides}
                  onStatChange={onStatChange}
                  onStatReset={onStatReset}
                />
              </StatPair>
            </div>
          </Panel>
          <div className="character-secondary-stats">
            <Panel className="attunement-panel">
              <PanelHeading>
                <div>
                  <h2>{t("ui.app.attunementStats")}</h2>
                  <CalculationStatus category="attunementPriority" />
                </div>
              </PanelHeading>
              <div className="attunement-list">
                {attunementFields.map(([key, label, unit], index) => (
                  <label
                    className={`attunement-field ${index === armorAttunementStart ? "attunement-section-start" : ""} ${Object.prototype.hasOwnProperty.call(attunementOverrides, key) ? "modified-field" : ""}`}
                    key={key}
                  >
                    <span className="attunement-label">
                      <span>{label}</span>
                      {Object.prototype.hasOwnProperty.call(attunementOverrides, key) && (
                        <button
                          className="stat-reset-button"
                          type="button"
                          aria-label={t("ui.app.resetNamedValue", { name: label })}
                          title={t("ui.app.resetToCalculatedValue")}
                          onClick={event => {
                            event.preventDefault()
                            resetAttunement(key)
                          }}
                        >
                          <IconRotate size="1em" aria-hidden />
                        </button>
                      )}
                    </span>
                    <span className="attunement-input-wrap">
                      <input
                        type="number"
                        step="0.01"
                        value={
                          attunementDrafts[key] ??
                          formatNumber(unit ? attunementStats[key] * 100 : attunementStats[key])
                        }
                        onChange={event => setAttunementDrafts(current => ({ ...current, [key]: event.target.value }))}
                        onBlur={event => {
                          if (attunementDrafts[key] !== undefined) commitAttunement(key, event.currentTarget.value)
                        }}
                        onKeyDown={event => {
                          if (event.key === "Enter") event.currentTarget.blur()
                        }}
                      />
                      {unit && <i>{unit}</i>}
                    </span>
                  </label>
                ))}
              </div>
            </Panel>
            <Panel className="global-debuff-panel">
              <PanelHeading>
                <div>
                  <h2>{t("ui.app.globalBuffsDebuffs")}</h2>
                  <CalculationStatus category="globalDebuffs" />
                </div>
              </PanelHeading>
              <div className="global-debuff-list">
                {globalDebuffRows.map(({ key, name, path }) => (
                  <div className="global-debuff-row" key={key}>
                    <span>
                      {gameText(name)}
                      {path && <> ({gameText(path)})</>}
                    </span>
                    <div className="setup-option-list global-debuff-options">
                      {globalDebuffOption(key, false, t("ui.app.off"))}
                      {globalDebuffOption(key, true, t("ui.app.on"))}
                    </div>
                  </div>
                ))}
                <div className="global-debuff-row">
                  <span>{t("ui.app.draughtDebuffs")}</span>
                  <div className="setup-option-list global-debuff-options qingyi-options">
                    {(["none", "strayhunt", "both"] as const).map(value => {
                      const active = globalDebuffs.draught === value
                      const labels = {
                        none: t("ui.app.none"),
                        strayhunt: t("ui.app.strayhunt"),
                        both: t("ui.app.both"),
                      }
                      return (
                        <button
                          className={active ? "selected" : ""}
                          type="button"
                          key={value}
                          onClick={() => updateGlobalDebuff("draught", value)}
                        >
                          {labels[value]}
                          <span>{setupStatus("debuff:draught", value, active)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="global-debuff-row">
                  <span>
                    {gameText("Floating Grace")} ({t("system.path.deluge")})
                  </span>
                  <div className="setup-option-list global-debuff-options qingyi-options">
                    {(["none", "mixed", "deluge"] as const).map(value => {
                      const active = globalDebuffs.floatingGrace === value
                      return (
                        <button
                          className={active ? "selected" : ""}
                          type="button"
                          key={value}
                          onClick={() => updateGlobalDebuff("floatingGrace", value)}
                        >
                          {floatingGraceOptionLabel(value)}
                          <span>{setupStatus("buff:floatingGrace", value, active)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="global-debuff-row">
                  <span>{t("system.innerWay.bitterSeasons")}</span>
                  <div className="setup-option-list global-debuff-options qingyi-options">
                    {(["none", "T1", "T6"] as const).map(value => {
                      const active = globalDebuffs.qingyisCharm === value
                      return (
                        <button
                          className={active ? "selected" : ""}
                          type="button"
                          key={value}
                          onClick={() => updateGlobalDebuff("qingyisCharm", value)}
                        >
                          {value === "none" ? t("ui.app.none") : value}
                          <span>{setupStatus("debuff:qingyisCharm", value, active)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
        <section className="middle-stats-column">
          <Panel className="breakthrough-panel">
            <PanelHeading className="breakthrough-heading">
              <div className="breakthrough-title">
                <h2>{t("ui.app.breakthrough")}</h2>
                <span className="breakthrough-detail-trigger">
                  <button
                    className="breakthrough-detail-mark"
                    type="button"
                    aria-label={t("ui.app.breakthroughDetails")}
                    aria-describedby="breakthrough-details"
                  >
                    !
                  </button>
                  <span className="breakthrough-detail-tooltip" id="breakthrough-details" role="tooltip">
                    <span>
                      {t("ui.app.precision")} {formatNumber(breakthrough.levelBonusStats.rawStat.precision * 100)}%
                    </span>
                    <span>
                      {t("ui.app.baseAttributes")} {breakthrough.levelBonusStats.rawStat.agility}
                    </span>
                    <span>
                      {t("ui.app.gearTier")} {breakthrough.level}
                    </span>
                    <span>
                      {t("ui.app.defense")} {breakthrough.defense}
                    </span>
                    <span>
                      {t("ui.app.physicalResistance")} {breakthrough.physicalResistance}
                    </span>
                    <span>
                      {t("ui.app.attributeResistance")} {breakthrough.bellstrikeResistance}
                    </span>
                    <span>
                      {t("ui.app.judgementResistance")} {formatNumber(breakthrough.judgementResistance * 100)}%
                    </span>
                  </span>
                </span>
              </div>
              <label className="editor-field breakthrough-control">
                <span className="visually-hidden">{t("ui.app.breakthrough")}</span>
                <select value={settings.breakthrough} onChange={event => onBreakthroughChange(event.target.value)}>
                  {Object.keys(typedBreakthroughProfiles).map(key => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
            </PanelHeading>
          </Panel>
          <Panel className="inner-way-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.app.innerWays")}</h2>
              </div>
              {buildSetupOverrides.innerWays && (
                <button
                  className="stat-reset-button"
                  type="button"
                  aria-label={t("ui.app.resetInnerWays")}
                  title={t("ui.app.resetToBuildValue")}
                  onClick={() => onBuildSetupReset("innerWays")}
                >
                  <IconRotate size="1em" aria-hidden />
                </button>
              )}
            </PanelHeading>
            <div className="inner-way-list">
              {innerWays.map((row, index) => (
                <div className="inner-way-row" key={index}>
                  <select
                    aria-label={t("ui.app.innerWayNumber", { number: index + 1 })}
                    value={innerWayAvailableForPath(row.innerWay, pathId) ? row.innerWay : ""}
                    onChange={event => {
                      const next = innerWays.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, innerWay: event.target.value } : item,
                      )
                      onBuildSetupChange("innerWays", next)
                      onInnerWayChange()
                    }}
                  >
                    {innerWayOptions.map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={
                          Boolean(value) &&
                          innerWays.some((item, itemIndex) => itemIndex !== index && item.innerWay === value)
                        }
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t("ui.app.innerWayTierNumber", { number: index + 1 })}
                    value={row.tier}
                    onChange={event => {
                      const next = innerWays.map((item, itemIndex) =>
                        itemIndex === index ? Object.assign({}, item, { tier: event.target.value }) : item,
                      )
                      onBuildSetupChange("innerWays", next)
                      onInnerWayChange()
                    }}
                  >
                    {Array.from({ length: 7 }, (_, tier) => (
                      <option value={`T${tier}`} key={tier}>{`T${tier}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Panel>
          {setPanel(t("ui.app.weaponSet"), "weaponSets", typedWeaponSetDefinitions, availableWeaponSets)}
          {availableArmorSets.length > 0 &&
            setPanel(t("ui.app.armorSet"), "armorSets", typedArmorSetDefinitions, availableArmorSets)}
          <Panel className="setup-placeholder-panel bow-ring-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.app.bowRingSet")}</h2>
                <CalculationStatus category="bowRingSet" />
              </div>
              {buildSetupOverrides.bowRingSet !== undefined && (
                <button
                  className="stat-reset-button"
                  type="button"
                  aria-label={t("ui.app.resetBowRingSet")}
                  title={t("ui.app.resetToBuildValue")}
                  onClick={() => onBuildSetupReset("bowRingSet")}
                >
                  <IconRotate size="1em" aria-hidden />
                </button>
              )}
            </PanelHeading>
            <div className="setup-option-list setup-option-list-wide bow-ring-option-list">
              {Object.entries(typedBowRingSetDefinitions).map(([value, definition]) => (
                <button
                  className={bowRingSet === value ? "selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => onBuildSetupChange("bowRingSet", value)}
                >
                  {gameText(definition.name)}
                  <span>{setupStatus("bowRingSet", value, bowRingSet === value)}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="setup-placeholder-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.app.arsenal")}</h2>
                <CalculationStatus category="arsenal" />
              </div>
              {buildSetupOverrides.arsenal !== undefined && (
                <button
                  className="stat-reset-button"
                  type="button"
                  aria-label={t("ui.app.resetArsenal")}
                  title={t("ui.app.resetToBuildValue")}
                  onClick={() => onBuildSetupReset("arsenal")}
                >
                  <IconRotate size="1em" aria-hidden />
                </button>
              )}
            </PanelHeading>
            <div className="setup-option-list setup-option-list-arsenal">
              {Object.entries(typedArsenalDefinitions).map(([value, definition]) => (
                <button
                  className={arsenal === value ? "selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => onBuildSetupChange("arsenal", value)}
                >
                  {gameText(definition.name)}
                  <span>{setupStatus("arsenal", value, arsenal === value)}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="setup-placeholder-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.app.food")}</h2>
                <CalculationStatus category="food" />
              </div>
            </PanelHeading>
            <div className="setup-option-list setup-option-list-food">
              {Object.entries(typedFoodDefinitions).map(([value, definition]) => (
                <button
                  className={food === value ? "selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => onSetupSelectionChange("food", value)}
                >
                  {gameText(definition.name)}
                  <span>{setupStatus("food", value, food === value)}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel className="setup-placeholder-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.app.script")}</h2>
                <CalculationStatus category="script" />
              </div>
            </PanelHeading>
            <div className="script-option-list">
              {scriptDisplayOrder.map(value => {
                const definition = typedScriptDefinitions[value]
                if (!definition) return null
                return (
                  <button
                    className={`script-option ${script === value ? "selected" : ""}`}
                    type="button"
                    key={value}
                    title={`${gameText(definition.name)}: ${gameText(definition.description)}`}
                    onClick={() => onSetupSelectionChange("script", value)}
                  >
                    <span className="script-image-frame">
                      {definition.image ? (
                        <img src={`${import.meta.env.BASE_URL}script/${definition.image}`} alt="" />
                      ) : (
                        <span className="script-none-mark" aria-hidden="true" />
                      )}
                    </span>
                    <strong>{gameText(definition.name)}</strong>
                    <span className="script-option-status">{setupStatus("script", value, script === value)}</span>
                  </button>
                )
              })}
            </div>
          </Panel>
          <Panel className="setup-placeholder-panel divinecraft-panel">
            <PanelHeading>
              <div>
                <h2>{t("ui.app.divinecraft")}</h2>
                <CalculationStatus category="divinecraft" />
              </div>
            </PanelHeading>
            <div className="divinecraft-option-list">
              {divinecraftDisplayOrder.map(value => {
                if (value === null)
                  return <span className="divinecraft-option-spacer" aria-hidden="true" key="spacer" />
                const definition = typedDivinecraftDefinitions[value]
                if (!definition) return null
                const available = definition.available !== false
                return (
                  <button
                    className={`divinecraft-option ${divinecraft === value ? "selected" : ""}`}
                    type="button"
                    key={value}
                    disabled={!available}
                    title={`${gameText(definition.name)}: ${gameText(definition.description)}${available ? "" : t("ui.app.notAvailableYet")}`}
                    onClick={() => onSetupSelectionChange("divinecraft", value)}
                  >
                    <span className="divinecraft-image-frame">
                      {definition.image ? (
                        <img src={`${import.meta.env.BASE_URL}divinecraft/${definition.image}`} alt="" />
                      ) : (
                        <span className="divinecraft-none-mark" aria-hidden="true" />
                      )}
                    </span>
                    <strong>{gameText(definition.name)}</strong>
                    <span className="divinecraft-option-status">
                      {available ? (
                        setupStatus("divinecraft", value, divinecraft === value)
                      ) : (
                        <small>{t("ui.app.divinecraftUnavailableBadge")}</small>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </Panel>
        </section>
        <aside
          className={`results-column ${rotationMetrics && rotationMetrics.hps > 0 ? "results-column-with-healing" : ""}`}
        >
          <Panel className="dps-panel">
            <PanelHeading>
              <div>
                <h2>
                  {t("system.dps")}
                  {rotationMetrics && rotationMetrics.hps > 0 ? (
                    <>
                      {" / "}
                      <span className="healing-value">{t("system.hps")}</span>
                    </>
                  ) : null}
                </h2>
              </div>
              <div className="graduation-rate">
                <span>{t("ui.app.graduationRate")}</span>
                <strong>{graduationRate === undefined ? "—" : `${formatNumber(graduationRate)}%`}</strong>
                <span className="breakthrough-detail-trigger">
                  <button
                    className="breakthrough-detail-mark"
                    type="button"
                    aria-label={t("ui.app.graduationRateDetails")}
                    aria-describedby="graduation-rate-details"
                  >
                    !
                  </button>
                  <span
                    className="breakthrough-detail-tooltip graduation-rate-tooltip"
                    id="graduation-rate-details"
                    role="tooltip"
                  >
                    {t("ui.app.graduationRateDescription")}
                  </span>
                </span>
              </div>
            </PanelHeading>
            <div className="dps-value">
              {rotationMetrics ? (
                <>
                  <span>{formatNumber(rotationMetrics.dps)}</span>
                  {rotationMetrics.hps > 0 ? (
                    <>
                      <span className="throughput-separator">/</span>
                      <span className="healing-value">{formatNumber(rotationMetrics.hps)}</span>
                    </>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </div>
            {rotationMetrics?.expectedHawkwingStacks !== undefined ? (
              <div className="dps-secondary-metric">
                <span>{t("ui.app.expectedHawkwingStacks")}</span>
                <strong>{formatNumber(rotationMetrics.expectedHawkwingStacks)}</strong>
              </div>
            ) : null}
            <CalculationStatus category="baseline" className="dps-calculation-status" />
            <div className="dps-context">
              <div>
                <span>{t("ui.app.build")}</span>
                <strong title={activeBuildName}>{activeBuildName}</strong>
              </div>
              <div>
                <span>{t("ui.app.rotation")}</span>
                <strong title={activeRotationName}>{activeRotationName}</strong>
              </div>
            </div>
          </Panel>
          <PriorityPanel
            title={t("ui.app.statsPriority")}
            rows={rotationMetrics?.statPriority ?? emptyPriorityRows}
            calculationCategory="statPriority"
            showMaxRoll
            showHealing={Boolean(rotationMetrics && rotationMetrics.hps > 0)}
          />
          <PriorityPanel
            title={t("ui.app.attunementStatsPriority")}
            rows={rotationMetrics?.attunementPriority ?? emptyPriorityRows}
            calculationCategory="attunementPriority"
            sectionBreakAt={2}
            showMaxRoll
            showHealing={Boolean(rotationMetrics && rotationMetrics.hps > 0)}
          />
          <PriorityPanel
            title={t("ui.app.innerWaysPriority")}
            rows={rotationMetrics?.innerWayPriority ?? emptyPriorityRows}
            calculationCategory="innerWays"
            showHealing={Boolean(rotationMetrics && rotationMetrics.hps > 0)}
          />
        </aside>
      </div>
      <dialog className="character-profile-dialog" ref={profileDialogRef}>
        <div className="character-profile-dialog-heading">
          <div>
            <h2>{t("ui.app.characterProfiles")}</h2>
            <p>{t("ui.app.profilesSaveModifiedStatsAndTheCompleteMain")}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t("ui.app.closeCharacterProfiles")}
            onClick={() => profileDialogRef.current?.close()}
          >
            <IconX size="1em" aria-hidden />
          </button>
        </div>
        <div className="character-profile-create">
          <input
            value={newProfileName}
            placeholder={t("ui.app.profileName")}
            aria-label={t("ui.app.newCharacterProfileName")}
            onChange={event => setNewProfileName(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") createProfile()
            }}
          />
          <Button variant="primary" type="button" disabled={!newProfileName.trim()} onClick={createProfile}>
            {t("ui.app.saveCurrent")}
          </Button>
        </div>
        <div className="character-profile-list">
          <div className="character-profile-row calculated-profile-row">
            <strong>{t("ui.app.calculated")}</strong>
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => {
                selectProfile()
                profileDialogRef.current?.close()
              }}
            >
              {t("ui.app.load")}
            </Button>
          </div>
          {characterProfiles.map(profile => (
            <div className="character-profile-row" key={profile.id}>
              <input
                defaultValue={profile.name}
                aria-label={t("ui.app.renameNamedProfile", { name: profile.name })}
                onBlur={event => {
                  const name = event.currentTarget.value.trim()
                  if (!name) {
                    event.currentTarget.value = profile.name
                    return
                  }
                  if (name !== profile.name)
                    onCharacterProfilesChange(
                      characterProfiles.map(candidate =>
                        candidate.id === profile.id ? { ...candidate, name } : candidate,
                      ),
                    )
                }}
              />
              <div>
                <Button
                  variant="secondary"
                  size="small"
                  type="button"
                  onClick={() => {
                    selectProfile(profile)
                    profileDialogRef.current?.close()
                  }}
                >
                  {t("ui.app.load")}
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  type="button"
                  onClick={() => {
                    const usedIds = new Set(characterProfiles.map(({ id }) => id))
                    const baseId = `${profile.id}:copy`
                    let id = baseId
                    let suffix = 2
                    while (usedIds.has(id)) id = `${baseId}:${suffix++}`
                    onCharacterProfilesChange([
                      ...characterProfiles,
                      {
                        ...profile,
                        id,
                        name: `${profile.name} Copy`,
                        statOverrides: { ...profile.statOverrides },
                        attunementOverrides: { ...profile.attunementOverrides },
                        innerWays: profile.innerWays.map(row => ({ ...row })),
                        buildSetup: {
                          ...profile.buildSetup,
                          innerWays: profile.innerWays.map(row => ({ ...row })),
                          weaponSets: { ...profile.buildSetup.weaponSets },
                          armorSets: { ...profile.buildSetup.armorSets },
                        },
                      },
                    ])
                  }}
                >
                  {t("ui.app.duplicate")}
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  type="button"
                  onClick={() => onCharacterProfilesChange(characterProfiles.filter(({ id }) => id !== profile.id))}
                >
                  {t("ui.app.delete")}
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="character-profile-transfer">
          <div>
            <Button
              variant="secondary"
              size="small"
              type="button"
              disabled={characterProfiles.length === 0}
              onClick={exportProfiles}
            >
              {t("ui.app.export")}
            </Button>
            <Button
              variant="secondary"
              size="small"
              type="button"
              onClick={() => profileImportInputRef.current?.click()}
            >
              {t("ui.app.import")}
            </Button>
            <input
              ref={profileImportInputRef}
              type="file"
              accept="application/json,.json"
              aria-label={t("ui.app.importCharacterProfiles")}
              onChange={importProfiles}
              hidden
            />
          </div>
          <Button variant="primary" type="button" onClick={() => profileDialogRef.current?.close()}>
            {t("ui.app.done")}
          </Button>
        </div>
      </dialog>
    </>
  )
}
