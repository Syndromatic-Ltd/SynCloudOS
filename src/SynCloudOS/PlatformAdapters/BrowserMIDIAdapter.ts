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
  MIFXEndpointConnection,
  MIFXEndpointDirection,
  MIFXEndpointSnapshot,
  MIFXEndpointState,
  MIFXInputListener,
  MIFXInputPacket,
  MIFXInputSubscription,
  MIFXOutputLease,
} from "../../FX/MIDIFX/MIFXAccess";
import type {
  MIDIAdapter,
  MIDIAdapterAuthorizationRequest,
  MIDIAdapterAuthorizationState,
} from "../HostServices/PlatformAdapterRuntimePorts";

interface BrowserMIDIPortCollectionLike {
  values(): Iterable<unknown>;
}

interface BrowserMIDIAccessLike {
  readonly inputs: BrowserMIDIPortCollectionLike;
  readonly outputs: BrowserMIDIPortCollectionLike;
  readonly sysexEnabled?: boolean;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  onstatechange?: ((event: unknown) => void) | null;
}

interface BrowserMIDIPortLike {
  readonly id: string;
  readonly type: MIFXEndpointDirection;
  readonly manufacturer?: string | null;
  readonly name?: string | null;
  readonly version?: string | null;
  state: MIFXEndpointState;
  connection: MIFXEndpointConnection;
  open?: () => Promise<unknown> | unknown;
  close?: () => Promise<unknown> | unknown;
}

interface BrowserMIDIInputLike extends BrowserMIDIPortLike {
  readonly type: "input";
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
  onmidimessage?: ((event: unknown) => void) | null;
}

interface BrowserMIDIOutputLike extends BrowserMIDIPortLike {
  readonly type: "output";
  send(data: Uint8Array, timestamp?: number): void;
}

export interface BrowserMIDINavigatorLike {
  requestMIDIAccess?: (options?: Readonly<{ sysex?: boolean }>) => Promise<unknown>;
}

type SessionMode = "standard" | "sysex";

interface Session {
  readonly mode: SessionMode;
  readonly access: BrowserMIDIAccessLike;
  readonly generations: Map<string, number>;
  readonly states: Map<string, MIFXEndpointState>;
  readonly ports: Map<string, BrowserMIDIPortLike>;
  readonly records: Map<string, HostPortRecord>;
  readonly detachStateChange: () => void;
}

interface InputBinding {
  active: boolean;
  readonly listener: MIFXInputListener;
}

interface HostPortRecord {
  readonly session: Session;
  readonly key: string;
  readonly port: BrowserMIDIPortLike;
  readonly generation: number;
  readonly inputBindings: Set<InputBinding>;
  references: number;
  reservations: number;
  active: boolean;
  openSettled: boolean;
  openPromise: Promise<void> | null;
  closeStarted: boolean;
  nativeMessageListener: ((event: unknown) => void) | null;
  previousOnMessage: ((event: unknown) => void) | null | undefined;
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function invalidState(message: string): DOMException {
  return new DOMException(message, "InvalidStateError");
}

function portKey(direction: MIFXEndpointDirection, id: string): string {
  return direction + ":" + id;
}

function isPort(value: unknown): value is BrowserMIDIPortLike {
  if (!value || typeof value !== "object") return false;
  const port = value as Partial<BrowserMIDIPortLike>;
  return typeof port.id === "string" &&
    (port.type === "input" || port.type === "output") &&
    (port.state === "connected" || port.state === "disconnected") &&
    (port.connection === "open" || port.connection === "closed" || port.connection === "pending");
}

function isAccess(value: unknown): value is BrowserMIDIAccessLike {
  if (!value || typeof value !== "object") return false;
  const access = value as Partial<BrowserMIDIAccessLike>;
  return !!access.inputs && typeof access.inputs.values === "function" &&
    !!access.outputs && typeof access.outputs.values === "function";
}

function metadata(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function eventPort(event: unknown): BrowserMIDIPortLike | null {
  if (!event || typeof event !== "object") return null;
  const port = (event as { port?: unknown }).port;
  return isPort(port) ? port : null;
}

function messageData(event: unknown): Uint8Array | null {
  if (!event || typeof event !== "object") return null;
  const data = (event as { data?: unknown }).data;
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  return null;
}

function messageTimestamp(event: unknown): number | null {
  if (!event || typeof event !== "object") return null;
  const value = (event as { timeStamp?: unknown }).timeStamp;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function raceSignal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(signal.reason ?? abortError("MIDI operation was aborted.")));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) onAbort();
  });
}

