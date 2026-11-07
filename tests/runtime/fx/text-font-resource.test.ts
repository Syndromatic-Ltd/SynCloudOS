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

import { notoFontEncodings, readNotoSans as noto } from "../../fixtures/fx/fonts/noto-font-encodings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TFXFontDescriptor } from "../../../src/FX/TextFX/public";

import { createRegisteredFontResourceLoader, maximumTFXFontResourceBytes } from "../../../src/SynCloudOS/BundleLoader/fontResourceLoader";
import { createTestBundle, createTestRuntime, mountTestSynWareRuntime } from "../helpers";

const descriptor = () => new TFXFontDescriptor({ family: "Packaged font", size: 18 });

afterEach(() => vi.unstubAllGlobals());

describe("TextFX packaged font resources", () => {
  it("loads only through the mounted bundle's private resource authority", async () => {
    const firstLoader = vi.fn(async (path: string) => {
      if (path !== "Resources/Fonts/Shared.ttf") throw new DOMException("missing", "NotFoundError");
      return { bytes: noto(), mimeType: "font/ttf" as const };
    });
    const secondLoader = vi.fn(async (path: string) => {
      if (path !== "Resources/Fonts/Peer.ttf") throw new DOMException("missing", "NotFoundError");
      return { bytes: noto(), mimeType: "font/ttf" as const };
    });
    const firstBundle = createTestBundle({ bundleIdentifier: "com.example.font-resource-first", route: "/font-resource-first" }, { fontResourceLoader: firstLoader });
    const secondBundle = createTestBundle({ bundleIdentifier: "com.example.font-resource-second", route: "/font-resource-second" }, { fontResourceLoader: secondLoader });
    const runtime = createTestRuntime({ initialBundles: [firstBundle, secondBundle] });
    const first = mountTestSynWareRuntime(runtime, firstBundle.manifest.bundleIdentifier);
    const second = mountTestSynWareRuntime(runtime, secondBundle.manifest.bundleIdentifier);
    try {
      const registration = await first.runtime.textLayout.registerFontResource("Resources/Fonts/Shared.ttf", descriptor());
      expect(registration.font.shape("office").glyphs.length).toBeLessThan("office".length);
      await expect(first.runtime.textLayout.registerFontResource("Resources/Fonts/Peer.ttf", descriptor())).rejects.toMatchObject({ name: "NotFoundError" });
      await expect(second.runtime.textLayout.registerFontResource("Resources/Fonts/Shared.ttf", descriptor())).rejects.toMatchObject({ name: "NotFoundError" });
      expect(firstLoader).toHaveBeenCalledTimes(2);
      expect(secondLoader).toHaveBeenCalledTimes(1);
    } finally {
      first.dispose(); second.dispose(); await runtime.dispose("test");
    }
  });

  it.each([
    "../Resources/Fonts/font.ttf",
    "Resources/../font.ttf",
    "Resources/Fonts%2ffont.ttf",
    "Resources/Fonts%5cfont.ttf",
    "Resources\\Fonts\\font.ttf",
    "/Resources/Fonts/font.ttf",
    "https://example.test/font.ttf",
    "Resources/Fonts/font.ttf\0ignored",
  ])("rejects non-canonical bundle path %s before invoking its loader", async (path) => {
    const loader = vi.fn(async () => ({ bytes: noto(), mimeType: "font/ttf" as const }));
    const bundle = createTestBundle({ bundleIdentifier: "com.example.font-resource-paths", route: "/font-resource-paths" }, { fontResourceLoader: loader });
    const runtime = createTestRuntime({ initialBundles: [bundle] });
    const mount = mountTestSynWareRuntime(runtime, bundle.manifest.bundleIdentifier);
    try {
      await expect(mount.runtime.textLayout.registerFontResource(path, descriptor())).rejects.toBeInstanceOf(TypeError);
      expect(loader).not.toHaveBeenCalled();
    } finally { mount.dispose(); await runtime.dispose("test"); }
  });

  it("rejects mismatched MIME and oversized loader results before font decoding", async () => {
    const mismatched = createTestBundle({ bundleIdentifier: "com.example.font-resource-mime", route: "/font-resource-mime" }, {
      fontResourceLoader: async () => ({ bytes: noto(), mimeType: "font/woff2" }),
    });
    const oversized = createTestBundle({ bundleIdentifier: "com.example.font-resource-size", route: "/font-resource-size" }, {
      fontResourceLoader: async () => ({ bytes: new Uint8Array(maximumTFXFontResourceBytes + 1), mimeType: "font/ttf" }),
    });
    const runtime = createTestRuntime({ initialBundles: [mismatched, oversized] });
    const mimeMount = mountTestSynWareRuntime(runtime, mismatched.manifest.bundleIdentifier);
    const sizeMount = mountTestSynWareRuntime(runtime, oversized.manifest.bundleIdentifier);
    try {
      await expect(mimeMount.runtime.textLayout.registerFontResource("Resources/Fonts/font.ttf", descriptor())).rejects.toThrow(/MIME/i);
      await expect(sizeMount.runtime.textLayout.registerFontResource("Resources/Fonts/font.ttf", descriptor())).rejects.toThrow(/32 MiB/i);
    } finally { mimeMount.dispose(); sizeMount.dispose(); await runtime.dispose("test"); }
  });

  it("reserves pending registration capacity before awaiting a non-cooperative loader and revokes promptly", async () => {
    const loader = vi.fn(() => new Promise<never>(() => {}));
    const bundle = createTestBundle({ bundleIdentifier: "com.example.font-resource-pending", route: "/font-resource-pending" }, { fontResourceLoader: loader });
    const runtime = createTestRuntime({ initialBundles: [bundle] });
    const mount = mountTestSynWareRuntime(runtime, bundle.manifest.bundleIdentifier);
    const first = mount.runtime.textLayout.registerFontResource("Resources/Fonts/one.ttf", descriptor());
    const second = mount.runtime.textLayout.registerFontResource("Resources/Fonts/two.ttf", descriptor());
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    await expect(mount.runtime.textLayout.registerFontResource("Resources/Fonts/three.ttf", descriptor())).rejects.toMatchObject({ name: "QuotaExceededError" });
    mount.dispose();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(() => mount.runtime.textLayout.registerFontResource("Resources/Fonts/late.ttf", descriptor())).toThrow(/revoked|abort/i);
    await runtime.dispose("test");
  });

  it("rolls back a caller-aborted resource reservation and ignores its late completion", async () => {
    let complete!: (resource: { bytes: Uint8Array; mimeType: "font/ttf" }) => void;
    let defer = true;
    const loader = vi.fn(() => defer
      ? new Promise<{ bytes: Uint8Array; mimeType: "font/ttf" }>((resolve) => { complete = resolve; })
      : Promise.resolve({ bytes: noto(), mimeType: "font/ttf" as const }));
    const bundle = createTestBundle({ bundleIdentifier: "com.example.font-resource-caller-abort", route: "/font-resource-caller-abort" }, { fontResourceLoader: loader });
    const runtime = createTestRuntime({ initialBundles: [bundle] });
    const mount = mountTestSynWareRuntime(runtime, bundle.manifest.bundleIdentifier);
    const caller = new AbortController();
    try {
      const pending = mount.runtime.textLayout.registerFontResource("Resources/Fonts/deferred.ttf", descriptor(), caller.signal);
      await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
      caller.abort(new DOMException("caller cancelled", "AbortError"));
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      complete({ bytes: noto(), mimeType: "font/ttf" });
      await Promise.resolve();
      expect(mount.runtime.textLayout.fontReadinessGeneration).toBe(0);
      defer = false;
      await expect(mount.runtime.textLayout.registerFontResource("Resources/Fonts/deferred.ttf", descriptor())).resolves.toMatchObject({ format: "truetype" });
    } finally { mount.dispose(); await runtime.dispose("test"); }
  });

  it("rejects an oversized declared URL response before reading its stream", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, {
      headers: { "content-length": String(maximumTFXFontResourceBytes + 1) },
    })));
    const loader = createRegisteredFontResourceLoader({
      "Resources/Fonts/font.woff2": { url: "/assets/font.woff2", mimeType: "font/woff2" },
    })!;
    await expect(loader("Resources/Fonts/font.woff2", new AbortController().signal)).rejects.toThrow(/32 MiB/i);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending registered-resource stream when its owner aborts", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream)));
    const loader = createRegisteredFontResourceLoader({
      "Resources/Fonts/font.woff2": { url: "/assets/font.woff2", mimeType: "font/woff2" },
    })!;
    const controller = new AbortController();
    const pending = loader("Resources/Fonts/font.woff2", controller.signal);
    controller.abort(new DOMException("owner retired", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each(["woff", "woff2"] as const)("loads and shapes registered licensed Noto %s through the external host loader", async (format) => {
    const path = `Resources/Fonts/NotoSans.${format}`;
    const url = `/test-assets/NotoSans.${format}`;
    const gallery = createTestBundle({ bundleIdentifier: "com.example.font-fixture" }, { fontResourceLoader: createRegisteredFontResourceLoader({ [path]: { url, mimeType: `font/${format}` } }) });
    expect(gallery?.fontResourceLoader).toBeTypeOf("function");
    const bytes = (await notoFontEncodings())[format];
    const fetch = vi.fn(async () => new Response(bytes.slice().buffer, { headers: { "content-length": String(bytes.byteLength) } }));
    vi.stubGlobal("fetch", fetch);
    const runtime = createTestRuntime({ initialBundles: [gallery!] });
    const mount = mountTestSynWareRuntime(runtime, gallery!.manifest.bundleIdentifier);
    try {
      const registration = await mount.runtime.textLayout.registerFontResource(path, new TFXFontDescriptor({ family: "Noto Sans", size: 18 }));
      expect(registration.format).toBe(format);
      const shaped = registration.font.shape("office");
      expect(shaped.glyphs.length).toBeGreaterThan(0);
      expect(shaped.glyphs.length).toBeLessThan("office".length);
      expect(shaped.glyphs.every(({ id }) => id > 0)).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    } finally { mount.dispose(); await runtime.dispose("test"); }
  }, 30000);
});
