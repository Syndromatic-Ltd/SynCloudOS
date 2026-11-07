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

import { useCallback, useSyncExternalStore } from "react";
import type { VFXRouteDetector } from "../../../FX/VideoFX/VFXRouteDetector";
import { NSEButton, type NSEButtonProps } from "../Buttons/NSEButton";

export interface NSERoutePickerViewProps extends Omit<NSEButtonProps, "onClick" | "title" | "state" | "buttonType"> {
  readonly routeDetector: VFXRouteDetector;
  readonly title?: string;
  onError?(error: unknown): void;
}

/** AVRoutePickerView: the system route chooser, invoked by a real Atmo NSEButton. */
export function NSERoutePickerView({ routeDetector, title = "Choose playback device", isEnabled = true, onError, ...props }: NSERoutePickerViewProps) {
  const subscribe = useCallback((listener: () => void) => routeDetector.subscribe(listener), [routeDetector]);
  const snapshot = useCallback(() => `${routeDetector.connectionState}:${routeDetector.capabilities.remotePlayback ? "enabled" : "disabled"}`, [routeDetector]);
  const value = useSyncExternalStore(subscribe, snapshot, () => "unknown:disabled");
  const [state, capability] = value.split(":");
  return <NSEButton {...props} title={title} data-nse-control="route-picker" data-route-state={state}
    aria-label={props["aria-label"] ?? title} aria-pressed={state === "connected"}
    isEnabled={isEnabled && capability === "enabled"}
    onClick={() => { void routeDetector.prompt().catch(error => onError?.(error)); }} />;
}
