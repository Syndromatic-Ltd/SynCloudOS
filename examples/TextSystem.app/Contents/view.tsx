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

import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { NSETextInputClient, NSETextInputHost, invertNSETextGeometryTransform, projectNSETextGeometryPoint, type NSETextInputHostHandle } from "@syndromatic/syncloudos/nse/text";
import { TFXGlyphDrawing } from "@syndromatic/syncloudos/fx/text";
import { examplePolicy } from "./layout";
import type { ExampleViewId } from "./model";
import type { TextSystemExample, ExampleFontTarget, ExampleObjectTarget } from "./example";
import "./style.css";

export interface TextSystemExampleViewProps {
  readonly example: TextSystemExample;
  readonly onInputClient?: (view: ExampleViewId, client: NSETextInputClient | null) => void;
}
function CustomSurface({ example, view, label, onInputClient }: TextSystemExampleViewProps & { readonly view: ExampleViewId; readonly label: string }) {
  const state = useSyncExternalStore(example.subscribe, example.getSnapshot, example.getSnapshot);
  const root = useRef<HTMLDivElement>(null), host = useRef<NSETextInputHostHandle>(null);
  const [client, setClient] = useState<NSETextInputClient | null>(null);
  const dragAnchor = useRef<number | null>(null);
  const objectDrag = useRef<{ target: ExampleObjectTarget; origin: { x: number; y: number }; object: { x: number; y: number } } | null>(null);
  const surfaceLifetime = useRef<AbortController | null>(null);
  const [gestureError, setGestureError] = useState("");
  useEffect(() => {
    const lifetime = new AbortController(); surfaceLifetime.current = lifetime;
    return () => { lifetime.abort(); objectDrag.current = null; };
  }, [example, view]);
  useEffect(() => {
    const input = new NSETextInputClient({
      session: example.sessions[view],
      geometry: () => example.layoutFor(view)?.provider ?? null,
      transforms: () => example.transformsFor(view),
    });
    setClient(input); onInputClient?.(view, input);
    return () => { onInputClient?.(view, null); input.dispose(); };
  }, [example, view, onInputClient]);
  useLayoutEffect(() => {
    const resolve: Parameters<TextSystemExample["setPresentation"]>[1] = space => {
      const index = Number(space.name.replace("container:", ""));
      const svg = root.current?.querySelector<SVGSVGElement>(`svg[data-container-index="${index}"]`);
      if (!svg) return null;
      const box = svg.getBoundingClientRect();
      return { clientOffset: { x: box.x, y: box.y }, screenOffset: { x: window.screenX, y: window.screenY }, devicePixelRatio: window.devicePixelRatio };
    };
    const update = () => example.setPresentation(view, resolve);
    update(); window.addEventListener("scroll", update, true); window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); example.setPresentation(view, null); };
  }, [example, view]);
  const layout = example.layoutFor(view), session = example.sessions[view].getSnapshot();
  const selection = layout?.provider.selection({ ...layout.provider.snapshot(), ...session.selection.range }) ?? [];
  const caret = layout?.provider.caret({ ...layout.provider.snapshot(), offset: session.selection.focus, affinity: session.selection.affinity });
  const indices = layout ? [...new Set(layout.frames.map(frame => Number(frame.containerId.split(":")[1])))].sort((a, b) => a - b) : [0];
  const hit = (event: PointerEvent<HTMLDivElement>, nearest: boolean) => {
    const svg = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGSVGElement>("svg[data-container-index]");
    if (svg && !root.current?.contains(svg)) return null;
    if (!svg || !layout?.provider.snapshot().current) return null;
    const space = { name: `container:${svg.dataset.containerIndex}`, units: "css-pixels" as const };
    const transform = example.transformsFor(view, space).client;
    if (!transform) return null;
    const inverse = invertNSETextGeometryTransform(transform);
    if (!inverse) return null;
    const local = projectNSETextGeometryPoint({ x: event.clientX, y: event.clientY, space: transform.to, transformRevision: transform.revision }, inverse);
    return local && layout.provider.positionAt({ ...layout.provider.snapshot(), ...local, transformRevision: 0, outside: nearest ? "nearest" : "reject" });
  };
  const image = example.resources.image;
  const imageURL = image ? `data:image/png;base64,${btoa(String.fromCharCode(...image.toPNG()))}` : undefined;
  const objectPoint = (event: PointerEvent<SVGImageElement>) => {
    const transform = example.transformsFor(view, { name: "container:0", units: "css-pixels" }).client;
    const inverse = transform && invertNSETextGeometryTransform(transform);
    return transform && inverse ? projectNSETextGeometryPoint({ x: event.clientX, y: event.clientY, space: transform.to, transformRevision: transform.revision }, inverse) : null;
  };
  const cancelObjectDrag = () => { if (objectDrag.current) example.cancelObjectMove(objectDrag.current.target); objectDrag.current = null; };
  return <div className="text-pane" ref={root} onFocusCapture={event => { if ((event.target as Element).tagName === "TEXTAREA") example.activate(view); }} onKeyDown={event => {
    if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing || !objectDrag.current) return;
    event.preventDefault(); event.stopPropagation(); cancelObjectDrag();
  }} data-testid={view === "bodyMirror" ? "body-mirror-surface" : `${view}-surface`}>
    <div className="pane-label"><h2>{label}</h2><button type="button" onClick={() => { example.activate(view); host.current?.focus(); }}>Edit {label.toLowerCase()}</button></div>
    <div className="shaped-boxes" onPointerDown={event => {
      const position = hit(event, false);
      if (!position) return;
      event.preventDefault(); dragAnchor.current = event.shiftKey ? session.selection.anchor : position.offset;
      example.select(view, dragAnchor.current, position.offset); host.current?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (dragAnchor.current === null || !event.buttons) return;
      const position = hit(event, true); if (position) example.select(view, dragAnchor.current, position.offset);
    }} onPointerUp={() => { dragAnchor.current = null; }} onPointerCancel={() => { dragAnchor.current = null; }}>
      {indices.map(index => <svg key={index} aria-hidden="true" data-container-index={index} viewBox={`0 0 ${examplePolicy.boxWidth} ${view === "caption" ? examplePolicy.captionHeight : examplePolicy.boxHeight}`} width={examplePolicy.boxWidth * state.zoom} height={(view === "caption" ? examplePolicy.captionHeight : examplePolicy.boxHeight) * state.zoom}>
        <rect width="100%" height="100%" fill="#ffffff" />
        {selection.filter(item => item.containerId === `container:${index}`).map((item, i) => <rect key={`selection-${i}`} {...item.rect} fill="#228474" opacity=".24" />)}
        {view !== "caption" && index === 0 && imageURL && <image data-testid={`${view}-object`} href={imageURL} x={state.object.x} y={state.object.y} width={state.object.width} height={state.object.height} style={{ cursor: "move", touchAction: "none" }}
          onPointerDown={event => {
            event.stopPropagation(); event.preventDefault();
            const origin = objectPoint(event); if (!origin || !surfaceLifetime.current) return;
            try {
              const target = example.beginObjectMove({ signal: surfaceLifetime.current.signal, isCurrent: () => !!root.current?.isConnected });
              objectDrag.current = { target, origin, object: state.object }; setGestureError(""); host.current?.focus(); event.currentTarget.setPointerCapture(event.pointerId);
            } catch (failure) { setGestureError(String(failure)); }
          }} onPointerMove={event => {
            event.stopPropagation(); const drag = objectDrag.current, point = objectPoint(event); if (!drag || !point) return;
            try { example.previewObjectMove(drag.target, { x: drag.object.x + point.x - drag.origin.x, y: drag.object.y + point.y - drag.origin.y }); }
            catch (failure) { cancelObjectDrag(); setGestureError(String(failure)); }
          }} onPointerUp={event => {
            event.stopPropagation(); const drag = objectDrag.current; objectDrag.current = null;
            try { if (drag) example.commitObjectMove(drag.target); } catch (failure) { if (drag) example.cancelObjectMove(drag.target); setGestureError(String(failure)); }
          }} onPointerCancel={event => { event.stopPropagation(); cancelObjectDrag(); }} onLostPointerCapture={cancelObjectDrag} />}
        {view !== "caption" && index === 0 && state.objectPreview && <rect data-testid={`${view}-object-preview`} x={state.objectPreview.x} y={state.objectPreview.y} width={state.objectPreview.width} height={state.objectPreview.height} fill="#228474" fillOpacity=".15" stroke="#146957" strokeDasharray="4 3" pointerEvents="none" />}
        {layout?.frames.filter(frame => frame.containerId === `container:${index}`).flatMap(frame => frame.frame.lines.flatMap(line => TFXGlyphDrawing.drawingsForLine(line.line, line.origin))).map((drawing, i) => "path" in drawing ? <path key={i} d={drawing.path.toSVGPathData()} fill="#142b28" /> : null)}
        {state.activeView === view && caret?.containerId === `container:${index}` && session.selection.range.length === 0 && <rect {...caret.primary.rect} width={1} fill="#146957" />}
      </svg>)}
    </div>
    {client && <NSETextInputHost ref={host} client={client} label={label} className="native-text-host" onInputError={failure => { root.current?.setAttribute("data-input-error", String(failure)); }} />}
    <p className="pane-footnote">{layout?.complete ? `${indices.length} explicit ${indices.length === 1 ? "box" : "boxes"}` : "Waiting for complete geometry"} · independent selection</p>
    {gestureError && <p role="status">{gestureError}</p>}
  </div>;
}
export function TextSystemExampleView({ example, onInputClient }: TextSystemExampleViewProps) {
  const state = useSyncExternalStore(example.subscribe, example.getSnapshot, example.getSnapshot);
  const [size, setSize] = useState("22"), [status, setStatus] = useState(""), [pdfStatus, setPDFStatus] = useState("No output captured");
  const target = useRef<ExampleFontTarget | null>(null);
  const objectTarget = useRef<ExampleObjectTarget | null>(null);
  const run = async (operation: () => unknown | Promise<unknown>) => { try { await operation(); setStatus(""); } catch (failure) { setStatus(String(failure)); } };
  const inspectorValue = state.fontSizeState.state === "uniform" ? `${state.fontSizeState.value}px` : state.fontSizeState.state;
  return <main className="text-system-example" data-testid="example-ready" data-geometry-ready={state.geometryReady}>
    <header><p className="eyebrow">Text System · framework example</p><h1>A small engine, two flows</h1><p>Compose around an object. Edit one body from two views. Keep the caption independent.</p></header>
    <section className="example-toolbar" aria-label="Text controls">
      <div className="size-control"><label htmlFor="example-font-size">Font size <span data-testid="font-size-state">{inspectorValue}</span></label>
        <input id="example-font-size" data-testid="font-size-input" type="number" min="1" max="48" value={size} onFocus={() => { target.current = example.captureFontTarget(); }} onChange={event => setSize(event.target.value)} />
        <button data-testid="font-size-apply" type="button" onClick={() => void run(() => example.applyFontSize(Number(size), target.current ?? undefined))}>Apply</button>
      </div>
      <button data-testid="undo" disabled={!state.history.canUndo} onClick={() => void run(example.undo)}>Undo</button>
      <button data-testid="redo" disabled={!state.history.canRedo} onClick={() => void run(example.redo)}>Redo</button>
      <button data-testid="object-preview" onClick={() => void run(() => {
        objectTarget.current = example.beginObjectMove(); example.previewObjectMove(objectTarget.current, { x: state.object.x >= 166 ? 142 : 166, y: 16 });
      })}>Preview object move</button>
      <button data-testid="object-commit" disabled={!state.objectPreview} onClick={() => void run(() => { if (objectTarget.current) example.commitObjectMove(objectTarget.current); })}>Commit move</button>
      <button data-testid="object-cancel" disabled={!state.objectPreview} onClick={() => { example.cancelObjectMove(); objectTarget.current = null; }}>Cancel move</button>
      {state.canSaveNative && <><button data-testid="image-insert" onClick={() => void run(example.insertImage)}>Store image asset</button><button data-testid="native-save" onClick={() => void run(async () => { const saved = await example.saveNative(); setPDFStatus(`Native memory version ${saved.currentVersion?.sequence}`); })}>Save native</button></>}
      <label className="zoom-control">Zoom <input data-testid="zoom-input" type="range" min=".5" max="2" step=".1" value={state.zoom} onChange={event => example.setZoom(Number(event.target.value))} /><output>{Math.round(state.zoom * 100)}%</output></label>
      <button data-testid="pdf-export" onClick={() => void run(async () => {
        setPDFStatus("Preparing captured document…");
        const prepared = await example.preparePDF();
        if (prepared.status !== "prepared") { setPDFStatus(prepared.status); return; }
        const result = await prepared.output.exportPDF();
        if (result.status !== "exported") { setPDFStatus(result.status); return; }
        const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: result.mimeType }));
        const link = document.createElement("a"); link.href = url; link.download = "TextSystem-example.pdf"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        setPDFStatus(`PDF revision ${result.receipt.revision} · ${result.bytes.length} bytes`);
      })}>Export snapshot PDF</button>
    </section>
    <p className="readiness" role="status">{state.error ?? (status || (state.geometryReady ? "Fonts and object ready. Geometry matches the document." : "Resolving fonts and geometry…"))}</p>
    <div className="example-workspace">
      <section><CustomSurface example={example} view="body" label="Body" onInputClient={onInputClient} /><CustomSurface example={example} view="caption" label="Caption" onInputClient={onInputClient} /></section>
      <section><CustomSurface example={example} view="bodyMirror" label="Body mirror" onInputClient={onInputClient} /><aside><h2>Private example policy</h2><p>Two columns per page, up to sixteen pages. Only the first box excludes the object. Overflow remains editable and prevents incomplete PDF output.</p><p>Both body views share text. Their selections are independent. Every edit uses the document's transaction and history.</p></aside></section>
    </div>
    <footer><span>Document revision <output data-testid="document-revision">{state.revision}</output></span><span data-testid="pdf-status" role="status">{pdfStatus}</span></footer>
    <output data-testid="body-text" hidden aria-hidden="true">{state.bodyText}</output><output data-testid="caption-text" hidden aria-hidden="true">{state.captionText}</output>
  </main>;
}
