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

// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  RuntimeWebContentAdapter, RuntimeWebContentAdapterFactory, RuntimeWebContentAdapterLease,
  RuntimeWebContentAdapterMessage, RuntimeWebContentAdapterPrepareRequest, RuntimeWebContentPreparedNavigation,
} from "../../src/SynCloudOS/WebContent";
import { sanitiseWebContentHTML } from "../../src/SynCloudOS/WebContent";
import { authoriseTestRuntime, createTestBundle, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";
import { createBrowserRuntimeEnvironment } from "../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { BrowserWebContentAdapterFactory, type BrowserWebContentPlatform } from "../../src/SynCloudOS/PlatformAdapters/BrowserWebContentAdapter";
import { NSE } from "../../src/NSE/NSE";
import { NSEWebContentView } from "../../src/NSE/WebContent";
import { standardWindow } from "../fixtures/windowTestDependencies";

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class RecordingWebContentAdapter implements RuntimeWebContentAdapter {
  readonly prepares: RuntimeWebContentAdapterPrepareRequest[] = [];
  readonly releases: RuntimeWebContentPreparedNavigation[] = [];
  readonly posts: Array<{ sessionId: string; epoch: number; message: unknown; origin: string }> = [];
  readonly external: string[] = [];
  readonly frames = new Map<string, { epoch: number; frame: object }>();
  readonly listeners = new Set<(message: RuntimeWebContentAdapterMessage) => void>();
  disposed = false;
  externalAllowed = true;
  preparedOwnership = true;
  prepareGate: Promise<void> | null = null;
  prepareSignal: AbortSignal | null = null;
  prepareOverride: unknown = undefined;
  prepareTransform: ((request: RuntimeWebContentAdapterPrepareRequest) => unknown) | null = null;
  issueToken() { return "0123456789abcdef".repeat(4); }
  async prepare(request: RuntimeWebContentAdapterPrepareRequest, signal?: AbortSignal) {
    this.prepares.push(request);
    this.prepareSignal = signal ?? null;
    if (this.prepareGate) await this.prepareGate;
    if (this.prepareTransform) return this.prepareTransform(request) as RuntimeWebContentPreparedNavigation;
    if (this.prepareOverride !== undefined) return this.prepareOverride as RuntimeWebContentPreparedNavigation;
    const frameSource = request.source.kind === "url" ? request.source.url : `blob:${request.sessionId}:${request.navigationEpoch}`;
    const expectedOrigin = request.sandbox.includes("allow-same-origin") && request.source.kind === "url"
      ? new URL(request.source.url).origin : "null";
    return Object.freeze({ id: `navigation:${request.sessionId}:${request.navigationEpoch}`, sessionId: request.sessionId,
      navigationEpoch: request.navigationEpoch, frameSource, expectedOrigin, objectURL: request.source.kind === "html" });
  }
  releaseNavigation(navigation: unknown) { this.releases.push(navigation as RuntimeWebContentPreparedNavigation); }
  ownsNavigation(_navigation: unknown) { return this.preparedOwnership; }
  bindFrame(sessionId: string, epoch: number, frame: object | null) {
    if (frame) this.frames.set(sessionId, { epoch, frame }); else this.frames.delete(sessionId);
  }
  ownsMessage(sessionId: string, epoch: number, source: unknown) {
    const record = this.frames.get(sessionId); return record?.epoch === epoch && record.frame === source;
  }
  postMessage(sessionId: string, epoch: number, message: unknown, origin: string) { this.posts.push({ sessionId, epoch, message, origin }); }
  openExternal(url: string) { this.external.push(url); return this.externalAllowed; }
  subscribeMessages(listener: (message: RuntimeWebContentAdapterMessage) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(message: RuntimeWebContentAdapterMessage) { for (const listener of this.listeners) listener(message); }
  diagnostics() { return { listenerCount: this.listeners.size, objectURLCount: this.prepares.filter((item) => item.source.kind === "html").length - this.releases.filter((item) => item.objectURL).length, frameCount: this.frames.size }; }
  dispose() { this.disposed = true; this.listeners.clear(); this.frames.clear(); }
}

class RecordingWebContentFactory implements RuntimeWebContentAdapterFactory {
  readonly adapters: RecordingWebContentAdapter[] = [];
  readonly releases: Array<ReturnType<typeof vi.fn>> = [];
  acquire(): RuntimeWebContentAdapterLease {
    const adapter = new RecordingWebContentAdapter(); const release = vi.fn(() => adapter.dispose());
    this.adapters.push(adapter); this.releases.push(release); return { adapter, release };
  }
}

const allowWebContent = { authorise: vi.fn(async () => true) };

function runtimeWithWebContent(authorisation: { authorise: (request: never, signal: AbortSignal) => boolean | Promise<boolean> } | null = allowWebContent) {
  const factory = new RecordingWebContentFactory(); const environment = createTestRuntimeEnvironment();
  const runtime = (authorisation ? authoriseTestRuntime : (value: ReturnType<typeof createTestRuntime>) => value)(createTestRuntime({ environment: { ...environment, webContent: factory },
    ...(authorisation ? { webContentAuthorisation: authorisation as never } : {}) }));
  return { runtime, factory, adapter: factory.adapters[0]! };
}

const remoteRequest = (overrides: Record<string, unknown> = {}) => ({
  appId: "reference", applicationSessionId: "reference:session", ownerId: "reference:view", title: "Reference",
  source: { kind: "url", url: "https://reference.example/start" }, capabilities: ["same-origin"],
  decodeMessage: (payload: unknown) => payload, ...overrides,
});

function navigationAuthority(session: { getSnapshot(): { navigationEpoch: number; navigationId: string; frameSource: string } }) {
  const snapshot = session.getSnapshot();
  return Object.freeze({ epoch: snapshot.navigationEpoch, navigationId: snapshot.navigationId, frameSource: snapshot.frameSource });
}

describe("runtime-owned web content", () => {
  it("installs one runtime-owned web content session manager", () => {
    const runtime = createTestRuntime();
    expect((runtime as unknown as { webContent?: unknown }).webContent).toBeDefined();
  });

  it("constructs the browser web-content adapter only in the browser environment", () => {
    expect(createBrowserRuntimeEnvironment().webContent).toBeTruthy();
  });

  it("exports the neutral session-bound web content view", () => {
    expect((NSE as unknown as { NSEWebContentView?: unknown }).NSEWebContentView).toBeTypeOf("function");
  });

  it("default-denies creation before browser preparation and rechecks an explicit grant at commit", async () => {
    const denied = runtimeWithWebContent(null);
    await expect(denied.runtime.webContent.createSession(remoteRequest() as never)).rejects.toMatchObject({ name: "SecurityError" });
    expect(denied.adapter.prepares).toHaveLength(0);

    const decisions = [true, false];
    const authorise = vi.fn(async () => decisions.shift() ?? false);
    const revoked = runtimeWithWebContent({ authorise: authorise as never });
    await expect(revoked.runtime.webContent.createSession(remoteRequest() as never)).rejects.toMatchObject({ name: "SecurityError" });
    expect(authorise).toHaveBeenCalledTimes(2);
    expect(revoked.adapter.prepares).toHaveLength(1);
    expect(revoked.adapter.releases).toHaveLength(1);
    expect(revoked.runtime.webContent.diagnostics().sessionCount).toBe(0);
  });

  it("admits app web sessions only through a live runtime-issued owner lease", async () => {
    const factory = new RecordingWebContentFactory();
    const environment = createTestRuntimeEnvironment();
    const runtime = authoriseTestRuntime(createTestRuntime({
      id: "runtime:web:scoped-owner",
      environment: { ...environment, webContent: factory },
      initialBundles: [createTestBundle({ id: "scoped-owner", route: "/scoped-owner" })],
      webContentAuthorisation: { authorise: () => true },
    }));
    const request = {
      applicationSessionId: "application:scoped-owner",
      ownerId: "application:scoped-owner",
      title: "Scoped owner",
      source: { kind: "url" as const, url: "https://reference.example/start" },
      capabilities: ["same-origin" as const],
      decodeMessage: (payload: unknown) => payload,
    };

    await expect(runtime.webContent.createSession({
      ...request,
      appId: "scoped-owner",
      ownerLease: Object.freeze({}),
    } as never)).rejects.toMatchObject({ name: "SecurityError" });
    expect(factory.adapters[0]!.prepares).toHaveLength(0);

    const responderId = "application:scoped-owner";
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    const mount = runtime.transfers.mountApp(runtime.apps.getApp("scoped-owner")!, { responderId });
    const scope = mount.scope;
    await expect(scope.webContent.createSession({
      ...request,
      appId: "forged-owner",
    } as never)).rejects.toThrow(/unsupported|descriptor|scope/i);
    const scopedRequest = {
      title: request.title,
      source: request.source,
      capabilities: request.capabilities,
      decodeMessage: request.decodeMessage,
    };
    await expect(scope.webContent.createSession(scopedRequest)).resolves.toMatchObject({
      getSnapshot: expect.any(Function),
    });
    mount.dispose();
    await runtime.dispose("scoped web owner test cleanup");
  });

  it("accepts only the primitive boolean true from policy for loads, messages and external navigation", async () => {
    const malformedLoad = runtimeWithWebContent({ authorise: vi.fn(async () => "allowed") as never });
    await expect(malformedLoad.runtime.webContent.createSession(remoteRequest({ capabilities: ["same-origin"] }) as never))
      .rejects.toMatchObject({ name: "SecurityError" });
    expect(malformedLoad.adapter.prepares).toHaveLength(0);

    const received = vi.fn();
    const authorise = vi.fn(async (request: { action: string }) => request.action === "load" ? true : { allowed: true });
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ capabilities: ["same-origin"], onMessage: received }) as never);
    const frame = {}; session.bindFrame(frame); session.didLoad(navigationAuthority(session)); adapter.posts.splice(0);
    await expect(session.postMessage({ safe: true }, "malformed:send")).resolves.toBe(false);
    await expect(session.openExternal("https://external.example/page")).resolves.toBe(false);
    const prepared = adapter.prepares[0]!;
    adapter.emit({ source: frame, origin: "https://reference.example", data: { kind: "syncloudos.web-content.message",
      direction: "to-host", token: prepared.token, navigationEpoch: 1, correlationId: "malformed:receive", payload: { safe: true } } });
    await vi.waitFor(() => expect(authorise.mock.calls.some(([request]) => request.action === "message-receive")).toBe(true));
    expect(received).not.toHaveBeenCalled(); expect(adapter.posts).toHaveLength(0); expect(adapter.external).toHaveLength(0);
  });

  it("creates an exact sandboxed session and never grants top navigation", async () => {
    const authorise = vi.fn(async () => true); const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ capabilities: ["forms", "same-origin"] }) as never);
    expect(session.getSnapshot()).toMatchObject({ state: "loading", expectedOrigin: "https://reference.example",
      sandbox: "allow-forms allow-same-origin", navigationEpoch: 1 });
    expect(adapter.prepares[0]?.sandbox).toBe(session.getSnapshot().sandbox);
    expect(session.getSnapshot().sandbox).not.toContain("top-navigation");
    expect(authorise).toHaveBeenCalledTimes(2);
    expect(adapter.prepares[0]?.token).toMatch(/^[a-f0-9]{64}$/);
    expect(authorise.mock.calls[0]?.[0]).toMatchObject({ requestedCapabilities: ["forms", "same-origin"] });
  });

  it("uses a closed pure HTML subset and enables only the injected bootstrap script", () => {
    const document = sanitiseWebContentHTML({ kind: "html", html: "<p>Hello <strong>safe</strong></p>" }, "token", 1);
    expect(document).toContain("script-src 'unsafe-inline'");
    expect(document).toContain("<p>Hello <strong>safe</strong></p>");
    expect(document).toContain("__synCloudOSWebContent");
    expect(() => sanitiseWebContentHTML({ kind: "html", html: '<img src="javascript:alert(1)">' })).toThrow(/forbidden/i);
    expect(() => sanitiseWebContentHTML({ kind: "html", html: '<a href="jav&#x61;script:alert(1)">bad</a>' })).toThrow(/external navigation/i);
    expect(() => sanitiseWebContentHTML({ kind: "html", html: '<a href="https://example.com">unmediated</a>' })).toThrow(/external navigation/i);
    expect(() => sanitiseWebContentHTML({ kind: "html", html: "<p>unbalanced" })).toThrow(/balanced/i);
    const getter = vi.fn(() => "<p>poison</p>"); const hostile = { kind: "html" } as Record<string, unknown>;
    Object.defineProperty(hostile, "html", { enumerable: true, get: getter });
    expect(() => sanitiseWebContentHTML(hostile as never)).toThrow(/accessor/i); expect(getter).not.toHaveBeenCalled();
  });

  it("rejects same-origin script combinations and hostile source descriptors before policy or adapter I/O", async () => {
    const authorise = vi.fn(async () => true); const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    await expect(runtime.webContent.createSession(remoteRequest({
      source: { kind: "url", url: window.location.href }, capabilities: ["scripts", "same-origin"],
    }) as never)).rejects.toMatchObject({ name: "SecurityError" });
    const getter = vi.fn(() => "https://reference.example/");
    const source = { kind: "url" } as Record<string, unknown>;
    Object.defineProperty(source, "url", { enumerable: true, get: getter });
    await expect(runtime.webContent.createSession(remoteRequest({ source }) as never)).rejects.toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled(); expect(authorise).not.toHaveBeenCalled(); expect(adapter.prepares).toHaveLength(0);
  });

  it("rejects scripts with same-origin for every direct frame before redirects or self-navigation can escape isolation", async () => {
    const authorise = vi.fn(async () => true); const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    await expect(runtime.webContent.createSession(remoteRequest({
      source: { kind: "url", url: "https://cross-origin.example/redirectable" }, capabilities: ["scripts", "same-origin"],
    }) as never)).rejects.toMatchObject({ name: "SecurityError" });
    expect(authorise).not.toHaveBeenCalled(); expect(adapter.prepares).toHaveLength(0);
  });

  it("rejects unsafe URLs and UTF-8 oversized inline documents before policy or adapter I/O", async () => {
    const authorise = vi.fn(async () => true); const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    for (const url of ["javascript:alert(1)", "data:text/html,unsafe", "blob:https://reference.example/forged", "file:///tmp/unsafe"]) {
      await expect(runtime.webContent.createSession(remoteRequest({ source: { kind: "url", url } }) as never)).rejects.toMatchObject({ name: "SecurityError" });
    }
    await expect(runtime.webContent.createSession(remoteRequest({ source: { kind: "html", html: "é".repeat(200_000) }, capabilities: [] }) as never))
      .rejects.toThrow(/byte limit/i);
    expect(authorise).not.toHaveBeenCalled(); expect(adapter.prepares).toHaveLength(0);
  });

  it("accepts only exact current-frame, origin, token, epoch and unreplayed canonical messages", async () => {
    const received = vi.fn(); const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: received }) as never);
    const frame = {}; session.bindFrame(frame); session.didLoad(navigationAuthority(session));
    const token = adapter.prepares[0]!.token;
    const message = { kind: "syncloudos.web-content.message", direction: "to-host", token,
      navigationEpoch: 1, correlationId: "correlation:one", payload: { value: 7 } };
    adapter.emit({ source: {}, origin: "https://reference.example", data: message });
    adapter.emit({ source: frame, origin: "null", data: message });
    adapter.emit({ source: frame, origin: "https://forged.example", data: message });
    adapter.emit({ source: frame, origin: "https://reference.example", data: { ...message, token: "forged" } });
    adapter.emit({ source: frame, origin: "https://reference.example", data: { ...message, correlationId: "extra", unexpected: true } });
    adapter.emit({ source: frame, origin: "https://reference.example", data: message });
    adapter.emit({ source: frame, origin: "https://reference.example", data: message });
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received).toHaveBeenCalledWith(Object.freeze({ value: 7 }), expect.objectContaining({ correlationId: "correlation:one", navigationEpoch: 1 }));
    expect(adapter.posts[0]).toMatchObject({ origin: "https://reference.example", epoch: 1 });
  });

  it("rechecks message and external-navigation policy immediately before browser I/O", async () => {
    const actionCalls = new Map<string, number>();
    const authorise = vi.fn(async (request: { action: string }) => {
      const count = (actionCalls.get(request.action) ?? 0) + 1; actionCalls.set(request.action, count);
      if (request.action === "message-send" || request.action === "message-receive" || request.action === "open-external") return count === 1;
      return true;
    });
    const received = vi.fn(); const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: received }) as never);
    const frame = {}; session.bindFrame(frame); session.didLoad(navigationAuthority(session)); adapter.posts.splice(0);
    await expect(session.postMessage({ safe: true }, "outgoing")).resolves.toBe(false);
    await expect(session.openExternal("https://external.example/page")).resolves.toBe(false);
    const prepared = adapter.prepares[0]!;
    adapter.emit({ source: frame, origin: "https://reference.example", data: { kind: "syncloudos.web-content.message",
      direction: "to-host", token: prepared.token, navigationEpoch: 1, correlationId: "incoming", payload: { safe: true } } });
    await vi.waitFor(() => expect(actionCalls.get("message-receive")).toBe(2));
    expect(received).not.toHaveBeenCalled(); expect(adapter.posts).toHaveLength(0); expect(adapter.external).toHaveLength(0);
  });

  it("uses each outgoing correlation exactly once", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest() as never); const frame = {};
    session.bindFrame(frame); session.didLoad(navigationAuthority(session)); adapter.posts.splice(0);
    await expect(session.postMessage({ value: 1 }, "correlation:unique")).resolves.toBe(true);
    await expect(session.postMessage({ value: 2 }, "correlation:unique")).resolves.toBe(false);
    expect(adapter.posts).toHaveLength(1);
  });

  it("admits replay correlations only after canonical payload and final authority checks", async () => {
    const received = vi.fn();
    const authorise = vi.fn(async () => true);
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: received }) as never);
    const frame = {};
    session.bindFrame(frame);
    session.didLoad(navigationAuthority(session));
    adapter.posts.splice(0);

    // Canonicalisation failures must not let hostile callers fill the bounded
    // outgoing replay window before a legitimate message is sent.
    for (let index = 0; index < 256; index += 1) {
      await expect(session.postMessage(() => index, `malformed-outgoing:${index}`)).rejects.toThrow();
    }
    await expect(session.postMessage({ accepted: true }, "accepted-outgoing")).resolves.toBe(true);

    let acceptIncoming = false;
    session.dispose();
    const replacement = await runtime.webContent.createSession(remoteRequest({
      decodeMessage: (payload: unknown) => acceptIncoming ? payload : false,
      onMessage: received,
    }) as never);
    const replacementFrame = {};
    replacement.bindFrame(replacementFrame);
    replacement.didLoad(navigationAuthority(replacement));
    const prepared = adapter.prepares[1]!;
    for (let index = 0; index < 256; index += 1) {
      adapter.emit({
        source: replacementFrame,
        origin: "https://reference.example",
        data: {
          kind: "syncloudos.web-content.message",
          direction: "to-host",
          token: prepared.token,
          navigationEpoch: replacement.getSnapshot().navigationEpoch,
          correlationId: `decoder-rejected:${index}`,
          payload: { rejected: index },
        },
      });
    }
    acceptIncoming = true;
    adapter.emit({
      source: replacementFrame,
      origin: "https://reference.example",
      data: {
        kind: "syncloudos.web-content.message",
        direction: "to-host",
        token: prepared.token,
        navigationEpoch: replacement.getSnapshot().navigationEpoch,
        correlationId: "accepted-after-rejections",
        payload: { accepted: true },
      },
    });
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(
      Object.freeze({ accepted: true }),
      expect.objectContaining({ correlationId: "accepted-after-rejections" }),
    ));
  });

  it("bounds policy-delayed incoming correlation candidates before they enter the replay window", async () => {
    const gate = deferred<boolean>();
    let holdMessagePolicy = true;
    const authorise = vi.fn(async (request: { action: string }) =>
      request.action === "message-receive" && holdMessagePolicy ? gate.promise : true);
    const received = vi.fn();
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: received }) as never);
    const frame = {};
    session.bindFrame(frame);
    session.didLoad(navigationAuthority(session));
    const prepared = adapter.prepares[0]!;

    for (let index = 0; index < 257; index += 1) {
      adapter.emit({
        source: frame,
        origin: "https://reference.example",
        data: {
          kind: "syncloudos.web-content.message",
          direction: "to-host",
          token: prepared.token,
          navigationEpoch: session.getSnapshot().navigationEpoch,
          correlationId: `pending-window:${index}`,
          payload: { index },
        },
      });
    }

    holdMessagePolicy = false;
    gate.resolve(true);
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(256));
    expect(received).not.toHaveBeenCalledWith(
      expect.objectContaining({ index: 256 }),
      expect.anything(),
    );
  });

  it("reports a browser-refused external navigation without claiming success", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest() as never);
    adapter.externalAllowed = false;
    await expect(session.openExternal("https://external.example/page")).resolves.toBe(false);
    expect(adapter.external).toEqual(["https://external.example/page"]);
  });

  it("rejects hostile message accessors without execution and fences an old frame after navigation", async () => {
    const received = vi.fn(); const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: received }) as never);
    const oldFrame = {}; session.bindFrame(oldFrame); const oldToken = adapter.prepares[0]!.token;
    const getter = vi.fn(() => oldToken); const hostile = { kind: "syncloudos.web-content.message", direction: "to-host",
      navigationEpoch: 1, correlationId: "hostile", payload: {} } as Record<string, unknown>;
    Object.defineProperty(hostile, "token", { enumerable: true, get: getter });
    adapter.emit({ source: oldFrame, origin: "https://reference.example", data: hostile });
    expect(getter).not.toHaveBeenCalled();
    await session.navigate({ kind: "url", url: "https://next.example/page" });
    const nextFrame = {}; session.bindFrame(nextFrame); const nextToken = adapter.prepares[1]!.token;
    adapter.emit({ source: oldFrame, origin: "https://reference.example", data: { kind: "syncloudos.web-content.message", direction: "to-host",
      token: oldToken, navigationEpoch: 1, correlationId: "old", payload: {} } });
    adapter.emit({ source: nextFrame, origin: "https://next.example", data: { kind: "syncloudos.web-content.message", direction: "to-host",
      token: nextToken, navigationEpoch: 2, correlationId: "next", payload: { current: true } } });
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ current: true }), expect.anything());
    expect(adapter.releases).toHaveLength(1);
  });

  it("rejects cyclic, sparse and oversized message values before policy delivery", async () => {
    const received = vi.fn(); const authorise = vi.fn(async () => true); const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: received }) as never);
    const frame = {}; session.bindFrame(frame); const prepared = adapter.prepares[0]!;
    const envelope = (correlationId: string, payload: unknown) => ({ kind: "syncloudos.web-content.message", direction: "to-host",
      token: prepared.token, navigationEpoch: 1, correlationId, payload });
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    const sparse = new Array(2); sparse[0] = "one";
    adapter.emit({ source: frame, origin: "https://reference.example", data: envelope("cycle", cyclic) });
    adapter.emit({ source: frame, origin: "https://reference.example", data: envelope("sparse", sparse) });
    adapter.emit({ source: frame, origin: "https://reference.example", data: envelope("oversized", "x".repeat(70 * 1024)) });
    await Promise.resolve(); expect(received).not.toHaveBeenCalled();
    expect(authorise.mock.calls.filter(([request]) => request.action === "message-receive")).toHaveLength(0);
  });

  it("decodes only app-validated payloads before policy and never executes hostile decoded accessors", async () => {
    const received = vi.fn(); const authorise = vi.fn(async () => true); const getter = vi.fn(() => "poison");
    const decodeMessage = vi.fn((payload: Readonly<{ mode: string; value?: unknown }>) => {
      expect(Object.isFrozen(payload)).toBe(true);
      if (payload.mode === "deny") return false;
      if (payload.mode === "throw") throw new TypeError("invalid app payload");
      if (payload.mode === "accessor") {
        const decoded = {} as Record<string, unknown>; Object.defineProperty(decoded, "value", { enumerable: true, get: getter }); return decoded;
      }
      return { decoded: payload.value };
    });
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const decoderGetter = vi.fn(() => decodeMessage); const hostileRequest = remoteRequest({ capabilities: ["same-origin"] });
    Object.defineProperty(hostileRequest, "decodeMessage", { enumerable: true, get: decoderGetter });
    await expect(runtime.webContent.createSession(hostileRequest as never)).rejects.toThrow(/accessor/i);
    expect(decoderGetter).not.toHaveBeenCalled(); expect(authorise).not.toHaveBeenCalled(); expect(adapter.prepares).toHaveLength(0);
    const session = await runtime.webContent.createSession(remoteRequest({
      capabilities: ["same-origin"], decodeMessage, onMessage: received,
    }) as never);
    const frame = {}; session.bindFrame(frame); const prepared = adapter.prepares[0]!;
    const emit = (correlationId: string, payload: unknown) => adapter.emit({ source: frame, origin: "https://reference.example",
      data: { kind: "syncloudos.web-content.message", direction: "to-host", token: prepared.token,
        navigationEpoch: 1, correlationId, payload } });
    emit("decoder:deny", { mode: "deny" }); emit("decoder:throw", { mode: "throw" });
    emit("decoder:accessor", { mode: "accessor" }); emit("decoder:accept", { mode: "accept", value: "safe" });
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received).toHaveBeenCalledWith(Object.freeze({ decoded: "safe" }), expect.anything());
    expect(authorise.mock.calls.filter(([request]) => request.action === "message-receive")).toHaveLength(2);
    expect(getter).not.toHaveBeenCalled(); expect(decodeMessage).toHaveBeenCalledTimes(4);
  });

  it("suspends and closes app-owned sessions through runtime lifecycle and releases every adapter resource", async () => {
    const { runtime, factory, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ source: { kind: "html", html: "<p>Safe</p>" }, capabilities: [] }) as never);
    runtime.store.mutate((draft) => { draft.lifecycle.reference = "suspended"; });
    expect(session.getSnapshot().state).toBe("suspended");
    runtime.store.mutate((draft) => { draft.lifecycle.reference = "active"; });
    expect(session.getSnapshot().state).toBe("loading");
    runtime.store.mutate((draft) => { draft.lifecycle.reference = "closed"; });
    expect(session.getSnapshot().state).toBe("closed");
    expect(adapter.releases).toHaveLength(1);
    await runtime.dispose("test");
    expect(factory.releases[0]).toHaveBeenCalledTimes(1);
    expect(runtime.webContent.diagnostics()).toEqual({ sessionCount: 0, listenerCount: 0, objectURLCount: 0, frameCount: 0, pendingOperationCount: 0 });
  });

  it("keeps suspension authoritative when an in-flight navigation aborts, then resumes the last committed frame", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest() as never);
    const frame = {};
    session.bindFrame(frame);
    session.didLoad(navigationAuthority(session));
    const committed = session.getSnapshot();
    expect(committed.state).toBe("ready");

    const gate = deferred<void>();
    adapter.prepareGate = gate.promise;
    const navigating = session.navigate({ kind: "url", url: "https://next.example/pending" });
    await vi.waitFor(() => expect(adapter.prepares).toHaveLength(2));

    runtime.webContent.suspendOwner("reference");
    expect(session.getSnapshot()).toMatchObject({ state: "suspended", navigationEpoch: committed.navigationEpoch, frameSource: committed.frameSource });
    await expect(navigating).rejects.toMatchObject({ name: "AbortError" });
    expect(session.getSnapshot().state).toBe("suspended");

    runtime.webContent.resumeOwner("reference");
    expect(session.getSnapshot()).toMatchObject({ state: "ready", navigationEpoch: committed.navigationEpoch, frameSource: committed.frameSource });
    gate.resolve();
    await vi.waitFor(() => expect(adapter.releases).toHaveLength(1));
    expect(session.getSnapshot().state).toBe("ready");

    runtime.webContent.closeOwner("reference", "closed while suspended");
    runtime.webContent.suspendOwner("reference");
    runtime.webContent.resumeOwner("reference");
    expect(session.getSnapshot().state).toBe("closed");
  });

  it("remembers suspended and closed owner authority before a session is created", async () => {
    const { runtime } = runtimeWithWebContent();
    runtime.store.mutate((draft) => { draft.lifecycle.reference = "suspended"; });
    const suspended = await runtime.webContent.createSession(remoteRequest() as never);
    expect(suspended.getSnapshot().state).toBe("suspended"); suspended.dispose();
    runtime.store.mutate((draft) => { draft.lifecycle.reference = "closed"; });
    await expect(runtime.webContent.createSession(remoteRequest() as never)).rejects.toMatchObject({ name: "AbortError" });

    const window = runtime.windows.create(standardWindow("already-closed-web-window", {
      applicationId: "window-app", applicationSessionId: "window-app:session",
      content: { rendererId: "application", parameters: { appId: "window-app" } },
    }));
    await runtime.windows.open(window.id); await runtime.windows.requestClose(window.id, { reason: "command" });
    await expect(runtime.webContent.createSession(remoteRequest({ appId: "window-app", applicationSessionId: "window-app:session",
      windowControllerId: window.id }) as never)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels a pending asynchronous message handler on session disposal", async () => {
    const never = new Promise<void>(() => undefined); const entered = vi.fn();
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: () => { entered(); return never; } }) as never);
    const frame = {}; session.bindFrame(frame); const prepared = adapter.prepares[0]!;
    adapter.emit({ source: frame, origin: "https://reference.example", data: { kind: "syncloudos.web-content.message",
      direction: "to-host", token: prepared.token, navigationEpoch: 1, correlationId: "pending", payload: {} } });
    await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1));
    expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(1);
    session.dispose();
    await vi.waitFor(() => expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(0));
  });

  it("removes the outgoing policy abort listener before a non-cooperative policy settles late", async () => {
    const policyGate = deferred<boolean>();
    let policySignal: AbortSignal | null = null;
    const authorise = vi.fn((request: { action: string }, signal: AbortSignal) => {
      if (request.action === "message-send") {
        policySignal = signal;
        return policyGate.promise;
      }
      return true;
    });
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest() as never);
    const frame = {};
    session.bindFrame(frame);
    session.didLoad(navigationAuthority(session));
    adapter.posts.splice(0);
    const pending = session.postMessage({ safe: true }, "late-policy");
    await vi.waitFor(() => expect(policySignal).not.toBeNull());
    const removeAbort = vi.spyOn(policySignal!, "removeEventListener");

    session.dispose();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(0);
    policyGate.resolve(true);
    await Promise.resolve();
    expect(adapter.posts).toHaveLength(0);
  });

  it("waits for an async decoder and fences its late settlement after session disposal", async () => {
    const decoderGate = deferred<unknown>();
    const received = vi.fn();
    const authorise = vi.fn(async () => true);
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({
      decodeMessage: () => decoderGate.promise as never,
      onMessage: received,
    }) as never);
    const frame = {};
    session.bindFrame(frame);
    const prepared = adapter.prepares[0]!;
    adapter.emit({ source: frame, origin: "https://reference.example", data: {
      kind: "syncloudos.web-content.message", direction: "to-host", token: prepared.token,
      navigationEpoch: 1, correlationId: "late-decoder", payload: { safe: true },
    } });

    await vi.waitFor(() => expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(1));
    expect(authorise.mock.calls.filter(([request]) => request.action === "message-receive")).toHaveLength(0);
    session.dispose();
    await vi.waitFor(() => expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(0));
    decoderGate.resolve({ late: true });
    await Promise.resolve();
    expect(received).not.toHaveBeenCalled();
    expect(authorise.mock.calls.filter(([request]) => request.action === "message-receive")).toHaveLength(0);
  });

  it("removes the incoming handler abort listener before a late handler settlement", async () => {
    const handlerGate = deferred<void>();
    let receiveSignal: AbortSignal | null = null;
    let removeAbort: ReturnType<typeof vi.spyOn> | null = null;
    const authorise = vi.fn((request: { action: string }, signal: AbortSignal) => {
      if (request.action === "message-receive" && !receiveSignal) {
        receiveSignal = signal;
        removeAbort = vi.spyOn(signal, "removeEventListener");
      }
      return true;
    });
    const entered = vi.fn();
    const { runtime, adapter } = runtimeWithWebContent({ authorise: authorise as never });
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: () => {
      entered();
      removeAbort!.mockClear();
      return handlerGate.promise;
    } }) as never);
    const frame = {};
    session.bindFrame(frame);
    const prepared = adapter.prepares[0]!;
    adapter.emit({ source: frame, origin: "https://reference.example", data: {
      kind: "syncloudos.web-content.message", direction: "to-host", token: prepared.token,
      navigationEpoch: 1, correlationId: "late-handler", payload: { safe: true },
    } });
    await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1));

    session.dispose();

    await vi.waitFor(() => expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(0));
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    handlerGate.resolve();
    await Promise.resolve();
    expect(entered).toHaveBeenCalledTimes(1);
  });

  it("cancels an old pending message handler when navigation commits", async () => {
    const never = new Promise<void>(() => undefined); const entered = vi.fn();
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ onMessage: () => { entered(); return never; } }) as never);
    const frame = {}; session.bindFrame(frame); const prepared = adapter.prepares[0]!;
    adapter.emit({ source: frame, origin: "https://reference.example", data: { kind: "syncloudos.web-content.message",
      direction: "to-host", token: prepared.token, navigationEpoch: 1, correlationId: "pending-navigation", payload: {} } });
    await vi.waitFor(() => expect(entered).toHaveBeenCalledTimes(1));
    await session.navigate({ kind: "url", url: "https://next.example/page" });
    await vi.waitFor(() => expect(runtime.webContent.diagnostics().pendingOperationCount).toBe(0));
  });

  it("releases a late prepared navigation after runtime disposal", async () => {
    const gate = deferred<void>(); const { runtime, adapter } = runtimeWithWebContent(); adapter.prepareGate = gate.promise;
    const creating = runtime.webContent.createSession(remoteRequest() as never);
    await vi.waitFor(() => expect(adapter.prepares).toHaveLength(1));
    const removeAbort = vi.spyOn(adapter.prepareSignal!, "removeEventListener");
    await runtime.dispose("late prepare test");
    await expect(creating).rejects.toBe("late prepare test");
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    gate.resolve();
    await vi.waitFor(() => expect(adapter.releases).toHaveLength(1));
    expect(runtime.webContent.diagnostics()).toEqual({ sessionCount: 0, listenerCount: 0, objectURLCount: 0, frameCount: 0, pendingOperationCount: 0 });
  });

  it("descriptor-validates adapter preparation before reading or owning it", async () => {
    const { runtime, adapter } = runtimeWithWebContent(); const getter = vi.fn(() => "poison");
    const hostile = { id: "hostile", sessionId: "hostile", navigationEpoch: 1, frameSource: "https://reference.example/",
      expectedOrigin: "https://reference.example", objectURL: false } as Record<string, unknown>;
    Object.defineProperty(hostile, "expectedOrigin", { enumerable: true, get: getter }); Object.freeze(hostile);
    adapter.prepareOverride = hostile;
    await expect(runtime.webContent.createSession(remoteRequest() as never)).rejects.toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled(); expect(adapter.releases).toEqual([hostile]);
    expect(runtime.webContent.diagnostics().sessionCount).toBe(0);
  });

  it("rejects prepared navigation substitutions that do not exactly represent the authorised source and sandbox", async () => {
    const substitutedURL = runtimeWithWebContent();
    substitutedURL.adapter.prepareTransform = (request) => Object.freeze({ id: "substituted-url", sessionId: request.sessionId,
      navigationEpoch: request.navigationEpoch, frameSource: "https://attacker.example/substitute",
      expectedOrigin: "https://attacker.example", objectURL: false });
    await expect(substitutedURL.runtime.webContent.createSession(remoteRequest({ capabilities: ["same-origin"] }) as never))
      .rejects.toThrow(/authorised source|prepared navigation/i);

    const substitutedHTML = runtimeWithWebContent();
    substitutedHTML.adapter.prepareTransform = (request) => Object.freeze({ id: "substituted-html", sessionId: request.sessionId,
      navigationEpoch: request.navigationEpoch, frameSource: "https://attacker.example/network",
      expectedOrigin: "https://attacker.example", objectURL: false });
    await expect(substitutedHTML.runtime.webContent.createSession(remoteRequest({
      source: { kind: "html", html: "<p>safe</p>" }, capabilities: [],
    }) as never)).rejects.toThrow(/authorised source|prepared navigation/i);
    expect(substitutedURL.adapter.releases).toHaveLength(1); expect(substitutedHTML.adapter.releases).toHaveLength(1);

    const wrongOrigin = runtimeWithWebContent();
    wrongOrigin.adapter.prepareTransform = (request) => Object.freeze({ id: "wrong-origin", sessionId: request.sessionId,
      navigationEpoch: request.navigationEpoch, frameSource: (request.source as { url: string }).url,
      expectedOrigin: "null", objectURL: false });
    await expect(wrongOrigin.runtime.webContent.createSession(remoteRequest({ capabilities: ["same-origin"] }) as never))
      .rejects.toThrow(/authorised source/i);

    const unownedHTML = runtimeWithWebContent(); unownedHTML.adapter.preparedOwnership = false;
    await expect(unownedHTML.runtime.webContent.createSession(remoteRequest({
      source: { kind: "html", html: "<p>safe</p>" }, capabilities: [],
    }) as never)).rejects.toThrow(/owned|prepared navigation/i);
    expect(unownedHTML.adapter.releases).toHaveLength(1);
  });

  it("closes a session when its canonical window controller is removed", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const window = runtime.windows.create(standardWindow("web-content-window", {
      applicationId: "reference", applicationSessionId: "reference:session",
      content: { rendererId: "application", parameters: { appId: "reference" } },
    }));
    await runtime.windows.open(window.id);
    const session = await runtime.webContent.createSession(remoteRequest({ windowControllerId: window.id }) as never);
    await runtime.windows.requestClose(window.id, { reason: "command" });
    expect(session.getSnapshot().state).toBe("closed"); expect(adapter.releases).toHaveLength(1);
  });

  it("renders only the session snapshot and disposes the session on unmount", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ capabilities: ["forms"] }) as never);
    const view = render(<NSEWebContentView session={session} ownership="view" className="host-recipe" />);
    const frame = screen.getByTitle("Reference");
    expect(frame.classList.contains("host-recipe")).toBe(true);
    expect(frame.classList.contains("nse-web-content-view")).toBe(true);
    expect(frame.getAttribute("sandbox")).toBe("allow-forms");
    expect(frame.hasAttribute("allow")).toBe(false);
    expect(frame.getAttribute("sandbox")).not.toContain("top-navigation");
    fireEvent.load(frame); expect(session.getSnapshot().state).toBe("ready");
    view.unmount(); expect(session.getSnapshot().state).toBe("closed"); expect(adapter.releases).toHaveLength(1);
  });

  it("creates and owns a runtime session from the source-based public view binding", async () => {
    const factory = new RecordingWebContentFactory();
    const environment = createTestRuntimeEnvironment();
    const runtime = authoriseTestRuntime(createTestRuntime({
      id: "runtime:web:source-bound-scope",
      environment: { ...environment, webContent: factory },
      initialBundles: [createTestBundle({ id: "source-bound", route: "/source-bound" })],
      webContentAuthorisation: { authorise: () => true },
    }));
    const responderId = "application:source-bound";
    runtime.responders.register({ id: responderId, kind: "application", parentId: "workspace", scopeId: responderId });
    const mount = runtime.transfers.mountApp(runtime.apps.getApp("source-bound")!, { responderId });
    const scopedRuntime = { webContent: mount.scope.webContent };
    const props = {
      runtime: scopedRuntime,
      title: "Source-bound reference",
      source: { kind: "url" as const, url: "https://reference.example/start" },
      capabilities: ["forms" as const],
      decodeMessage: (payload: unknown) => payload,
    };
    const view = render(<NSEWebContentView {...props} />);
    await waitFor(() => expect(screen.getByTitle("Source-bound reference")).toBeTruthy());
    expect(screen.getByTitle("Source-bound reference").getAttribute("sandbox")).toBe("allow-forms");
    expect(runtime.webContent.diagnostics().sessionCount).toBe(1);
    view.unmount();
    expect(runtime.webContent.diagnostics().sessionCount).toBe(0);
    mount.dispose();
    await runtime.dispose("source-bound scope test cleanup");
  });

  it("ignores a superseded epoch load and does not dispose a parent-owned session on unmount", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ capabilities: ["same-origin"] }) as never);
    const view = render(<NSEWebContentView session={session} ownership="parent" />);
    const frame = screen.getByTitle("Reference") as HTMLIFrameElement;
    Object.defineProperty(frame, "src", { configurable: true, value: "https://stale.example/one" });
    fireEvent.load(frame);
    expect(session.getSnapshot().state).toBe("loading");
    await act(() => session.navigate({ kind: "url", url: "https://next.example/page" }));
    Object.defineProperty(frame, "src", { configurable: true, value: "https://stale.example/one" });
    fireEvent.load(frame);
    expect(session.getSnapshot()).toMatchObject({ state: "loading", navigationEpoch: 2, frameSource: "https://next.example/page" });
    view.unmount();
    expect(session.getSnapshot().state).not.toBe("closed");
    expect(runtime.webContent.get(session.id)).toBe(session);
    expect(adapter.releases.length).toBeGreaterThanOrEqual(0);
    session.dispose();
    expect(session.getSnapshot().state).toBe("closed");
  });

  it("rejects an old load authority when successive navigations reuse the same URL", async () => {
    const { runtime } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest() as never);
    const first = session.getSnapshot();
    session.bindFrame({});
    await act(() => session.navigate({ kind: "url", url: "https://reference.example/start" }));
    const second = session.getSnapshot();
    expect(second.navigationEpoch).toBe(first.navigationEpoch + 1);
    session.didLoad({ epoch: first.navigationEpoch, navigationId: first.navigationId, frameSource: first.frameSource });
    expect(session.getSnapshot().state).toBe("loading");
    session.bindFrame({});
    session.didLoad({ epoch: second.navigationEpoch, navigationId: second.navigationId, frameSource: second.frameSource });
    expect(session.getSnapshot().state).toBe("ready");
    session.dispose();
  });

  it("publishes a browser frame load failure through the session snapshot", async () => {
    const { runtime } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ capabilities: ["forms"] }) as never);
    const view = render(<NSEWebContentView session={session} />);
    act(() => session.didFail(navigationAuthority(session)));
    expect(session.getSnapshot()).toMatchObject({ state: "failed", failure: "Web content failed to load." });
    expect(view.container.querySelector("iframe")?.getAttribute("data-nse-web-content-state")).toBe("failed");
    view.unmount();
  });

  it("rebinds the mounted frame to each committed navigation epoch", async () => {
    const { runtime, adapter } = runtimeWithWebContent();
    const session = await runtime.webContent.createSession(remoteRequest({ capabilities: ["same-origin"] }) as never);
    const view = render(<NSEWebContentView session={session} />); const firstFrame = screen.getByTitle("Reference");
    fireEvent.load(firstFrame); expect(session.getSnapshot().state).toBe("ready");
    await act(() => session.navigate({ kind: "url", url: "https://next.example/page" }));
    const currentFrame = screen.getByTitle("Reference");
    expect(currentFrame).not.toBe(firstFrame);
    // The old navigation's listener remains bound to its original authority.
    // It cannot bless the new session even if React has already committed it.
    fireEvent.load(firstFrame);
    expect(session.getSnapshot().state).toBe("loading");
    fireEvent.load(currentFrame);
    expect(session.getSnapshot()).toMatchObject({ state: "ready", navigationEpoch: 2, frameSource: "https://next.example/page" });
    expect(adapter.frames.get(session.id)?.epoch).toBe(2);
    view.unmount();
  });

  it("isolates two runtimes sharing one environment factory", async () => {
    const factory = new RecordingWebContentFactory(); const environment = createTestRuntimeEnvironment();
    const first = authoriseTestRuntime(createTestRuntime({ id: "runtime:same", environment: { ...environment, webContent: factory }, webContentAuthorisation: allowWebContent }));
    const second = authoriseTestRuntime(createTestRuntime({ id: "runtime:same", environment: { ...environment, webContent: factory }, webContentAuthorisation: allowWebContent }));
    const receivedA = vi.fn(); const receivedB = vi.fn();
    const a = await first.webContent.createSession(remoteRequest({ onMessage: receivedA }) as never);
    const b = await second.webContent.createSession(remoteRequest({ onMessage: receivedB }) as never);
    const frameA = {}; const frameB = {}; a.bindFrame(frameA); b.bindFrame(frameB);
    const preparedA = factory.adapters[0]!.prepares[0]!;
    factory.adapters[0]!.emit({ source: frameA, origin: "https://reference.example", data: { kind: "syncloudos.web-content.message",
      direction: "to-host", token: preparedA.token, navigationEpoch: 1, correlationId: "a", payload: { runtime: "a" } } });
    await vi.waitFor(() => expect(receivedA).toHaveBeenCalledTimes(1)); expect(receivedB).not.toHaveBeenCalled();
    await first.dispose("test"); expect(factory.adapters[0]!.disposed).toBe(true); expect(factory.adapters[1]!.disposed).toBe(false);
    expect(b.getSnapshot().state).toBe("loading");
  });

  it("routes web load and message through PolicyKit allow/deny and cannot be bypassed", async () => {
    const factory = new RecordingWebContentFactory();
    const environment = createTestRuntimeEnvironment();
    const runtime = authoriseTestRuntime(createTestRuntime({
      id: "runtime:web:policykit",
      environment: { ...environment, webContent: factory },
      webContentAuthorisation: { authorise: () => true },
    }));
    const adapter = factory.adapters[0]!;
    const authorise = vi.spyOn(runtime.policy, "authorise");

    runtime.policy.registerPolicy("deny-load", (request, decision) =>
      request.action === "web-content.load" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    await expect(runtime.webContent.createSession(remoteRequest() as never))
      .rejects.toMatchObject({ name: "SecurityError" });
    expect(authorise).toHaveBeenCalled();
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "web-content.load"
      && request.requiredCapabilities?.includes("web-content.load"),
    )).toBe(true);
    expect(adapter.prepares).toHaveLength(0);

    expect(runtime.policy.removePolicy("deny-load")).toBe(true);
    const received = vi.fn();
    const session = await runtime.webContent.createSession(remoteRequest({
      capabilities: ["same-origin"],
      onMessage: received,
    }) as never);
    expect(authorise.mock.calls.some(([request]) =>
      request.requiredCapabilities?.includes("web-content.load"),
    )).toBe(true);
    const frame = {};
    session.bindFrame(frame);
    session.didLoad(navigationAuthority(session));
    const prepared = adapter.prepares[0]!;
    adapter.emit({
      source: frame,
      origin: "https://reference.example",
      data: {
        kind: "syncloudos.web-content.message",
        direction: "to-host",
        token: prepared.token,
        navigationEpoch: 1,
        correlationId: "policykit:receive",
        payload: { safe: true },
      },
    });
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "web-content.message-receive"
      && request.requiredCapabilities?.includes("web-content.message"),
    )).toBe(true);

    runtime.policy.registerPolicy("deny-send", (request, decision) =>
      request.action === "web-content.message-send" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );
    await expect(session.postMessage({ safe: true }, "policykit:send")).resolves.toBe(false);
    expect(authorise.mock.calls.some(([request]) =>
      request.action === "web-content.message-send"
      && request.requiredCapabilities?.includes("web-content.message"),
    )).toBe(true);
  });
});

