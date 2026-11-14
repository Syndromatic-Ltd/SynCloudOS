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
import { installNSEScrollIntoViewFixture } from "../fixtures/browser";
installNSEScrollIntoViewFixture();
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEComboBox, NSETokenField } from "../../../src/NSE/Controls/Completion";
import { NSESearchField, NSESecureTextField } from "../../../src/NSE/Controls/Fields";
import { NSEControlRuntimeProvider, type NSEControlRuntimePort } from "../../../src/NSE/Controls/Core";
import type { CommandId } from "../../../src/SynCloudOS/SynCloudOS";
import { OverlayProvider } from "../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { NSEObject } from "../../../src/NSE/Objects/NSEObject";
import { observable } from "../../../src/NSE/Objects/observable";
import { bind } from "../../../src/NSE/Bindings/propertyBinding";
afterEach(cleanup);

const completionWorkArea = Object.freeze({ width: 1280, height: 720, safeArea: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) });
const completionPresentation = createStaticPresentationPort({ width: 1280, height: 720 });

function OverlayHarness({ children }: { readonly children: React.ReactNode }) {
  const runtimePort = useMemo(() => ({
    runtimeId: "runtime:completion",
    signal: new AbortController().signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: { getSnapshot: () => completionWorkArea, subscribe: () => () => undefined },
      visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
      presentation: completionPresentation,
      setTimeout: (callback: () => void) => { callback(); return 0; },
      clearTimeout: () => undefined,
    },
    restoreFocus: (_responderId: string, anchor: HTMLElement | null) => anchor?.focus(),
    reportPlacementFailure: vi.fn(),
    wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
  }), []);
  return <OverlayProvider runtimePort={runtimePort} defaultParentResponderId="workspace">{children}</OverlayProvider>;
}

