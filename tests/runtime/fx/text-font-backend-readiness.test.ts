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
import { TFXFontDescriptor } from "../../../src/FX/TextFX/TFXFontDescriptor";
import { createRuntimeCacheRegistry } from "../../../src/SynCloudOS/Cache";

const backend = vi.hoisted(() => ({ starts: 0 }));

vi.mock("../../../src/FX/TextFX/TFXFont", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/FX/TextFX/TFXFont")>();
  return {
    ...actual,
    prepareTFXFontBackend(signal?: AbortSignal) {
      backend.starts += 1;
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    },
  };
});

import { createTFXFontHost } from "../../../src/SynCloudOS/TextFX/TFXFontHost";

describe("TextFX browser backend readiness", () => {
  it("does not acquire packaged font bytes while cancellable WASM startup is pending", async () => {
    const runtimeOwner = new AbortController();
    const mountOwner = new AbortController();
    const loader = vi.fn(async () => ({ bytes: new Uint8Array(64), mimeType: "font/ttf" as const }));
    const host = createTFXFontHost({
      runtimeId: "runtime:backend-readiness" as never,
      signal: runtimeOwner.signal,
      caches: createRuntimeCacheRegistry({ runtimeId: "runtime:backend-readiness" as never, now: () => 0 }),
    });
    const scope = host.createScope(mountOwner.signal, loader);
    const pending = scope.registerFontResource("Resources/Fonts/pending.ttf", new TFXFontDescriptor({ size: 16 }));
    await vi.waitFor(() => expect(backend.starts).toBe(1));
    expect(loader).not.toHaveBeenCalled();
    mountOwner.abort(new DOMException("mount retired", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(loader).not.toHaveBeenCalled();
    host.dispose();
  });
});
