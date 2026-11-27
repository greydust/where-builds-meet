import type { PathId } from "@/application/contracts"
import { innerWayGroupsFor, typedPathDefinitions } from "@/application/gameData/paths"
import { dataText, t } from "@/i18n"

export function InnerWayOptions({
  pathId,
  selections,
  index,
}: {
  pathId: PathId
  selections: readonly { innerWay: string }[]
  index: number
}) {
  const groups = innerWayGroupsFor(typedPathDefinitions[pathId])
  const labels = {
    curated: t("ui.innerWayPicker.curated"),
    experimental: t("ui.innerWayPicker.experimental"),
    others: t("ui.innerWayPicker.others"),
    passiveOnly: t("ui.innerWayPicker.passiveOnly"),
  }
  const selectedElsewhere = new Set(selections.filter((_, slot) => slot !== index).map(row => row.innerWay))
  return Object.entries(groups).map(([group, options]) => (
    <optgroup key={group} label={labels[group as keyof typeof labels]}>
      {options.map(([id, definition]) => (
        <option key={id} value={id} disabled={selectedElsewhere.has(id)}>
          {dataText(`system.innerWay.${id.charAt(0).toLowerCase()}${id.slice(1)}`, definition.name)}
        </option>
      ))}
    </optgroup>
  ))
}
