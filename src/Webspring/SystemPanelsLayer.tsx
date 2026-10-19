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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  NSEColourPanel,
  NSEColourPanelProvider,
  NSEControlRuntimeProvider,
  NSEFontPanel,
  NSEOverlayProvider,
  NSEWindowSurfaceBridgeProvider,
  useNSEDeferredDisposal,
  type NSEFontPanelCommandPort,
} from "../NSE/NSE";
import type { CommandPayloadSchema } from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS, useRuntimeNSEControlPort, useRuntimeNSEOverlayPort } from "../SynCloudOSReact";
import { createTransientWindowSurfaceBridge, type WindowContentRendererRegistry } from "./WindowLayer";
import { useHostFontManager } from "../SynCloudOSReact";

/** The system panels' window hosts: their controller IDs carry the system owner. */
const systemSurfaceSelector = '[data-window-host^="transient:system:"]';

const noPayload: CommandPayloadSchema<undefined> = {
  description: "No payload.",
  parse: (value) => value === undefined ? { ok: true, value: undefined } : { ok: false, issues: ["No payload is accepted."] },
};

/**
 * The shared Font and Colours panels, provided by the system rather than by
 * any app, as AppKit provides NSFontPanel and NSColorPanel. They are NSE views
 * mounted here once, in system-owned floating windows, so they stay open
 * while the user moves between apps' pages and specimens. Apps supply only
 * targets: colour wells claim the Colours panel, and the Font panel sends its
 * format commands to the text the user last focused outside the panels, as
 * NSFontManager sends to the main window's first responder. Show Fonts and
 * Show Colours are system commands any app may dispatch.
 */
export function SystemPanelsLayer({ windowContentRegistry }: { readonly windowContentRegistry: WindowContentRendererRegistry }) {
  const runtime = useKernelSynCloudOS();
  const overlayPort = useRuntimeNSEOverlayPort("workspace");
  const controlPort = useRuntimeNSEControlPort();
  const bridge = useMemo(() => createTransientWindowSurfaceBridge({
    runtime,
    renderers: windowContentRegistry,
    physicalHostId: "system-panels",
    owner: { workspaceId: "workspace:default", applicationId: null, applicationSessionId: null },
  }), [runtime, windowContentRegistry]);
  useNSEDeferredDisposal(bridge);
  // The panels are top-level system windows: they have no parent window
  // (a panel's own parent ID names nothing here), and a failure to present
  // one is reported rather than leaving a menu command that does nothing.
  const systemBridge = useMemo(() => ({
    present: (request: Parameters<typeof bridge.present>[0], content: Parameters<typeof bridge.present>[1]) => (
      bridge.present({ ...request, parentWindowControllerId: null }, content)
    ),
    dismiss: bridge.dismiss,
    reportError: (error: unknown, context: { readonly requestId: string; readonly operation: string }) => {
      runtime.errors.capture({
        code: "APP_CONTENT_FAILED",
        title: "This panel could not be shown.",
        message: "An unexpected error has prevented Webspring from opening this panel.",
        error,
        source: "Webspring.SystemPanelsLayer",
        context,
        severity: "error",
        recoverable: true,
        suggestedActions: ["dismiss"],
      });
    },
  }), [bridge, runtime]);

  // The text the Font panel acts on: the last responder focused outside the
  // system panels (focusing the panel itself does not change it).
  const textResponderId = useRef<string | null>(null);
  useEffect(() => {
    const document = runtime.environment.browser.getDocument();
    if (!document) return;
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest(systemSurfaceSelector)) return;
      queueMicrotask(() => {
        const focused = runtime.focus.getFocusedResponderId();
        if (focused) textResponderId.current = focused;
      });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [runtime]);

  const fontManager = useHostFontManager();
  const fontCommandPort = useMemo(() => Object.freeze<NSEFontPanelCommandPort>({
    async execute(commandId, payload, signal) {
      signal.throwIfAborted();
      const responderId = textResponderId.current && runtime.responders.has(textResponderId.current) ? textResponderId.current : undefined;
      const result = await runtime.commands.dispatch(commandId, payload, { source: "toolbar", signal, ...(responderId ? { responderId } : {}) });
      signal.throwIfAborted();
      return Object.freeze({ status: result.status });
    },
  }), [runtime]);
  const [fontsOpen, setFontsOpen] = useState(false);

  useEffect(() => {
    const registrations = [
      runtime.commands.register({
        id: "system.showFonts", responderId: "runtime", title: { key: "command.system.showFonts", fallback: "Show Fonts" },
        payload: noPayload, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" },
        execute: () => { setFontsOpen(true); },
      }),
      runtime.commands.register({
        id: "system.showColours", responderId: "runtime", title: { key: "command.system.showColours", fallback: "Show Colours" },
        payload: noPayload, defaultKeyBindings: [], scope: "runtime", undo: { kind: "none" },
        validate: () => ({ enabled: runtime.colourPanel.getSnapshot().status === "active" }),
        execute: () => { runtime.colourPanel.open(); },
      }),
    ];
    return () => { for (const registration of registrations.reverse()) registration.dispose(); };
  }, [runtime]);

  return (
    <NSEOverlayProvider runtimePort={overlayPort} defaultParentResponderId="workspace">
      <NSEWindowSurfaceBridgeProvider bridge={systemBridge}>
        <NSEControlRuntimeProvider port={controlPort}>
          <NSEColourPanelProvider service={runtime.colourPanel}>
            <NSEColourPanel />
            <NSEFontPanel
              open={fontsOpen}
              anchor={null}
              manager={fontManager}
              commandPort={fontCommandPort}
              parentWindowControllerId="system:font-panel"
              onOpenChange={setFontsOpen}
            />
          </NSEColourPanelProvider>
        </NSEControlRuntimeProvider>
      </NSEWindowSurfaceBridgeProvider>
    </NSEOverlayProvider>
  );
}
