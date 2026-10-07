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

import type {
  MIFXAccess,
  MIFXAuthorizationRequest,
  MIFXAuthorizationResult,
  MIFXAuthorizationState,
  MIFXCapabilities,
  MIFXEndpointListener,
  MIFXEndpointSnapshot,
  MIFXInputListener,
  MIFXInputSubscription,
  MIFXOutputLease,
  MIFXSubscription,
} from "../../FX/MIDIFX/MIFXAccess";

export type MIDIAdapterAuthorizationState = "granted" | "denied" | "unavailable";

export interface MIDIAdapterAuthorizationRequest {
  readonly sysex: boolean;
  readonly signal: AbortSignal;
}

export interface MIDIAdapter extends MIFXSubscription {
  isAvailable(): boolean;
  requestAuthorization(request: MIDIAdapterAuthorizationRequest): Promise<MIDIAdapterAuthorizationState>;
  getEndpoints(sysex: boolean): readonly MIFXEndpointSnapshot[];
  subscribeEndpoints(listener: () => void): () => void;
  subscribeInput(
    endpoint: MIFXEndpointSnapshot,
    sysex: boolean,
    listener: MIFXInputListener,
    signal: AbortSignal,
  ): Promise<MIFXInputSubscription>;
  acquireOutput(
    endpoint: MIFXEndpointSnapshot,
    sysex: boolean,
    signal: AbortSignal,
  ): Promise<MIFXOutputLease>;
}

export interface MIDIAccessOwnerOptions {
  readonly signal?: AbortSignal;
  readonly canRequestAuthorization?: boolean;
  readonly canRequestSysEx?: boolean;
}

const EMPTY_ENDPOINTS = Object.freeze([]) as readonly MIFXEndpointSnapshot[];

const unavailableAdapter: MIDIAdapter = Object.freeze({
  isAvailable: () => false,
  async requestAuthorization() {
    return "unavailable" as const;
  },
  getEndpoints: () => EMPTY_ENDPOINTS,
  subscribeEndpoints: () => () => {},
  async subscribeInput() {
    throw new DOMException("Web MIDI is unavailable.", "NotFoundError");
  },
  async acquireOutput() {
    throw new DOMException("Web MIDI is unavailable.", "NotFoundError");
  },
  dispose() {},
});

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function securityError(message: string): DOMException {
  return new DOMException(message, "SecurityError");
}

function linkedSignal(owner: AbortSignal, caller?: AbortSignal): Readonly<{ signal: AbortSignal; dispose(): void }> {
  owner.throwIfAborted();
  caller?.throwIfAborted();
  const controller = new AbortController();
  const relay = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason ?? abortError("MIDI operation was aborted."));
  };
  const ownerAbort = () => relay(owner);
  const callerAbort = () => caller && relay(caller);
  owner.addEventListener("abort", ownerAbort, { once: true });
  caller?.addEventListener("abort", callerAbort, { once: true });
  const dispose = () => {
    owner.removeEventListener("abort", ownerAbort);
    caller?.removeEventListener("abort", callerAbort);
  };
  controller.signal.addEventListener("abort", dispose, { once: true });
  return Object.freeze({ signal: controller.signal, dispose });
}

function authorizationResult(
  state: Exclude<MIFXAuthorizationState, "unknown">,
  sysex: boolean,
): MIFXAuthorizationResult {
  return Object.freeze({ state, sysex });
}

interface OwnedResource {
  readonly dispose: () => void;
}

interface OwnerRecord {
  readonly controller: AbortController;
  readonly externalSignal?: AbortSignal;
  readonly canRequestAuthorization: boolean;
  readonly canRequestSysEx: boolean;
  readonly resources: Set<OwnedResource>;
  readonly endpointListeners: Set<MIFXEndpointListener>;
  externalAbort?: () => void;
  authorization: MIFXAuthorizationState;
  sysexAuthorization: MIFXAuthorizationState;
  released: boolean;
}

export class MIDIService {
  readonly #owners = new Set<OwnerRecord>();
  #disposed = false;

  constructor(private readonly adapter: MIDIAdapter = unavailableAdapter) {}

