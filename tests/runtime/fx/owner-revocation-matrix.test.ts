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

describe("mounted resource owner revocation matrix", () => {
  it("does not publish a resource when its owner is revoked during acquisition", () => {
    const owner = new AbortController();
    const scope = createMountedResourceScope(owner.signal);
    const dispose = vi.fn();

    expect(() => (scope.acquire as unknown as Function)(
      undefined,
      (signal: AbortSignal) => {
        owner.abort(new DOMException("mount revoked", "AbortError"));
        return { signal, dispose };
      },
      (resource: { dispose(): void }) => resource.dispose(),
    )).toThrow(/mount revoked|abort/i);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps unrelated owners and sibling leases independent", () => {
    const firstOwner = new AbortController();
    const secondOwner = new AbortController();
    const firstScope = createMountedResourceScope(firstOwner.signal);
    const secondScope = createMountedResourceScope(secondOwner.signal);
    const caller = new AbortController();
    const first = firstScope.acquire(caller.signal, (signal) => ({ signal }));
    const sibling = firstScope.acquire(undefined, (signal) => ({ signal }));
    const other = secondScope.acquire(undefined, (signal) => ({ signal }));

    caller.abort(new DOMException("caller cancelled", "AbortError"));
    expect(first.signal.aborted).toBe(true);
    expect(sibling.signal.aborted).toBe(false);
    expect(other.signal.aborted).toBe(false);

    firstOwner.abort(new DOMException("first mount revoked", "AbortError"));
    expect(sibling.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
  });

  it("does not let cleanup failure turn a revoked acquisition into success", () => {
    const owner = new AbortController();
    const scope = createMountedResourceScope(owner.signal, 1);
    const cleanup = vi.fn(() => {
      throw new Error("cleanup failure");
    });

    expect(() => (scope.acquire as unknown as Function)(
      undefined,
      () => {
        owner.abort(new DOMException("revoked", "AbortError"));
        return {};
      },
      cleanup,
    )).toThrow(/revoked|abort/i);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
