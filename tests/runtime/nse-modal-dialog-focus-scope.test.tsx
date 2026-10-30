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

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEModalDialog } from "../../src/NSE/Containers";
import { NSEFocusPortProvider } from "../../src/NSE/Focus";
import { SynCloudOSProvider, useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";
import { NSEWindowSurfaceBridgeProvider, type NSEWindowSurfaceRequest } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { createTransientWindowSurfaceBridge, WindowContentRendererRegistry, WindowLayer } from "../../src/Webspring/WindowLayer";
import { NSEActionSheet, NSEOverlayProvider, NSEPopup } from "../../src/NSE/Overlays";

afterEach(cleanup);

function RuntimeModal() {
  const port = useRuntimeNSEFocusPort("runtime");
  return (
    <NSEFocusPortProvider port={port}>
      <NSEModalDialog open title="Runtime modal">Modal body</NSEModalDialog>
    </NSEFocusPortProvider>
  );
}

function OverlayHarness({ children }: { children: React.ReactNode }) {
  const port = useRuntimeNSEOverlayPort("workspace");
  return <NSEOverlayProvider runtimePort={port} defaultParentResponderId="workspace">{children}</NSEOverlayProvider>;
}

describe("NSEModalDialog focus ownership", () => {
  it.each(["string", "rich"] as const)("presents one named physical dialog with a %s title", async kind => {
    const runtime = createTestRuntime();
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:dialog-semantics", owner: { workspaceId: "workspace:default", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const view = render(<SynCloudOSProvider runtime={runtime}>
      <NSEWindowSurfaceBridgeProvider bridge={bridge}>
        <NSEModalDialog open title={kind === "string" ? "Sample settings" : <span>Sample settings</span>} interaction={{ id: "settings", parentResponderId: "runtime" }}>Hosted settings content</NSEModalDialog>
      </NSEWindowSurfaceBridgeProvider>
      <WindowLayer contentRegistry={renderers} />
    </SynCloudOSProvider>);
    try {
      await screen.findByText("Hosted settings content");
      await waitFor(() => expect(screen.getAllByRole("dialog", { name: "Sample settings" })).toHaveLength(1));
    } finally { view.unmount(); bridge.dispose(); await runtime.dispose("test"); }
  });

  it("names the overlay owner from the existing dialog heading without drawing that heading twice", async () => {
    const runtime = createTestRuntime();
    const view = render(<SynCloudOSProvider runtime={runtime}><OverlayHarness>
      <NSEModalDialog open title={<span>Sample settings</span>} interaction={{ id: "settings", parentResponderId: "workspace" }}>Overlay settings content</NSEModalDialog>
    </OverlayHarness></SynCloudOSProvider>);
    try {
      await screen.findByRole("dialog", { name: "Sample settings" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getAllByText("Sample settings")).toHaveLength(1);
    } finally { view.unmount(); await runtime.dispose("test"); }
  });

  it("uses a popup's own rendered title as its default accessible name", async () => {
    const runtime = createTestRuntime();
    const view = render(<SynCloudOSProvider runtime={runtime}><OverlayHarness>
      <NSEPopup open modal title={<span>Popup title</span>} parentResponderId="workspace">Popup content</NSEPopup>
    </OverlayHarness></SynCloudOSProvider>);
    try { await screen.findByRole("dialog", { name: "Popup title" }); }
    finally { view.unmount(); await runtime.dispose("test"); }
  });

  it.each(["string", "rich"] as const)("keeps a nested direct sheet's own %s title", async kind => {
    function NestedSheets() {
      const [open, setOpen] = React.useState(false);
      return <NSEModalDialog open title="Outer settings" interaction={{ id: "outer-settings", parentResponderId: "workspace" }}>
        <button onClick={() => setOpen(true)}>Open nested sheet</button>
        <NSEActionSheet open={open} id="inner-settings" parentId="outer-settings" parentResponderId="workspace" title={kind === "rich" ? <span>Inner settings</span> : "Inner settings"}>Nested sheet body</NSEActionSheet>
      </NSEModalDialog>;
    }
    const runtime = createTestRuntime();
    const view = render(<SynCloudOSProvider runtime={runtime}><OverlayHarness><NestedSheets /></OverlayHarness></SynCloudOSProvider>);
    try {
      await screen.findByRole("dialog", { name: "Outer settings" });
      await act(async () => { screen.getByRole("button", { name: "Open nested sheet" }).click(); });
      await screen.findByRole("dialog", { name: "Inner settings" });
      expect(screen.getAllByText("Inner settings")).toHaveLength(1);
    } finally { view.unmount(); await runtime.dispose("test"); }
  });

  it("follows a stateful rich title rendered once by the physical action sheet", async () => {
    let rename!: (name: string) => void;
    const mounts = vi.fn(), unmounts = vi.fn();
    function Title() {
      const [name, setName] = React.useState("Initial settings");
      rename = setName;
      React.useEffect(() => { mounts(); return () => { unmounts(); }; }, []);
      return <span>{name}</span>;
    }
    const runtime = createTestRuntime();
    const renderers = new WindowContentRendererRegistry();
    const bridge = createTransientWindowSurfaceBridge({ runtime, renderers, physicalHostId: "test:rich-title", owner: { workspaceId: "workspace:default", applicationId: "com.example.gallery", applicationSessionId: "com.example.gallery" } });
    const view = render(<SynCloudOSProvider runtime={runtime}>
      <NSEWindowSurfaceBridgeProvider bridge={bridge}>
        <NSEActionSheet open title={<Title />} id="rich-title" parentResponderId="runtime">Action sheet content</NSEActionSheet>
      </NSEWindowSurfaceBridgeProvider><WindowLayer contentRegistry={renderers} />
    </SynCloudOSProvider>);
    try {
      await screen.findByRole("dialog", { name: "Initial settings" });
      await act(async () => { rename("Updated settings"); });
      await screen.findByRole("dialog", { name: "Updated settings" });
      expect(mounts).toHaveBeenCalledTimes(1);
    } finally { view.unmount(); bridge.dispose(); await runtime.dispose("test"); }
    expect(unmounts).toHaveBeenCalledTimes(1);
  });

  it("forwards the declared dialog title to its physical window host", async () => {
    const present = vi.fn(async (_request: NSEWindowSurfaceRequest) => "physical-window");
    const dismiss = vi.fn(async () => ({ outcome: "closed" as const }));
    render(<NSEWindowSurfaceBridgeProvider bridge={{ present, dismiss }}>
      <NSEModalDialog open title="Sample settings" variant="panel" interaction={{ id: "private:settings:request", parentResponderId: "application:gallery" }}>Settings</NSEModalDialog>
    </NSEWindowSurfaceBridgeProvider>);
    await waitFor(() => expect(present).toHaveBeenCalled());
    expect(present.mock.calls.at(-1)?.[0]).toMatchObject({ title: "Sample settings" });
  });

  it("retains runtime logical authority when its shell is portalled", () => {
    const runtime = createTestRuntime();
    render(<SynCloudOSProvider runtime={runtime}><RuntimeModal /></SynCloudOSProvider>);
    const dialog = screen.getByRole("dialog", { name: "Runtime modal" });
    const scope = dialog.closest<HTMLElement>("[data-syncloudos-focus-scope]");
    expect(scope?.dataset.syncloudosFocusScope).toMatch(/^nse-modal-dialog:/);
    expect(scope?.dataset.syncloudosRuntimeOwner).toBe(runtime.runtimeId);
  });
});
