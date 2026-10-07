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
import React, { useMemo } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOverlayProvider } from "../../src/NSE/Overlays";
import { NSEMediaPanel, mediaCollectionItemId } from "../../src/NSE/NSE";
import { createMediaPanelService, MediaPanelProviderError, type MediaPanelProvider } from "../../src/SynCloudOS/SynCloudOS";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { DocumentMediaFixture } from "../fixtures/media-panels/DocumentMediaFixture";

afterEach(() => document.body.replaceChildren());

const workArea = Object.freeze({ width: 1200, height: 800, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const presentation = createStaticPresentationPort({ width: 1200, height: 800 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:media-panel-tests",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

function stockProvider(query: MediaPanelProvider["query"]): MediaPanelProvider {
  return { id: "stock", label: "Stock library", query };
}

describe("NSEMediaPanel", () => {
  it("lets a Document-shaped public fixture select an image and insert its existing editor representation", async () => {
    const service = createMediaPanelService([stockProvider(async () => ({
      items: [{ id: "cover", providerId: "stock", kind: "image", name: "cover.png", mimeType: "image/png", source: "https://assets.test/cover.png" }],
      nextCursor: null,
    }))]);
    const bridge = { open: vi.fn(), close: vi.fn() };
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={bridge} /></OverlayHarness>);

    const trigger = screen.getByRole("button", { name: "Insert image" });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Insert media" })).toBeTruthy();
    const cover = await screen.findByRole("gridcell", { name: /cover\.png/i });
    expect(cover.closest("[data-nse-media-presenter]")?.getAttribute("data-nse-media-presenter")).toBe("collection-view");
    fireEvent.click(cover);
    fireEvent.click(screen.getByRole("button", { name: "Insert selected" }));
    await waitFor(() => expect(screen.getByLabelText("Inserted media").textContent).toContain('"source":"https://assets.test/cover.png"'));
    expect(screen.getByLabelText("Inserted media").textContent).toContain('"mimeType":"image/png"');
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps cancel, denied, and provider-error outcomes outside the insertion seam", async () => {
    const bridge = { open: vi.fn(), close: vi.fn() };
    const denied = createMediaPanelService([stockProvider(async () => { throw new MediaPanelProviderError("denied", "permission denied"); })]);
    const rendered = render(<OverlayHarness><DocumentMediaFixture service={denied} windowBridge={bridge} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect(await screen.findByText("Media access was denied by the provider.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Inserted media").textContent).toContain("No media inserted");

    rendered.unmount();
    const broken = createMediaPanelService([stockProvider(async () => { throw new Error("provider failure"); })]);
    render(<OverlayHarness><DocumentMediaFixture service={broken} windowBridge={bridge} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect(await screen.findByText("The media provider could not complete the request.")).toBeTruthy();
    expect(screen.getByLabelText("Inserted media").textContent).toContain("No media inserted");
  });

  it("supports keyboard grid navigation, preview metadata, and compact sheet presentation", async () => {
    const service = createMediaPanelService([stockProvider(async () => ({
      items: [
        { id: "first", providerId: "stock", kind: "image", name: "first.png", mimeType: "image/png", source: "https://assets.test/first.png" },
        { id: "second", providerId: "stock", kind: "image", name: "second.png", mimeType: "image/png", source: "https://assets.test/second.png" },
      ], nextCursor: null,
    }))]);
    const bridge = { open: vi.fn(), close: vi.fn() };
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={bridge} compact /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect((await screen.findByRole("dialog", { name: "Insert media" })).getAttribute("data-nse-presentation")).toBe("sheet");
    const grid = (await screen.findByRole("gridcell", { name: /first\.png/i })).closest('[role="grid"]')!;
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(document.getElementById(grid.getAttribute("aria-activedescendant")!)?.textContent).toMatch(/second\.png/i);
    fireEvent.keyDown(grid, { key: " " });
    expect(screen.getByLabelText("Media preview").textContent).toContain("second.png");
  });

  it("keeps provider-scoped selections while pagination appends and de-duplicates results", async () => {
    expect(mediaCollectionItemId({ id: "shared", providerId: "provider-a", kind: "image", name: "a.png", mimeType: "image/png" }))
      .not.toBe(mediaCollectionItemId({ id: "shared", providerId: "provider-b", kind: "image", name: "b.png", mimeType: "image/png" }));
    expect(mediaCollectionItemId({ id: "c", providerId: "a\0b", kind: "image", name: "first.png", mimeType: "image/png" }))
      .not.toBe(mediaCollectionItemId({ id: "b\0c", providerId: "a", kind: "image", name: "second.png", mimeType: "image/png" }));
    const service = createMediaPanelService([stockProvider(async (request) => request.cursor === null ? {
      items: [
        { id: "shared", providerId: "stock", kind: "image", name: "a.png", mimeType: "image/png", source: "https://assets.test/a.png" },
        { id: "other", providerId: "stock", kind: "image", name: "b.png", mimeType: "image/png", source: "https://assets.test/b.png" },
      ],
      nextCursor: "next",
    } : {
      items: [
        { id: "shared", providerId: "stock", kind: "image", name: "a.png", mimeType: "image/png", source: "https://assets.test/a.png" },
        { id: "second", providerId: "stock", kind: "image", name: "c.png", mimeType: "image/png", source: "https://assets.test/c.png" },
      ],
      nextCursor: null,
    })]);
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={{ open: vi.fn(), close: vi.fn() }} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    const first = await screen.findByRole("gridcell", { name: /a\.png/i });
    const sameLocalId = await screen.findByRole("gridcell", { name: /b\.png/i });
    fireEvent.click(first);
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(sameLocalId.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    const appended = await screen.findByRole("gridcell", { name: /c\.png/i });
    expect(screen.getAllByRole("gridcell")).toHaveLength(3);
    expect(screen.getByRole("gridcell", { name: /a\.png/i }).getAttribute("aria-selected")).toBe("true");
    fireEvent.doubleClick(appended);
    expect(screen.getByLabelText("Media preview").textContent).toContain("c.png");
  });

  it("replaces a search generation without reopening the window panel bridge", async () => {
    const provider = stockProvider(vi.fn(async (request) => ({
      items: [{ id: request.search || "initial", providerId: "stock", kind: "image", name: `${request.search || "initial"}.png`, mimeType: "image/png", source: "https://assets.test/image.png" }],
      nextCursor: null,
    })));
    const service = createMediaPanelService([provider]);
    const bridge = { open: vi.fn(), close: vi.fn() };
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={bridge} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    await screen.findByRole("gridcell", { name: /initial\.png/i });
    expect(bridge.open).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "orchid" } });
    await screen.findByRole("gridcell", { name: /orchid\.png/i });
    expect(bridge.open).toHaveBeenCalledTimes(1);
    expect(bridge.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bridge.close).toHaveBeenCalledTimes(1);
  });

  it("filters a stale selected ID before replacing search results", async () => {
    const service = createMediaPanelService([stockProvider(async (request) => ({ items: [{ id: request.search ? "replacement" : "initial", providerId: "stock", kind: "image", name: `${request.search || "initial"}.png`, mimeType: "image/png" }], nextCursor: null }))]);
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={{ open: vi.fn(), close: vi.fn() }} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    fireEvent.click(await screen.findByRole("gridcell", { name: /initial\.png/i }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "orchid" } });
    expect((await screen.findByRole("gridcell", { name: /orchid\.png/i })).getAttribute("aria-selected")).toBe("false");
  });

  it("does not let a user-activation-gated provider open in background panel work", async () => {
    const query = vi.fn(async () => ({
      items: [{ id: "local", providerId: "stock", kind: "image" as const, name: "local.png", mimeType: "image/png", source: "https://assets.test/local.png" }],
      nextCursor: null,
    }));
    const service = createMediaPanelService([{ id: "stock", label: "Local files", requiresUserActivation: true, query }]);
    const bridge = { open: vi.fn(), close: vi.fn() };
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={bridge} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect(await screen.findByRole("button", { name: "Choose files" })).toBeTruthy();
    expect(query).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Choose files" }));
    await screen.findByRole("gridcell", { name: /local\.png/i });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ userInitiated: true }), expect.any(AbortSignal));
  });

  it("keeps canonical media state open when cancel dismissal is refused", async () => {
    const service = createMediaPanelService([stockProvider(async () => ({ items: [], nextCursor: null }))]);
    let hostedContent: React.ReactNode = null;
    const bridge = {
      present: vi.fn(async (_request: unknown, content: React.ReactNode) => { hostedContent = content; return "window:media"; }),
      dismiss: vi.fn(async () => ({ outcome: "refused" as const })),
      reportError: vi.fn(),
    };
    render(<OverlayHarness><DocumentMediaFixture service={service} windowBridge={bridge} /></OverlayHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    await waitFor(() => expect(bridge.present).toHaveBeenCalled());
    render(<>{hostedContent}</>);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(bridge.dismiss).toHaveBeenCalledWith("example-document-media"));
    await waitFor(() => expect(bridge.present.mock.calls.length).toBeGreaterThan(1));
  });

  it("reports a rejected canonical close and restores controlled media-panel source truth", async () => {
    const failure = new Error("media close failed");
    const service = createMediaPanelService([stockProvider(async () => ({ items: [], nextCursor: null }))]);
    const bridge = {
      present: vi.fn(async () => "window:media"),
      dismiss: vi.fn(async () => { throw failure; }),
      reportError: vi.fn(),
    };
    function Fixture() {
      const [open, setOpen] = React.useState(true);
      return <OverlayHarness>
        <button type="button" onClick={() => setOpen(false)}>Reject media close</button>
        <output aria-label="media source">{open ? "open" : "closed"}</output>
        <NSEMediaPanel
          id="rejected-media"
          open={open}
          anchor={null}
          parentResponderId="window:example-document"
          parentWindowControllerId="window:example-document"
          service={service}
          windowBridge={bridge}
          query={{ id: "rejected-media", providerId: "stock", search: "", kinds: ["image"], cursor: null }}
          onOpenChange={setOpen}
        />
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Reject media close" }));

    await waitFor(() => expect(screen.getByLabelText("media source").textContent).toBe("open"));
    expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "rejected-media", operation: "dismiss" });
  });
});
