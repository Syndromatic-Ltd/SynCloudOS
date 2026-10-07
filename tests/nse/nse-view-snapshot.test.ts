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
import { describe, expect, it, vi } from "vitest";

vi.mock("@zumer/snapdom", () => ({
  snapdom: { toCanvas: vi.fn(async () => ({ toDataURL: () => "data:image/png;base64,AAAA" })) },
}));
const { snapshotNSEView } = await import("../../src/NSE/Graphics/snapshotNSEView");
const { snapdom } = await import("@zumer/snapdom");

describe("snapshotNSEView", () => {
  it("draws a connected view and leaves canvases out", async () => {
    const view = document.createElement("div");
    document.body.append(view);
    await expect(snapshotNSEView(view, { scale: 1 })).resolves.toBe("data:image/png;base64,AAAA");
    const options = vi.mocked(snapdom.toCanvas).mock.calls[0]![1]!;
    expect(options.scale).toBe(1);
    expect(options.filter!(document.createElement("canvas"), {} as never)).toBe(false);
    expect(options.filter!(view, {} as never)).toBe(true);
    view.remove();
  });

  it("refuses a detached view, an aborted request and an absurd scale", async () => {
    await expect(snapshotNSEView(document.createElement("div"))).rejects.toThrow(/in the document/);
    const view = document.body.appendChild(document.createElement("div"));
    const controller = new AbortController(); controller.abort();
    await expect(snapshotNSEView(view, { signal: controller.signal })).rejects.toThrow();
    await expect(snapshotNSEView(view, { scale: 0 })).rejects.toThrow(RangeError);
    await expect(snapshotNSEView(view, { region: { x: 0, y: 0, width: 0, height: 10 } })).rejects.toThrow(RangeError);
    await expect(snapshotNSEView(view, { region: { x: Number.NaN, y: 0, width: 10, height: 10 } })).rejects.toThrow(RangeError);
    view.remove();
  });

  it("cuts the picture to the region asked for, as cacheDisplay(in:) draws only its rect", async () => {
    const view = document.body.appendChild(document.createElement("div"));
    view.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 600, width: 400, height: 600, toJSON: () => ({}) });
    vi.mocked(snapdom.toCanvas).mockResolvedValueOnce({ width: 800, height: 1200, toDataURL: () => "data:image/png;base64,FULL" } as never);
    const drawImage = vi.fn();
    const created = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => tag === "canvas"
      ? Object.assign(created("canvas"), { getContext: () => ({ drawImage }), toDataURL: () => "data:image/png;base64,CROP" }) as never
      : created(tag));
    await expect(snapshotNSEView(view, { scale: 2, region: { x: 0, y: 0, width: 400, height: 250 } })).resolves.toBe("data:image/png;base64,CROP");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 500, 0, 0, 800, 500);
    spy.mockRestore();
    view.remove();
  });
});
