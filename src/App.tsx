import { IconBrandDiscord, IconBrandGithub } from "@tabler/icons-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { settingsForPath } from "./application/characterComposition"
import { calculateGlobalStatState } from "./application/characterComposition"
import type { CalculatorSettings, LayoutMode, PathId, SetupSelections } from "./application/contracts"
import { martialArtDefinitions } from "./application/gameData/martialArts"
import { pathIcons } from "./application/gameData/pathIcons"
import {
  defaultBuildIdForPath,
  defaultRotationIdForPath,
  pathRequiresDev,
  pathStatusLabel,
  typedPathDefinitions,
  type PathDefinition,
} from "./application/gameData/paths"
import { breakthroughProfile } from "./application/gameData/setup"
import { defaultAttunementStats, loadAttunementOverrides } from "./application/persistence/attunements"
import { loadRotationEntries } from "./application/persistence/rotations"
import { loadSettings } from "./application/persistence/settings"
import { loadBuildSetupOverrides, sameBuildSetupValue } from "./application/persistence/setupOverrides"
import { hasSkillOverrides, loadSkillOverrides } from "./application/persistence/skillOverrides"
import { loadStatOverrides } from "./application/persistence/stats"
import { rotationAvailableForWeapons } from "./application/rotationCatalog"
import { FeatureLoadBoundary } from "./application/shell/FeatureLoadBoundary"
import { NoticeArea } from "./application/shell/NoticeArea"
import { resolveAttunementStats, type AttunementOverrides } from "./calculations/attunementStats"
import { type AttunementStats } from "./calculations/damage"
import { BreakdownTab } from "./features/analysis/BreakdownTab"
import { StatsTab } from "./features/character/StatsTab"
import { RotationEditorTab } from "./features/rotations/RotationEditorTab"
import { SettingsTab } from "./features/settings/SettingsTab"
import { SkillEditorTab } from "./features/skills/SkillEditorTab"
import { Button } from "./ui/Button"
import { Chip } from "./ui/Chip"
import { Tab } from "./ui/Tab"
const loadBuildTab = () => import("./features/build/BuildTab")
const loadSimulationTab = () => import("./features/simulation/SimulationTab")
const BuildTab = lazy(loadBuildTab)
const SimulationTab = lazy(loadSimulationTab)
import {
  activeBuildByPathStorageKey,
  activeRotationByPathStorageKey,
  activeRotationStorageKey,
  attunementOverrideStorageKey,
  buildSetupOverrideStorageKey,
  divinecraftStorageKey,
  foodStorageKey,
  layoutPreviewStorageKey,
  pathStorageKey,
  scriptStorageKey,
  settingsStorageKey,
  skillStorageKey,
  statOverrideStorageKey,
} from "./application/persistence/keys"
import { loadPathSelectionIds, withPathSelection, type PathSelectionIds } from "./application/persistence/pathSelection"
import {
  compactLayoutSnapshot,
  loadDevMode,
  loadDivinecraft,
  loadFood,
  loadLayoutPreview,
  loadScript,
  loadSelectedPath,
  subscribeToCompactLayout,
} from "./application/persistence/settings"
import { RotationCalculationCache } from "./calculations/rotationCalculationCache"
import { type RotationSimulationBundle } from "./calculations/rotationCalculator"
import {
  endRotationCalculation,
  getRotationMetrics,
  publishRotationMetrics,
  subscribeToRotationMetrics,
  type RotationMetrics,
} from "./calculations/rotationMetrics"
import { supersedeRotationCalculationRequests } from "./calculations/rotationWorkerClient"
import { type CharacterStatOverrides, type StatEffectContainer } from "./calculations/statEffects"
import {
  characterProfileStorageKey,
  loadCharacterProfiles,
  serializeCharacterProfiles,
  type CharacterProfile,
} from "./characterProfiles"
import {
  activeBuildStorageKey,
  buildEntryAvailableForPath,
  buildEntryIsTestPreset,
  buildListStorageKey,
  calculateEquippedGearEffects,
  loadBuildState,
  resolveBuildInventory,
  resolveBuildSetup,
  sameWeaponPair,
  serializeBuildState,
  type BuildSetup,
  type BuildSetupOverrides,
  type BuildState,
} from "./gear"
import {
  developmentModeStorageKey as devModeStorageKey,
  gameText,
  getLocale,
  getLocaleDisplayName,
  getSupportedLocales,
  isLocaleWip,
  selectLocale,
  t,
} from "./i18n"
import { resolvePathWorkspaceSelection } from "./pathWorkspace"
import { removePersistentItem, setPersistentItem } from "./persistentStorage"
import { serializeSkillOverrides, type SkillOverrides } from "./skillOverrides"
import { type CharacterStats, type EnemyProfile, type WeaponId } from "./types"

