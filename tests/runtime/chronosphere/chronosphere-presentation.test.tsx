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
import React, { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GFXImage } from "../../../src/FX/GraphicsFX/GFXImage";

const host = vi.hoisted(() => ({ app: {} as Record<string, any>, reducedMotion: false, portalHost: null as HTMLElement | null, vortexMounts: [] as object[] }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({ useSynWare: () => host.app }));
vi.mock("../../../src/NSE/Overlays/NSEOverlayProvider", () => ({ useNSEOverlayProvider: () => ({ portalHost: host.portalHost }) }));
vi.mock("../../../src/NSE/Animation/NSEAnimationEnvironment", () => ({ useNSEAnimationEnvironment: () => ({ reducedMotion: host.reducedMotion }) }));
vi.mock("../../../src/NSE/Focus/NSEFocusPort", () => ({ NSEFocusScope: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../../src/NSE/Components/LoadingSpinner", () => ({
  LoadingSpinner: ({ label, variant }: { label: string; variant: string }) => <span data-spinner-variant={variant}>{label}</span>,
}));
vi.mock("../../../src/NSE/Controls/Buttons/NSEButtons", () => ({
  NSEPushButton: ({ children, tone: _tone, ...props }: Record<string, any>) => <button {...props}>{children}</button>,
}));
vi.mock("../../../src/NSE/Chronosphere/Vortex/VortexEffect", () => ({ VortexEffect: (props: { preparedImages?: object }) => {
  useLayoutEffect(() => { host.vortexMounts.push(props); }, []);
  return <div data-prepared-vortex={Boolean(props.preparedImages)} />;
} }));

import { Chronosphere } from "../../../src/SynCloudOS/AppSDK/Chronosphere/Chronosphere";
import { ChronosphereGridView } from "../../../src/SynCloudOS/AppSDK/Chronosphere/Chronosphere";
import type { ChronosphereViewComponent } from "../../../src/SynCloudOS/AppSDK/Chronosphere/Chronosphere";
import type { ChronosphereViewProps, ChronosphereDetailRenderer } from "../../../src/NSE/Chronosphere/chronosphereViewTypes";
import { createChronosphereAppSubject } from "../../../src/NSE/Chronosphere/chronosphereSubject";

const subject = createChronosphereAppSubject("documents", "Documents", [{
  id: "document-now", sequence: 3, title: "Current document", displayLabel: "Current", dateLabel: "Now", summary: "Draft", isCurrent: true, tint: [1, 1, 1],
}]);
const image = new GFXImage({ width: 1, height: 1, alpha: "straight", colourSpace: "srgb", data: new Uint8Array([255, 255, 255, 255]) });
const presentShot = "data:image/png;base64,present";
const foregroundShot = "data:image/png;base64,foreground";
let root: Root, container: HTMLDivElement, portal: HTMLDivElement;
let imageRelease: ReturnType<typeof vi.fn>, leaseRelease: ReturnType<typeof vi.fn>;
let frameCallbacks: Set<() => void>, mountSignal: AbortController;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); portal = document.createElement("div");
  document.body.append(container, portal); root = createRoot(container); host.portalHost = portal; host.vortexMounts = [];
  host.reducedMotion = false;
  imageRelease = vi.fn(); leaseRelease = vi.fn(); frameCallbacks = new Set(); mountSignal = new AbortController();
  host.app = {
    signal: mountSignal.signal,
    navigation: { openRoute: vi.fn() },
    images: { load: vi.fn(() => ({ pixelLease: async () => ({ transferImage: () => image, release: leaseRelease }), release: imageRelease })) },
    errors: { capture: vi.fn() },
    mediaQueries: { getSnapshot: () => false, subscribe: () => () => {} },
    scheduler: {
      requestAnimationFrame(callback: () => void) { frameCallbacks.add(callback); return { dispose: () => frameCallbacks.delete(callback) }; },
      setTimeout: () => ({ dispose() {} }),
    },
    animations: { acquireOwner: () => ({ dispose() {} }), animate: vi.fn(() => ({ dispose() {}, finished: new Promise(() => {}) })) },
  };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); portal.remove(); vi.restoreAllMocks(); });

