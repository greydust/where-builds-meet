import delugeIcon from "../../assets/path-icons/deluge.png?w=56&h=56&format=webp"
import draughtIcon from "../../assets/path-icons/draught.png?w=56&h=56&format=webp"
import dustIcon from "../../assets/path-icons/dust.png?w=56&h=56&format=webp"
import jadeIcon from "../../assets/path-icons/jade.png?w=56&h=56&format=webp"
import kiteIcon from "../../assets/path-icons/kite.png?w=56&h=56&format=webp"
import mightIcon from "../../assets/path-icons/might.png?w=56&h=56&format=webp"
import splendorIcon from "../../assets/path-icons/splendor.png?w=56&h=56&format=webp"
import strengthIcon from "../../assets/path-icons/strength.png?w=56&h=56&format=webp"
import umbraIcon from "../../assets/path-icons/umbra.png?w=56&h=56&format=webp"
import windIcon from "../../assets/path-icons/wind.png?w=56&h=56&format=webp"
import type { PathId } from "../contracts"

/**
 * Combat-path selector icon for every path, keyed by `PathId` so the render
 * pass looks a path up the same way it iterates `typedPathDefinitions`.
 * `null` marks a path that has no icon. Adding a `PathId` forces a decision
 * here rather than silently rendering a broken image.
 *
 * Kept out of `gameData/paths.ts` so data accessors stay free of the bundler's
 * image pipeline; only the UI that renders icons imports this.
 */
export const pathIcons: Record<PathId, string | null> = {
  mixed: null,
  bellstrikeSplendor: splendorIcon,
  bellstrikeUmbra: umbraIcon,
  stonesplitMight: mightIcon,
  stonesplitStrength: strengthIcon,
  silkbindJade: jadeIcon,
  silkbindDeluge: delugeIcon,
  bamboocutWind: windIcon,
  bamboocutKite: kiteIcon,
  bamboocutDust: dustIcon,
  bamboocutDraught: draughtIcon,
}
