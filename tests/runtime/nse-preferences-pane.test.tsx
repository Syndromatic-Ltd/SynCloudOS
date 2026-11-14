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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationEnvironmentProvider, type Animator } from "../../src/NSE/Animation";
import { PreferencesToast } from "../../src/NSE/Components/NSEPreferencesToast";
import type { AFXAnimationDefinition, AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";

afterEach(cleanup);

/** An animator whose animations run until the test settles them. */
function recordingAnimator() {
  const played: Array<{ target: Element; definition: AFXAnimationDefinition; settle(): Promise<void> }> = [];
  const animator: Animator = {
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
        return { id: `a${played.length}`, finished, progress: 0, state: "running", cancel: () => resolve({ state: "cancelled", reduced: false }),
          seek() {}, pause() {}, resume() {} };
      },
    } as Animator["animations"],
  };
  const on = (selector: string) => played.filter(({ target }) => target.matches(selector));
  const endpoints = (entry: { definition: AFXAnimationDefinition } | undefined) =>
    Object.fromEntries(entry!.definition.animations.map(({ keyPath, from, to }) => [keyPath, [from, to]]));
  return { animator, played, on, endpoints };
}

function paneProps(open = true) {
  return {
    open,
    title: "Preferences",
    backLabel: "Back",
    panes: [
      { id: "display", label: "Display", render: () => <p>Display pane</p> },
      { id: "sound", label: "Sound", render: () => <p>Sound pane</p> },
    ],
    onClose: vi.fn(),
  };
}