const tabSuspenseFallback = <div className="viewport-tab-content" />

export default function App() {
  const compactViewport = useSyncExternalStore(subscribeToCompactLayout, compactLayoutSnapshot, () => false)
  const [locale, setLocale] = useState(getLocale)
  const [activeTab, setActiveTab] = useState<
    "main" | "build" | "breakdown" | "rotations" | "simulation" | "skills" | "settings"
  >("main")
  // Mount the simulator only on first use, then keep it mounted while hidden. Its module is preloaded below.
  // Remounting would cancel its worker and discard progress/results on every tab switch.
  const [simulationMounted, setSimulationMounted] = useState(false)

  useEffect(() => {
    const preloadDeferredTabs = () => {
      void Promise.allSettled([loadBuildTab(), loadSimulationTab()])
    }
    if (typeof window.requestIdleCallback === "function") {
      const idleCallback = window.requestIdleCallback(preloadDeferredTabs, { timeout: 1500 })
      return () => window.cancelIdleCallback(idleCallback)
    }
    const timeout = window.setTimeout(preloadDeferredTabs, 1)
    return () => window.clearTimeout(timeout)
  }, [])

  const [skillOverrides, setSkillOverrides] = useState<SkillOverrides>(loadSkillOverrides)
  const skillEditorModified = hasSkillOverrides(skillOverrides)
  const [activeSimulation, setActiveSimulation] = useState<{
    bundle: RotationSimulationBundle
    rotationName: string
    bundleKey: string
    rotationIsDefault: boolean
    graduationFingerprint?: string
    graduationDps?: number
  }>()
  const rotationMetrics = useSyncExternalStore(subscribeToRotationMetrics, getRotationMetrics, getRotationMetrics)
  const [innerWayRevision, setInnerWayRevision] = useState(0)
  const [setupSelections, setSetupSelections] = useState<SetupSelections>(() => ({
    food: loadFood(),
    script: loadScript(),
    divinecraft: loadDivinecraft(),
  }))
  useEffect(() => setPersistentItem(foodStorageKey, setupSelections.food), [setupSelections.food])
  useEffect(() => setPersistentItem(scriptStorageKey, setupSelections.script), [setupSelections.script])
  useEffect(() => setPersistentItem(divinecraftStorageKey, setupSelections.divinecraft), [setupSelections.divinecraft])
  const [statOverrides, setStatOverrides] = useState<CharacterStatOverrides>(loadStatOverrides)
  const [attunementOverrides, setAttunementOverrides] = useState<AttunementOverrides>(loadAttunementOverrides)
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>(loadCharacterProfiles)
  const [devMode, setDevMode] = useState(loadDevMode)
  const [layoutPreview, setLayoutPreview] = useState<LayoutMode>(() => loadLayoutPreview(compactViewport))
  const layoutMode: LayoutMode = devMode ? layoutPreview : compactViewport ? "mobile" : "pc"
  const [pathId, setPathId] = useState<PathId>(() => loadSelectedPath(devMode))
  const [settings, setSettings] = useState<CalculatorSettings>(() => settingsForPath(loadSettings(), pathId))
  const [buildState, setBuildState] = useState<BuildState>(loadBuildState)
  const [activeBuildIdsByPath, setActiveBuildIdsByPath] = useState<PathSelectionIds>(() =>
    loadPathSelectionIds(activeBuildByPathStorageKey, activeBuildStorageKey, pathId),
  )
  const [activeRotationIdsByPath, setActiveRotationIdsByPath] = useState<PathSelectionIds>(() =>
    loadPathSelectionIds(activeRotationByPathStorageKey, activeRotationStorageKey, pathId),
  )
  const [rotationCalculationCache] = useState(() => new RotationCalculationCache())
  const breakthrough = breakthroughProfile(settings)
  const enemy: EnemyProfile = breakthrough
  const availableBuildEntries = buildState.entries.filter(
    entry =>
      (devMode || !buildEntryIsTestPreset(entry)) &&
      buildEntryAvailableForPath(entry, typedPathDefinitions[pathId].buildGroup, settings.weapons),
  )
  const activeBuild =
    availableBuildEntries.find(entry => entry.id === activeBuildIdsByPath[pathId]) ??
    availableBuildEntries.find(entry => entry.id === defaultBuildIdForPath(pathId)) ??
    availableBuildEntries[0]
  const effectiveBuildState = useMemo(
    () => ({ ...buildState, activeBuildId: activeBuild?.id ?? "" }),
    [activeBuild?.id, buildState],
  )
  const buildTabMartialArtTags = useMemo(
    () => settings.weapons.map(weapon => martialArtDefinitions[weapon].tag),
    [settings.weapons],
  )
  const selectedRotationId = activeRotationIdsByPath[pathId] ?? defaultRotationIdForPath(pathId)
  const activeBuildDisplayName = activeBuild
    ? (activeBuild.isDefault ? gameText(activeBuild.name) : activeBuild.name) || "Unnamed Build"
    : "Unnamed Build"
  const activeBuildSetup = useMemo(() => resolveBuildSetup(activeBuild), [activeBuild])
  const [buildSetupOverrides, setBuildSetupOverrides] = useState<BuildSetupOverrides>(() =>
    loadBuildSetupOverrides(activeBuildSetup),
  )
  const buildSetup = useMemo<BuildSetup>(
    () => ({
      innerWays: (buildSetupOverrides.innerWays ?? activeBuildSetup.innerWays).map(row => Object.assign({}, row)),
      weaponSets: { ...(buildSetupOverrides.weaponSets ?? activeBuildSetup.weaponSets) },
      armorSets: { ...(buildSetupOverrides.armorSets ?? activeBuildSetup.armorSets) },
      bowRingSet: buildSetupOverrides.bowRingSet ?? activeBuildSetup.bowRingSet,
      arsenal: buildSetupOverrides.arsenal ?? activeBuildSetup.arsenal,
    }),
    [activeBuildSetup, buildSetupOverrides],
  )
  const activeGearInventory = useMemo(
    () =>
      activeBuild
        ? resolveBuildInventory(activeBuild, buildState.gearItems, settings.weapons)
        : { items: [], equipped: {} },
    [activeBuild, buildState.gearItems, settings.weapons],
  )
  const equippedGearEffects = useMemo(
    () => calculateEquippedGearEffects(activeGearInventory, settings.weapons, activeBuild?.isDefault !== true),
    [activeGearInventory, settings.weapons, activeBuild?.isDefault],
  )
  const gearStatEffect = useMemo<StatEffectContainer>(
    () => ({ rawStat: equippedGearEffects.stats }),
    [equippedGearEffects],
  )
  const globalStatState = useMemo(
    () => calculateGlobalStatState(statOverrides, settings, gearStatEffect, buildSetup, setupSelections, pathId),
    [statOverrides, settings, gearStatEffect, buildSetup, setupSelections, pathId],
  )
  const displayedStats = globalStatState.stats
  const derivedStats = globalStatState.derivedStats
  const resolvedAttunementStats = useMemo(
    () =>
      resolveAttunementStats(defaultAttunementStats, equippedGearEffects.attunement, attunementOverrides, {
        physicalPenetration: displayedStats.physicalPenetration,
        formlessPenetration: displayedStats.formlessPenetration,
      }),
    [
      attunementOverrides,
      displayedStats.physicalPenetration,
      displayedStats.formlessPenetration,
      equippedGearEffects.attunement,
    ],
  )
  const character = useMemo(
    () => ({
      stats: displayedStats,
      rawStats: globalStatState.rawStats,
      baseStats: globalStatState.baseStats,
      attunementStats: resolvedAttunementStats.calculation,
      displayedAttunementStats: resolvedAttunementStats.displayed,
      settings,
      enemy,
      derivedStats,
      innerWayRevision,
      setupSelections,
      gearStatEffect,
      buildSetup,
    }),
    [
      displayedStats,
      globalStatState.baseStats,
      globalStatState.rawStats,
      resolvedAttunementStats,
      settings,
      enemy,
      derivedStats,
      innerWayRevision,
      setupSelections,
      gearStatEffect,
      buildSetup,
    ],
  )
  const updateStatOverride = (key: keyof CharacterStats, value: number) => {
    setStatOverrides(current => ({ ...current, [key]: value }))
  }
  const resetStatOverride = (key: keyof CharacterStats) => {
    setStatOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const updateAttunementOverride = (key: keyof AttunementStats, value: number) =>
    setAttunementOverrides(current => ({ ...current, [key]: value }))
  const resetAttunementOverride = (key: keyof AttunementStats) =>
    setAttunementOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  function updateBuildSetupOverride<K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) {
    setBuildSetupOverrides(current => {
      if (!sameBuildSetupValue(key, value, activeBuildSetup[key])) return { ...current, [key]: value }
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const resetBuildSetupOverride = (key: keyof BuildSetup) =>
    setBuildSetupOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  const applyCharacterProfile = (profile?: CharacterProfile) => {
    setStatOverrides(profile ? { ...profile.statOverrides } : {})
    setAttunementOverrides(profile ? { ...profile.attunementOverrides } : {})
    if (!profile) {
      setBuildSetupOverrides({})
      return
    }
    setBuildSetupOverrides({
      innerWays: profile.innerWays.map(row => ({ ...row })),
      weaponSets: { ...profile.buildSetup.weaponSets },
      armorSets: { ...profile.buildSetup.armorSets },
      bowRingSet: profile.buildSetup.bowRingSet,
      arsenal: profile.buildSetup.arsenal,
    })
  }
  const handleRotationMetrics = (metrics: RotationMetrics, isActive: boolean) => {
    if (isActive) publishRotationMetrics(metrics)
  }
  const handleActiveSimulationBundle = useCallback(
    (
      bundle: RotationSimulationBundle,
      rotationName: string,
      bundleKey: string,
      rotationIsDefault: boolean,
      graduation?: { fingerprint: string; dps?: number },
    ) =>
      setActiveSimulation({
        bundle,
        rotationName,
        bundleKey,
        rotationIsDefault,
        graduationFingerprint: graduation?.fingerprint,
        graduationDps: graduation?.dps,
      }),
    [],
  )
  const handleGraduationDps = useCallback((fingerprint: string, dps: number) => {
    setActiveSimulation(current =>
      current?.graduationFingerprint === fingerprint ? { ...current, graduationDps: dps } : current,
    )
  }, [])
  const activeRotationDisplayName = activeSimulation
    ? activeSimulation.rotationIsDefault
      ? gameText(activeSimulation.rotationName)
      : activeSimulation.rotationName
    : "—"
  const activateBuildForPath = useCallback(
    (id: string, targetPathId = pathId) => {
      setActiveBuildIdsByPath(current => {
        const next = withPathSelection(current, targetPathId, id)
        if (next !== current) setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(next))
        return next
      })
      setBuildState(current => (current.activeBuildId === id ? current : { ...current, activeBuildId: id }))
    },
    [pathId],
  )
  const activateRotationForPath = useCallback(
    (id: string, targetPathId = pathId) => {
      setActiveRotationIdsByPath(current => {
        const next = withPathSelection(current, targetPathId, id)
        if (next !== current) setPersistentItem(activeRotationByPathStorageKey, JSON.stringify(next))
        return next
      })
    },
    [pathId],
  )
  const transitionPath = (
    nextPathId: PathId,
    options: { weapons?: [WeaponId, WeaponId]; rotationId?: string } = {},
  ) => {
    if (pathRequiresDev(typedPathDefinitions[nextPathId]) && !devMode) return
    const nextSettings =
      nextPathId === "mixed" && options.weapons
        ? { ...settingsForPath(settings, nextPathId), weapons: [...options.weapons] as [WeaponId, WeaponId] }
        : settingsForPath(settings, nextPathId)
    const nextBuildEntries = buildState.entries.filter(
      entry =>
        (devMode || !buildEntryIsTestPreset(entry)) &&
        buildEntryAvailableForPath(entry, typedPathDefinitions[nextPathId].buildGroup, nextSettings.weapons),
    )
    const nextRotationEntries = loadRotationEntries().filter(
      entry => (devMode || !entry.test) && rotationAvailableForWeapons(entry, nextSettings.weapons),
    )
    const selection = resolvePathWorkspaceSelection({
      buildIds: nextBuildEntries.map(entry => entry.id),
      rotationIds: nextRotationEntries.map(entry => entry.id),
      savedBuildId: activeBuildIdsByPath[nextPathId],
      savedRotationId: activeRotationIdsByPath[nextPathId],
      requestedRotationId: options.rotationId,
      defaultBuildId: defaultBuildIdForPath(nextPathId),
      defaultRotationId: defaultRotationIdForPath(nextPathId),
    })
    if (!selection) return

    supersedeRotationCalculationRequests()
    endRotationCalculation()
    setActiveSimulation(undefined)

    const nextBuildIds = withPathSelection(activeBuildIdsByPath, nextPathId, selection.buildId)
    const nextRotationIds = withPathSelection(activeRotationIdsByPath, nextPathId, selection.rotationId)
    if (nextBuildIds !== activeBuildIdsByPath)
      setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(nextBuildIds))
    if (nextRotationIds !== activeRotationIdsByPath)
      setPersistentItem(activeRotationByPathStorageKey, JSON.stringify(nextRotationIds))
    setPersistentItem(pathStorageKey, nextPathId)
    setActiveBuildIdsByPath(nextBuildIds)
    setActiveRotationIdsByPath(nextRotationIds)
    setBuildState(current => ({ ...current, activeBuildId: selection.buildId }))
    setPathId(nextPathId)
    setSettings(nextSettings)
    setInnerWayRevision(current => current + 1)
  }
  const selectPath = (nextPathId: PathId) => transitionPath(nextPathId)
  const selectBuildWeapons = (nextWeapons: [WeaponId, WeaponId], rotationId?: string) => {
    const matchingPath = (Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).find(
      ([candidateId, definition]) =>
        candidateId !== "mixed" &&
        (!pathRequiresDev(definition) || devMode) &&
        definition.lockedWeapons &&
        sameWeaponPair(definition.lockedWeapons, nextWeapons),
    )
    const nextPathId = matchingPath?.[0] ?? (devMode ? "mixed" : undefined)
    if (!nextPathId) return false
    transitionPath(nextPathId, { weapons: nextWeapons, rotationId })
    return true
  }
  const toggleDevMode = () => {
    const nextDevMode = !devMode
    setPersistentItem(devModeStorageKey, String(nextDevMode))
    setDevMode(nextDevMode)
    if (!nextDevMode && pathRequiresDev(typedPathDefinitions[pathId])) selectPath("stonesplitStrength")
    if (!nextDevMode && isLocaleWip(locale)) void changeLocale("en")
  }
  const changeLocale = async (nextLocale: string) => {
    if (await selectLocale(nextLocale)) setLocale(getLocale())
  }
  const changeLayoutPreview = (nextLayout: LayoutMode) => {
    setPersistentItem(layoutPreviewStorageKey, nextLayout)
    setLayoutPreview(nextLayout)
  }
  const updateSkillOverrides = (nextOverrides: SkillOverrides) => {
    setSkillOverrides(nextOverrides)
    if (hasSkillOverrides(nextOverrides)) setPersistentItem(skillStorageKey, serializeSkillOverrides(nextOverrides))
    else removePersistentItem(skillStorageKey)
  }

  useEffect(() => setPersistentItem(statOverrideStorageKey, JSON.stringify(statOverrides)), [statOverrides])
  useEffect(
    () => setPersistentItem(characterProfileStorageKey, serializeCharacterProfiles(characterProfiles)),
    [characterProfiles],
  )
  if (activeBuild && activeBuildIdsByPath[pathId] === activeBuild.id && activeBuild.id !== buildState.activeBuildId)
    setBuildState(current => ({ ...current, activeBuildId: activeBuild.id }))
  if (activeBuild && activeBuildIdsByPath[pathId] !== activeBuild.id)
    setActiveBuildIdsByPath(withPathSelection(activeBuildIdsByPath, pathId, activeBuild.id))
  useEffect(() => {
    setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(activeBuildIdsByPath))
  }, [activeBuildIdsByPath])
  useEffect(() => setPersistentItem(buildListStorageKey, serializeBuildState(buildState)), [buildState])
  useEffect(
    () => setPersistentItem(attunementOverrideStorageKey, JSON.stringify(attunementOverrides)),
    [attunementOverrides],
  )
  useEffect(
    () => setPersistentItem(buildSetupOverrideStorageKey, JSON.stringify(buildSetupOverrides)),
    [buildSetupOverrides],
  )
  useEffect(
    () => setPersistentItem(settingsStorageKey, JSON.stringify({ weapons: settings.weapons, ping: settings.ping })),
    [settings.weapons, settings.ping],
  )
  useEffect(() => setPersistentItem(pathStorageKey, pathId), [pathId])

  return (
    <main
      className={`page-shell layout-${layoutMode} ${layoutMode === "pc" && (activeTab === "build" || activeTab === "rotations") ? "viewport-page-shell" : ""}`}
      data-layout={layoutMode}
    >
      <header className="page-header">
        <div className="page-header-start">
          <h1>{t("ui.app.whereBuildsMeet")}</h1>
          <p className="intro">{t("ui.app.buildSimulateAndOptimizeForWhereWindsMeet")}</p>
          <section className="path-selector" aria-label={t("ui.app.combatPath")}>
            <div className="path-selector-options">
              {(Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).map(([value, definition]) => {
                const icon = pathIcons[value]
                return (
                  <button
                    className={pathId === value ? "selected" : ""}
                    type="button"
                    key={value}
                    aria-pressed={pathId === value}
                    disabled={pathRequiresDev(definition) && !devMode}
                    onClick={() => selectPath(value)}
                  >
                    {icon && <img src={icon} alt="" />}
                    <span>{gameText(definition.name)}</span>
                    {definition.status !== "available" && (
                      <Chip className="path-status-badge">{pathStatusLabel(definition)}</Chip>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
        <div className="page-header-end">
          <div className="page-header-controls">
            <NoticeArea />
            <label className="locale-selector">
              <span>{t("ui.app.language")}</span>
              <select value={locale} onChange={event => void changeLocale(event.target.value)}>
                {getSupportedLocales().map(supportedLocale => (
                  <option
                    value={supportedLocale}
                    key={supportedLocale}
                    disabled={!devMode && isLocaleWip(supportedLocale)}
                  >
                    {getLocaleDisplayName(supportedLocale)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="dev-mode-button"
              variant="secondary"
              type="button"
              aria-pressed={devMode}
              onClick={toggleDevMode}
            >
              {t("ui.app.dev")}
            </Button>
          </div>
          <div className="project-links">
            <a href="https://discord.gg/UtqAw8HaXA" target="_blank" rel="noreferrer">
              <IconBrandDiscord size="1em" aria-hidden />
              <span>{t("ui.app.discord")}</span>
            </a>
            <a href="https://github.com/greydust/where-builds-meet" target="_blank" rel="noreferrer">
              <IconBrandGithub size="1em" aria-hidden />
              <span>{t("ui.app.github")}</span>
            </a>
          </div>
        </div>
      </header>
      <nav className="main-tabs" aria-label={t("ui.app.mainSections")}>
        <Tab active={activeTab === "main"} onClick={() => setActiveTab("main")}>
          {t("ui.app.main")}
        </Tab>
        <Tab active={activeTab === "build"} onClick={() => setActiveTab("build")}>
          {t("ui.app.build")}
        </Tab>
        <Tab active={activeTab === "breakdown"} onClick={() => setActiveTab("breakdown")}>
          {t("ui.app.dpsBreakdown", {
            dps:
              rotationMetrics && rotationMetrics.hps > 0 ? `${t("system.dps")} / ${t("system.hps")}` : t("system.dps"),
          })}
        </Tab>
        <Tab active={activeTab === "rotations"} onClick={() => setActiveTab("rotations")}>
          {t("ui.app.rotationEditor")}
        </Tab>
        <Tab
          active={activeTab === "simulation"}
          onClick={() => {
            setSimulationMounted(true)
            setActiveTab("simulation")
          }}
        >
          {t("ui.app.simulation")}
        </Tab>
        <Tab active={activeTab === "skills"} modified={skillEditorModified} onClick={() => setActiveTab("skills")}>
          {t("ui.app.skillEditor")}
        </Tab>
        <Tab active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
          {t("ui.app.settings")}
        </Tab>
      </nav>
      {activeTab === "main" ? (
        <StatsTab
          character={character}
          pathId={pathId}
          statOverrides={statOverrides}
          attunementOverrides={attunementOverrides}
          characterProfiles={characterProfiles}
          buildSetupOverrides={buildSetupOverrides}
          onStatChange={updateStatOverride}
          onStatReset={resetStatOverride}
          onAttunementChange={updateAttunementOverride}
          onAttunementReset={resetAttunementOverride}
          onApplyCharacterProfile={applyCharacterProfile}
          onCharacterProfilesChange={setCharacterProfiles}
          onBreakthroughChange={breakthrough => setSettings(current => ({ ...current, breakthrough }))}
          onBuildSetupChange={updateBuildSetupOverride}
          onBuildSetupReset={resetBuildSetupOverride}
          rotationMetrics={rotationMetrics}
          graduationDps={activeSimulation?.graduationDps}
          activeBuildName={activeBuildDisplayName}
          activeRotationName={activeRotationDisplayName}
          onInnerWayChange={() => setInnerWayRevision(current => current + 1)}
          onSetupSelectionChange={(key, value) => setSetupSelections(current => ({ ...current, [key]: value }))}
        />
      ) : activeTab === "build" ? (
        <FeatureLoadBoundary>
          <Suspense fallback={tabSuspenseFallback}>
            <div className="viewport-tab-content">
              <BuildTab
                weapons={settings.weapons}
                martialArtTags={buildTabMartialArtTags}
                pathTag={pathId === "mixed" ? undefined : typedPathDefinitions[pathId].tag}
                buildGroup={typedPathDefinitions[pathId].buildGroup}
                graduatedBuildIds={typedPathDefinitions[pathId].graduated}
                devMode={devMode}
                activeBuildDps={rotationMetrics?.dps}
                buildState={effectiveBuildState}
                onBuildStateChange={setBuildState}
                onActiveBuildChange={activateBuildForPath}
                onSelectBuildWeapons={selectBuildWeapons}
              />
            </div>
          </Suspense>
        </FeatureLoadBoundary>
      ) : activeTab === "breakdown" ? (
        <BreakdownTab metrics={rotationMetrics} pathId={pathId} />
      ) : activeTab === "skills" ? (
        <SkillEditorTab
          weapons={settings.weapons}
          overrides={skillOverrides}
          onOverridesChange={updateSkillOverrides}
        />
      ) : activeTab === "settings" ? (
        <SettingsTab
          settings={settings}
          pathId={pathId}
          devMode={devMode}
          layoutMode={layoutMode}
          onSettingsChange={setSettings}
          onLayoutChange={changeLayoutPreview}
        />
      ) : null}
      <div className={`viewport-tab-content ${activeTab === "rotations" ? "" : "tab-hidden"}`}>
        <RotationEditorTab
          key={pathId}
          character={character}
          pathId={pathId}
          devMode={devMode}
          defaultRotationId={defaultRotationIdForPath(pathId)}
          selectedRotationId={selectedRotationId}
          calculationCache={rotationCalculationCache}
          skillOverrides={skillOverrides}
          onSelectRotationWeapons={selectBuildWeapons}
          onActiveRotationChange={activateRotationForPath}
          onMetricsChange={handleRotationMetrics}
          onActiveSimulationBundleChange={handleActiveSimulationBundle}
          onGraduationDpsChange={handleGraduationDps}
        />
      </div>
      {simulationMounted && (
        <div className={activeTab === "simulation" ? "" : "tab-hidden"}>
          <FeatureLoadBoundary>
            <Suspense fallback={null}>
              <SimulationTab
                bundle={activeSimulation?.bundle}
                bundleKey={activeSimulation?.bundleKey}
                rotationName={activeSimulation ? activeRotationDisplayName : undefined}
                buildName={activeBuildDisplayName}
              />
            </Suspense>
          </FeatureLoadBoundary>
        </div>
      )}
      <footer className="page-footer">
        <span>{t("ui.app.authorGreydustWwmIgnGreydustDiscord")}</span>
        <span className="page-footer-accuracy">
          {t("ui.app.accuracyMatters")}{" "}
          <a href="https://github.com/greydust/where-builds-meet/issues" target="_blank" rel="noreferrer">
            {t("ui.app.reportAnyDamageDiscrepancy")}
          </a>
        </span>
      </footer>
    </main>
  )
}
