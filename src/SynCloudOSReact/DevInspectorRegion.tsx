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

import { useEffect, useMemo, useState } from "react";
import { hasTrustedBundlePrivilege } from "../SynCloudOS/BundleLoader/trustedBundleProvenance";
import type { SynCloudOSRuntime } from "../SynCloudOS/Runtime/runtimeInstanceTypes";
import type { SettlementRegistry } from "../SynCloudOS/Testing/settlementTypes";
import type { InspectorRouteInspectionPort } from "../SynCloudOS/Inspector/inspectorOwnerSources";

export interface DevInspectorRegionProps {
  readonly runtime: SynCloudOSRuntime;
  readonly appId: string;
  readonly mountSignal: AbortSignal;
  readonly enabled: boolean;
  readonly settlement?: Pick<SettlementRegistry, "runtimeId" | "getState" | "subscribe">;
  readonly routes?: InspectorRouteInspectionPort;
}
type InspectorSession = NonNullable<Awaited<ReturnType<typeof import("../SynCloudOS/Inspector/inspectorDevEntry")["loadInspector"]>>>;

/** Private host composition only. Deliberately absent from browser/AppSDK barrels. */
export function DevInspectorRegion(props: DevInspectorRegionProps) {
  if (import.meta.env.DEV) return <EnabledInspectorRegion {...props} />;
  return null;
}

function EnabledInspectorRegion({ runtime, appId, mountSignal, enabled, routes, settlement }: DevInspectorRegionProps) {
  const request = useMemo(() => ({ runtime, appId, mountSignal, enabled, routes, settlement }), [runtime, appId, mountSignal, enabled, routes, settlement]);
  const [active, setActive] = useState<{ request: typeof request; session: InspectorSession } | null>(null);
  useEffect(() => {
    setActive(null);
    const authorized = () => enabled && appId === "diagnostics" && !mountSignal.aborted && !runtime.signal.aborted
      && hasTrustedBundlePrivilege(runtime, appId, "diagnostics", "diagnostics.view");
    if (!authorized()) return;
    const bundle = runtime.bundles.getBundle(appId);
    const controller = new AbortController();
    let live = true;
    let session: InspectorSession | null = null;
    const disposeSession = () => { const prior = session; session = null; prior?.dispose(); };
    const current = () => live && !controller.signal.aborted && authorized() && runtime.bundles.getBundle(appId) === bundle;
    const revoke = () => {
      controller.abort(); disposeSession();
      if (live) setActive(null);
    };
    const onRegistration = () => { if (!current()) revoke(); };
    const removers = [runtime.events.subscribe("app.unregister", onRegistration), runtime.events.subscribe("app.register.update", onRegistration)];
    mountSignal.addEventListener("abort", revoke, { once: true });
    runtime.signal.addEventListener("abort", revoke, { once: true });
    if (import.meta.env.DEV) {
      void Promise.resolve().then(async () => {
        if (!current()) return;
        const { loadInspector } = await import("../SynCloudOS/Inspector/inspectorDevEntry");
        if (!current()) return;
        const loaded = await loadInspector({ runtime, appId, enabled, mountSignal: controller.signal,
          now: () => performance.now(), routes, settlement });
        if (!current()) { loaded?.dispose(); return; }
        session = loaded;
        if (loaded) setActive({ request, session: loaded });
      }).catch(() => {
        // Import/provider errors may contain URLs or credentials. Diagnostics'
        // ordinary surface stays available; no raw error enters its UI.
        if (live) revoke();
      });
    }
    return () => {
      live = false; controller.abort(); disposeSession();
      removers.forEach(remove => remove());
      mountSignal.removeEventListener("abort", revoke); runtime.signal.removeEventListener("abort", revoke);
    };
  }, [request, runtime, appId, enabled, mountSignal, routes, settlement]);
  if (!active || active.request !== request || !enabled || mountSignal.aborted || runtime.signal.aborted) return null;
  const { View, client, localization } = active.session;
  return <View client={client} localization={localization} />;
}
