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
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { defineNSEAppearance, type NSEAppearanceDefinition } from "./NSEAppearanceDefinition";
import { projectNSEAppearance, projectNSEAppearanceSlot } from "./appearanceProjection";
import type {
  NSEAppearanceServicePort,
  NSEChromeAppearance,
  NSEColourScheme,
  NSEContrast,
  NSEResolvedAppearance,
  NSEResolvedColourScheme,
  NSETransparency,
} from "./nseAppearanceTypes";
import "./nse-appearance.css";

const defaultAppearance = defineNSEAppearance({
  id: "default",
  displayName: "NSE",
});

const defaultResolvedAppearance: NSEResolvedAppearance = Object.freeze({
  appearance: defaultAppearance,
  chrome: "standard",
  requestedColourScheme: "auto",
  resolvedColourScheme: "light",
  contrast: "normal",
  transparency: "normal",
});

const NSEAppearanceContext = createContext<NSEResolvedAppearance>(defaultResolvedAppearance);
const emptySubscribe = () => () => undefined;

export interface NSEAppearanceProviderProps extends PropsWithChildren {
  readonly appearance: NSEAppearanceDefinition;
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
  appearance,
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
    appearance,
    chrome: chrome ?? inherited.chrome,
    requestedColourScheme: requestedScheme,
    resolvedColourScheme: resolvedScheme,
    contrast: contrast ?? inherited.contrast,
    transparency: transparency ?? inherited.transparency,
  }), [
    appearance,
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

  const contextualChildren = (
    <NSEAppearanceContext.Provider value={value}>
      {children}
    </NSEAppearanceContext.Provider>
  );
  if (!projectBoundary) return contextualChildren;
  return (
    <NSEAppearanceContext.Provider value={value}>
      <div className="nse-appearance-provider" {...projection}>
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

/** Resolves one semantic control part without assigning presentation state ownership. */
export function useNSEAppearanceSlot(slot: string) {
  const appearance = useNSEAppearance();
  return useMemo(() => projectNSEAppearanceSlot(slot, appearance), [appearance, slot]);
}
