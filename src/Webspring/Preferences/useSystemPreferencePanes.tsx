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

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import type { PreferencesToastPane } from "../../NSE/SystemUI";
import { NSEWindowController, useObserve } from "../../NSE/sdkPackageEntry";
import {
  nseUpdatePreferencePaneState,
  registerPreferencePane,
  resolvePreferencePanes,
  type NSEPreferencePane,
  type PreferencePaneDescriptor,
  type PreferencePaneViewProps,
} from "../../SynCloudOS/Preferences";
import { useAppearance, useKernelSynCloudOS, useLocaleServicesSnapshot, useSettings } from "../../SynCloudOSReact";
import type { WebspringPreferencesOptions } from "../webspringTypes";
import { accountPreferencePane, builtInPreferencePanes } from "../builtInPreferencePanes";
import { PreferencePaneBoundary } from "./PreferencePaneBoundary";
import { useSystemText, type SystemText } from "./useSystemText";

function PreferencePaneContent({ pane }: { readonly pane: NSEPreferencePane }) {
  useObserve(pane);
  if (pane.isDisposed) return null;
  if (typeof pane.renderView === "function") return <>{pane.renderView()}</>;
  const View = (pane.constructor as { readonly view?: ComponentType<{ readonly controller: NSEPreferencePane }> }).view;
  if (!View) throw new TypeError(`${pane.constructor.name} has no static view or renderView; declare one rendering form.`);
  return <View controller={pane} />;
}

function PreferencePaneSummary({ pane }: { readonly pane: NSEPreferencePane }) {
  useObserve(pane);
  if (pane.isDisposed) return null;
  return <>{pane.renderSummary?.()}</>;
}

function PreferencePaneAccessory({ pane }: { readonly pane: NSEPreferencePane }) {
  useObserve(pane);
  if (pane.isDisposed) return null;
  return <>{pane.renderAccessory?.()}</>;
}

function toPreferencesToastPane(
  descriptor: PreferencePaneDescriptor,
  pane: NSEPreferencePane,
  t: SystemText,
): PreferencesToastPane {
  const { title, icon } = descriptor;
  const hasSummary = typeof pane.renderSummary === "function";
  const hasAccessory = typeof pane.renderAccessory === "function";
  return {
    id: descriptor.id,
    label: typeof title === "string" ? title : t(title.key, title.fallback ?? title.key),
    icon: icon ? <img className="nse-prefs-app-icon" src={icon} alt="" aria-hidden="true" /> : undefined,
    meta: hasSummary ? (
      <PreferencePaneBoundary fallback={t("preferences.unavailable", "Unavailable")}>
        <PreferencePaneSummary pane={pane} />
      </PreferencePaneBoundary>
    ) : undefined,
    accessory: hasAccessory ? (
      <PreferencePaneBoundary fallback={null}>
        <PreferencePaneAccessory pane={pane} />
      </PreferencePaneBoundary>
    ) : undefined,
    render: () => (
      <PreferencePaneBoundary fallback={<p data-nse-part="label" data-nse-role="note" className="nse-prefs-note">{t("preferences.paneUnavailable", "This preference pane could not be loaded.")}</p>}>
        <PreferencePaneContent pane={pane} />
      </PreferencePaneBoundary>
    ),
  };
}

/**
 * The panes System Preferences lists, ready for the window: the built-ins that
 * are neither hidden nor replaced, Account when the host offers sign-in, and the
 * developer's own panes, registered with the runtime and ordered by `order`.
 */
export function useSystemPreferencePanes({ offersAccount, preferences }: {
  readonly offersAccount: boolean;
  readonly preferences?: WebspringPreferencesOptions;
}): PreferencesToastPane[] {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  const settings = useSettings();
  const appearance = useAppearance();
  const locale = useLocaleServicesSnapshot();
  const developerPanes = preferences?.panes;
  const hidden = preferences?.hide;

  const [owner, setOwner] = useState<NSEWindowController | null>(null);
  useLayoutEffect(() => {
    const lifetime = new AbortController();
    const controller = new NSEWindowController({ ownerSignal: lifetime.signal });
    setOwner(controller);
    return () => {
      lifetime.abort();
    };
  }, []);

  const resolved = useMemo(() => resolvePreferencePanes({
    builtIn: offersAccount ? [accountPreferencePane, ...builtInPreferencePanes] : builtInPreferencePanes,
    developer: developerPanes,
    hide: hidden,
  }), [developerPanes, hidden, offersAccount]);

  useLayoutEffect(() => {
    const registrations = resolved.map((descriptor) => registerPreferencePane(runtime.preferencePanes, descriptor));
    return () => {
      for (const registration of registrations.reverse()) registration.dispose();
    };
  }, [resolved, runtime]);

  const definitions = useSyncExternalStore(
    runtime.preferencePanes.subscribe,
    runtime.preferencePanes.getSnapshot,
    runtime.preferencePanes.getSnapshot,
  );

  const panesRef = useRef<{
    owner: NSEWindowController | null;
    byDescriptor: Map<PreferencePaneDescriptor, NSEPreferencePane>;
  }>({ owner: null, byDescriptor: new Map() });

  useLayoutEffect(() => {
    if (!owner || owner.isDisposed) return;
    if (panesRef.current.owner !== owner) {
      panesRef.current.owner = owner;
      panesRef.current.byDescriptor.clear();
    }
    const active = new Set(definitions);
    for (const [descriptor, pane] of panesRef.current.byDescriptor) {
      if (!active.has(descriptor)) {
        panesRef.current.byDescriptor.delete(descriptor);
        if (!pane.isDisposed) pane.dispose();
      }
    }
    const state: PreferencePaneViewProps = { settings, appearance, locale };
    for (const pane of panesRef.current.byDescriptor.values()) {
      if (!pane.isDisposed) pane[nseUpdatePreferencePaneState](state);
    }
  }, [appearance, definitions, locale, owner, settings]);

  return useMemo(() => {
    if (!owner || owner.isDisposed) return [];
    if (panesRef.current.owner !== owner) {
      panesRef.current.owner = owner;
      panesRef.current.byDescriptor.clear();
    }
    const initialState: PreferencePaneViewProps = { settings, appearance, locale };
    return definitions.map((descriptor) => {
      let pane = panesRef.current.byDescriptor.get(descriptor);
      if (!pane || pane.isDisposed) {
        pane = new descriptor.PaneClass({ owner });
        pane[nseUpdatePreferencePaneState](initialState);
        panesRef.current.byDescriptor.set(descriptor, pane);
      }
      return toPreferencesToastPane(descriptor, pane, t);
    });
  }, [appearance, definitions, locale, owner, settings, t]);
}
