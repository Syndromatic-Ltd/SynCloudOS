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

import { createContext, useContext } from "react";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import type { SynWareRuntime } from "./appRuntimeTypes";

export const SynCloudOSRuntimeContext = createContext<SynCloudOSRuntime | null>(null);
/** Mounted applications receive a separate AppSDK context. It intentionally
 * never replaces the kernel context, so system-owned descendants retain their
 * full internal authority without granting it to the app bundle. */
export const SynWareRuntimeContext = createContext<SynWareRuntime | null>(null);

export function useKernelSynCloudOS(): SynCloudOSRuntime {
  const runtime = useContext(SynCloudOSRuntimeContext);
  if (!runtime) throw new Error("useKernelSynCloudOS must be used within SynCloudOSProvider.");
  return runtime;
}