describe("NSE Preferences choreography", () => {
  it("removes outgoing pane actions from interaction while an interrupted push/pop is still animating", () => {
    const {animator}=recordingAnimator();const props=paneProps();
    render(<AnimationEnvironmentProvider animator={animator} reducedMotion={false}><PreferencesToast {...props} panes={[{id:"display",label:"Display",render:()=> <button>Live pane action</button>},{id:"sound",label:"Sound",render:()=>null}]} /></AnimationEnvironmentProvider>);
    fireEvent.click(screen.getByRole("button",{name:"Display",exact:true}));
    expect(screen.queryByRole("button",{name:"Display",exact:true})).toBeNull();
    const live=screen.getByRole("button",{name:"Live pane action"});live.focus();fireEvent.keyDown(live,{key:"Escape"});
    expect(screen.queryByRole("button",{name:"Live pane action"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Back",exact:true})).toBeNull();
    expect(screen.getByRole("button",{name:"Display",exact:true})).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});expect(props.onClose).toHaveBeenCalledOnce();
  });
  it("exposes pane navigation as a native button separate from row accessories", () => {
    const { animator } = recordingAnimator();
    render(<AnimationEnvironmentProvider animator={animator} reducedMotion>
      <PreferencesToast {...paneProps()} panes={[
        { id: "display", label: "Display", accessory: <button>Independent accessory</button>, render: () => <p>Display pane</p> },
      ]} />
    </AnimationEnvironmentProvider>);
    const pane = screen.getByRole("button", { name: "Display", exact: true });
    expect(pane.getAttribute("type")).toBe("button");
    expect(pane.tabIndex).toBe(0);
    expect(pane.contains(screen.getByRole("button", { name: "Independent accessory" }))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Independent accessory" }));
    expect(screen.queryByText("Display pane")).toBeNull();
    pane.focus();
    expect(document.activeElement).toBe(pane);
    fireEvent.click(pane);
    expect(screen.getByText("Display pane")).toBeTruthy();
  });

  it("pushes and pops panes and titles in the direction the stack moves", async () => {
    const { animator, played, on, endpoints } = recordingAnimator();
    render(
      <AnimationEnvironmentProvider animator={animator} reducedMotion={false}>
        <PreferencesToast {...paneProps()} />
      </AnimationEnvironmentProvider>,
    );
    // The panel glides up from the lower screen over a dimming desk.
    expect(endpoints(on(".nse-prefs-toast")[0])).toEqual({
      opacity: [0, 1], transform: ["translate(0vh, 34vh) scale(0.94)", "none"],
    });
    expect(on(".nse-prefs-toast")[0]!.definition).toMatchObject({ duration: 0.36, timing: { kind: "cubic-bezier", x1: 0.215 } });
    expect(endpoints(on(".nse-prefs-veil")[0])).toEqual({ opacity: [0, 1] });
    // The first pane and title are simply there.
    expect(on(".nse-prefs-pane")).toHaveLength(0);

    fireEvent.click(screen.getByText("Display").closest(".nse-control-list-item")!);
    const [listExit, displayEnter] = [on(".nse-prefs-pane").find(({ definition }) => definition.fill === "forwards"), on(".nse-prefs-pane").find(({ definition }) => definition.fill === "backwards")];
    expect(endpoints(displayEnter)).toEqual({ opacity: [0, 1], transform: ["translate(28%, 0%) scale(1)", "none"] });
    expect(endpoints(listExit)).toEqual({ opacity: [1, 0], transform: ["none", "translate(-22%, 0%) scale(1)"] });
    expect(displayEnter!.definition).toMatchObject({ duration: 0.22, timing: { kind: "cubic-bezier", x1: 0.2, y1: 0.9, x2: 0.18, y2: 1 } });
    expect(endpoints(on(".nse-prefs-title").find(({ definition }) => definition.fill === "backwards"))).toMatchObject({ transform: ["translate(0%, -90%) scale(1)", "none"] });
    expect(endpoints(on(".nse-prefs-back-slot")[0])).toMatchObject({ transform: ["translate(34px, 0px) scale(1)", "none"] });

    // The pushed list and title finish leaving.
    for (const entry of [...played]) if (entry.definition.fill === "forwards") await entry.settle();
    expect(document.querySelectorAll(".nse-prefs-pane")).toHaveLength(1);
    const before = on(".nse-prefs-pane").length;
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const popped = on(".nse-prefs-pane").slice(before);
    // Going back, the pane leaves to the right, even though it was pushed forward.
    expect(endpoints(popped.find(({ definition }) => definition.fill === "forwards"))).toEqual({ opacity: [1, 0], transform: ["none", "translate(28%, 0%) scale(1)"] });
    expect(endpoints(popped.find(({ definition }) => definition.fill === "backwards"))).toEqual({ opacity: [0, 1], transform: ["translate(-22%, 0%) scale(1)", "none"] });
  });

  it("holds the panel on screen until its exit settles, then resets to the root list", async () => {
    const { animator, on } = recordingAnimator();
    const props = paneProps();
    const view = (open: boolean) => (
      <AnimationEnvironmentProvider animator={animator} reducedMotion={false}>
        <PreferencesToast {...props} open={open} />
      </AnimationEnvironmentProvider>
    );
    const rendered = render(view(true));
    fireEvent.click(screen.getByText("Display").closest(".nse-control-list-item")!);
    rendered.rerender(view(false));
    const toastExit = on(".nse-prefs-toast").find(({ definition }) => definition.fill === "forwards")!;
    const veilExit = on(".nse-prefs-veil").find(({ definition }) => definition.fill === "forwards")!;
    expect(toastExit.definition).toMatchObject({ duration: 0.26 });
    await toastExit.settle();
    // The veil still dims, so the panel stays.
    expect(document.querySelector(".nse-prefs-toast")).not.toBeNull();
    await veilExit.settle();
    expect(document.querySelector(".nse-prefs-toast")).toBeNull();
    // Reopened, it lands on the root list rather than where it was left.
    rendered.rerender(view(true));
    expect(screen.getByText("Display")).toBeTruthy();
    expect(screen.queryByText("Display pane")).toBeNull();
  });

  it("uses fade-only pane, title, veil and panel presentations for reduced motion", () => {
    const { animator, on, endpoints } = recordingAnimator();
    render(
      <AnimationEnvironmentProvider animator={animator} reducedMotion>
        <PreferencesToast {...paneProps()} />
      </AnimationEnvironmentProvider>,
    );
    expect(endpoints(on(".nse-prefs-toast")[0])).toEqual({ opacity: [0, 1] });
    expect(on(".nse-prefs-toast")[0]!.definition).toMatchObject({ duration: 0.14, timing: "ease-in-out" });
    expect(on(".nse-prefs-veil")[0]!.definition).toMatchObject({ duration: 0.1, timing: "ease-in-out" });
    fireEvent.click(screen.getByText("Display").closest(".nse-control-list-item")!);
    for (const selector of [".nse-prefs-pane", ".nse-prefs-title"]) {
      for (const entry of on(selector)) {
        expect(entry.definition).toMatchObject({ duration: 0.1 });
        expect(endpoints(entry)).not.toHaveProperty("transform");
      }
    }
  });
});
