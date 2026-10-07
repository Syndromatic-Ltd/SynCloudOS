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
import { describe, expect, it, vi } from "vitest";
import { TFXFontDescriptor, TFXTextContainer } from "../../../src/FX/TextFX/public";
import { createRuntimeCacheRegistry } from "../../../src/SynCloudOS/Cache";
import { createTFXFontHost } from "../../../src/SynCloudOS/TextFX/TFXFontHost";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "../helpers";
import { NSELayoutManager } from "../../../src/NSE/TextLayout/NSELayoutManager";
import { createSynWareNSETextLayoutPort } from "../../../src/SynCloudOS/AppSDK/SynWareNSEMediaAdapters";

function setup(adapter?: Parameters<typeof createTFXFontHost>[0]["adapter"]) {
  const owner = new AbortController();
  const caches = createRuntimeCacheRegistry({ runtimeId: "runtime:tfx-fonts", now: () => 0 });
  const host = createTFXFontHost({ runtimeId: "runtime:tfx-fonts", signal: owner.signal, caches, adapter });
  return { owner, caches, host };
}

describe("TextFX scoped binary-font host", () => {
  it("registers a real TTF and gives duplicate registrations independent font lifetimes", async () => {
    const { host, caches } = setup();
    const scope = host.createScope(new AbortController().signal);
    const descriptor = new TFXFontDescriptor({ family: "Noto Host", size: 18 });
    const first = await scope.registerFont(noto(), descriptor);
    const second = await scope.registerFont(noto(), descriptor);

    expect(first.font.shape("office").glyphs.length).toBeLessThan("office".length);
    expect(caches.get("textfx.font.bytes")?.stats()).toMatchObject({ entries: 1, hits: 1, misses: 1 });
    first.dispose();
    expect(() => first.font.shape("A")).toThrow(/disposed/i);
    expect(second.font.shape("A").glyphs).toHaveLength(1);
    caches.prune({ reason: "memory-warning", targetWeight: 0 });
    expect(caches.get("textfx.font.bytes")?.stats()).toMatchObject({ entries: 0 });
    expect(second.font.shape("B").glyphs).toHaveLength(1);

    scope.dispose();
    expect(() => second.font.shape("A")).toThrow(/disposed/i);
    host.dispose();
  });

  it("keeps readiness generations and notifications isolated per scope", async () => {
    const { host } = setup();
    const first = host.createScope(new AbortController().signal);
    const second = host.createScope(new AbortController().signal);
    const firstChanges = vi.fn();
    const secondChanges = vi.fn();
    first.subscribeFontReadiness(firstChanges);
    second.subscribeFontReadiness(secondChanges);

    const registration = await first.registerFont(noto(), new TFXFontDescriptor({ size: 16 }));
    expect(first.fontReadinessGeneration).toBe(1);
    expect(second.fontReadinessGeneration).toBe(0);
    expect(firstChanges).toHaveBeenLastCalledWith(expect.objectContaining({ state: "ready", generation: 1, registrationId: registration.id }));
    expect(secondChanges).not.toHaveBeenCalled();

    registration.dispose();
    expect(first.fontReadinessGeneration).toBe(2);
    expect(firstChanges).toHaveBeenLastCalledWith(expect.objectContaining({ state: "released", generation: 2 }));
    host.dispose();
  });

  it("contains readiness-listener failures and rejects a reentrant stale completion", async () => {
    const { host } = setup();
    const live = host.createScope(new AbortController().signal);
    const observed = vi.fn();
    live.subscribeFontReadiness(() => { throw new Error("listener failed"); });
    live.subscribeFontReadiness(observed);
    await expect(live.registerFont(noto(), new TFXFontDescriptor({ size: 16 }))).resolves.toMatchObject({ font: expect.any(Object) });
    expect(observed).toHaveBeenCalledTimes(1);

    const reentrant = host.createScope(new AbortController().signal);
    reentrant.subscribeFontReadiness((change) => {
      if (change.state === "ready") reentrant.dispose();
    });
    await expect(reentrant.registerFont(noto(), new TFXFontDescriptor({ size: 16 }))).rejects.toMatchObject({ name: "AbortError" });
    host.dispose();
  });

  it("releases a scope on owner abort and rejects caller-aborted registration", async () => {
    const { host } = setup();
    const owner = new AbortController();
    const scope = host.createScope(owner.signal);
    const registration = await scope.registerFont(noto(), new TFXFontDescriptor({ size: 16 }));
    owner.abort(new DOMException("mount retired", "AbortError"));
    expect(() => registration.font.shape("A")).toThrow(/disposed/i);

    const live = host.createScope(new AbortController().signal);
    const caller = new AbortController();
    caller.abort(new DOMException("caller retired", "AbortError"));
    await expect(live.registerFont(noto(), new TFXFontDescriptor({ size: 16 }), caller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(live.fontReadinessGeneration).toBe(0);
    host.dispose();
  });

  it("rejects malformed WOFF before decoding", async () => {
    const { host } = setup();
    const scope = host.createScope(new AbortController().signal);
    const woff = new Uint8Array(16);
    woff.set([0x77, 0x4f, 0x46, 0x46]);
    await expect(scope.registerFont(woff, new TFXFontDescriptor({ size: 16 }))).rejects.toThrow(/WOFF header/i);
    host.dispose();
  });

  it("rejects an oversized WOFF2 declaration before starting the decoder", async () => {
    const { host } = setup();
    const scope = host.createScope(new AbortController().signal);
    const woff2 = new Uint8Array(48);
    const header = new DataView(woff2.buffer);
    header.setUint32(0, 0x774f4632, false);
    header.setUint32(8, woff2.byteLength, false);
    header.setUint32(16, 30 * 1024 * 1024 + 1, false);
    await expect(scope.registerFont(woff2, new TFXFontDescriptor({ size: 16 }))).rejects.toThrow(/30 MiB/i);
    host.dispose();
  });

  it("decodes licensed Noto WOFF and WOFF2 bytes with the same real shaping as TTF", async () => {
    const { host } = setup();
    const scope = host.createScope(new AbortController().signal);
    try {
      const bytes = await notoFontEncodings();
      expect(new DataView(bytes.woff.buffer).getUint32(0)).toBe(0x774f4646);
      expect(new DataView(bytes.woff2.buffer).getUint32(0)).toBe(0x774f4632);
      expect(bytes.woff.byteLength).toBeLessThan(bytes.ttf.byteLength);
      expect(bytes.woff2.byteLength).toBeLessThan(bytes.woff.byteLength);
      const descriptor = new TFXFontDescriptor({ family: "Noto Sans", size: 18 });
      const ttf = await scope.registerFont(bytes.ttf, descriptor);
      const woff = await scope.registerFont(bytes.woff, descriptor);
      const woff2 = await scope.registerFont(bytes.woff2, descriptor);
      expect([ttf.format, woff.format, woff2.format]).toEqual(["truetype", "woff", "woff2"]);
      const shaped = ttf.font.shape("office");
      expect(shaped.glyphs.length).toBeGreaterThan(0);
      expect(shaped.glyphs.length).toBeLessThan("office".length);
      expect(shaped.glyphs.every(({ id }) => id > 0)).toBe(true);
      expect(woff.font.shape("office")).toEqual(shaped);
      expect(woff2.font.shape("office")).toEqual(shaped);
      expect([woff.font.unitsPerEm, woff2.font.unitsPerEm]).toEqual([ttf.font.unitsPerEm, ttf.font.unitsPerEm]);
    } finally { host.dispose(); }
  }, 30000);

  it("issues runtime-unique ids and keeps direct font disposal coherent with registration readiness", async () => {
    const platformRelease = vi.fn();
    const { host } = setup({ registerFontFace: async ({ familyName }) => ({ familyName, release: platformRelease }) });
    const first = host.createScope(new AbortController().signal);
    const second = host.createScope(new AbortController().signal);
    const changes = vi.fn();
    first.subscribeFontReadiness(changes);
    const one = await first.registerFont(noto(), new TFXFontDescriptor({ size: 16 }));
    const two = await second.registerFont(noto(), new TFXFontDescriptor({ size: 16 }));
    expect(one.id).not.toBe(two.id);
    one.font.dispose();
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ registrationId: one.id, state: "released" }));
    expect(platformRelease).toHaveBeenCalledTimes(1);
    expect(one.dispose()).toBe(false);
    host.dispose();
  });

  it("bounds pending and live registrations inside each scope", async () => {
    const completions: Array<() => void> = [];
    let defer = true;
    const { host } = setup({
      registerFontFace: ({ familyName }) => defer
        ? new Promise((resolve) => completions.push(() => resolve({ familyName, release: () => {} })))
        : Promise.resolve({ familyName, release: () => {} }),
    });
    const pendingScope = host.createScope(new AbortController().signal);
    const descriptor = new TFXFontDescriptor({ size: 16 });
    const first = pendingScope.registerFont(noto(), descriptor);
    const second = pendingScope.registerFont(noto(), descriptor);
    await vi.waitFor(() => expect(completions).toHaveLength(2));
    await expect(pendingScope.registerFont(noto(), descriptor)).rejects.toMatchObject({ name: "QuotaExceededError" });
    completions.splice(0).forEach((complete) => complete());
    const pendingRegistrations = await Promise.all([first, second]);
    pendingRegistrations.forEach((registration) => registration.dispose());
    defer = false;

    const liveScope = host.createScope(new AbortController().signal);
    const registrations = [];
    for (let index = 0; index < 8; index += 1) registrations.push(await liveScope.registerFont(noto(), descriptor));
    await expect(liveScope.registerFont(noto(), descriptor)).rejects.toMatchObject({ name: "QuotaExceededError" });
    registrations.forEach((registration) => registration.dispose());
    host.dispose();
  });

  it("bounds runtime-wide pending work and rolls reservations back after cancellation", async () => {
    const completions: Array<(release: () => void) => void> = [];
    const platformRelease = vi.fn();
    const { host } = setup({
      registerFontFace: ({ familyName }) => new Promise((resolve) => completions.push((release) => resolve({ familyName, release }))),
    });
    const scopes = Array.from({ length: 5 }, () => host.createScope(new AbortController().signal));
    const descriptor = new TFXFontDescriptor({ size: 16 });
    const pending = scopes.slice(0, 4).flatMap((scope) => [scope.registerFont(noto(), descriptor), scope.registerFont(noto(), descriptor)]);
    await vi.waitFor(() => expect(completions).toHaveLength(8));
    await expect(scopes[4]!.registerFont(noto(), descriptor)).rejects.toMatchObject({ name: "QuotaExceededError" });

    scopes.slice(0, 4).forEach((scope) => scope.dispose());
    completions.splice(0).forEach((complete) => complete(platformRelease));
    const outcomes = await Promise.allSettled(pending);
    expect(outcomes.every((outcome) => outcome.status === "rejected" && outcome.reason?.name === "AbortError")).toBe(true);
    expect(platformRelease).toHaveBeenCalledTimes(8);

    const finalCompletion = new Promise<void>((resolve) => {
      void scopes[4]!.registerFont(noto(), descriptor).then((registration) => {
        registration.dispose();
        resolve();
      });
    });
    await vi.waitFor(() => expect(completions).toHaveLength(1));
    completions.pop()!(platformRelease);
    await finalCompletion;
    host.dispose();
  });

  it("bounds runtime-wide live registrations and reopens capacity on release", async () => {
    const { host } = setup();
    const scopes = Array.from({ length: 5 }, () => host.createScope(new AbortController().signal));
    const descriptor = new TFXFontDescriptor({ size: 16 });
    const registrations = [];
    for (const scope of scopes.slice(0, 4)) {
      for (let index = 0; index < 8; index += 1) registrations.push(await scope.registerFont(noto(), descriptor));
    }
    await expect(scopes[4]!.registerFont(noto(), descriptor)).rejects.toMatchObject({ name: "QuotaExceededError" });
    registrations.pop()!.dispose();
    await expect(scopes[4]!.registerFont(noto(), descriptor)).resolves.toMatchObject({ font: expect.any(Object) });
    host.dispose();
  });

  it("projects registration through isolated mounted text-layout clients and revokes with the mount", async () => {
    const runtime = createTestRuntime({ id: "runtime:tfx-mounted" });
    const app = registerTestSynWare(runtime, { schemaVersion: 1, id: "tfx-consumer", version: "1.0.0", title: "TFX consumer" });
    const first = mountTestSynWareRuntime(runtime, app.id);
    const second = mountTestSynWareRuntime(runtime, app.id, `application:${app.id}:second`);
    const firstChanges = vi.fn();
    const secondChanges = vi.fn();
    first.runtime.textLayout.subscribeFontReadiness(firstChanges);
    second.runtime.textLayout.subscribeFontReadiness(secondChanges);
    try {
      const descriptor = new TFXFontDescriptor({ family: "Mounted Noto", size: 18 });
      const firstFont = await first.runtime.textLayout.registerFont(noto(), descriptor);
      const secondFont = await second.runtime.textLayout.registerFont(noto(), descriptor);
      expect(firstChanges).toHaveBeenCalledTimes(1);
      expect(secondChanges).toHaveBeenCalledTimes(1);
      first.dispose();
      expect(() => firstFont.font.shape("A")).toThrow(/disposed/i);
      expect(secondFont.font.shape("A").glyphs).toHaveLength(1);
    } finally {
      first.dispose();
      second.dispose();
      await runtime.dispose("test");
    }
  });

  it("invalidates an NSE layout when its scoped font readiness changes", async () => {
    const runtime = createTestRuntime({ id: "runtime:tfx-invalidation" });
    const app = registerTestSynWare(runtime, { schemaVersion: 1, id: "tfx-layout", version: "1.0.0", title: "TFX layout" });
    const mount = mountTestSynWareRuntime(runtime, app.id);
    const scoped = createSynWareNSETextLayoutPort(mount.runtime.textLayout);
    const manager = new NSELayoutManager({ service: {
      subscribeFontReadiness: scoped.subscribeFontReadiness.bind(scoped),
      segment: () => Object.freeze([]),
      layout: async (input) => Object.freeze({
        fragments: Object.freeze([]),
        laidOutRange: Object.freeze({ location: 0, length: input.text.length }),
        truncated: false,
      }),
    } });
    try {
      const text = "font readiness relayout";
      await manager.layout({
        text,
        font: { families: ["sans-serif"], size: 16, weight: 400, style: "normal", stretch: "normal" },
        locale: "en-GB",
        direction: "ltr",
      }, [new TFXTextContainer({ size: { width: 400, height: 40 } })]);
      expect(manager.invalidations).toEqual([]);

      await mount.runtime.textLayout.registerFont(noto(), new TFXFontDescriptor({ size: 16 }));
      expect(manager.invalidations).toEqual([
        { kind: "graphemes", range: { location: 0, length: text.length } },
        { kind: "layout", fromCharacter: 0 },
      ]);
    } finally {
      manager.dispose();
      mount.dispose();
      await runtime.dispose("test");
    }
  });
});
