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

import type { SynCloudOSRuntime } from "../SynCloudOS";
import type { ConformanceInspectorExport, ConformanceInspectorSnapshot, ConformanceInspectorSnapshotOptions } from "./conformanceInspectorTypes";
import { assertConformanceInspectorSnapshot } from "./conformanceInspectorValidation";

/**
 * Reads the runtime's deliberately narrow inspector port.  The aggregator has
 * no access to stores, registries, managers or adapter authorities, so every
 * developer and Diagnostics consumer receives the same bounded projection.
 */
export function createConformanceInspectorSnapshot(
  runtime: Pick<SynCloudOSRuntime, "inspector">,
  options: ConformanceInspectorSnapshotOptions = {},
): ConformanceInspectorSnapshot {
  const snapshot = runtime.inspector.getConformanceSnapshot(options);
  assertConformanceInspectorSnapshot(snapshot);
  return snapshot;
}

/** Schedules an on-demand snapshot. Callers own the passed abort signal and
 * can safely drop stale completions without reaching into the runtime graph. */
export async function refreshConformanceInspectorSnapshot(
  runtime: Pick<SynCloudOSRuntime, "inspector">,
  options: ConformanceInspectorSnapshotOptions = {},
): Promise<ConformanceInspectorSnapshot> {
  const snapshot = await runtime.inspector.refreshConformanceSnapshot(options);
  assertConformanceInspectorSnapshot(snapshot);
  return snapshot;
}

export function exportConformanceInspectorSnapshot(
  runtime: Pick<SynCloudOSRuntime, "inspector">,
  snapshot: ConformanceInspectorSnapshot,
): ConformanceInspectorExport {
  return runtime.inspector.exportConformanceSnapshot(snapshot);
}