it.each(["Restore", "Done"])("gives %s its own document return choreography", async action => {
  const history = createChronosphereAppSubject("draft", "Draft", [
    { id: "old", sequence: 1, title: "Earlier draft", dateLabel: "Monday" },
    ...Array.from({ length: 29 }, (_, index) => ({ id: `saved-${index}`, sequence: index + 2, title: "Recent draft", dateLabel: "Tuesday" })),
    { id: "live", sequence: 31, title: "Current draft", dateLabel: "Now", isCurrent: true },
  ], { layout: "versions", card: { aspectRatio: 0.75, faceWidth: 600 } });
  const restore = vi.fn(), returned = vi.fn();
  const origin = { x: 300, y: 120, width: 450, height: 600 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 1600, bottom: 1000, width: 1600, height: 1000, toJSON() {} };
  });
  let clock = 0;
  host.app.scheduler.requestAnimationFrame = (callback: (time: number) => void) => {
    const frame = () => callback(clock);
    frameCallbacks.add(frame);
    return { dispose: () => frameCallbacks.delete(frame) };
  };
  const plays: { target: HTMLElement; definition: any; finish(): void }[] = [];
  host.app.animations.animate = (target: HTMLElement, definition: any) => {
    const completion = deferred<void>();
    plays.push({ target, definition, finish: () => completion.resolve() });
    return { progress: 1, finished: completion.promise, dispose() {} };
  };
  async function settleTravel() {
    for (let index = 0; frameCallbacks.size && index < 150; index++) {
      clock += 32;
      const frames = [...frameCallbacks]; frameCallbacks.clear();
      await act(async () => frames.forEach(frame => frame()));
    }
  }
  await act(async () => root.render(<Chronosphere subject={history} onReturn={returned} onRestore={restore}
    capturePresent={async () => presentShot} captureForeground={async () => foregroundShot}
    presentOrigin={() => origin} renderFace={entry => entry.isCurrent ? null : <article>{entry.title}</article>} />));
  await settleTravel();
  await act(async () => portal.querySelector(".chronosphere")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  await settleTravel();
  const selected = portal.querySelector<HTMLElement>('.chronosphere-card[data-active="true"][data-status="saved"]')!;
  const present = portal.querySelector<HTMLElement>(".chronosphere-present")!;
  expect(selected.textContent).toContain("Earlier draft");
  const selectedPose = selected.style.transform, presentPose = present.style.transform;
  plays.length = 0;
  await act(async () => [...portal.querySelectorAll("button")].find(button => button.textContent === action)!.click());
  if (action === "Restore") {
    expect(restore).toHaveBeenCalledWith(history.entries[0]);
    expect(selected.style.transform).not.toBe(selectedPose);
    expect(present.style.transform).toBe(presentPose);
    expect(present.style.opacity).toBe("0");
    expect(portal.querySelector<HTMLElement>(".chronosphere-stage")!.style.zIndex).toBe("61");
    const position = portal.querySelector<HTMLElement>(".chronosphere")!.dataset.position;
    await act(async () => {
      portal.querySelector(".chronosphere")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
      portal.querySelector(".chronosphere")!.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
    });
    expect(portal.querySelector<HTMLElement>(".chronosphere")!.dataset.position).toBe(position);
    expect(portal.querySelector("[data-restore-flight=true]")).toBe(selected);
    expect(plays.some(play => play.target === selected && play.definition.animations.some((animation: any) => animation.keyPath === "transform"))).toBe(true);
    expect(plays.some(play => play.target === present && play.definition.animations.some((animation: any) => animation.keyPath === "opacity" && animation.to === 0))).toBe(true);
  } else {
    expect(restore).not.toHaveBeenCalled();
    expect(selected.style.transform).toBe(selectedPose);
    expect(present.style.transform).not.toBe(presentPose);
    expect(present.style.opacity).toBe("1");
  }
  expect(returned).not.toHaveBeenCalled();
  await act(async () => plays.filter(play => play.target.classList.contains("chronosphere-curtain")).forEach(play => play.finish()));
  expect(returned).toHaveBeenCalledTimes(1);
});

