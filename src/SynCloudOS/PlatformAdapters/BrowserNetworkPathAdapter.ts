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

import type { NWFXCapabilities, NWFXInterfaceType, NWFXPath } from "../../FX/NetworkFX/NWFXPath";
import type { NWFXNetworkPathAdapter } from "../../FX/NetworkFX/NWFXPathMonitor";
interface NetworkInformation extends Pick<EventTarget, "addEventListener" | "removeEventListener"> {
  readonly type?: string;
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
}
export interface BrowserNetworkPathEnvironment {
  readonly navigator?: { readonly onLine?: boolean; readonly connection?: NetworkInformation };
  readonly eventTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
}
const finite = (value: number | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const transport = (value: string | undefined): NWFXInterfaceType | null => {
  if (value === "wifi") return "wifi";
  if (value === "cellular") return "cellular";
  if (value === "ethernet") return "wiredEthernet";
  if (value === "other") return "other";
  return null;
};
export class BrowserNetworkPathAdapter implements NWFXNetworkPathAdapter {
  constructor(private readonly environment: BrowserNetworkPathEnvironment = {}) {}
  capabilities(): NWFXCapabilities {
    const nav = this.environment.navigator;
    return Object.freeze({ pathMonitoring: typeof nav?.onLine === "boolean" && !!this.environment.eventTarget,
      networkInformation: !!nav?.connection, interfaceType: transport(nav?.connection?.type) !== null,
      expensive: false, constrained: false, authorizationPrompt: false });
  }
  currentPath(): NWFXPath | null {
    if (!this.capabilities().pathMonitoring) return null;
    const nav = this.environment.navigator!;
    const info = nav.connection;
    return Object.freeze({ status: nav.onLine ? "satisfied" : "unsatisfied", interfaceType: transport(info?.type),
      isExpensive: null, isConstrained: null, saveData: typeof info?.saveData === "boolean" ? info.saveData : null,
      effectiveType: typeof info?.effectiveType === "string" ? info.effectiveType : null,
      downlinkMegabitsPerSecond: finite(info?.downlink), roundTripTimeMilliseconds: finite(info?.rtt), source: "browserHint" });
  }
  subscribe(listener: (path: NWFXPath) => void): { dispose(): void } {
    if (!this.capabilities().pathMonitoring) throw new DOMException("Network path monitoring is unavailable.", "NotSupportedError");
    const target = this.environment.eventTarget!;
    const info = this.environment.navigator?.connection;
    let disposed = false;
    const update = () => { if (!disposed) { const path = this.currentPath(); if (path) listener(path); } };
    target.addEventListener("online", update);
    target.addEventListener("offline", update);
    info?.addEventListener("change", update);
    return Object.freeze({ dispose() {
      if (disposed) return;
      disposed = true;
      target.removeEventListener("online", update);
      target.removeEventListener("offline", update);
      info?.removeEventListener("change", update);
    } });
  }
}
