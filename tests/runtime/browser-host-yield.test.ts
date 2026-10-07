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
import { createBrowserHostYield } from "../../src/SynCloudOS/PlatformAdapters/browserHostYield";

describe("browser host yield", () => {
  it("prefers scheduler.yield when the host provides it", async () => {
    const schedulerYield = vi.fn(() => Promise.resolve());
    const setTimeout = vi.fn();
    const yieldToHost = createBrowserHostYield({ scheduler: { yield: schedulerYield }, MessageChannel, setTimeout });
    await yieldToHost(new AbortController().signal);
    expect(schedulerYield).toHaveBeenCalledTimes(1);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it("uses an unclamped message task before falling back to timers", async () => {
    const setTimeout = vi.fn();
    const yieldToHost = createBrowserHostYield({ MessageChannel, setTimeout });
    for (let index = 0; index < 10; index++) await yieldToHost(new AbortController().signal);
    expect(setTimeout).not.toHaveBeenCalled();
  });

  it("falls back to a zero-delay timer without other facilities", async () => {
    const setTimeout = vi.fn((callback: () => void) => { callback(); });
    await createBrowserHostYield({ setTimeout })(new AbortController().signal);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  });

  it("rejects with the abort reason before and during a yield and ignores a late continuation", async () => {
    let release!: () => void;
    const yieldToHost = createBrowserHostYield({ scheduler: { yield: () => new Promise<void>((resolve) => { release = resolve; }) }, setTimeout });
    const aborted = new AbortController();
    aborted.abort(new DOMException("before", "AbortError"));
    await expect(yieldToHost(aborted.signal)).rejects.toMatchObject({ message: "before" });

    const controller = new AbortController();
    const pending = yieldToHost(controller.signal);
    controller.abort(new DOMException("during", "AbortError"));
    await expect(pending).rejects.toMatchObject({ message: "during" });
    release();
    await Promise.resolve();
  });
});
