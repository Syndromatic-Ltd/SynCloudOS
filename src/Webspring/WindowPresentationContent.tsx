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

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import {
  ApplicationNavigationChromeProvider, OverlayProvider, TooltipProvider, WindowSurfaceBridgeProvider,
  type ApplicationNavigationChromeController, type WindowSurfaceBridge,
} from "../NSE/NSE";
import { isNSEHTMLElement, PresentingDocumentContext, WindowLayoutContext, WindowTitlebarHostContext } from "../NSE/hostComposition";
import {
  QuickSwitchTriggerProvider, ResponderHierarchyContext,
  useKernelSynCloudOS, useQuickSwitchTrigger, useRuntimeNSEOverlayPort,
} from "../SynCloudOSReact";
import { SynWareEntryRenderer } from "./SynWareEntryRenderer";
import { useWebspringLocale } from "./webspringLocale";
import type { SynCloudOSAppInfo, WindowController } from "../SynCloudOS/SynCloudOS";

interface Slot {
  readonly node: HTMLDivElement;
  readonly priority: number;
  readonly titlebar: React.ContextType<typeof WindowTitlebarHostContext>;
  readonly layout: React.ContextType<typeof WindowLayoutContext>;
  readonly quickSwitch: ReturnType<typeof useQuickSwitchTrigger>;
  readonly navigation?: ApplicationNavigationChromeController;
  readonly standardChrome?: boolean;
  readonly bridge?: WindowSurfaceBridge | null;
  readonly overlay: HTMLElement | null;
}

type RegisterSlot = (windowId: string, slot: Slot) => () => void;
const SlotRegistration = createContext<RegisterSlot | null>(null);

export function useWindowPresentationContent(): boolean {
  return useContext(SlotRegistration) !== null;
}

export function WindowPresentationSlot({
  windowId, priority, navigation, standardChrome, bridge, overlay,
}: Pick<Slot, "priority" | "navigation" | "standardChrome" | "bridge" | "overlay"> & {
  readonly windowId: string;
}) {
  const register = useContext(SlotRegistration);
  const node = useRef<HTMLDivElement>(null);
  const titlebar = useContext(WindowTitlebarHostContext);
  const layout = useContext(WindowLayoutContext);
  const quickSwitch = useQuickSwitchTrigger();
  useLayoutEffect(() => {
    if (!node.current) return;
    return register?.(windowId, { node: node.current, priority, titlebar, layout, quickSwitch, navigation, standardChrome, bridge, overlay });
  }, [bridge, layout, navigation, overlay, priority, quickSwitch, register, standardChrome, titlebar, windowId]);
  return <div ref={node} data-window-presentation-slot={windowId} style={{ display: "contents" }} />;
}

/** The shell owns one portal target and one React root per application window. */
export function WindowPresentationContent({ children }: PropsWithChildren) {
  const runtime = useKernelSynCloudOS();
  const snapshot = useSyncExternalStore(runtime.windows.subscribe, runtime.windows.snapshot, runtime.windows.snapshot);
  const slots = useRef(new Map<string, Set<Slot>>());
  const [revision, setRevision] = useState(0);
  const register = useMemo<RegisterSlot>(() => (id, slot) => {
    const entries = slots.current.get(id) ?? new Set();
    slots.current.set(id, entries);
    entries.add(slot);
    setRevision(value => value + 1);
    return () => {
      entries.delete(slot);
      if (!entries.size) slots.current.delete(id);
      setRevision(value => value + 1);
    };
  }, []);
  const document = runtime.environment.browser.getDocument();
  const candidates = useMemo(() => snapshot.windowControllerIds.flatMap(id => {
    const controller = runtime.windows.select(id);
    const { record } = controller;
    const app = record.applicationId ? runtime.apps.getApp(record.applicationId) : null;
    if (!document || !app || record.role !== "standard" || record.content.rendererId !== "application") return [];
    const slot = [...slots.current.get(id) ?? []].reduce<Slot | null>((best, candidate) =>
      !best || candidate.priority > best.priority ? candidate : best, null);
    return [{ controller, app, slot }];
  }), [document, revision, runtime, snapshot]);
  return <SlotRegistration.Provider value={register}>
    {children}
    {document && candidates.map(({ controller, app, slot }) =>
      <PresentedApplicationWindow key={controller.id} controller={controller} app={app} slot={slot} document={document} />)}
  </SlotRegistration.Provider>;
}

