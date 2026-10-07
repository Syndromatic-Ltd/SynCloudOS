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

import type { SynCloudOSPolicyRequest, SynCloudOSPolicySubject, SynCloudOSPolicySubjectGrant } from "../PolicyKit/policyTypes";

export type SynCloudOSPluginStatus = "enabled" | "disabled";

export interface SynCloudOSPlugin {
  id: string;
  name: string;
  version: string;
  register?: (SynCloudOS: unknown) => void | Promise<void>;
  enable?: () => void | Promise<void>;
  disable?: () => void | Promise<void>;
}

export interface SynCloudOSPluginRecord {
  plugin: SynCloudOSPlugin;
  status: SynCloudOSPluginStatus;
  registeredAt: number;
  enabledAt: number | null;
  disabledAt: number | null;
}

export interface SynCloudOSPluginRegisterOptions {
  /** Descriptive; evaluated only together with a PolicyKit-issued grant. */
  subject?: SynCloudOSPolicySubject;
  subjectGrant?: SynCloudOSPolicySubjectGrant;
  origin?: SynCloudOSPolicyRequest["origin"];
  source?: string;
  context?: Record<string, unknown>;
}
