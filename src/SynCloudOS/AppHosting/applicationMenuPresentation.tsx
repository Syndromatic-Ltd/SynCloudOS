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

import { ApplicationMenu, type ApplicationMenuLabels } from "../../NSE/NSE";
import { useApplicationMenuSnapshot, type ApplicationMenuStore } from "../../SynCloudOSReact";
import type { SynCloudOSTranslationParams } from "../SynCloudOS";

/** A locale text lookup, such as `useWebspringLocale().t`. */
export type ApplicationMenuText = (key: string, fallback: string, params?: SynCloudOSTranslationParams) => string;

/** The system labels every application menu shares, for the app's localised name. */
export function applicationMenuLabels(appName: string, t: ApplicationMenuText): ApplicationMenuLabels {
  return {
    label: appName,
    // Avoid an "About About" menu item for About.app while preserving the
    // regular app-specific label for every other SynWare.
    about: /^about\b/i.test(appName)
      ? t("appMenu.aboutThisApp", "About This App")
      : t("appMenu.aboutApp", "About {app}", { app: appName }),
    preferences: t("appMenu.systemPreferences", "System Preferences…"),
    logOut: t("appMenu.logOut", "Log Out"),
  };
}

type ApplicationMenuProps = Parameters<typeof ApplicationMenu>[0];

export function ApplicationMenuOverlayHost({
  menuStore,
  model,
  controller,
  overlay,
  anchorTitle,
}: {
  readonly menuStore: ApplicationMenuStore;
  readonly model: ApplicationMenuProps["model"];
  readonly controller: ApplicationMenuProps["controller"];
  readonly overlay: ApplicationMenuProps["overlay"];
  readonly anchorTitle: string;
}) {
  const menu = useApplicationMenuSnapshot(menuStore);
  return (
    <ApplicationMenu
      model={model}
      controller={controller}
      overlay={overlay}
      open={menu.open}
      anchor={menu.anchor}
      title={anchorTitle}
      onOpenChange={(nextOpen) => menuStore.setOpen(nextOpen)}
    />
  );
}
