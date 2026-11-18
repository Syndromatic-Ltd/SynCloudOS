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

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot } from "react-dom/client";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
import { MetalSurface } from "../../src/NSE/Material/MetalSurface";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSESwitch, NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSESlider } from "../../src/NSE/Controls/Values/NSESlider";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";
import { ToolbarView } from "../../src/NSE/Toolbars/ToolbarView";
import { NSEOutlineView } from "../../src/NSE/DataViews/Outline/NSEOutlineView";
import { NSETreeController } from "../../src/NSE/Controllers/NSETreeController";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import baseRef from "./BASE?raw";
import { elementFamilies, labSections } from "./sections";
import "../../src/NSE/public/styles.css";
import "../../src/SynCloudOS/styles/runtime.css";
import "./lab.css";

// The lab's own chrome is NSE from the working tree, so it is a live specimen as well.
type Mode = "split" | "swipe" | "modified";
type Width = "fill" | "tablet" | "phone";
interface LabState {
  section: string; scheme: "light" | "dark"; backdrop: "metal" | "window";
  mode: Mode; width: Width; measure: boolean; surface: string;
}
const widths: Record<Width, number | null> = { fill: null, tablet: 820, phone: 390 };
const base = baseRef.trim();

function readState(): LabState {
  const p = new URLSearchParams(location.search);
  return {
    section: labSections.some(section => section.id === p.get("section")) ? p.get("section")! : "switches",
    scheme: p.get("scheme") === "dark" ? "dark" : "light",
    backdrop: p.get("backdrop") === "window" ? "window" : "metal",
    mode: (["split", "swipe", "modified"] as const).find(mode => mode === p.get("mode")) ?? "split",
    width: (["fill", "tablet", "phone"] as const).find(width => width === p.get("width")) ?? "fill",
    measure: p.get("measure") !== "0",
    surface: p.get("surface") ?? "",
  };
}

function frameUrl(side: "current" | "modified", state: LabState) {
  const p = new URLSearchParams({ side, section: state.section, scheme: state.scheme, backdrop: state.backdrop, measure: state.measure ? "1" : "0" });
  if (state.surface) p.set("surface", state.surface);
  const path = side === "current" ? `/.artifacts/atmo-lab/baseline-${base}/tests/atmo-lab/frame.html` : "/tests/atmo-lab/frame.html";
  return `${path}?${p}`;
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return <NSESegmentedControl aria-label={label} segmentStyle="texturedRounded" controlSize="small"
    items={options.map(([id, title]) => ({ id, label: title }))}
    selection={{ mode: "select-one", selectedIds: new Set([value]), allowsEmpty: false }}
    onSelectionChange={selection => { const next = [...selection.selectedIds][0]; if (next) onChange(next as T); }} />;
}

// Sections grouped the way a source list would group them.
interface NavNode { readonly id: string; readonly label: string; readonly children: readonly NavNode[] }
const navGroups: readonly NavNode[] = [
  { id: "group-theme", label: "Theme fixes", children: ["switches", "knob", "outline", "menus", "partial-app-theme"].map(id => ({ id, label: labSections.find(section => section.id === id)!.title, children: [] })) },
  { id: "group-metrics", label: "Metrics", children: ["sizing", "bars"].map(id => ({ id, label: labSections.find(section => section.id === id)!.title, children: [] })) },
  { id: "group-elements", label: "Every element", children: elementFamilies.map(family => ({ id: family.id, label: family.title, children: [] })) },
  { id: "group-reference", label: "Reference", children: [{ id: "catalogue", label: "Catalogue", children: [] }] },
];
const navGroupIds = new Set(navGroups.map(group => group.id));

function Sidebar({ section, onSelect }: { section: string; onSelect: (id: string) => void }) {
  const [controller] = useState(() => {
    const tree = new NSETreeController<NavNode, string>({ owner: nseUnowned, id: "atmo-lab-nav", content: navGroups, getId: item => item.id, getChildren: item => item.children,
      withChildren: (item, children) => ({ ...item, children }), selection: { mode: "single", allowsEmpty: false } });
    navGroups.forEach(group => tree.expand(group.id));
    tree.select([section]);
    return tree;
  });
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { controller.select([section]); }, [controller, section]);
  return <NSEOutlineView aria-label="Lab sections" controller={controller} idForItem={item => item.id} childrenForItem={item => item.children} labelForItem={item => item.label}
    selectionHighlightStyle="sourceList" viewportBlockSize="fill" delegate={{ isGroupItem: id => navGroupIds.has(id) }}
    onSelectionChange={event => { const id = [...event.snapshot.selectedIds][0]; if (id && !navGroupIds.has(id)) onSelect(id); }} />;
}

