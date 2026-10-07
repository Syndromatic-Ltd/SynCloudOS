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

export type SynCloudOSServiceAvailability = "available" | "unavailable" | "future";
export type SynCloudOSServiceHealth = "healthy" | "degraded" | "unavailable" | "future";

export interface SynCloudOSServiceCapabilityMetadata {
  owner?: string;
  tier?: string;
  tags?: string[];
  notes?: string;
}

export interface SynCloudOSServiceProviderRef {
  id: string;
  displayName?: string;
  phase?: "core" | "optional" | "content" | "app" | "diagnostic" | "future";
}

export interface SynCloudOSServiceProvider {
  id: string;
  displayName?: string;
  phase?: SynCloudOSServiceProviderRef["phase"];
  services?: SynCloudOSServiceDefinition[];
  registerServices?: () => SynCloudOSServiceDefinition[] | void;
  hydrate?: () => unknown;
  seedNotifications?: () => unknown;
}

export interface SynCloudOSServiceDefinition {
  id: string;
  displayName: string;
  description: string;
  availability: SynCloudOSServiceAvailability;
  provider?: SynCloudOSServiceProviderRef;
  dependencies?: string[];
  requiredPermission?: string;
  capabilities?: string[];
  providedCapabilities?: string[];
  requiredCapabilities?: string[];
  optionalCapabilities?: string[];
  capabilityMetadata?: SynCloudOSServiceCapabilityMetadata;
  metadata?: Record<string, unknown>;
  internal?: boolean;
}

export interface SynCloudOSServiceMissingDependency {
  serviceId: string;
  dependencyId: string;
}

export interface SynCloudOSServiceReportItem {
  serviceId: string;
  available: boolean;
  status: SynCloudOSServiceAvailability;
  health: SynCloudOSServiceHealth;
  displayName?: string;
  description?: string;
  provider?: SynCloudOSServiceProviderRef;
  internal?: boolean;
  requiredPermission?: string;
  capabilities?: string[];
  providedCapabilities?: string[];
  requiredCapabilities?: string[];
  optionalCapabilities?: string[];
  capabilityMetadata?: SynCloudOSServiceCapabilityMetadata;
  metadata?: Record<string, unknown>;
  dependencyIds: string[];
  missingDependencyIds: string[];
  blockingServiceIds: string[];
  cyclePaths: string[][];
  dependencies: SynCloudOSServiceReportItem[];
  reason?: string;
}

export interface SynCloudOSServiceReport {
  ok: boolean;
  requiredServices: string[];
  items: SynCloudOSServiceReportItem[];
  missing: string[];
  checkedAt: number;
  health: SynCloudOSServiceHealth;
}

export interface SynCloudOSServiceHealthReport {
  ok: boolean;
  health: SynCloudOSServiceHealth;
  checkedAt: number;
  serviceCount: number;
  availableCount: number;
  unavailableCount: number;
  futureCount: number;
  degradedCount: number;
  requiredServices: string[];
  services: SynCloudOSServiceReportItem[];
  missing: string[];
  degraded: string[];
  unavailable: string[];
  future: string[];
  appDependencies: Array<{
    appId: string;
    packageName: string;
    requiredServices: string[];
    ok: boolean;
    missing: string[];
    health: SynCloudOSServiceHealth;
    disabled: boolean;
    blockers: string[];
  }>;
  requiredReport: SynCloudOSServiceReport;
  dependencyReport: SynCloudOSServiceDependencyReport;
  missingDependencies: SynCloudOSServiceMissingDependency[];
  cyclePaths: string[][];
}

export interface SynCloudOSServiceDependencyReport {
  ok: boolean;
  checkedAt: number;
  rootServiceIds: string[];
  serviceIds: string[];
  directGraph: Record<string, string[]>;
  reverseGraph: Record<string, string[]>;
  transitiveDependencies: Record<string, string[]>;
  transitiveDependents: Record<string, string[]>;
  missingDependencies: SynCloudOSServiceMissingDependency[];
  cyclePaths: string[][];
  services: SynCloudOSServiceReportItem[];
}

export interface SynCloudOSServiceImpactApp {
  appId: string;
  packageName: string;
  displayName: string;
  requiredServices: string[];
  impactedServices: string[];
  direct: boolean;
  ok: boolean;
  disabled: boolean;
  missing: string[];
  blockers: string[];
}

export interface SynCloudOSServiceImpactReport {
  serviceId: string;
  exists: boolean;
  checkedAt: number;
  service: SynCloudOSServiceReportItem;
  affectedServices: string[];
  affectedApps: SynCloudOSServiceImpactApp[];
  disabledApps: SynCloudOSServiceImpactApp[];
  blockers: string[];
  dependencyReport: SynCloudOSServiceDependencyReport;
}

export interface SynCloudOSServiceExplanation {
  serviceId: string;
  exists: boolean;
  health: SynCloudOSServiceHealth;
  service: SynCloudOSServiceReportItem;
  dependents: string[];
  transitiveDependencies: string[];
  transitiveDependents: string[];
  missingDependencies: SynCloudOSServiceMissingDependency[];
  cyclePaths: string[][];
  appDependents: Array<{ appId: string; packageName: string }>;
  impact: SynCloudOSServiceImpactReport;
  reasons: string[];
  at: number;
}
