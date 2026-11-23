import globalBuffOptions from "@gamedata/global-buff-options.json"
import { Fragment, useMemo, type ComponentProps } from "react"

import { dataText } from "@/i18n"
import { ButtonGroupOption } from "@/ui/ButtonGroup"
import { Tooltip } from "@/ui/Tooltip"

const globalBuffTriggerStyle = { display: "grid", minWidth: 0 }

function GlobalBuffDescription({ description }: { description: string }) {
  return (
    <>
      {description.split("\n\n").map((paragraph, index) => (
        <Fragment key={paragraph}>
          {index > 0 ? (
            <>
              <br />
              <br />
            </>
          ) : null}
          <span>{paragraph}</span>
        </Fragment>
      ))}
    </>
  )
}

export function GlobalBuffOption({
  buff,
  value,
  ...props
}: ComponentProps<typeof ButtonGroupOption> & { buff: keyof typeof globalBuffOptions; value: string }) {
  const options = globalBuffOptions[buff] as Record<string, { description: string }>
  const description = options[value]?.description
  const text = description
    ? dataText(`data.globalBuffOptions.${buff}.${value.replace(".", "")}.description`, description)
    : dataText(
        "ui.app.globalBuffDisabled",
        "Does not add an external buff or debuff. Effects applied by the rotation still work.",
      )
  const content = useMemo(() => <GlobalBuffDescription description={text} />, [text])
  return (
    <Tooltip style={globalBuffTriggerStyle} content={content}>
      <ButtonGroupOption {...props} />
    </Tooltip>
  )
}
