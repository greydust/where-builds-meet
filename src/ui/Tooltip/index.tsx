import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import styles from "./style.module.css"

type TooltipProps = Omit<HTMLAttributes<HTMLSpanElement>, "content"> & {
  content: ReactNode
  /** Optional layout for a trigger larger than an inline icon. */
  triggerClassName?: string
  /** Above-placement alignment of the floating box. Structural, not a theme. */
  align?: "start" | "end"
}

const gap = 8
const edgeMargin = 8

type Placement = { top: number; left: number }

/**
 * Where the floating box goes, given the trigger's box and the floating box's own size.
 *
 * It prefers above the trigger and falls below it when there is no room, and it keeps itself
 * inside the viewport horizontally, because a tooltip running off the edge has told the reader
 * nothing. `position: fixed` is deliberate: the box is placed against the trigger's viewport
 * rectangle, so a scrolling ancestor does not drag it away from the thing it describes.
 */
function place(trigger: DOMRect, align: "start" | "end", size: { width: number; height: number }): Placement {
  const above = trigger.top >= size.height + gap + edgeMargin
  const preferredTop = above ? trigger.top - size.height - gap : trigger.bottom + gap
  const top = Math.max(edgeMargin, Math.min(preferredTop, window.innerHeight - size.height - edgeMargin))
  const preferred = align === "start" ? trigger.left : trigger.right - size.width
  const furthest = Math.max(edgeMargin, window.innerWidth - size.width - edgeMargin)
  return { top, left: Math.min(Math.max(edgeMargin, preferred), furthest) }
}

/**
 * Keeps a portalled box over its trigger while it is open.
 *
 * The position is measured before paint, so the box is never painted somewhere it is not going
 * to stay, and it is measured again whenever the page moves under it.
 */
function usePlacement(open: boolean, align: "start" | "end") {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const boxRef = useRef<HTMLSpanElement>(null)
  const [placement, setPlacement] = useState<Placement>()

  const reposition = useCallback(() => {
    const anchor = anchorRef.current
    const box = boxRef.current
    if (!anchor || !box) return
    setPlacement(place(anchor.getBoundingClientRect(), align, box.getBoundingClientRect()))
  }, [align])

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    window.addEventListener("scroll", reposition, { capture: true, passive: true })
    window.addEventListener("resize", reposition)
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true })
      window.removeEventListener("resize", reposition)
    }
  }, [open, reposition])

  return { anchorRef, boxRef, placement }
}

/**
 * Hover and focus tooltip whose floating box is portalled out of the trigger's own tree.
 *
 * Almost every trigger here lives inside a scrolling or clipped region — a build editor, a
 * rotation table, a panel that scrolls on one axis — and a floating box inside that region is
 * either cut off at its edge or escapes over whatever follows it. Portalling is what makes it
 * belong to the trigger rather than to the box the trigger happens to be in.
 *
 * The anchor is a real box rather than a `display: contents` one, because a box that generates
 * nothing has no rectangle to measure and no pointer events of its own to hang the reveal on.
 * It is inline-flex, so it hugs its trigger and adds nothing to the row it sits in.
 */
function containsTarget(container: HTMLElement | null, target: EventTarget | null, other?: HTMLElement | null) {
  return target instanceof Node && (container?.contains(target) === true || other?.contains(target) === true)
}

export function Tooltip({ content, align = "start", className, triggerClassName, children, ...rest }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const { anchorRef, boxRef, placement } = usePlacement(open, align)
  // Measured before paint, so the first frame is already in the right place. Until it is, the
  // box is rendered but invisible rather than absent, because measuring it requires it to exist.
  const style = useMemo<CSSProperties>(
    () => (placement ? { top: placement.top, left: placement.left } : { visibility: "hidden" }),
    [placement],
  )
  const close = () => setOpen(false)
  const boxClassName = `${styles.tooltip}${align === "end" ? ` ${styles.alignEnd}` : ""}${
    className ? ` ${className}` : ""
  }`

  return (
    <span
      {...rest}
      ref={anchorRef}
      className={`${styles.anchor}${triggerClassName ? ` ${triggerClassName}` : ""}`}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={event => {
        if (!containsTarget(boxRef.current, event.relatedTarget)) close()
      }}
      onFocus={() => setOpen(true)}
      onBlur={event => {
        // Focus moving between the trigger's own parts is not the trigger losing focus.
        if (!containsTarget(event.currentTarget, event.relatedTarget, boxRef.current)) close()
      }}
    >
      {children}
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={boxRef}
              role="tooltip"
              className={boxClassName}
              style={style}
              onPointerLeave={event => {
                if (!containsTarget(anchorRef.current, event.relatedTarget)) close()
              }}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