it("presents a neutral version without museum fields or a tint", async () => {
  const neutral = createChronosphereAppSubject("draft", "Draft", [{
    id: "draft-1", sequence: 1, title: "Saved draft", dateLabel: "Yesterday", detail: { author: "Editor" },
  }]);
  host.reducedMotion = true;
  await act(async () => root.render(<Chronosphere subject={neutral} onReturn={() => {}} />));
  const card = portal.querySelector<HTMLButtonElement>(".chronosphere-card")!;
  expect(card.getAttribute("aria-label")).toBe("Saved draft, Yesterday");
  await act(async () => card.click());
  expect(portal.querySelector(".chronosphere-detail-title")?.textContent).toBe("Saved draft");
  expect(portal.querySelector(".chronosphere-detail-date")?.textContent).toBe("Yesterday");
});

it("passes typed application details to the built-in detail renderer", async () => {
  const record = { id: "draft-1", sequence: 1, title: "Saved draft", dateLabel: "Yesterday", detail: { author: "Editor", lines: ["One", "Two"] }, tint: [0.3, 0.6, 0.9] as const };
  const neutral = createChronosphereAppSubject("draft", "Draft", [record]);
  host.reducedMotion = true;
  const detailRenderer: ChronosphereDetailRenderer<typeof record.detail> = (entry, context) => <>
    <h2 id={context.titleId}>{entry.title}</h2><p id={context.bodyId}>{entry.detail?.author}: {entry.detail?.lines.join(", ")}</p>
  </>;
  const renderDetail = vi.fn(detailRenderer);
  await act(async () => root.render(<Chronosphere subject={neutral} onReturn={() => {}} renderDetail={renderDetail} />));
  await act(async () => portal.querySelector<HTMLButtonElement>(".chronosphere-card")!.click());
  const dialog = portal.querySelector(".chronosphere-detail")!;
  expect(dialog.textContent).toContain("Editor: One, Two");
  expect(renderDetail).toHaveBeenCalledWith(record, { titleId: dialog.getAttribute("aria-labelledby"), bodyId: dialog.getAttribute("aria-describedby") });
});

it("uses resolved NSE motion preferences and responds to changes without repeating captures", async () => {
  const capture = vi.fn(async () => presentShot);
  const view = () => <Chronosphere subject={subject} capturePresent={capture} onReturn={() => {}} />;
  await act(async () => root.render(view()));
  expect(portal.querySelector<HTMLElement>(".chronosphere")?.dataset.reducedMotion).toBe("false");
  host.reducedMotion = true;
  await act(async () => root.render(view()));
  expect(portal.querySelector<HTMLElement>(".chronosphere")?.dataset.reducedMotion).toBe("true");
  expect(portal.querySelector(".chronosphere-curtain")).toBeNull();
  expect(capture).toHaveBeenCalledTimes(1);
  expect(host.app.images.load).toHaveBeenCalledTimes(4);
});

