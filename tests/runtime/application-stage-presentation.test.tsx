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
import React from "react";
import { createPortal } from "react-dom";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileNSEPresentation, NSEPresence, type NSEPresentationEnter, type NSEPresentationSpec } from "../../src/NSE/Animation";
import { useNSEOverlayProvider } from "../../src/NSE/Overlays";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { resolveApplicationStageMotion } from "../../src/Webspring/ApplicationStage.transitions";
import { ApplicationStageView } from "../../src/Webspring/ApplicationStageView";
import { HostSiteBrandingProvider, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { authoriseTestRuntime, createTestBundle, createTestRuntime, createTestRuntimeEnvironment, registerTestSynWare } from "./helpers";
import type {
  RuntimeAnimationAdapterFactory,
  RuntimeAnimationAdapterLease,
  RuntimeAnimationPlayback,
  RuntimeAnimationRequest,
} from "../../src/SynCloudOS/AnimationFX";

afterEach(cleanup);

const resolved = (enter: NSEPresentationEnter, previous: string | null): NSEPresentationSpec | null =>
  typeof enter === "function" ? enter(previous) : enter;
const endpoints = (spec: NSEPresentationSpec | null) =>
  Object.fromEntries(compileNSEPresentation(spec!, "t").animations.map(({ keyPath, from, to }) => [keyPath, [from, to]]));

describe("stage presentation", () => {
  it.each([null, "incoming", "outgoing"] as const)("keeps content-owned %s presentations free of host motion", role => {
    for (const staged of [true, false]) {
      const motion = resolveApplicationStageMotion({ reducedMotion: false, role, staged, launching: true, presentationMotion: "content" });
      for (const part of [motion.root, motion.surface]) {
        expect(part.enter).toBeNull();
        expect(part.exit).toBeNull();
        expect(part.style.transform).toBeUndefined();
      }
      expect(motion.root.style.opacity).toBe(staged ? 0 : undefined);
    }
  });
  it("launches from staging: the staged model is the zoom's first pose, and presenting ends at identity", () => {
    const staged = resolveApplicationStageMotion({ reducedMotion: false, role: null, staged: true, launching: false });
    expect(staged.surface).toMatchObject({ state: "staged", style: { opacity: 0, transform: "translate(0px, 0px) scale(0.04)" }, enter: null });
    expect(staged.root).toMatchObject({ state: "staged", style: { opacity: 0 } });
    const presented = resolveApplicationStageMotion({ reducedMotion: false, role: null, staged: false, launching: false });
    expect(presented.surface.style).toEqual({});
    const zoom = resolved(presented.surface.enter, "staged");
    expect(zoom).toMatchObject({ duration: 0.68 });
    expect(endpoints(zoom)).toEqual({ opacity: [0, 1], transform: ["translate(0px, 0px) scale(0.04)", "none"] });
    // Leaving an incoming MultiSwitch role does not replay the launch.
    expect(resolved(presented.surface.enter, "incoming")).toBeNull();
    expect(resolved(presented.root.enter, "incoming")).toBeNull();
    const launching = resolveApplicationStageMotion({ reducedMotion: false, role: null, staged: false, launching: true });
    expect(resolved(launching.surface.enter, null)).toMatchObject({ delay: 0.72 });
  });

  it("exits from the pose the element shows, so a staged window never flashes", () => {
    const staged = resolveApplicationStageMotion({ reducedMotion: false, role: null, staged: true, launching: false });
    const exit = compileNSEPresentation(staged.surface.exit!, "surface", "exit");
    expect(exit.animations.find(({ keyPath }) => keyPath === "opacity")!.keyframes!.every(({ value }) => value === 0)).toBe(true);
    expect(exit.animations.find(({ keyPath }) => keyPath === "transform")).toMatchObject({ from: "translate(0px, 0px) scale(0.04)" });
    expect(staged.root.exit).toMatchObject({ delay: 0.3, duration: 0.2 });
    expect(endpoints(staged.root.exit)).toEqual({ opacity: [0, 0] });
    const presented = resolveApplicationStageMotion({ reducedMotion: false, role: null, staged: false, launching: false });
    // The plane shrinks for 0.48 s while its opacity follows from 0.22 s to 0.44 s.
    const surfaceExit = compileNSEPresentation(presented.surface.exit!, "surface", "exit");
    const opacity = surfaceExit.animations.find(({ keyPath }) => keyPath === "opacity")!.keyframes!;
    expect(surfaceExit.duration).toBe(0.48);
    expect(opacity.find(({ offset }) => offset > 0.22 / 0.48 - 0.01 && offset < 0.22 / 0.48)!.value).toBe(1);
    expect(opacity.find(({ offset }) => offset > 0.44 / 0.48)!.value).toBe(0);
  });

  it("holds each MultiSwitch plane at the pose its presentation ends on", () => {
    const outgoing = resolveApplicationStageMotion({ reducedMotion: false, role: "outgoing", staged: false, launching: false });
    expect(outgoing.surface.style).toEqual({
      opacity: 0.94,
      filter: "brightness(0.4)",
      transform: "translate3d(0px, 0px, -260px) scale(0.86) rotateY(22deg)",
    });
    expect(endpoints(resolved(outgoing.surface.enter, "presented"))).toEqual({
      opacity: [1, 0.94],
      filter: ["none", "brightness(0.4)"],
      transform: ["translate3d(0px, 0px, -24px) scale(0.98) rotateY(2deg)", "translate3d(0px, 0px, -260px) scale(0.86) rotateY(22deg)"],
    });
    expect(outgoing.root.style).toEqual({ transform: "translate(-118vw, 0vw) scale(1)" });
    expect(endpoints(outgoing.surface.exit)).toEqual({ opacity: [0.94, 0] });
    const incoming = resolveApplicationStageMotion({ reducedMotion: false, role: "incoming", staged: false, launching: false });
    expect(incoming.surface.style).toEqual({});
    expect(endpoints(resolved(incoming.root.enter, null))).toEqual({ transform: ["translate(118vw, 0vw) scale(1)", "none"] });
    expect(endpoints(resolved(incoming.surface.enter, null))).toEqual({
      transform: ["translate3d(0px, 0px, -260px) scale(0.86) rotateY(-22deg)", "none"],
    });
  });

  it("uses opacity-only variants under reduced motion", () => {
    const outgoing = resolveApplicationStageMotion({ reducedMotion: true, role: "outgoing", staged: false, launching: false });
    expect(outgoing.surface.style).toEqual({ opacity: 0 });
    expect(outgoing.root.style).toEqual({ opacity: 0 });
    expect(endpoints(resolved(outgoing.root.enter, "presented"))).toEqual({ opacity: [1, 0] });
    const presented = resolveApplicationStageMotion({ reducedMotion: true, role: null, staged: false, launching: false });
    expect(endpoints(resolved(presented.surface.enter, null))).toEqual({ opacity: [0, 1] });
    expect(presented.navigationBack).toBeNull();
    expect(endpoints(presented.surface.exit)).toEqual({ opacity: [1, 0] });
  });
});

class Presentations implements RuntimeAnimationAdapterFactory {
  readonly played: Array<{ request: RuntimeAnimationRequest; finish(): Promise<void> }> = [];
  acquire(): RuntimeAnimationAdapterLease {
    return {
      adapter: {
        animate: (request) => {
          let resolve!: (state: "completed" | "cancelled") => void;
          const finished = new Promise<"completed" | "cancelled">((done) => { resolve = done; });
          const playback: RuntimeAnimationPlayback = {
            finished, progress: () => 0, pause() {}, play() {}, seek() {}, dispose() {},
            cancel: () => resolve("cancelled"),
          };
          this.played.push({ request, finish: async () => { resolve("completed"); await act(async () => { await finished; }); } });
          return playback;
        },
        diagnostics: () => ({ activeCount: 0, listenerCount: 0, timerCount: 0 }),
        dispose() {},
      },
      release() {},
    };
  }
  of(selector: string) {
    return this.played.filter(({ request }) => (request.target as Element).matches(selector));
  }
}

describe("mounted content presentation", () => {
  it("keeps content staged until presentation, settles without host motion, and exits once", async () => {
    const presentations = new Presentations();
    const runtime = authoriseTestRuntime(createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animation: presentations } }));
    let overlay: ReturnType<typeof useNSEOverlayProvider> | undefined;
    function Content() {
      overlay = useNSEOverlayProvider();
      return <div data-content="true">{overlay.portalHost ? createPortal(<div data-viewport-overlay="true" />, overlay.portalHost) : null}</div>;
    }
    const app = registerTestSynWare(runtime, createSynWare({
      manifest: { schemaVersion: 1, bundleIdentifier: "com.example.content-plane", version: "1.0.0", displayName: "Content Plane", frame: { topBar: "none", presentationMotion: "content" } },
      root: Content,
    }));
    await runtime.bundles.loadBundle(app.bundleIdentifier);
    const settlement = runtime.presentationSettlements.begin({ operationId: "content-enter", roles: ["application-enter"], timeoutMs: 10_000 });
    const exited = vi.fn();
    const registry = new WindowContentRendererRegistry();
    const fixture = (staged: boolean, shown = true) => <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={{ name: "Stage", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Stage" }}>
        <NSEPresence onExitComplete={exited}>{shown ? <ApplicationStageView key={app.bundleIdentifier} windowContentRegistry={registry}
          stage={{ id: "application-stage:com.example.content-plane", appId: app.bundleIdentifier, title: app.window.title, isFocused: true, zIndex: 2 }}
          app={app} lifecycle="active" staged={staged} presentationSettlementId={settlement.id} /> : null}</NSEPresence>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>;
    const rendered = render(fixture(true));
    const frame = rendered.container.querySelector<HTMLElement>(".webspring-app-view-frame")!;
    const destination = rendered.container.querySelector<HTMLElement>(".webspring-app-overlay-destination")!;
    expect(frame.style.opacity).toBe("0");
    expect(frame.hasAttribute("inert")).toBe(true);
    expect(destination.hasAttribute("inert")).toBe(true);
    expect(getComputedStyle(destination).visibility).toBe("hidden");
    expect(runtime.presentationSettlements.inspect(settlement.id)).toMatchObject({ status: "pending", completedRoles: [] });
    expect(destination.contains(overlay!.portalHost!)).toBe(true);
    expect(destination.closest(".webspring-app-view-frame")).toBeNull();
    expect(destination.querySelector("[data-viewport-overlay]")).not.toBeNull();
    const hosts = destination.querySelectorAll("[data-nse-overlay-portal-host]");
    expect(hosts).toHaveLength(2);
    expect(hosts[0]!.getAttribute("data-nse-overlay-provider")).not.toBe(hosts[1]!.getAttribute("data-nse-overlay-provider"));
    rendered.rerender(fixture(false));
    expect(frame.style.opacity).toBe("");
    expect(frame.hasAttribute("inert")).toBe(false);
    expect(destination.hasAttribute("inert")).toBe(false);
    expect(getComputedStyle(destination).visibility).toBe("visible");
    expect(destination.style.transform).toBe("");
    expect(runtime.presentationSettlements.inspect(settlement.id)).toEqual({ status: "settled" });
    expect(presentations.played).toHaveLength(0);
    rendered.rerender(fixture(false, false));
    await act(async () => {});
    expect(rendered.container.querySelector(".webspring-app-view-frame")).toBeNull();
    expect(rendered.container.querySelector(".webspring-app-overlay-destination")).toBeNull();
    expect(exited).toHaveBeenCalledTimes(1);
    expect(presentations.played).toHaveLength(0);
    rendered.unmount();
    await runtime.dispose("content stage regression");
  });
});

