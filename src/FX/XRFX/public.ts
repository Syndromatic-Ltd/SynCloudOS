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

export type XRFXAuthorizationStatus = "unknown" | "prompt" | "granted" | "denied" | "unavailable";
export type XRFXSessionMode = "inline" | "immersive-vr" | "immersive-ar";
export type XRFXReferenceSpace = "viewer" | "local" | "local-floor" | "bounded-floor" | "unbounded";
export interface XRFXConfigurationOptions {
  readonly mode?: XRFXSessionMode;
  readonly referenceSpace?: XRFXReferenceSpace;
  readonly requiredFeatures?: readonly string[];
  readonly optionalFeatures?: readonly string[];
}
export class XRFXConfiguration {
  readonly mode: XRFXSessionMode;
  readonly referenceSpace: XRFXReferenceSpace;
  readonly requiredFeatures: readonly string[];
  readonly optionalFeatures: readonly string[];
  constructor(options: XRFXConfigurationOptions = {}) {
    this.mode = options.mode ?? "inline";
    this.referenceSpace = options.referenceSpace ?? (this.mode === "inline" ? "viewer" : "local");
    if (!["inline", "immersive-vr", "immersive-ar"].includes(this.mode)) throw new TypeError("Unknown WebXR session mode.");
    if (!["viewer", "local", "local-floor", "bounded-floor", "unbounded"].includes(this.referenceSpace)) throw new TypeError("Unknown WebXR reference space.");
    this.requiredFeatures = Object.freeze([...(options.requiredFeatures ?? [])]);
    this.optionalFeatures = Object.freeze([...(options.optionalFeatures ?? [])]);
    if ([...this.requiredFeatures, ...this.optionalFeatures].some(value => typeof value !== "string" || !value.trim())) throw new TypeError("WebXR features must be non-empty names.");
    Object.freeze(this);
  }
}
export interface XRFXCapabilities { readonly apiAvailable: boolean; readonly worldTracking: false; readonly nativeARKit: false }
/** Column-major transform in the configured WebXR reference space, or null if tracking is unavailable. */
export interface XRFXAnchor { readonly identifier: string; readonly transform: readonly number[] | null }
export interface XRFXFrame { readonly timestamp: number; readonly viewerTransform: readonly number[] | null; readonly anchors: readonly XRFXAnchor[] }
export interface XRFXSession {
  getCapabilities(): XRFXCapabilities;
  getAuthorizationStatus(): Promise<XRFXAuthorizationStatus>;
  isSupported(configuration: XRFXConfiguration): Promise<boolean>;
  /** Requests browser authorisation and starts frame delivery. WebXR may require a user gesture. */
  run(configuration: XRFXConfiguration, listener: (frame: XRFXFrame) => void): Promise<void>;
  pause(): Promise<void>;
  dispose(): void;
}
export interface XRFXClient { getCapabilities(): XRFXCapabilities; createSession(signal?: AbortSignal): XRFXSession }
