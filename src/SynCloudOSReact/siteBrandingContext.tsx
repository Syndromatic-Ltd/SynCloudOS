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

import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import type { ResolvedSiteBranding } from "../SynCloudOS/SynCloudOS";

const SiteBrandingContext = createContext<ResolvedSiteBranding | null>(null);

function sameSiteBranding(left: ResolvedSiteBranding | null, right: ResolvedSiteBranding | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.name === right.name
    && left.logoUrl === right.logoUrl
    && left.logoAlt === right.logoAlt
    && left.lightLogoUrl === right.lightLogoUrl
    && left.darkLogoUrl === right.darkLogoUrl
    && left.compactLogoUrl === right.compactLogoUrl;
}

export function HostSiteBrandingProvider({ value, children }: PropsWithChildren<{ readonly value: ResolvedSiteBranding | null }>) {
  const stableValue = useRef(value);
  if (!sameSiteBranding(stableValue.current, value)) stableValue.current = value;
  return <SiteBrandingContext.Provider value={stableValue.current}>{children}</SiteBrandingContext.Provider>;
}
export function useHostSiteBranding() { return useContext(SiteBrandingContext); }