it("keeps one preparation while the caller re-renders with new capture callbacks, and captures through the latest", async () => {
  // Apps pass captures inline; an autosave re-render must not throw the archive away and load it again.
  const pending = deferred<string>(), first = vi.fn(() => pending.promise), latest = vi.fn(async () => presentShot), foreground = vi.fn(async () => foregroundShot);
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={first} captureForeground={foreground} onReturn={() => {}} />));
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={latest} captureForeground={foreground} onReturn={() => {}} />));
  expect(first).toHaveBeenCalledTimes(1); expect(latest).not.toHaveBeenCalled();
  await act(async () => pending.resolve(presentShot));
  expect(foreground).toHaveBeenCalledTimes(1);
  expect(portal.querySelector<HTMLElement>(".chronosphere-card-shot")?.style.backgroundImage).toContain(presentShot);
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={vi.fn(async () => presentShot)} captureForeground={foreground} onReturn={() => {}} />));
  expect(foreground).toHaveBeenCalledTimes(1);
  expect(portal.querySelector(".chronosphere")).not.toBeNull();
});

it("waits for the runtime portal host without repeating preparation", async () => {
  host.portalHost = null;
  const capture = vi.fn(async () => presentShot);
  const view = <Chronosphere subject={subject} capturePresent={capture} onReturn={() => {}} />;
  await act(async () => root.render(view));
  expect(host.vortexMounts).toHaveLength(0);
  host.portalHost = portal;
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capture} onReturn={() => {}} />));
  expect(capture).toHaveBeenCalledTimes(1); expect(host.app.images.load).toHaveBeenCalledTimes(4);
  expect(host.vortexMounts).toHaveLength(1);
});

it("serializes required captures and waits for all Vortex pixels before portaling a generic subject", async () => {
  const present = deferred<string>(), foreground = deferred<string>(), pixels = deferred<void>();
  const capturePresent = vi.fn(() => present.promise), captureForeground = vi.fn(() => foreground.promise);
  host.app.images.load.mockImplementation(() => ({ pixelLease: async () => { await pixels.promise; return { transferImage: () => image, release: leaseRelease }; }, release: imageRelease }));
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capturePresent} captureForeground={captureForeground} onReturn={() => {}} />));
  expect(capturePresent).toHaveBeenCalledTimes(1); expect(captureForeground).not.toHaveBeenCalled();
  expect(portal.querySelector(".chronosphere")).toBeNull();
  expect(portal.querySelector("[data-spinner-variant='dark']")).not.toBeNull();
  expect(portal.textContent).toContain("Opening Chronosphere…");
  await act(async () => present.resolve(presentShot));
  expect(captureForeground).toHaveBeenCalledTimes(1); expect(host.app.images.load).not.toHaveBeenCalled();
  await act(async () => foreground.resolve(foregroundShot));
  expect(host.app.images.load).toHaveBeenCalledTimes(4); expect(host.vortexMounts).toHaveLength(0);
  await act(async () => pixels.resolve());
  expect(container.querySelector(".chronosphere")).toBeNull();
  expect(portal.querySelector(".chronosphere")?.getAttribute("aria-label")).toContain("Documents");
  expect(portal.querySelector<HTMLElement>(".chronosphere-card-shot")?.style.backgroundImage).toContain(presentShot);
  expect(portal.querySelector<HTMLElement>(".chronosphere-curtain")?.style.backgroundImage).toContain(foregroundShot);
  expect(portal.querySelector(".chronosphere")?.getAttribute("data-stage")).toBe("entering");
  expect(host.vortexMounts).toHaveLength(1);
  expect(host.vortexMounts[0]).toMatchObject({ preparedImages: { starNebula: image, coreGlow: image } });
  expect(imageRelease).toHaveBeenCalledTimes(4); expect(leaseRelease).toHaveBeenCalledTimes(4);
});

it("captures once when the present and launching foreground are the same surface", async () => {
  const capture = vi.fn(async () => presentShot);
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capture} captureForeground={capture} onReturn={() => {}} />));
  expect(capture).toHaveBeenCalledTimes(1);
  expect(portal.querySelector<HTMLElement>(".chronosphere-curtain")?.style.backgroundImage).toContain(presentShot);
});