  createAccess(options: MIDIAccessOwnerOptions = {}): MIFXAccess {
    if (this.#disposed) throw new Error("MIDI service is disposed.");
    options.signal?.throwIfAborted();

    const adapter = this.adapter;
    const apiAvailable = adapter.isAvailable();
    const owner: OwnerRecord = {
      controller: new AbortController(),
      externalSignal: options.signal,
      canRequestAuthorization: options.canRequestAuthorization === true,
      canRequestSysEx: options.canRequestAuthorization === true && options.canRequestSysEx === true,
      resources: new Set(),
      endpointListeners: new Set(),
      authorization: apiAvailable
        ? (options.canRequestAuthorization === true ? "unknown" : "policy-denied")
        : "unavailable",
      sysexAuthorization: apiAvailable
        ? (options.canRequestAuthorization === true && options.canRequestSysEx === true ? "unknown" : "policy-denied")
        : "unavailable",
      released: false,
    };
    this.#owners.add(owner);

    const assertLive = () => {
      if (owner.released) throw owner.controller.signal.reason ?? abortError("MIDI access was disposed.");
      owner.controller.signal.throwIfAborted();
    };

    const mode = (): boolean | null => {
      if (owner.sysexAuthorization === "granted") return true;
      if (owner.authorization === "granted") return false;
      return null;
    };

    const endpoints = (): readonly MIFXEndpointSnapshot[] => {
      assertLive();
      const sysex = mode();
      return sysex === null ? EMPTY_ENDPOINTS : adapter.getEndpoints(sysex);
    };

    const capabilities = (): MIFXCapabilities => {
      assertLive();
      const current = endpoints();
      return Object.freeze({
        apiAvailable: adapter.isAvailable(),
        transportProtocol: "midi1" as const,
        authorization: owner.authorization,
        sysexAuthorization: owner.sysexAuthorization,
        connectedEndpointCount: current.filter((endpoint) => endpoint.state === "connected").length,
      });
    };

    const emitEndpoints = () => {
      if (owner.released || owner.controller.signal.aborted) return;
      const snapshot = endpoints();
      for (const listener of [...owner.endpointListeners]) {
        try {
          listener(snapshot);
        } catch {
        }
      }
    };

    const releaseResource = (resource: OwnedResource) => {
      if (!owner.resources.delete(resource)) return;
      try {
        resource.dispose();
      } catch {
      }
    };

    const trackResource = <T extends MIFXSubscription>(resource: T): T => {
      let active = true;
      const owned: OwnedResource = {
        dispose: () => {
          if (!active) return;
          active = false;
          resource.dispose();
        },
      };
      owner.resources.add(owned);
      return Object.freeze({
        ...resource,
        dispose() {
          releaseResource(owned);
        },
      }) as T;
    };

    const requireEndpoint = (
      candidate: MIFXEndpointSnapshot,
      direction: "input" | "output",
    ): Readonly<{ endpoint: MIFXEndpointSnapshot; sysex: boolean }> => {
      assertLive();
      if (!candidate || typeof candidate !== "object" || candidate.direction !== direction) {
        throw new DOMException("A current MIDI " + direction + " endpoint snapshot is required.", "InvalidStateError");
      }
      const sysex = mode();
      if (sysex === null) throw securityError("MIDI access has not been authorized.");
      const current = adapter.getEndpoints(sysex).find((endpoint) =>
        endpoint.id === candidate.id &&
        endpoint.direction === direction &&
        endpoint.generation === candidate.generation &&
        endpoint.state === "connected"
      );
      if (!current) {
        throw new DOMException("The MIDI endpoint snapshot is stale or disconnected.", "InvalidStateError");
      }
      return Object.freeze({ endpoint: current, sysex });
    };

    const disposeOwner = (reason: unknown = abortError("MIDI access was disposed.")) => {
      if (owner.released) return;
      owner.released = true;
      if (owner.externalAbort) owner.externalSignal?.removeEventListener("abort", owner.externalAbort);
      owner.controller.abort(reason);
      for (const resource of [...owner.resources]) releaseResource(resource);
      owner.endpointListeners.clear();
      this.#owners.delete(owner);
    };

    owner.externalAbort = () =>
      disposeOwner(owner.externalSignal?.reason ?? abortError("MIDI owner was revoked."));
    owner.externalSignal?.addEventListener("abort", owner.externalAbort, { once: true });

    const access: MIFXAccess = {
      getCapabilities: capabilities,
      getEndpoints: endpoints,

      async requestAuthorization(request: MIFXAuthorizationRequest = {}) {
        assertLive();
        const sysex = request.sysex === true;
        if (!adapter.isAvailable()) {
          if (sysex) owner.sysexAuthorization = "unavailable";
          else owner.authorization = "unavailable";
          return authorizationResult("unavailable", sysex);
        }
        if (!owner.canRequestAuthorization || (sysex && !owner.canRequestSysEx)) {
          return authorizationResult("policy-denied", sysex);
        }
        if ((sysex && owner.sysexAuthorization === "granted") ||
            (!sysex && (owner.authorization === "granted" || owner.sysexAuthorization === "granted"))) {
          return authorizationResult("granted", sysex);
        }

        const linked = linkedSignal(owner.controller.signal, request.signal);
        try {
          const result = await adapter.requestAuthorization({ sysex, signal: linked.signal });
          linked.signal.throwIfAborted();
          assertLive();
          if (sysex) {
            owner.sysexAuthorization = result;
            if (result === "granted") owner.authorization = "granted";
          } else {
            owner.authorization = result;
          }
          emitEndpoints();
          return authorizationResult(result, sysex);
        } finally {
          linked.dispose();
        }
      },

      subscribeEndpoints(listener: MIFXEndpointListener) {
        assertLive();
        if (typeof listener !== "function") throw new TypeError("MIDI endpoint listener must be a function.");
        owner.endpointListeners.add(listener);
        const releaseAdapter = adapter.subscribeEndpoints(emitEndpoints);
        let disposed = false;
        const resource: MIFXSubscription = {
          dispose() {
            if (disposed) return;
            disposed = true;
            owner.endpointListeners.delete(listener);
            releaseAdapter();
          },
        };
        const tracked = trackResource(resource);
        listener(endpoints());
        return tracked;
      },

      async subscribeInput(endpoint: MIFXEndpointSnapshot, listener: MIFXInputListener) {
        assertLive();
        if (typeof listener !== "function") throw new TypeError("MIDI input listener must be a function.");
        const selected = requireEndpoint(endpoint, "input");
        const native = await adapter.subscribeInput(
          selected.endpoint,
          selected.sysex,
          listener,
          owner.controller.signal,
        );
        if (owner.released || owner.controller.signal.aborted) {
          native.dispose();
          throw owner.controller.signal.reason ?? abortError("MIDI owner was revoked.");
        }
        return trackResource(native);
      },

      async acquireOutput(endpoint: MIFXEndpointSnapshot) {
        const selected = requireEndpoint(endpoint, "output");
        const native = await adapter.acquireOutput(
          selected.endpoint,
          selected.sysex,
          owner.controller.signal,
        );
        if (owner.released || owner.controller.signal.aborted) {
          native.dispose();
          throw owner.controller.signal.reason ?? abortError("MIDI owner was revoked.");
        }
        let disposed = false;
        const wrapped: MIFXOutputLease = {
          endpoint: native.endpoint,
          send(data: Uint8Array, timestampMilliseconds?: number) {
            assertLive();
            if (disposed) throw abortError("MIDI output lease was disposed.");
            if (!(data instanceof Uint8Array)) throw new TypeError("MIDI output data must be a Uint8Array.");
            if (data[0] === 0xf0 && owner.sysexAuthorization !== "granted") {
              throw securityError("SysEx output requires explicit SysEx authorization.");
            }
            if (timestampMilliseconds === undefined) native.send(data);
            else native.send(data, timestampMilliseconds);
          },
          dispose() {
            if (disposed) return;
            disposed = true;
            native.dispose();
          },
        };
        return trackResource(wrapped);
      },

      dispose() {
        disposeOwner();
      },
    };

    return Object.freeze(access);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const owner of [...this.#owners]) {
      if (owner.externalAbort) {
        owner.externalAbort();
      } else {
        owner.released = true;
        owner.controller.abort(abortError("MIDI service was disposed."));
        for (const resource of [...owner.resources]) {
          try {
            resource.dispose();
          } catch {
          }
        }
        owner.resources.clear();
        owner.endpointListeners.clear();
      }
    }
    this.#owners.clear();
    this.adapter.dispose();
  }
}
