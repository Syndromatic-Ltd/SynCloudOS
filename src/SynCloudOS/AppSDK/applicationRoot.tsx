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

import { useContext, useLayoutEffect, useSyncExternalStore, type ComponentType } from "react";
import { SynCloudOSRuntimeContext, SynWareRuntimeContext } from "../../SynCloudOSReact/runtimeContext";
import { NSEControllerResponder, NSEWindowControllerView } from "./applicationHosting";
import { ensureApplicationSession, type ApplicationSessionSource } from "./applicationSession";

/**
 * The root component of a class-based application. Every window the host
 * mounts renders through it: it finds (or creates) the window controller for
 * the window and shows that controller's content, inside the application's
 * own responder so its `@action`s reach every window.
 */
export function createApplicationRoot(source: ApplicationSessionSource): ComponentType {
  function NSEApplicationRoot() {
    const appRuntime = useContext(SynWareRuntimeContext);
    const kernel = useContext(SynCloudOSRuntimeContext);
    if (!appRuntime) throw new Error(`${source.appName} must render inside a mounted application.`);
    const windows = appRuntime.windows;
    const snapshot = useSyncExternalStore(windows.subscribe, windows.getSnapshot, windows.getSnapshot);
    // A departing tree keeps rendering for a moment after the application closed; it must not start a new one.
    const session = appRuntime.signal.aborted
      ? null
      : ensureApplicationSession({ runtimeId: appRuntime.id, appId: appRuntime.app.id }, source);
    useLayoutEffect(() => session?.attachMount(windows, kernel), [session, windows, kernel]);
    const controller = session?.controllerFor(snapshot.surface === "window" ? snapshot.current : null) ?? null;
    if (!session || !controller) return null;
    return (
      <NSEControllerResponder target={session.app} kind="controller">
        <NSEWindowControllerView controller={controller} />
      </NSEControllerResponder>
    );
  }
  NSEApplicationRoot.displayName = `NSEApplicationRoot(${source.appName})`;
  return NSEApplicationRoot;
}
