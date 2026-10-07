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
import type { AppImageClient } from "../../../src/SynCloudOS/AppSDK/appEnvironmentClientTypes";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { loadVortexImages } from "../../../src/NSE/Chronosphere/Vortex/loadVortexImages";

const image = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 255, 255, 255]) });
function imagesClient(mode: "ready" | "pending" | "acquire-failure" | "decode-failure" | "abort-after-decode", controller: AbortController) {
  const resources: { release: ReturnType<typeof vi.fn>; transferImage: ReturnType<typeof vi.fn>; releaseLease: ReturnType<typeof vi.fn> }[] = [];
  const load = vi.fn(() => {
    if (mode === "acquire-failure" && resources.length === 2) throw new Error("revoked mount");
    const transferImage = vi.fn(() => image), releaseLease = vi.fn();
    const release = vi.fn();
    const id = resources.length;
    resources.push({ release, transferImage, releaseLease });
    return {
      release,
      async pixelLease(signal: AbortSignal) {
        if (mode === "pending") return new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); });
        if (mode === "decode-failure" && id === 0) throw new Error("decode failed");
        if (mode === "abort-after-decode" && id === 0) controller.abort();
        return { transferImage, release: releaseLease };
      },
    };
  });
  return { client: { load } as unknown as AppImageClient, resources, load };
}

describe("vortex image leases", () => {
  it("transfers all original image pixels and releases every source resource after decoding", async () => {
    const controller = new AbortController(), source = imagesClient("ready", controller);
    const images = await loadVortexImages(source.client, controller.signal);
    expect(Object.keys(images)).toEqual(["starNebula", "galaxySupernova", "coreGlow", "cloudParticle"]);
    expect(Object.values(images).every(value => value === image)).toBe(true);
    for (const resource of source.resources) {
      expect(resource.transferImage).toHaveBeenCalledTimes(1);
      expect(resource.releaseLease).toHaveBeenCalledTimes(1);
      expect(resource.release).toHaveBeenCalledTimes(1);
    }
  });
  it("releases all acquired resources when a later acquisition throws", async () => {
    const controller = new AbortController(), source = imagesClient("acquire-failure", controller);
    await expect(loadVortexImages(source.client, controller.signal)).rejects.toThrow("revoked mount");
    expect(source.resources).toHaveLength(2);
    for (const resource of source.resources) expect(resource.release).toHaveBeenCalledTimes(1);
  });
  it("aborts pending decoding and releases all resources on unmount", async () => {
    const controller = new AbortController(), source = imagesClient("pending", controller);
    const pending = loadVortexImages(source.client, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    for (const resource of source.resources) { expect(resource.release).toHaveBeenCalledTimes(1); expect(resource.transferImage).not.toHaveBeenCalled(); }
  });
  it("releases decoded leases without transfer if ownership is revoked before handoff", async () => {
    const controller = new AbortController(), source = imagesClient("abort-after-decode", controller);
    await expect(loadVortexImages(source.client, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    for (const resource of source.resources) { expect(resource.releaseLease).toHaveBeenCalledTimes(1); expect(resource.transferImage).not.toHaveBeenCalled(); expect(resource.release).toHaveBeenCalledTimes(1); }
  });
  it("releases every source on a decode failure and refuses acquisition after prior abort", async () => {
    const controller = new AbortController(), source = imagesClient("decode-failure", controller);
    await expect(loadVortexImages(source.client, controller.signal)).rejects.toThrow("decode failed");
    for (const resource of source.resources) expect(resource.release).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(loadVortexImages(source.client, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(source.load).toHaveBeenCalledTimes(4);
  });
});
