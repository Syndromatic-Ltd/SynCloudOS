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

import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useId, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { NSEMenuBar, createApplicationMenuModel, type MenuSection } from "../../NSE/NSE";
import { createReactOwnedNSEMenu, orderMenuEntries } from "../../NSE/Menus/NSEMenu";
import { nseMenuModel, type MenuEntryInput } from "../../NSE/Menus/menuTypes";
import { useMenuLifetime } from "../../NSE/Menus/useMenuLifetime";
import { WindowApplicationMenuContext } from "../../NSE/Toolbars/ApplicationMenuToolbarButton";
import { ActionResponderContext, useObserve } from "../../NSE/applicationHostInterop";
import type { NSEApplication } from "../../NSE/Application";
import { SynWareRuntimeContext } from "../../SynCloudOSReact";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { useRuntimeNSEMenuPort } from "../../SynCloudOSReact/nseMenuPort";
import { useSynWareContext } from "../AppSDK/SynWareContext";
import { installedApplicationMenuSections } from "./installedApplicationMenus";
import { applicationMenuLabels, ApplicationMenuOverlayHost } from "../../Webspring/applicationMenuPresentation";
import { createApplicationMenuStore, useApplicationMenuSnapshot } from "../../SynCloudOSReact/ApplicationMenuTrigger";

export const WindowApplicationMenuHostContext = createContext<SynCloudOSRuntime | null>(null);

export function WindowApplicationMenu({ app, destination, children }: PropsWithChildren<{
  readonly app: NSEApplication;
  readonly destination?: HTMLElement | null;
}>) {
  useObserve(app);
  const runtime = useContext(SynWareRuntimeContext);
  const context = useSynWareContext();
  const kernel = useContext(WindowApplicationMenuHostContext);
  const responder = useContext(ActionResponderContext) ?? runtime?.responderId ?? "";
  const port = useRuntimeNSEMenuPort();
  const login = useSyncExternalStore(kernel?.store.subscribe ?? noSubscribe,
    () => kernel?.store.getSnapshot().loginServices ?? null, () => null);
  const hasSignIn = useSyncExternalStore(kernel?.commands.subscribe ?? noSubscribe,
    () => kernel?.commands.inspect().registrations.some(item => item.commandId === "session.requestSignIn") ?? false, () => false);
  const current = useSyncExternalStore(runtime?.windows.subscribe ?? noSubscribe,
    () => runtime?.windows.getSnapshot().current ?? null, () => null);
  const presentation = useSyncExternalStore(context?.presentation.subscribe ?? noSubscribe,
    () => context?.presentation.getSnapshot() ?? null, () => null);
  const appId = runtime?.app.bundleIdentifier ?? "";
  const name = runtime?.app.displayName ?? "";
  const preferencesCommand = `${appId.toLowerCase()}.showPreferences`;
  const hasAppPreferences = useSyncExternalStore(kernel?.commands.subscribe ?? noSubscribe,
    () => kernel?.commands.inspect().registrations.some(item => item.commandId === preferencesCommand) ?? false, () => false);
  const mainMenu = app.mainMenu;
  const [store] = useState(createApplicationMenuStore);
  const state = useApplicationMenuSnapshot(store);
  const instance = useId();
  const model = useMemo(() => {
    const labels = applicationMenuLabels(name, (_key, fallback, values) => fallback.replace("{app}", String(values?.app ?? name)));
    const createPayload = runtime?.commands.createPayload;
    const entries: MenuEntryInput[] = [
      { kind: "separator", id: "quit-divider" },
      { kind: "command", id: "quit", commandId: "application.quit", payload: createPayload?.("appId", appId), labelOverride: `Quit ${name}` },
    ];
    const dock = kernel ? null : app.delegate?.applicationDockMenu?.(app);
    const extensions: MenuSection[] = [
      ...(kernel ? installedApplicationMenuSections(kernel, appId, app) : dock ? [{ id: "dock-menu", beforeId: "preferences", entries: dock.model.entries }] : []),
      ...(hasSignIn && !login?.isAuthorised ? [{ id: "sign-in", entries: [
        { kind: "command" as const, id: "sign-in", commandId: "session.requestSignIn", labelOverride: "Sign In" },
      ] }] : []),
      { id: "quit", entries, weight: 100 },
    ];
    return createApplicationMenuModel({ appId, labels, appPreferences: hasAppPreferences ? { commandId: preferencesCommand, label: "Preferences…" } : undefined, includeLogOut: hasSignIn && Boolean(login?.isAuthorised), extensions, createPayload });
  }, [app, appId, hasAppPreferences, hasSignIn, kernel, login?.isAuthorised, name, preferencesCommand, runtime]);
  const menu = useMemo(() => createReactOwnedNSEMenu({ ownerSignal: port.signal, runtime: port, [nseMenuModel]: model }), [model, port]);
  const composed = useMemo(() => {
    if (!mainMenu) return null;
    const applicationItem: MenuEntryInput = { kind: "submenu", id: "nse-application", label: name,
      entries: orderMenuEntries(model.entries, model.sections) };
    const entries = presentation?.horizontalSizeClass === "compact"
      ? [{ kind: "submenu" as const, id: "nse-compact-menu", label: "Menu", entries: [applicationItem, ...mainMenu.model.entries] }]
      : [applicationItem, ...mainMenu.model.entries];
    return createReactOwnedNSEMenu({ ownerSignal: port.signal, runtime: port, [nseMenuModel]: {
      id: `window-menu-bar:${instance}`, label: name, entries,
    } });
  }, [instance, mainMenu, model, name, port, presentation?.horizontalSizeClass]);
  useMenuLifetime(menu);
  const barMenus = useMemo(() => composed ? [composed] : [], [composed]);
  useMenuLifetime(barMenus);
  const activate = useCallback((anchor: HTMLElement) => {
    store.setAnchor(anchor);
    const opening = !store.getSnapshot().open;
    store.setOpen(opening);
  }, [store]);
  const value = useMemo(() => ({ label: `${name} Menu`, open: state.open, activate, setAnchor: store.setAnchor, toggle: store.toggle }), [activate, name, state.open, store]);
  return <WindowApplicationMenuContext.Provider value={value}>
    {children}
    {responder ? <ApplicationMenuOverlayHost menuStore={store} model={model} controller={menu}
      overlay={{ id: `window-application-menu:${instance}`, parentResponderId: responder }} anchorTitle={name} /> : null}
    {destination && composed && (current?.isKey ?? true) && responder ? createPortal(
      <NSEMenuBar menu={composed} overlay={{ parentResponderId: responder }} />, destination) : null}
  </WindowApplicationMenuContext.Provider>;
}

const noSubscribe = () => () => {};
