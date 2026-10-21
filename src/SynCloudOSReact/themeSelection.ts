import { defineNSETheme, neutralNSETheme, type NSEThemeDefinition } from "../NSE/Appearance/NSEThemeDefinition";
/** Resolve once at host creation; selection never becomes an application service. */
export function resolveNSEHostTheme(selection: NSEThemeDefinition | string | undefined, catalogue: readonly NSEThemeDefinition[] = []): NSEThemeDefinition {
  const themes = new Map<string, NSEThemeDefinition>();
  for (const entry of catalogue) { const theme = defineNSETheme(entry); if (themes.has(theme.id)) throw new TypeError(`Duplicate theme identifier: ${theme.id}`); themes.set(theme.id, theme); }
  if (typeof selection === "string") { const theme = themes.get(selection); if (!theme) throw new TypeError(`Unknown theme identifier: ${selection}`); return theme; }
  return selection === undefined ? neutralNSETheme : defineNSETheme(selection);
}
