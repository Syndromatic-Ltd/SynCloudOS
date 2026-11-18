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
import type { NSEAppearance } from "./NSEAppearance";
import { atmoTheme } from "./atmoTheme";
import { projectNSEAppearance } from "./appearanceProjection";
import type {
  EffectiveAppearance,
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

const NSEAppearanceContext = createContext<EffectiveAppearance>(defaultResolvedAppearance);
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
  const value = useMemo<EffectiveAppearance>(() => Object.freeze({
    ...(inherited.isSystemSurface && { isSystemSurface: true as const }),
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
    inherited.isSystemSurface,
    requestedScheme,
    resolvedScheme,
    transparency,
  ]);
  return <AppearanceBoundary value={value} projectBoundary={projectBoundary}>{children}</AppearanceBoundary>;
}

/** Resolve a view or window appearance against the surrounding system appearance. */
export function ViewAppearanceBoundary({ appearance, children, projectBoundary = true }: PropsWithChildren<{
  readonly appearance: NSEAppearance | null;
  readonly projectBoundary?: boolean;
}>) {
  const inherited = useContext(NSEAppearanceContext);
  const { theme: selected, name, chrome, contrast, transparency } = appearance ?? {};
  const hasAppearance = appearance !== null;
  const value = useMemo<EffectiveAppearance>(() => {
    if (!hasAppearance) return inherited;
    const appTheme = selected && "kind" in selected ? selected : undefined;
    const systemTheme = selected && !("kind" in selected) ? freezeNSETheme(selected) : undefined;
    const scheme = name === undefined ? undefined : name === "darkAqua" ? "dark" : "light";
    return Object.freeze({
      ...inherited,
      theme: systemTheme ?? inherited.theme,
      appTheme: inherited.isSystemSurface ? undefined : appTheme ?? inherited.appTheme,
      ambientAppearance: inherited.isSystemSurface ? undefined : inherited.ambientAppearance ?? inherited,
      relocatesAppearance: inherited.isSystemSurface ? undefined : !projectBoundary || inherited.relocatesAppearance ? true : undefined,
      semanticAppearance: systemTheme ? undefined
        : appTheme && !inherited.isSystemSurface ? inherited.semanticAppearance ?? inherited : inherited.semanticAppearance,
      chrome: chrome ?? inherited.chrome,
      requestedColourScheme: scheme ?? inherited.requestedColourScheme,
      resolvedColourScheme: scheme ?? inherited.resolvedColourScheme,
      contrast: contrast ?? inherited.contrast,
      transparency: transparency ?? inherited.transparency,
    });
  }, [hasAppearance, selected, name, chrome, contrast, transparency, inherited, projectBoundary]);
  if (!projectBoundary) return <NSEAppearanceContext.Provider value={value}>{children}</NSEAppearanceContext.Provider>;
  return <AppearanceBoundary value={value} projectBoundary>{children}</AppearanceBoundary>;
}

/** System UI keeps the surrounding system appearance when its children move to a portal. */
export function SystemSurfaceAppearance({ children }: PropsWithChildren) {
  const inherited = useContext(NSEAppearanceContext);
  const value = useMemo<EffectiveAppearance>(() => {
    if (inherited.isSystemSurface) return inherited;
    return Object.freeze({
      ...(inherited.ambientAppearance ?? inherited),
      appTheme: undefined,
      ambientAppearance: undefined,
      relocatesAppearance: undefined,
      semanticAppearance: undefined,
      isSystemSurface: true,
    });
  }, [inherited]);
  return <NSEAppearanceContext.Provider value={value}>{children}</NSEAppearanceContext.Provider>;
}

export function useIsSystemSurfaceAppearance(): boolean {
  return useContext(NSEAppearanceContext).isSystemSurface === true;
}

export function useRelocatedAppearance(): EffectiveAppearance | undefined {
  const appearance = useContext(NSEAppearanceContext);
  return appearance.appTheme || appearance.relocatesAppearance ? appearance : undefined;
}

export function useInPlaceAppearanceProjection() {
  const appearance = useContext(NSEAppearanceContext);
  return useMemo(() => appearance.ambientAppearance ? projectNSEAppearance(appearance) : undefined, [appearance]);
}

/** Restore a presenting view's appearance in a separately mounted surface. */
export function RelocatedAppearance({ appearance, children }: PropsWithChildren<{
  readonly appearance: EffectiveAppearance | undefined;
}>) {
  const inherited = useContext(NSEAppearanceContext);
  return <NSEAppearanceContext.Provider value={appearance ?? inherited}>{children}</NSEAppearanceContext.Provider>;
}

function AppearanceBoundary({ value, projectBoundary, children }: PropsWithChildren<{
  readonly value: EffectiveAppearance;
  readonly projectBoundary: boolean;
}>) {
  const projection = useMemo(() => projectNSEAppearance(value), [value]);
  // Hooks the JSX runtime did not write (imperative DOM, unbundled apps) still get their mirror classes.
  useLayoutEffect(() => typeof document === "undefined" ? undefined : installNSEHookMirror(document), []);

  return (
    <NSEAppearanceContext.Provider value={value}>
      {projectBoundary
        ? <div className="nse-appearance-provider" {...projection} data-nse-role="appearance-provider">{children}</div>
        : children}
    </NSEAppearanceContext.Provider>
  );
}

export function useNSEAppearance(): NSEResolvedAppearance {
  return useContext(NSEAppearanceContext);
}

export function useNSEAppearanceProjection() {
  const appearance = useContext(NSEAppearanceContext);
  return useMemo(() => projectNSEAppearance(appearance, true), [appearance]);
}
