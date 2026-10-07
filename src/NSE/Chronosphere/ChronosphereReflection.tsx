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

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AFXTransform3D } from "../../FX/AnimationFX/AFXTransform3D";
import type { AFXRenderer } from "../../FX/AnimationFX/AFXRenderer";
import { GFXColour } from "../../FX/GraphicsFX/GFXColour";
import type { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import { IFXContext } from "../../FX/ImageFX/IFXContext";
import { IFXFilterRegistry } from "../../FX/ImageFX/IFXFilterRegistry";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { snapshotNSEView } from "../Graphics/snapshotNSEView";
import { useChronosphereEnvironment } from "./chronosphereEnvironment";
import type { RuntimeImageSource } from "../../SynCloudOS/SynCloudOS";
import { observeEffectFrames } from "./Vortex/effectFrames";

interface ChronosphereReflectionProps {
  readonly currentElement?: HTMLElement | null;
  readonly selectedElement?: HTMLElement | null;
  /** Capture only after travel settles; null follows retained geometry without capturing. */
  readonly settledKey: string | number | null;
  readonly active?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
}

interface ReflectionSource {
  readonly element: HTMLElement;
  readonly image: GFXImage;
  readonly entering?: number;
  readonly leaving?: number;
}

// SnapDOM cannot cancel an in-flight host capture. Queue replacements, including
// replacements from another mounted reflection, until the preceding job settles.
let captureTail: Promise<void> = Promise.resolve();

/** Internal floor decoration. Stage owns selection, settling and document layout. */
export function ChronosphereReflection({ currentElement, selectedElement, settledKey, active = true, className = "", style }: ChronosphereReflectionProps) {
  const { images } = useChronosphereEnvironment();
  const { layers, frames } = useNSEAnimationEnvironment();
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const startEdge = useRef<HTMLSpanElement>(null);
  const endEdge = useRef<HTMLSpanElement>(null);
  const retained = useRef<readonly ReflectionSource[]>([]);
  const cache = useRef(new Map<HTMLElement, ReflectionSource>());
  const travelling = useRef(false);
  const sceneRef = useRef<{ renderer: AFXRenderer; signal: AbortSignal; draw(force?: boolean): void;
    replace(sources: ReflectionSource[]): void; wake(): void; fail(error: unknown): void } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [failure, setFailure] = useState<string>();

  useLayoutEffect(() => {
    const host = wrapper.current, target = canvas.current;
    if (!active || !host || !target || !layers) return;
    const controller = new AbortController();
    const context = new IFXContext("srgb", 4096);
    let renderer: AFXRenderer | undefined;
    let observer: ResizeObserver | undefined;
    let animation: ReturnType<typeof observeEffectFrames> | undefined;
    let fade: GFXImage | undefined;
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      controller.abort(); observer?.disconnect(); animation?.dispose(); context.dispose();
      sceneRef.current = null; retained.current = []; cache.current.clear(); renderer?.dispose();
    };
    const fail = (error: unknown) => {
      cleanup(); setFailure(error instanceof Error ? error.message : String(error)); setStatus("unavailable");
    };
    try {
      const scene = layers.createRenderer(target, { maximumQuads: 6, onRenderError: fail }, controller.signal);
      renderer = scene;
      const slots = Array.from({ length: 3 }, () => {
        const replica = scene.makeReplicatorLayer();
        replica.instanceCount = 2;
        replica.projectionMode = "projective";
        replica.instanceTransform = AFXTransform3D.scale(1, -1, 1);
        replica.instanceColour = GFXColour.rgba(0.78, 0.84, 0.9, 1);
        const document = scene.makeLayer(replica), mask = scene.makeLayer(null);
        document.contentsGravity = "resize";
        mask.contentsGravity = "resize";
        replica.hidden = true;
        return { replica, document, mask };
      });
      let lastGeometry: number[] = [], lastSources = retained.current, lastFade = fade;
      let viewport = "";
      const progress = (start: number | undefined) => start === undefined || !frames || frames.reducedMotion
        ? 1 : Math.min(1, Math.max(0, (frames.now() - start) / 180));
      const draw = (force = false) => {
        if (scene.disposed || controller.signal.aborted) return;
        const floor = host.getBoundingClientRect();
        const width = Math.max(1, host.clientWidth || Math.round(floor.width));
        const height = Math.max(1, host.clientHeight || 54);
        // The shelf may be tilted by its parent. Its projected bounding box is
        // not the canvas's local coordinate space. Measure the contact edge to
        // place each reflection directly below the document's screen footprint.
        const edgeStart = startEdge.current?.getBoundingClientRect().left ?? floor.left;
        const edgeEnd = endEdge.current?.getBoundingClientRect().left ?? edgeStart + width;
        const scaleX = edgeEnd > edgeStart ? (edgeEnd - edgeStart) / width : 1;
        if (retained.current.some(source => source.leaving !== undefined && progress(source.leaving) === 1))
          retained.current = retained.current.filter(source => source.leaving === undefined || progress(source.leaving) < 1);
        const samples = retained.current.map(source => {
          const bounds = source.element.isConnected ? source.element.getBoundingClientRect() : null;
          const opacity = source.element.style.opacity === "" ? 1 : Number(source.element.style.opacity);
          return { bounds, opacity: opacity * progress(source.entering) * (source.leaving === undefined ? 1 : 1 - progress(source.leaving)) };
        });
        const pixelRatio = Math.min(2, host.ownerDocument.defaultView?.devicePixelRatio || 1);
        const geometry = [width, height, pixelRatio, edgeStart, scaleX, ...samples.flatMap(({ bounds, opacity }) =>
          [bounds?.left ?? 0, bounds?.width ?? 0, bounds?.height ?? 0, opacity])];
        if (!force && lastSources === retained.current && lastFade === fade && geometry.length === lastGeometry.length &&
          geometry.every((value, index) => value === lastGeometry[index])) return;
        lastGeometry = geometry; lastSources = retained.current; lastFade = fade;
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]!, source = retained.current[i];
          const bounds = samples[i]?.bounds;
          slot.replica.hidden = !fade || !source || !bounds || bounds.width <= 0 || bounds.height <= 0;
          if (slot.replica.hidden || !source || !bounds || !fade) continue;
          slot.replica.opacity = samples[i]!.opacity;
          slot.replica.frame = { x: 0, y: 0, width, height };
          // The first instance sits above the clipped floor. Its mirrored copy
          // starts exactly at the floor's top, with the document's foot nearest it.
          const reflectionWidth = bounds.width / scaleX;
          slot.document.frame = { x: (bounds.left - edgeStart) / scaleX, y: -height, width: reflectionWidth, height };
          slot.document.contentsRect = { x: 0, y: 0, width: 1, height: 1 };
          slot.document.contents = source.image;
          slot.mask.frame = { x: 0, y: 0, width: reflectionWidth, height };
          slot.mask.contents = fade;
          slot.document.setMask(slot.mask);
        }
        const nextViewport = `${width}:${height}:${pixelRatio}`;
        if (viewport !== nextViewport) { viewport = nextViewport; scene.setViewport({ width, height, pixelRatio }); }
        else scene.render();
      };
      const replace = (sources: ReflectionSource[]) => {
        const previous = retained.current;
        const now = frames?.now();
        const next = sources.map(source => previous.find(old => old.element === source.element && old.leaving === undefined)
          ?? { ...source, entering: previous.length ? now : undefined });
        const outgoing = previous.find(source => source.leaving === undefined && !sources.some(next => next.element === source.element))
          ?? previous.find(source => !sources.some(next => next.element === source.element));
        retained.current = outgoing && frames && !frames.reducedMotion
          ? [...next, { ...outgoing, leaving: outgoing.leaving ?? now }].slice(0, 3) : next;
        draw(); animation?.wake();
      };
      sceneRef.current = { renderer: scene, signal: controller.signal, draw, replace, wake: () => animation?.wake(), fail };
      draw();
      if (frames) animation = observeEffectFrames(frames, () => {
        try { draw(); } catch (error) { fail(error); return false; }
        return (travelling.current && retained.current.length > 0) || retained.current.some(source => progress(source.entering) < 1 ||
          (source.leaving !== undefined && progress(source.leaving) < 1));
      });
      const Observer = host.ownerDocument.defaultView?.ResizeObserver;
      if (Observer) { observer = new Observer(() => { try { draw(true); } catch (error) { fail(error); } }); observer.observe(host); }
      setFailure(undefined); setStatus("loading");
      const gradient = new IFXFilterRegistry().create("smoothLinearGradient", {
        point0: { x: 0, y: 0 }, point1: { x: 0, y: 64 },
        colour0: [1, 1, 1, 0], colour1: [1, 1, 1, 0.5],
      }).apply().cropped({ x: 0, y: 0, width: 1, height: 64 });
      void context.render(gradient, undefined, { signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        fade = result.image; draw();
      }).catch(error => { if (!controller.signal.aborted) fail(error); }).finally(() => context.dispose());
    } catch (error) { fail(error); }
    return cleanup;
  }, [active, layers, frames]);

  useLayoutEffect(() => {
    travelling.current = settledKey === null;
    sceneRef.current?.wake();
  }, [active, settledKey]);

  useEffect(() => {
    if (!active || settledKey === null || !sceneRef.current) return;
    const controller = new AbortController();
    const scene = sceneRef.current;
    const abort = () => controller.abort();
    scene.signal.addEventListener("abort", abort, { once: true });
    const elements = [...new Set([currentElement, selectedElement].filter((element): element is HTMLElement => Boolean(element)))];
    setStatus("loading");
    const job = captureTail.then(async () => {
      const next: ReflectionSource[] = [];
      for (const element of elements) {
        controller.signal.throwIfAborted();
        if (!element.isConnected) continue;
        const cached = cache.current.get(element);
        if (cached) { cache.current.delete(element); cache.current.set(element, cached); next.push(cached); continue; }
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) continue;
        const url = await snapshotNSEView(element, {
          signal: controller.signal, scale: Math.min(1, 512 / bounds.width, 512 / bounds.height),
        });
        controller.signal.throwIfAborted();
        // URL sources accept HTTP(S), not snapshotNSEView's PNG data URL.
        // Keep the capture local and use the existing binary image contract.
        const prefix = "data:image/png;base64,";
        if (!url.startsWith(prefix)) throw new TypeError("Reflection capture did not return a PNG data URL.");
        const bytes = Uint8Array.from(atob(url.slice(prefix.length)), character => character.charCodeAt(0));
        const source = { kind: "bytes", mimeType: "image/png", bytes } satisfies RuntimeImageSource;
        const resource = images.load({ source, accessibleLabel: "Chronosphere reflection", renderingMode: "original" });
        try {
          const lease = await resource.pixelLease(controller.signal);
          try {
            controller.signal.throwIfAborted();
            const captured = { element, image: lease.transferImage() };
            cache.current.set(element, captured); next.push(captured);
            // A few recent documents can be revisited without another DOM capture.
            if (cache.current.size > 4) cache.current.delete(cache.current.keys().next().value!);
          } finally { lease.release(); }
        } finally { resource.release(); }
      }
      controller.signal.throwIfAborted();
      if (sceneRef.current !== scene || scene.renderer.disposed) return;
      try { scene.replace(next); } catch (error) { scene.fail(error); return; }
      setFailure(undefined); setStatus("ready");
    });
    captureTail = job.then(() => {}, () => {});
    void job.catch(error => {
      if (!controller.signal.aborted && sceneRef.current === scene) {
        retained.current = [];
        try { scene.draw(); } catch (renderError) { scene.fail(renderError); return; }
        setFailure(error instanceof Error ? error.message : String(error)); setStatus("unavailable");
      }
    });
    return () => { controller.abort(); scene.signal.removeEventListener("abort", abort); };
  }, [images, layers, frames, active, settledKey, currentElement, selectedElement]);

  return <div ref={wrapper} className={["chronosphere-reflection", className].filter(Boolean).join(" ")}
    aria-hidden="true" data-reflection={!active ? "inactive" : !layers ? "unavailable" : status}
    data-reflection-error={!layers ? "AnimationFX layer rendering is unavailable." : failure}
    style={{ position: "relative", width: "100%", height: 54, overflow: "hidden", pointerEvents: "none", ...style }}>
    <span ref={startEdge} data-reflection-edge="start" style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0, visibility: "hidden" }} />
    <span ref={endEdge} data-reflection-edge="end" style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, visibility: "hidden" }} />
    <canvas ref={canvas} style={{ display: "block", width: "100%", height: "100%", visibility: !active || !layers || status === "unavailable" ? "hidden" : "visible" }} />
  </div>;
}
