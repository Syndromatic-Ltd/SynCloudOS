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
import React, { useLayoutEffect, useMemo, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NSEFontManager,
  NSEFontPanel,
  NSERuler,
  normaliseFontDescriptor,
  normaliseParagraphStyle,
  type NSEFontPanelCommandPort,
  type NSEParagraphStyle,
} from "../../src/NSE/Typography";
import { NSEOverlayProvider } from "../../src/NSE/Overlays/NSEOverlayProvider";
import { NSEWindowSurfaceBridgeProvider } from "../../src/NSE/Overlays/NSEWindowSurfaceBridge";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact/SynCloudOSProvider";
import { useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact/nseFocusPort";
import { SynCloudOSNSEFontPanel } from "../../src/SynCloudOSReact/SynCloudOSNSEFontPanel";
import { typographyFontFamilies } from "../fixtures/typographyFontFamilies";
import { createTestRuntime } from "./helpers";

const fixtureManager = () => new NSEFontManager({ families: typographyFontFamilies, library: null });
const runtimes: ReturnType<typeof createTestRuntime>[] = [];

afterEach(async () => {
  cleanup();
  Reflect.deleteProperty(document, "fonts");
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose("test");
});

function runtimeFor(id: string) {
  const runtime = createTestRuntime({ id });
  runtimes.push(runtime);
  return runtime;
}

/** Commits a point size from the panel's size field, as Return does. */
function commitSize(field: HTMLElement, size: number) {
  fireEvent.change(field, { target: { value: String(size) } });
  fireEvent.keyDown(field, { key: "Enter" });
}

function sizeField(): HTMLElement {
  return screen.getByRole("spinbutton", { name: "Font size" });
}

function OverlayHarness({ runtime, children }: { readonly runtime: ReturnType<typeof createTestRuntime>; readonly children: React.ReactNode }) {
  const port = useRuntimeNSEOverlayPort("workspace");
  return <NSEOverlayProvider runtimePort={port}>{children}</NSEOverlayProvider>;
}

describe("NSE typography values and manager", () => {
  it("normalises font weight, size and families without mutating input", () => {
    const input = { families: ["Helvetica", "sans-serif"], size: 15, weight: 650 };
    const descriptor = normaliseFontDescriptor(input);

    expect(descriptor).toEqual({ families: ["Helvetica", "sans-serif"], size: 15, weight: 650, style: "normal", stretch: "normal" });
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor.families)).toBe(true);
    expect(input).not.toHaveProperty("style");
  });

  it("rejects descriptor accessors, sparse families and CSS injection without executing accessors", () => {
    const getter = vi.fn(() => ["Fixture Sans"]);
    const accessor = {};
    Object.defineProperty(accessor, "families", { enumerable: true, get: getter });
    expect(() => normaliseFontDescriptor(accessor)).toThrow(/data-only|accessor/i);
    expect(getter).not.toHaveBeenCalled();
    expect(() => normaliseFontDescriptor({ families: Object.assign(new Array(2), { 1: "Fixture Sans" }), size: 12, weight: 400 })).toThrow(/dense/i);
    expect(() => normaliseFontDescriptor({ families: ["Fixture Sans; color: red"], size: 12, weight: 400 })).toThrow(/family/i);
  });

  it("uses supplied fixture metadata without probing browser or system fonts", () => {
    const fontProbe = vi.fn(() => { throw new Error("font privacy probe"); });
    Object.defineProperty(document, "fonts", { configurable: true, get: fontProbe });
    const manager = fixtureManager();

    expect(manager.availableFamilies).toEqual(typographyFontFamilies);
    expect(manager.availableFamilies.map(({ id }) => id)).toEqual(["fixture.sans", "fixture.serif"]);
    expect(manager.availableFamilies[0]?.presets.map(({ id }) => id)).toContain("fixture.sans.regular");
    expect(fontProbe).not.toHaveBeenCalled();
    expect(Object.isFrozen(manager.availableFamilies)).toBe(true);
  });

  it("creates bounded canonical font and paragraph command payloads", () => {
    const manager = fixtureManager();
    expect(manager.fontCommand("fixture.sans.bold-italic", 18)).toEqual({ fontId: "fixture.sans.bold-italic", size: 18 });
    expect(manager.descriptorForPreset("fixture.sans.bold-italic", 18)).toMatchObject({ size: 18, weight: 700, style: "italic" });
    expect(manager.cssForDescriptor(manager.descriptorForPreset("fixture.sans.bold-italic", 18))).toMatchObject({ fontSize: "18px", fontWeight: 700, fontStyle: "italic" });
    expect(() => manager.fontCommand("system-secret", 18)).toThrow(/font/i);
    expect(normaliseParagraphStyle({ alignment: "centre", firstLineIndent: 12, headIndent: 8, tailIndent: 4, lineHeight: 1.5 })).toEqual({ alignment: "centre", firstLineIndent: 12, headIndent: 8, tailIndent: 4, lineHeight: 1.5, tabStops: [] });
    const importedStyle = normaliseParagraphStyle({ alignment: "start", tabStops: [24, 48] });
    expect(importedStyle.tabStops).toEqual([24, 48]);
    expect(manager.paragraphCommand(importedStyle)).toEqual({
      alignment: "start",
      firstLineIndent: 0,
      headIndent: 0,
      tailIndent: 0,
      lineHeight: "normal",
      tabStops: [24, 48],
    });
  });
});