it.each(["present", "foreground", "pixels"])("keeps the caller visible and supports retry after required %s preparation fails", async failure => {
  let failing = true;
  const capturePresent = vi.fn(async () => failure === "present" && failing ? null : presentShot);
  const captureForeground = vi.fn(async () => failure === "foreground" && failing ? null : foregroundShot);
  host.app.images.load.mockImplementation(() => ({ pixelLease: async () => {
    if (failure === "pixels" && failing) throw new Error("Image decode failed");
    return { transferImage: () => image, release: leaseRelease };
  }, release: imageRelease }));
  const preparation = ({ error, retry }: { error?: Error; retry(): void }) => <div>Caller remains visible{error ? <button onClick={retry}>Retry capture</button> : null}</div>;
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capturePresent} captureForeground={captureForeground} onReturn={() => {}} renderPreparation={preparation} />));
  expect(container.textContent).toContain("Caller remains visible"); expect(host.vortexMounts).toHaveLength(0);
  expect(portal.querySelector(".chronosphere")).toBeNull(); expect(host.app.errors.capture).not.toHaveBeenCalled();
  if (failure === "present") expect(captureForeground).not.toHaveBeenCalled();
  if (failure === "pixels") expect(imageRelease).toHaveBeenCalledTimes(4);
  failing = false;
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(portal.querySelector(".chronosphere")).not.toBeNull();
  expect(host.app.errors.capture).not.toHaveBeenCalled();
});

it("keeps a handled sprite failure inline and its mounted Retry usable without host recovery", async () => {
  let failing = true;
  host.app.images.load.mockImplementation(() => ({ pixelLease: async () => {
    if (failing) throw new Error("Image load failed: HTTP 503");
    return { transferImage: () => image, release: leaseRelease };
  }, release: imageRelease }));
  const capture = vi.fn(async () => presentShot);
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capture} onReturn={() => {}} />));
  expect(portal.querySelector("[role=alert]")?.textContent).toContain("HTTP 503");
  const retry = [...portal.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Retry")!;
  expect(retry.textContent).toBe("Retry"); expect(retry.disabled).toBe(false);
  expect(document.querySelector("[role=dialog]")).toBeNull();
  expect(host.app.errors.capture).not.toHaveBeenCalled();
  failing = false;
  await act(async () => retry.click());
  expect(portal.querySelector("[role=alert]")).toBeNull();
  expect(portal.querySelector(".chronosphere")).not.toBeNull();
  expect(capture).toHaveBeenCalledTimes(2);
  expect(host.app.errors.capture).not.toHaveBeenCalled();
});

it("fences a late capture after the scoped mount is aborted", async () => {
  const present = deferred<string>(), capturePresent = vi.fn(() => present.promise), captureForeground = vi.fn(async () => foregroundShot);
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capturePresent} captureForeground={captureForeground} onReturn={() => {}} />));
  await act(async () => { mountSignal.abort(); present.resolve(presentShot); });
  expect(captureForeground).not.toHaveBeenCalled(); expect(host.app.images.load).not.toHaveBeenCalled();
  expect(portal.querySelector(".chronosphere")).toBeNull(); expect(host.app.errors.capture).not.toHaveBeenCalled();
});

it("aborts asset preparation on unmount and releases all late pixel leases", async () => {
  const pixels = deferred<void>(), signals: AbortSignal[] = [];
  host.app.images.load.mockImplementation(() => ({ pixelLease: async (signal: AbortSignal) => { signals.push(signal); await pixels.promise; return { transferImage: () => image, release: leaseRelease }; }, release: imageRelease }));
  const capture = async () => presentShot;
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capture} onReturn={() => {}} />));
  await act(async () => { root.unmount(); root = createRoot(container); });
  expect(signals.every(signal => signal.aborted)).toBe(true);
  await act(async () => pixels.resolve());
  expect(imageRelease).toHaveBeenCalledTimes(4); expect(leaseRelease).toHaveBeenCalledTimes(4);
  expect(host.vortexMounts).toHaveLength(0);
});

