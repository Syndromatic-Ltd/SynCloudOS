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
import { act, cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NSEAnimationEnvironmentProvider, compileNSEPresentation, type NSEAnimator, type NSEPresentationEnter } from "../../src/NSE/Animation";
import type { AFXAnimationDefinition, AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { NotificationCentrePresenter } from "../../src/Webspring/NotificationCentrePresenter";
import { resolveNotificationMotion } from "../../src/Webspring/NotificationCentre.transitions";
import { createTestRuntime } from "./helpers";

const resolved = (enter: NSEPresentationEnter, previous: string | null) => typeof enter === "function" ? enter(previous) : enter;
const endpoints = (spec: Parameters<typeof compileNSEPresentation>[0] | null) =>
  Object.fromEntries(compileNSEPresentation(spec!, "t", "enter", {}, { height: 80 }).animations.map(({ keyPath, from, to }) => [keyPath, [from, to]]));

beforeEach(() => {
  // jsdom cannot capture the screen slice; the banner uses its fallback face.
  window.localStorage.setItem("SynCloudOS4:debug.notificationScreenCapture", "disabled");
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("notification presentations", () => {
  it("flips the banner rotor in, away for a replacement and back, and away on dismissal", () => {
    const motion = resolveNotificationMotion(false);
    expect(motion.rotor("hidden")).toMatchObject({ style: { transform: "translate(0px, 0px) scale(1) rotateX(92deg)" }, enter: null });
    const presented = motion.rotor("presented");
    expect(presented.style).toEqual({});
    expect(resolved(presented.enter, "hidden")).toMatchObject({ duration: 0.42 });
    expect(endpoints(resolved(presented.enter, "hidden"))).toEqual({ transform: ["translate(0px, 0px) scale(1) rotateX(92deg)", "none"] });
    expect(resolved(presented.enter, "incoming")).toMatchObject({ duration: 0.24 });
    expect(endpoints(resolved(motion.rotor("replaced").enter, "presented"))).toEqual({ transform: ["none", "translate(0px, 0px) scale(1) rotateX(92deg)"] });
    expect(motion.rotorExit("presented")).toMatchObject({ duration: 0.36 });
    // A banner dismissed before its flip leaves edge-on rather than flashing flat.
    expect(endpoints(motion.rotorExit("hidden"))).toEqual({ transform: ["translate(0px, 0px) scale(1) rotateX(92deg)", "translate(0px, 0px) scale(1) rotateX(92deg)"] });
    expect(motion.bannerScreenFace.style).toEqual({ opacity: 0.82, filter: "brightness(0.72) saturate(0.92)" });
    expect(endpoints(resolved(motion.bannerScreenFace.enter, null))).toEqual({
      opacity: [1, 0.82], filter: ["none", "brightness(0.72) saturate(0.92)"],
    });
  });

  it("grows a group to its measured height and closes the centre with its own curve", () => {
    const motion = resolveNotificationMotion(false);
    expect(endpoints(motion.group.enter)).toEqual({ opacity: [0, 1], height: ["0px", "80px"] });
    expect(endpoints(motion.group.exit)).toEqual({ opacity: [1, 0], height: ["80px", "0px"] });
    expect(motion.centre.exit).toMatchObject({ duration: 0.2, timing: { kind: "cubic-bezier", x1: 0.62 } });
    expect(motion.dragRelease!(-20)).toMatchObject({ timing: { kind: "spring", stiffness: 500, damping: 25 } });
  });

  it("only fades under reduced motion and has no drag spring", () => {
    const motion = resolveNotificationMotion(true);
    expect(endpoints(motion.group.enter)).toEqual({ opacity: [0, 1] });
    expect(motion.bannerScreenFace).toEqual({ style: { opacity: 0 }, enter: null });
    expect(motion.dragRelease).toBeNull();
    expect(endpoints(resolved(motion.rotor("presented").enter, "hidden"))).toEqual({
      opacity: [0, 1], transform: ["translate(0px, -6px) scale(1)", "none"],
    });
  });
});

function recordingAnimator() {
  const played: Array<{ target: Element; definition: AFXAnimationDefinition; settle(): Promise<void> }> = [];
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(target, definition) {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
        played.push({
          target: target as Element, definition: definition as AFXAnimationDefinition,
          async settle() { resolve({ state: "completed", reduced: false }); await act(async () => { await finished; }); },
        });
        return { id: "a", finished, progress: 0, state: "running", cancel: () => resolve({ state: "cancelled", reduced: false }),
          seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"],
  };
  const on = (selector: string) => played.filter(({ target }) => target.matches(selector));
  return { animator, played, on };
}

/** Fires a pointer event at a given time. jsdom ignores a timeStamp in the
 * event init and stamps real time, so a gesture's speed would otherwise
 * depend on how fast the test runs. */
function pointerAt(type: "pointerDown" | "pointerMove" | "pointerUp", target: Element, init: Record<string, unknown>, timeStamp: number) {
  const event = createEvent[type](target, init);
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  fireEvent(target, event);
}

async function bannerFixture() {
  const runtime = createTestRuntime();
  await runtime.notifications.post({ kind: "system", title: "Backup finished", message: "All documents are safe." });
  const { animator, on } = recordingAnimator();
  const view = (open?: { key: number }) => (
    <SynCloudOSProvider runtime={runtime}>
      <NSEAnimationEnvironmentProvider animator={animator} reducedMotion={false}>
        <NotificationCentrePresenter snapshot={runtime.store.getSnapshot()} openRequest={open ?? null} />
      </NSEAnimationEnvironmentProvider>
    </SynCloudOSProvider>
  );
  const rendered = render(view());
  await act(async () => { await Promise.resolve(); });
  return { runtime, rendered, view, on };
}

describe("notification banner", () => {
  it("flips in once presented and dismisses on an upward pull", async () => {
    const { runtime, rendered, on } = await bannerFixture();
    const flip = on(".syncloudos-notification-cube-rotor").at(-1)!;
    expect(flip.definition.animations[0]).toMatchObject({ keyPath: "transform", to: "none" });
    const dismiss = vi.spyOn(runtime.notifications, "dismiss");
    const article = rendered.container.querySelector<HTMLElement>(".syncloudos-notification-banner")!;
    fireEvent.pointerDown(article, { pointerId: 1, isPrimary: true, button: 0, clientY: 100 });
    fireEvent.pointerMove(article, { pointerId: 1, isPrimary: true, clientY: 80 });
    expect(article.style.transform).toBe("translateY(-20px)");
    fireEvent.pointerMove(article, { pointerId: 1, isPrimary: true, clientY: 40 });
    fireEvent.pointerUp(article, { pointerId: 1, isPrimary: true, clientY: 40 });
    expect(dismiss).toHaveBeenCalledWith(expect.any(String), "dragDismissed");
    rendered.unmount();
  });

  it("springs a short drag back to rest and does not also activate the banner", async () => {
    const { runtime, rendered, on } = await bannerFixture();
    const dismiss = vi.spyOn(runtime.notifications, "dismiss");
    const article = rendered.container.querySelector<HTMLElement>(".syncloudos-notification-banner")!;
    // 12 px up, slowly: short of both the dismissal offset and speed.
    pointerAt("pointerDown", article, { pointerId: 2, isPrimary: true, button: 0, clientY: 100 }, 900);
    pointerAt("pointerMove", article, { pointerId: 2, isPrimary: true, clientY: 90 }, 1000);
    pointerAt("pointerMove", article, { pointerId: 2, isPrimary: true, clientY: 88 }, 1200);
    pointerAt("pointerUp", article, { pointerId: 2, isPrimary: true, clientY: 88 }, 1250);
    fireEvent.click(article);
    expect(dismiss).not.toHaveBeenCalled();
    expect(article.style.transform).toBe("");
    const spring = on(".syncloudos-notification-banner").at(-1)!;
    expect(spring.definition).toMatchObject({ timing: { kind: "spring" } });
    expect(spring.definition.animations[0]).toMatchObject({ keyPath: "transform", from: "translate(0px, -12px) scale(1)", to: "none" });
    rendered.unmount();
  });

  it("holds the centre until its exit settles", async () => {
    const { rendered, view, on } = await bannerFixture();
    rendered.rerender(view({ key: 1 }));
    const centre = () => rendered.container.querySelector("#syncloudos-notification-centre");
    expect(centre()).not.toBeNull();
    expect(on("#syncloudos-notification-centre")[0]!.definition).toMatchObject({ duration: 0.34, fill: "backwards" });
    fireEvent.keyDown(centre()!, { key: "Escape" });
    const exit = on("#syncloudos-notification-centre").at(-1)!;
    expect(exit.definition).toMatchObject({ duration: 0.2, fill: "forwards" });
    expect(centre()).not.toBeNull();
    await exit.settle();
    expect(centre()).toBeNull();
    rendered.unmount();
  });
});
