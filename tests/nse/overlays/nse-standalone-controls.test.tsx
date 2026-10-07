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
import React, { StrictMode, useEffect, useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEStandaloneControlHost, NSEPopup, NSEListboxPopup, createStandaloneNSEControlRuntime } from "../../../src/NSE/Overlays";
import { NSEOverlayProvider, useNSEOverlayProvider, type NSEOverlayProviderContextValue } from "../../../src/NSE/Overlays/NSEOverlayProvider";
import { NSEMenu, NSEPicker } from "../../../src/NSE/Menus";
import { NSEFeedbackProvider } from "../../../src/NSE/Feedback";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";

installNSEScrollIntoViewFixture();
afterEach(async () => { cleanup(); await act(async () => {}); vi.restoreAllMocks(); });
const presentation = createStaticPresentationPort({ width: 1024, height: 768 });

function Host({ children }: React.PropsWithChildren) {
  return <NSEStandaloneControlHost document={document} window={window} presentation={presentation}>{children}</NSEStandaloneControlHost>;
}

function Probe({ publish }: { publish(context: NSEOverlayProviderContextValue): void }) {
  const context = useNSEOverlayProvider();
  useEffect(() => publish(context), [context, publish]);
  return null;
}

describe("standalone NSE host lifetime", () => {
  it("keeps nested overlays and their authority across parent rerenders and Strict Mode replay", async () => {
    let authority: NSEOverlayProviderContextValue | undefined;
    const publish = (value: NSEOverlayProviderContextValue) => { authority = value; };
    const fixture = (revision: number) => <StrictMode><Host>
      <output>{revision}</output><Probe publish={publish} />
      <NSEPopup id="outer" defaultOpen title="Outer"><button>Outer action</button>
        <NSEPopup id="inner" parentId="outer" defaultOpen title="Inner"><button>Inner action</button></NSEPopup>
      </NSEPopup>
    </Host></StrictMode>;
    const view = render(fixture(1));
    await waitFor(() => expect(authority?.manager.getSnapshot().orderedIds).toHaveLength(2));
    const manager = authority!.manager, runtime = authority!.runtime;
    view.rerender(fixture(2));
    expect(authority!.manager).toBe(manager);
    expect(authority!.runtime).toBe(runtime);
    expect(runtime.signal.aborted).toBe(false);
    expect(manager.getSnapshot().parentById.get("inner")).toBe("outer");
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    view.unmount();
    await act(async () => {});
    expect(runtime.signal.aborted).toBe(true);
    expect(manager.getSnapshot().orderedIds).toEqual([]);
    expect(document.querySelectorAll("[data-nse-overlay-portal-host]")).toHaveLength(0);
  });

  it("isolates simultaneous hosts even when their overlay ids are identical", async () => {
    const managers: NSEOverlayProviderContextValue[] = [];
    const first = (context: NSEOverlayProviderContextValue) => { managers[0] = context; };
    const second = (context: NSEOverlayProviderContextValue) => { managers[1] = context; };
    render(<>
      <Host><Probe publish={first} /><NSEPopup id="shared" defaultOpen><button>First host action</button></NSEPopup></Host>
      <Host><Probe publish={second} /><NSEPopup id="shared" defaultOpen><button>Second host action</button></NSEPopup></Host>
    </>);
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2));
    expect(managers[0].manager).not.toBe(managers[1].manager);
    expect(managers[0].runtime.runtimeId).not.toBe(managers[1].runtime.runtimeId);
    fireEvent.keyDown(screen.getByRole("button", { name: "First host action" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "First host action" })).toBeNull());
    expect(screen.getByRole("button", { name: "Second host action" })).toBeTruthy();
    expect(managers[1].manager.getSnapshot().orderedIds).toEqual(["shared"]);
  });

  it("releases presentation, viewport, focus listeners and pending work on disposal", async () => {
    const listeners = new Set<() => void>();
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const local = createStandaloneNSEControlRuntime({ document, window, presentation: {
      getSnapshot: presentation.getSnapshot,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    } });
    expect(listeners.size).toBe(0);
    local.start();
    local.start();
    expect(listeners.size).toBe(1);
    const pending = vi.fn();
    const clear = vi.spyOn(window, "clearTimeout");
    const handle = local.runtime.environment.setTimeout(pending, 1000);
    local.dispose();
    local.dispose();
    expect(local.runtime.signal.aborted).toBe(true);
    expect(listeners.size).toBe(0);
    expect(clear).toHaveBeenCalledWith(handle);
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("orientationchange", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("focusin", expect.any(Function), true);
    expect(pending).not.toHaveBeenCalled();
  });

  it("traps a modal scope and restores its trigger on Escape", async () => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      const anchor = useRef<HTMLButtonElement>(null);
      return <Host><button ref={anchor} onClick={() => setOpen(true)}>Open confirmation</button>
        <NSEPopup id="confirmation" open={open} onOpenChange={setOpen} anchor={anchor.current} modal>
          <button>Cancel confirmation</button><button>Confirm action</button>
        </NSEPopup>
      </Host>;
    }
    render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus(); fireEvent.click(trigger);
    const last = await screen.findByRole("button", { name: "Confirm action" });
    last.focus(); fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel confirmation" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("standalone picker and menu keyboard contracts", () => {
  it("retains an open menu branch and focus across an unrelated parent render", async () => {
    const items = [{ value: "file", label: "File", children: [{ value: "save", label: "Save document" }] }];
    const fixture = (revision: number) => <Host><output>{revision}</output><NSEMenu label="Document actions" items={items} /></Host>;
    const view = render(fixture(1));
    fireEvent.click(screen.getByRole("button", { name: "Document actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "File" }));
    const save = await screen.findByRole("menuitem", { name: "Save document" });
    save.focus();
    view.rerender(fixture(2));
    await act(async () => {});
    expect(screen.getByRole("menuitem", { name: "Save document" })).toBe(save);
    expect(document.activeElement).toBe(save);
  });

  it("keeps a menu open when its parent re-renders with inline items and glyph, and lights its trigger while it shows", async () => {
    const Glyph = () => <svg aria-hidden="true" />;
    // Items and label written inline: a new array and element every render.
    const fixture = (revision: number) => (
      <Host>
        <output>{revision}</output>
        <NSEMenu label={<Glyph />} trigger="tool" triggerLabel="Font actions" items={[
          { value: "favourite", label: "Add to Favourites" },
          { value: "divider", label: "", separator: true },
          { value: "ruler", label: "Show Ruler" },
        ]} />
      </Host>
    );
    const view = render(fixture(1));
    const trigger = screen.getByRole("button", { name: "Font actions" });
    expect(trigger.getAttribute("data-pressed")).toBe("false");
    fireEvent.click(trigger);
    const item = await screen.findByRole("menuitem", { name: "Add to Favourites" });
    expect(trigger.getAttribute("data-pressed")).toBe("true");
    view.rerender(fixture(2));
    await act(async () => {});
    expect(screen.getByRole("menuitem", { name: "Add to Favourites" })).toBe(item);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(item, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger.getAttribute("data-pressed")).toBe("false");
  });

  it("mounts a provider's overlays in a container outside its clipped content and still owns their events", async () => {
    function ClippedSurface({ children }: React.PropsWithChildren) {
      const outer = useNSEOverlayProvider();
      const [layer, setLayer] = useState<HTMLDivElement | null>(null);
      return (
        <>
          <div data-testid="clipped" style={{ clipPath: "inset(0)" }}>
            <NSEOverlayProvider runtimePort={outer.runtime} defaultParentResponderId={outer.defaultParentResponderId} portalContainer={layer}>
              {children}
            </NSEOverlayProvider>
          </div>
          <div data-testid="overlay-layer" ref={setLayer} />
          <button type="button">Outside</button>
        </>
      );
    }
    render(<Host><ClippedSurface><NSEMenu label="Actions" items={[{ value: "one", label: "One" }]} /></ClippedSurface></Host>);
    const trigger = screen.getByRole("button", { name: "Actions" });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    expect(screen.getByTestId("overlay-layer").contains(menu)).toBe(true);
    expect(screen.getByTestId("clipped").contains(menu)).toBe(false);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "One" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.click(trigger);
    await screen.findByRole("menu");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }), { button: 0 });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("preserves default trigger and selection feedback through the supplied engine", async () => {
    const trigger = vi.fn(async () => {});
    const engine = { trigger } as NonNullable<React.ComponentProps<typeof NSEFeedbackProvider>["value"]>;
    render(<NSEFeedbackProvider value={engine}><Host>
      <NSEMenu label="Feedback actions" items={[{ value: "save", label: "Save document" }]} />
      <NSEPicker label="Feedback format" options={[{ value: "plain", label: "Plain" }, { value: "rich", label: "Rich" }]} />
    </Host></NSEFeedbackProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Feedback actions" }));
    expect(trigger).toHaveBeenLastCalledWith("soft");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Save document" }));
    await waitFor(() => expect(trigger).toHaveBeenLastCalledWith("selection"));
    fireEvent.click(screen.getByRole("button", { name: "Feedback format Plain" }));
    expect(trigger).toHaveBeenLastCalledWith("soft");
    fireEvent.click(await screen.findByRole("option", { name: "Rich" }));
    expect(trigger).toHaveBeenLastCalledWith("selection");
    expect(trigger).toHaveBeenCalledTimes(4);
  });

  it("clears a listbox type-ahead timer when the branch unmounts while its host remains", async () => {
    let authority: NSEOverlayProviderContextValue | undefined;
    const publish = (value: NSEOverlayProviderContextValue) => { authority = value; };
    const options = [{ id: "alpha", label: "Alpha" }, { id: "beta", label: "Beta" }];
    const fixture = (show: boolean) => <Host><Probe publish={publish} />{show ? <NSEListboxPopup id="typeahead" defaultOpen options={options} /> : <span>Branch removed</span>}</Host>;
    const view = render(fixture(true));
    const alpha = await screen.findByRole("option", { name: "Alpha" });
    await waitFor(() => expect(document.activeElement).toBe(alpha));
    const schedule = vi.spyOn(authority!.runtime.environment, "setTimeout");
    const clear = vi.spyOn(authority!.runtime.environment, "clearTimeout");
    fireEvent.keyDown(alpha, { key: "b" });
    const timerIndex = schedule.mock.calls.findIndex((call) => call[1] === 500);
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    const handle = schedule.mock.results[timerIndex].value;
    view.rerender(fixture(false));
    expect(authority!.runtime.signal.aborted).toBe(false);
    expect(clear).toHaveBeenCalledWith(handle);
  });

  it("names the picker with its label and selection and opens it with ArrowDown", async () => {
    render(<Host><NSEPicker label="Density" value="balanced" options={[{ value: "balanced", label: "Balanced" }, { value: "compact", label: "Compact" }]} /></Host>);
    const trigger = screen.getByRole("button", { name: "Density Balanced" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const selected = await screen.findByRole("option", { name: "Balanced" });
    await waitFor(() => expect(document.activeElement).toBe(selected));
  });

  it("lists a picker's actions after a rule and runs them without changing the value", async () => {
    const onValueChange = vi.fn();
    const showFonts = vi.fn();
    render(<Host><NSEPicker label="Font" value="serif" onValueChange={onValueChange}
      options={[{ value: "serif", label: "Serif" }, { value: "sans", label: "Sans" }]}
      actions={[{ id: "show-fonts", label: "Show Fonts…", onSelect: showFonts }]} /></Host>);
    fireEvent.click(screen.getByRole("button", { name: "Font Serif" }));
    const action = await screen.findByRole("option", { name: "Show Fonts…" });
    expect(action.getAttribute("data-kind")).toBe("action");
    expect(action.getAttribute("aria-selected")).toBe("false");
    expect(action.previousElementSibling?.getAttribute("role")).toBe("separator");
    fireEvent.click(action);
    expect(showFonts).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Font Serif" })).toBeTruthy();
  });

  it("opens an item menu with ArrowDown and skips disabled entries", async () => {
    render(<Host><NSEMenu label="Actions" items={[{ value: "first", label: "First" }, { value: "off", label: "Disabled", disabled: true }, { value: "last", label: "Last" }]} /></Host>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "ArrowDown" });
    const first = await screen.findByRole("menuitem", { name: "First" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Last" }));
  });
});

describe("virtualised standalone listbox focus", () => {
  const options = Array.from({ length: 250 }, (_, index) => ({ id: String(index), label: `Entry ${index}`, value: index }));
  it("scrolls an offscreen selected row into the virtual window before focusing it", async () => {
    render(<Host><NSEListboxPopup id="large" defaultOpen options={options} selectedId="199" /></Host>);
    const selected = await screen.findByRole("option", { name: "Entry 199" });
    await waitFor(() => expect(document.activeElement).toBe(selected));
    expect(screen.getAllByRole("option").length).toBeLessThan(30);
    expect(selected.getAttribute("aria-posinset")).toBe("200");
    expect(selected.getAttribute("aria-setsize")).toBe("250");
  });

  it("retains keyboard focus after End moves beyond the rendered rows", async () => {
    render(<Host><NSEListboxPopup id="large" defaultOpen options={options} selectedId="0" /></Host>);
    const first = await screen.findByRole("option", { name: "Entry 0" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.keyDown(first, { key: "End" });
    const last = await screen.findByRole("option", { name: "Entry 249" });
    await waitFor(() => expect(document.activeElement).toBe(last));
    expect(within(screen.getByRole("listbox")).getAllByRole("option").length).toBeLessThan(30);
  });
});
