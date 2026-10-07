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

import { describe, expect, it, vi } from "vitest";

import type { MIFXEndpointSnapshot } from "../../../src/FX/MIDIFX/MIFXAccess";
import { MIDIService } from "../../../src/SynCloudOS/MIDIFX/MIDIService";
import { BrowserMIDIAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserMIDIAdapter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type StateListener = (event: { readonly port: TestPort }) => void;
type MessageListener = (event: { readonly data: Uint8Array; readonly timeStamp: number }) => void;

interface TestPort {
  readonly id: string;
  readonly type: "input" | "output";
  manufacturer: string | null;
  name: string | null;
  version: string | null;
  state: "connected" | "disconnected";
  connection: "open" | "closed" | "pending";
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener?: ReturnType<typeof vi.fn>;
  removeEventListener?: ReturnType<typeof vi.fn>;
  send?: ReturnType<typeof vi.fn>;
  emitMessage?(bytes: readonly number[], timeStamp?: number): void;
}

function inputPort(id = "input-1", openImpl: () => Promise<unknown> = async () => undefined): TestPort {
  const listeners = new Set<MessageListener>();
  const port: TestPort = {
    id,
    type: "input",
    manufacturer: null,
    name: null,
    version: null,
    state: "connected",
    connection: "closed",
    open: vi.fn(async () => {
      port.connection = "pending";
      const result = await openImpl();
      if (port.state === "connected") port.connection = "open";
      return result;
    }),
    close: vi.fn(async () => {
      port.connection = "closed";
    }),
    addEventListener: vi.fn((type: string, listener: MessageListener) => {
      if (type === "midimessage") listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: MessageListener) => {
      if (type === "midimessage") listeners.delete(listener);
    }),
    emitMessage(bytes, timeStamp = 12.5) {
      for (const listener of [...listeners]) listener({ data: new Uint8Array(bytes), timeStamp });
    },
  };
  return port;
}

function outputPort(id = "output-1"): TestPort {
  const port: TestPort = {
    id,
    type: "output",
    manufacturer: null,
    name: null,
    version: null,
    state: "connected",
    connection: "closed",
    open: vi.fn(async () => {
      port.connection = "open";
    }),
    close: vi.fn(async () => {
      port.connection = "closed";
    }),
    send: vi.fn(),
  };
  return port;
}

function nativeAccess(inputs: readonly TestPort[] = [], outputs: readonly TestPort[] = [], sysexEnabled = false) {
  const stateListeners = new Set<StateListener>();
  const access = {
    inputs: new Map(inputs.map((port) => [port.id, port])),
    outputs: new Map(outputs.map((port) => [port.id, port])),
    sysexEnabled,
    addEventListener: vi.fn((type: string, listener: StateListener) => {
      if (type === "statechange") stateListeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: StateListener) => {
      if (type === "statechange") stateListeners.delete(listener);
    }),
    emitState(port: TestPort) {
      for (const listener of [...stateListeners]) listener({ port });
    },
    stateListenerCount() {
      return stateListeners.size;
    },
  };
  return access;
}

function serviceFor(requestMIDIAccess?: (options?: Readonly<{ sysex?: boolean }>) => Promise<unknown>) {
  const request = requestMIDIAccess ? vi.fn(requestMIDIAccess) : undefined;
  const adapter = new BrowserMIDIAdapter(request ? { requestMIDIAccess: request } : {});
  const service = new MIDIService(adapter);
  return { adapter, service, request };
}

const trustedOwner = Object.freeze({
  canRequestAuthorization: true,
  canRequestSysEx: true,
});

describe("MIDIFX scoped browser access", () => {
  it("observes capability passively and keeps API absence distinct from denial", async () => {
    const absent = serviceFor();
    const access = absent.service.createAccess(trustedOwner);
    expect(access.getCapabilities()).toEqual({
      apiAvailable: false,
      transportProtocol: "midi1",
      authorization: "unavailable",
      sysexAuthorization: "unavailable",
      connectedEndpointCount: 0,
    });
    expect(access.getEndpoints()).toEqual([]);
    expect(await access.requestAuthorization()).toEqual({ state: "unavailable", sysex: false });
    access.dispose();
    absent.service.dispose();

    const native = nativeAccess();
    const present = serviceFor(async () => native);
    const passive = present.service.createAccess(trustedOwner);
    expect(passive.getCapabilities()).toEqual({
      apiAvailable: true,
      transportProtocol: "midi1",
      authorization: "unknown",
      sysexAuthorization: "unknown",
      connectedEndpointCount: 0,
    });
    expect(present.request).not.toHaveBeenCalled();
    passive.dispose();
    present.service.dispose();
  });

  it("defaults authorization to non-SysEx and keeps browser SysEx denial separate", async () => {
    const normal = nativeAccess([], [], false);
    const fixture = serviceFor(async (options) => {
      if (options?.sysex) throw new DOMException("SysEx blocked", "NotAllowedError");
      return normal;
    });
    const access = fixture.service.createAccess(trustedOwner);

    expect(await access.requestAuthorization()).toEqual({ state: "granted", sysex: false });
    expect(fixture.request).toHaveBeenNthCalledWith(1, { sysex: false });
    expect(access.getCapabilities()).toMatchObject({
      authorization: "granted",
      sysexAuthorization: "unknown",
      connectedEndpointCount: 0,
    });

    expect(await access.requestAuthorization({ sysex: true })).toEqual({ state: "denied", sysex: true });
    expect(fixture.request).toHaveBeenNthCalledWith(2, { sysex: true });
    expect(access.getCapabilities()).toMatchObject({
      authorization: "granted",
      sysexAuthorization: "denied",
    });
    access.dispose();
    fixture.service.dispose();
  });

  it("keeps ordinary browser denial distinct from API absence and policy denial", async () => {
    const fixture = serviceFor(async () => {
      throw new DOMException("MIDI blocked", "NotAllowedError");
    });
    const access = fixture.service.createAccess(trustedOwner);

    expect(await access.requestAuthorization()).toEqual({ state: "denied", sysex: false });
    expect(access.getCapabilities()).toMatchObject({
      apiAvailable: true,
      authorization: "denied",
      sysexAuthorization: "unknown",
    });
    expect(fixture.request).toHaveBeenCalledWith({ sysex: false });
    access.dispose();
    fixture.service.dispose();
  });

  it("reports policy denial without touching Web MIDI and uses no public app id", async () => {
    const fixture = serviceFor(async () => nativeAccess());
    const access = fixture.service.createAccess({
      canRequestAuthorization: false,
      canRequestSysEx: false,
    });
    expect(access.getCapabilities()).toMatchObject({
      apiAvailable: true,
      authorization: "policy-denied",
      sysexAuthorization: "policy-denied",
    });
    expect(await access.requestAuthorization()).toEqual({ state: "policy-denied", sysex: false });
    expect(await access.requestAuthorization({ sysex: true })).toEqual({ state: "policy-denied", sysex: true });
    expect(fixture.request).not.toHaveBeenCalled();
    access.dispose();
    fixture.service.dispose();
  });

  it("cancels an unanswered authorization and discards a late native result after owner disposal", async () => {
    const pendingNative = deferred<unknown>();
    const late = nativeAccess([inputPort()]);
    const replacement = nativeAccess();
    const fixture = serviceFor(async () => pendingNative.promise);
    const owner = new AbortController();
    const access = fixture.service.createAccess({ ...trustedOwner, signal: owner.signal });
    const pending = access.requestAuthorization();

    owner.abort(new DOMException("owner disposed", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    pendingNative.resolve(late);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.stateListenerCount()).toBe(0);

    fixture.request!.mockImplementationOnce(async () => replacement);
    const next = fixture.service.createAccess(trustedOwner);
    expect(next.getCapabilities().authorization).toBe("unknown");
    expect(next.getEndpoints()).toEqual([]);
    expect(await next.requestAuthorization()).toEqual({ state: "granted", sysex: false });
    expect(fixture.request).toHaveBeenCalledTimes(2);
    next.dispose();
    fixture.service.dispose();
  });

  it("cancels an unanswered authorization from the request signal without publishing the late result", async () => {
    const pendingNative = deferred<unknown>();
    const late = nativeAccess([inputPort("late-input")]);
    const replacement = nativeAccess();
    const fixture = serviceFor(async () => pendingNative.promise);
    const access = fixture.service.createAccess(trustedOwner);
    const caller = new AbortController();
    const pending = access.requestAuthorization({ signal: caller.signal });

    caller.abort(new DOMException("caller cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    pendingNative.resolve(late);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.stateListenerCount()).toBe(0);

    fixture.request!.mockImplementationOnce(async () => replacement);
    expect(access.getCapabilities().authorization).toBe("unknown");
    expect(await access.requestAuthorization()).toEqual({ state: "granted", sysex: false });
    expect(fixture.request).toHaveBeenCalledTimes(2);
    access.dispose();
    fixture.service.dispose();
  });

  it("publishes immutable nullable endpoint snapshots and increments generation on hot-plug", async () => {
    const input = inputPort();
    const output = outputPort();
    input.manufacturer = null;
    input.name = null;
    input.version = null;
    const native = nativeAccess([input], [output]);
    const fixture = serviceFor(async () => native);
    const access = fixture.service.createAccess(trustedOwner);
    await access.requestAuthorization();

    const first = access.getEndpoints();
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toHaveLength(2);
    for (const endpoint of first) expect(Object.isFrozen(endpoint)).toBe(true);
    const firstInput = first.find((endpoint) => endpoint.direction === "input")!;
    expect(firstInput).toMatchObject({
      id: "input-1",
      manufacturer: null,
      name: null,
      version: null,
      state: "connected",
      generation: 1,
    });
    expect(() => {
      (firstInput as { name: string | null }).name = "mutated";
    }).toThrow();

    const updates: (readonly MIFXEndpointSnapshot[])[] = [];
    const subscription = access.subscribeEndpoints((snapshot) => updates.push(snapshot));
    input.state = "disconnected";
    native.emitState(input);
    const disconnected = access.getEndpoints().find((endpoint) => endpoint.id === input.id)!;
    expect(disconnected.generation).toBeGreaterThan(firstInput.generation);
    expect(disconnected.state).toBe("disconnected");

    const reconnected = inputPort(input.id);
    native.inputs.set(reconnected.id, reconnected);
    native.emitState(reconnected);
    const current = access.getEndpoints().find((endpoint) => endpoint.id === input.id)!;
    expect(current.generation).toBeGreaterThan(disconnected.generation);
    expect(current.state).toBe("connected");
    expect(updates.at(-1)?.find((endpoint) => endpoint.id === input.id)?.generation).toBe(current.generation);

    await expect(access.subscribeInput(firstInput, vi.fn())).rejects.toMatchObject({ name: "InvalidStateError" });
    subscription.dispose();
    access.dispose();
    fixture.service.dispose();
  });

  it("rejects an input open that becomes stale while the native open promise is pending", async () => {
    const pendingOpen = deferred<unknown>();
    const input = inputPort("slow-input", () => pendingOpen.promise);
    const native = nativeAccess([input]);
    const fixture = serviceFor(async () => native);
    const access = fixture.service.createAccess(trustedOwner);
    await access.requestAuthorization();
    const endpoint = access.getEndpoints()[0]!;
    const pending = access.subscribeInput(endpoint, vi.fn());

    expect(input.open).toHaveBeenCalledTimes(1);
    input.state = "disconnected";
    native.emitState(input);
    pendingOpen.resolve(undefined);
    await expect(pending).rejects.toMatchObject({ name: "InvalidStateError" });
    expect(input.addEventListener).not.toHaveBeenCalled();
    access.dispose();
    fixture.service.dispose();
  });

  it("releases only one owner's input listener and output lease", async () => {
    const input = inputPort();
    const output = outputPort();
    const native = nativeAccess([input], [output]);
    const fixture = serviceFor(async () => native);
    const first = fixture.service.createAccess(trustedOwner);
    const second = fixture.service.createAccess(trustedOwner);
    await first.requestAuthorization();
    await second.requestAuthorization();
    expect(fixture.request).toHaveBeenCalledTimes(1);

    const inputSnapshot = first.getEndpoints().find((endpoint) => endpoint.direction === "input")!;
    const outputSnapshot = first.getEndpoints().find((endpoint) => endpoint.direction === "output")!;
    const firstPackets = vi.fn();
    const secondPackets = vi.fn();
    const firstInput = await first.subscribeInput(inputSnapshot, firstPackets);
    const secondInput = await second.subscribeInput(inputSnapshot, secondPackets);
    const firstOutput = await first.acquireOutput(outputSnapshot);
    const secondOutput = await second.acquireOutput(outputSnapshot);

    input.emitMessage?.([0x90, 60, 100]);
    expect(firstPackets).toHaveBeenCalledTimes(1);
    expect(secondPackets).toHaveBeenCalledTimes(1);

    first.dispose();
    input.emitMessage?.([0x90, 61, 100]);
    expect(firstPackets).toHaveBeenCalledTimes(1);
    expect(secondPackets).toHaveBeenCalledTimes(2);
    expect(input.close).not.toHaveBeenCalled();
    expect(output.close).not.toHaveBeenCalled();
    expect(() => firstOutput.send(new Uint8Array([0x90, 60, 1]))).toThrow();

    secondOutput.send(new Uint8Array([0x90, 62, 100]));
    expect(output.send).toHaveBeenCalledWith(new Uint8Array([0x90, 62, 100]));
    secondInput.dispose();
    secondOutput.dispose();
    expect(input.close).toHaveBeenCalledTimes(1);
    expect(output.close).toHaveBeenCalledTimes(1);
    second.dispose();
    fixture.service.dispose();
  });
});
