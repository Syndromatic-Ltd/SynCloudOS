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

import { normalizeBundleIdentifier } from "../../SynCloudOS/Identity/bundleIdentifier.mjs";
import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { createWindowPointerGesture, resolveWindowPresentation, type SynCloudOSRuntime } from "../../SynCloudOS/SynCloudOS";
import { HostAppWindowChromePropsProvider } from "../../SynCloudOS/AppSDK/SynWareRuntimeMount";
import { WindowChromeSlotContext } from "./windowChromeSlotContext";
import { projectChromeCloseError, projectChromeCloseResult } from "./windowChromeResults";
import type { AppWindowChromeProps, SynWareDefinition } from "../../SynCloudOS/AppSDK";

/** Renders the mounted application's custom window chrome into the host slot.
 * The bridge lives INSIDE the SynWareRuntimeMount so the chrome component sees
 * the same SynWareProvider context as the app root, while its output portals
 * into the titlebar slot the window host owns. One mount, one session, one
 * disposal lifecycle.
 *
 * Readiness handshake: the host starts every custom window on the system
 * titlebar that the active theme paints. When this bridge has a live controller, an open
 * record and a valid renderer it reports ready — only then does the host
 * switch to custom chrome. Renderer unmount or a crash reports detachment or
 * failure and the host returns to the system fallback, so a declared-custom
 * window can never present a blank titlebar. */
export function SynWareWindowChromeBridge({
  runtime,
  windowChrome,
  windowControllerId,
}: {
  readonly runtime: SynCloudOSRuntime;
  readonly windowChrome: NonNullable<SynWareDefinition["windowChrome"]>;
  readonly windowControllerId: string;
}) {
  const slot = React.useContext(WindowChromeSlotContext);
  const controller = useMemo(() => {
    try { return runtime.windows.select(windowControllerId); }
    catch { return null; }
  }, [runtime, windowControllerId]);
  const subscribe = useMemo(() => controller?.subscribe ?? (() => () => undefined), [controller]);
  const getRecord = useMemo(
    () => () => controller?.record ?? null,
    [controller],
  );
  const record = useSyncExternalStore(subscribe, getRecord, getRecord);
  const live = Boolean(slot && slot.slotElement && controller && record && record.state === "open" && record.chromeMode === "custom");

  useEffect(() => {
    if (!slot || !live) return;
    slot.reportChromeReady();
    return () => slot.reportChromeDetached();
  }, [slot, live]);

  // Movability is tracked in a ref and read at pointer-down time: the
  // gesture object itself is created once per mount, because recreating it
  // on every record tick would dispose the in-flight gesture and cancel an
  // active drag. A screen-snapshot failure keeps the last known value rather
  // than welding the window shut.
  const movableRef = React.useRef(true);
  try {
    movableRef.current = record?.state === "open"
      ? resolveWindowPresentation(record, runtime.screen.getCurrentSnapshot()).movable
      : false;
  } catch { /* keep the last known movability */ }
  const gesture = useMemo(() => createWindowPointerGesture({
    manager: runtime.windows,
    windowControllerId,
    gesture: { kind: "move" },
    isDisabled: () => !movableRef.current,
  }), [runtime, windowControllerId]);
  useEffect(() => () => gesture.dispose(), [gesture]);

  const dispatchWindowCommand = (commandId: "window.minimise" | "window.zoom"): void => {
    void runtime.commands.dispatch(commandId, { windowControllerId }, { source: "toolbar" }).then((result) => {
      if (result.status === "executed") return;
      const detail = result.status === "failed"
        ? result.error.message
        : "reason" in result
          ? String(result.reason)
          : result.status;
      throw new Error(`${commandId} was not executed: ${detail}`);
    }).catch((error: unknown) => {
      runtime.errors.capture({
        code: "APP_CONTENT_FAILED",
        title: `This window could not be ${commandId === "window.minimise" ? "minimised" : "zoomed"}.`,
        message: "The application's window controls did not respond.",
        error,
        severity: "error",
        recoverable: true,
        suggestedActions: [],
      });
    });
  };


  if (!slot || !controller || !record || record.state !== "open" || record.chromeMode !== "custom" || !slot.slotElement) return null;
  const presentation = resolveWindowPresentation(record, runtime.screen.getCurrentSnapshot());
  const chromeProps: AppWindowChromeProps = Object.freeze({
    title: record.title,
    titleId: `${record.id}-title`,
    isKey: record.isKey,
    dirty: runtime.windows.snapshot().dirtyWindowControllerIds.includes(record.id),
    movable: presentation.movable,
    resizable: presentation.resizable,
    closable: record.style.includes("closable"),
    minimisable: record.style.includes("minimisable"),
    zoomable: record.style.includes("zoomable"),
    createMoveRegionProps: () => ({ onPointerDown: gesture.onPointerDown }),
    close: async () => {
      try {
        return projectChromeCloseResult(await runtime.commands.dispatch("window.close", { windowControllerId }, { source: "toolbar" }), windowControllerId);
      } catch (error) {
        let windowState: string | null = null;
        try { windowState = runtime.windows.select(windowControllerId).record.state; }
        catch { windowState = null; }
        return projectChromeCloseError(error, windowControllerId, windowState);
      }
    },
    minimise: () => dispatchWindowCommand("window.minimise"),
    zoom: () => dispatchWindowCommand("window.zoom"),
  });
  const Chrome = windowChrome;
  return createPortal(
    <WindowChromeFailureBoundary runtime={runtime} applicationId={record.applicationId} onFallback={slot.reportChromeFailure}>
      <HostAppWindowChromePropsProvider value={chromeProps}>
        <Chrome {...chromeProps} />
      </HostAppWindowChromePropsProvider>
    </WindowChromeFailureBoundary>,
    slot.slotElement,
  );
}

/** A chrome renderer crash must never take the window down: the boundary
 * reports the failure to the host (which swaps the theme's system titlebar
 * back in) and captures the error into the runtime error manager.
 * It renders nothing on failure — the host's system fallback owns the bar. */
class WindowChromeFailureBoundary extends React.Component<{
  readonly runtime: SynCloudOSRuntime;
  readonly applicationId: string | null;
  readonly onFallback: () => void;
  readonly children: React.ReactNode;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    try {
      const { applicationId, runtime } = this.props;
      const appName = applicationId ? runtime.store.getSnapshot().appInfo[normalizeBundleIdentifier(applicationId)]?.displayName : undefined;
      runtime.errors.capture({
        code: "APP_CONTENT_FAILED",
        title: "Window controls were reset.",
        message: `${appName ? `${appName}'s` : "The application's"} custom window controls stopped working, so the standard title bar has been restored.`,
        error,
        ...(applicationId ? { appId: applicationId } : {}),
        source: "Webspring.WindowChromeFailureBoundary",
        context: { componentStack: errorInfo.componentStack },
        severity: "error",
        recoverable: true,
        suggestedActions: [],
      });
    } finally {
      this.props.onFallback();
    }
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
