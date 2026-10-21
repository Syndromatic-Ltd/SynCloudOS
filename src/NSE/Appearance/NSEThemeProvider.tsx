/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type PropsWithChildren } from "react";
import { neutralNSETheme, type NSEThemeDefinition } from "./NSEThemeDefinition";
import { projectNSETheme, projectNSEThemeRecipe } from "./themeProjection";
import { createBrowserAppearanceQuery } from "./browserAppearance";
import type { NSEAppearance, NSEResolvedAppearance, NSEAppearanceState, NSEAppearanceServicePort, NSEChromeAppearance, NSEContrast, NSETransparency, NSEVisualEnvironment } from "./nseAppearanceTypes";
import "./nse-appearance.css";
export { neutralNSETheme } from "./NSEThemeDefinition";
const defaultEnvironment: NSEVisualEnvironment = Object.freeze({ theme: neutralNSETheme, requestedAppearance: "auto", resolvedAppearance: "light", chrome: "standard", contrast: "normal", transparency: "normal" });
const ThemeContext = createContext<NSEVisualEnvironment>(defaultEnvironment);
const emptySubscribe = () => () => undefined;
export interface NSEThemeProviderProps extends PropsWithChildren {
  readonly theme: NSEThemeDefinition; readonly appearance?: NSEAppearance; readonly resolvedAppearance?: NSEResolvedAppearance;
  readonly chrome?: NSEChromeAppearance; readonly contrast?: NSEContrast; readonly transparency?: NSETransparency;
  readonly appearanceService?: NSEAppearanceServicePort;
  /** Host integration: an existing root owns projection. */
  readonly projectBoundary?: boolean;
}
export function NSEThemeProvider({ theme, appearance, resolvedAppearance, chrome, contrast, transparency, appearanceService, projectBoundary = true, children }: NSEThemeProviderProps) {
  const inherited = useContext(ThemeContext);
  const subscribe = useCallback((listener: () => void) => appearanceService?.subscribe(listener) ?? emptySubscribe(), [appearanceService]);
  const requestedSnapshot = useCallback(() => appearanceService?.get() ?? inherited.requestedAppearance, [appearanceService, inherited.requestedAppearance]);
  const resolvedSnapshot = useCallback(() => appearanceService?.resolved() ?? inherited.resolvedAppearance, [appearanceService, inherited.resolvedAppearance]);
  const serviceRequested = useSyncExternalStore(subscribe, requestedSnapshot, requestedSnapshot);
  const serviceResolved = useSyncExternalStore(subscribe, resolvedSnapshot, resolvedSnapshot);
  const requested = appearance ?? (appearanceService ? serviceRequested : inherited.requestedAppearance);
  const useSystem = inherited === defaultEnvironment && !appearanceService && resolvedAppearance === undefined && requested === "auto";
  const query = useMemo(() => useSystem ? createBrowserAppearanceQuery() : null, [useSystem]);
  const subscribeSystem = useCallback((listener: () => void) => {
    if (!query) return emptySubscribe();
    if (typeof query.addEventListener === "function") { query.addEventListener("change", listener); return () => query.removeEventListener("change", listener); }
    query.addListener(listener); return () => query.removeListener(listener);
  }, [query]);
  const systemSnapshot = useCallback<() => NSEResolvedAppearance>(() => query?.matches ? "dark" : "light", [query]);
  const systemResolved = useSyncExternalStore(subscribeSystem, systemSnapshot, () => "light" as const);
  const resolved = requested === "auto" ? resolvedAppearance ?? (appearanceService ? serviceResolved : useSystem ? systemResolved : inherited.resolvedAppearance) : requested;
  const value = useMemo<NSEVisualEnvironment>(() => Object.freeze({
    theme, requestedAppearance: requested, resolvedAppearance: resolved,
    chrome: chrome ?? inherited.chrome, contrast: contrast ?? inherited.contrast, transparency: transparency ?? inherited.transparency,
    inheritedThemeTokenNames: Object.freeze([...new Set([
      ...(inherited.inheritedThemeTokenNames ?? []), ...inherited.theme.styleTokenNames,
      ...Object.keys(inherited.theme.tokens.common ?? {}), ...Object.keys(inherited.theme.tokens.light), ...Object.keys(inherited.theme.tokens.dark),
    ])]),
  }), [theme, requested, resolved, chrome, contrast, transparency, inherited]);
  const projection = useMemo(() => projectNSETheme(value), [value]);
  return <ThemeContext.Provider value={value}>{projectBoundary ? <div className="nse-theme-provider" {...projection}>{children}</div> : children}</ThemeContext.Provider>;
}
export function useNSEVisualEnvironment(): NSEVisualEnvironment { return useContext(ThemeContext); }
export function useNSETheme(): NSEThemeDefinition { return useNSEVisualEnvironment().theme; }
export function useNSEAppearance(): NSEAppearanceState {
  const { requestedAppearance: requested, resolvedAppearance: resolved } = useNSEVisualEnvironment();
  return useMemo(() => Object.freeze({ requested, resolved }), [requested, resolved]);
}
export function useNSEThemeProjection() { const environment = useNSEVisualEnvironment(); return useMemo(() => projectNSETheme(environment), [environment]); }
export function useNSEThemeRecipe(slot: string) { const environment = useNSEVisualEnvironment(); return useMemo(() => projectNSEThemeRecipe(slot, environment), [environment, slot]); }
