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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpAuthentication, type HttpAuthenticationOptions } from "../../src/SynCloudOS/Authentication/createHttpAuthentication";
import type { AuthenticationService } from "../../src/SynCloudOS/Authentication/authenticationTypes";

const methods = { methods: [{ id: "google", label: "Google" }] };
const authenticated = {
  authenticated: true,
  profile: { subject: "verified-person", roles: ["member"] },
  expiresAt: 61_000,
};
const services: AuthenticationService[] = [];

function successfulResponse(input: RequestInfo | URL, session: unknown = { authenticated: false }) {
  const path = String(input);
  return Response.json(path.endsWith("/methods") ? methods
    : path.endsWith("/session") ? session
    : path.endsWith("/start") ? { redirectTo: "https://identity.example/sign-in" }
    : { ok: true });
}

function harness(options: HttpAuthenticationOptions = {}) {
  const fetcher = vi.fn<typeof fetch>(async input => successfulResponse(input));
  const channel = { postMessage: vi.fn(), close: vi.fn(), onmessage: null };
  const navigate = vi.fn();
  const service = createHttpAuthentication({
    fetch: fetcher,
    navigate,
    eventTarget: new EventTarget(),
    createBroadcastChannel: () => channel,
    ...options,
  });
  services.push(service);
  return { service, fetcher, channel, navigate };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function observe<T>(promise: Promise<T>) {
  const outcome: { status: "pending" | "fulfilled" | "rejected"; value?: T; error?: unknown } = { status: "pending" };
  void promise.then(value => { outcome.status = "fulfilled"; outcome.value = value; }, error => {
    outcome.status = "rejected";
    outcome.error = error;
  });
  return outcome;
}

function stalledBody(promise: Promise<unknown>) {
  const response = Response.json({});
  vi.spyOn(response, "json").mockImplementation(() => promise);
  return response;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
});

