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

import type { VFXRouteDetector } from "./VFXRouteDetector";
export type VFXPresentationAuthorizationStatus = "granted" | "denied" | "unavailable";
export interface VFXPictureInPictureController {
  readonly capabilities: Readonly<{ pictureInPicture: boolean }>;
  readonly isPictureInPictureActive: boolean;
  authorizationStatus(): VFXPresentationAuthorizationStatus;
  requestAuthorization(): VFXPresentationAuthorizationStatus;
  startPictureInPicture(): Promise<void>;
  stopPictureInPicture(): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export interface VFXVideoPresentationCapabilities {
  readonly pictureInPicture: boolean;
  readonly remotePlayback: boolean;
}
export interface VFXVideoPresentationClient {
  capabilities(target: HTMLVideoElement): VFXVideoPresentationCapabilities;
  createPictureInPictureController(target: HTMLVideoElement, signal?: AbortSignal): VFXPictureInPictureController;
  createRouteDetector(target: HTMLVideoElement, signal?: AbortSignal): VFXRouteDetector;
}

/** Internal host port; not part of the public SDK barrel. */
export interface VFXVideoPresentationAdapter {
  capabilities(target: HTMLVideoElement): VFXVideoPresentationCapabilities;
  createPictureInPictureController(target: HTMLVideoElement, signal: AbortSignal, authorise: () => boolean, onDispose?: () => void): VFXPictureInPictureController;
  createRouteDetector(target: HTMLVideoElement, signal: AbortSignal, authorise: () => boolean, onDispose?: () => void): VFXRouteDetector;
}