it("returns and dismisses exactly once when Escape arrives before the first opening frame", async () => {
  const capture = async () => presentShot, onReturn = vi.fn();
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capture} onReturn={onReturn} />));
  const view = portal.querySelector(".chronosphere")!;
  await act(async () => { view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(onReturn).toHaveBeenCalledTimes(1); expect(portal.querySelector(".chronosphere")).toBeNull();
  expect(frameCallbacks.size).toBe(0);
});

it("glides the whole foreground straight down, full size, and returns it once with the original motion curves", async () => {
  const plays: { definition: Record<string, any>; settle(): void }[] = [], onReturn = vi.fn();
  host.app.animations.animate.mockImplementation((target: HTMLElement, definition: Record<string, any>) => {
    const finished = deferred<{ state: string }>();
    if (target.classList.contains("chronosphere-curtain")) plays.push({ definition, settle: () => finished.resolve({ state: "completed" }) });
    return { dispose() {}, finished: finished.promise };
  });
  const capture = async () => presentShot;
  await act(async () => root.render(<Chronosphere subject={subject} capturePresent={capture} onReturn={onReturn} />));
  await act(async () => { const callbacks = [...frameCallbacks]; frameCallbacks.clear(); callbacks.forEach(callback => callback()); });
  const entry = plays[0];
  expect(entry.definition.duration).toBe(0.9);
  expect(entry.definition.animations[0].to).toMatch(/^translate3d\(0, [\d.]+%, 0\)$/);
  const view = portal.querySelector(".chronosphere")!;
  await act(async () => view.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  const exit = plays.at(-1)!; expect(exit.definition.duration).toBe(0.62);
  expect(exit.definition.animations[0].to).toBe("translate3d(0, 0, 0)");
  await act(async () => entry.settle()); expect(onReturn).not.toHaveBeenCalled();
  await act(async () => exit.settle()); expect(onReturn).toHaveBeenCalledTimes(1);
});

const history = createChronosphereAppSubject("post", "Launch notes", [
  { id: "now", sequence: 3, title: "Launch notes", displayLabel: "Now", dateLabel: "Today", summary: "As it is", isCurrent: true, tint: [1, 1, 1] },
  { id: "v2", sequence: 2, title: "Launch notes", displayLabel: "Earlier", dateLabel: "Yesterday", summary: "Second draft", tint: [1, 1, 1] },
  { id: "v1", sequence: 1, title: "Launch notes", displayLabel: "First", dateLabel: "Monday", summary: "First draft", tint: [1, 1, 1] },
]);

it("keeps the captured current page when the caller returns null for its live face", async () => {
  host.reducedMotion = true;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000, x: 0, y: 0, top: 0, left: 0, right: 1600, bottom: 1000, toJSON() {} });
  const paper = createChronosphereAppSubject("post", "Launch notes", [...history.entries], { layout: "versions", card: { aspectRatio: 0.75, faceWidth: 624, material: "paper", cornerRadius: 0 } });
  await act(async () => root.render(<Chronosphere subject={paper} capturePresent={async () => presentShot} onReturn={() => {}}
    renderFace={(entry) => entry.isCurrent ? null : <article>{entry.summary}</article>} />));
  expect(portal.querySelector<HTMLElement>(".chronosphere-present .chronosphere-card-shot")?.style.backgroundImage).toContain(presentShot);
  expect(portal.querySelector(".chronosphere-present .chronosphere-card-surface")).toBeNull();
});

