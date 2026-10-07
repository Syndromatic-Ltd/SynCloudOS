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
import React, { StrictMode, useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  NSEAnimationEnvironmentProvider,
  NSEPresence,
  useNSEPresentation,
  type NSEAnimator,
  type NSEPresentationSpec,
} from "../../src/NSE/Animation";
import type { AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";

afterEach(cleanup);

function recordingAnimator() {
  const exits = new Map<Element, (state: AFXAnimationSettlement["state"]) => Promise<void>>();
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(target, definition) {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
        if ((definition as { fill?: string }).fill === "forwards")
          exits.set(target as Element, async (state) => { resolve({ state, reduced: false }); await act(async () => { await finished; }); });
        return { id: "a", finished, progress: 0, cancel: () => resolve({ state: "cancelled", reduced: false }),
          seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"],
  };
  return { animator, exits };
}

const fade = (from: number, to: number): NSEPresentationSpec =>
  ({ duration: 0.2, timing: "linear", tracks: [{ keyPath: "opacity", values: [from, to] }] });
const motion = { enter: fade(0, 1), exit: fade(1, 0) };

function Part({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, motion);
  return <div ref={ref} data-part={name} />;
}

function Layer({ inner = true }: { inner?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, motion);
  return <div ref={ref} data-part="layer">{inner ? <Part name="inner" /> : null}</div>;
}

const part = (name: string) => document.querySelector(`[data-part="${name}"]`);

it("removes the child only after every nested presentation's exit settles, then reports completion", async () => {
  const { animator, exits } = recordingAnimator();
  const onExitComplete = vi.fn();
  const view = (shown: boolean) => (
    <NSEAnimationEnvironmentProvider animator={animator}>
      <NSEPresence onExitComplete={onExitComplete}>{shown ? <Layer /> : null}</NSEPresence>
    </NSEAnimationEnvironmentProvider>
  );
  const { rerender } = render(view(true));
  rerender(view(false));
  expect([...exits.keys()].map((element) => element.getAttribute("data-part")).sort()).toEqual(["inner", "layer"]);
  await exits.get(part("layer")!)!("completed");
  expect(part("layer")).not.toBeNull();
  expect(onExitComplete).not.toHaveBeenCalled();
  await exits.get(part("inner")!)!("completed");
  expect(part("layer")).toBeNull();
  expect(onExitComplete).toHaveBeenCalledTimes(1);
});

it("removes a child without presentations at once, and counts a cancelled exit as settled", async () => {
  const { animator, exits } = recordingAnimator();
  const plain = (shown: boolean) => (
    <NSEAnimationEnvironmentProvider animator={animator}>
      <NSEPresence>{shown ? <p data-part="plain" /> : null}</NSEPresence>
    </NSEAnimationEnvironmentProvider>
  );
  const first = render(plain(true));
  first.rerender(plain(false));
  expect(part("plain")).toBeNull();
  first.unmount();

  const layered = (shown: boolean, inner: boolean) => (
    <NSEAnimationEnvironmentProvider animator={animator}>
      <NSEPresence>{shown ? <Layer inner={inner} /> : null}</NSEPresence>
    </NSEAnimationEnvironmentProvider>
  );
  const second = render(layered(true, true));
  second.rerender(layered(false, true));
  await exits.get(part("layer")!)!("completed");
  expect(part("layer")).not.toBeNull();
  // Only an interrupted exit (superseded by a re-entry) holds the child.
  await exits.get(part("inner")!)!("cancelled");
  expect(part("layer")).toBeNull();
});

it("plays one enter per presentation under StrictMode's effect replay, and re-enters only after an exit", () => {
  const played: string[] = [];
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(_target, definition) {
        played.push((definition as { fill?: string }).fill === "forwards" ? "exit" : "enter");
        return { id: "a", finished: new Promise(() => undefined), progress: 0, cancel() { played.push("cancel"); },
          seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"],
  };
  const view = (shown: boolean) => (
    <StrictMode>
      <NSEAnimationEnvironmentProvider animator={animator}>
        <NSEPresence>{shown ? <Part name="only" /> : null}</NSEPresence>
      </NSEAnimationEnvironmentProvider>
    </StrictMode>
  );
  const { rerender } = render(view(true));
  // StrictMode mounts, tears down (cancelling) and mounts again: one live enter.
  expect(played).toEqual(["enter", "cancel", "enter"]);
  played.length = 0;
  rerender(view(true));
  expect(played).toEqual([]);
  rerender(view(false));
  // The exit supersedes the enter, which is still running here.
  expect(played).toEqual(["cancel", "exit"]);
  played.length = 0;
  rerender(view(true));
  expect(played).toEqual(["cancel", "enter"]);
});

it("presents in the final state when the animator refuses the owner or the animation", () => {
  const refusing = (stage: "owner" | "animate"): NSEAnimator => ({
    ownerAppId: "com.example.app",
    animations: {
      acquireOwner(owner) {
        if (stage === "owner") throw new DOMException("refused", "SecurityError");
        return Object.freeze({ ...owner, epoch: 1, release() {} });
      },
      animate() { throw new DOMException("refused", "SecurityError"); },
    } as NSEAnimator["animations"],
  });
  for (const stage of ["owner", "animate"] as const) {
    const view = (shown: boolean) => (
      <NSEAnimationEnvironmentProvider animator={refusing(stage)}>
        <NSEPresence>{shown ? <Part name={stage} /> : null}</NSEPresence>
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender, unmount } = render(view(true));
    expect(part(stage)).not.toBeNull();
    rerender(view(false));
    expect(part(stage)).toBeNull();
    unmount();
  }
});
