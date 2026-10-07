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
import React, { useMemo, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEFilePanelView } from "../../../src/NSE/FilePanels/NSEFilePanelView";
import { NSEActionSheet, NSEOverlayProvider, NSEPopover, useNSEWindowSurfaceLifecycle, type NSEWindowSurfaceBridge } from "../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";

afterEach(() => document.body.replaceChildren());

const workArea = Object.freeze({ width: 1200, height: 800, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const presentation = createStaticPresentationPort({ width: 1200, height: 800 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:surface-lifecycle",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: vi.fn(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <NSEOverlayProvider runtimePort={runtimePort}>{children}</NSEOverlayProvider>;
}

function refusingBridge() {
  return {
    present: vi.fn(async () => "window:surface"),
    dismiss: vi.fn(async () => ({ outcome: "refused" as const })),
    reportError: vi.fn(),
  };
}

function LifecycleProbe({
  bridge,
  open,
  onDismissRefused,
}: {
  readonly bridge: NSEWindowSurfaceBridge;
  readonly open: boolean;
  readonly onDismissRefused: () => void;
}) {
  useNSEWindowSurfaceLifecycle({
    bridge,
    requestId: "lifecycle-probe",
    open,
    onDismissRefused,
    onDidClose: vi.fn(),
  });
  return null;
}

describe("canonical window-surface lifecycle", () => {
  it("reports a rejected physical dismissal and restores unresolved source truth", async () => {
    const failure = new Error("close failed");
    const bridge = { ...refusingBridge(), dismiss: vi.fn(async () => { throw failure; }) };
    const onDismissRefused = vi.fn();
    const rendered = render(<LifecycleProbe bridge={bridge} open onDismissRefused={onDismissRefused} />);

    rendered.rerender(<LifecycleProbe bridge={bridge} open={false} onDismissRefused={onDismissRefused} />);

    await waitFor(() => expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "lifecycle-probe", operation: "dismiss" }));
    expect(onDismissRefused).toHaveBeenCalledOnce();
  });

  it("does not restore rejected physical-dismissal state after the consumer unmounts", async () => {
    const failure = new Error("close failed after unmount");
    const bridge = { ...refusingBridge(), dismiss: vi.fn(async () => { throw failure; }) };
    const onDismissRefused = vi.fn();
    const rendered = render(<LifecycleProbe bridge={bridge} open onDismissRefused={onDismissRefused} />);

    rendered.unmount();

    await waitFor(() => expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "lifecycle-probe", operation: "dismiss" }));
    expect(onDismissRefused).not.toHaveBeenCalled();
  });

  it("restores controlled popover source truth when physical dismissal is refused", async () => {
    const bridge = refusingBridge();
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <OverlayHarness>
        <button type="button" onClick={() => setOpen(false)}>Close popover source</button>
        <output aria-label="popover source">{open ? "open" : "closed"}</output>
        <NSEPopover id="refused-popover" open={open} anchor={null} parentWindowControllerId="window:parent" parentResponderId="window:parent" windowBridge={bridge} onOpenChange={setOpen}>
          <p>Popover</p>
        </NSEPopover>
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Close popover source" }));

    await waitFor(() => expect(bridge.dismiss).toHaveBeenCalledWith("refused-popover"));
    await waitFor(() => expect(screen.getByLabelText("popover source").textContent).toBe("open"));
  });

  it("restores controlled file-panel source truth when physical dismissal is cancelled", async () => {
    const bridge = { ...refusingBridge(), dismiss: vi.fn(async () => ({ outcome: "cancelled" as const })) };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <>
        <button type="button" onClick={() => setOpen(false)}>Close file source</button>
        <output aria-label="file source">{open ? "open" : "closed"}</output>
        <NSEFilePanelView id="refused-file" open={open} anchor={null} parentResponderId="window:parent" parentWindowControllerId="window:parent" title="Choose file" windowBridge={bridge} result={null} onOpenChange={setOpen}>
          <p>Files</p>
        </NSEFilePanelView>
      </>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Close file source" }));

    await waitFor(() => expect(screen.getByLabelText("file source").textContent).toBe("open"));
  });

  it("restores controlled popover source truth and reports when physical dismissal rejects", async () => {
    const failure = new Error("popover close failed");
    const bridge = { ...refusingBridge(), dismiss: vi.fn(async () => { throw failure; }) };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <OverlayHarness>
        <button type="button" onClick={() => setOpen(false)}>Reject popover close</button>
        <output aria-label="rejected popover source">{open ? "open" : "closed"}</output>
        <NSEPopover id="rejected-popover" open={open} anchor={null} parentWindowControllerId="window:parent" parentResponderId="window:parent" windowBridge={bridge} onOpenChange={setOpen}>
          <p>Popover</p>
        </NSEPopover>
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Reject popover close" }));

    await waitFor(() => expect(screen.getByLabelText("rejected popover source").textContent).toBe("open"));
    expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "rejected-popover", operation: "dismiss" });
  });

  it("restores controlled action-sheet source truth and reports when physical dismissal rejects", async () => {
    const failure = new Error("sheet close failed");
    const bridge = { ...refusingBridge(), dismiss: vi.fn(async () => { throw failure; }) };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <OverlayHarness>
        <button type="button" onClick={() => setOpen(false)}>Reject action-sheet close</button>
        <output aria-label="rejected action-sheet source">{open ? "open" : "closed"}</output>
        <NSEActionSheet id="rejected-action-sheet" open={open} parentResponderId="window:parent" parentWindowControllerId="window:parent" windowBridge={bridge} onOpenChange={setOpen}>Sheet</NSEActionSheet>
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Reject action-sheet close" }));

    await waitFor(() => expect(screen.getByLabelText("rejected action-sheet source").textContent).toBe("open"));
    expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "rejected-action-sheet", operation: "dismiss" });
  });

  it("restores controlled file-panel source truth and reports when physical dismissal rejects", async () => {
    const failure = new Error("file close failed");
    const bridge = { ...refusingBridge(), dismiss: vi.fn(async () => { throw failure; }) };
    function Fixture() {
      const [open, setOpen] = useState(true);
      return <>
        <button type="button" onClick={() => setOpen(false)}>Reject file close</button>
        <output aria-label="rejected file source">{open ? "open" : "closed"}</output>
        <NSEFilePanelView id="rejected-file" open={open} anchor={null} parentResponderId="window:parent" parentWindowControllerId="window:parent" title="Choose file" windowBridge={bridge} result={null} onOpenChange={setOpen}>
          <p>Files</p>
        </NSEFilePanelView>
      </>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Reject file close" }));

    await waitFor(() => expect(screen.getByLabelText("rejected file source").textContent).toBe("open"));
    expect(bridge.reportError).toHaveBeenCalledWith(failure, { requestId: "rejected-file", operation: "dismiss" });
  });

  it("reports a rejected uncontrolled action-sheet presentation without detaching open state", async () => {
    const failure = new Error("host failed");
    const bridge = {
      present: vi.fn(async () => { throw failure; }),
      dismiss: vi.fn(async () => ({ outcome: "missing" as const })),
      reportError: vi.fn(),
    };
    const onOpenChange = vi.fn();
    render(<NSEActionSheet id="rejected-sheet" defaultOpen parentResponderId="runtime" windowBridge={bridge} onOpenChange={onOpenChange}>Sheet</NSEActionSheet>);

    await waitFor(() => expect(bridge.reportError).toHaveBeenCalledWith(failure, expect.objectContaining({ requestId: "rejected-sheet", operation: "present" })));
    expect(onOpenChange).not.toHaveBeenCalledWith(false, expect.anything());
  });

  it("presents a popover once per request while its host re-renders, and still delivers content updates", async () => {
    // A hosted bridge re-renders the whole application window on every
    // present (WindowHost follows the renderer registry). Re-presenting on
    // each new children identity therefore looped until React gave up.
    let hostRender: (() => void) | null = null;
    let presented: React.ReactNode = null;
    const bridge = {
      present: vi.fn(async (_request: unknown, content: React.ReactNode) => { presented = content; hostRender?.(); return "window:popover"; }),
      dismiss: vi.fn(async () => ({ outcome: "confirmed" as const })),
      reportError: vi.fn(),
    };
    function Fixture() {
      const [renders, setRenders] = useState(0);
      hostRender = () => setRenders((count) => count + 1);
      return <OverlayHarness>
        <NSEPopover id="hosted-popover" open anchor={null} parentWindowControllerId="window:parent" parentResponderId="window:parent" windowBridge={bridge} onOpenChange={() => undefined}>
          <p>Render {Math.min(renders, 3)}</p>
        </NSEPopover>
      </OverlayHarness>;
    }
    render(<Fixture />);
    await waitFor(() => expect(bridge.present).toHaveBeenCalled());
    const host = document.createElement("div");
    document.body.append(host);
    render(<>{presented}</>, { container: host });
    await act(async () => { hostRender?.(); hostRender?.(); hostRender?.(); });
    expect(bridge.present).toHaveBeenCalledOnce();
    await waitFor(() => expect(host.textContent).toBe("Render 3"));
  });

});
