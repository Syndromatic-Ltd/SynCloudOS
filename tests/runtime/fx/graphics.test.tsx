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
import { IFXImageResource } from "../../../src/FX/ImageFX/IFXImageResource";
function loadImageResource(service: import("../../../src/SynCloudOS/Images/imageTypes").RuntimeImageService, request: import("../../../src/SynCloudOS/Images/imageTypes").RuntimeImageLoadRequest) {
  const resource = service.load(request);
  return new IFXImageResource({ resource, readPixels: signal => service.readPixels(resource, signal), export: (format, signal) => service.export(resource, format, signal) });
}

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GFXColour } from "../../../src/FX/GraphicsFX/public";
import { GFXStateUnderflowError, GFXPath, GFXGradient, GFXContext } from "../../../src/FX/GraphicsFX/public";
import { NSEGraphicsView, NSEShadowView, type NSEShadowPreferenceSource } from "../../../src/NSE/Graphics";
import { NSEImageView, NSESizeableImage } from "../../../src/NSE/Controls/Images";
import type { NSEImageGeometryPort, NSEImageStringSourcePort } from "../../../src/NSE/Controls/Images";
import type { RuntimeImageAdapter, RuntimeImageAdapterFactory } from "../../../src/SynCloudOS/Images";
import { createTestRuntime, createTestRuntimeEnvironment } from "../helpers";

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
const graphicsIdentifiers = (id: string) => {
  const runtime = createTestRuntime({ id });
  runtimes.push(runtime);
  return runtime.images.createGraphicsIdentifierIssuer();
};
afterEach(async () => {
  for (const runtime of runtimes.splice(0).reverse()) await runtime.dispose("graphics test cleanup");
});