function browserDenial(error: unknown): boolean {
  const name = error && typeof error === "object" ? (error as { name?: unknown }).name : undefined;
  return name === "NotAllowedError" || name === "SecurityError";
}

export class BrowserMIDIAdapter implements MIDIAdapter {
  readonly #sessions = new Map<SessionMode, Session>();
  readonly #endpointListeners = new Set<() => void>();
  #generationSequence = 0;
  #disposed = false;

  constructor(private readonly browserNavigator: BrowserMIDINavigatorLike) {}

  isAvailable(): boolean {
    return !this.#disposed && typeof this.browserNavigator.requestMIDIAccess === "function";
  }

  async requestAuthorization(request: MIDIAdapterAuthorizationRequest): Promise<MIDIAdapterAuthorizationState> {
    request.signal.throwIfAborted();
    if (!this.isAvailable()) return "unavailable";
    const mode: SessionMode = request.sysex ? "sysex" : "standard";
    if (this.#sessions.has(mode)) return "granted";

    let nativeRequest: Promise<unknown>;
    try {
      nativeRequest = Promise.resolve(this.browserNavigator.requestMIDIAccess!({ sysex: request.sysex }));
    } catch (error) {
      if (browserDenial(error)) return "denied";
      throw error;
    }

    let value: unknown;
    try {
      value = await raceSignal(nativeRequest, request.signal);
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason ?? abortError("MIDI authorization was aborted.");
      if (browserDenial(error)) return "denied";
      throw error;
    }
    request.signal.throwIfAborted();
    if (this.#disposed) throw abortError("MIDI adapter was disposed.");
    if (this.#sessions.has(mode)) return "granted";
    if (!isAccess(value)) throw new TypeError("Browser requestMIDIAccess returned an invalid MIDI access object.");
    if (request.sysex && value.sysexEnabled === false) return "denied";

    const session = this.#createSession(mode, value);
    this.#sessions.set(mode, session);
    this.#notifyEndpoints();
    return "granted";
  }

  getEndpoints(sysex: boolean): readonly MIFXEndpointSnapshot[] {
    const session = this.#sessions.get(sysex ? "sysex" : "standard");
    if (!session) return Object.freeze([]);
    const endpoints: MIFXEndpointSnapshot[] = [];
    for (const value of session.access.inputs.values()) {
      if (isPort(value) && value.type === "input") endpoints.push(this.#snapshot(session, value));
    }
    for (const value of session.access.outputs.values()) {
      if (isPort(value) && value.type === "output") endpoints.push(this.#snapshot(session, value));
    }
    return Object.freeze(endpoints);
  }

  subscribeEndpoints(listener: () => void): () => void {
    if (this.#disposed) throw new Error("MIDI adapter is disposed.");
    if (typeof listener !== "function") throw new TypeError("MIDI endpoint listener must be a function.");
    this.#endpointListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#endpointListeners.delete(listener);
    };
  }

  async subscribeInput(
    endpoint: MIFXEndpointSnapshot,
    sysex: boolean,
    listener: MIFXInputListener,
    signal: AbortSignal,
  ): Promise<MIFXInputSubscription> {
    signal.throwIfAborted();
    const session = this.#requireSession(sysex);
    const port = this.#currentPort(session, endpoint, "input") as BrowserMIDIInputLike;
    const record = await this.#acquireRecord(session, endpoint, port, signal);
    signal.throwIfAborted();

    const binding: InputBinding = { active: true, listener };
    record.inputBindings.add(binding);
    this.#ensureMessageListener(record, sysex);

    let disposed = false;
    return Object.freeze({
      endpoint,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.#releaseInputBinding(record, binding);
      },
    });
  }

  async acquireOutput(
    endpoint: MIFXEndpointSnapshot,
    sysex: boolean,
    signal: AbortSignal,
  ): Promise<MIFXOutputLease> {
    signal.throwIfAborted();
    const session = this.#requireSession(sysex);
    const port = this.#currentPort(session, endpoint, "output") as BrowserMIDIOutputLike;
    if (typeof port.send !== "function") throw invalidState("The selected MIDI output does not support send().");
    const record = await this.#acquireRecord(session, endpoint, port, signal);
    signal.throwIfAborted();

    let active = true;
    return Object.freeze({
      endpoint,
      send: (data: Uint8Array, timestampMilliseconds?: number) => {
        if (!active || !this.#recordIsCurrent(record)) {
          throw invalidState("The MIDI output lease is no longer current.");
        }
        if (!(data instanceof Uint8Array)) throw new TypeError("MIDI output data must be a Uint8Array.");
        if (!sysex && data[0] === 0xf0) {
          throw new DOMException("SysEx output requires a SysEx-enabled MIDI access session.", "SecurityError");
        }
        if (timestampMilliseconds !== undefined && (!Number.isFinite(timestampMilliseconds) || timestampMilliseconds < 0)) {
          throw new RangeError("MIDI output timestamp must be a nonnegative finite millisecond value.");
        }
        if (timestampMilliseconds === undefined) port.send(new Uint8Array(data));
        else port.send(new Uint8Array(data), timestampMilliseconds);
      },
      dispose: () => {
        if (!active) return;
        active = false;
        this.#releaseReference(record);
      },
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const session of this.#sessions.values()) {
      session.detachStateChange();
      for (const record of [...session.records.values()]) this.#invalidateRecord(record);
      session.records.clear();
    }
    this.#sessions.clear();
    this.#endpointListeners.clear();
  }

  #createSession(mode: SessionMode, access: BrowserMIDIAccessLike): Session {
    const generations = new Map<string, number>();
    const states = new Map<string, MIFXEndpointState>();
    const ports = new Map<string, BrowserMIDIPortLike>();
    for (const value of access.inputs.values()) {
      if (isPort(value) && value.type === "input") {
        const key = portKey(value.type, value.id);
        generations.set(key, ++this.#generationSequence);
        states.set(key, value.state);
        ports.set(key, value);
      }
    }
    for (const value of access.outputs.values()) {
      if (isPort(value) && value.type === "output") {
        const key = portKey(value.type, value.id);
        generations.set(key, ++this.#generationSequence);
        states.set(key, value.state);
        ports.set(key, value);
      }
    }

    let session!: Session;
    const onStateChange = (event: unknown) => {
      if (this.#disposed) return;
      const port = eventPort(event);
      if (!port) return;
      this.#observePort(session, port);
      this.#notifyEndpoints();
    };

    let detachStateChange: () => void;
    if (typeof access.addEventListener === "function") {
      access.addEventListener("statechange", onStateChange);
      detachStateChange = () => access.removeEventListener?.("statechange", onStateChange);
    } else {
      const previous = access.onstatechange;
      access.onstatechange = onStateChange;
      detachStateChange = () => {
        if (access.onstatechange === onStateChange) access.onstatechange = previous ?? null;
      };
    }

    session = {
      mode,
      access,
      generations,
      states,
      ports,
      records: new Map(),
      detachStateChange,
    };
    return session;
  }

  #observePort(session: Session, port: BrowserMIDIPortLike): void {
    const key = portKey(port.type, port.id);
    const previousState = session.states.get(key);
    const previousPort = session.ports.get(key);
    const changedLifetime = previousState === undefined ||
      previousState !== port.state ||
      (previousPort !== undefined && previousPort !== port);
    if (changedLifetime) {
      session.generations.set(key, ++this.#generationSequence);
      const record = session.records.get(key);
      if (record) this.#invalidateRecord(record);
    } else if (!session.generations.has(key)) {
      session.generations.set(key, ++this.#generationSequence);
    }
    session.states.set(key, port.state);
    session.ports.set(key, port);
  }

  #notifyEndpoints(): void {
    for (const listener of [...this.#endpointListeners]) {
      try {
        listener();
      } catch {
      }
    }
  }

  #snapshot(session: Session, port: BrowserMIDIPortLike): MIFXEndpointSnapshot {
    this.#observePort(session, port);
    const key = portKey(port.type, port.id);
    const generation = session.generations.get(key)!;
    return Object.freeze({
      id: port.id,
      direction: port.type,
      manufacturer: metadata(port.manufacturer),
      name: metadata(port.name),
      version: metadata(port.version),
      state: port.state,
      connection: port.connection,
      generation,
    });
  }

  #requireSession(sysex: boolean): Session {
    if (this.#disposed) throw abortError("MIDI adapter was disposed.");
    const session = this.#sessions.get(sysex ? "sysex" : "standard");
    if (!session) throw new DOMException("MIDI access has not been authorized.", "SecurityError");
    return session;
  }

  #currentPort(
    session: Session,
    endpoint: MIFXEndpointSnapshot,
    direction: MIFXEndpointDirection,
  ): BrowserMIDIPortLike {
    if (endpoint.direction !== direction) {
      throw invalidState("Expected a MIDI " + direction + " endpoint.");
    }
    const values = direction === "input" ? session.access.inputs.values() : session.access.outputs.values();
    for (const value of values) {
      if (!isPort(value) || value.type !== direction || value.id !== endpoint.id) continue;
      this.#observePort(session, value);
      const generation = session.generations.get(portKey(direction, value.id));
      if (generation !== endpoint.generation || value.state !== "connected") {
        throw invalidState("The MIDI endpoint snapshot is stale or disconnected.");
      }
      return value;
    }
    throw invalidState("The MIDI endpoint is no longer present.");
  }

  async #acquireRecord(
    session: Session,
    endpoint: MIFXEndpointSnapshot,
    port: BrowserMIDIPortLike,
    signal: AbortSignal,
  ): Promise<HostPortRecord> {
    const key = portKey(endpoint.direction, endpoint.id);
    let record = session.records.get(key);
    if (!record || !record.active || record.generation !== endpoint.generation || record.port !== port) {
      if (record) this.#invalidateRecord(record);
      record = {
        session,
        key,
        port,
        generation: endpoint.generation,
        inputBindings: new Set(),
        references: 0,
        reservations: 0,
        active: true,
        openSettled: false,
        openPromise: null,
        closeStarted: false,
        nativeMessageListener: null,
        previousOnMessage: undefined,
      };
      session.records.set(key, record);
    }

    record.reservations += 1;
    try {
      if (!record.openPromise) {
        let opened: Promise<unknown>;
        try {
          opened = Promise.resolve(port.open?.());
        } catch (error) {
          opened = Promise.reject(error);
        }
        const activeRecord = record;
        record.openPromise = opened.then(
          () => {
            activeRecord.openSettled = true;
            if (!this.#recordIsCurrent(activeRecord)) {
              throw invalidState("The MIDI endpoint changed while it was opening.");
            }
          },
          (error) => {
            activeRecord.openSettled = true;
            throw error;
          },
        );
      }
      await raceSignal(record.openPromise, signal);
      signal.throwIfAborted();
      if (!this.#recordIsCurrent(record)) {
        throw invalidState("The MIDI endpoint changed while it was opening.");
      }
      record.references += 1;
      return record;
    } finally {
      record.reservations = Math.max(0, record.reservations - 1);
      if (record.references === 0 && record.reservations === 0) this.#closeIfUnused(record);
    }
  }

  #recordIsCurrent(record: HostPortRecord): boolean {
    if (this.#disposed || !record.active) return false;
    if (record.session.records.get(record.key) !== record) return false;
    if (record.session.generations.get(record.key) !== record.generation) return false;
    if (record.session.ports.get(record.key) !== record.port) return false;
    return record.port.state === "connected";
  }

  #ensureMessageListener(record: HostPortRecord, sysex: boolean): void {
    if (record.nativeMessageListener) return;
    const port = record.port as BrowserMIDIInputLike;
    const handler = (event: unknown) => {
      if (!this.#recordIsCurrent(record)) return;
      const data = messageData(event);
      if (!data || (!sysex && data[0] === 0xf0)) return;
      const endpoint = this.#snapshot(record.session, record.port);
      const receivedAtMilliseconds = messageTimestamp(event);
      for (const binding of [...record.inputBindings]) {
        if (!binding.active) continue;
        const packet: MIFXInputPacket = Object.freeze({
          endpoint,
          data: new Uint8Array(data),
          receivedAtMilliseconds,
        });
        try {
          binding.listener(packet);
        } catch {
        }
      }
    };
    record.nativeMessageListener = handler;
    if (typeof port.addEventListener === "function") {
      port.addEventListener("midimessage", handler);
    } else {
      record.previousOnMessage = port.onmidimessage;
      port.onmidimessage = handler;
    }
  }

  #detachMessageListener(record: HostPortRecord): void {
    const handler = record.nativeMessageListener;
    if (!handler) return;
    const port = record.port as BrowserMIDIInputLike;
    if (typeof port.removeEventListener === "function") {
      port.removeEventListener("midimessage", handler);
    } else if (port.onmidimessage === handler) {
      port.onmidimessage = record.previousOnMessage ?? null;
    }
    record.nativeMessageListener = null;
    record.previousOnMessage = undefined;
  }

  #releaseInputBinding(record: HostPortRecord, binding: InputBinding): void {
    if (!binding.active) return;
    binding.active = false;
    record.inputBindings.delete(binding);
    if (record.inputBindings.size === 0) this.#detachMessageListener(record);
    this.#releaseReference(record);
  }

  #releaseReference(record: HostPortRecord): void {
    if (record.references > 0) record.references -= 1;
    if (record.references === 0 && record.reservations === 0) this.#closeIfUnused(record);
  }

  #closeIfUnused(record: HostPortRecord): void {
    if (record.references !== 0 || record.reservations !== 0) return;
    if (record.session.records.get(record.key) === record) record.session.records.delete(record.key);
    this.#detachMessageListener(record);
    if (!record.openSettled && record.openPromise) {
      void record.openPromise.then(
        () => this.#closeNative(record),
        () => this.#closeNative(record),
      );
      return;
    }
    this.#closeNative(record);
  }

  #closeNative(record: HostPortRecord): void {
    if (record.closeStarted) return;
    record.closeStarted = true;
    try {
      void Promise.resolve(record.port.close?.()).catch(() => {});
    } catch {
    }
  }

  #invalidateRecord(record: HostPortRecord): void {
    if (!record.active) return;
    record.active = false;
    if (record.session.records.get(record.key) === record) record.session.records.delete(record.key);
    for (const binding of record.inputBindings) binding.active = false;
    record.inputBindings.clear();
    record.references = 0;
    this.#detachMessageListener(record);
    if (!record.openSettled && record.openPromise) {
      void record.openPromise.then(
        () => this.#closeNative(record),
        () => this.#closeNative(record),
      );
    } else {
      this.#closeNative(record);
    }
  }
}