it("cancels unfinished card entrance animations when history travel takes over", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000, x: 0, y: 0, top: 0, left: 0, right: 1600, bottom: 1000, toJSON() {} });
  const cardDisposals: ReturnType<typeof vi.fn>[] = [];
  host.app.animations.animate.mockImplementation((target: HTMLElement) => {
    const dispose = vi.fn();
    if (target.dataset.travelOwned === "true") cardDisposals.push(dispose);
    return { dispose, progress: 0.2, finished: new Promise(() => {}) };
  });
  const paper = createChronosphereAppSubject("post", "Launch notes", [...history.entries], { layout: "versions", card: { aspectRatio: 0.75, material: "paper" } });
  await act(async () => root.render(<Chronosphere subject={paper} capturePresent={async () => presentShot} onReturn={() => {}} />));
  await act(async () => { const callbacks = [...frameCallbacks]; frameCallbacks.clear(); callbacks.forEach(callback => callback()); });
  expect(cardDisposals.length).toBeGreaterThan(0);
  const entrance = [...cardDisposals];
  await act(async () => portal.querySelector(".chronosphere")!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(portal.querySelector<HTMLElement>(".chronosphere")?.dataset.travelling).toBe("true");
  for (const dispose of entrance) expect(dispose).toHaveBeenCalledTimes(1);
});

it("keeps real page faces behind the selected version and starts dummy frames after the oldest", async () => {
  host.reducedMotion = true;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1600, height: 1000, x: 0, y: 0, top: 0, left: 0, right: 1600, bottom: 1000, toJSON() {} });
  const saved = Array.from({ length: 12 }, (_, index) => ({ ...history.entries[1], id: `saved-${index}`, sequence: 12 - index, displayLabel: `Version ${12 - index}` }));
  const paper = createChronosphereAppSubject("post", "Launch notes", [{ ...history.entries[0], sequence: 13 }, ...saved], { layout: "versions", card: { aspectRatio: 0.75, material: "paper" } });
  await act(async () => root.render(<Chronosphere subject={paper} capturePresent={async () => presentShot} onReturn={() => {}}
    renderFace={(entry, context) => <article data-real-page={entry.id} data-detail={context.detail}>{entry.summary}</article>} />));
  expect(portal.querySelectorAll(".chronosphere-stage [data-real-page]")).toHaveLength(12);
  expect(Number(portal.querySelector<HTMLElement>(".chronosphere-backframe")?.dataset.depth)).toBe(12);
  expect(portal.querySelector(".chronosphere-card[data-placeholder]")).toBeNull();
});

it("hands an app's own view the model, its prepared work and the actions, and needs no capture", async () => {
  const seen: ChronosphereViewProps<{ readonly stars: number }>[] = [];
  const prepare = vi.fn(async ({ images, signal }: import("../../../src/SynCloudOS/AppSDK/Chronosphere/Chronosphere").ChronospherePreparationContext) => {
    expect(signal.aborted).toBe(false);
    expect(images).toBe(host.app.images);
    return { stars: 3 };
  });
  const OwnView: ChronosphereViewComponent<{ readonly stars: number }> = Object.assign((props: ChronosphereViewProps<{ readonly stars: number }>) => {
    seen.push(props);
    return <button data-own-view onClick={() => { props.actions.restore?.(props.model.entries[1]!); props.actions.exit(); }}>{props.model.entries.length}</button>;
  }, { prepare });
  const onRestore = vi.fn(), onReturn = vi.fn();
  await act(async () => root.render(<Chronosphere subject={history} view={OwnView} onRestore={onRestore} onReturn={onReturn} labels={{ done: "Fini" }} />));
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(host.app.images.load).not.toHaveBeenCalled();
  const props = seen.at(-1)!;
  expect(props.model).toMatchObject({ presentImage: null, foregroundImage: null, presentRect: null, prepared: { stars: 3 } });
  expect(props.model.entries.map(entry => entry.id)).toEqual(["now", "v2", "v1"]);
  expect(props.model.labels).toMatchObject({ done: "Fini", restore: "Restore" });
  await act(async () => portal.querySelector<HTMLButtonElement>("[data-own-view]")!.click());
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: "v2" }));
  expect(onReturn).toHaveBeenCalledTimes(1);
  expect(portal.querySelector("[data-own-view]")).toBeNull();
});

