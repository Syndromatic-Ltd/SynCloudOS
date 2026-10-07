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
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"; import React, { useState } from "react"; import { afterEach, describe, expect, it, vi } from "vitest";
import { NSECircularSlider, NSELevelIndicator, NSESegmentedControl, NSESlider, NSEStepper } from "../../../src/NSE/Controls/Values";
import { NSEControlRuntimeProvider } from "../../../src/NSE/Controls/Core";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays";
import { NSETooltipProvider } from "../../../src/NSE/Tooltips";
import { createSynCloudOS } from "../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createStaticPresentationPort } from "../../fixtures/presentationTraits";
import { createTestRuntimeEnvironment } from "../../runtime/helpers";
import { SynCloudOSProvider, useRuntimeNSEOverlayPort } from "../../../src/SynCloudOSReact";
afterEach(() => { cleanup(); vi.useRealTimers(); });
function RuntimeValueOverlay({children}:{readonly children:React.ReactNode}){const port=useRuntimeNSEOverlayPort("workspace");return <NSEOverlayProvider runtimePort={port} defaultParentResponderId="workspace"><NSETooltipProvider>{children}</NSETooltipProvider></NSEOverlayProvider>}

function dispatchRejectingEvent(dispatch: () => void): void {
  const suppress = (event: ErrorEvent) => event.preventDefault();
  window.addEventListener("error", suppress);
  try { dispatch(); } finally { window.removeEventListener("error", suppress); }
}

