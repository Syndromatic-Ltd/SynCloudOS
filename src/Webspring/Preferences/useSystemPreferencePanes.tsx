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

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { NSEPreferencePane } from "../../NSE/SystemUI";
import {
  registerPreferencePane,
  resolvePreferencePanes,
  type PreferencePaneDefinition,
  type PreferencePaneViewProps,
} from "../../SynCloudOS/Preferences";
import { useAppearance, useKernelSynCloudOS, useLocaleServicesSnapshot, useSettings } from "../../SynCloudOSReact";
import type { WebspringPreferencesOptions } from "../webspringTypes";
import { accountPreferencePane, builtInPreferencePanes } from "../builtInPreferencePanes";
import { PreferencePaneBoundary } from "./PreferencePaneBoundary";
import { useSystemText, type SystemText } from "./useSystemText";

function toNSEPreferencePane(definition: PreferencePaneDefinition, props: PreferencePaneViewProps, t: SystemText): NSEPreferencePane {
  const { title, icon, summary: Summary, accessory: Accessory, view: View } = definition;
  return {
    id: definition.id,
    label: typeof title === "string" ? title : t(title.key, title.fallback ?? title.key),
    icon: icon ? <img className="nse-prefs-app-icon" src={icon} alt="" aria-hidden="true" /> : undefined,
    meta: Summary ? (
      <PreferencePaneBoundary fallback={t("preferences.unavailable", "Unavailable")}>
        <Summary {...props} />
      </PreferencePaneBoundary>
    ) : undefined,
    accessory: Accessory ? (
      <PreferencePaneBoundary fallback={null}>
        <Accessory {...props} />
      </PreferencePaneBoundary>
    ) : undefined,
    render: () => (
      <PreferencePaneBoundary fallback={<p className="nse-prefs-note">{t("preferences.paneUnavailable", "This preference pane could not be loaded.")}</p>}>
        <View {...props} />
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
}): NSEPreferencePane[] {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  const settings = useSettings();
  const appearance = useAppearance();
  const locale = useLocaleServicesSnapshot();
  const developerPanes = preferences?.panes;
  const hidden = preferences?.hide;

  const resolved = useMemo(() => resolvePreferencePanes({
    builtIn: offersAccount ? [accountPreferencePane, ...builtInPreferencePanes] : builtInPreferencePanes,
    developer: developerPanes,
    hide: hidden,
  }), [developerPanes, hidden, offersAccount]);

  useLayoutEffect(() => {
    const registrations = resolved.map((definition) => registerPreferencePane(runtime.preferencePanes, definition));
    return () => {
      for (const registration of registrations.reverse()) registration.dispose();
    };
  }, [resolved, runtime]);

  const definitions = useSyncExternalStore(
    runtime.preferencePanes.subscribe,
    runtime.preferencePanes.getSnapshot,
    runtime.preferencePanes.getSnapshot,
  );
  return useMemo(() => {
    const props: PreferencePaneViewProps = { settings, appearance, locale };
    return definitions.map((definition) => toNSEPreferencePane(definition, props, t));
  }, [appearance, definitions, locale, settings, t]);
}