describe("private browser web content adapter", () => {
  function platformHarness() {
    const windows = new WeakMap<object, object>(); const listeners = new Set<(message: RuntimeWebContentAdapterMessage) => void>();
    const revoked: string[] = []; const posted: unknown[] = []; const opened: string[] = []; let sequence = 0;
    const platform: BrowserWebContentPlatform = {
      createObjectURL: () => `blob:web:${++sequence}`, revokeObjectURL: (url) => revoked.push(url),
      frameWindow: (frame) => windows.get(frame) ?? null,
      postMessage: (_frame, message, targetOrigin) => posted.push({ message, targetOrigin }),
      openExternal: (url) => { opened.push(url); return true; },
      subscribeMessages(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      randomUUID: () => `uuid:${++sequence}`,
    };
    return { platform, windows, listeners, revoked, posted, opened };
  }

  it("owns object URLs, exact frame source and listener cleanup per runtime lease", async () => {
    const host = platformHarness(); const factory = new BrowserWebContentAdapterFactory(host.platform);
    const aSignal = new AbortController(); const bSignal = new AbortController();
    const a = factory.acquire("runtime:same", aSignal.signal); const b = factory.acquire("runtime:same", bSignal.signal);
    const input = { sessionId: "session", navigationEpoch: 1, token: "token", source: { kind: "html", html: "<p>safe</p>" },
      sandbox: "allow-scripts", sanitisedHTML: "<!doctype html><p>safe</p>" } as const;
    const first = await a.adapter.prepare(input, aSignal.signal); const second = await b.adapter.prepare(input, bSignal.signal);
    const frameA = {}; const frameB = {}; const sourceA = {}; const sourceB = {};
    host.windows.set(frameA, sourceA); host.windows.set(frameB, sourceB);
    a.adapter.bindFrame("session", 1, frameA); b.adapter.bindFrame("session", 1, frameB);
    const receiveA = vi.fn(); const receiveB = vi.fn(); a.adapter.subscribeMessages(receiveA); b.adapter.subscribeMessages(receiveB);
    expect(a.adapter.ownsMessage("session", 1, sourceA)).toBe(true);
    expect(a.adapter.ownsMessage("session", 1, sourceB)).toBe(false);
    a.release();
    expect(host.revoked).toEqual([first.frameSource]); expect(host.listeners).toHaveLength(1);
    expect(b.adapter.diagnostics()).toEqual({ listenerCount: 1, objectURLCount: 1, frameCount: 1 });
    b.adapter.releaseNavigation(second); expect(host.revoked).toEqual([first.frameSource, second.frameSource]);
    b.release(); expect(host.listeners).toHaveLength(0);
  });

  it("revokes a generated URL when abort wins after allocation", async () => {
    const host = platformHarness(); const controller = new AbortController();
    host.platform.createObjectURL = () => { controller.abort(new DOMException("late", "AbortError")); return "blob:late"; };
    const lease = new BrowserWebContentAdapterFactory(host.platform).acquire("runtime", new AbortController().signal);
    await expect(lease.adapter.prepare({ sessionId: "session", navigationEpoch: 1, token: "token",
      source: { kind: "html", html: "<p>safe</p>" }, sandbox: "", sanitisedHTML: "<!doctype html><p>safe</p>" }, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(host.revoked).toEqual(["blob:late"]); expect(lease.adapter.diagnostics().objectURLCount).toBe(0);
    lease.release();
  });
});
