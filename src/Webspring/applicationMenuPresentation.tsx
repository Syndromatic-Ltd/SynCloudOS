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

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { NSEApplicationMenu, type NSEMenuModel } from "../NSE/NSE";
import { ApplicationMenuTriggerProvider } from "../SynCloudOSReact/ApplicationMenuTrigger";
import type { SynCloudOSAppAboutManifest } from "../SynCloudOS/SynCloudOS";
import type { SynCloudOSTranslationParams } from "../SynCloudOS/LocaleServices";
import type { WebspringAppMenuLabels } from "./webspringAppMenu";

/** The Webspring locale's text lookup (`useWebspringLocale().t`). */
export type ApplicationMenuText = (key: string, fallback: string, params?: SynCloudOSTranslationParams) => string;

/** The open state and anchor of one application's menu, shared by whichever
 * control triggers it (the top bar's User Info item or the app's own content
 * trigger) and the overlay that presents it. */
export interface ApplicationMenuSnapshot {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
}

export interface ApplicationMenuStore {
  readonly getSnapshot: () => ApplicationMenuSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly setAnchor: (element: HTMLElement | null) => void;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
}

export function createApplicationMenuStore(): ApplicationMenuStore {
  let snapshot: ApplicationMenuSnapshot = { open: false, anchor: null };
  const listeners = new Set<() => void>();
  const publish = (next: ApplicationMenuSnapshot) => {
    if (next.open === snapshot.open && next.anchor === snapshot.anchor) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAnchor(element) {
      publish({ ...snapshot, anchor: element });
    },
    setOpen(open) {
      publish({ ...snapshot, open });
    },
    toggle() {
      publish({ ...snapshot, open: !snapshot.open });
    },
  };
}

export function useApplicationMenuSnapshot(menuStore: ApplicationMenuStore): ApplicationMenuSnapshot {
  return useSyncExternalStore(menuStore.subscribe, menuStore.getSnapshot, menuStore.getSnapshot);
}

/** Whether the app declares anything for its About box beyond the version every app has. */
export function applicationDeclaresAbout(about: SynCloudOSAppAboutManifest | undefined): boolean {
  return Boolean(about?.copyright || about?.trademark || about?.tagline);
}

/** True when System Preferences is the menu's only command, so its control opens System Preferences itself. */
export function menuOpensSystemPreferencesDirectly(model: NSEMenuModel): boolean {
  const commandIds = [...model.entries, ...(model.sections ?? []).flatMap((section) => section.entries)]
    .flatMap((entry) => entry.kind === "command" && "commandId" in entry ? [entry.commandId] : []);
  return commandIds.length === 1 && commandIds[0] === "system.showPreferences";
}

/** The system labels every application menu shares, for the app's localised name. */
export function applicationMenuLabels(appName: string, t: ApplicationMenuText): WebspringAppMenuLabels {
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

type NSEApplicationMenuProps = Parameters<typeof NSEApplicationMenu>[0];

export function ApplicationMenuOverlayHost({
  menuStore,
  model,
  controller,
  overlay,
  anchorTitle,
}: {
  readonly menuStore: ApplicationMenuStore;
  readonly model: NSEApplicationMenuProps["model"];
  readonly controller: NSEApplicationMenuProps["controller"];
  readonly overlay: NSEApplicationMenuProps["overlay"];
  readonly anchorTitle: string;
}) {
  const menu = useApplicationMenuSnapshot(menuStore);
  return (
    <NSEApplicationMenu
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

/** Publishes the menu to `useApplicationMenuTrigger()` so an app that
 * declares `applicationMenu.trigger: "content"` can open it from its own control.
 * `onActivate` replaces the toggle when the menu has nothing to show but System
 * Preferences, which the control then opens directly. */
export function ApplicationMenuTriggerBridge({
  menuStore,
  label,
  onActivate,
  children,
}: {
  readonly menuStore: ApplicationMenuStore;
  readonly label: string;
  readonly onActivate?: () => void;
  readonly children: ReactNode;
}) {
  const menu = useApplicationMenuSnapshot(menuStore);
  const port = useMemo(() => ({
    label,
    open: menu.open,
    setAnchor: menuStore.setAnchor,
    toggle: onActivate ?? menuStore.toggle,
  }), [label, menu.open, menuStore, onActivate]);
  return <ApplicationMenuTriggerProvider port={port}>{children}</ApplicationMenuTriggerProvider>;
}
