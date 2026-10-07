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

import { useMemo, type PropsWithChildren } from "react";
import { FontCatalogueProvider, useFontCatalogue, type SynWareFontCatalogue } from "../SynCloudOS/AppSDK/fontAccess";
import { NSEFontManager } from "../NSE/Typography";
import type { NSEFontFamily } from "../NSE/Typography";

const emptyFamilies: readonly NSEFontFamily[] = Object.freeze([]);

/** Browser-host typography configuration; no site fonts or browser enumeration. */
export function HostFontsProvider({ families = emptyFamilies, catalogue, children }: PropsWithChildren<{ readonly families?: readonly NSEFontFamily[]; readonly catalogue?: SynWareFontCatalogue }>) {
  const manager = useMemo(() => new NSEFontManager({ families }), [families]);
  const supplied = useMemo(() => catalogue ?? Object.freeze({ manager }), [catalogue, manager]);
  return <FontCatalogueProvider catalogue={supplied}>{children}</FontCatalogueProvider>;
}

export function useHostFontManager(): NSEFontManager {
  return useFontCatalogue().manager;
}
