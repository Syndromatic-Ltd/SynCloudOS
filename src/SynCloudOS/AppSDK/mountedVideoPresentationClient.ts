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

import type { VFXVideoPresentationClient } from "../../FX/VideoFX/VFXPictureInPictureController";
import type { BrowserVideoPresentationAdapter } from "../PlatformAdapters/BrowserVideoPresentationAdapter";
import { createMountedResourceScope } from "../HostServices/mountedResourceScope";
export type MountedVideoPresentationCapability = "video.pictureInPicture" | "video.route";
export function createMountedVideoPresentationClient(
  adapter: BrowserVideoPresentationAdapter,
  mountSignal: AbortSignal,
  permissions: () => readonly string[],
  authorise: (capability: MountedVideoPresentationCapability) => boolean = () => true,
): VFXVideoPresentationClient {
  const scope = createMountedResourceScope(mountSignal, { maxResources: 8, budgets: { sessions: 8 } });
  const allowed = (capability: MountedVideoPresentationCapability) => !mountSignal.aborted && permissions().includes(capability) && authorise(capability);
  const requireAccess = (capability: MountedVideoPresentationCapability) => {
    mountSignal.throwIfAborted();
    if (!allowed(capability)) throw new DOMException(`Video presentation ${capability} is not authorised.`, "SecurityError");
  };
  return Object.freeze({
    capabilities(target) {
      if (!allowed("video.pictureInPicture") && !allowed("video.route")) throw new DOMException("Video presentation is not authorised.", "SecurityError");
      const caps = adapter.capabilities(target);
      return Object.freeze({ pictureInPicture: allowed("video.pictureInPicture") && caps.pictureInPicture, remotePlayback: allowed("video.route") && caps.remotePlayback });
    },
    createPictureInPictureController(target, signal) {
      requireAccess("video.pictureInPicture");
      return scope.acquire(signal, (lease, release) => {
        const controller = adapter.createPictureInPictureController(target, lease, () => allowed("video.pictureInPicture"), release);
        const dispose = () => { try { controller.dispose(); } finally { release(); } };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze({
          get capabilities() { return controller.capabilities; },
          get isPictureInPictureActive() { return controller.isPictureInPictureActive; },
          authorizationStatus: () => controller.authorizationStatus(), requestAuthorization: () => controller.requestAuthorization(),
          startPictureInPicture: () => controller.startPictureInPicture(), stopPictureInPicture: () => controller.stopPictureInPicture(),
          subscribe: (listener: () => void) => controller.subscribe(listener), dispose,
        });
      }, controller => controller.dispose(), { sessions: 1 });
    },
    createRouteDetector(target, signal) {
      requireAccess("video.route");
      return scope.acquire(signal, (lease, release) => {
        const detector = adapter.createRouteDetector(target, lease, () => allowed("video.route"), release);
        const dispose = () => { try { detector.dispose(); } finally { release(); } };
        lease.addEventListener("abort", dispose, { once: true });
        return Object.freeze({
          get capabilities() { return detector.capabilities; },
          get areRoutesAvailable() { return detector.areRoutesAvailable; },
          get connectionState() { return detector.connectionState; },
          authorizationStatus: () => detector.authorizationStatus(), requestAuthorization: () => detector.requestAuthorization(),
          startDiscovery: () => detector.startDiscovery(), stopDiscovery: () => detector.stopDiscovery(), prompt: () => detector.prompt(),
          subscribe: (listener: () => void) => detector.subscribe(listener), dispose,
        });
      }, detector => detector.dispose(), { sessions: 1 });
    },
  } satisfies VFXVideoPresentationClient);
}