describe("stage overlay ownership", () => {
  async function fixture() {
    const presentations = new Presentations();
    const runtime = authoriseTestRuntime(createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animation: presentations } }));
    function Content() {
      const overlay = useNSEOverlayProvider();
      return overlay.portalHost ? createPortal(<button data-viewport-overlay="true">Overlay action</button>, overlay.portalHost) : null;
    }
    const app = registerTestSynWare(runtime, createSynWare({
      manifest: { schemaVersion: 1, bundleIdentifier: "com.example.overlay-owner", version: "1.0.0", displayName: "Overlay Owner", frame: { topBar: "none" } },
      root: Content,
    }));
    await runtime.bundles.loadBundle(app.bundleIdentifier);
    const exited = vi.fn();
    const onRole = vi.fn();
    const registry = new WindowContentRendererRegistry();
    const view = (staged = false, role: "incoming" | "outgoing" | null = null, shown = true) => <SynCloudOSProvider runtime={runtime}>
      <HostSiteBrandingProvider value={{ name: "Stage", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null, logoAlt: "Stage" }}>
        <NSEPresence initial={false} onExitComplete={exited}>{shown ? <ApplicationStageView key={app.bundleIdentifier}
          windowContentRegistry={registry} app={app} lifecycle="active" staged={staged}
          stage={{ id: "application-stage:com.example.overlay-owner", appId: app.bundleIdentifier, title: app.window.title, isFocused: true, zIndex: 2 }}
          multiSwitchRole={role} multiSwitchId={role ? "overlay-switch" : null} onMultiSwitchAnimationComplete={onRole} /> : null}</NSEPresence>
      </HostSiteBrandingProvider>
    </SynCloudOSProvider>;
    return { runtime, presentations, exited, onRole, view };
  }

  it("hides staged portals visually as well as from interaction, then presents them outside frame clipping", async () => {
    const { runtime, view } = await fixture();
    const rendered = render(view(true));
    const destination = rendered.container.querySelector<HTMLElement>(".webspring-app-overlay-destination")!;
    expect(destination.querySelector("[data-viewport-overlay]")).not.toBeNull();
    expect(destination.closest(".webspring-app-view-frame")).toBeNull();
    expect(getComputedStyle(destination).visibility).toBe("hidden");
    expect(destination.hasAttribute("inert")).toBe(true);
    rendered.rerender(view(false));
    expect(getComputedStyle(destination).visibility).toBe("visible");
    expect(destination.hasAttribute("inert")).toBe(false);
    rendered.unmount();
    await runtime.dispose("staged overlay regression");
  });

  it("moves outgoing overlays with their stage and disables their interaction without reporting the role twice", async () => {
    const { runtime, presentations, onRole, view } = await fixture();
    const rendered = render(view());
    rendered.rerender(view(false, "outgoing"));
    const frame = rendered.container.querySelector<HTMLElement>(".webspring-app-view-frame")!;
    const destination = rendered.container.querySelector<HTMLElement>(".webspring-app-overlay-destination")!;
    expect(destination.style.transform).toBe(frame.style.transform);
    expect(destination.hasAttribute("inert")).toBe(true);
    expect(frame.hasAttribute("inert")).toBe(true);
    const slide = presentations.of(".webspring-app-view-frame").at(-1)!;
    const overlaySlide = presentations.of(".webspring-app-overlay-destination").at(-1)!;
    expect(overlaySlide.request.duration).toBe(slide.request.duration);
    expect(overlaySlide.request.animations.map(({ targetId: _target, ...track }) => track))
      .toEqual(slide.request.animations.map(({ targetId: _target, ...track }) => track));
    await overlaySlide.finish();
    expect(onRole).not.toHaveBeenCalled();
    await slide.finish();
    expect(onRole).toHaveBeenCalledExactlyOnceWith("overlay-switch", "outgoing");
    rendered.unmount();
    await runtime.dispose("outgoing overlay regression");
  });

  it("runs ordinary portal exits with the same frame and surface presentations and removes the stage once", async () => {
    const { runtime, presentations, exited, view } = await fixture();
    const rendered = render(view());
    rendered.rerender(view(false, null, false));
    const frame = rendered.container.querySelector<HTMLElement>(".webspring-app-view-frame")!;
    const destination = rendered.container.querySelector<HTMLElement>(".webspring-app-overlay-destination")!;
    expect(destination.hasAttribute("inert")).toBe(true);
    expect(frame.hasAttribute("inert")).toBe(true);
    const exit = (selector: string) => presentations.of(selector).find(({ request }) => request.fill === "forwards")!;
    const frameExit = exit(".webspring-app-view-frame");
    const surfaceExit = exit(".webspring-app-view-surface");
    const destinationExit = exit(".webspring-app-overlay-destination");
    const overlayExit = exit(".webspring-app-overlay-plane");
    const withoutTargets = (request: RuntimeAnimationRequest) => ({ ...request, target: undefined,
      animations: request.animations.map(({ targetId: _target, ...track }) => track) });
    expect(withoutTargets(destinationExit.request)).toEqual(withoutTargets(frameExit.request));
    expect(withoutTargets(overlayExit.request)).toEqual(withoutTargets(surfaceExit.request));
    await frameExit.finish();
    await surfaceExit.finish();
    expect(destination.isConnected).toBe(true);
    expect(exited).not.toHaveBeenCalled();
    await destinationExit.finish();
    await overlayExit.finish();
    expect(rendered.container.querySelector(".webspring-app-overlay-destination")).toBeNull();
    expect(exited).toHaveBeenCalledTimes(1);
    rendered.unmount();
    await runtime.dispose("ordinary overlay exit regression");
  });
});

