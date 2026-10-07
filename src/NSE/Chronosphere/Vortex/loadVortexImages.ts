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

import type { ChronosphereImageClient } from "../chronosphereEnvironment";
import type { GFXImage } from "../../../FX/GraphicsFX/GFXImage";
import { vortexAssets } from "./vortexAssets";

export type VortexImages = Record<keyof typeof vortexAssets, GFXImage>;

/** Transfer immutable pixels, then release all source-resource leases. */
export async function loadVortexImages(client: ChronosphereImageClient, signal: AbortSignal): Promise<VortexImages> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const resources: ReturnType<ChronosphereImageClient["load"]>[] = [];
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    const entries = Object.entries(vortexAssets);
    // Acquire synchronously so an acquisition failure can release every prior
    // resource before any asynchronously completed pixels reach the view.
    for (const [key, url] of entries) resources.push(client.load({ source: { kind: "app-asset", path: url }, accessibleLabel: `Vortex ${key}`, renderingMode: "original" }));
    controller.signal.throwIfAborted();
    const values = await Promise.all(resources.map(async resource => {
      const lease = await resource.pixelLease(controller.signal);
      try {
        controller.signal.throwIfAborted();
        return lease.transferImage();
      } finally { lease.release(); }
    }));
    controller.signal.throwIfAborted();
    return Object.fromEntries(entries.map(([key], index) => [key, values[index]])) as VortexImages;
  } finally {
    controller.abort();
    signal.removeEventListener("abort", abort);
    for (const resource of resources) resource.release();
  }
}
