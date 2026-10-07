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

import type { SynCloudOSServiceReport } from "../ServiceRegistry/serviceTypes";

export type SynCloudOSAppLifecycleState =
  | "registered"
  | "idle"
  | "loading"
  | "ready"
  | "launching"
  | "active"
  | "suspended"
  | "failed"
  | "closed"
  | "disabled";

export interface AppLifecycleEvent {
  appId: string;
  from: SynCloudOSAppLifecycleState;
  to: SynCloudOSAppLifecycleState;
  reason?: string;
  at: number;
}

export interface AppManagerRuntimeRecord {
  appId: string;
  lifecycleState: SynCloudOSAppLifecycleState;
  readiness: "cold" | "loading" | "ready" | "failed";
  requiredServices: Record<string, boolean>;
  disabled: boolean;
  activeAt: number | null;
  suspendedAt: number | null;
  failedAt: number | null;
  closedAt: number | null;
  launchCount: number;
  lastLaunchAt: number | null;
  lastError: string | null;
}

export interface AppManagerLaunchExplanation {
  appId: string;
  canLaunch: boolean;
  reason: string;
  blockers: string[];
  lifecycleState: SynCloudOSAppLifecycleState;
  serviceReport: SynCloudOSServiceReport;
  disabled: boolean;
}