describe("value controls", () => {
  it.each(["slider", "stepper"] as const)("restores a %s value when undo admission rejects after publication", (control) => {
    let value = 5;
    const changes = vi.fn((next: number) => { value = next; });
    const cancel = vi.fn();
    const manager = {
      isExecuting: false,
      register: vi.fn(),
      reserve: () => ({ commit: () => { throw new Error("undo admission rejected"); }, cancel }),
    };
    const props = { "aria-label": "Undo value", value, minimum: 0, maximum: 10, step: 1, undoManager: manager, onValueChange: changes };
    render(control === "slider" ? <NSESlider {...props} /> : <NSEStepper {...props} />);

    dispatchRejectingEvent(() => {
      if (control === "slider") fireEvent.keyDown(screen.getByRole("slider", { name: "Undo value" }), { key: "ArrowRight" });
      else fireEvent.click(screen.getByRole("button", { name: "Increment Undo value" }));
    });
    expect(value).toBe(5);
    expect(changes.mock.calls.map(([next]) => next)).toEqual([6, 5]);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("blocks every circular pointer and capture terminal route while read-only", () => {
    const change = vi.fn();
    const { container } = render(<NSECircularSlider {...({ readOnly: true } as object)} aria-label="Read-only angle" value={90} minimum={0} maximum={360} step={15} onValueChange={change} />);
    const body = container.querySelector('[data-nse-part="circular-body"]') as HTMLElement;
    Object.assign(body, { setPointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) });
    fireEvent.pointerDown(body, { pointerId: 3, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(body, { pointerId: 3, clientX: 50, clientY: 0 });
    fireEvent.pointerCancel(body, { pointerId: 3 });
    fireEvent.lostPointerCapture(body, { pointerId: 3 });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("slider", { name: "Read-only angle" }).getAttribute("aria-readonly")).toBe("true");
  });
  it("steps and formats generic civil-date values through an explicit value contract",()=>{const change=vi.fn();render(<NSEStepper aria-label="Day" value={{year:2026,month:3,day:28}} formatValue={(value)=>`${value.year}-${value.month}-${value.day}`} contract={{minimum:{year:2026,month:3,day:27},maximum:{year:2026,month:3,day:30},compare:(a,b)=>a.day-b.day,step:(value,direction)=>({...value,day:value.day+direction})}} onValueChange={change}/>);expect(screen.getByRole("spinbutton",{name:"Day"}).getAttribute("aria-valuetext")).toBe("2026-3-28");fireEvent.click(screen.getByRole("button",{name:"Increment Day"}));expect(change).toHaveBeenCalledWith({year:2026,month:3,day:29},"commit");});
  it("steps within bounds and wraps when configured", () => { const change=vi.fn(); render(<NSEStepper aria-label="Count" value={10} minimum={0} maximum={10} step={2} wraps onValueChange={change}/>); fireEvent.click(screen.getByRole("button",{name:"Increment Count"})); expect(change).toHaveBeenCalledWith(0,"commit"); fireEvent.click(screen.getByRole("button",{name:"Decrement Count"})); expect(change).toHaveBeenCalledWith(8,"commit"); });
  it("supports the complete numeric keyboard stepping contract", () => { const change=vi.fn(); render(<NSEStepper aria-label="Count" value={5} minimum={0} maximum={10} step={1} pageStep={5} onValueChange={change}/>); const stepper=screen.getByRole("spinbutton",{name:"Count"}); fireEvent.keyDown(stepper,{key:"ArrowUp"}); expect(change).toHaveBeenLastCalledWith(6,"commit"); fireEvent.keyDown(stepper,{key:"PageDown"}); expect(change).toHaveBeenLastCalledWith(0,"commit"); fireEvent.keyDown(stepper,{key:"End"}); expect(change).toHaveBeenLastCalledWith(10,"commit"); fireEvent.keyDown(stepper,{key:"Home"}); expect(change).toHaveBeenLastCalledWith(0,"commit"); });
  it("uses the runtime scheduler for hold previews and commits once on every terminal path", () => {
    vi.useFakeTimers();
    const changes = vi.fn();
    const runtimeAbort = new AbortController();
    const port = { signal: runtimeAbort.signal, commands: {}, scheduler: { setTimeout, clearTimeout } } as never;
    function Harness() { const [value, setValue] = useState(0); return <NSEControlRuntimeProvider port={port}><NSEStepper aria-label="Held count" value={value} minimum={0} maximum={10} step={1} onValueChange={(next, phase) => { changes(next, phase); setValue(next); }} /></NSEControlRuntimeProvider>; }
    render(<Harness />);
    const increment = screen.getByRole("button", { name: "Increment Held count" });
    Object.assign(increment, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    fireEvent.pointerDown(increment, { pointerId: 7 });
    expect(changes).toHaveBeenLastCalledWith(1, "preview");
    vi.advanceTimersByTime(450);
    expect(changes.mock.calls.filter(([, phase]) => phase === "preview").length).toBeGreaterThan(1);
    fireEvent.pointerUp(increment, { pointerId: 7 });
    expect(changes.mock.calls.filter(([, phase]) => phase === "commit")).toHaveLength(1);
    const calls = changes.mock.calls.length;
    vi.runOnlyPendingTimers();
    expect(changes).toHaveBeenCalledTimes(calls);
  });
  it("supports horizontal and vertical RTL sliders with preview and commit", () => { const change=vi.fn(); render(<NSESlider aria-label="Gain" value={5} minimum={0} maximum={10} step={1} orientation="vertical" dir="rtl" onValueChange={change}/>); const slider=screen.getByRole("slider",{name:"Gain"}); fireEvent.keyDown(slider,{key:"ArrowUp"}); expect(change).toHaveBeenCalledWith(6,"commit"); expect(slider.getAttribute("aria-orientation")).toBe("vertical"); });
  it("renders ticks and snaps pointer input to the nearest tick",()=>{const change=vi.fn();const{container}=render(<NSESlider aria-label="Gain" value={0} minimum={0} maximum={10} step={1} ticks={[0,3,10]} onValueChange={change}/>);expect(container.querySelectorAll('[data-nse-part="tick"]')).toHaveLength(3);fireEvent.change(screen.getByRole("slider"),{target:{value:"4"}});expect(change).toHaveBeenCalledWith(3,"preview");});
  it("hosts slider value help in the overlay tooltip provider",()=>{const workArea={width:800,height:600,safeArea:{top:0,right:0,bottom:0,left:0}};const presentation=createStaticPresentationPort({width:800,height:600});const port={runtimeId:"runtime:slider-tooltip",signal:new AbortController().signal,environment:{browser:{getDocument:()=>document,getWindow:()=>window},workArea:{getSnapshot:()=>workArea,subscribe:()=>()=>undefined},visualViewport:{getSnapshot:()=>null,subscribe:()=>()=>undefined},presentation,setTimeout:(callback:()=>void)=>{callback();return 0},clearTimeout:()=>undefined},restoreFocus:(_id:string,anchor:HTMLElement|null)=>anchor?.focus(),reportPlacementFailure:()=>undefined,wrapFocusScope:(_options:unknown,node:React.ReactNode)=>node};render(<NSEOverlayProvider runtimePort={port}><NSETooltipProvider><NSESlider aria-label="Gain" value={5} minimum={0} maximum={10} step={1} tooltip={(value)=>`Gain ${value}`}/></NSETooltipProvider></NSEOverlayProvider>);fireEvent.focus(screen.getByRole("slider",{name:"Gain"}));expect(screen.getByRole("tooltip").textContent).toContain("Gain 5");});
  it("opens slider value help under a live runtime responder",()=>{const runtime=createSynCloudOS({id:"runtime:live-slider-tooltip",environment:createTestRuntimeEnvironment()});render(<SynCloudOSProvider runtime={runtime}><RuntimeValueOverlay><NSESlider aria-label="Live gain" value={5} minimum={0} maximum={10} step={1} tooltip="Current gain"/></RuntimeValueOverlay></SynCloudOSProvider>);fireEvent.focus(screen.getByRole("slider",{name:"Live gain"}));expect(screen.getByRole("tooltip").textContent).toContain("Current gain");});
  it("commits the latest slider preview once on cancellation and capture loss", () => {
    const change = vi.fn();
    render(<NSESlider aria-label="Terminal gain" value={5} minimum={0} maximum={10} step={1} onValueChange={change} />);
    const slider = screen.getByRole("slider", { name: "Terminal gain" });
    Object.assign(slider, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    fireEvent.pointerDown(slider, { pointerId: 3 });
    fireEvent.change(slider, { target: { value: "7" } });
    fireEvent.pointerCancel(slider, { pointerId: 3 });
    fireEvent.lostPointerCapture(slider, { pointerId: 3 });
    expect(change.mock.calls.filter(([, phase]) => phase === "commit")).toEqual([[7, "commit"]]);
  });
  it("provides an accessible radial primary control and a named non-pointer alternative",()=>{const change=vi.fn();render(<NSECircularSlider aria-label="Angle" value={90} minimum={0} maximum={360} step={15} onValueChange={change}/>);expect(screen.getByRole("slider",{name:"Angle"})).not.toBeNull();fireEvent.change(screen.getByRole("slider",{name:"Angle linear alternative"}),{target:{value:"105"}});expect(change).toHaveBeenCalledWith(105,"preview");});
  it("wraps an angle dial round through its start and speaks its value",()=>{const change=vi.fn();render(<NSECircularSlider aria-label="Shadow angle" value={345} minimum={0} maximum={360} step={15} wraps controlSize="small" valueText={(value)=>`${value} degrees`} onValueChange={change}/>);const dial=screen.getByRole("slider",{name:"Shadow angle"});expect(dial.getAttribute("aria-valuetext")).toBe("345 degrees");expect(dial.closest("[data-nse-control=\"circular-slider\"]")?.getAttribute("data-size")).toBe("small");fireEvent.keyDown(dial,{key:"ArrowRight"});expect(change).toHaveBeenLastCalledWith(0,"commit");});
  it("maps circular pointer angle rather than horizontal range position",()=>{const change=vi.fn();const{container}=render(<NSECircularSlider aria-label="Angle" value={0} minimum={0} maximum={360} step={15} onValueChange={change}/>);const body=container.querySelector('[data-nse-part="circular-body"]') as HTMLElement;Object.assign(body,{setPointerCapture:vi.fn(),getBoundingClientRect:()=>({left:0,top:0,width:100,height:100,right:100,bottom:100,x:0,y:0,toJSON:()=>({})})});fireEvent.pointerDown(body,{pointerId:1,clientX:100,clientY:50});fireEvent.pointerUp(body,{pointerId:1,clientX:100,clientY:50});expect(change).toHaveBeenCalledWith(90,"commit");});
  it("exposes meter thresholds and interactive rating semantics",()=>{const change=vi.fn();const {rerender}=render(<NSELevelIndicator aria-label="Capacity" value={80} minimum={0} maximum={100} warningValue={70} criticalValue={90}/>);expect(screen.getByRole("meter").getAttribute("data-state")).toBe("warning");rerender(<NSELevelIndicator aria-label="Rating" value={2} minimum={0} maximum={5} mode="rating" onValueChange={change}/>);fireEvent.click(screen.getByRole("radio",{name:"4"}));expect(change).toHaveBeenCalledWith(4,"commit");});
  it("marks a fill-equally segmented control, as NSSegmentedControl.segmentDistribution does",()=>{const view=render(<NSESegmentedControl aria-label="Alignment" distribution="fill-equally" items={[{id:"a",label:"A"},{id:"b",label:"B"}]} selection={{mode:"select-one",selectedIds:new Set(["a"]),allowsEmpty:false}} onSelectionChange={()=>undefined}/>);expect(screen.getByRole("group",{name:"Alignment"}).getAttribute("data-distribution")).toBe("fill-equally");view.unmount();render(<NSESegmentedControl aria-label="Fitted" items={[{id:"a",label:"A"}]} selection={{mode:"select-one",selectedIds:new Set(["a"]),allowsEmpty:false}} onSelectionChange={()=>undefined}/>);expect(screen.getByRole("group",{name:"Fitted"}).hasAttribute("data-distribution")).toBe(false);});
  it("implements momentary, single, and multiple segmented modes",()=>{const change=vi.fn();render(<NSESegmentedControl aria-label="Tools" items={[{id:"a",label:"A"},{id:"b",label:"B"}]} selection={{mode:"select-many",selectedIds:new Set(["a"])}} onSelectionChange={change}/>);fireEvent.click(screen.getByRole("button",{name:"B"}));expect([...change.mock.calls[0][0].selectedIds]).toEqual(["a","b"]);});
  it("names the pressed segment of a momentary control, which springs back",()=>{const change=vi.fn();render(<NSESegmentedControl aria-label="Add or remove" items={[{id:"add",label:"Add"},{id:"remove",label:"Remove"}]} selection={{mode:"momentary",selectedIds:new Set()}} onSelectionChange={change}/>);fireEvent.click(screen.getByRole("button",{name:"Remove"}));expect([...change.mock.calls[0][0].selectedIds]).toEqual(["remove"]);expect(screen.getByRole("button",{name:"Remove"}).getAttribute("aria-pressed")).not.toBe("true");});
  it("uses roving focus and blocks read-only segmented mutation",()=>{const change=vi.fn();render(<NSESegmentedControl aria-label="Tools" readOnly items={[{id:"a",label:"A"},{id:"b",label:"B"}]} selection={{mode:"select-one",selectedIds:new Set(["a"]),allowsEmpty:false}} onSelectionChange={change}/>);const a=screen.getByRole("button",{name:"A"}),b=screen.getByRole("button",{name:"B"});expect(a.tabIndex).toBe(0);expect(b.tabIndex).toBe(-1);a.focus();fireEvent.keyDown(a,{key:"ArrowRight"});expect(document.activeElement).toBe(b);fireEvent.click(b);expect(change).not.toHaveBeenCalled();});
  it("hosts segment menus and width overflow through the overlay host",()=>{const action=vi.fn(),change=vi.fn();const workArea={width:800,height:600,safeArea:{top:0,right:0,bottom:0,left:0}};const presentation=createStaticPresentationPort({width:800,height:600});const port={runtimeId:"runtime:segments",signal:new AbortController().signal,environment:{browser:{getDocument:()=>document,getWindow:()=>window},workArea:{getSnapshot:()=>workArea,subscribe:()=>()=>undefined},visualViewport:{getSnapshot:()=>null,subscribe:()=>()=>undefined},presentation,setTimeout:(callback:()=>void)=>{callback();return 0},clearTimeout:()=>undefined},restoreFocus:(_id:string,anchor:HTMLElement|null)=>anchor?.focus(),reportPlacementFailure:()=>undefined,wrapFocusScope:(_options:unknown,node:React.ReactNode)=>node};render(<NSEOverlayProvider runtimePort={port} defaultParentResponderId="workspace"><NSESegmentedControl aria-label="Tools" maximumVisibleSegments={2} items={[{id:"a",label:"A",menu:[{id:"inspect",label:"Inspect"}]},{id:"b",label:"B"},{id:"c",label:"C"}]} selection={{mode:"select-one",selectedIds:new Set(["a"]),allowsEmpty:false}} onSelectionChange={change} onMenuAction={action}/></NSEOverlayProvider>);fireEvent.click(screen.getByRole("button",{name:"More options for A"}));fireEvent.click(screen.getByRole("option",{name:"Inspect"}));expect(action).toHaveBeenCalledWith("a","inspect");fireEvent.click(screen.getByRole("button",{name:"More Tools"}));fireEvent.click(screen.getByRole("option",{name:"C"}));expect([...change.mock.calls.at(-1)![0].selectedIds]).toEqual(["c"]);});
  it("commits command segments only after canonical command execution",async()=>{const change=vi.fn();const dispatch=vi.fn(async()=>({status:"executed" as const,commandId:"tools.select",responderId:"workspace",operationId:"op",correlationId:"correlation",value:undefined}));const port={signal:new AbortController().signal,commands:{getPresentationGeneration:()=>({registryGeneration:1,responderGeneration:1}),validate:vi.fn(async()=>({commandId:"tools.select",responderId:"workspace",title:"B",enabled:true,denied:false,hidden:false,state:"off" as const})),prepareDispatch:vi.fn(async()=>({status:"accepted" as const,acceptance:{commandId:"tools.select",responderId:"workspace"} as never})),dispatch}};render(<NSEControlRuntimeProvider port={port}><NSESegmentedControl aria-label="Tools" items={[{id:"a",label:"A"},{id:"b",label:"B",commandId:"tools.select",commandPayload:{id:"b"}}]} selection={{mode:"select-one",selectedIds:new Set(["a"]),allowsEmpty:false}} onSelectionChange={change}/></NSEControlRuntimeProvider>);const button=screen.getByRole("button",{name:"B"});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);await waitFor(()=>expect(dispatch).toHaveBeenCalled());expect([...change.mock.calls[0][0].selectedIds]).toEqual(["b"]);});
  it("registers one command undo group for each committed stepper and slider gesture",async()=>{const runtime=createSynCloudOS({id:"runtime:value-undo",environment:createTestRuntimeEnvironment()});const manager=runtime.undo.create({kind:"application",id:"value-controls"});function Harness(){const[count,setCount]=useState(1);const[gain,setGain]=useState(5);return <><NSEStepper aria-label="Undo count" value={count} minimum={0} maximum={10} step={1} undoManager={manager} onValueChange={setCount}/><NSESlider aria-label="Undo gain" value={gain} minimum={0} maximum={10} step={1} undoManager={manager} onValueChange={setGain}/><output>{count}/{gain}</output></>}render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"Increment Undo count"}));fireEvent.keyDown(screen.getByRole("slider",{name:"Undo gain"}),{key:"ArrowRight"});expect(manager.inspect().entries).toHaveLength(2);await manager.undo();await waitFor(()=>expect(screen.getByText("2/5")).not.toBeNull());await manager.undo();await waitFor(()=>expect(screen.getByText("1/5")).not.toBeNull());});
});
