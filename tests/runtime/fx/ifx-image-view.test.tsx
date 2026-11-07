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

// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import React, { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { IFXImageView, type IFXImageGeometryPort, type IFXImageResource, type IFXImageViewHandle } from "../../../src/FX/ImageFX/public";

function fakeImage(): IFXImageResource {
  return {
    state: "ready",
    src: "/landscape.png",
    revision: 1,
    accessibleLabel: "Landscape",
    intrinsicSize: { width: 200, height: 100 },
    subscribe: () => () => undefined,
  } as unknown as IFXImageResource;
}

const geometry: IFXImageGeometryPort = {
  measure: () => ({ width: 100, height: 100 }),
  observe: () => () => undefined,
};

describe("IFXImageView", () => {
  it("fits the image and draws no controls of its own", () => {
    const view = render(<IFXImageView image={fakeImage()} geometry={geometry} />);
    const image = view.container.querySelector(".ifx-image-view-image") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("/landscape.png");
    expect(image.alt).toBe("Landscape");
    expect(image.style.width).toBe("100px");
    expect(image.style.height).toBe("50px");
    expect(view.container.querySelector("button")).toBeNull();
    expect(view.container.querySelector(".ifx-image-view-crop-frame")).toBeNull();
  });

  it("zooms through its handle like IKImageView", () => {
    const ref = createRef<IFXImageViewHandle>();
    const onZoomChange = vi.fn();
    render(<IFXImageView ref={ref} image={fakeImage()} geometry={geometry} onZoomChange={onZoomChange} />);
    expect(ref.current?.zoomFactor).toBeCloseTo(0.5);
    act(() => ref.current?.zoomIn());
    expect(ref.current?.zoomFactor).toBeGreaterThan(0.5);
    expect(onZoomChange).toHaveBeenCalled();
    act(() => ref.current?.zoomImageToFit());
    expect(ref.current?.zoomFactor).toBeCloseTo(0.5);
  });

  it("frames and crops the visible region in source pixels only in the crop tool", () => {
    const ref = createRef<IFXImageViewHandle>();
    const view = render(<IFXImageView ref={ref} image={fakeImage()} geometry={geometry} currentToolMode="crop" />);
    expect(view.container.querySelector(".ifx-image-view-crop-frame")).not.toBeNull();
    expect(ref.current?.crop()).toEqual({ x: 0, y: 0, width: 200, height: 100, imageWidth: 200, imageHeight: 100, zoomFactor: 0.5 });
    act(() => ref.current?.zoomIn());
    const zoomed = ref.current?.crop();
    expect(zoomed?.width).toBeLessThan(200);
    view.rerender(<IFXImageView ref={ref} image={fakeImage()} geometry={geometry} currentToolMode="move" />);
    expect(ref.current?.crop()).toBeNull();
  });

  it("rejects a tool mode ImageFX does not support", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(<IFXImageView image={fakeImage()} geometry={geometry} currentToolMode={"rotate" as never} />)).toThrow(/tool mode/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
