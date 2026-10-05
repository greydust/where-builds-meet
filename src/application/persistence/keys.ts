export const localeStorageKey = "wwm-locale"
export const developmentModeStorageKey = "wwm-dev-mode-v1"
export const characterStatsStorageKey = "wwm-character-stats-v3"
export const legacyCharacterStatsStorageKey = "wwm-character-stats-v2"
export const statOverrideStorageKey = "wwm-stat-overrides-v1"
export const skillStorageKey = "wwm-skill-editor-session-v1"
export const layoutPreviewStorageKey = "wwm-layout-preview-session-v1"
export const legacyInnerWayStorageKey = "wwm-inner-way-session-v1"
export const attunementStorageKey = "wwm-attunement-session-v2"
export const legacyAttunementStorageKey = "wwm-attunement-session-v1"
export const attunementOverrideStorageKey = "wwm-attunement-overrides-v1"
export const settingsStorageKey = "wwm-settings-session-v1"
export const arsenalStorageKey = "wwm-arsenal-session-v1"
export const bowRingSetStorageKey = "wwm-bow-ring-set-session-v1"
export const gearSetStorageKey = "wwm-gear-set-session-v1"
export const enduranceFoodStorageKey = "wwm-endurance-food-session-v1"
export const foodStorageKey = "wwm-food-session-v1"
export const divinecraftStorageKey = "wwm-divinecraft-session-v1"
export const scriptStorageKey = "wwm-script-session-v1"
export const pathStorageKey = "wwm-path-session-v1"
export const buildSetupOverrideStorageKey = "wwm-build-setup-overrides-v1"
export const rotationStorageKey = "wwm-rotation-editor-session-v2"
export const rotationListStorageKey = "wwm-rotation-list-session-v1"
export const activeRotationStorageKey = "wwm-active-rotation-session-v1"
export const activeRotationByPathStorageKey = "wwm-active-rotation-by-path-v1"
export const activeBuildByPathStorageKey = "wwm-active-build-by-path-v1"
export const legacyGearStorageKey = "wwm-gear-inventory-v1"
export const buildListStorageKey = "wwm-build-list-v1"
export const gearScopeStorageKey = "wwm-gear-scope-v1"
export const activeBuildStorageKey = "wwm-active-build-v1"
export const characterProfileStorageKey = "wwm-character-profiles-v1"
export const globalDebuffStorageKey = "wwm-global-debuffs-session-v1"
export const customPercentileStorageKey = "wwm-simulation-percentiles-v1"
export const previewSelectionStorageKey = "wwm-preview-selection-v1"

export const applicationStorageKeys = new Set([
  localeStorageKey,
  developmentModeStorageKey,
  characterStatsStorageKey,
  legacyCharacterStatsStorageKey,
  statOverrideStorageKey,
  skillStorageKey,
  layoutPreviewStorageKey,
  legacyInnerWayStorageKey,
  attunementStorageKey,
  legacyAttunementStorageKey,
  attunementOverrideStorageKey,
  settingsStorageKey,
  arsenalStorageKey,
  bowRingSetStorageKey,
  gearSetStorageKey,
  foodStorageKey,
  enduranceFoodStorageKey,
  divinecraftStorageKey,
  scriptStorageKey,
  pathStorageKey,
  buildSetupOverrideStorageKey,
  rotationStorageKey,
  rotationListStorageKey,
  activeRotationStorageKey,
  activeRotationByPathStorageKey,
  activeBuildByPathStorageKey,
  legacyGearStorageKey,
  buildListStorageKey,
  gearScopeStorageKey,
  activeBuildStorageKey,
  characterProfileStorageKey,
  globalDebuffStorageKey,
  customPercentileStorageKey,
  previewSelectionStorageKey,
])

export function isApplicationStorageKey(key: string) {
  return applicationStorageKeys.has(key)
}
