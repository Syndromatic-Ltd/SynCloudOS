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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type {
  IdentitySessionAdapter,
  IdentitySessionAdapterSnapshot,
  IdentitySessionService,
  IdentitySessionSnapshot,
} from "./identitySessionTypes";

function cloneSnapshot(snapshot: IdentitySessionSnapshot | null): IdentitySessionSnapshot | null {
  return snapshot
    ? { ...snapshot, claims: { ...snapshot.claims } }
    : null;
}

function sameSession(left: IdentitySessionSnapshot | null, right: IdentitySessionSnapshot | null): boolean {
  if (!left || !right) return left === right;
  return left.id === right.id && left.subjectId === right.subjectId
    && left.state === right.state && left.expiresAt === right.expiresAt
    && Object.keys(left.claims).length === Object.keys(right.claims).length
    && Object.keys(left.claims).every(key => Object.hasOwn(right.claims, key) && Object.is(left.claims[key], right.claims[key]));
}

export interface IdentitySessionServiceOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly adapter: IdentitySessionAdapter;
}

function toRuntimeSnapshot(runtimeId: SynCloudOSRuntimeId, snapshot: IdentitySessionAdapterSnapshot | null): IdentitySessionSnapshot | null {
  return snapshot
    ? {
        runtimeId,
        id: snapshot.id,
        subjectId: snapshot.subjectId,
        state: snapshot.state,
        claims: { ...snapshot.claims },
        expiresAt: snapshot.expiresAt,
      }
    : null;
}

export function createAnonymousIdentitySessionAdapter(): IdentitySessionAdapter {
  return {
    id: "anonymous-session",
    read: async () => null,
    subscribe: () => () => undefined,
    end: async () => undefined,
    dispose: () => undefined,
  };
}

export function createIdentitySessionService(options: IdentitySessionServiceOptions): IdentitySessionService {
  let snapshot: IdentitySessionSnapshot | null = null;
  let revision = 0;
  let disposed = false;
  const listeners = new Set<(value: IdentitySessionSnapshot | null) => void>();
  const publish = (value: IdentitySessionAdapterSnapshot | null) => {
    const updated = toRuntimeSnapshot(options.runtimeId, value);
    // Focus/storage rechecks and read()'s adapter notification can report the
    // same session twice. Revision fences represent authority changes, not
    // network requests; an unchanged response must not revoke mounted routes.
    if (sameSession(snapshot, updated)) return cloneSnapshot(snapshot);
    snapshot = updated;
    revision++;
    const next = cloneSnapshot(snapshot);
    listeners.forEach((listener) => listener(next));
    return next;
  };
  const unsubscribeAdapter = options.adapter.subscribe((value) => {
    if (!disposed) publish(value);
  });

  return {
    runtimeId: options.runtimeId,
    getRevision: () => revision,
    getSnapshot() {
      return cloneSnapshot(snapshot);
    },
    subscribe(listener) {
      if (disposed) return () => false;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh(request = {}) {
      if (disposed) return null;
      if (request.signal?.aborted) {
        throw request.signal.reason instanceof Error
          ? request.signal.reason
          : new Error("identity session refresh cancelled");
      }
      const value = await options.adapter.read(request.signal);
      if (disposed || request.signal?.aborted) {
        throw request.signal?.reason instanceof Error
          ? request.signal.reason
          : new Error("identity session refresh cancelled");
      }
      return publish(value);
    },
    async end(request) {
      if (disposed) return;
      await options.adapter.end(request);
      if (!disposed) publish(null);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeAdapter();
      listeners.clear();
      await options.adapter.dispose();
      snapshot = null;
      revision++;
    },
  };
}