function PresentedApplicationWindow({ controller, app, slot, document }: {
  readonly controller: WindowController;
  readonly app: SynCloudOSAppInfo;
  readonly slot: Slot | null;
  readonly document: Document;
}) {
  const runtime = useKernelSynCloudOS();
  const locale = useWebspringLocale();
  const { id, windowResponderId } = controller;
  const overlay = useRuntimeNSEOverlayPort(windowResponderId);
  const node = useMemo(() => {
    const container = document.createElement("div");
    container.dataset.windowContentMount = id;
    container.style.display = "contents";
    return container;
  }, [document, id]);
  const lastFocused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const remember = (event: FocusEvent) => {
      if (isNSEHTMLElement(event.target)) lastFocused.current = event.target;
    };
    node.addEventListener("focusin", remember);
    return () => node.removeEventListener("focusin", remember);
  }, [node]);
  const lastSlot = useRef<Slot | null>(null);
  if (slot) lastSlot.current = slot;
  const presentation = slot ?? lastSlot.current;
  const presentIn = slot?.node ?? null;
  useLayoutEffect(() => {
    if (presentIn && node.parentNode !== presentIn) {
      const active = node.ownerDocument.activeElement;
      const focused = isNSEHTMLElement(active) && node.contains(active) ? active
        : !node.isConnected && active === node.ownerDocument.body ? lastFocused.current : null;
      presentIn.append(node);
      if (focused && node.contains(focused)) focused.focus({ preventScroll: true });
    } else if (!presentIn) {
      node.remove();
    }
  }, [node, presentIn]);
  useLayoutEffect(() => () => node.remove(), [node]);
  const hierarchy = useMemo(() => ({
    runtimeId: runtime.runtimeId,
    responderId: windowResponderId,
    windowResponderId,
    applicationResponderId: `application:${app.bundleIdentifier}`,
  }), [app.bundleIdentifier, runtime.runtimeId, windowResponderId]);
  if (!presentation) return null;
  const navigation = presentation.navigation;
  const content = <SynWareEntryRenderer
    runtime={runtime} app={app} responderId={windowResponderId} windowControllerId={id}
    isLoading={false} loadingClassName="webspring-window-loading"
    loadingLabel={locale.t("apps.loading", "Loading {app}", { app: locale.appName(app) })}
    loadingPackageLabel={locale.t("apps.loadingPackage", "Loading {packageName}", { packageName: app.packageName })}
    missingComponentLabel={locale.t("apps.missingComponent", "SynCloudOS could not find a component for {packageName}.", { packageName: app.packageName })}
  />;
  return createPortal(
    <PresentingDocumentContext.Provider value={presentIn?.ownerDocument ?? document}>
      <ResponderHierarchyContext.Provider value={hierarchy}>
        <OverlayProvider runtimePort={overlay} defaultParentResponderId={windowResponderId} portalContainer={slot?.overlay ?? null}>
          <TooltipProvider>
          <WindowLayoutContext.Provider value={presentation.layout}>
          <WindowTitlebarHostContext.Provider value={presentation.titlebar}>
          <QuickSwitchTriggerProvider port={presentation.quickSwitch}>
            <WindowSurfaceBridgeProvider bridge={presentation.bridge ?? null}>
            <ApplicationNavigationChromeProvider controller={navigation ?? null} standardChromeAvailable={presentation.standardChrome ?? false}>
              {content}
            </ApplicationNavigationChromeProvider>
            </WindowSurfaceBridgeProvider>
          </QuickSwitchTriggerProvider>
          </WindowTitlebarHostContext.Provider>
          </WindowLayoutContext.Provider>
          </TooltipProvider>
        </OverlayProvider>
      </ResponderHierarchyContext.Provider>
    </PresentingDocumentContext.Provider>,
    node,
  );
}
