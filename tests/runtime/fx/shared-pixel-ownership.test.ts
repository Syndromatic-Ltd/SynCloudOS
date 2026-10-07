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

import * as GraphicsFX from "../../../src/FX/GraphicsFX/public";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";
import { IFXImageResource, type IFXResourceHandle } from "../../../src/FX/ImageFX/IFXImageResource";

const green = () => new GFXImage({
  width: 1,
  height: 1,
  alpha: "straight",
  colourSpace: "srgb",
  data: new Uint8Array([0, 255, 0, 255]),
});

function readyResource(): IFXResourceHandle {
  return {
    state: "ready",
    revision: 1,
    src: "memory:green",
    intrinsicSize: { width: 1, height: 1 },
    density: 1,
    sourceOrientation: null,
    sourceICCProfile: null,
    accessibleLabel: "Green",
    renderingMode: "original",
    tintColour: null,
    capInsets: null,
    resizingMode: "stretch",
    ready: Promise.resolve(),
    subscribe: () => () => {},
    release: vi.fn(),
  };
}

describe("shared pixel ownership", () => {
  it("exposes one immutable canonical descriptor for GFX image pixels", () => {
    const image = green();

    expect(image.descriptor).toEqual({
      width: 1,
      height: 1,
      bytesPerRow: 4,
      pixelFormat: "rgba8",
      sampleFormat: "unorm8",
      alpha: "straight",
      colourSpace: "srgb",
    });
    expect(Object.isFrozen(image.descriptor)).toBe(true);
  });

  it("issues a still-image pixel lease that can copy or transfer ownership explicitly", async () => {
    const source = green();
    const resource = new IFXImageResource({
      resource: readyResource(),
      readPixels: async () => source,
      export: async () => source.toPNG(),
    });
    const lease = await resource.pixelLease();

    const copy = lease.copyImage();
    expect(copy).not.toBe(source);
    expect(copy.pixel(0, 0).g).toBe(1);
    expect(lease.released).toBe(false);

    const transferred = lease.transferImage();
    expect(transferred).toBe(source);
    expect(lease.released).toBe(true);
    expect(() => lease.copyImage()).toThrow(/released/i);
    expect(() => lease.transferImage()).toThrow(/released/i);

    resource.release();
    expect(transferred.pixel(0, 0).g).toBe(1);
  });

  it("keeps lease issuance private to owning integrations", () => {
    expect("createGFXPixelLease" in GraphicsFX).toBe(false);
  });
});
