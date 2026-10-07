/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useSyncExternalStore } from "react";
import { useSynWare } from "../SynWareContext";
import type {
  AppAnimationClient,
  AppConnectivityClient,
  AppErrorClient,
  AppEventClient,
  AppExternalActionClient,
  AppIdentityClient,
  AppIdentitySnapshot,
  AppFilePanelClient, AppImageClient,
  AppMediaQueryClient,
  AppNotificationClient,
  AppPersistenceClient,
  AppSchedulerClient,
  AppSettingsAvailabilityClient,
  AppSettingsAvailabilitySnapshot,
  AppShareClient,
  AppTextLayoutClient,
  AppTrackingClient,
  AppWebContentClient,
  AppWorkAreaClient,
  AppWorkAreaSnapshot,
} from "../appEnvironmentClientTypes";

export function useSynWarePersistence(): AppPersistenceClient {
  return useSynWare().persistence;
}

export function useSynWareScheduler(): AppSchedulerClient {
  return useSynWare().scheduler;
}

export function useSynWareMediaQueries(): AppMediaQueryClient {
  return useSynWare().mediaQueries;
}

export function useSynWareMediaQuery(query: string): boolean {
  const client = useSynWareMediaQueries();
  const subscribe = useCallback((listener: () => void) => client.subscribe(query, listener), [client, query]);
  const getSnapshot = useCallback(() => client.getSnapshot(query), [client, query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSynWareIdentity(): AppIdentityClient {
  return useSynWare().identity;
}

export function useSynWareIdentitySnapshot(): Readonly<AppIdentitySnapshot> {
  const client = useSynWareIdentity();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

export function useSynWareNotifications(): AppNotificationClient {
  return useSynWare().notifications;
}

export function useSynWareErrors(): AppErrorClient {
  return useSynWare().errors;
}

export function useSynWareExternalActions(): AppExternalActionClient {
  return useSynWare().externalActions;
}

export function useSynWareShare(): AppShareClient {
  return useSynWare().share;
}

export function useSynWareWorkArea(): AppWorkAreaClient {
  return useSynWare().workArea;
}

export function useSynWareWorkAreaSnapshot(): Readonly<AppWorkAreaSnapshot> {
  const client = useSynWareWorkArea();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

export function useSynWareSettingsAvailability(): AppSettingsAvailabilityClient {
  return useSynWare().settingsAvailability;
}

export function useSynWareSettingsAvailabilitySnapshot(): Readonly<AppSettingsAvailabilitySnapshot> {
  const client = useSynWareSettingsAvailability();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

export function useSynWareConnectivity(): AppConnectivityClient {
  return useSynWare().connectivity;
}

export function useSynWareEvents(): AppEventClient {
  return useSynWare().events;
}

export function useSynWareTracking(): AppTrackingClient {
  return useSynWare().tracking;
}

export function useSynWareTextLayout(): AppTextLayoutClient {
  return useSynWare().textLayout;
}

export function useSynWareAnimations(): AppAnimationClient {
  return useSynWare().animations;
}

export function useSynWareImages(): AppImageClient {
  return useSynWare().images;
}

/** The application's Open panel (NSOpenPanel). */
export function useSynWareFilePanels(): AppFilePanelClient {
  return useSynWare().filePanels;
}

export function useSynWareWebContent(): AppWebContentClient {
  return useSynWare().webContent;
}