it("offers no restore to a view when the history is read-only", async () => {
  let actions: ChronosphereViewProps["actions"] | undefined;
  const Museum: ChronosphereViewComponent = (props) => { actions = props.actions; return null; };
  await act(async () => root.render(<Chronosphere subject={history} view={Museum} onReturn={() => {}} />));
  expect(actions).toBeDefined(); expect(actions!.restore).toBeUndefined();
});

it("renders memo and forwardRef custom views as React components", async () => {
  const onReturn = vi.fn();
  const OwnView = React.memo(React.forwardRef<HTMLButtonElement, ChronosphereViewProps>((props, ref) => {
    const [clicked, setClicked] = React.useState(false);
    return <button ref={ref} data-react-view onClick={() => { setClicked(true); props.actions.exit(); }}>{clicked ? "Done" : props.model.subject.label}</button>;
  }));
  await act(async () => root.render(<Chronosphere subject={history} view={OwnView} onReturn={onReturn} />));
  expect(portal.querySelector("[data-react-view]")?.textContent).toBe(history.label);
  await act(async () => portal.querySelector<HTMLButtonElement>("[data-react-view]")!.click());
  expect(onReturn).toHaveBeenCalledTimes(1);
});

it("lays every version out in the grid view, chooses with the keyboard, restores and leaves", async () => {
  host.reducedMotion = true;
  const onRestore = vi.fn(), onReturn = vi.fn();
  await act(async () => root.render(<Chronosphere subject={history} view={ChronosphereGridView} onRestore={onRestore} onReturn={onReturn} />));
  const tiles = () => [...portal.querySelectorAll<HTMLElement>(".chronosphere-grid-tile")];
  expect(tiles().map(tile => tile.getAttribute("aria-label"))).toEqual(["Launch notes, Today", "Launch notes, Yesterday", "Launch notes, Monday"]);
  expect(tiles()[0]!.querySelector(".chronosphere-grid-now")?.textContent).toBe("Now");
  const restore = () => [...portal.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Restore")!;
  // The present cannot be restored over itself.
  expect(restore().disabled).toBe(true);
  const list = portal.querySelector<HTMLElement>(".chronosphere-grid-scroll")!;
  await act(async () => { list.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); });
  expect(tiles()[2]!.getAttribute("aria-selected")).toBe("true");
  expect(portal.querySelector(".chronosphere-grid-detail")?.textContent).toContain("Monday");
  expect(restore().disabled).toBe(false);
  await act(async () => { list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: "v1" }));
  expect(onReturn).toHaveBeenCalledTimes(1);
  expect(portal.querySelector(".chronosphere-grid")).toBeNull();
});

it("draws a document's own page on each grid tile, scaled from its face width", async () => {
  host.reducedMotion = true;
  const paper = createChronosphereAppSubject("post", "Launch notes", [...history.entries], { card: { aspectRatio: 0.75, faceWidth: 624, material: "paper", cornerRadius: 0 } });
  await act(async () => root.render(<Chronosphere subject={paper} view={ChronosphereGridView} onReturn={() => {}}
    renderFace={(entry, context) => <article data-face={entry.id} data-pane={context.pane}>{entry.summary}</article>} />));
  const faces = [...portal.querySelectorAll<HTMLElement>(".chronosphere-grid-face")];
  expect(faces.map(face => face.querySelector("article")?.dataset.pane)).toEqual(["present", "past", "past"]);
  expect(faces[0]!.style.width).toBe("624px"); expect(faces[0]!.style.transform).toBe(`scale(${208 / 624})`);
  expect(portal.querySelector(".chronosphere-grid")?.getAttribute("data-material")).toBe("paper");
  // Escape leaves the archive.
  await act(async () => { portal.querySelector(".chronosphere-grid-scroll")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  expect(portal.querySelector(".chronosphere-grid")).toBeNull();
});
