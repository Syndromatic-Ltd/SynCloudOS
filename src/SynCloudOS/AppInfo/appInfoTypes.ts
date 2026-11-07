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

import type { SynCloudOSAppFrameManifest, SynCloudOSAppManifest } from "../AppRegistry/appRegistryTypes";

export type SynCloudOSAppInfoIssueSeverity = "error" | "warning";

export interface SynCloudOSAppInfoIssue {
  severity: SynCloudOSAppInfoIssueSeverity;
  code: string;
  field: string;
  message: string;
}

export interface SynCloudOSAppInfoValidationReport {
  ok: boolean;
  manifestId: string | null;
  packageName: string | null;
  issues: SynCloudOSAppInfoIssue[];
  errors: SynCloudOSAppInfoIssue[];
  warnings: SynCloudOSAppInfoIssue[];
}

export interface SynCloudOSAppInfoNormalisationNote {
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
}

export interface SynCloudOSAppInfoExplanation {
  packageName: string;
  bundleIdentifier: string;
  displayName: string;
  route: string;
  path: string;
  type: SynCloudOSAppManifest["type"];
  presentation: NonNullable<SynCloudOSAppManifest["presentation"]>;
  visibleOnWebspring: boolean;
  hasAccessToRequiredServices: boolean;
  unavailableServices: string[];
  unavailableOptionalServices: string[];
  status: "registered" | "disabled";
  reason: string;
}

export interface SynCloudOSAppInfo extends SynCloudOSAppManifest {
  frame: SynCloudOSAppFrameManifest;
  capitalizedName: string;
  registeredAt: number;
  normalizedAt: number;
  normalisationNotes: SynCloudOSAppInfoNormalisationNote[];
  isReady: boolean;
  isDisabled: boolean;
  isFailed: boolean;
  hasAccessToRequiredServices: boolean;
  serviceStatus: Record<string, boolean>;
  optionalServiceStatus: Record<string, boolean>;
  unavailableOptionalServices: string[];
  requestedStartupUrl?: string;
  startupResponse?: unknown;
}

export interface AppInfoModule {
  create(manifest: SynCloudOSAppManifest): SynCloudOSAppInfo;
  validate(manifest: unknown): SynCloudOSAppInfoValidationReport;
  normalise(manifest: SynCloudOSAppManifest): {
    info: SynCloudOSAppInfo;
    validation: SynCloudOSAppInfoValidationReport;
    normalisationNotes: SynCloudOSAppInfoNormalisationNote[];
    explanation: SynCloudOSAppInfoExplanation;
  };
  explain(appInfo: SynCloudOSAppInfo): SynCloudOSAppInfoExplanation;
}
