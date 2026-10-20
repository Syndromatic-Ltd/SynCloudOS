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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { SynCloudOSRouteInfo } from "./appRouteTypes";
import type { AppRouteSession } from "./AppRouteSession";

export interface MountedRouteRequest {
  readonly route: SynCloudOSRouteInfo;
  readonly operationId: string;
  readonly signal: AbortSignal;
}

export interface MountedRouteParticipant {
  readonly signal: AbortSignal;
  loadAndRender(request: MountedRouteRequest): Promise<void>;
}

/** One participant per mounted session. React effect reattachment must not
 * start a second loader or manufacture a different operation identity. */
export function createMountedRouteParticipant(options: {
  readonly session: AppRouteSession;
  readonly signal: AbortSignal;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}) {
  let acknowledged = 0;
  let renderError: { revision: number; error: unknown } | null = null;
  let last: { operationId: string; result: Promise<void> } | null = null;
  const listeners = new Set<() => void>();
  const waitForRender = (revision: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    let timer: unknown;
    const cleanup = () => { listeners.delete(check); signal.removeEventListener("abort", check); if (timer !== undefined) options.clearTimeout(timer); };
    const check = () => {
      if (signal.aborted) { cleanup(); reject(new DOMException("Route render settlement cancelled.", "AbortError")); }
      else if (acknowledged >= revision) { cleanup(); resolve(); }
    };
    timer = options.setTimeout(() => { cleanup(); reject(new Error("Route render acknowledgement timed out.")); }, 15_000);
    listeners.add(check);
    signal.addEventListener("abort", check, { once: true });
    check();
  });
  return Object.freeze({
    signal: options.signal,
    reportRenderError(revision: number, error: unknown) { renderError = { revision, error }; },
    acknowledge(revision: number) {
      acknowledged = Math.max(acknowledged, revision);
      for (const listener of [...listeners]) listener();
    },
    loadAndRender(request: MountedRouteRequest): Promise<void> {
      if (last?.operationId === request.operationId) return last.result;
      const signal = AbortSignal.any([request.signal, options.signal]);
      const result = (async () => {
        signal.throwIfAborted();
        const loaded = await options.session.commit(request.route, { operationId: request.operationId, signal });
        if (loaded.status === "stale") throw new DOMException("Route data revision was superseded.", "AbortError");
        await waitForRender(loaded.revision, signal);
        if (renderError?.revision === loaded.revision) throw renderError.error;
        if (loaded.status === "error") throw loaded.error;
      })();
      last = { operationId: request.operationId, result };
      return result;
    },
  });
}

/** Joins a route operation to the existing mounted loader and React acknowledgement.
 * It does not launch apps, load data itself, or own browser history. */
export function createMountedRouteSettlement(clock: {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}) {
  const participants = new Map<string, MountedRouteParticipant>();
  const requests = new Map<string, MountedRouteRequest>();
  const listeners = new Set<() => void>();
  let disposed = false;
  return {
    current(appId: string) { return requests.get(normalizeBundleIdentifier(appId)) ?? null; },
    attach(appId: string, participant: MountedRouteParticipant) {
      if (disposed || participant.signal.aborted) throw new DOMException("Route mount is revoked.", "AbortError");
      participants.set(normalizeBundleIdentifier(appId), participant);
      for (const listener of [...listeners]) listener();
      const release = () => {
        if (participants.get(normalizeBundleIdentifier(appId)) === participant) participants.delete(normalizeBundleIdentifier(appId));
        participant.signal.removeEventListener("abort", release);
      };
      participant.signal.addEventListener("abort", release, { once: true });
      return release;
    },
    async settle(appId: string, request: MountedRouteRequest, required: boolean) {
      requests.set(normalizeBundleIdentifier(appId), request);
      if (!required && !participants.has(normalizeBundleIdentifier(appId))) return;
      const participant = await new Promise<MountedRouteParticipant>((resolve, reject) => {
        let timer: unknown;
        const cleanup = () => { listeners.delete(check); request.signal.removeEventListener("abort", abort); if (timer !== undefined) clock.clearTimeout(timer); };
        const abort = () => { cleanup(); reject(new DOMException("Route mount settlement cancelled.", "AbortError")); };
        const check = () => {
          if (disposed || request.signal.aborted || requests.get(normalizeBundleIdentifier(appId)) !== request) { abort(); return; }
          const mounted = participants.get(normalizeBundleIdentifier(appId));
          if (mounted && !mounted.signal.aborted) { cleanup(); resolve(mounted); }
        };
        timer = clock.setTimeout(() => { cleanup(); reject(new Error("Route mount did not attach: " + appId)); }, 15_000);
        request.signal.addEventListener("abort", abort, { once: true });
        listeners.add(check);
        check();
      });
      await participant.loadAndRender(request);
    },
    dispose() {
      disposed = true;
      participants.clear(); requests.clear();
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
  };
}