describe("NSERuler", () => {
  it("provides keyboard-operable logical indents and tab-stop mutation", () => {
    function Fixture() {
      const [style, setStyle] = useState<NSEParagraphStyle>(() => normaliseParagraphStyle({ alignment: "start", firstLineIndent: 0, headIndent: 0, tailIndent: 0, lineHeight: "normal" }));
      return <NSERuler value={style} maximum={120} step={4} onChange={setStyle} />;
    }
    render(<Fixture />);

    fireEvent.keyDown(screen.getByRole("slider", { name: "First line indent" }), { key: "ArrowRight" });
    expect((screen.getByRole("slider", { name: "First line indent" }) as HTMLInputElement).value).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Add tab stop" }));
    expect(screen.getByRole("slider", { name: "Tab stop 1" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("slider", { name: "Tab stop 1" }), { key: "ArrowRight" });
    expect((screen.getByRole("slider", { name: "Tab stop 1" }) as HTMLInputElement).value).toBe("5");
  });

  it("maps head and tail keyboard movement from logical edges in RTL", () => {
    function Fixture() {
      const [style, setStyle] = useState<NSEParagraphStyle>(() => normaliseParagraphStyle({ alignment: "start", headIndent: 8, tailIndent: 8 }));
      return <NSERuler value={style} direction="rtl" maximum={120} step={4} onChange={setStyle} />;
    }
    render(<Fixture />);

    fireEvent.keyDown(screen.getByRole("slider", { name: "Head indent" }), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Tail indent" }), { key: "ArrowRight" });
    expect((screen.getByRole("slider", { name: "Head indent" }) as HTMLInputElement).value).toBe("12");
    expect((screen.getByRole("slider", { name: "Tail indent" }) as HTMLInputElement).value).toBe("12");
    expect(screen.getByRole("region", { name: "Paragraph ruler" }).getAttribute("dir")).toBe("rtl");
  });

  it("disables every mutation path when paragraph formatting is read only", () => {
    const onChange = vi.fn();
    render(<NSERuler value={normaliseParagraphStyle({ alignment: "start" })} onChange={onChange} readOnly />);
    expect((screen.getByRole("slider", { name: "First line indent" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("slider", { name: "First line indent" }), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("hosted font panel and focused commands", () => {
  it("presents through the canonical window-surface bridge", async () => {
    const runtime = runtimeFor("runtime:font-surface");
    const manager = fixtureManager();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const present = vi.fn(async () => "font-panel-window");
    const dismiss = vi.fn(async () => ({ outcome: "closed" as const }));
    const commandPort: NSEFontPanelCommandPort = { execute: vi.fn(async () => ({ status: "executed" as const })) };

    render(<SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><NSEWindowSurfaceBridgeProvider bridge={{ present, dismiss }}><NSEFontPanel open anchor={anchor} manager={manager} commandPort={commandPort} parentResponderId="workspace" onOpenChange={() => undefined} /></NSEWindowSurfaceBridgeProvider></OverlayHarness></SynCloudOSProvider>);

    await waitFor(() => expect(present).toHaveBeenCalledOnce());
    expect(document.querySelector("[data-nse-control='font-panel']")).toBeNull();
  });

  it("propagates the active host direction through the SynCloudOS panel into a hosted ruler", async () => {
    const runtime = runtimeFor("runtime:font-hosted-rtl");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    let hosted: React.ReactNode = null;
    const present = vi.fn(async (_request, content: React.ReactNode) => {
      hosted = content;
      return "font-panel-window";
    });
    const dismiss = vi.fn(async () => ({ outcome: "closed" as const }));
    const panel = render(<SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><NSEWindowSurfaceBridgeProvider bridge={{ present, dismiss }}><SynCloudOSNSEFontPanel open showsRuler direction="rtl" anchor={anchor} manager={fixtureManager()} parentResponderId="workspace" onOpenChange={() => undefined} /></NSEWindowSurfaceBridgeProvider></OverlayHarness></SynCloudOSProvider>);
    await waitFor(() => expect(hosted).not.toBeNull());
    // A window host presents the content under its own overlay host.
    const hostedView = render(<SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}>{hosted}</OverlayHarness></SynCloudOSProvider>);

    expect(hostedView.getByRole("region", { name: "Paragraph ruler" }).getAttribute("dir")).toBe("rtl");
    expect(hostedView.getByRole("slider", { name: "Head indent" }).getAttribute("data-logical-edge")).toBe("start");
    hostedView.unmount();
    panel.unmount();
  });

  it("presents supplied native paragraph tab stops with keyboard mutations", () => {
    const runtime = runtimeFor("runtime:font-imported-tabs");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const paragraphStyle = normaliseParagraphStyle({ alignment: "start", firstLineIndent: 2, headIndent: 3, tailIndent: 4, lineHeight: 1.5, tabStops: [6, 12] });
    const execute = vi.fn(async () => ({ status: "executed" as const }));
    render(<SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><NSEFontPanel open showsRuler anchor={anchor} manager={fixtureManager()} commandPort={{ execute }} paragraphStyle={paragraphStyle} parentResponderId="workspace" onOpenChange={() => undefined} /></OverlayHarness></SynCloudOSProvider>);

    expect(paragraphStyle.tabStops).toEqual([6, 12]);
    expect(screen.getByRole("slider", { name: "Tab stop 1" })).toBeTruthy();
    expect((screen.getByRole("slider", { name: "Head indent" }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Centre paragraph" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Head indent" }), { key: "ArrowRight" });
    expect(execute).toHaveBeenCalled();
  });

  it("fences a prepared panel command when its owner unmounts before acceptance", async () => {
    const runtime = runtimeFor("runtime:font-stale");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalPrepare = runtime.commands.prepareDispatch.bind(runtime.commands);
    const prepare = vi.spyOn(runtime.commands, "prepareDispatch").mockImplementation(async (...args) => {
      await gate;
      return originalPrepare(...args);
    });
    const dispatch = vi.spyOn(runtime.commands, "dispatch");
    const view = render(<SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><SynCloudOSNSEFontPanel open anchor={anchor} manager={fixtureManager()} parentResponderId="workspace" onOpenChange={() => undefined} /></OverlayHarness></SynCloudOSProvider>);
    commitSize(sizeField(), 12);
    view.unmount();
    release();
    await Promise.resolve();

    expect(prepare).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fences a prepared runtime command when the controlled panel closes while remaining mounted", async () => {
    const runtime = runtimeFor("runtime:font-controlled-close");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalPrepare = runtime.commands.prepareDispatch.bind(runtime.commands);
    const prepare = vi.spyOn(runtime.commands, "prepareDispatch").mockImplementation(async (...args) => {
      await gate;
      return originalPrepare(...args);
    });
    const dispatch = vi.spyOn(runtime.commands, "dispatch");
    const panel = (open: boolean) => <SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><SynCloudOSNSEFontPanel open={open} anchor={anchor} manager={fixtureManager()} parentResponderId="workspace" onOpenChange={() => undefined} /></OverlayHarness></SynCloudOSProvider>;
    const view = render(panel(true));
    commitSize(sizeField(), 12);

    view.rerender(panel(false));
    release();
    await act(async () => undefined);

    expect(prepare).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fences acceptance settling after a closed prop commits but before passive effects", async () => {
    const runtime = runtimeFor("runtime:font-close-layout-race");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let preparedSignal: AbortSignal | undefined;
    let abortedAtLayout: boolean | undefined;
    const originalPrepare = runtime.commands.prepareDispatch.bind(runtime.commands);
    vi.spyOn(runtime.commands, "prepareDispatch").mockImplementation(async (...args) => {
      preparedSignal = args[2]?.signal;
      await gate;
      return originalPrepare(...args);
    });
    const dispatch = vi.spyOn(runtime.commands, "dispatch");
    function SettleAtLayout({ closing }: { readonly closing: boolean }) {
      useLayoutEffect(() => {
        if (!closing) return;
        abortedAtLayout = preparedSignal?.aborted;
        release();
      }, [closing]);
      return null;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const tree = (open: boolean) => <SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><SynCloudOSNSEFontPanel open={open} anchor={anchor} manager={fixtureManager()} parentResponderId="workspace" onOpenChange={() => undefined} /><SettleAtLayout closing={!open} /></OverlayHarness></SynCloudOSProvider>;
    await act(async () => root.render(tree(true)));
    commitSize(host.querySelector<HTMLInputElement>("input[aria-label='Font size']")!, 12);

    flushSync(() => root.render(tree(false)));
    await Promise.resolve();
    await Promise.resolve();

    expect(abortedAtLayout).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });

  it("supersedes only the older intent in the same command lane and aborts every lane when closed", async () => {
    const runtime = runtimeFor("runtime:font-intents");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const pending: Array<{ commandId: string; signal: AbortSignal; resolve: (value: { status: "executed" }) => void }> = [];
    const commandPort: NSEFontPanelCommandPort = {
      execute: vi.fn<NSEFontPanelCommandPort["execute"]>((commandId, _payload, signal) => new Promise((resolve) => pending.push({ commandId, signal, resolve }))),
    };
    const manager = fixtureManager();
    const panel = (open: boolean) => <SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><NSEFontPanel open={open} showsRuler anchor={anchor} manager={manager} commandPort={commandPort} parentResponderId="workspace" onOpenChange={() => undefined} /></OverlayHarness></SynCloudOSProvider>;
    const view = render(panel(true));

    commitSize(sizeField(), 12);
    commitSize(sizeField(), 13);
    expect(pending[0]?.signal.aborted).toBe(true);
    expect(pending[1]?.signal.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Centre paragraph" }));
    expect(pending[1]?.signal.aborted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "End paragraph" }));
    expect(pending[2]?.signal.aborted).toBe(true);
    expect(pending[3]?.signal.aborted).toBe(false);

    view.rerender(panel(false));
    expect(pending[1]?.signal.aborted).toBe(true);
    expect(pending[3]?.signal.aborted).toBe(true);
    for (const operation of pending) operation.resolve({ status: "executed" });
    await act(async () => undefined);
  });

  it("ends the open session on a physical overlay close before a refused dismissal reopens it", async () => {
    const runtime = runtimeFor("runtime:font-physical-close");
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const signals: AbortSignal[] = [];
    const commandPort: NSEFontPanelCommandPort = {
      execute: vi.fn<NSEFontPanelCommandPort["execute"]>((_commandId, _payload, signal) => {
        signals.push(signal);
        return new Promise(() => undefined);
      }),
    };
    let physicalClose: (() => void) | undefined;
    const dismiss = vi.fn(async () => ({ outcome: "refused" as const }));
    function Fixture() {
      const [open, setOpen] = useState(true);
      const [hosted, setHosted] = useState<React.ReactNode>(null);
      const bridge = useMemo(() => ({
        present: async (request: { readonly onDidClose?: () => void }, content: React.ReactNode) => {
          physicalClose = request.onDidClose;
          setHosted((current) => current ?? content);
          return "font-panel-window";
        },
        dismiss,
      }), []);
      return <NSEWindowSurfaceBridgeProvider bridge={bridge}><NSEFontPanel open={open} anchor={anchor} manager={fixtureManager()} commandPort={commandPort} parentResponderId="workspace" onOpenChange={setOpen} />{hosted}</NSEWindowSurfaceBridgeProvider>;
    }
    render(<SynCloudOSProvider runtime={runtime}><OverlayHarness runtime={runtime}><Fixture /></OverlayHarness></SynCloudOSProvider>);
    await waitFor(() => expect(physicalClose).toBeTypeOf("function"));
    commitSize(sizeField(), 12);

    act(() => physicalClose?.());
    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
    await waitFor(() => expect(dismiss).toHaveBeenCalled());
    commitSize(sizeField(), 12);
    expect(signals[1]?.aborted).toBe(false);
  });
});
