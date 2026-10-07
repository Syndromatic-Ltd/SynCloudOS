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

import type { SynCloudOSRuntime } from "./runtimeInstanceTypes";
import type { DocumentController } from "../Documents";
import type { SynCloudOSDocumentStore } from "./runtimeInstanceTypes";

let diagnosticDefault: SynCloudOSRuntime | null = null;

export function setDefaultSynCloudOSRuntime(runtime: SynCloudOSRuntime): void {
  if (diagnosticDefault && diagnosticDefault !== runtime) {
    throw new Error("A diagnostic default runtime is already set; clear it explicitly first.");
  }
  diagnosticDefault = runtime;
}

export function getDefaultSynCloudOSRuntime(): SynCloudOSRuntime | null {
  return diagnosticDefault;
}

export function getDefaultApplicationDocuments(): DocumentController | null {
  return diagnosticDefault?.documents ?? null;
}

export function getDefaultDocumentStore(): SynCloudOSDocumentStore | null {
  return diagnosticDefault?.documentStore ?? null;
}

export function clearDefaultSynCloudOSRuntime(runtime?: SynCloudOSRuntime): void {
  if (!runtime || diagnosticDefault === runtime) {
    diagnosticDefault = null;
  }
}
