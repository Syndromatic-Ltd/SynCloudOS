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

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { freezeNSETheme, type NSETheme } from "../Theme/NSETheme";
import { installNSEHookMirror } from "../Theme/contract/hookMirrorDOM";
import { atmoTheme } from "./atmoTheme";
import { projectNSEAppearance } from "./appearanceProjection";
import type {
  NSEAppearanceServicePort,
  NSEChromeAppearance,
  NSEColourScheme,
  NSEContrast,
  NSEResolvedAppearance,
  NSEResolvedColourScheme,
  NSETransparency,
} from "./nseAppearanceTypes";
import "../Structure/layers.css";
import "../Structure/defaults.css";
import "./atmo-theme.css";
import "./nse-appearance.css";


const defaultResolvedAppearance: NSEResolvedAppearance = Object.freeze({
  theme: atmoTheme,
  chrome: "standard",
  requestedColourScheme: "auto",
  resolvedColourScheme: "light",
  contrast: "normal",
  transparency: "normal",
});

const NSEAppearanceContext = createContext<NSEResolvedAppearance>(defaultResolvedAppearance);
const emptySubscribe = () => () => undefined;

export interface NSEAppearanceProviderProps extends PropsWithChildren {
  readonly theme: NSETheme;
  readonly chrome?: NSEChromeAppearance;
  readonly colourScheme?: NSEColourScheme;
  readonly resolvedColourScheme?: NSEResolvedColourScheme;
  readonly contrast?: NSEContrast;
  readonly transparency?: NSETransparency;
  readonly appearanceService?: NSEAppearanceServicePort;
  /** Internal host integration: provide context while an existing root owns projection. */
  readonly projectBoundary?: boolean;
}

export function NSEAppearanceProvider({
  theme,
  chrome,
  colourScheme,
  resolvedColourScheme,
  contrast,
  transparency,
  appearanceService,
  projectBoundary = true,
  children,
}: NSEAppearanceProviderProps) {
  const inherited = useContext(NSEAppearanceContext);
  const frozenTheme = useMemo(() => freezeNSETheme(theme), [theme]);
  const subscribe = useCallback(
    (listener: () => void) => appearanceService?.subscribe(listener) ?? emptySubscribe(),
    [appearanceService],
  );
  const requestedSnapshot = useCallback(
    () => appearanceService?.get() ?? inherited.requestedColourScheme,
    [appearanceService, inherited.requestedColourScheme],
  );
  const resolvedSnapshot = useCallback(
    () => appearanceService?.resolved() ?? inherited.resolvedColourScheme,
    [appearanceService, inherited.resolvedColourScheme],
  );
  const serviceRequested = useSyncExternalStore(subscribe, requestedSnapshot, requestedSnapshot);
  const serviceResolved = useSyncExternalStore(subscribe, resolvedSnapshot, resolvedSnapshot);

  const requestedScheme = colourScheme ?? (appearanceService ? serviceRequested : inherited.requestedColourScheme);
  const resolvedScheme = requestedScheme === "auto"
    ? (resolvedColourScheme ?? (appearanceService ? serviceResolved : inherited.resolvedColourScheme))
    : requestedScheme;
  const value = useMemo<NSEResolvedAppearance>(() => Object.freeze({
    theme: frozenTheme,
    chrome: chrome ?? inherited.chrome,
    requestedColourScheme: requestedScheme,
    resolvedColourScheme: resolvedScheme,
    contrast: contrast ?? inherited.contrast,
    transparency: transparency ?? inherited.transparency,
  }), [
    frozenTheme,
    chrome,
    contrast,
    inherited.chrome,
    inherited.contrast,
    inherited.transparency,
    requestedScheme,
    resolvedScheme,
    transparency,
  ]);
  const projection = useMemo(() => projectNSEAppearance(value), [value]);
  // Hooks the JSX runtime did not write (imperative DOM, unbundled apps) still get their mirror classes.
  useLayoutEffect(() => typeof document === "undefined" ? undefined : installNSEHookMirror(document), []);

  const contextualChildren = (
    <NSEAppearanceContext.Provider value={value}>
      {children}
    </NSEAppearanceContext.Provider>
  );
  if (!projectBoundary) return contextualChildren;
  return (
    <NSEAppearanceContext.Provider value={value}>
      <div className="nse-appearance-provider" {...projection} data-nse-role="appearance-provider">
        {children}
      </div>
    </NSEAppearanceContext.Provider>
  );
}

export function useNSEAppearance(): NSEResolvedAppearance {
  return useContext(NSEAppearanceContext);
}

export function useNSEAppearanceProjection() {
  const appearance = useNSEAppearance();
  return useMemo(() => projectNSEAppearance(appearance), [appearance]);
}
