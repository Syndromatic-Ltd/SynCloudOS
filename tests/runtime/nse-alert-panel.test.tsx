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
import { act, cleanup, fireEvent, render as baseRender, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NSEAnimationDefaults, NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation";
import { NSEAlert } from "../../src/NSE/Components/NSEAlert";
import { NSEAlertBackdrop } from "../../src/NSE/Components/NSEAlertBackdrop";
import { SystemAlert } from "../../src/SynCloudOSReact/SystemAlert";
import type { AFXAnimationDefinition, AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";

import { NSEThemeProvider } from "../../src/NSE/Appearance";
import { atmoTheme } from "../../src/NSE/Themes/Atmo/theme";
function render(ui:React.ReactNode) { return baseRender(ui,{wrapper:({children}) => <NSEThemeProvider theme={atmoTheme}>{children}</NSEThemeProvider>}); }

interface Played {
  readonly target: HTMLElement;
  readonly definition: AFXAnimationDefinition;
  readonly owner: { appId: string; viewId: string };
  settle(state: AFXAnimationSettlement["state"]): Promise<void>;
  cancelled: boolean;
}

/** Records every presentation the NSE views ask AnimationFX to play. */
function recordingAnimator(ownerAppId = "syncloudos.system") {
  const played: Played[] = [];
  const released: string[] = [];
  const animator: NSEAnimator = {
    ownerAppId,
    animations: {
      acquireOwner(owner) {
        return Object.freeze({ ...owner, epoch: 1, release: () => { released.push(owner.viewId); } });
      },
      animate(target, definition, owner) {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
        const record: Played = {
          target: target as HTMLElement,
          definition: definition as AFXAnimationDefinition,
          owner,
          cancelled: false,
          async settle(state) { resolve({ state, reduced: false }); await act(async () => { await finished; }); },
        };
        played.push(record);
        return {
          id: `animation-${played.length}`,
          finished,
          progress: 0,
          cancel() { record.cancelled = true; resolve({ state: "cancelled", reduced: false }); },
          seek() {},
          pause() {},
          resume() {},
        };
      },
    } as NSEAnimator["animations"],
  };
  return { animator, played, released };
}

afterEach(cleanup);

const track = (played: Played, keyPath: string) => played.definition.animations.find((animation) => animation.keyPath === keyPath)!;
const valueAt = (played: Played, keyPath: string, offset: number) =>
  track(played, keyPath).keyframes!.find((keyframe) => Math.abs(keyframe.offset - offset) < 1e-9)!.value;
const bezier = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => [x1, y1, x2, y2];

function renderSystemAlert(animator: NSEAnimator | null, reducedMotion = false) {
  return render(
    <NSEAnimationEnvironmentProvider reducedMotion={reducedMotion} animator={animator}>
      <SystemAlert
        error={{ code: "APP_CONTENT_FAILED", title: "Stopped", message: "Try again" }}
        onDismiss={() => undefined}
        onReturn={() => undefined}
        onReload={() => undefined}
      />
    </NSEAnimationEnvironmentProvider>,
  );
}

describe("NSE alert choreography on AnimationFX", () => {
  it("pops the alert in with the damped elastic scale, and fades it when motion is reduced", () => {
    const { animator, played } = recordingAnimator();
    const standard = render(
      <NSEAnimationEnvironmentProvider reducedMotion={false} animator={animator}>
        <NSEAlert labelledBy="title"><h2 id="title">Notice</h2></NSEAlert>
      </NSEAnimationEnvironmentProvider>,
    );
    const alert = screen.getByRole("alertdialog");
    expect(played).toHaveLength(1);
    const [pop] = played as [Played];
    expect(pop.target).toBe(alert);
    expect(pop.owner.appId).toBe("syncloudos.system");
    // The overshoot keyframes sit at equal key times, each segment eased by
    // the decelerate curve (Framer's per-segment `ease`), sampled for WAAPI.
    expect(pop.definition).toMatchObject({ duration: 0.58, timing: "linear", fill: "backwards", reducedMotion: "never" });
    expect([0, 0.25, 0.5, 0.75, 1].map((offset) => valueAt(pop, "transform", offset))).toEqual([
      "translate(0px, 0px) scale(0)",
      "translate(0px, 0px) scale(1.18)",
      "translate(0px, 0px) scale(0.94)",
      "translate(0px, 0px) scale(1.035)",
      "none",
    ]);
    expect(valueAt(pop, "opacity", 0)).toBe(0);
    expect(valueAt(pop, "opacity", 1)).toBe(1);
    // Decelerate is front-loaded: past halfway in opacity at the midpoint.
    expect(valueAt(pop, "opacity", 0.5)).toBeGreaterThan(0.5);
    expect(bezier(NSEAnimationDefaults.easing.decelerate)).toEqual([0.16, 0.94, 0.18, 1]);
    standard.unmount();

    const reduced = recordingAnimator();
    render(
      <NSEAnimationEnvironmentProvider reducedMotion animator={reduced.animator}>
        <NSEAlert labelledBy="title"><h2 id="title">Notice</h2></NSEAlert>
      </NSEAnimationEnvironmentProvider>,
    );
    const [fade] = reduced.played as [Played];
    expect(fade.definition).toMatchObject({ duration: 0.16, timing: "ease-in-out", fill: "backwards" });
    expect(fade.definition.animations).toEqual([{ targetId: expect.any(String), keyPath: "opacity", from: 0, to: 1 }]);
  });

  it("dims the backdrop with the standard and reduced durations", () => {
    for (const [reducedMotion, duration] of [[false, 0.18], [true, 0.08]] as const) {
      const { animator, played } = recordingAnimator();
      const view = render(
        <NSEAnimationEnvironmentProvider reducedMotion={reducedMotion} animator={animator}>
          <NSEAlertBackdrop><NSEAlert labelledBy="title"><h2 id="title">Notice</h2></NSEAlert></NSEAlertBackdrop>
        </NSEAnimationEnvironmentProvider>,
      );
      const backdrop = document.querySelector<HTMLElement>(".nse-control-alert-backdrop")!;
      const dim = played.find((record) => record.target === backdrop)!;
      expect(dim.definition).toMatchObject({ duration, timing: "ease-in-out" });
      expect(dim.definition.animations).toEqual([{ targetId: expect.any(String), keyPath: "opacity", from: 0, to: 1 }]);
      view.unmount();
    }
  });

  it("discloses technical details with an enter, holds the exit until it finishes, and re-enters an exiting panel", async () => {
    const { animator, played, released } = recordingAnimator();
    renderSystemAlert(animator);
    // `initial={false}`: nothing is disclosed yet, so nothing played for it.
    expect(document.querySelector(".nse-alert-details")).toBeNull();
    const before = played.length;
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    const details = document.querySelector<HTMLElement>(".nse-alert-details")!;
    const enter = played[before]!;
    expect(enter.target).toBe(details);
    expect(enter.definition).toMatchObject({ duration: 0.18, fill: "backwards" });
    expect(bezier(enter.definition.timing as never)).toEqual([0.2, 0.9, 0.18, 1]);
    expect(track(enter, "transform")).toMatchObject({ from: "translate(0px, -6px) scale(0.985)", to: "none" });
    expect(track(enter, "opacity")).toMatchObject({ from: 0, to: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    const exit = played.at(-1)!;
    expect(exit.definition).toMatchObject({ fill: "forwards" });
    expect(track(exit, "transform")).toMatchObject({ from: "none", to: "translate(0px, -3px) scale(0.995)" });
    // Still mounted while the exit plays.
    expect(document.querySelector(".nse-alert-details")).toBe(details);

    // Showing it again mid-exit re-enters the same element and supersedes the exit.
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expect(exit.cancelled).toBe(true);
    const reenter = played.at(-1)!;
    expect(reenter).not.toBe(exit);
    expect(reenter.target).toBe(details);
    expect(reenter.definition.fill).toBe("backwards");
    await exit.settle("cancelled");
    expect(document.querySelector(".nse-alert-details")).toBe(details);

    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    const finalExit = played.at(-1)!;
    expect(document.querySelector(".nse-alert-details")).toBe(details);
    await finalExit.settle("completed");
    expect(document.querySelector(".nse-alert-details")).toBeNull();
    expect(released.length).toBeGreaterThan(0);
  });

  it("fades details only when motion is reduced", () => {
    const { animator, played } = recordingAnimator();
    renderSystemAlert(animator, true);
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    const enter = played.at(-1)!;
    expect(enter.definition).toMatchObject({ duration: 0.08, timing: "ease-in-out" });
    expect(enter.definition.animations.map((animation) => animation.keyPath)).toEqual(["opacity"]);
  });

  it("presents in the final state without an animator, removing disclosed details at once", () => {
    renderSystemAlert(null);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expect(document.querySelector(".nse-alert-details")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Technical details" }));
    expect(document.querySelector(".nse-alert-details")).toBeNull();
    expect(document.getAnimations?.() ?? []).toEqual([]);
  });
});

describe("application-owned NSE presentations", () => {
  it("animate only through leases the mounted app's own AnimationFX client issued", async () => {
    const { createSynWareNSEAnimations } = await import("../../src/SynCloudOS/AppSDK/SynWareNSEMediaAdapters");
    const issued: string[] = [];
    const disposed: string[] = [];
    const animated: Array<{ owner: unknown; definition: unknown }> = [];
    const client = {
      acquireOwner(viewId: string) {
        issued.push(viewId);
        const owner = { viewId, dispose: () => { disposed.push(viewId); } };
        return owner;
      },
      animate(_target: object, definition: Readonly<Record<string, unknown>>, owner: unknown) {
        animated.push({ owner, definition });
        return { id: "a1", finished: Promise.resolve({ state: "completed", reduced: false }), progress: 1,
          cancel() {}, seek() {}, pause() {}, resume() {} };
      },
    };
    const animations = createSynWareNSEAnimations(client as never);
    const lease = animations.acquireOwner({ appId: "com.example.app", viewId: "nse-presentation:r1" });
    expect(issued).toEqual(["nse-presentation:r1"]);
    const target = document.createElement("div");
    animations.animate(target, { animations: [], duration: 0.1 } as never, lease, 1);
    expect(animated).toHaveLength(1);
    expect(() => animations.animate(target, { animations: [], duration: 0.1 } as never,
      { appId: "syncloudos.system", viewId: "forged", epoch: 1, release() {} }, 1)).toThrow(/not issued to this application/);
    lease.release("done");
    expect(disposed).toEqual(["nse-presentation:r1"]);
  });
});