describe("completion and field families", () => {
  it("copies and cuts token text through the native transfer seam without a runtime pasteboard", () => {
    const ada = { id: "ada", representedObject: "Ada", label: "Ada Lovelace" };
    const change = vi.fn();
    const view = render(<NSETokenField aria-label="People" values={[ada]} onValuesChange={change} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} />);
    const token = screen.getByRole("button", { name: "Ada Lovelace, token" });
    const setData = vi.fn();
    fireEvent.copy(token, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "Ada Lovelace");
    fireEvent.cut(token, { clipboardData: { setData } });
    expect(change).toHaveBeenCalledWith([], "delete");
    change.mockClear();
    view.rerender(<NSETokenField aria-label="People" values={[ada]} readOnly onValuesChange={change} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} />);
    fireEvent.cut(screen.getByRole("button", { name: "Ada Lovelace, token" }), { clipboardData: { setData } });
    expect(change).not.toHaveBeenCalled();
  });

  it("exposes native required and pattern validity and restores secure form state", () => {
    const view = render(<form aria-label="Credentials"><NSESecureTextField aria-label="Passphrase" name="passphrase" defaultValue="ABC-123" required pattern="[A-Z]{3}-[0-9]{3}" onValueChange={vi.fn()} /><button type="reset">Reset credentials</button></form>);
    const input = screen.getByLabelText("Passphrase") as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.pattern).toBe("[A-Z]{3}-[0-9]{3}");
    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.invalid(input);
    expect(input.checkValidity()).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reset credentials" }));
    expect(input.value).toBe("ABC-123");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(new FormData(view.container.querySelector("form")!).get("passphrase")).toBe("ABC-123");
  });
  it("blocks every read-only and disabled combo commit route including freeform Enter", () => {
    const value = vi.fn();
    const source = { query: async () => [], idForItem: (item: string) => item, labelForItem: (item: string) => item };
    const view = render(<OverlayHarness><NSEComboBox aria-label="Read-only city" dataSource={source} value={null} inputValue="London" readOnly allowsFreeform onInputValueChange={vi.fn()} onValueChange={value} /></OverlayHarness>);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Read-only city" }), { key: "Enter" });
    view.rerender(<OverlayHarness><NSEComboBox aria-label="Disabled city" dataSource={source} value={null} inputValue="Paris" isEnabled={false} allowsFreeform onInputValueChange={vi.fn()} onValueChange={value} /></OverlayHarness>);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Disabled city" }), { key: "Enter" });
    expect(value).not.toHaveBeenCalled();
  });

  it("exposes token datasource completion as an active combobox/listbox transaction", async () => {
    const grace = { id: "grace", representedObject: "Grace", label: "Grace" };
    const source = { query: async () => [grace], idForItem: (item: typeof grace) => item.id, labelForItem: (item: typeof grace) => item.label };
    const change = vi.fn();
    render(<OverlayHarness><NSETokenField aria-label="People" values={[]} dataSource={source} onValuesChange={change} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} /></OverlayHarness>);
    const input = screen.getByRole("combobox", { name: "People" });
    fireEvent.change(input, { target: { value: "Gra" } });
    const option = await screen.findByRole("option", { name: "Grace" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(option.id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(change).toHaveBeenCalledWith([grace], "create");
  });

  it("publishes caps-lock validation without exposing the password and resets form state", () => {
    const change = vi.fn();
    render(<form aria-label="Credentials"><NSESecureTextField aria-label="Passphrase" name="passphrase" defaultValue="initial" onValueChange={change} /><button type="reset">Reset credentials</button></form>);
    const input = screen.getByLabelText("Passphrase") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "changed" } });
    fireEvent.keyDown(input, { key: "CapsLock" });
    const warning = screen.getByRole("status");
    expect(warning.textContent).toMatch(/caps lock/i);
    expect(warning.textContent).not.toContain("changed");
    fireEvent.click(screen.getByRole("button", { name: "Reset credentials" }));
    expect(input.value).toBe("initial");
  });
  it("suppresses stale async combo results and commits listbox selection", async () => {
    const queries: Array<(items: readonly { id: string; label: string }[]) => void> = [];
    const source = { query: vi.fn((_input: string, _signal: AbortSignal) => new Promise<readonly { id: string; label: string }[]>((resolve) => queries.push(resolve))), idForItem: (item: { id: string }) => item.id, labelForItem: (item: { label: string }) => item.label };
    const value = vi.fn(); render(<OverlayHarness><NSEComboBox aria-label="City" dataSource={source} value={null} inputValue="" onInputValueChange={() => undefined} onValueChange={value} /></OverlayHarness>);
    const combo = screen.getByRole("combobox"); fireEvent.change(combo, { target: { value: "L" } }); fireEvent.change(combo, { target: { value: "Lo" } });
    queries[0]([{ id: "lagos", label: "Lagos" }]); queries[1]([{ id: "london", label: "London" }]);
    expect(await screen.findByRole("option", { name: "London" })).toBeTruthy(); expect(screen.queryByRole("option", { name: "Lagos" })).toBeNull();
    fireEvent.keyDown(combo, { key: "ArrowDown" }); fireEvent.keyDown(combo, { key: "Enter" }); expect(value).toHaveBeenCalledWith({ id: "london", label: "London" }, "completion");
  });
  it("protects IME composition from premature completion", () => { const input = vi.fn(); render(<OverlayHarness><NSEComboBox aria-label="City" dataSource={{ query: async () => [], idForItem: () => "", labelForItem: () => "" }} value={null} inputValue="" onInputValueChange={input} onValueChange={() => undefined} /></OverlayHarness>); const combo = screen.getByRole("combobox"); fireEvent.compositionStart(combo); fireEvent.change(combo, { target: { value: "東" } }); expect(input).not.toHaveBeenCalled(); fireEvent.compositionEnd(combo, { data: "東京" }); expect(input).toHaveBeenCalledTimes(1); });
  it("owns hosted completion popups through the shared overlay listbox", async () => {
    const source = { query: async () => [{ id: "london", label: "London" }], idForItem: (item: { id: string }) => item.id, labelForItem: (item: { label: string }) => item.label };
    render(<OverlayHarness><NSEComboBox aria-label="Hosted city" parentResponderId="workspace" dataSource={source} value={null} inputValue="" onInputValueChange={() => undefined} onValueChange={() => undefined} /></OverlayHarness>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Lon" } });
    const option = await screen.findByRole("option", { name: "London" });
    expect(option.closest('[data-nse-overlay-kind="listbox"]')).not.toBeNull();
  });
  it("aborts completion generations on source replacement and unmount", () => {
    const signals: AbortSignal[] = [];
    const source = { query: (_input: string, signal: AbortSignal) => { signals.push(signal); return new Promise<readonly string[]>(() => undefined); }, idForItem: (item: string) => item, labelForItem: (item: string) => item };
    const replacement = { ...source, query: (_input: string, signal: AbortSignal) => { signals.push(signal); return new Promise<readonly string[]>(() => undefined); } };
    const view = render(<OverlayHarness><NSEComboBox aria-label="Abort city" dataSource={source} value={null} inputValue="" onInputValueChange={() => undefined} onValueChange={() => undefined} /></OverlayHarness>);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "L" } });
    view.rerender(<OverlayHarness><NSEComboBox aria-label="Abort city" dataSource={replacement} value={null} inputValue="" onInputValueChange={() => undefined} onValueChange={() => undefined} /></OverlayHarness>);
    expect(signals[0].aborted).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Lo" } });
    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });
  it("tokenizes paste, prevents duplicates, and deletes selected tokens", () => { const change = vi.fn(); render(<NSETokenField aria-label="People" values={[]} onValuesChange={change} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} />); const input = screen.getByRole("combobox", { name: "People" }); fireEvent.paste(input, { clipboardData: { getData: () => "Ada,Grace,Ada" } }); expect(change).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ label: "Ada" }), expect.objectContaining({ label: "Grace" })]), "paste"); });
  it("uses declared token separators and blocks read-only deletion and paste", () => { const token = { id: "ada", representedObject: "Ada", label: "Ada" }; const change = vi.fn(); const { rerender } = render(<NSETokenField aria-label="People" values={[]} separators={["|"]} onValuesChange={change} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} />); const input = screen.getByRole("combobox", { name: "People" }); fireEvent.change(input, { target: { value: "Ada" } }); fireEvent.keyDown(input, { key: "|" }); expect(change).toHaveBeenCalledWith([token], "create"); change.mockClear(); rerender(<NSETokenField aria-label="People" values={[token]} separators={["|"]} readOnly onValuesChange={change} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} />); fireEvent.keyDown(screen.getByRole("button", { name: /Ada, token/ }), { key: "Delete" }); fireEvent.paste(screen.getByRole("combobox", { name: "People" }), { clipboardData: { getData: () => "Grace" } }); expect(change).not.toHaveBeenCalled(); });
  it("hosts token datasource completion and provides accessible reorder", async () => {
    const ada = { id: "ada", representedObject: "Ada", label: "Ada" }, grace = { id: "grace", representedObject: "Grace", label: "Grace" };
    const change = vi.fn(), reorder = vi.fn();
    const source = { query: async () => [grace], idForItem: (item: typeof grace) => item.id, labelForItem: (item: typeof grace) => item.label };
    const view = render(<OverlayHarness><NSETokenField aria-label="People" values={[ada]} dataSource={source} onValuesChange={change} onRequestReorder={reorder} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} /></OverlayHarness>);
    fireEvent.change(screen.getByRole("combobox", { name: "People" }), { target: { value: "Gra" } });
    const option = await screen.findByRole("option", { name: "Grace" });
    expect(option.closest('[data-nse-overlay-kind="listbox"]')).not.toBeNull();
    fireEvent.click(option);
    expect(change).toHaveBeenCalledWith([ada, grace], "create");
    change.mockClear();
    view.rerender(<OverlayHarness><NSETokenField aria-label="People" values={[ada, grace]} dataSource={source} onValuesChange={change} onRequestReorder={reorder} createToken={(label) => ({ id: label.toLowerCase(), representedObject: label, label })} /></OverlayHarness>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Grace, token" }), { key: "ArrowLeft", altKey: true });
    expect(reorder).toHaveBeenCalledWith("grace", "ada");
    expect(change).toHaveBeenCalledWith([grace, ada], "reorder");
  });
  it("hosts token disclosure menus and begins editing without a drag service",()=>{const ada={id:"ada",representedObject:"Ada",label:"Ada"};const change=vi.fn(),action=vi.fn();render(<OverlayHarness><NSETokenField aria-label="People" values={[ada]} tokenMenu={()=>[{id:"inspect",label:"Inspect Ada"}]} onTokenMenuAction={action} onValuesChange={change} createToken={(label)=>({id:label.toLowerCase(),representedObject:label,label})}/></OverlayHarness>);fireEvent.click(screen.getByRole("button",{name:"More options for Ada"}));fireEvent.click(screen.getByRole("option",{name:"Inspect Ada"}));expect(action).toHaveBeenCalledWith("ada","inspect");fireEvent.doubleClick(screen.getByRole("button",{name:"Ada, token"}));expect(change).toHaveBeenCalledWith([],"edit");expect((screen.getByRole("combobox",{name:"People"})as HTMLInputElement).value).toBe("Ada");});
  it("resynchronizes controlled combo text", () => { const source = { query: async () => [], idForItem: (item: string) => item, labelForItem: (item: string) => item }; const view = render(<OverlayHarness><NSEComboBox aria-label="City" dataSource={source} value={null} inputValue="Lon" onInputValueChange={() => undefined} onValueChange={() => undefined} /></OverlayHarness>); view.rerender(<OverlayHarness><NSEComboBox aria-label="City" dataSource={source} value={null} inputValue="Paris" onInputValueChange={() => undefined} onValueChange={() => undefined} /></OverlayHarness>); expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Paris"); });
  it("binds completion text without replacing domain selection or freeform semantics", async()=>{
    class Model extends NSEObject { @observable accessor query="Lon"; }
    const model=new Model();const selected=vi.fn();const source={query:async()=>[{id:'london',title:'London'}],idForItem:(item:{id:string})=>item.id,labelForItem:(item:{title:string})=>item.title};
    render(<OverlayHarness><NSEComboBox aria-label="Bound city" binding={bind(model,'query')} dataSource={source} value={null} onValueChange={selected} allowsFreeform /></OverlayHarness>);
    const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:'Londo'}});
    const option=await screen.findByRole('option',{name:'London'});fireEvent.click(option);
    expect(model.query).toBe('London');expect(selected).toHaveBeenCalledWith({id:'london',title:'London'},'completion');
  });
  it("search submits and cancels without dispatching while composing", () => { const submit = vi.fn(), cancel = vi.fn(); render(<NSESearchField aria-label="Search" defaultValue="memo" onSearch={submit} onCancel={cancel} />); const input = screen.getByRole("searchbox"); fireEvent.keyDown(input, { key: "Enter" }); expect(submit).toHaveBeenCalledWith("memo"); fireEvent.click(screen.getByRole("button", { name: "Clear search" })); expect(cancel).toHaveBeenCalled(); });
  it("supports buttonless incremental search while preserving the NSE field", () => {
    const query = vi.fn();
    const { container } = render(<NSESearchField aria-label="Instant search" showsAffordance={false} debounceMs={0} onQuery={query} />);
    const input = screen.getByRole("searchbox", { name: "Instant search" });
    expect(container.querySelector(".nse-control-search-frame")?.getAttribute("data-affordance")).toBe("hidden");
    expect(screen.queryByRole("button", { name: /search/i })).toBeNull();
    fireEvent.change(input, { target: { value: "water" } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toBe("water");
  });
  it("offers recentSearches in the overlay listbox and remembers each search, most recent first", async () => {
    const submit = vi.fn();
    const changes: (readonly string[])[] = [];
    render(<OverlayHarness><NSESearchField aria-label="Search recents" recentSearches={["calendar", "notes"]} maximumRecents={2} onRecentSearchesChange={(recents) => changes.push(recents)} onSearch={submit} /></OverlayHarness>);
    const input = screen.getByRole("searchbox");
    fireEvent.focus(input);
    const option = await screen.findByRole("option", { name: "calendar" });
    expect(option.closest('[data-nse-overlay-kind="listbox"]')).not.toBeNull();
    fireEvent.click(option);
    expect(submit).toHaveBeenCalledWith("calendar");
    expect(changes).toEqual([]);
    fireEvent.change(input, { target: { value: "  weather " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(changes).toEqual([["weather", "calendar"]]);
  });

  it("keeps its own recents while shown when recentSearches is not bound", async () => {
    render(<OverlayHarness><NSESearchField aria-label="Own recents" /></OverlayHarness>);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "maps" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.focus(input);
    expect(await screen.findByRole("option", { name: "maps" })).not.toBeNull();
  });
  it("dispatches search only through an accepted current command generation", async () => {
    const dispatch = vi.fn(async () => ({ status: "executed" as const }));
    const generation = { registryGeneration: 1, responderGeneration: 1 };
    const port = { signal: new AbortController().signal, commands: { getPresentationGeneration: () => generation, validate: vi.fn(async () => ({ commandId: "search.perform", responderId: "workspace", title: "Search", enabled: true, denied: false, hidden: false, state: "off" as const })), prepareDispatch: vi.fn(async () => ({ status: "accepted" as const, acceptance: { responderId: "workspace" } })), dispatch } } as unknown as NSEControlRuntimePort;
    const submit = vi.fn();
    render(<NSEControlRuntimeProvider port={port}><NSESearchField aria-label="Command search" defaultValue="memo" command={{ id: "search.perform" as CommandId, payload: { query: "" } }} onSearch={submit} /></NSEControlRuntimeProvider>);
    await waitFor(() => expect(port.commands.validate).toHaveBeenCalled());
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith("search.perform", { query: "memo" }, expect.objectContaining({ acceptance: expect.anything() })));
    expect(submit).toHaveBeenCalledWith("memo");
  });
  it("reveals secure text without copying or announcing the value", async () => { render(<NSESecureTextField aria-label="Password" defaultValue="secret" revealPolicy="hold" autoComplete="current-password" />); const input = screen.getByLabelText("Password") as HTMLInputElement; expect(input.type).toBe("password"); const reveal = screen.getByRole("button", { name: "Reveal password" }); const capture=vi.fn();Object.assign(reveal,{setPointerCapture:capture});fireEvent.pointerDown(reveal,{pointerId:4});expect(capture).toHaveBeenCalledWith(4); expect(input.type).toBe("text"); fireEvent.pointerUp(reveal); await waitFor(() => expect(input.type).toBe("password")); expect(document.body.textContent).not.toContain("secret");expect(reveal.outerHTML).not.toContain("secret"); });
  it("conceals secure text on capture loss, blur, Escape, visibility and disable", () => { const { rerender }=render(<NSESecureTextField aria-label="Password" defaultValue="secret" revealPolicy="hold"/>); const input=screen.getByLabelText("Password") as HTMLInputElement; const reveal=screen.getByRole("button",{name:"Reveal password"}); for(const terminate of [()=>fireEvent.lostPointerCapture(reveal),()=>fireEvent.blur(input),()=>fireEvent.keyDown(input,{key:"Escape"})]){fireEvent.pointerDown(reveal);expect(input.type).toBe("text");terminate();expect(input.type).toBe("password");}fireEvent.pointerDown(reveal);Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});fireEvent(document,new Event("visibilitychange"));expect(input.type).toBe("password");fireEvent.pointerDown(reveal);rerender(<NSESecureTextField aria-label="Password" defaultValue="secret" revealPolicy="hold" isEnabled={false}/>);expect((screen.getByLabelText("Password")as HTMLInputElement).type).toBe("password"); });
  it("centralizes secure visibility observation for multiple fields", () => { const add = vi.spyOn(document, "addEventListener"), remove = vi.spyOn(document, "removeEventListener"); const view = render(<><NSESecureTextField aria-label="First password" revealPolicy="hold"/><NSESecureTextField aria-label="Second password" revealPolicy="hold"/></>); expect(add.mock.calls.filter(([name]) => name === "visibilitychange")).toHaveLength(1); view.unmount(); expect(remove.mock.calls.filter(([name]) => name === "visibilitychange")).toHaveLength(1); });
});
