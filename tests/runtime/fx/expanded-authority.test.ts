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

import { createMountedResourceScope } from "../../../src/SynCloudOS/HostServices/mountedResourceScope";

describe("expanded mounted authority", () => {
  it("keeps resource budgets charged after caller revocation until host release", () => {
    const owner = new AbortController();
    const caller = new AbortController();
    const scope = createMountedResourceScope(owner.signal, {
      maxResources: 2,
      budgets: { bytes: 16, sessions: 1 },
    });
    let releaseHost!: () => void;
    const first = scope.acquire(
      caller.signal,
      (signal, release) => {
        releaseHost = release;
        return { signal };
      },
      undefined,
      { bytes: 16, sessions: 1 },
    );

    caller.abort(new DOMException("caller cancelled", "AbortError"));
    expect(first.signal.aborted).toBe(true);
    expect(() => scope.acquire(undefined, () => ({}), undefined, { bytes: 1 })).toThrowError(DOMException);
    expect(() => scope.acquire(undefined, () => ({}), undefined, { sessions: 1 })).toThrowError(DOMException);

    releaseHost();
    const replacement = scope.acquire(undefined, (_signal, release) => ({ release }), undefined, { bytes: 16, sessions: 1 });
    replacement.release();
  });

  it("reserves every budget dimension atomically before invoking the host", () => {
    const owner = new AbortController();
    const scope = createMountedResourceScope(owner.signal, {
      maxResources: 4,
      budgets: { bytes: 32, frames: 2, workerJobs: 1 },
    });
    const create = vi.fn((_signal: AbortSignal, release: () => void) => ({ release }));
    const first = scope.acquire(undefined, create, undefined, { bytes: 24, frames: 2, workerJobs: 1 });

    expect(() => scope.acquire(undefined, create, undefined, { bytes: 9 })).toThrowError(DOMException);
    expect(() => scope.acquire(undefined, create, undefined, { frames: 1 })).toThrowError(DOMException);
    expect(() => scope.acquire(undefined, create, undefined, { workerJobs: 1 })).toThrowError(DOMException);
    expect(create).toHaveBeenCalledTimes(1);

    first.release();
    const second = scope.acquire(undefined, create, undefined, { bytes: 32, frames: 2, workerJobs: 1 });
    second.release();
  });

  it("tracks shared budget reservations separately from live resource handles", () => {
    const owner = new AbortController();
    const scope = createMountedResourceScope(owner.signal, {
      maxResources: 1,
      budgets: { bytes: 8 },
    }) as ReturnType<typeof createMountedResourceScope> & {
      reserve(charge: { bytes: number }): { release(): void };
      snapshot(): {
        resources: number;
        usage: { bytes: number; frames: number; sessions: number; workerJobs: number };
      };
    };

    const backing = scope.reserve({ bytes: 8 });
    expect(scope.snapshot()).toEqual({
      resources: 0,
      usage: { bytes: 8, frames: 0, sessions: 0, workerJobs: 0 },
    });

    const handle = scope.acquire(undefined, (_signal, release) => ({ release }));
    expect(scope.snapshot().resources).toBe(1);
    expect(() => scope.acquire(undefined, () => ({}))).toThrowError(DOMException);
    expect(() => scope.reserve({ bytes: 1 })).toThrowError(DOMException);

    handle.release();
    expect(scope.snapshot()).toEqual({
      resources: 0,
      usage: { bytes: 8, frames: 0, sessions: 0, workerJobs: 0 },
    });
    backing.release();
    expect(scope.snapshot()).toEqual({
      resources: 0,
      usage: { bytes: 0, frames: 0, sessions: 0, workerJobs: 0 },
    });
    expect(() => backing.release()).not.toThrow();
  });

  it("revokes a composite runtime/mount owner without disturbing another owner", () => {
    const runtime = new AbortController();
    const mount = new AbortController();
    const otherOwner = new AbortController();
    const scope = createMountedResourceScope(AbortSignal.any([runtime.signal, mount.signal]));
    const otherScope = createMountedResourceScope(otherOwner.signal);
    const first = scope.acquire(undefined, (signal, release) => ({ signal, release }));
    const second = otherScope.acquire(undefined, (signal, release) => ({ signal, release }));

    runtime.abort(new DOMException("runtime disposed", "AbortError"));
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    first.release();
    second.release();
  });

  it("retains a raced reservation when cleanup throws until the host reports actual release", () => {
    const owner = new AbortController();
    const scope = createMountedResourceScope(owner.signal, { maxResources: 1 });
    let releaseHost!: () => void;

    expect(() => scope.acquire(
      undefined,
      (_signal, release) => {
        releaseHost = release;
        owner.abort(new DOMException("revoked during create", "AbortError"));
        return {};
      },
      () => { throw new Error("cleanup failed"); },
    )).toThrow(/revoked|abort/i);

    // The owner is revoked, so the same scope cannot issue again. More
    // importantly, the host still owns the captured release and can settle it
    // exactly once even after cleanup failed.
    expect(() => releaseHost()).not.toThrow();
    expect(() => releaseHost()).not.toThrow();
  });
});
