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

import type { HFXHapticClient } from "../../FX/HapticsFX/HFXHapticClient";
import type { HFXHapticSession } from "../../FX/HapticsFX/HFXHapticSession";
import type { LFXLocationClient, LFXLocationManager } from "../../FX/LocationFX/public";
import type { LUFXIndexClient } from "../../FX/LuminaFX/public";
import type { MEFXMediaClient } from "../../FX/MediaFX/MEFXMediaClient";
import type { MIFXAccess, MIFXClient } from "../../FX/MIDIFX/public";
import type { MFXMotionClient, MFXMotionManager } from "../../FX/MotionFX/public";
import type { VFXCaptureSession, VFXVideoClient } from "../../FX/VideoFX/public";

/** The FX clients of the mounted application, as the host hands them to a view controller. */
export interface NSEViewControllerFXClients {
  readonly motion: MFXMotionClient;
  readonly location: LFXLocationClient;
  readonly haptics: HFXHapticClient;
  readonly midi: MIFXClient;
  readonly media: MEFXMediaClient;
  readonly video: VFXVideoClient;
  readonly lumina: LUFXIndexClient;
}

/**
 * The FX services a view controller can use without a hook. Each is created
 * the first time it is read, belongs to the controller, and is released when
 * the controller is disposed; nothing is requested from the device (a
 * location fix, a MIDI port, the camera) until the controller asks.
 */
export interface NSEViewControllerFX {
  /** Device motion and attitude (MotionFX). */
  readonly motion: MFXMotionManager;
  /** Foreground location (LocationFX). */
  readonly location: LFXLocationManager;
  /** Haptic patterns (HapticsFX). */
  readonly haptics: HFXHapticSession;
  /** MIDI ports (MIDIFX). */
  readonly midi: MIFXAccess;
  /** Media buffers, clocks and timebases (MediaFX); every call is bound to the controller's lifetime. */
  readonly media: MEFXMediaClient;
  /** Camera capture (VideoFX). */
  readonly video: VFXCaptureSession;
  /** The on-device search index (LuminaFX); an index is acquired by `createIndex()`. */
  readonly lumina: LUFXIndexClient;
}

function boundTo(owner: AbortSignal, signal: AbortSignal | undefined): AbortSignal {
  return signal ? AbortSignal.any([owner, signal]) : owner;
}

/** The FX services of one view controller, owned by `owner`. */
export function createViewControllerFX(clients: NSEViewControllerFXClients, owner: AbortSignal): NSEViewControllerFX {
  let motion: MFXMotionManager | undefined;
  let location: LFXLocationManager | undefined;
  let haptics: HFXHapticSession | undefined;
  let midi: MIFXAccess | undefined;
  let video: VFXCaptureSession | undefined;
  const media: MEFXMediaClient = Object.freeze({
    copyBlock: (bytes: Uint8Array, signal?: AbortSignal) => clients.media.copyBlock(bytes, boundTo(owner, signal)),
    createQueue: <T>(options: Parameters<MEFXMediaClient["createQueue"]>[0], signal?: AbortSignal) =>
      clients.media.createQueue<T>(options as never, boundTo(owner, signal)),
    observeClock: (signal?: AbortSignal) => clients.media.observeClock(boundTo(owner, signal)),
    createTimebase: (options?: Parameters<MEFXMediaClient["createTimebase"]>[0], signal?: AbortSignal) =>
      clients.media.createTimebase(options, boundTo(owner, signal)),
  }) as MEFXMediaClient;
  return Object.freeze({
    get motion() { return (motion ??= clients.motion.createManager(owner)); },
    get location() { return (location ??= clients.location.createManager(owner)); },
    get haptics() { return (haptics ??= clients.haptics.createEngine(owner)); },
    get midi() { return (midi ??= clients.midi.createAccess(owner)); },
    get video() { return (video ??= clients.video.createCaptureSession(owner)); },
    media,
    lumina: clients.lumina,
  });
}
