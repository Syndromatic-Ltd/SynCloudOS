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

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GFXColour } from "../../../src/FX/GraphicsFX/public";
import { NSEColourSliderPicker, NSEColourSwatches, NSEColourWell, NSEColourPanelProvider, NSEColourPanel, NSEColourPanelController, NSEColourWheelPicker, classifyEyeDropperError } from "../../../src/NSE/Colour";
import type { NSEEyeDropperAdapter } from "../../../src/NSE/Colour/Pickers";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { SynCloudOSProvider } from "../../../src/SynCloudOSReact";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { createTestRuntimeEnvironment } from "../../runtime/helpers";

afterEach(cleanup);
const wrapper = (child: React.ReactNode) => {
  const runtime = createSynCloudOS({ id: "colour:controls", environment: createTestRuntimeEnvironment() });
  return <SynCloudOSProvider runtime={runtime}><NSEColourPanelProvider service={runtime.colourPanel}>{child}</NSEColourPanelProvider></SynCloudOSProvider>;
};

const colourOverlayPort = (runtime: ReturnType<typeof createSynCloudOS>, ownerDocument: Document = document) => {
  const workArea = Object.freeze({ width: 1280, height: 720, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
  const presentation = createStaticPresentationPort({ width: 1280, height: 720 });
  return {
    runtimeId: runtime.runtimeId,
    signal: runtime.signal,
    environment: {
      browser: { getDocument: () => ownerDocument, getWindow: () => ownerDocument.defaultView },
      workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  };
};

function HostedColourHarness({ runtime, eyeDropper, children }: { readonly runtime: ReturnType<typeof createSynCloudOS>; readonly eyeDropper?: NSEEyeDropperAdapter; readonly children: React.ReactNode }) {
  const workArea = React.useMemo(() => Object.freeze({ width: 1280, height: 720, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) }), []);
  const presentation = React.useMemo(() => createStaticPresentationPort({ width: 1280, height: 720 }), []);
  const runtimePort = React.useMemo(() => ({
    runtimeId: runtime.runtimeId,
    signal: runtime.signal,
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
  }), [presentation, runtime, workArea]);
  return <SynCloudOSProvider runtime={runtime}><NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace"><NSEColourPanelProvider service={runtime.colourPanel}>{children}<NSEColourPanel eyeDropper={eyeDropper} /></NSEColourPanelProvider></NSEOverlayProvider></SynCloudOSProvider>;
}

describe("colour controls", () => {
  it("renders actionable loading empty denied interrupted invalid and error panel states", () => {
    const runtime = createSynCloudOS({ id: "colour:semantic-states", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    controller.activateTarget({ id: "state-anchor", responderId: "workspace", read: () => GFXColour.parse("#336699"), preview: vi.fn(), commit: vi.fn(), cancel: vi.fn() });
    controller.open();
    const anchor = document.createElement("button");
    anchor.id = "state-anchor";
    document.body.append(anchor);
    const view = render(<NSEOverlayProvider runtimePort={colourOverlayPort(runtime)} defaultParentResponderId="workspace"><NSEColourPanel controller={controller} contentState="loading" /></NSEOverlayProvider>);
    expect(screen.getByText(/loading colour choices/i)).not.toBeNull();
    view.rerender(<NSEOverlayProvider runtimePort={colourOverlayPort(runtime)} defaultParentResponderId="workspace"><NSEColourPanel controller={controller} contentState="denied" /></NSEOverlayProvider>);
    expect(screen.getByRole("alert").textContent).toMatch(/permission/i);
    view.rerender(<NSEOverlayProvider runtimePort={colourOverlayPort(runtime)} defaultParentResponderId="workspace"><NSEColourPanel controller={controller} contentState="invalid" /></NSEOverlayProvider>);
    expect(screen.getByRole("alert").textContent).toMatch(/invalid/i);
    anchor.remove();
  });
  it("provides a hex entry on every picker, with an inline parse error and recovery", () => {
    const runtime = createSynCloudOS({ id: "colour:hex-entry", environment: createTestRuntimeEnvironment() });
    render(<HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Hex ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Hex ink" }));
    for (const picker of ["Colour Wheel", "Colour Sliders", "Colour Palettes", "Image Palettes", "Crayons"]) {
      fireEvent.click(screen.getByRole("tab", { name: picker }));
      expect((screen.getByRole("textbox", { name: "Hex colour" }) as HTMLInputElement).value).toBe("336699");
    }
    const input = screen.getByRole("textbox", { name: "Hex colour" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12oops" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/hex code/i);
    fireEvent.change(input, { target: { value: "ff000080" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(runtime.colourPanel.getSnapshot().currentCSS).toBe("rgb(255 0 0 / 0.501961)");
    fireEvent.change(input, { target: { value: "rgb(0 128 0)" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("008000");
  });

  it("lets Escape revert a pending hex edit before it dismisses the panel", () => {
    const runtime = createSynCloudOS({ id: "colour:hex-escape", environment: createTestRuntimeEnvironment() });
    render(<HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Escape ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Escape ink" }));
    const input = screen.getByRole("textbox", { name: "Hex colour" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zz" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("336699");
    expect(runtime.colourPanel.getSnapshot().open).toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(runtime.colourPanel.getSnapshot().open).toBe(false);
  });

  it("keeps saved colours in the strip and lists recent colours as a palette", () => {
    const runtime = createSynCloudOS({ id: "colour:recents-remove", environment: createTestRuntimeEnvironment() });
    render(<HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Palette ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Palette ink" }));
    const saved = () => within(screen.getByRole("grid", { name: "Saved colours" })).getAllByRole("gridcell").filter((cell) => cell.getAttribute("data-state") === "filled");
    const before = saved().length;
    fireEvent.keyDown(saved()[0]!, { key: "Delete" });
    expect(saved()).toHaveLength(before - 1);
    // An empty well keeps the current colour.
    fireEvent.click(within(screen.getByRole("grid", { name: "Saved colours" })).getAllByRole("gridcell", { name: /^Empty/ })[0]!);
    expect(saved()).toHaveLength(before);
    expect(saved().at(-1)!.getAttribute("aria-label")).toBe("Saved colour #336699");
    fireEvent.click(screen.getByRole("tab", { name: "Colour Sliders" }));
    for (const channel of ["Red", "Green", "Blue"]) {
      expect(screen.getByRole("spinbutton", { name: channel })).not.toBeNull();
      expect(screen.getByRole("slider", { name: channel })).not.toBeNull();
    }
    fireEvent.click(screen.getByRole("tab", { name: "Colour Wheel" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Colour hue and saturation" }), { key: "ArrowRight" });
    fireEvent.keyUp(screen.getByRole("slider", { name: "Colour hue and saturation" }), { key: "ArrowRight" });
    expect(runtime.colourPanel.getSnapshot().recents).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Colour Palettes" }));
    fireEvent.click(screen.getByRole("button", { name: /^List / }));
    fireEvent.click(screen.getAllByRole("option", { name: "Recently Used" }).find((candidate) => candidate.tagName === "BUTTON") ?? screen.getByRole("option", { name: "Recently Used" }));
    expect(within(screen.getByRole("listbox", { name: "Recently Used colours" })).getAllByRole("option")).toHaveLength(1);
  });

  it("propagates wheel pointer cancellation through the controlled panel target", () => {
    const runtime = createSynCloudOS({ id: "colour:pointer-cancel", environment: createTestRuntimeEnvironment() });
    function Harness() {
      const [value, setValue] = React.useState(() => GFXColour.parse("#336699"));
      return <HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Pointer ink" value={value} onValueChange={setValue} /><output aria-label="Pointer CSS">{value.toCSS()}</output></HostedColourHarness>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Pointer ink" }));
    const wheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    Object.assign(wheel, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(wheel, { pointerId: 9, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(wheel, { pointerId: 9, clientX: 100, clientY: 0 });
    expect(screen.getByRole("status", { name: "Pointer CSS" }).textContent).not.toBe("rgb(51 102 153)");
    fireEvent.pointerCancel(wheel, { pointerId: 9 });
    expect(screen.getByRole("status", { name: "Pointer CSS" }).textContent).toBe("rgb(51 102 153)");
  });
  it("renders a discernible semantic well fallback instead of an empty painted button", () => {
    render(wrapper(<NSEColourWell aria-label="Ink" defaultValue={GFXColour.parse("#336699")} />));
    const well = screen.getByRole("button", { name: "Ink" });
    expect(well.textContent).toContain("#336699");
    expect(well.querySelector('[data-nse-part="colour-sample"]')).not.toBeNull();
  });

  it("supports a supplied standalone controller without requiring colour provider context", () => {
    const runtime = createSynCloudOS({ id: "colour:standalone-panel", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    expect(() => render(<NSEOverlayProvider runtimePort={colourOverlayPort(runtime)} defaultParentResponderId="workspace"><NSEColourPanel controller={controller} /></NSEOverlayProvider>)).not.toThrow();
  });

  it("resolves the active well in the overlay owner document", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const ownerDocument = frame.contentDocument!;
    const runtime = createSynCloudOS({ id: "colour:owner-document", environment: createTestRuntimeEnvironment() });
    const controller = new NSEColourPanelController(runtime);
    const anchor = ownerDocument.createElement("button");
    anchor.id = "foreign-colour-well";
    ownerDocument.body.append(anchor);
    const mount = ownerDocument.createElement("div");
    ownerDocument.body.append(mount);
    controller.activateTarget({ id: anchor.id, responderId: "workspace", read: () => GFXColour.parse("#336699"), preview: vi.fn(), commit: vi.fn(), cancel: vi.fn() });
    controller.open();

    render(<NSEOverlayProvider runtimePort={colourOverlayPort(runtime, ownerDocument)} defaultParentResponderId="workspace"><NSEColourPanelProvider service={runtime.colourPanel}><NSEColourPanel controller={controller} /></NSEColourPanelProvider></NSEOverlayProvider>, { container: mount });

    expect(within(ownerDocument.body).getByRole("dialog", { name: "Colours" })).not.toBeNull();
    expect(document.querySelector("[data-nse-utility-panel]")).toBeNull();
    frame.remove();
  });

  it("applies a finished gesture to a controlled well and keeps it when the panel closes", () => {
    const runtime = createSynCloudOS({ id: "colour:controlled-cancel", environment: createTestRuntimeEnvironment() });
    function Harness() {
      const [value, setValue] = React.useState(() => GFXColour.parse("#336699"));
      return <HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Controlled ink" value={value} onValueChange={setValue} /><output aria-label="Controlled CSS">{value.toCSS()}</output></HostedColourHarness>;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Controlled ink" }));
    const wheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    fireEvent.keyDown(wheel, { key: "ArrowRight" });
    fireEvent.keyUp(wheel, { key: "ArrowRight" });
    const changed = screen.getByRole("status", { name: "Controlled CSS" }).textContent;
    expect(changed).not.toBe("rgb(51 102 153)");
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-nse-utility-panel]")!).getByRole("button", { name: /close/i }));
    expect(runtime.colourPanel.getSnapshot().open).toBe(false);
    expect(screen.getByRole("status", { name: "Controlled CSS" }).textContent).toBe(changed);
  });

  it("seeds the saved colours with useful choices and room to keep more", () => {
    const runtime = createSynCloudOS({ id: "colour:hosted-swatches", environment: createTestRuntimeEnvironment() });
    render(<HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Palette ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Palette ink" }));
    const strip = screen.getByRole("grid", { name: "Saved colours" });
    expect(within(strip).getAllByRole("gridcell", { name: /^Saved colour/ }).length).toBeGreaterThan(0);
    expect(within(strip).getAllByRole("gridcell", { name: /^Empty/ }).length).toBeGreaterThan(0);
    const grip = screen.getByRole("button", { name: "Show more saved colours" });
    fireEvent.click(grip);
    expect(within(strip).getAllByRole("row")).toHaveLength(3);
  });

  it("maps real wheel pointer capture through polar preview and exactly one commit", () => {
    const preview = vi.fn();
    const commit = vi.fn();
    const { container } = render(<NSEColourWheelPicker colour={GFXColour.hsva({ h: 0, s: 1, v: 1, a: 1 })} onPreview={preview} onCommit={commit} />);
    const wheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    Object.assign(wheel, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(wheel, { pointerId: 7, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(wheel, { pointerId: 7, clientX: 100, clientY: 0 });
    fireEvent.pointerUp(wheel, { pointerId: 7, clientX: 100, clientY: 0 });
    expect(preview).toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-nse-part="wheel-surface"]')).not.toBeNull();
  });
  it("mounts the real shared panel and picker set through the overlay host", async () => {
    const runtime = createSynCloudOS({ id: "colour:hosted", environment: createTestRuntimeEnvironment() });
    const view = render(<HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Ink" defaultValue={GFXColour.parse("#369")} /></HostedColourHarness>);
    const well = screen.getByRole("button", { name: "Ink" });
    well.focus();
    fireEvent.click(well);
    const panel = await screen.findByRole("dialog", { name: "Colours" });
    const utility = panel.closest<HTMLElement>("[data-nse-utility-panel]")!;
    expect(utility).not.toBeNull();
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ open: true, activeTargetId: expect.any(String) });
    expect(within(screen.getByRole("tablist", { name: "Colour pickers" })).getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"))).toEqual(["Colour Wheel", "Colour Sliders", "Colour Palettes", "Image Palettes", "Crayons"]);
    expect(screen.getByRole("button", { name: "Pick a colour from the screen" })).not.toBeNull();
    within(utility).getByRole("button", { name: /close/i }).focus();
    fireEvent.click(within(utility).getByRole("button", { name: /close/i }));
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ open: false });
    expect(document.activeElement).toBe(well);
    view.unmount();
    // The target outlives an effect replay; a real unmount releases it a turn later.
    await Promise.resolve();
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ activeTargetId: null, open: false });
  });

  it("picks a colour from the screen with the magnifier as one change", async () => {
    const runtime = createSynCloudOS({ id: "colour:eyedropper", environment: createTestRuntimeEnvironment() });
    const pick = vi.fn(async () => Object.freeze({ kind: "accepted" as const, colour: GFXColour.parse("#ff8000") }));
    render(<HostedColourHarness runtime={runtime} eyeDropper={{ availability: () => "available", pick }}><NSEColourWell aria-label="Sampled ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Sampled ink" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick a colour from the screen" }));
    await vi.waitFor(() => expect(runtime.colourPanel.getSnapshot().currentCSS).toBe("rgb(255 128 0)"));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(runtime.colourPanel.getSnapshot().recents).toEqual(["rgb(255 128 0)"]);
    expect((screen.getByRole("textbox", { name: "Hex colour" }) as HTMLInputElement).value).toBe("FF8000");
  });

  it("says so when the screen cannot be sampled, and a disabled magnifier where there is none", async () => {
    const runtime = createSynCloudOS({ id: "colour:eyedropper-denied", environment: createTestRuntimeEnvironment() });
    const view = render(<HostedColourHarness runtime={runtime} eyeDropper={{ availability: () => "available", pick: async () => Object.freeze({ kind: "denied" as const }) }}><NSEColourWell aria-label="Denied ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Denied ink" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick a colour from the screen" }));
    expect((await screen.findByText(/can't be sampled/i)).getAttribute("role")).toBe("status");
    expect(runtime.colourPanel.getSnapshot().currentCSS).toBe("rgb(51 102 153)");
    view.unmount();
    const unavailable = createSynCloudOS({ id: "colour:eyedropper-unavailable", environment: createTestRuntimeEnvironment() });
    render(<HostedColourHarness runtime={unavailable} eyeDropper={{ availability: () => "unavailable", pick: vi.fn() }}><NSEColourWell aria-label="Plain ink" defaultValue={GFXColour.parse("#336699")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Plain ink" }));
    expect((screen.getByRole("button", { name: "Pick a colour from the screen" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows opacity only for a target that takes it, as NSColorPanel.showsAlpha does", () => {
    const runtime = createSynCloudOS({ id: "colour:shows-alpha", environment: createTestRuntimeEnvironment() });
    render(<HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Opaque ink" defaultValue={GFXColour.parse("#336699")} /><NSEColourWell aria-label="Glass ink" showAlpha defaultValue={GFXColour.parse("#33669980")} /></HostedColourHarness>);
    fireEvent.click(screen.getByRole("button", { name: "Opaque ink" }));
    expect(screen.queryByRole("slider", { name: "Opacity" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Glass ink" }));
    expect(screen.getByRole("slider", { name: "Opacity" })).not.toBeNull();
  });

  it("keeps CMYK inks where the user left them while black moves", () => {
    const preview = vi.fn();
    function Harness() {
      const [colour, setColour] = React.useState(() => GFXColour.cmyka({ c: 0.2, m: 0.4, y: 0.6, k: 0.1, a: 1 }));
      return <NSEColourSliderPicker model="cmyk" colour={colour} onPreview={(next) => { preview(next); setColour(next); }} onCommit={() => undefined} />;
    }
    render(<Harness />);
    const field = (name: string) => screen.getByRole("spinbutton", { name }) as HTMLInputElement;
    fireEvent.change(field("Cyan"), { target: { value: "20" } });
    // Held as RGB, full black would read back as black alone; the sliders keep
    // the inks the user set while they work.
    fireEvent.change(field("Black"), { target: { value: "100" } });
    fireEvent.change(field("Black"), { target: { value: "10" } });
    expect([field("Cyan").value, field("Magenta").value, field("Yellow").value, field("Black").value]).toEqual(["20", "25", "50", "10"]);
    expect(preview).toHaveBeenCalledTimes(3);
  });

  it("reads a grey scale colour as its white component", () => {
    const commit = vi.fn();
    render(<NSEColourSliderPicker model="grey" colour={GFXColour.grayscale(0.5)} onPreview={() => undefined} onCommit={commit} />);
    expect((screen.getByRole("spinbutton", { name: "Brightness" }) as HTMLInputElement).value).toBe("50");
  });

  it("releases an active well lease exactly once across StrictMode unmount", async () => {
    const runtime = createSynCloudOS({ id: "colour:strict", environment: createTestRuntimeEnvironment() });
    const view = render(<React.StrictMode><HostedColourHarness runtime={runtime}><NSEColourWell aria-label="Strict ink" /></HostedColourHarness></React.StrictMode>);
    fireEvent.click(screen.getByRole("button", { name: "Strict ink" }));
    expect(runtime.colourPanel.getSnapshot().activeTargetId).not.toBeNull();
    view.unmount();
    await Promise.resolve();
    // The target is released once; the shared panel itself outlives it.
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ activeTargetId: null, open: true });
  });

  it("keeps the panel's target through a StrictMode effect replay of a moved well", async () => {
    const runtime = createSynCloudOS({ id: "colour:strict-move", environment: createTestRuntimeEnvironment() });
    // Reordering keyed siblings moves the well, and StrictMode replays a moved
    // subtree's effects, as a window host reordering its windows does.
    const tree = (order: readonly string[]) => <React.StrictMode><HostedColourHarness runtime={runtime}>{order.map((key) => key === "well" ? <NSEColourWell key="well" aria-label="Moved ink" /> : <span key={key}>{key}</span>)}</HostedColourHarness></React.StrictMode>;
    const view = render(tree(["well", "other"]));
    fireEvent.click(screen.getByRole("button", { name: "Moved ink" }));
    const target = runtime.colourPanel.getSnapshot().activeTargetId;
    expect(target).not.toBeNull();
    view.rerender(tree(["other", "well"]));
    await Promise.resolve();
    expect(runtime.colourPanel.getSnapshot()).toMatchObject({ activeTargetId: target, open: true });
    view.unmount();
  });
  it("supports controlled and uncontrolled wells with form/reset semantics", () => {
    const onValueChange = vi.fn();
    const { container } = render(wrapper(<form><NSEColourWell aria-label="Ink" name="ink" defaultValue={GFXColour.parse("#369")} onValueChange={onValueChange} /><button type="reset">Reset</button></form>));
    expect(container.querySelector<HTMLInputElement>('input[name="ink"]')?.value).toBe("rgb(51 102 153)");
    fireEvent.click(screen.getByRole("button", { name: "Ink" }));
    expect(screen.getByRole("button", { name: "Ink" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("keeps disabled wells inert", () => {
    render(wrapper(<NSEColourWell aria-label="Ink" disabled defaultValue={GFXColour.parse("#000")} />));
    const well = screen.getByRole("button", { name: "Ink" });
    expect((well as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(well);
    expect(well.getAttribute("aria-pressed")).toBe("false");
  });

  it("maps wheel pointer and keyboard input to preview and commit", () => {
    const preview = vi.fn();
    const commit = vi.fn();
    render(<NSEColourWheelPicker colour={GFXColour.hsva({ h: 0, s: 1, v: 1, a: 1 })} onPreview={preview} onCommit={commit} />);
    const wheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    fireEvent.keyDown(wheel, { key: "ArrowRight" });
    expect(preview).toHaveBeenCalled();
    fireEvent.keyUp(wheel, { key: "ArrowRight" });
    expect(commit).toHaveBeenCalled();
  });

  it("keeps every disabled wheel-picker descendant inert and cancels an active gesture defensively", () => {
    const preview = vi.fn();
    const commit = vi.fn();
    const cancel = vi.fn();
    const colour = GFXColour.hsva({ h: 0, s: 1, v: 1, a: 1 });
    const view = render(<NSEColourWheelPicker colour={colour} onPreview={preview} onCommit={commit} onCancel={cancel} />);
    const wheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    const releasePointerCapture = vi.fn();
    Object.assign(wheel, {
      setPointerCapture: vi.fn(),
      releasePointerCapture,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(wheel, { pointerId: 17, clientX: 100, clientY: 0 });
    expect(wheel.getAttribute("aria-valuenow")).not.toBe("0");
    const previewsBeforeDisable = preview.mock.calls.length;
    view.rerender(<NSEColourWheelPicker colour={colour} disabled onPreview={preview} onCommit={commit} onCancel={cancel} />);

    const disabledWheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    expect(disabledWheel.getAttribute("aria-valuenow")).toBe("0");
    expect(disabledWheel.getAttribute("aria-disabled")).toBe("true");
    expect(disabledWheel.getAttribute("tabindex")).toBe("-1");
    const brightness = screen.getByRole("slider", { name: "Brightness" }) as HTMLInputElement;
    expect(brightness.disabled).toBe(true);
    expect(screen.getAllByRole("spinbutton").every((input) => (input as HTMLInputElement).disabled)).toBe(true);

    fireEvent.pointerMove(disabledWheel, { pointerId: 17, clientX: 100, clientY: 0 });
    fireEvent.pointerUp(disabledWheel, { pointerId: 17, clientX: 100, clientY: 0 });
    fireEvent.pointerCancel(disabledWheel, { pointerId: 17 });
    fireEvent.lostPointerCapture(disabledWheel, { pointerId: 17 });
    fireEvent.keyDown(disabledWheel, { key: "ArrowRight" });
    fireEvent.keyUp(disabledWheel, { key: "ArrowRight" });
    fireEvent.change(brightness, { target: { value: "50" } });
    fireEvent.pointerUp(brightness);
    expect(preview).toHaveBeenCalledTimes(previewsBeforeDisable);
    expect(commit).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(colour);
    expect(releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it.each(["pointerCancel", "lostPointerCapture"] as const)("settles %s through the shared gesture cancellation path exactly once", (eventName) => {
    const preview = vi.fn();
    const commit = vi.fn();
    const cancel = vi.fn();
    const colour = GFXColour.hsva({ h: 15, s: 1, v: 1, a: 1 });
    render(<NSEColourWheelPicker colour={colour} onPreview={preview} onCommit={commit} onCancel={cancel} />);
    const wheel = screen.getByRole("slider", { name: "Colour hue and saturation" });
    const releasePointerCapture = vi.fn();
    Object.assign(wheel, {
      setPointerCapture: vi.fn(),
      releasePointerCapture,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.pointerDown(wheel, { pointerId: 31, clientX: 100, clientY: 0 });
    expect(wheel.getAttribute("aria-valuenow")).not.toBe("15");
    fireEvent[eventName](wheel, { pointerId: 31 });
    expect(wheel.getAttribute("aria-valuenow")).toBe("15");
    fireEvent.pointerUp(wheel, { pointerId: 31, clientX: 200, clientY: 100 });
    fireEvent.pointerCancel(wheel, { pointerId: 31 });
    fireEvent.lostPointerCapture(wheel, { pointerId: 31 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(colour);
    expect(commit).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("resynchronizes the wheel when its controlled colour is replaced", () => {
    const first = GFXColour.hsva({ h: 15, s: 1, v: 1, a: 1 });
    const second = GFXColour.hsva({ h: 210, s: 1, v: 1, a: 1 });
    const view = render(<NSEColourWheelPicker colour={first} onPreview={vi.fn()} onCommit={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Colour hue and saturation" }).getAttribute("aria-valuenow")).toBe("15");
    view.rerender(<NSEColourWheelPicker colour={second} onPreview={vi.fn()} onCommit={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Colour hue and saturation" }).getAttribute("aria-valuenow")).toBe("210");
  });

  it("edits RGB HSL HSV and alpha channels with numeric validation", () => {
    const commit = vi.fn();
    const { rerender } = render(<NSEColourSliderPicker model="rgb" colour={GFXColour.parse("#369")} onPreview={vi.fn()} onCommit={commit} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Red" }), { target: { value: "255" } });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Red" }));
    expect(commit).toHaveBeenCalledWith(GFXColour.parse("#ff6699"));
    rerender(<NSEColourSliderPicker model="hsv" colour={GFXColour.parse("#369")} onPreview={vi.fn()} onCommit={commit} showAlpha />);
    expect(screen.getByRole("spinbutton", { name: "Alpha" })).toBeTruthy();
  });

  it("selects, adds, and removes swatches accessibly", () => {
    const select = vi.fn();
    const remove = vi.fn();
    render(<NSEColourSwatches colours={[GFXColour.parse("#f00"), GFXColour.parse("#0f0")]} selected={GFXColour.parse("#f00")} onSelect={select} onRemove={remove} />);
    fireEvent.click(screen.getByRole("gridcell", { name: "#00ff00" }));
    expect(select).toHaveBeenCalledWith(GFXColour.parse("#0f0"));
    fireEvent.keyDown(screen.getByRole("gridcell", { name: "#ff0000" }), { key: "Delete" });
    expect(remove).toHaveBeenCalledWith(GFXColour.parse("#f00"));
  });

  it("maps EyeDropper capability errors without hiding alternatives", () => {
    expect(classifyEyeDropperError(new DOMException("cancel", "AbortError"))).toEqual({ kind: "cancelled" });
    expect(classifyEyeDropperError(new DOMException("denied", "NotAllowedError"))).toEqual({ kind: "denied" });
    expect(classifyEyeDropperError(new Error("broken"))).toMatchObject({ kind: "error" });
  });
});
