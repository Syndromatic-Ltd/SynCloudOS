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

import { useMemo, useSyncExternalStore } from "react";
import { createLocaleServicesFacade, type SynCloudOSAppearance, type SynCloudOSResolvedMode, type SynCloudOSSettings } from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "./SynCloudOSProvider";
import { useRuntimeSelector } from "./runtimeHooks";

export function useResolvedMode(): SynCloudOSResolvedMode {
  const service = useKernelSynCloudOS().appearance;
  return useSyncExternalStore(service.subscribe, service.resolved, () => "light");
}

export function useAppearance(): SynCloudOSAppearance {
  const service = useKernelSynCloudOS().appearance;
  return useSyncExternalStore(service.subscribe, service.get, () => "auto");
}

export function useSettings(): SynCloudOSSettings {
  const service = useKernelSynCloudOS().settings;
  return useSyncExternalStore(service.subscribe, service.get, service.get);
}

export function useLocaleServicesSnapshot() {
  return useRuntimeSelector((snapshot) => snapshot.localeServices);
}

export function useActiveLocale() {
  return useLocaleServicesSnapshot().activeLocale;
}

export function useLocaleFormatter() {
  const runtime = useKernelSynCloudOS();
  const services = useMemo(() => createLocaleServicesFacade(runtime), [runtime]);
  const activeLocale = useActiveLocale();
  return useMemo(() => ({
    activeLocale,
    formatDate: services.formatDate.bind(services),
    formatTime: services.formatTime.bind(services),
    formatNumber: services.formatNumber.bind(services),
    formatFileSize: services.formatFileSize.bind(services),
    formatRelativeTime: services.formatRelativeTime.bind(services),
    formatList: services.formatList.bind(services),
    t: services.t.bind(services),
  }), [activeLocale, services]);
}
