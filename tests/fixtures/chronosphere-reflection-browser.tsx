import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { AFXRenderer } from "../../src/FX/AnimationFX/AFXRenderer";
import type { AFXFrameScheduler } from "../../src/FX/AnimationFX/AFXLayer";
import { GFXImage } from "../../src/FX/GraphicsFX/GFXImage";
import { createGFXPixelLease, type GFXPixelLease } from "../../src/FX/GraphicsFX/GFXPixelLease";
import { AnimationEnvironmentProvider } from "../../src/NSE/Animation/NSEAnimationEnvironment";
import { ChronosphereReflection } from "../../src/NSE/Chronosphere/ChronosphereReflection";
import { ChronosphereEnvironmentProvider, type ChronosphereEnvironment } from "../../src/NSE/Chronosphere/chronosphereEnvironment";
import { BrowserAFXCanvasRenderer } from "../../src/SynCloudOS/PlatformAdapters/BrowserAFXCanvasRenderer";

/** Real DOM capture and compositor; only the host's narrow image/frame ports live here. */
export function mountReflectionFixture() {
  const owner = new AbortController();
  const frameIds = new Set<number>();
  const leases = new Set<GFXPixelLease>();
  const renderers: AFXRenderer[] = [];
  const captures: { bytes: number; width: number; height: number }[] = [];
  let resources = 0;
  let backend: BrowserAFXCanvasRenderer | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const frames: AFXFrameScheduler = {
    now: () => performance.now() / 1000, reducedMotion: false, suspended: false,
    requestFrame(callback) {
      owner.signal.throwIfAborted();
      const id = requestAnimationFrame(time => {
        frameIds.delete(id);
        if (!owner.signal.aborted) callback(time / 1000);
      });
      frameIds.add(id);
      return () => { cancelAnimationFrame(id); frameIds.delete(id); };
    },
  };
  const layers = {
    createRenderer(target: object, options: Pick<ConstructorParameters<typeof AFXRenderer>[0], "maximumQuads" | "onRenderError"> = {}, signal?: AbortSignal) {
      if (!(target instanceof HTMLCanvasElement)) throw new TypeError("Canvas required.");
      canvas = target;
      backend = new BrowserAFXCanvasRenderer(target);
      if (backend.backend !== "webgl2") { backend.dispose(); throw new Error("Reflection pixel proof requires WebGL2."); }
      const renderer = new AFXRenderer({ ...options, width: 1, height: 1, target: backend, scheduler: frames, signal });
      renderers.push(renderer);
      return renderer;
    },
  };
  const environment: ChronosphereEnvironment = {
    signal: owner.signal,
    images: { load(request) {
      const source = request.source as { kind?: unknown; mimeType?: unknown; bytes?: unknown } | undefined;
      if (source?.kind !== "bytes" || source.mimeType !== "image/png" || !(source.bytes instanceof Uint8Array))
        throw new TypeError("Expected the actual snapshot PNG bytes.");
      const bytes = new Uint8Array(source.bytes);
      resources++;
      let released = false;
      return {
        async pixelLease(signal) {
          owner.signal.throwIfAborted(); signal?.throwIfAborted();
          const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
          const decoding = document.createElement("canvas");
          try {
            owner.signal.throwIfAborted(); signal?.throwIfAborted();
            if (released) throw new DOMException("Image released.", "AbortError");
            decoding.width = bitmap.width; decoding.height = bitmap.height;
            const context = decoding.getContext("2d");
            if (!context) throw new Error("Snapshot PNG decoder unavailable.");
            context.drawImage(bitmap, 0, 0);
            const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
            const lease = createGFXPixelLease(new GFXImage({ width: bitmap.width, height: bitmap.height,
              alpha: "straight", colourSpace: "srgb", data: new Uint8Array(pixels.data) }));
            leases.add(lease);
            captures.push({ bytes: bytes.length, width: bitmap.width, height: bitmap.height });
            return lease;
          } finally { bitmap.close(); decoding.width = decoding.height = 0; }
        },
        release() { if (!released) { released = true; resources--; } },
      };
    } },
    scheduler: {
      setTimeout(callback, delay) { const id = window.setTimeout(callback, delay); return { dispose: () => clearTimeout(id) }; },
      requestAnimationFrame(callback) { const id = window.requestAnimationFrame(callback); return { dispose: () => cancelAnimationFrame(id) }; },
    },
    mediaQueries: {
      getSnapshot: query => matchMedia(query).matches,
      subscribe(query, listener) {
        const media = matchMedia(query); media.addEventListener("change", listener);
        return () => media.removeEventListener("change", listener);
      },
    },
    animations: {
      acquireOwner() { throw new Error("Reflection must use its layer/frame capability."); },
      animate() { throw new Error("Reflection must use its layer/frame capability."); },
    },
  };
  const shelf = document.createElement("div");
  shelf.style.cssText = "position:absolute;left:20px;top:840px;width:400px;height:54px";
  document.body.append(shelf);
  const root = createRoot(shelf);
  let source: HTMLElement;
  let generation = 0;
  const show = (height: number) => {
    source?.remove();
    source = document.createElement("article");
    source.style.cssText = `position:absolute;left:20px;top:20px;width:200px;height:${height}px;overflow:hidden;background:rgb(255,255,255)`;
    const marker = document.createElement("div");
    marker.style.cssText = "position:absolute;inset:0 0 auto;height:200px;background:rgb(255,0,255)";
    source.append(marker);
    for (const [index, colour] of ["rgb(255,0,0)", "rgb(0,255,0)", "rgb(0,0,255)"].entries()) {
      const band = document.createElement("div");
      band.style.cssText = `position:absolute;left:0;right:0;bottom:${index * 10}px;height:10px;background:${colour}`;
      source.append(band);
    }
    document.body.append(source);
    flushSync(() => root.render(
      <ChronosphereEnvironmentProvider value={environment}>
        <AnimationEnvironmentProvider frames={frames} layers={layers} reducedMotion={false}>
          <ChronosphereReflection currentElement={source} settledKey={++generation} />
        </AnimationEnvironmentProvider>
      </ChronosphereEnvironmentProvider>,
    ));
  };
  show(800);
  return {
    show,
    resize(width: number) { shelf.style.width = `${width}px`; },
    read() {
      if (!canvas || !backend) throw new Error("Reflection renderer not mounted.");
      const surface = canvas;
      renderers.at(-1)!.render(); // Read synchronously before the default framebuffer is discarded.
      const gl = surface.getContext("webgl2")!;
      const ratio = surface.width / shelf.clientWidth;
      const pixel = (x: number, y: number) => {
        const bytes = new Uint8Array(4);
        gl.readPixels(Math.floor(x * ratio), surface.height - 1 - Math.floor(y * ratio), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        return [...bytes];
      };
      const column = Array.from({ length: 54 }, (_, y) => pixel(100, y));
      return { backend: backend.backend, status: shelf.querySelector("[data-reflection]")?.getAttribute("data-reflection"),
        failure: shelf.querySelector("[data-reflection-error]")?.getAttribute("data-reflection-error") ?? null,
        width: surface.width, height: surface.height, ratio, column, outside: pixel(220, 5),
        captures: [...captures], resources, leases: [...leases].filter(lease => !lease.released).length, error: gl.getError() };
    },
    dispose() {
      flushSync(() => root.unmount());
      const result = { disposed: renderers.every(renderer => renderer.disposed), frames: frameIds.size,
        resources, leases: [...leases].filter(lease => !lease.released).length };
      owner.abort();
      for (const id of frameIds) cancelAnimationFrame(id);
      frameIds.clear();
      for (const renderer of renderers) if (!renderer.disposed) renderer.dispose();
      for (const lease of leases) lease.release();
      shelf.remove(); source.remove();
      return result;
    },
  };
}

export type ReflectionFixture = ReturnType<typeof mountReflectionFixture>;
