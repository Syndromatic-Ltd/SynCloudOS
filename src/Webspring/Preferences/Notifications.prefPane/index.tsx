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

import { useMemo } from "react";
import { NSEGroupBox, NSEListItem, NSEToggleButton } from "../../../NSE/public/controls";
import type { RuntimeSnapshot } from "../../../SynCloudOS/SynCloudOS";
import { definePreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS, useRuntimeSelector } from "../../../SynCloudOSReact";
import { useSystemText } from "../useSystemText";

function selectAppInfo(snapshot: RuntimeSnapshot) {
  return snapshot.appInfo;
}

// Read LIVE off the runtime rather than snapshotted once.
//
// The system UI mounts at the root during boot, before a single app has
// registered, so a one-off read captured an empty registry and kept it: the
// pane then reported "0/0" and showed an empty group box for the rest of the
// session. Selecting from the store re-renders when apps arrive.
function useNotificationApps() {
  const appInfo = useRuntimeSelector(selectAppInfo);
  return useMemo(
    () => Object.values(appInfo).filter(
      (app) => app.webspring?.visible !== false && app.notifications?.showsNotifications !== false,
    ),
    [appInfo],
  );
}

function NotificationsSummary({ settings }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  const apps = useNotificationApps();
  if (!settings.notificationsEnabled) return <>{t("preferences.off", "Off")}</>;
  if (apps.length === 0) return <>{t("preferences.none", "None")}</>;
  return <>{t("preferences.countOfTotal", "{count} of {total}", {
    count: apps.filter((app) => runtime.settings.notificationsAllowed(app.id)).length,
    total: apps.length,
  })}</>;
}

// The master switch rides the root row, so notifications can be silenced
// without opening the pane at all.
function NotificationsSwitch({ settings }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  return (
    <NSEToggleButton
      checked={settings.notificationsEnabled}
      onCheckedChange={(value) => runtime.settings.set("notificationsEnabled", value)}
      aria-label={t("preferences.allNotifications", "All notifications")}
    />
  );
}

function NotificationsPane({ settings }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  const apps = useNotificationApps();
  return (
    <div className="nse-prefs-section" data-muted={settings.notificationsEnabled ? undefined : "true"}>
      {apps.length === 0 ? (
        // Nothing installed asks to notify. An empty group box would read as
        // a rendering fault rather than an answer.
        <div className="nse-prefs-empty">
          <span className="nse-prefs-empty-title">
            {t("preferences.noNotificationApps", "No Apps Yet")}
          </span>
          <span className="nse-prefs-empty-detail">
            {t(
              "preferences.noNotificationAppsDetail",
              "Apps that can send you notifications will appear here.",
            )}
          </span>
        </div>
      ) : (
        <>
          <p className="nse-prefs-note nse-prefs-note-lead">
            {t("preferences.notificationsLead", "View notifications from:")}
          </p>
          <NSEGroupBox>
            {apps.map((app) => (
              <NSEListItem
                key={app.id}
                tapHighlight={false}
                leading={<img className="nse-prefs-app-icon" src={app.icon.src} alt="" aria-hidden="true" />}
                trailing={(
                  <NSEToggleButton
                    // Each app's OWN choice, not the resolved answer: with
                    // the master off these would all read false and turning
                    // it back on would look like it had wiped them.
                    checked={runtime.settings.appNotificationsAllowed(app.id)}
                    disabled={!settings.notificationsEnabled}
                    onCheckedChange={(value) => runtime.settings.setNotificationsAllowed(app.id, value)}
                    aria-label={app.displayName}
                  />
                )}
              >
                {app.displayName}
              </NSEListItem>
            ))}
          </NSEGroupBox>
          {settings.notificationsEnabled ? null : (
            <p className="nse-prefs-note">
              {t(
                "preferences.notificationsAllOffNote",
                "All notifications are turned off. Turn them on to choose per app.",
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default definePreferencePane({
  id: "notifications",
  title: { key: "system.notifications", fallback: "Notifications" },
  order: 400,
  summary: NotificationsSummary,
  accessory: NotificationsSwitch,
  view: NotificationsPane,
});
