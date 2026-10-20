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

import { requireTrustedBundlePrivilege } from "../BundleLoader/trustedBundleProvenance";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { SettlementRegistry } from "../Testing/settlementTypes";
import { createInspectorOwnerSources, type InspectorRouteInspectionPort } from "./inspectorOwnerSources";
import { createInspectorProjection } from "./inspectorProjection";
import type { InspectorClient, InspectorSource } from "./inspectorTypes";
import type { InspectorLocalization } from "./inspectorLocalization";
import { translateSynWareText } from "../AppSDK/useStrings";

export interface InspectorDevHostOptions {
  readonly enabled: boolean;
  readonly runtime: SynCloudOSRuntime;
  readonly appId: string;
  readonly mountSignal: AbortSignal;
  /** Host monotonic clock, in milliseconds; never application fake/wall time. */
  now(): number;
  readonly routes?: InspectorRouteInspectionPort;
  readonly settlement?: Pick<SettlementRegistry, "runtimeId" | "getState" | "subscribe">;
  readonly historyLimit?: number;
}

export function createDevInspector(options: InspectorDevHostOptions): Readonly<{ client: InspectorClient; localization: InspectorLocalization; dispose(): void }> {
  const { runtime, appId, mountSignal } = options;
  if (!import.meta.env.DEV || !options.enabled) throw new DOMException("Development Inspector is disabled.", "SecurityError");
  const bundle = runtime.bundles.getBundle(appId);
  let disposed = false;
  const assertAccess = () => {
    if (disposed || runtime.signal.aborted || mountSignal.aborted) throw new DOMException("Inspector authority is revoked.", "InvalidStateError");
    requireTrustedBundlePrivilege(runtime, appId, "diagnostics", "diagnostics.view");
    if (runtime.bundles.getBundle(appId) !== bundle) throw new DOMException("Inspector bundle authority is revoked.", "InvalidStateError");
  };
  assertAccess();
  const events = (names: readonly string[]) => (listener: () => void) => {
    const removers = names.map(name => runtime.events.subscribe(name, () => listener()));
    return () => removers.forEach(remove => remove());
  };
  const sources: InspectorSource[] = [
    ...createInspectorOwnerSources({ runtimeId: runtime.runtimeId, operations: runtime.operations, presentation: runtime.presentationSettlements,
      routes: options.routes ?? {
        runtimeId: runtime.runtimeId,
        read: () => ({ current: { route: runtime.routes.routeGraph.current(), latestOperationId: runtime.routes.getCurrentOperationId() },
          graphs: runtime.apps.getAllApps().flatMap(app => {
            const graph = runtime.bundles.getLoadedBundle(app.bundleIdentifier)?.definition.routes;
            return graph ? [{ id: graph.id, appId: app.bundleIdentifier, routes: graph.routes }] : [];
          }), transitions: runtime.routes.inspectTransitions() }),
        subscribe: listener => {
          const removeOperations = runtime.operations.subscribe(listener);
          const removeTransitions = runtime.routes.subscribeTransitions(listener);
          return () => { removeOperations(); removeTransitions(); };
        },
      }, settlement: options.settlement }),
    { panel: "Applications", subscribe: events(["app.register", "app.register.update", "app.unregister"]),
      read: () => runtime.apps.getAllApps().map(app => ({ id: app.bundleIdentifier, kind: "application", status: "available" })) },
    { panel: "Services", subscribe: events(["service.available", "service.unavailable"]),
      read: () => runtime.services.getHealthReport().services.map(service => ({ id: service.serviceId, kind: "service", status: service.available ? "available" : "unavailable" })) },
    { panel: "Policy", subscribe: events(["policy.decision"]),
      read: () => runtime.policy.getAuditLog(128).map(decision => ({ id: decision.id, appId: decision.appId, startedAt: decision.at, kind: "policy", status: decision.allowed ? "allowed" : "denied" })) },
    { panel: "Statechart", subscribe: events(["statechart.transition.complete", "statechart.transition.failed"]),
      read: () => [{ id: runtime.statechart.getCurrentState(), kind: "statechart", status: "active" }] },
    { panel: "Windows", subscribe: listener => runtime.windows.subscribe(listener),
      read: () => runtime.windows.list().map(window => ({ id: window.record.id, appId: window.record.applicationId, kind: "window", status: window.record.state })) },
    { panel: "Documents", subscribe: listener => runtime.documents.subscribe(listener),
      read: () => runtime.documents.openDocuments.map(document => ({ id: document.id, appId: document.applicationId, kind: "document", status: document.state, revision: document.dirtyRevision })) },
  ];
  const projection = createInspectorProjection({ runtimeId: runtime.runtimeId, now: options.now, sources, historyLimit: options.historyLimit });
  const listeners = new Set<() => void>();
  const localeListeners = new Set<() => void>();
  let localeSnapshot = runtime.locale.getSnapshot();
  const unsubscribeLocale = runtime.store.subscribe(() => {
    const next = runtime.locale.getSnapshot();
    if (next.activeLocale === localeSnapshot.activeLocale && next.direction === localeSnapshot.direction && next.dictionaryVersion === localeSnapshot.dictionaryVersion) return;
    localeSnapshot = next;
    for (const listener of [...localeListeners]) { try { listener(); } catch { /* Observer isolation. */ } }
  });
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Observer isolation. */ } } };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    runtime.signal.removeEventListener("abort", dispose); mountSignal.removeEventListener("abort", dispose);
    unsubscribe(); unregister(); unsubscribeLocale(); projection.dispose(); notify(); listeners.clear(); localeListeners.clear();
  };
  const unsubscribe = projection.subscribe(() => { try { assertAccess(); } catch { dispose(); return; } notify(); });
  const unregister = events(["app.register.update", "app.unregister"])(() => { try { assertAccess(); } catch { dispose(); } });
  runtime.signal.addEventListener("abort", dispose, { once: true }); mountSignal.addEventListener("abort", dispose, { once: true });
  const client: InspectorClient = Object.freeze({
    getSnapshot() { assertAccess(); return projection.getSnapshot(); },
    getPage(panel, request) { assertAccess(); return projection.getPage(panel, request); },
    getEvents(request) { assertAccess(); return projection.getEvents(request); },
    subscribe(listener) { assertAccess(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    pause() { assertAccess(); projection.pause(); },
    resume() { assertAccess(); projection.resume(); },
    exportSnapshot(snapshot) { assertAccess(); return projection.exportSnapshot(snapshot); },
  } satisfies InspectorClient);
  const localization: InspectorLocalization = Object.freeze({
    getSnapshot() { assertAccess(); const current = runtime.locale.getSnapshot(); return Object.freeze({ locale: current.activeLocale, direction: current.direction, dictionaryVersion: current.dictionaryVersion }); },
    subscribe(listener) { assertAccess(); localeListeners.add(listener); return () => { localeListeners.delete(listener); }; },
    t(key, fallback, params) { assertAccess(); return translateSynWareText("diagnostics", key, fallback, params, undefined, runtime.locale); },
  } satisfies InspectorLocalization);
  return Object.freeze({ client, localization, dispose });
}