describe("closed NSE graphics", () => {
  it("balances state and emits deterministic runtime-scoped SVG definitions", () => {
    const context = GFXContext.recording({
      size: { width: 100, height: 60 },
      identifiers: graphicsIdentifiers("runtime:graphics"),
    });
    context.save();
    context.setFill(new GFXGradient([
      { offset: 1, colour: GFXColour.parse("#fff") },
      { offset: 0, colour: GFXColour.parse("#000") },
    ], { kind: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }));
    context.fill(GFXPath.roundedRect({ x: 2, y: 2, width: 96, height: 56 }, 8));
    context.restore();
    const svg = context.toSVG();
    expect(svg).toMatch(/<linearGradient id="nse-graphics-[^"]+"/);
    const definitionIds = Array.from(svg.matchAll(/<(?:linear|radial)Gradient id="([^"]+)"/g), ([, id]) => id!);
    const referenceIds = Array.from(svg.matchAll(/url\(#([^)]+)\)/g), ([, id]) => id!);
    expect(referenceIds).toEqual(expect.arrayContaining(definitionIds));
    expect(referenceIds.every((id) => definitionIds.includes(id))).toBe(true);
    expect(context.toSVG()).toBe(svg);
    expect(svg).toContain('d="M 10 2 L 90 2');
    expect(context.displayList.commands).toHaveLength(1);
    expect(Object.isFrozen(context.displayList.commands)).toBe(true);
    expect(() => context.restore()).toThrow(GFXStateUnderflowError);
  });

  it("rejects non-finite geometry, unsafe colours and any raw SVG command surface", () => {
    expect(() => GFXPath.rect({ x: 0, y: 0, width: Number.NaN, height: 10 })).toThrow();
    expect(() => new GFXGradient([{ offset: 0, colour: { toCSS: () => 'url("javascript:alert(1)")' } as never }])).toThrow(TypeError);
    const context = GFXContext.recording({
      size: { width: 20, height: 20 },
      identifiers: graphicsIdentifiers("runtime:hostile"),
    });
    expect("pathData" in context).toBe(false);
    expect("raw" in context).toBe(false);
    expect(() => context.drawText("<script>alert(1)</script>", { x: 1, y: 12 }, { family: "Prelude", size: 12 })).not.toThrow();
    expect(context.toSVG()).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(context.toSVG()).not.toContain("<script>");
    expect(() => GFXContext.recording({
      size: { width: 1, height: 1 },
      identifiers: { runtimeId: "caller", next: () => "caller-controlled" } as never,
    })).toThrow(TypeError);
    expect(() => GFXContext.recording({
      size: { width: 1, height: 1 },
      identifiers: { createViewScope: () => ({ nextDefinitionId: () => "nse-graphics-forged-duplicate" }) } as never,
    })).toThrow(TypeError);
  });

  it("applies the display-list budget to text commands as well as paths", () => {
    const context = GFXContext.recording({
      size: { width: 20, height: 20 },
      identifiers: graphicsIdentifiers("runtime:text-budget"),
    });
    for (let index = 0; index < 10_000; index += 1) {
      context.drawText("x", { x: 0, y: 1 }, { family: "Prelude", size: 10 });
    }
    expect(() => context.drawText("overflow", { x: 0, y: 1 }, { family: "Prelude", size: 10 })).toThrow(/command limit/i);
  });

  it("keeps path factories, transforms, bounds and containment immutable", () => {
    const path = GFXPath.ellipse({ x: 2, y: 4, width: 20, height: 10 });
    const moved = path.transformed({ a: 1, b: 0, c: 0, d: 1, tx: 3, ty: -1 });
    expect(path.bounds).toEqual({ x: 2, y: 4, width: 20, height: 10 });
    expect(moved.bounds).toEqual({ x: 5, y: 3, width: 20, height: 10 });
    expect(path.contains({ x: 12, y: 9 })).toBe(true);
    expect(path.contains({ x: 40, y: 9 })).toBe(false);
    expect(Object.isFrozen(path.commands)).toBe(true);
    const hostilePoint = Object.create(null);
    let getterCalls = 0;
    Object.defineProperty(hostilePoint, "x", { enumerable: true, get() { getterCalls += 1; return 0; } });
    expect(() => path.line(hostilePoint)).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });

  it("computes analytic quadratic and cubic extrema from each subpath", () => {
    const quadratic = new GFXPath()
      .move({ x: 0, y: 0 })
      .quad({ x: 10, y: 100 }, { x: 20, y: 0 });
    const cubic = new GFXPath()
      .move({ x: 0, y: 0 })
      .curve({ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 });
    const multiSubpath = new GFXPath()
      .move({ x: 10, y: 20 })
      .line({ x: 12, y: 24 })
      .close()
      .move({ x: -5, y: -7 })
      .quad({ x: 5, y: 20 }, { x: 15, y: -7 })
      .close();

    expect(quadratic.bounds).toEqual({ x: 0, y: 0, width: 20, height: 50 });
    expect(cubic.bounds).toEqual({ x: 0, y: 0, width: 100, height: 75 });
    expect(multiSubpath.bounds).toEqual({ x: -5, y: -7, width: 20, height: 31 });
    expect(quadratic.transformed({ a: 1, b: 0, c: 0, d: 2, tx: 3, ty: 4 }).bounds).toEqual({ x: 3, y: 4, width: 20, height: 100 });
  });

  it("uses closed quadratic and cubic geometry for containment rather than control-point polygons", () => {
    const quadraticArch = new GFXPath()
      .move({ x: 0, y: 0 })
      .quad({ x: 5, y: 10 }, { x: 10, y: 0 })
      .line({ x: 0, y: 0 })
      .close();
    const cubicArch = new GFXPath()
      .move({ x: 0, y: 0 })
      .curve({ x: 0, y: 12 }, { x: 10, y: 12 }, { x: 10, y: 0 })
      .line({ x: 0, y: 0 })
      .close();
    const withHole = GFXPath.rect({ x: 0, y: 0, width: 20, height: 20 })
      .append(new GFXPath([
        { kind: "move", point: { x: 6, y: 6 } },
        { kind: "line", point: { x: 6, y: 14 } },
        { kind: "line", point: { x: 14, y: 14 } },
        { kind: "line", point: { x: 14, y: 6 } },
        { kind: "close" },
      ]));

    expect(quadraticArch.contains({ x: 5, y: 2 })).toBe(true);
    expect(quadraticArch.contains({ x: 5, y: 8 })).toBe(false);
    expect(cubicArch.contains({ x: 5, y: 4 })).toBe(true);
    expect(cubicArch.transformed({ a: 1, b: 0, c: 0, d: 1, tx: 20, ty: -3 }).contains({ x: 25, y: 1 })).toBe(true);
    expect(withHole.contains({ x: 2, y: 2 })).toBe(true);
    expect(withHole.contains({ x: 10, y: 10 })).toBe(false);
  });

  it("implicitly closes open fill subpaths for containment without changing their SVG serialization", () => {
    const quadratic = new GFXPath()
      .move({ x: 0, y: 0 })
      .quad({ x: 5, y: 10 }, { x: 10, y: 0 });
    const cubic = new GFXPath()
      .move({ x: 0, y: 0 })
      .curve({ x: 0, y: 12 }, { x: 10, y: 12 }, { x: 10, y: 0 });
    const nestedOpenSubpaths = new GFXPath()
      .move({ x: 0, y: 0 })
      .line({ x: 20, y: 0 })
      .line({ x: 20, y: 20 })
      .line({ x: 0, y: 20 })
      .move({ x: 6, y: 6 })
      .line({ x: 6, y: 14 })
      .line({ x: 14, y: 14 })
      .line({ x: 14, y: 6 });

    expect(quadratic.toSVGPathData()).not.toContain("Z");
    expect(cubic.toSVGPathData()).not.toContain("Z");
    expect(quadratic.contains({ x: 5, y: 2 })).toBe(true);
    expect(quadratic.contains({ x: 5, y: 8 })).toBe(false);
    expect(cubic.contains({ x: 5, y: 4 })).toBe(true);
    expect(nestedOpenSubpaths.contains({ x: 2, y: 2 })).toBe(true);
    expect(nestedOpenSubpaths.contains({ x: 10, y: 10 })).toBe(false);
    expect(nestedOpenSubpaths.contains({ x: 0, y: 10 })).toBe(true);
    expect(nestedOpenSubpaths.transformed({ a: 1, b: 0, c: 0, d: 1, tx: 30, ty: -4 }).contains({ x: 32, y: -2 })).toBe(true);

    const hostileCommands = [{ kind: "move" as const, point: { x: 0, y: 0 } }];
    for (let index = 0; index < 9_999; index += 1) {
      hostileCommands.push({
        kind: "curve" as const,
        control1: { x: index + 0.25, y: 1_000 },
        control2: { x: index + 0.75, y: -1_000 },
        point: { x: index + 1, y: 0 },
      });
    }
    expect(() => new GFXPath(hostileCommands).contains({ x: 1, y: 0 })).toThrow(/point work limit/i);
  });

  it("records the complete bounded graphics state across save and restore", () => {
    const context = GFXContext.recording({
      size: { width: 48, height: 32 },
      identifiers: graphicsIdentifiers("runtime:graphics-complete-state"),
    });
    const recorder = context as unknown as {
      setTransform(value: { a: number; b: number; c: number; d: number; tx: number; ty: number }): void;
      clip(path: GFXPath): void;
      setStroke(colour: GFXColour): void;
      setLineWidth(value: number): void;
      setLineCap(value: "butt" | "round" | "square"): void;
      setLineJoin(value: "miter" | "round" | "bevel"): void;
      setLineDash(value: readonly number[]): void;
      setShadow(value: { offset: { x: number; y: number }; blur: number; spread: number; colour: GFXColour }): void;
      setTextAttributes(value: { letterSpacing: number; alignment: "start" | "middle" | "end" }): void;
      stroke(path: GFXPath): void;
    };
    const clip = GFXPath.rect({ x: 0, y: 0, width: 16, height: 16 });
    const path = GFXPath.rect({ x: 2, y: 2, width: 12, height: 12 });
    context.save();
    recorder.setTransform({ a: 1, b: 0, c: 0, d: 1, tx: 4, ty: 3 });
    recorder.clip(clip);
    recorder.setStroke(GFXColour.parse("#123456"));
    recorder.setLineWidth(3);
    recorder.setLineCap("round");
    recorder.setLineJoin("bevel");
    recorder.setLineDash([2, 1]);
    recorder.setShadow({ offset: { x: 1, y: 2 }, blur: 3, spread: 0, colour: GFXColour.parse("#0008") });
    recorder.setTextAttributes({ letterSpacing: 1, alignment: "middle" });
    recorder.stroke(path);
    context.restore();
    context.fill(path);

    expect(context.displayList.commands).toEqual([
      expect.objectContaining({ kind: "stroke-path", transform: { a: 1, b: 0, c: 0, d: 1, tx: 4, ty: 3 }, lineWidth: 3, lineCap: "round", lineJoin: "bevel", lineDash: [2, 1] }),
      expect.objectContaining({ kind: "fill-path", transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, clipPathData: null }),
    ]);
    expect(context.toSVG()).toContain("stroke-linecap=\"round\"");
    expect(context.toSVG()).toContain("clipPath");
  });

  it("accumulates a bounded clip intersection through save/restore in React and string SVG output", () => {
    const context = GFXContext.recording({
      size: { width: 48, height: 32 },
      identifiers: graphicsIdentifiers("runtime:graphics-clip-intersection"),
    });
    const recorder = context as unknown as { clip(path: GFXPath): void };
    const first = GFXPath.rect({ x: 0, y: 0, width: 24, height: 24 });
    const overlap = GFXPath.rect({ x: 12, y: 0, width: 24, height: 24 });
    const disjoint = GFXPath.rect({ x: 30, y: 0, width: 12, height: 12 });
    const painted = GFXPath.rect({ x: 0, y: 0, width: 48, height: 32 });
    recorder.clip(first);
    context.save();
    recorder.clip(overlap);
    context.fill(painted);
    context.restore();
    context.fill(painted);

    const commands = context.displayList.commands;
    const clippedState = commands[0]!.state as unknown as { readonly clipPathDataChain: readonly string[] };
    const restoredState = commands[1]!.state as unknown as { readonly clipPathDataChain: readonly string[] };
    expect(clippedState.clipPathDataChain).toEqual([first.toSVGPathData(), overlap.toSVGPathData()]);
    expect(restoredState.clipPathDataChain).toEqual([first.toSVGPathData()]);
    const svg = context.toSVG();
    const stringClipIds = Array.from(svg.matchAll(/<clipPath id="([^"]+)"/g), ([, id]) => id!);
    const stringClipRefs = Array.from(svg.matchAll(/clip-path="url\(#([^)]+)\)"/g), ([, id]) => id!);
    expect(stringClipIds).toHaveLength(2);
    expect(stringClipRefs).toHaveLength(3);
    expect(stringClipRefs.every((id) => stringClipIds.includes(id))).toBe(true);

    const { container } = render(<NSEGraphicsView displayList={context.displayList} label="Clip intersection" />);
    const reactClipIds = Array.from(container.querySelectorAll("clipPath"), (node) => node.id);
    const reactClipRefs = Array.from(container.querySelectorAll("g[clip-path]"), (node) => /url\(#([^)]+)\)/.exec(node.getAttribute("clip-path") ?? "")?.[1] ?? "");
    expect(reactClipIds).toHaveLength(2);
    expect(reactClipRefs).toHaveLength(3);
    expect(reactClipRefs.every((id) => reactClipIds.includes(id))).toBe(true);

    const disjointContext = GFXContext.recording({
      size: { width: 48, height: 32 },
      identifiers: graphicsIdentifiers("runtime:graphics-clip-disjoint"),
    });
    const disjointRecorder = disjointContext as unknown as { clip(path: GFXPath): void };
    disjointRecorder.clip(first);
    disjointRecorder.clip(disjoint);
    disjointContext.fill(painted);
    expect(Array.from(disjointContext.toSVG().matchAll(/clip-path="url\(#([^)]+)\)"/g))).toHaveLength(2);
    expect(() => disjointRecorder.clip({ toSVGPathData: () => "M 0 0" } as never)).toThrow(TypeError);

    const depthContext = GFXContext.recording({
      size: { width: 1, height: 1 },
      identifiers: graphicsIdentifiers("runtime:graphics-clip-depth"),
    });
    const depthRecorder = depthContext as unknown as { clip(path: GFXPath): void };
    for (let index = 0; index < 64; index += 1) depthRecorder.clip(first);
    expect(() => depthRecorder.clip(first)).toThrow(/clip.*depth/i);
  });

  it("renders a closed display list and accessible shadow recipe without raw HTML", () => {
    const context = GFXContext.recording({
      size: { width: 40, height: 24 },
      identifiers: graphicsIdentifiers("runtime:view"),
    });
    context.setFill(GFXColour.parse("#123456"));
    context.fill(GFXPath.rect({ x: 0, y: 0, width: 40, height: 24 }));
    const { container } = render(
      <NSEShadowView shadow={{ offset: { x: 1, y: 2 }, blur: 4, spread: 0, colour: GFXColour.parse("#0008") }}>
        <NSEGraphicsView displayList={context.displayList} label="Chart" description="A bounded chart" />
      </NSEShadowView>,
    );
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Chart");
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M 0 0 L 40 0 L 40 24 L 0 24 Z");
    expect(container.querySelector("[data-nse-shadow-recipe]")).not.toBeNull();
    expect((container.querySelector("[data-nse-shadow-recipe]") as HTMLElement | null)?.style.boxShadow).toContain("1px");
    expect(container.querySelector("script")).toBeNull();
    expect(() => render(<NSEGraphicsView displayList={{ size: { width: 1, height: 1 }, commands: [{ kind: "fill-path", path: [], pathData: "M0 0", paint: { kind: "colour", css: "url(javascript:alert(1))" }, opacity: 1 }] }} label="Forged" />)).toThrow(TypeError);
  });

  it("issues unique definition ids for same-named runtimes and each mounted view", () => {
    const gradient = new GFXGradient([
      { offset: 0, colour: GFXColour.parse("#000") },
      { offset: 1, colour: GFXColour.parse("#fff") },
    ], { kind: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } });
    const first = GFXContext.recording({ size: { width: 8, height: 8 }, identifiers: graphicsIdentifiers("runtime:same") });
    const second = GFXContext.recording({ size: { width: 8, height: 8 }, identifiers: graphicsIdentifiers("runtime:same") });
    first.setFill(gradient); second.setFill(gradient);
    first.fill(GFXPath.rect({ x: 0, y: 0, width: 8, height: 8 }));
    second.fill(GFXPath.rect({ x: 0, y: 0, width: 8, height: 8 }));
    const firstExportId = /linearGradient id="([^"]+)"/.exec(first.toSVG())?.[1];
    const secondExportId = /linearGradient id="([^"]+)"/.exec(second.toSVG())?.[1];
    expect(firstExportId).toBeTruthy();
    expect(secondExportId).toBeTruthy();
    expect(firstExportId).not.toBe(secondExportId);

    const { container } = render(<>
      <NSEGraphicsView displayList={first.displayList} label="First view" />
      <NSEGraphicsView displayList={first.displayList} label="Second view" />
    </>);
    const ids = Array.from(container.querySelectorAll("linearGradient"), (node) => node.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const fills = Array.from(container.querySelectorAll("path"), (node) => node.getAttribute("fill"));
    expect(fills).toEqual(ids.map((id) => `url(#${id})`));
  });

  it("bridges a ready runtime resource into the frozen image DOM without changing its classes", () => {
    const resource = {
      state: "ready" as const,
      src: "/resource.png",
      accessibleLabel: "Resource image",
      intrinsicSize: { width: 80, height: 40 },
      density: 1,
      ready: Promise.resolve(undefined),
      revision: 1,
      subscribe() { return () => undefined; },
      release() {},
    };
    const { container } = render(<NSEImageView src={resource} />);
    const image = container.querySelector(".nse-control-sizeable-image-media");
    expect(image?.getAttribute("src")).toBe("/resource.png");
    expect(image?.getAttribute("alt")).toBe("Resource image");
    expect(container.querySelectorAll(".nse-control-sizeable-image")).toHaveLength(1);
  });

  it("removes an invalidated resource src and unsubscribes without changing the image recipe", () => {
    let state: "ready" | "failed" = "ready";
    let source = "/document-resource.png";
    let revision = 1;
    let listener: (() => void) | null = null;
    let subscriptions = 0;
    let unsubscriptions = 0;
    const resource = {
      get state() { return state; },
      get src() { return source; },
      get revision() { return revision; },
      accessibleLabel: "Document image",
      intrinsicSize: { width: 80, height: 40 },
      density: 1,
      ready: Promise.resolve(undefined),
      subscribe(next: () => void) {
        subscriptions += 1;
        listener = next;
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          unsubscriptions += 1;
          listener = null;
        };
      },
      release() {},
    };
    const { container, unmount } = render(<NSEImageView src={resource} />);
    expect(subscriptions).toBe(1);
    expect(container.querySelector(".nse-control-sizeable-image-media")?.getAttribute("src")).toBe("/document-resource.png");
    expect(container.querySelector(".nse-control-sizeable-image-media")?.getAttribute("data-nse-image-rendering")).toBe("original");
    act(() => {
      state = "failed";
      source = "";
      revision += 1;
      listener?.();
    });
    expect(container.querySelector(".nse-control-sizeable-image-media")).toBeNull();
    expect(container.querySelectorAll(".nse-control-sizeable-image")).toHaveLength(1);
    unmount();
    expect(unsubscriptions).toBe(1);
  });

  it("removes a mounted document image immediately when the document resource closes", async () => {
    let leaseReleases = 0;
    const adapter: RuntimeImageAdapter = {
      decode: async () => Object.freeze({
        src: "blob:document-image",
        intrinsicSize: Object.freeze({ width: 80, height: 40 }),
        density: 1,
        byteLength: 1,
        corsClean: true,
        release() { leaseReleases += 1; },
      }),
      export: async () => new Uint8Array([1]),
      dispose() {},
    };
    const environment = createTestRuntimeEnvironment();
    Object.defineProperty(environment, "images", {
      enumerable: true,
      value: { acquire: () => ({ adapter, release: () => adapter.dispose() }) } satisfies RuntimeImageAdapterFactory,
    });
    const runtime = createTestRuntime({ id: "runtime:graphics-document-image", environment, imageAuthorisation: { authorise: () => true } });
    runtimes.push(runtime);
    const descriptor = await runtime.documentResources.acquire("document:a", {
      type: "image/png", size: 1, arrayBuffer: async () => new Uint8Array([1]).buffer,
    }, new AbortController().signal);
    const resource = loadImageResource(runtime.images, {
      subject: { appId: "app:gallery", documentId: "document:a", capability: "image.decode" },
      source: { kind: "document-resource", documentId: "document:a", descriptor },
    });
    await resource.ready;
    const { container, unmount } = render(<NSEImageView src={resource} />);
    expect(container.querySelector(".nse-control-sizeable-image-media")?.getAttribute("src")).toBe("blob:document-image");
    act(() => { expect(runtime.documentResources.releaseDocument("document:a")).toBe(1); });
    expect(container.querySelector(".nse-control-sizeable-image-media")).toBeNull();
    expect(container.querySelectorAll(".nse-control-sizeable-image")).toHaveLength(1);
    expect(leaseReleases).toBe(1);
    unmount();
    resource.release();
    expect(leaseReleases).toBe(1);
  });

  it("honours template tint and cap insets on a resource-backed image view", () => {
    const resource = {
      state: "ready" as const,
      src: "/template.svg",
      accessibleLabel: "Template mark",
      intrinsicSize: { width: 32, height: 16 },
      density: 2,
      renderingMode: "template" as const,
      tintColour: "#112233",
      capInsets: { top: 4, right: 5, bottom: 4, left: 5 },
      resizingMode: "cap-insets" as const,
      ready: Promise.resolve(undefined),
      revision: 1,
      subscribe() { return () => undefined; },
      release() {},
    };
    const { container } = render(<NSEImageView src={resource} />);
    const image = container.querySelector(".nse-control-sizeable-image-media") as HTMLImageElement | null;
    const template = container.querySelector(".nse-control-sizeable-image-template") as HTMLElement | null;
    expect(image?.getAttribute("data-nse-image-rendering")).toBe("template");
    expect(image?.getAttribute("data-nse-image-tint")).toBe("#112233");
    expect(image?.getAttribute("data-nse-image-cap-insets")).toBe("4,5,4,5");
    expect(image?.style.backgroundColor === "rgb(17, 34, 51)" || image?.style.backgroundColor === "#112233").toBe(true);
    expect(image?.style.borderImageSlice).toMatch(/4/);
    expect(image?.style.opacity).toBe("0");
    expect(template?.getAttribute("data-nse-image-template")).toBe("mask-tint");
    expect(template?.style.maskImage).toContain("/template.svg");
    expect(template?.getAttribute("data-nse-image-cap-inset-rendered")).toBe("true");
    expect(screen.getAllByRole("img", { name: "Template mark" })).toHaveLength(1);
  });

  it("sizes a resource-backed NSESizeableImage from intrinsicSize without constructing Image", () => {
    const originalImage = globalThis.Image;
    // @ts-expect-error — resource path must not consult the browser Image constructor
    delete (globalThis as { Image?: unknown }).Image;
    let source = "blob:resource-lease";
    let state: "ready" | "released" = "ready";
    let revision = 1;
    let listener: (() => void) | null = null;
    const resource = {
      get state() { return state; },
      get src() { return source; },
      get revision() { return revision; },
      accessibleLabel: "Lease image",
      intrinsicSize: { width: 80, height: 40 },
      density: 2,
      renderingMode: "original" as const,
      tintColour: null,
      capInsets: null,
      resizingMode: "stretch" as const,
      ready: Promise.resolve(undefined),
      subscribe(next: () => void) {
        listener = next;
        return () => { listener = null; };
      },
      release() {},
    };
    try {
      const { container } = render(<NSESizeableImage src={resource} />);
      const image = container.querySelector(".nse-control-sizeable-image-media") as HTMLImageElement | null;
      expect(image?.getAttribute("src")).toBe("blob:resource-lease");
      expect(image?.style.width).toBe("80px");
      act(() => {
        state = "released";
        source = "";
        revision += 1;
        listener?.();
      });
      expect(container.querySelector(".nse-control-sizeable-image-media")).toBeNull();
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it("uses an injected geometry authority without ambient observers", () => {
    const originalObserver = globalThis.ResizeObserver;
    // @ts-expect-error — the control must not fall back to the ambient observer
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    const geometry: NSEImageGeometryPort = {
      measure: vi.fn(() => ({ width: 120, height: 80 })),
      observe: vi.fn(() => () => undefined),
    };
    const resource = {
      state: "ready" as const,
      src: "/injected.png",
      accessibleLabel: "Injected image",
      intrinsicSize: { width: 60, height: 40 },
      density: 1,
      renderingMode: "original" as const,
      tintColour: null,
      capInsets: null,
      resizingMode: "stretch" as const,
      ready: Promise.resolve(undefined),
      revision: 1,
      subscribe() { return () => undefined; },
      release() {},
    };
    try {
      const view = render(<NSESizeableImage src={resource} geometry={geometry} />);
      expect(geometry.measure).toHaveBeenCalled();
      expect(geometry.observe).toHaveBeenCalled();
      view.unmount();
    } finally {
      if (originalObserver) globalThis.ResizeObserver = originalObserver;
    }
  });

  it("uses a supplied string-source lease instead of ambient image and geometry constructors", async () => {
    const originalImage = globalThis.Image;
    const originalObserver = globalThis.ResizeObserver;
    const release = vi.fn();
    const geometry: NSEImageGeometryPort = {
      measure: vi.fn(() => ({ width: 120, height: 80 })),
      observe: vi.fn(() => () => undefined),
    };
    const sourcePort: NSEImageStringSourcePort = {
      geometry,
      load: vi.fn(async (_source: string, _signal: AbortSignal) => ({
        src: "blob:runtime-owned-string-source",
        dimensions: { width: 60, height: 40 },
        release,
      })),
    };
    // @ts-expect-error — a string source must not construct its own Image
    globalThis.Image = class { constructor() { throw new Error("ambient Image was used"); } } as never;
    // @ts-expect-error — geometry must be provided by the injected authority
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    try {
      const view = render(<NSESizeableImage src="/string-source.png" imageSource={sourcePort} />);
      await act(async () => undefined);
      expect(sourcePort.load).toHaveBeenCalledWith("/string-source.png", expect.any(AbortSignal));
      expect(geometry.measure).toHaveBeenCalled();
      expect(view.container.querySelector(".nse-control-sizeable-image-media")?.getAttribute("src")).toBe("blob:runtime-owned-string-source");
      view.unmount();
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.Image = originalImage;
      if (originalObserver) globalThis.ResizeObserver = originalObserver;
    }
  });

  it("applies a real shadow recipe and flattens it under reduced transparency and forced colours", () => {
    const shadow = { offset: { x: 2, y: 3 }, blur: 6, spread: 1, colour: GFXColour.parse("#112233") };
    const { container, rerender } = render(
      <NSEShadowView shadow={shadow}>
        <button type="button">Focusable chart</button>
      </NSEShadowView>,
    );
    const host = container.querySelector("[data-nse-shadow-recipe]") as HTMLElement;
    expect(host.style.boxShadow).toMatch(/2px 3px 6px 1px rgb\(17[, ]+34[, ]+51\)/);
    expect(host.getAttribute("data-nse-shadow-recipe")).toBe("semantic");

    rerender(
      <NSEShadowView shadow={shadow} reducedTransparency>
        <button type="button">Focusable chart</button>
      </NSEShadowView>,
    );
    expect((container.querySelector("[data-nse-shadow-recipe]") as HTMLElement).style.boxShadow).toBe("none");
    expect(container.querySelector("[data-nse-shadow-recipe]")?.getAttribute("data-nse-shadow-recipe")).toBe("suppressed");

    rerender(
      <NSEShadowView shadow={shadow} forcedColours>
        <button type="button">Focusable chart</button>
      </NSEShadowView>,
    );
    const forced = container.querySelector("[data-nse-shadow-recipe]") as HTMLElement;
    expect(forced.style.boxShadow).toBe("none");
    const focusable = container.querySelector("button") as HTMLButtonElement;
    focusable.focus();
    expect(getComputedStyle(focusable).outlineStyle === "none" ? forced.getAttribute("data-nse-shadow-protect-focus") : "visible").toBeTruthy();
    expect(forced.getAttribute("data-nse-shadow-protect-focus")).toBe("true");
  });

  it("updates shadow presentation from a disposable injected preference source", () => {
    let snapshot = { reducedTransparency: false, forcedColours: false };
    const listeners = new Set<() => void>();
    const source: NSEShadowPreferenceSource = {
      getSnapshot: () => snapshot,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    };
    const shadow = { offset: { x: 1, y: 1 }, blur: 2, spread: 0, colour: GFXColour.parse("#000") };
    const { container, unmount } = render(<NSEShadowView shadow={shadow} preferenceSource={source}><button>Focus</button></NSEShadowView>);
    const host = () => container.querySelector("[data-nse-shadow-recipe]") as HTMLElement;
    expect(host().style.boxShadow).not.toBe("none");
    act(() => { snapshot = { reducedTransparency: true, forcedColours: false }; listeners.forEach((listener) => listener()); });
    expect(host().style.boxShadow).toBe("none");
    act(() => { snapshot = { reducedTransparency: false, forcedColours: false }; listeners.forEach((listener) => listener()); });
    expect(host().style.boxShadow).not.toBe("none");
    unmount();
    expect(listeners).toHaveLength(0);
  });
});