function Lab() {
  const [state, setState] = useState(readState);
  const [reloadKey, setReloadKey] = useState(0);
  const [catalogue, setCatalogue] = useState<readonly string[]>([]);
  const [degrees, setDegrees] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [swipe, setSwipe] = useState(50);
  const current = useRef<HTMLIFrameElement>(null);
  const modified = useRef<HTMLIFrameElement>(null);
  const update = useCallback((patch: Partial<LabState>) => setState(previous => ({ ...previous, ...patch })), []);

  useEffect(() => {
    const p = new URLSearchParams({ section: state.section, scheme: state.scheme, backdrop: state.backdrop, mode: state.mode, width: state.width, measure: state.measure ? "1" : "0" });
    if (state.surface) p.set("surface", state.surface);
    history.replaceState(null, "", `?${p}`);
    document.documentElement.dataset.appearance = state.scheme;
    document.documentElement.style.colorScheme = state.scheme;
  }, [state]);

  // Both sides hear the same knob angle.
  const sendAngle = useCallback((value: number) => {
    for (const frame of [current.current, modified.current]) frame?.contentWindow?.postMessage({ type: "atmo-lab:angle", angle: (value * Math.PI) / 180 }, location.origin);
  }, []);
  useEffect(() => { sendAngle(degrees); }, [degrees, sendAngle]);
  useEffect(() => {
    if (!spinning) return;
    let frame = 0; let last = performance.now();
    const tick = (now: number) => { setDegrees(value => (value + (now - last) * 0.09) % 360); last = now; frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spinning]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type !== "atmo-lab:ready") return;
      if (Array.isArray(event.data.catalogue)) setCatalogue(event.data.catalogue);
      sendAngle(degrees);
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [degrees, sendAngle]);

  // Scrolling one side scrolls the other, so the same specimen stays opposite itself.
  const syncing = useRef(false);
  const attachScroll = useCallback(() => {
    const pair = [current.current, modified.current];
    pair.forEach((frame, index) => {
      const win = frame?.contentWindow as (Window & { __labSynced?: boolean }) | null | undefined;
      if (!win || win.__labSynced) return;
      win.__labSynced = true;
      win.addEventListener("scroll", () => {
        if (syncing.current) { syncing.current = false; return; }
        const other = pair[1 - index]?.contentWindow;
        if (!other) return;
        syncing.current = true;
        other.scrollTo(win.scrollX, win.scrollY);
      }, { passive: true });
    });
  }, []);

  const currentUrl = useMemo(() => frameUrl("current", state), [state]);
  const modifiedUrl = useMemo(() => frameUrl("modified", state), [state]);
  const width = widths[state.width];
  const sectionInfo = labSections.find(section => section.id === state.section);
  const surfaceIndex = catalogue.indexOf(state.surface);
  const stepSurface = (delta: number) => { if (catalogue.length) update({ surface: catalogue[(Math.max(0, surfaceIndex) + delta + catalogue.length) % catalogue.length]! }); };

  const dragSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = event.currentTarget.parentElement!;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      setSwipe(Math.min(100, Math.max(0, ((moveEvent.clientX - box.left) / box.width) * 100)));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", () => target.removeEventListener("pointermove", move), { once: true });
  };

  const frame = (side: "current" | "modified") => (
    <iframe key={`${side}-${reloadKey}`} ref={side === "current" ? current : modified} title={side === "current" ? "Current Atmo" : "Modified Atmo"}
      src={side === "current" ? currentUrl : modifiedUrl} onLoad={attachScroll} style={width ? { width } : undefined} />
  );

  return <div className="lab">
    {/* As in an app, the title sits in the bar row and the source list runs the full column beneath it. */}
    <MetalSurface mode={state.scheme} className="lab-head"><h1>Atmo Lab</h1><p>Baseline {base}</p></MetalSurface>
    <MetalSurface mode={state.scheme} className="lab-nav">
      <Sidebar section={state.section} onSelect={section => update({ section })} />
    </MetalSurface>
    <div className="lab-bar">
      <ToolbarView composition="children" position="top">
        <Choice label="Appearance" value={state.scheme} onChange={scheme => update({ scheme })} options={[["light", "Light"], ["dark", "Dark"]]} />
        <Choice label="Backdrop" value={state.backdrop} onChange={backdrop => update({ backdrop })} options={[["metal", "Metal"], ["window", "Window"]]} />
        <Choice label="Compare" value={state.mode} onChange={mode => update({ mode })} options={[["split", "Side by side"], ["swipe", "Swipe"], ["modified", "Modified"]]} />
        <Choice label="Width" value={state.width} onChange={width => update({ width })} options={[["fill", "Fill"], ["tablet", "Tablet"], ["phone", "Phone"]]} />
        <NSEButton title="Reload" bezelStyle="texturedRounded" controlSize="small" onClick={() => setReloadKey(key => key + 1)} />
      </ToolbarView>
    </div>
    <div className="lab-main">
      <div className="lab-brief">
        <p>{sectionInfo?.brief}</p>
        <label className="lab-labelled">Measure <NSESwitch aria-label="Measure" onLabel="On" offLabel="Off" state={state.measure ? "on" : "off"} onStateChange={value => update({ measure: value === "on" })} /></label>
        {state.section === "knob" || state.section === "switches" ? <>
          <label className="lab-labelled lab-angle">Light <NSESlider aria-label="Light angle" thumbMaterial="metal" controlSize="small" minimum={0} maximum={360} value={Math.round(degrees)}
            onValueChange={value => { setSpinning(false); setDegrees(value); }} /><output>{Math.round(degrees)}°</output></label>
          <label className="lab-labelled">Spin <NSESwitch aria-label="Spin" thumbMaterial="metal" state={spinning ? "on" : "off"} onStateChange={value => setSpinning(value === "on")} /></label>
        </> : null}
        {state.section === "catalogue" ? (
          <div className="lab-catalogue-picker">
            <NSEButton title="‹" bezelStyle="texturedRounded" controlSize="small" aria-label="Previous surface" onClick={() => stepSurface(-1)} />
            <NSETextField aria-label="Surface" placeholder="Surface name…" controlSize="small" defaultValue={state.surface} key={state.surface} list="lab-surfaces"
              onKeyDown={event => { if (event.key === "Enter") update({ surface: event.currentTarget.value.trim() }); }} />
            <datalist id="lab-surfaces">{catalogue.map(id => <option key={id} value={id} />)}</datalist>
            <NSEButton title="›" bezelStyle="texturedRounded" controlSize="small" aria-label="Next surface" onClick={() => stepSurface(1)} />
            <span>{catalogue.length ? `${Math.max(0, surfaceIndex) + 1} of ${catalogue.length}` : ""}</span>
          </div>
        ) : null}
      </div>
      {state.mode === "split" ? (
        <div className="lab-stage" data-mode="split">
          <div className="lab-pane"><div className="lab-pane-label">Current</div>{frame("current")}</div>
          <div className="lab-pane"><div className="lab-pane-label" data-modified>Modified</div>{frame("modified")}</div>
        </div>
      ) : state.mode === "swipe" ? (
        <div className="lab-stage" data-mode="swipe">
          <div className="lab-pane"><div className="lab-pane-label">Current ◂ ▸ <span data-modified>Modified</span></div>
            <div className="lab-swipe" style={width ? { width } : undefined}>
              {frame("current")}
              <div className="lab-swipe-top" style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}>{frame("modified")}</div>
              <div className="lab-swipe-handle" style={{ left: `${swipe}%` }} onPointerDown={dragSwipe} role="slider" aria-label="Swipe position" aria-valuenow={Math.round(swipe)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
                onKeyDown={event => { if (event.key === "ArrowLeft") setSwipe(value => Math.max(0, value - 2)); if (event.key === "ArrowRight") setSwipe(value => Math.min(100, value + 2)); }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="lab-stage" data-mode="modified">
          <div className="lab-pane"><div className="lab-pane-label" data-modified>Modified</div>{frame("modified")}</div>
        </div>
      )}
    </div>
  </div>;
}

function Root() {
  const [scheme, setScheme] = useState(readState().scheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(document.documentElement.dataset.appearance === "dark" ? "dark" : "light"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
    return () => observer.disconnect();
  }, []);
  const presentation = useMemo(() => createStaticPresentationPort({ width: innerWidth, height: innerHeight, primaryPointer: "fine", hover: true }), []);
  return <NSEAppearanceProvider theme={atmoTheme} colourScheme={scheme}>
    <StandaloneControlHost document={document} window={window} presentation={presentation}><Lab /></StandaloneControlHost>
  </NSEAppearanceProvider>;
}

createRoot(document.getElementById("root")!).render(<Root />);