afterEach(() => {
  services.splice(0).forEach(service => service.dispose());
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("HTTP authentication failure classification and recovery", () => {
  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid requestTimeoutMs %s before opening resources", requestTimeoutMs => {
    const createBroadcastChannel = vi.fn();
    expect(() => createHttpAuthentication({ requestTimeoutMs, createBroadcastChannel })).toThrow(/finite.*positive/i);
    expect(createBroadcastChannel).not.toHaveBeenCalled();
  });

  it.each([true, false])("classifies fetch transport rejection without treating onLine=%s as internet proof", async onLine => {
    vi.stubGlobal("navigator", { ...navigator, onLine });
    const { service, fetcher } = harness();
    fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(service.refresh()).resolves.toMatchObject({
      status: "error", errorCode: "CONNECTION_ERROR", error: "Cannot connect to the authentication server.",
      profile: null, expiresAt: null,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["anonymous", "authenticated"] as const)("clears a transport failure when refresh verifies %s", async status => {
    const { service, fetcher } = harness();
    fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
    await service.refresh();
    expect(service.getSnapshot().errorCode).toBe("CONNECTION_ERROR");
    fetcher.mockImplementation(async input => successfulResponse(input, status === "authenticated" ? authenticated : { authenticated: false }));
    const refresh = service.refresh();
    expect(service.getSnapshot()).toMatchObject({ status: "checking", error: null });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    await expect(refresh).resolves.toMatchObject({ status, error: null });
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it.each([401, 403, 408, 500, 503, 504])("keeps HTTP %s as an explicit protocol/auth error", async status => {
    const { service, fetcher } = harness();
    fetcher.mockImplementation(async () => Response.json({ error: "Server refused the request" }, { status }));
    await expect(service.refresh()).resolves.toMatchObject({ status: "error", error: "Server refused the request" });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    () => new Response("invalid JSON"),
    () => Response.json(null),
    () => Response.json({ error: "Application failure" }),
    () => Response.json({ authenticated: true, profile: {}, expiresAt: 61_000 }),
  ])("does not classify invalid payloads or server application errors as connection errors", async response => {
    const { service, fetcher } = harness();
    fetcher.mockImplementation(async input => String(input).endsWith("/methods") ? Response.json(methods) : response());
    await expect(service.refresh()).resolves.toMatchObject({ status: "error" });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears a stale connection code when the next request fails at the protocol layer", async () => {
    const { service, fetcher } = harness();
    fetcher.mockRejectedValue(new Error("transport"));
    await service.refresh();
    expect(service.getSnapshot().errorCode).toBe("CONNECTION_ERROR");
    fetcher.mockImplementation(async () => Response.json({ error: "Unavailable" }, { status: 503 }));
    await service.refresh();
    expect(service.getSnapshot()).toMatchObject({ status: "error", error: "Unavailable" });
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it.each(["ignores abort", "rejects on abort"])("bounds a hung fetch that %s at the default 15000ms", async behavior => {
    const { service, fetcher } = harness();
    const signals: AbortSignal[] = [];
    fetcher.mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signals.push(signal);
      if (behavior === "rejects on abort") signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const outcome = observe(service.refresh());
    await vi.advanceTimersByTimeAsync(14_999);
    expect(outcome.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome.status).toBe("fulfilled");
    expect(outcome.value).toMatchObject({ status: "error", errorCode: "REQUEST_TIMEOUT" });
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["/auth/methods", "/auth/session"])("bounds a stalled %s body within the original request deadline", async path => {
    const { service, fetcher } = harness({ requestTimeoutMs: 100 });
    const body = deferred<unknown>();
    let requestSignal: AbortSignal | undefined;
    fetcher.mockImplementation(async (input, init) => {
      requestSignal = init!.signal!;
      await new Promise(resolve => setTimeout(resolve, 60));
      return String(input) === path ? stalledBody(body.promise) : successfulResponse(input);
    });
    const outcome = observe(service.refresh());
    await vi.advanceTimersByTimeAsync(60);
    expect(outcome.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(39);
    expect(outcome.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome.status).toBe("fulfilled");
    expect(outcome.value).toMatchObject({ status: "error", errorCode: "REQUEST_TIMEOUT" });
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recovers a timeout through the existing refresh", async () => {
    const { service, fetcher } = harness({ requestTimeoutMs: 20 });
    fetcher.mockImplementation(() => new Promise<Response>(() => {}));
    const timeout = observe(service.refresh());
    await vi.advanceTimersByTimeAsync(20);
    expect(timeout.value).toMatchObject({ errorCode: "REQUEST_TIMEOUT" });
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await expect(service.refresh()).resolves.toMatchObject({ status: "authenticated", error: null });
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it.each(["fetch", "body"])("settles caller cancellation promptly during %s even when work ignores abort", async phase => {
    const { service, fetcher } = harness({ requestTimeoutMs: 100 });
    const work = deferred<Response>();
    const body = deferred<unknown>();
    fetcher.mockImplementation(async input => phase === "fetch" ? work.promise
      : String(input).endsWith("/session") ? stalledBody(body.promise) : successfulResponse(input));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const outcome = observe(service.refresh(controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.status).toBe("rejected");
    expect(outcome.error).toMatchObject({ name: "AbortError" });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it("never starts fetch or a timer for an already aborted caller", async () => {
    const { service, fetcher } = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(service.refresh(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["fetch", "body"])("disposal settles a pending %s and removes request resources without classifying it", async phase => {
    const { service, fetcher } = harness();
    const response = deferred<Response>();
    const body = deferred<unknown>();
    fetcher.mockImplementation(async input => phase === "fetch" ? response.promise
      : String(input).endsWith("/session") ? stalledBody(body.promise) : successfulResponse(input));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const outcome = observe(service.refresh(controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    const before = service.getSnapshot();
    const listener = vi.fn();
    service.subscribe(listener);
    service.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.status).toBe("rejected");
    expect(outcome.error).toMatchObject({ name: "AbortError" });
    expect(service.getSnapshot()).toBe(before);
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    response.resolve(Response.json({ authenticated: true }));
    body.resolve(authenticated);
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getSnapshot()).toBe(before);
  });

  it.each(["success", "transport", "protocol", "timeout"])("removes external abort listeners and timers after %s", async mode => {
    const { service, fetcher } = harness({ requestTimeoutMs: 10 });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    if (mode === "transport") fetcher.mockRejectedValue(new TypeError("fetch failed"));
    if (mode === "protocol") fetcher.mockImplementation(async () => Response.json({}, { status: 500 }));
    if (mode === "timeout") fetcher.mockImplementation(() => new Promise<Response>(() => {}));
    const outcome = observe(service.refresh(controller.signal));
    await vi.advanceTimersByTimeAsync(mode === "timeout" ? 10 : 0);
    expect(outcome.status).toBe("fulfilled");
    const abortListener = add.mock.calls.find(call => call[0] === "abort")?.[1];
    expect(abortListener).toBeTypeOf("function");
    expect(remove).toHaveBeenCalledWith("abort", abortListener);
    expect(vi.getTimerCount()).toBe(0);
    const before = service.getSnapshot();
    controller.abort();
    await vi.advanceTimersByTimeAsync(20);
    expect(service.getSnapshot()).toBe(before);
  });

  it.each(["late fetch success", "late fetch rejection", "late body success", "late body rejection"])("fences %s after timeout and a newer successful refresh", async kind => {
    const { service, fetcher } = harness({ requestTimeoutMs: 10 });
    const response = deferred<Response>();
    const body = deferred<unknown>();
    fetcher.mockImplementation(async input => String(input).endsWith("/methods") ? Response.json(methods)
      : kind.includes("body") ? stalledBody(body.promise) : response.promise);
    const old = observe(service.refresh());
    await vi.advanceTimersByTimeAsync(10);
    expect(old.value).toMatchObject({ errorCode: "REQUEST_TIMEOUT" });
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    const newer = service.getSnapshot();
    const changed = vi.fn();
    service.subscribe(changed);
    if (kind === "late fetch success") response.resolve(Response.json({ authenticated: false }));
    if (kind === "late fetch rejection") response.reject(new TypeError("late fetch failure"));
    if (kind === "late body success") body.resolve({ authenticated: false });
    if (kind === "late body rejection") body.reject(new Error("late body failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getSnapshot()).toBe(newer);
    expect(changed).not.toHaveBeenCalled();
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it.each(["transport", "timeout", "success"])("fences an older refresh %s behind a newer generation", async mode => {
    const { service, fetcher } = harness({ requestTimeoutMs: 10 });
    const response = deferred<Response>();
    fetcher.mockImplementation(async input => String(input).endsWith("/methods") ? Response.json(methods) : response.promise);
    const old = observe(service.refresh());
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    const newer = service.getSnapshot();
    if (mode === "transport") response.reject(new TypeError("old failure"));
    if (mode === "success") response.resolve(Response.json({ authenticated: false }));
    await vi.advanceTimersByTimeAsync(10);
    expect(old.status).toBe("fulfilled");
    expect(service.getSnapshot()).toBe(newer);
  });

  it.each(["transport", "timeout", "protocol"])("keeps authenticated session authority when logout fails with %s", async mode => {
    const { service, fetcher, channel } = harness({ requestTimeoutMs: 10 });
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    const confirmed = service.getSnapshot();
    const identityChanged = vi.fn();
    service.sessionAdapter.subscribe(identityChanged);
    fetcher.mockImplementation(async () => {
      if (mode === "transport") throw new TypeError("fetch failed");
      if (mode === "timeout") return new Promise<Response>(() => {});
      return Response.json({ error: "logout refused" }, { status: 503 });
    });
    const outcome = observe(service.signOut());
    await vi.advanceTimersByTimeAsync(10);
    expect(outcome.status).toBe("rejected");
    const failed = service.getSnapshot();
    expect(failed).toMatchObject({ status: "authenticated", expiresAt: confirmed.expiresAt });
    expect(failed.profile).toBe(confirmed.profile);
    expect(failed.errorCode).toBe(mode === "transport" ? "CONNECTION_ERROR" : mode === "timeout" ? "REQUEST_TIMEOUT" : undefined);
    expect(identityChanged).not.toHaveBeenCalled();
    expect(channel.postMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1); // Only the confirmed session's expiry.
  });

  it("clears a failed logout classification immediately when logout is retried", async () => {
    const { service, fetcher, channel } = harness();
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    fetcher.mockRejectedValue(new TypeError("fetch failed"));
    await expect(service.signOut()).rejects.toThrow();
    expect(service.getSnapshot().errorCode).toBe("CONNECTION_ERROR");
    const logout = deferred<Response>();
    fetcher.mockReturnValue(logout.promise);
    const retry = service.signOut();
    expect(service.getSnapshot().error).toBeNull();
    expect(service.getSnapshot().errorCode).toBeUndefined();
    logout.resolve(Response.json({ ok: true }));
    await retry;
    expect(service.getSnapshot()).toMatchObject({ status: "anonymous", profile: null, error: null });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(channel.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "failure", "timeout"])("fences obsolete logout %s behind a newer confirmed session", async mode => {
    const { service, fetcher, channel } = harness({ requestTimeoutMs: 10 });
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    const response = deferred<Response>();
    fetcher.mockReturnValue(response.promise);
    const old = observe(service.signOut());
    fetcher.mockImplementation(async input => successfulResponse(input, { ...authenticated, profile: { subject: "new-person", roles: [] } }));
    await service.refresh();
    const newer = service.getSnapshot();
    const changed = vi.fn();
    service.subscribe(changed);
    if (mode === "success") response.resolve(Response.json({ ok: true }));
    if (mode === "failure") response.reject(new TypeError("old logout failed"));
    await vi.advanceTimersByTimeAsync(10);
    expect(old.status).toBe(mode === "success" ? "fulfilled" : "rejected");
    expect(service.getSnapshot()).toBe(newer);
    expect(changed).not.toHaveBeenCalled();
    expect(channel.postMessage).not.toHaveBeenCalled();
  });

  it.each(["focus", "storage", "broadcast"])("handles disposal during detached %s revalidation without an unhandled rejection", async trigger => {
    const events = new EventTarget();
    const channel: { postMessage(): void; close(): void; onmessage: ((event: MessageEvent) => void) | null } = {
      postMessage() {}, close() {}, onmessage: null,
    };
    const { service, fetcher } = harness({ eventTarget: events, createBroadcastChannel: () => channel });
    fetcher.mockImplementation(() => new Promise<Response>(() => {}));
    if (trigger === "broadcast") channel.onmessage!(new MessageEvent("message"));
    else events.dispatchEvent(new Event(trigger));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const checking = service.getSnapshot();
    service.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.getSnapshot()).toBe(checking);
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["signIn", "fetch"], ["signIn", "body"], ["signOut", "fetch"], ["signOut", "body"],
  ] as const)("settles cancelled %s with no connection classification even when %s ignores abort", async (action, phase) => {
    const { service, fetcher, navigate } = harness();
    fetcher.mockImplementation(async input => successfulResponse(input, action === "signOut" ? authenticated : { authenticated: false }));
    await service.refresh();
    const confirmed = service.getSnapshot();
    fetcher.mockImplementation(async () => phase === "fetch" ? new Promise<Response>(() => {}) : stalledBody(new Promise(() => {})));
    const controller = new AbortController();
    const outcome = observe(action === "signIn" ? service.signIn("google", "/journal", controller.signal) : service.signOut(controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new DOMException("Caller stopped the action", "AbortError"));
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.status).toBe("rejected");
    expect(outcome.error).toMatchObject({ name: "AbortError", message: "Caller stopped the action" });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    if (action === "signOut") {
      expect(service.getSnapshot().status).toBe("authenticated");
      expect(service.getSnapshot().profile).toBe(confirmed.profile);
      expect(service.getSnapshot().expiresAt).toBe(confirmed.expiresAt);
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(action === "signOut" ? 1 : 0);
  });

  it.each(["focus", "storage", "broadcast", "online"])("keeps successful logout authoritative when passive %s revalidation intervenes", async trigger => {
    const events = new EventTarget();
    const channel: { postMessage(value: unknown): void; close(): void; onmessage: ((event: MessageEvent) => void) | null } = {
      postMessage: vi.fn(), close() {}, onmessage: null,
    };
    const { service, fetcher } = harness({ eventTarget: events, createBroadcastChannel: () => channel });
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    const response = deferred<Response>();
    fetcher.mockImplementation(async input => String(input).endsWith("/logout") ? response.promise : successfulResponse(input, authenticated));
    const outcome = observe(service.signOut());
    if (trigger === "broadcast") channel.onmessage!(new MessageEvent("message"));
    else events.dispatchEvent(new Event(trigger));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(3); // Passive revalidation must not supersede logout.
    response.resolve(Response.json({ ok: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.status).toBe("fulfilled");
    expect(service.getSnapshot()).toMatchObject({ status: "anonymous", profile: null, error: null });
    expect(channel.postMessage).toHaveBeenCalledWith({ type: "session-changed" });
    expect(vi.getTimerCount()).toBe(0);
    events.dispatchEvent(new Event(trigger === "broadcast" ? "focus" : trigger));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(5); // Revalidation resumes once logout settles.
  });

  it.each([401, 408, 500, 503, 504])("preserves explicit HTTP %s when its response body never finishes", async status => {
    for (const action of ["refresh", "signIn", "signOut"] as const) {
      const { service, fetcher } = harness({ requestTimeoutMs: 10 });
      await service.refresh();
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const signals: AbortSignal[] = [];
      fetcher.mockImplementation(async (_input, init) => {
        signals.push(init!.signal!);
        const response = new Response(null, { status });
        vi.spyOn(response, "json").mockImplementation(() => new Promise(() => {}));
        return response;
      });
      const outcome = observe<unknown>(action === "refresh" ? service.refresh(controller.signal)
        : action === "signIn" ? service.signIn("google", "/journal", controller.signal) : service.signOut(controller.signal));
      await vi.advanceTimersByTimeAsync(10);
      expect(outcome.status).toBe(action === "refresh" ? "fulfilled" : "rejected");
      expect(service.getSnapshot().error).toBe(`Authentication request failed (${status}).`);
      expect(service.getSnapshot().errorCode).toBeUndefined();
      expect(signals.every(signal => signal.aborted)).toBe(true);
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
      service.dispose();
    }
  });

  it.each([
    ["signIn", "fetch"], ["signIn", "body"], ["signOut", "fetch"], ["signOut", "body"],
  ] as const)("settles disposed %s while %s ignores abort without publishing a failure", async (action, phase) => {
    const { service, fetcher, navigate, channel } = harness();
    await service.refresh();
    fetcher.mockImplementation(async () => phase === "fetch" ? new Promise<Response>(() => {}) : stalledBody(new Promise(() => {})));
    const outcome = observe(action === "signIn" ? service.signIn("google", "/journal") : service.signOut());
    await vi.advanceTimersByTimeAsync(0);
    const before = service.getSnapshot();
    const changed = vi.fn();
    service.subscribe(changed);
    service.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.status).toBe("rejected");
    expect(outcome.error).toMatchObject({ name: "AbortError" });
    expect(service.getSnapshot()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(channel.postMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["refresh", "signIn", "signOut"] as const)("classifies %s response-body transport failure", async action => {
    const { service, fetcher } = harness();
    await service.refresh();
    fetcher.mockImplementation(async input => String(input).endsWith("/methods") ? Response.json(methods)
      : stalledBody(Promise.reject(new TypeError("Body read failed"))));
    const outcome = observe<unknown>(action === "refresh" ? service.refresh()
      : action === "signIn" ? service.signIn("google", "/journal") : service.signOut());
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome.status).toBe(action === "refresh" ? "fulfilled" : "rejected");
    expect(service.getSnapshot()).toMatchObject({ errorCode: "CONNECTION_ERROR", error: "Cannot read the authentication server response." });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps an explicit HTTP error when its body read loses transport", async () => {
    const { service, fetcher } = harness();
    fetcher.mockImplementation(async () => {
      const response = new Response(null, { status: 503 });
      vi.spyOn(response, "json").mockRejectedValue(new TypeError("Body read failed"));
      return response;
    });
    await service.refresh();
    expect(service.getSnapshot()).toMatchObject({ status: "error", error: "Authentication request failed (503)." });
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it.each(["transport", "body timeout"])("classifies sign-in %s and clears the error on the next action", async mode => {
    const { service, fetcher, navigate } = harness({ requestTimeoutMs: 10 });
    await service.refresh();
    fetcher.mockImplementation(async () => {
      if (mode === "transport") throw new TypeError("fetch failed");
      return stalledBody(new Promise(() => {}));
    });
    const outcome = observe(service.signIn("google", "/journal"));
    await vi.advanceTimersByTimeAsync(10);
    expect(outcome.status).toBe("rejected");
    expect(service.getSnapshot()).toMatchObject({ status: "error", errorCode: mode === "transport" ? "CONNECTION_ERROR" : "REQUEST_TIMEOUT" });
    expect(navigate).not.toHaveBeenCalled();
    fetcher.mockImplementation(async input => successfulResponse(input));
    const retry = service.signIn("google", "/journal");
    expect(service.getSnapshot()).toMatchObject({ status: "authenticating", error: null });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    await retry;
    expect(navigate).toHaveBeenCalledWith("https://identity.example/sign-in");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not classify a navigation exception as a fetch transport failure", async () => {
    const { service, navigate } = harness();
    await service.refresh();
    navigate.mockImplementation(() => { throw new Error("Navigation failed"); });
    await expect(service.signIn("google", "/journal")).rejects.toThrow("Navigation failed");
    expect(service.getSnapshot().errorCode).toBeUndefined();
  });

  it("fences a delayed sign-in redirect behind a newer refresh", async () => {
    const { service, fetcher, navigate } = harness({ requestTimeoutMs: 10 });
    await service.refresh();
    const response = deferred<Response>();
    fetcher.mockReturnValue(response.promise);
    const old = observe(service.signIn("google", "/journal"));
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    const newer = service.getSnapshot();
    response.resolve(Response.json({ redirectTo: "https://identity.example/obsolete" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(old.status).toBe("fulfilled");
    expect(navigate).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toBe(newer);
  });

  it("replaces a failed logout code with ordinary session expiry without extending authority", async () => {
    const { service, fetcher } = harness();
    fetcher.mockImplementation(async input => successfulResponse(input, authenticated));
    await service.refresh();
    fetcher.mockRejectedValue(new TypeError("fetch failed"));
    await expect(service.signOut()).rejects.toThrow();
    expect(service.getSnapshot().errorCode).toBe("CONNECTION_ERROR");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(service.getSnapshot()).toMatchObject({ status: "expired", profile: null });
    expect(service.getSnapshot().errorCode).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
