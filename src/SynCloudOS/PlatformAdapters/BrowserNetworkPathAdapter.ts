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

import type { NWFXInterfaceType } from "../../FX/NetworkFX/NWFXInterfaceType";
import { NWFXError } from "../../FX/NetworkFX/NWFXError";
import type { NetworkPathAdapter, NetworkPathSnapshot } from "../../FX/NetworkFX/internal/networkPort";
interface NetworkInformation extends Pick<EventTarget, "addEventListener" | "removeEventListener"> {
  readonly type?: string;
  readonly saveData?: boolean;
  readonly metered?: boolean;
}
export interface BrowserNetworkPathEnvironment {
  readonly navigator?: { readonly onLine?: boolean; readonly connection?: NetworkInformation };
  readonly eventTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
}
const transport = (value: string | undefined): NWFXInterfaceType | undefined => {
  if (value === "wifi" || value === "cellular" || value === "other") return value;
  if (value === "ethernet") return "wiredEthernet";
  return undefined;
};
export class BrowserNetworkPathAdapter implements NetworkPathAdapter {
  constructor(private readonly environment: BrowserNetworkPathEnvironment = {}) {}
  currentPath(): NetworkPathSnapshot {
    const nav = this.environment.navigator;
    if (typeof nav?.onLine !== "boolean" || !this.environment.eventTarget) throw NWFXError.posix(45, "Network path monitoring is unavailable.");
    const info = nav.connection;
    const type = transport(info?.type);
    return Object.freeze({ status: nav.onLine ? "satisfied" : "unsatisfied",
      ...(type ? { interfaceTypes: Object.freeze([type]) } : {}),
      ...(type === "cellular" ? { isExpensive: true } : typeof info?.metered === "boolean" ? { isExpensive: info.metered } : {}),
      ...(typeof info?.saveData === "boolean" ? { isConstrained: info.saveData } : {}),
    });
  }
  subscribe(listener: (path: NetworkPathSnapshot) => void): { dispose(): void } {
    this.currentPath();
    const target = this.environment.eventTarget!;
    const info = this.environment.navigator?.connection;
    let disposed = false;
    const update = () => { if (!disposed) listener(this.currentPath()); };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      target.removeEventListener("online", update); target.removeEventListener("offline", update); info?.removeEventListener("change", update);
    };
    try { target.addEventListener("online", update); target.addEventListener("offline", update); info?.addEventListener("change", update); }
    catch (error) { dispose(); throw error; }
    return Object.freeze({ dispose });
  }
}
