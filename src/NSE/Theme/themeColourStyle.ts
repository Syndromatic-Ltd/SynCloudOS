/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { CSSProperties } from "react";
import type { NSETheme } from "./NSETheme";
import { nseThemeColourNames, nseThemeColourProperties } from "./contract/colours";
export function nseThemeColourStyle(theme: NSETheme, scheme: "light" | "dark", contrast: string): CSSProperties {
  const palette = theme.colours[scheme];
  const high = contrast === "high" ? theme.colours[scheme === "light" ? "highContrastLight" : "highContrastDark"] : undefined;
  return Object.freeze(Object.fromEntries(nseThemeColourNames.map(name => [nseThemeColourProperties[name], high?.[name] ?? palette[name]]))) as CSSProperties;
}
