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
import { useSCOS } from "../scos/useSCOS"
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

export function usePersistence(): AppPersistenceClient {
  return useSCOS().persistence;
}

export function useScheduler(): AppSchedulerClient {
  return useSCOS().scheduler;
}

export function useMediaQueries(): AppMediaQueryClient {
  return useSCOS().mediaQueries;
}

export function useMediaQuery(query: string): boolean {
  const client = useMediaQueries();
  const subscribe = useCallback((listener: () => void) => client.subscribe(query, listener), [client, query]);
  const getSnapshot = useCallback(() => client.getSnapshot(query), [client, query]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIdentity(): AppIdentityClient {
  return useSCOS().identity;
}

export function useIdentitySnapshot(): Readonly<AppIdentitySnapshot> {
  const client = useIdentity();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

export function useNotifications(): AppNotificationClient {
  return useSCOS().notifications;
}

export function useErrors(): AppErrorClient {
  return useSCOS().errors;
}

export function useExternalActions(): AppExternalActionClient {
  return useSCOS().externalActions;
}

export function useShare(): AppShareClient {
  return useSCOS().share;
}

export function useWorkArea(): AppWorkAreaClient {
  return useSCOS().workArea;
}

export function useWorkAreaSnapshot(): Readonly<AppWorkAreaSnapshot> {
  const client = useWorkArea();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

export function useSettingsAvailability(): AppSettingsAvailabilityClient {
  return useSCOS().settingsAvailability;
}

export function useSettingsAvailabilitySnapshot(): Readonly<AppSettingsAvailabilitySnapshot> {
  const client = useSettingsAvailability();
  return useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
}

export function useConnectivity(): AppConnectivityClient {
  return useSCOS().connectivity;
}

export function useEvents(): AppEventClient {
  return useSCOS().events;
}

export function useTracking(): AppTrackingClient {
  return useSCOS().tracking;
}

export function useTextLayout(): AppTextLayoutClient {
  return useSCOS().textLayout;
}

export function useAnimations(): AppAnimationClient {
  return useSCOS().animations;
}

export function useImages(): AppImageClient {
  return useSCOS().images;
}

/** The application's Open panel (NSOpenPanel). */
export function useFilePanels(): AppFilePanelClient {
  return useSCOS().filePanels;
}

export function useWebContent(): AppWebContentClient {
  return useSCOS().webContent;
}