describe("stage view MultiSwitch", () => {
  it("reports each role when its slide lands, and the incoming slide settles the presentation", async () => {
    const presentations = new Presentations();
    const runtime = createTestRuntime({ environment: { ...createTestRuntimeEnvironment(), animation: presentations } });
    runtime.apps.registerBundle(createTestBundle({ bundleIdentifier: "com.example.switched", route: "/switched" }));
    const app = runtime.apps.getApp("com.example.switched")!;
    const settlement = runtime.presentationSettlements.begin({
      operationId: "operation:switch", roles: ["application-enter", "webspring-shell-return"], timeoutMs: 1_000,
    });
    const onRole = vi.fn();
    const view = (role: "incoming" | "outgoing") => (
      <SynCloudOSProvider runtime={runtime}>
        <ApplicationStageView
          windowContentRegistry={new WindowContentRendererRegistry()}
          stage={{ id: "application-stage:com.example.switched", appId: "com.example.switched", title: app.window.title, isFocused: true, zIndex: 1 }}
          app={app}
          lifecycle="active"
          multiSwitchId="switch:1"
          multiSwitchRole={role}
          presentationSettlementId={settlement.id}
          onMultiSwitchAnimationComplete={onRole}
        />
      </SynCloudOSProvider>
    );
    const rendered = render(view("incoming"));
    const [slide] = presentations.of(".webspring-app-view-frame");
    expect(slide!.request.animations[0]).toMatchObject({ keyPath: "transform", from: "translate(118vw, 0vw) scale(1)", to: "none" });
    expect(onRole).not.toHaveBeenCalled();
    await slide!.finish();
    expect(onRole).toHaveBeenCalledWith("switch:1", "incoming");
    expect(runtime.presentationSettlements.inspect(settlement.id)).toEqual({ status: "settled" });

    // The same plane, switched away from: the frame slides out and the
    // surface recedes, holding its model pose once the presentation ends.
    rendered.rerender(view("outgoing"));
    const surface = rendered.container.querySelector<HTMLElement>(".webspring-app-view-surface")!;
    expect(surface.style.transform).toBe("translate3d(0px, 0px, -260px) scale(0.86) rotateY(22deg)");
    expect(surface.style.filter).toBe("brightness(0.4)");
    const out = presentations.of(".webspring-app-view-frame").at(-1)!;
    expect(out.request.animations[0]).toMatchObject({ from: "none", to: "translate(-118vw, 0vw) scale(1)" });
    await out.finish();
    expect(onRole).toHaveBeenLastCalledWith("switch:1", "outgoing");
    expect(onRole).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });
});
