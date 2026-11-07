// @vitest-environment jsdom
/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEOpenPanelItemImage } from "../../../src/NSE/FilePanels/NSEOpenPanelItemImage";
import { NSEData } from "../../../src/Foundation/NSEData";

afterEach(cleanup);
it("keeps generic artwork until real file bytes decode, then releases the cell's image lease", async () => {
  let decoded!: () => void;
  const resource = { state: "loading", src: "blob:decoded-picture", revision: 0, intrinsicSize: { width: 320, height: 200 },
    ready: new Promise<void>(resolve => { decoded = resolve; }), release: vi.fn(), subscribe: () => () => {} };
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const file = { type: "image/png", arrayBuffer: async () => bytes.buffer };
  const load = vi.fn(() => resource);
  const images = { load } as any;
  const item = { id: "photo", name: "Photo without an extension", kind: "file", handle: { kind: "file", getFile: async () => file } } as any;
  const view = render(<NSEOpenPanelItemImage item={item} images={images} />);
  await waitFor(() => expect(load).toHaveBeenCalledOnce());
  expect(load.mock.calls[0]?.[0]).toMatchObject({ source: { kind: "bytes", mimeType: "image/png", bytes: expect.any(NSEData) } });
  expect(view.container.querySelector('img')?.getAttribute("src")).toContain("document-generic");
  await act(async () => { resource.state = "ready"; decoded(); });
  expect(view.container.querySelector('img')?.getAttribute("src")).toBe("blob:decoded-picture");
  view.unmount(); expect(resource.release).toHaveBeenCalledOnce();
});
it("does not start decoding when a file read finishes after its cell unmounts", async () => {
  let read!: (file: any) => void;
  const load = vi.fn();
  const item = { id: "late", name: "late.png", kind: "file", handle: { kind: "file", getFile: () => new Promise(resolve => { read = resolve; }) } } as any;
  const view = render(<NSEOpenPanelItemImage item={item} images={{ load } as any} />);
  view.unmount();
  await act(async () => { read({ type: "image/png", arrayBuffer: async () => new ArrayBuffer(4) }); });
  expect(load).not.toHaveBeenCalled();
});
it.each(["url", "file-reference"])("decodes an image provider's %s when it has no separate thumbnail", async kind => {
  const resource = { state: "loading", ready: new Promise<void>(() => {}), release: vi.fn() };
  const load = vi.fn((_request: unknown) => resource);
  const data = NSEData.from(new Uint8Array([137, 80, 78, 71]));
  const item = { id: "provider:one", name: "Coast", kind: "media", media: { kind: "image", mimeType: "image/png",
    ...(kind === "url" ? { source: "/coast.png" } : { fileReference: { read: async () => data } }),
  } } as any;
  const view = render(<NSEOpenPanelItemImage item={item} images={{ load } as any} />);
  await waitFor(() => expect(load).toHaveBeenCalledOnce());
  expect(load.mock.calls[0]?.[0]).toMatchObject({ source: kind === "url" ? { kind: "url", url: "/coast.png" } : { kind: "bytes", mimeType: "image/png", bytes: data } });
  view.unmount(); expect(resource.release).toHaveBeenCalledOnce();
});
