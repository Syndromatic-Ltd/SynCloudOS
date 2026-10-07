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

import type {
  AppClientHandle,
} from "./appClientTypes";

/** Trusted-client contracts deliberately model only the bounded operations a
 * reviewed system app needs. The host verifies provenance and a manifest
 * capability on every call; these types do not carry an identity token. */
export interface AppTrustedDiagnosticsClient {
  refreshConformanceSnapshot(options?: Readonly<{ signal?: AbortSignal }>): Promise<unknown>;
  exportConformanceSnapshot(snapshot: unknown): unknown;
}

export interface AppTrustedConformanceAppearanceFact {
  readonly slot: string;
  readonly status: "covered" | "unresolved" | "provenance-violation";
}

export interface AppTrustedConformanceAccessibilityFinding {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
}

/** Diagnostic counters are conformance evidence, not ordinary media-client
 * authority. They remain host-produced and deliberately expose no manager. */
export interface AppTrustedConformanceRuntimeEvidence {
  readonly trackingRegionCount: number;
  readonly activeTextMeasurementNodeCount: number;
  readonly activeImageReferenceCount: number;
  readonly activeAnimationCount: number;
  readonly soundHandleCount: number;
  readonly webContentSessionCount: number;
}

/** System-locale metadata is intentionally trusted evidence: a regular
 * application receives only locale formatting and its current locale. */
export interface AppTrustedConformanceLocaleEvidence {
  readonly locale: string;
  readonly supportedLocales: readonly Readonly<{
    readonly code: string;
    readonly englishName: string;
    readonly nativeName: string;
    readonly direction: "ltr" | "rtl";
    readonly translationCompleteness: "stub" | "partial" | "complete";
  }>[];
}

export interface AppTrustedConformanceClient {
  registerAppearanceFact(fact: Readonly<AppTrustedConformanceAppearanceFact>): AppClientHandle;
  registerAccessibilityFinding(finding: Readonly<AppTrustedConformanceAccessibilityFinding>): AppClientHandle;
  getRuntimeEvidence(): AppTrustedConformanceRuntimeEvidence;
  getLocaleEvidence(): AppTrustedConformanceLocaleEvidence;
}


export interface AppTrustedClient {
  /** Absent unless the current bundle has host-minted diagnostics provenance
   * and declares its capability. An already-issued client still revalidates
   * on every operation in case that registration is replaced. */
  readonly diagnostics?: AppTrustedDiagnosticsClient;
  readonly conformance?: AppTrustedConformanceClient;
}
