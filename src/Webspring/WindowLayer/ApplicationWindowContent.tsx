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

import React, { useEffect, useRef } from "react";
import {
  AppPresentationErrorFallback,
  SynCloudOSWatchdog,
  type SynCloudOSAppInfo,
  type SynCloudOSRuntime,
} from "../../SynCloudOS/SynCloudOS";
import { useRuntimeSelector } from "../../SynCloudOSReact";
import { WindowContentRendererRegistry } from "./WindowContentRendererRegistry";
import { useWebspringLocale } from "../webspringLocale";
import { WEBSPRING_PRESENTATION_ROLES } from "../../SynCloudOS/SynCloudOS";
import { SynWareEntryRenderer } from "../SynWareEntryRenderer";

function ApplicationWindowContent({
  runtime,
  app,
  windowControllerId,
  zIndex,
}: {
  readonly runtime: SynCloudOSRuntime;
  readonly app: SynCloudOSAppInfo;
  readonly windowControllerId: string;
  readonly zIndex: number;
}) {
  const locale = useWebspringLocale();
  const lifecycle = useRuntimeSelector((snapshot) => snapshot.lifecycle[app.id] ?? "registered");
  const presentationSettlementId = useRuntimeSelector((snapshot) => snapshot.webspring.presentationSettlementId);
  const completedSettlementRef = useRef<string | null>(null);
  const loading = lifecycle === "loading" || lifecycle === "launching";
  useEffect(() => {
    if (!presentationSettlementId || completedSettlementRef.current === presentationSettlementId) return;
    const settlement = runtime.presentationSettlements.get(presentationSettlementId);
    if (settlement?.completeRole(WEBSPRING_PRESENTATION_ROLES.applicationEnter)) {
      completedSettlementRef.current = presentationSettlementId;
    }
  }, [presentationSettlementId, runtime]);

  return (
    <SynCloudOSWatchdog
      runtime={runtime}
      watchdogName={`${app.packageName} window presentation`}
      scope="app"
      app={app}
      presentation={{ id: windowControllerId, kind: "window", zIndex }}
      resetKey={`${windowControllerId}:${app.id}`}
      fallback={() => (
        <AppPresentationErrorFallback
          app={app}
          presentation={{ id: windowControllerId, kind: "window", zIndex }}
        />
      )}
    >
      <SynWareEntryRenderer
        runtime={runtime}
        app={app}
        responderId={`window:${windowControllerId}`}
        windowControllerId={windowControllerId}
        isLoading={loading}
        loadingClassName="webspring-window-loading"
        loadingLabel={locale.t("apps.loading", "Loading {app}", { app: locale.appName(app) })}
        loadingPackageLabel={locale.t("apps.loadingPackage", "Loading {packageName}", { packageName: app.packageName })}
        missingComponentLabel={locale.t(
          "apps.missingComponent",
          "SynCloudOS could not find a component for {packageName}.",
          { packageName: app.packageName },
        )}
      />
    </SynCloudOSWatchdog>
  );
}

export type ApplicationWindowRendererRegistrations = Map<string, {
  readonly app: SynCloudOSAppInfo;
  readonly handle: ReturnType<WindowContentRendererRegistry["register"]>;
}>;

/**
 * Brings a long-lived registry's application renderers in line with the
 * registered apps, in place. The registry itself must outlive app changes:
 * transient surfaces (the system's Font and Colours panels, an app's sheets)
 * keep their renderers in it while apps launch and quit.
 */
export function syncApplicationWindowContentRenderers(
  registry: WindowContentRendererRegistry,
  runtime: SynCloudOSRuntime,
  apps: Readonly<Record<string, SynCloudOSAppInfo>>,
  registrations: ApplicationWindowRendererRegistrations,
): void {
  const renderer = (app: SynCloudOSAppInfo) => ({ window }: { readonly window: { readonly id: string; readonly zIndex: number } }) => (
    <ApplicationWindowContent runtime={runtime} app={app} windowControllerId={window.id} zIndex={window.zIndex} />
  );
  for (const [id, registration] of registrations) {
    if (apps[id]) continue;
    registration.handle.dispose();
    registrations.delete(id);
  }
  for (const app of Object.values(apps)) {
    const current = registrations.get(app.id);
    if (current?.app === app) continue;
    if (current) {
      current.handle.update(renderer(app));
      registrations.set(app.id, { app, handle: current.handle });
    } else {
      registrations.set(app.id, { app, handle: registry.register(`application:${app.id}`, renderer(app)) });
    }
  }
}

export function createApplicationWindowContentRendererRegistry(
  runtime: SynCloudOSRuntime,
  apps: Readonly<Record<string, SynCloudOSAppInfo>>,
): WindowContentRendererRegistry {
  const registry = new WindowContentRendererRegistry();
  for (const app of Object.values(apps)) {
    registry.register(`application:${app.id}`, ({ window }) => (
      <ApplicationWindowContent
        runtime={runtime}
        app={app}
        windowControllerId={window.id}
        zIndex={window.zIndex}
      />
    ));
  }
  return registry;
}
