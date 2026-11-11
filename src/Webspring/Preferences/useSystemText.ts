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

import { useMemo } from "react";
import { createLocaleServicesFacade } from "../../SynCloudOS/SynCloudOS";
import type { SynCloudOSTranslationParams } from "../../SynCloudOS/LocaleServices";
import { useKernelSynCloudOS, useLocaleServicesSnapshot } from "../../SynCloudOSReact";
import { systemT } from "../systemStrings";

export type SystemText = (key: string, fallback: string, params?: SynCloudOSTranslationParams) => string;

/** System-dictionary translation, re-bound whenever the active locale or its dictionary changes. */
export function useSystemText(): SystemText {
  const runtime = useKernelSynCloudOS();
  const locale = useLocaleServicesSnapshot();
  const services = useMemo(() => createLocaleServicesFacade(runtime), [runtime]);
  return useMemo<SystemText>(
    () => (key, fallback, params) => systemT(key, fallback, params, services),
    [locale.activeLocale, locale.dictionaryVersion, services],
  );
}
