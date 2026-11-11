import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react"

import type { CalculatorSettings, DisplaySizing, LayoutMode, PathId } from "@/application/contracts"
import { martialArtDefinitions, weaponFamilyNames } from "@/application/gameData/martialArts"
import { productionWeaponIds, typedPathDefinitions } from "@/application/gameData/paths"
import { previewCatalog, type PreviewId } from "@/application/gameData/previews"
import type { ScopeTarget } from "@/application/gearScope"
import { gameText, t } from "@/i18n"
import { useGearStore } from "@/stores/gearStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { type WeaponId } from "@/types"
import { Button } from "@/ui/Button"
import { Dialog } from "@/ui/Dialog"
import { NumberInput } from "@/ui/NumberInput"
import { Panel } from "@/ui/Panel"
import { Toggle } from "@/ui/Toggle"

/**
 * One of the two settings a path can stop sharing.
 *
 * Turning it off is a question rather than a write, because the records that belong to no path
 * have to be told where to go, and the answer is the user's. The count is read here to decide
 * whether to ask at all, and read again inside `unshareGear` to do the work; both go through
 * the same rule, so they cannot disagree about what was asked.
 */
function ShareToggle({ target, pathId, children }: { target: ScopeTarget; pathId: PathId; children: ReactNode }) {
  const shared = useGearStore(state =>
    target === "inventory" ? state.scope.sharedInventory : state.scope.sharedBuilds,
  )
  const shareGear = useGearStore(state => state.shareGear)
  const unshareGear = useGearStore(state => state.unshareGear)
  const unplacedCount = useGearStore(state => state.unplacedCount)
  const [asking, setAsking] = useState(false)

  function change(next: boolean) {
    if (next) {
      shareGear(target)
      return
    }
    if (unplacedCount(target) === 0) {
      unshareGear(target, { target: "path", pathId })
      return
    }
    setAsking(true)
  }

  function answer(placement: "all" | "path") {
    unshareGear(target, { target: placement, pathId })
    setAsking(false)
  }

  const pathName = gameText(typedPathDefinitions[pathId].name)

  return (
    <>
      <label className="settings-share">
        <Toggle checked={shared} onChange={event => change(event.target.checked)} />
        <span>{children}</span>
      </label>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        className="settings-share-dialog"
        label={questionTitle(target)}
      >
        <h2>{questionTitle(target)}</h2>
        <p>{questionBody(target, unplacedCount(target), pathName)}</p>
        <div className="settings-share-actions">
          <Button variant="secondary" onClick={() => setAsking(false)}>
            {t("ui.app.close")}
          </Button>
          {/* The two answers travel together, so a narrow dialog or a long path name wraps them
              as a pair rather than stranding the one that loses nothing on a line of its own. */}
          <div className="settings-share-answers">
            <Button variant="secondary" onClick={() => answer("path")}>
              {t("ui.app.addToThisPathOnly", { path: pathName })}
            </Button>
            {/* Primary, because it is the answer that loses nothing: the other choice leaves the
                remaining paths without these records, which is what the question is deciding. */}
            <Button variant="primary" onClick={() => answer("all")}>
              {t("ui.app.addToAllPaths")}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function questionTitle(target: ScopeTarget) {
  switch (target) {
    case "inventory":
      return t("ui.app.stopSharingInventory")
    case "builds":
      return t("ui.app.stopSharingBuilds")
  }
}

function questionBody(target: ScopeTarget, count: number, path: string) {
  switch (target) {
    case "inventory":
      return t("ui.app.unplacedInventory", { count, path })
    case "builds":
      return t("ui.app.unplacedBuilds", { count, path })
  }
}

export function SettingsTab({
  settings,
  pathId,
  devMode,
  layoutMode,
  previewId,
  onSettingsChange,
  onLayoutChange,
  onPreviewChange,
}: {
  settings: CalculatorSettings
  pathId: PathId
  devMode: boolean
  layoutMode: LayoutMode
  previewId: PreviewId | null
  onSettingsChange: Dispatch<SetStateAction<CalculatorSettings>>
  onLayoutChange: (layout: LayoutMode) => void
  onPreviewChange: (preview: PreviewId | null) => void
}) {
  const gearSearchMinutes = useSettingsStore(state => state.gearSearchMinutes)
  const setGearSearchMinutes = useSettingsStore(state => state.setGearSearchMinutes)
  const displaySizing = useSettingsStore(state => state.displaySizing)
  const setDisplaySizing = useSettingsStore(state => state.setDisplaySizing)
  const weaponsLocked = Boolean(typedPathDefinitions[pathId].lockedWeapons)

  return (
    <Panel className="settings-panel">
      <div className="settings-fields">
        <div className="settings-weapon-row">
          {settings.weapons.map((weapon, index) => (
            <label className="editor-field" key={index}>
              <span>{index === 0 ? t("system.gearSlot.leftWeapon") : t("system.gearSlot.rightWeapon")}</span>
              <select
                value={weapon}
                disabled={weaponsLocked}
                onChange={event =>
                  onSettingsChange(current => {
                    const nextWeapon = event.target.value as WeaponId
                    const otherWeapon = current.weapons[index === 0 ? 1 : 0]
                    if (pathId === "mixed" && nextWeapon === otherWeapon) return current
                    const weapons: [WeaponId, WeaponId] = [...current.weapons] as [WeaponId, WeaponId]
                    weapons[index] = nextWeapon
                    return { ...current, weapons }
                  })
                }
              >
                {Object.entries(martialArtDefinitions)
                  .filter(([value]) => devMode || productionWeaponIds.has(value as WeaponId))
                  .map(([value, definition]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={pathId === "mixed" && value === settings.weapons[index === 0 ? 1 : 0]}
                    >
                      {gameText(definition.name)} ({gameText(weaponFamilyNames[definition.weapon])})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <label className="editor-field ping-field settings-number-field">
          <span>{t("ui.app.ping")}</span>
          <NumberInput
            value={settings.ping}
            min={0}
            max={999}
            step={1}
            inputMode="numeric"
            onCommit={ping => onSettingsChange(current => ({ ...current, ping: ping ?? 0 }))}
          />
        </label>
        <label className="editor-field settings-number-field">
          <span>{t("ui.app.gearSearchMinutes")}</span>
          <NumberInput
            value={gearSearchMinutes}
            min={0}
            step={1}
            onCommit={minutes => setGearSearchMinutes(minutes ?? 2)}
          />
        </label>
        <div className="settings-share-row">
          <ShareToggle target="inventory" pathId={pathId}>
            {t("ui.app.shareInventory")}
          </ShareToggle>
          <ShareToggle target="builds" pathId={pathId}>
            {t("ui.app.shareBuilds")}
          </ShareToggle>
        </div>
        <div className="settings-layout-row">
          <label className="editor-field">
            <span>{t("ui.app.preview")}</span>
            <select value={previewId ?? ""} onChange={event => onPreviewChange(event.target.value || null)}>
              <option value="">{t("ui.app.previewCurrent")}</option>
              {previewCatalog.map(preview => (
                <option key={preview.id} value={preview.id}>
                  {preview.name.replace(/^CN /, `${t("ui.app.chinaServer")} `)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-layout-row settings-display-row">
          <label className="editor-field">
            <span>{t("ui.app.layout")}</span>
            <select
              value={layoutMode}
              disabled={!devMode}
              onChange={event => onLayoutChange(event.target.value as LayoutMode)}
            >
              <option value="pc">{t("ui.app.pc")}</option>
              <option value="mobile">{t("ui.app.mobile")}</option>
            </select>
          </label>
          {layoutMode === "pc" && (
            <label className="editor-field">
              <span>{t("ui.app.displaySizing")}</span>
              <select value={displaySizing} onChange={event => setDisplaySizing(event.target.value as DisplaySizing)}>
                <option value="default">{t("ui.app.defaultSizing")}</option>
                <option value="screen">{t("ui.app.fitToScreen")}</option>
                <option value="window">{t("ui.app.fitToWindow")}</option>
              </select>
            </label>
          )}
        </div>
      </div>
    </Panel>
  )
}
