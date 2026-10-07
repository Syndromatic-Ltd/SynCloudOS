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

// Public-port doubles for consumer logic only. These are not mounted SDK/device evidence.
import { MEFXTime } from "@syndromatic/syncloudos/fx/media";
import type { MEFXMediaClient } from "@syndromatic/syncloudos/sdk";
import type { MIFXClient, MIFXAccess, MIFXEndpointSnapshot, MIFXInputListener, MIFXEndpointListener, MIFXOutputLease } from "@syndromatic/syncloudos/fx/midi";
import { LFXCoordinate, LFXLocation, type LFXLocationClient } from "@syndromatic/syncloudos/fx/location";

export function fix(sequence: number, accuracy = 5) {
  return new LFXLocation({ coordinate: new LFXCoordinate(51.5 + sequence / 10000, -0.1),
    observedAtUnixMilliseconds: 1700000000000 + sequence * 1000, receivedAtMonotonicSeconds: sequence,
    horizontalAccuracyMetres: accuracy, altitudeMetres: null, altitudeAccuracyMetres: null, speedMetresPerSecond: null, courseRadians: null });
}

export function midiPorts() {
  let now = 0, timerSequence = 0;
  const timers = new Map<number, { due: number; callback: () => void }>();
  const input: MIFXEndpointSnapshot = Object.freeze({ id: "keyboard", direction: "input", manufacturer: "Fixture", name: "Keyboard", version: null, state: "connected", connection: "closed", generation: 1 });
  const output: MIFXEndpointSnapshot = Object.freeze({ ...input, id: "synth", direction: "output", name: "Synth" });
  let endpoints: readonly MIFXEndpointSnapshot[] = [input, output];
  let onInput: MIFXInputListener | undefined, onEndpoints: MIFXEndpointListener | undefined;
  let pendingOutput: ((output: MIFXOutputLease) => void) | undefined;
  const counts = { access: 0, authorization: 0, accessDisposed: 0, inputDisposed: 0, outputDisposed: 0, clockDisposed: 0, subscriptionsDisposed: 0 };
  const sent: { bytes: number[]; timestamp?: number }[] = [];
  const outputLease: MIFXOutputLease = { endpoint: output, send(bytes, timestamp) { sent.push({ bytes: Array.from(bytes), timestamp }); }, dispose() { counts.outputDisposed++; } };
  const access: MIFXAccess = {
    getCapabilities: () => ({ apiAvailable: true, transportProtocol: "midi1", authorization: "unknown", sysexAuthorization: "unknown", connectedEndpointCount: endpoints.length }),
    getEndpoints: () => endpoints,
    async requestAuthorization(request) { if (request?.sysex) throw Error("SysEx must remain opt-in"); counts.authorization++; return { state: "granted", sysex: false }; },
    subscribeEndpoints(listener) { onEndpoints = listener; return { dispose() { counts.subscriptionsDisposed++; onEndpoints = undefined; } }; },
    async subscribeInput(_endpoint, listener) { onInput = listener; return { endpoint: input, dispose() { counts.inputDisposed++; } }; },
    async acquireOutput() { return controls.delayOutput ? new Promise<MIFXOutputLease>(resolve => { pendingOutput = resolve; }) : outputLease; },
    dispose() { counts.accessDisposed++; },
  };
  const midi: MIFXClient = { createAccess(signal) { signal?.throwIfAborted(); counts.access++; return access; } };
  const media: MEFXMediaClient = {
    observeClock() { return { now: () => ({ position: MEFXTime.finite(BigInt(now), 1000), domain: "fixture", generation: 0, uncertaintySeconds: 0 }), subscribeDiscontinuities: () => () => {}, dispose() { counts.clockDisposed++; } }; },
    copyBlock() { throw Error("unused"); }, createQueue() { throw Error("unused"); }, createTimebase() { throw Error("unused"); },
  };
  const controls = {
    midi, media, counts, sent, input, output, delayOutput: false,
    scheduling: {
      hostNowMilliseconds: () => now,
      scheduleHostCallback(callback: () => void, delay: number) { const handle = ++timerSequence; timers.set(handle, { due: now + delay, callback }); return handle; },
      cancelHostCallback(handle: unknown) { timers.delete(handle as number); },
    },
    advance(ms: number) { now += ms; for (const [handle, timer] of [...timers]) if (timer.due <= now) { timers.delete(handle); timer.callback(); } },
    emit(bytes: number[]) { onInput?.({ endpoint: input, data: Uint8Array.from(bytes), receivedAtMilliseconds: now }); },
    disconnect() { endpoints = []; onEndpoints?.(endpoints); },
    releaseOutput() { if (!pendingOutput) throw Error("No pending output"); pendingOutput(outputLease); },
    timerCount: () => timers.size,
  };
  return controls;
}

export function locationPort() {
  const callbacks: ((value: LFXLocation) => void)[] = [];
  let resolveFix: ((value: LFXLocation) => void) | undefined;
  const counts = { managers: 0, current: 0, watches: 0, watchDisposed: 0, managerDisposed: 0 };
  const controls = { counts, status: "granted" as "granted" | "denied" | "unavailable", pending: false,
    resolve(value: LFXLocation) { if (!resolveFix) throw Error("No pending fix"); resolveFix(value); },
    emit(value: LFXLocation) { for (const callback of callbacks) callback(value); },
    client: undefined as unknown as LFXLocationClient };
  controls.client = { createManager(signal) {
    signal?.throwIfAborted(); counts.managers++;
    return { getAuthorizationStatus: async () => controls.status,
      async current() { counts.current++; return controls.pending ? new Promise<LFXLocation>(resolve => { resolveFix = resolve; }) : fix(1); },
      watch(_options, callback) { counts.watches++; callbacks.push(callback); return { dispose() { counts.watchDisposed++; } }; },
      dispose() { counts.managerDisposed++; },
    };
  } };
  return controls;
}
