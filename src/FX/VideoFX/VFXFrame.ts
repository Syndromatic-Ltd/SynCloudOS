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

import { MEFXSampleTimingInfo } from "../MediaFX/MEFXSampleTimingInfo";
import { GFXImage } from "../GraphicsFX/GFXImage";
import { VFXPixelBuffer } from "./VFXPixelBuffer";

export interface VFXFrameInit {
  readonly pixels: VFXPixelBuffer;
  readonly timing: MEFXSampleTimingInfo;
}

type FrameStorage =
  | Readonly<{ kind: "pixels"; pixels: VFXPixelBuffer }>
  | Readonly<{ kind: "video-surface"; surface: VideoFrame }>;
const frameStorage = new WeakMap<VFXFrame, FrameStorage | null>();

export class VFXFrame {
  readonly timing: MEFXSampleTimingInfo;

  constructor(init: VFXFrameInit) {
    if (!init || typeof init !== "object" || !(init.pixels instanceof VFXPixelBuffer) || !(init.timing instanceof MEFXSampleTimingInfo))
      throw new TypeError("Video frame requires live pixels and MediaFX timing.");
    frameStorage.set(this, { kind: "pixels", pixels: init.pixels.clone() });
    this.timing = init.timing;
    Object.freeze(this);
  }

  static fromOwned(pixels: VFXPixelBuffer, timing: MEFXSampleTimingInfo): VFXFrame {
    const value = Object.create(VFXFrame.prototype) as VFXFrame;
    frameStorage.set(value, { kind: "pixels", pixels });
    Object.defineProperty(value, "timing", { value: timing, enumerable: true, configurable: false, writable: false });
    Object.freeze(value);
    return value;
  }

  /** Retain one decoded media resource. No pixel readback occurs on this path. */
  static fromVideoFrame(surface: VideoFrame, timing: MEFXSampleTimingInfo): VFXFrame {
    if (!surface || typeof surface.clone !== "function" || typeof surface.close !== "function" ||
      !Number.isSafeInteger(surface.codedWidth) || surface.codedWidth <= 0 ||
      !Number.isSafeInteger(surface.codedHeight) || surface.codedHeight <= 0 ||
      !(timing instanceof MEFXSampleTimingInfo))
      throw new TypeError("Decoded surface requires a live VideoFrame and MediaFX timing.");
    return VFXFrame.fromOwnedVideoFrame(surface.clone(), timing);
  }

  private static fromOwnedVideoFrame(surface: VideoFrame, timing: MEFXSampleTimingInfo): VFXFrame {
    const value = Object.create(VFXFrame.prototype) as VFXFrame;
    frameStorage.set(value, { kind: "video-surface", surface });
    Object.defineProperty(value, "timing", { value: timing, enumerable: true, configurable: false, writable: false });
    Object.freeze(value);
    return value;
  }

  get closed(): boolean { return !frameStorage.get(this); }
  get storageKind(): "pixels" | "video-surface" { return this.assertStorage().kind; }
  get format() { return this.assertPixels().format; }

  clone(): VFXFrame {
    const storage = this.assertStorage();
    return storage.kind === "pixels"
      ? VFXFrame.fromOwned(storage.pixels.clone(), this.timing)
      : VFXFrame.fromOwnedVideoFrame(storage.surface.clone(), this.timing);
  }

  transfer(): VFXFrame {
    const storage = this.assertStorage();
    frameStorage.set(this, null);
    return storage.kind === "pixels"
      ? VFXFrame.fromOwned(storage.pixels, this.timing)
      : VFXFrame.fromOwnedVideoFrame(storage.surface, this.timing);
  }

  /** Borrow only for a synchronous browser GPU submission; the callback must not retain it. */
  withVideoFrame<T>(callback: (surface: VideoFrame) => T): T {
    const storage = this.assertStorage();
    if (storage.kind !== "video-surface")
      throw new DOMException("Frame has no decoded video surface.", "NotSupportedError");
    const result = callback(storage.surface);
    if (result && typeof (result as unknown as PromiseLike<unknown>).then === "function")
      throw new TypeError("Decoded surface borrow must complete synchronously.");
    return result;
  }

  copyPixelBuffer(): VFXPixelBuffer {
    return this.assertPixels().clone();
  }

  toGFXImage(): GFXImage {
    return this.assertPixels().toGFXImage();
  }

  close(): void {
    const storage = frameStorage.get(this);
    if (storage?.kind === "pixels") storage.pixels.close();
    else if (storage?.kind === "video-surface") storage.surface.close();
    frameStorage.set(this, null);
  }

  private assertStorage(): FrameStorage {
    const storage = frameStorage.get(this);
    if (!storage) throw new DOMException("Video frame is closed.", "InvalidStateError");
    return storage;
  }

  private assertPixels(): VFXPixelBuffer {
    const storage = this.assertStorage();
    if (storage.kind !== "pixels")
      throw new DOMException("Decoded surface requires explicit pixel conversion.", "NotSupportedError");
    return storage.pixels;
  }
}
