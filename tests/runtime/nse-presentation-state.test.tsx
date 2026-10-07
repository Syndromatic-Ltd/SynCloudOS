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
import React, { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NSEAnimationEnvironmentProvider,
  NSEPresence,
  NSEPresenceBoundary,
  compileNSEPresentation,
  nseFilterStyle,
  nseTransformStyle,
  NSELayoutView,
  useNSEPresentation,
  type NSEAnimator,
  type NSELayoutTransitionTiming,
  type NSEPresentationEnter,
  type NSEPresentationSpec,
} from "../../src/NSE/Animation";
import type {
  AFXAnimationDefinition,
  AFXAnimationHandle,
  AFXAnimationSettlement,
} from "../../src/FX/AnimationFX/animationTypes";

afterEach(cleanup);

interface Played {
  readonly target: Element;
  readonly definition: AFXAnimationDefinition;
  settle(state: AFXAnimationSettlement["state"]): Promise<void>;
  readonly handle: AFXAnimationHandle;
}

/** An animator whose animations run until the test settles them. */
function controlledAnimator() {
  const played: Played[] = [];
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(target, definition) {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
        let state: AFXAnimationHandle["state"] = "running";
        const finish = (next: AFXAnimationSettlement["state"]) => {
          if (state !== "running") return;
          state = next;
          resolve({ state: next, reduced: false });
        };
        const handle: AFXAnimationHandle = {
          id: `a${played.length}`, finished, progress: 0,
          get state() { return state; },
          cancel: () => finish("cancelled"), seek() {}, pause() {}, resume() {},
        };
        played.push({
          target: target as Element, definition: definition as AFXAnimationDefinition, handle,
          async settle(next) { finish(next); await act(async () => { await finished; }); },
        });
        return handle;
      },
    } as NSEAnimator["animations"],
  };
  return { animator, played };
}

const fade = (from: number, to: number, duration = 0.2): NSEPresentationSpec =>
  ({ duration, timing: "linear", tracks: [{ keyPath: "opacity", values: [from, to] }] });

describe("presentation compilation", () => {
  it("writes 3D transforms in one shared function list, viewport units, filters and a start delay", () => {
    const definition = compileNSEPresentation({
      duration: 0.72, delay: 0.1, timing: "ease-in-out",
      tracks: [
        { keyPath: "transform", values: [{ scale: 0.98, z: -24, rotateY: 2 }, { scale: 0.86, z: -260, rotateY: 22 }] },
        { keyPath: "filter", values: [{ brightness: 1 }, { brightness: 0.4 }] },
      ],
    }, "surface");
    expect(definition).toMatchObject({ duration: 0.72, delay: 0.1, timing: "ease-in-out", fill: "backwards" });
    expect(definition.animations[0]).toMatchObject({
      from: "translate3d(0px, 0px, -24px) scale(0.98) rotateY(2deg)",
      to: "translate3d(0px, 0px, -260px) scale(0.86) rotateY(22deg)",
    });
    expect(definition.animations[1]).toMatchObject({ keyPath: "filter", from: "none", to: "brightness(0.4)" });
    const root = compileNSEPresentation({ duration: 0.72, timing: "linear",
      tracks: [{ keyPath: "transform", unit: "vw", values: [{ x: 118 }, { x: 0 }] }] }, "root");
    expect(root.animations[0]).toMatchObject({ from: "translate(118vw, 0vw) scale(1)", to: "none" });
    expect(root).not.toHaveProperty("delay");
  });

  it("writes model styles exactly as a presentation ends on them", () => {
    expect(nseTransformStyle({ scale: 0.86, z: -260, rotateY: 22 })).toBe("translate3d(0px, 0px, -260px) scale(0.86) rotateY(22deg)");
    expect(nseTransformStyle({ x: -118 }, "vw")).toBe("translate(-118vw, 0vw) scale(1)");
    expect(nseTransformStyle({ y: 132, rotate: -9, scale: 0.965 })).toBe("translate(0px, 132px) scale(0.965) rotate(-9deg)");
    expect(nseTransformStyle({})).toBe("none");
    expect(nseFilterStyle({ brightness: 0.72, saturate: 0.92 })).toBe("brightness(0.72) saturate(0.92)");
    expect(nseFilterStyle({ brightness: 1 })).toBe("none");
  });

  it("samples tracks with their own key times and starts from a presented origin", () => {
    const definition = compileNSEPresentation({
      duration: 1, timing: "linear",
      tracks: [
        { keyPath: "opacity", values: [1, 1, 0], keyTimes: [0, 0.5, 1] },
        { keyPath: "transform", values: [{ scale: 1 }, { scale: 0 }] },
      ],
    }, "view", "exit", { opacity: 0.25, transform: "matrix(0.5, 0, 0, 0.5, 0, 0)" });
    const [opacity, transform] = definition.animations;
    expect(definition).toMatchObject({ timing: "linear", fill: "forwards" });
    expect(opacity!.from).toBe(0.25);
    expect(opacity!.keyframes![0]).toEqual({ offset: 0, value: 0.25 });
    expect(opacity!.keyframes![30]!.value).toBe(1);
    expect(opacity!.keyframes![60]!.value).toBe(0);
    expect(transform!.keyframes![0]!.value).toBe("matrix(0.5, 0, 0, 0.5, 0, 0)");
    expect(transform!.keyframes![30]!.value).toBe("translate(0px, 0px) scale(0.5)");
  });
});

describe("transform component tracks", () => {
  it("composes components with their own keyframes into one transform, like transform.rotation.z", () => {
    const definition = compileNSEPresentation({ duration: 1, timing: "linear", tracks: [
      { keyPath: "opacity", values: [0, 1] },
      { keyPath: "transform.y", values: [-10, 0] },
      { keyPath: "transform.rotate", values: [-9, 6.5, -3.8, 1.9, -0.7, 0] },
      { keyPath: "transform.scale", values: [0.992, 1.006, 0.998, 1] },
    ] }, "swing");
    const transform = definition.animations.find(({ keyPath }) => keyPath === "transform")!;
    expect(definition.animations.map(({ keyPath }) => keyPath)).toEqual(["opacity", "transform"]);
    expect(transform.from).toBe("translate(0px, -10px) scale(0.992) rotate(-9deg)");
    expect(transform.to).toBe("none");
    // Each component keeps its own key times: rotate reaches 6.5 at 0.2,
    // while scale is still inside its first third and y is two-tenths along.
    expect(transform.keyframes![12]!.value).toBe(`translate(0px, -8px) scale(${0.992 + (1.006 - 0.992) * 0.6}) rotate(6.5deg)`);
    expect(() => compileNSEPresentation({ duration: 1, timing: "linear", tracks: [
      { keyPath: "transform", values: [{}, { x: 1 }] },
      { keyPath: "transform.rotate", values: [0, 1] },
    ] }, "mixed")).toThrow(/whole transform or its components/);
  });

  it("keeps the exact curve when every component has two keyframes", () => {
    const definition = compileNSEPresentation({ duration: 0.32, timing: "ease-in", tracks: [
      { keyPath: "transform.y", values: [0, -12] },
      { keyPath: "transform.scale", values: [1, 0.99] },
    ] }, "exit", "exit");
    expect(definition).toMatchObject({ timing: "ease-in", fill: "forwards" });
    expect(definition.animations[0]).toEqual({ targetId: "exit", keyPath: "transform", from: "none", to: "translate(0px, -12px) scale(0.99)" });
  });
});

describe("height presentation", () => {
  it("resolves an auto height to the measured natural height", () => {
    const expand = { duration: 0.22, timing: "linear" as const, tracks: [{ keyPath: "height" as const, values: [0, "auto" as const] }] };
    expect(compileNSEPresentation(expand, "body", "enter", {}, { height: 84 }).animations[0])
      .toMatchObject({ keyPath: "height", from: "0px", to: "84px" });
    expect(() => compileNSEPresentation(expand, "body")).toThrow(/needs the element's measured height/);
  });

  it("measures the element when it presents an auto height", () => {
    const { animator, played } = controlledAnimator();
    function Body() {
      const ref = useRef<HTMLDivElement>(null);
      useNSEPresentation(ref, { enter: { duration: 0.22, timing: "linear", tracks: [{ keyPath: "height", values: [0, "auto"] }] } });
      return <div ref={ref} data-part="body" />;
    }
    const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(96);
    try {
      render(<NSEAnimationEnvironmentProvider animator={animator}><Body /></NSEAnimationEnvironmentProvider>);
    } finally {
      scrollHeight.mockRestore();
    }
    expect(played[0]!.definition.animations[0]).toMatchObject({ from: "0px", to: "96px" });
  });
});

describe("per-segment timing", () => {
  it("eases each segment with its own timing function, like CAKeyframeAnimation.timingFunctions", () => {
    const definition = compileNSEPresentation({ duration: 1, timing: "linear", tracks: [
      { keyPath: "opacity", values: [0, 0.5, 1], keyTimes: [0, 0.5, 1], timingFunctions: ["linear", "ease-in"] },
    ] }, "view");
    const frames = definition.animations[0]!.keyframes!;
    expect(frames[15]!.value).toBeCloseTo(0.25, 6);
    expect(frames[45]!.value as number).toBeGreaterThan(0.6);
    expect(frames[45]!.value as number).toBeLessThan(0.7);
    // Timing functions alone sample even a two-keyframe track.
    const two = compileNSEPresentation({ duration: 1, timing: "linear", tracks: [
      { keyPath: "opacity", values: [0, 1], timingFunctions: ["ease-in"] },
    ] }, "view");
    expect(two.timing).toBe("linear");
    expect(two.animations[0]!.keyframes).toHaveLength(61);
    expect(() => compileNSEPresentation({ duration: 1, timing: "linear", tracks: [
      { keyPath: "opacity", values: [0, 1], timingFunctions: ["linear", "linear"] },
    ] }, "view")).toThrow(/one timing function per segment/);
  });
});

function Stateful({ state, enter, onPresented }: {
  state: string;
  enter: NSEPresentationEnter;
  onPresented?: (state: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, { state, enter, onPresented });
  return <div ref={ref} data-part="stateful" />;
}

describe("state presentation", () => {
  it("presents each new state with the enter for the state it leaves and reports completion", async () => {
    const { animator, played } = controlledAnimator();
    const onPresented = vi.fn();
    const enter = vi.fn((previous: string | null) => previous === "incoming" ? null : fade(0, 1, previous === null ? 0.3 : 0.5));
    const view = (state: string) => (
      <NSEAnimationEnvironmentProvider animator={animator}>
        <Stateful state={state} enter={enter} onPresented={onPresented} />
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender } = render(view("staged"));
    expect(enter).toHaveBeenLastCalledWith(null);
    await played[0]!.settle("completed");
    expect(onPresented).toHaveBeenLastCalledWith("staged");

    rerender(view("staged"));
    expect(played).toHaveLength(1);

    rerender(view("presented"));
    expect(enter).toHaveBeenLastCalledWith("staged");
    expect(played[1]!.definition.duration).toBe(0.5);
    expect(onPresented).toHaveBeenCalledTimes(1);
    await played[1]!.settle("completed");
    expect(onPresented).toHaveBeenLastCalledWith("presented");

    rerender(view("incoming"));
    rerender(view("done"));
    // "incoming" played; leaving it plays nothing and presents at once, while
    // the superseded "incoming" presentation reports nothing.
    expect(played).toHaveLength(3);
    expect(onPresented).toHaveBeenLastCalledWith("done");
    await played[2]!.settle("completed");
    expect(onPresented.mock.calls.map(([state]) => state)).toEqual(["staged", "presented", "done"]);
  });

  it("does not report a presentation that was superseded or unmounted", async () => {
    const { animator, played } = controlledAnimator();
    const onPresented = vi.fn();
    const view = (state: string) => (
      <NSEAnimationEnvironmentProvider animator={animator}>
        <Stateful state={state} enter={fade(0, 1)} onPresented={onPresented} />
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender, unmount } = render(view("a"));
    rerender(view("b"));
    expect(played[0]!.handle.state).toBe("cancelled");
    unmount();
    expect(played[1]!.handle.state).toBe("cancelled");
    await act(async () => { await Promise.all(played.map(({ handle }) => handle.finished)); });
    expect(onPresented).not.toHaveBeenCalled();
  });

  it("presents at once without an animator", () => {
    const onPresented = vi.fn();
    const { rerender } = render(<Stateful state="a" enter={fade(0, 1)} onPresented={onPresented} />);
    rerender(<Stateful state="b" enter={fade(0, 1)} onPresented={onPresented} />);
    expect(onPresented.mock.calls.map(([state]) => state)).toEqual(["a", "b"]);
  });

  it("hands an interrupted presentation over from the value it presents", async () => {
    const { animator, played } = controlledAnimator();
    const view = (state: string) => (
      <NSEAnimationEnvironmentProvider animator={animator}>
        <Stateful state={state} enter={fade(0, 1)} />
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender } = render(view("a"));
    const element = document.querySelector<HTMLElement>('[data-part="stateful"]')!;
    // What the running presentation shows at the moment it is superseded.
    element.style.opacity = "0.4";
    rerender(view("b"));
    expect(played[1]!.definition.animations[0]).toMatchObject({ from: 0.4, to: 1 });
    // A completed presentation hands over nothing: the next one starts from its spec.
    await played[1]!.settle("completed");
    rerender(view("c"));
    expect(played[2]!.definition.animations[0]).toMatchObject({ from: 0, to: 1 });
  });
});

function Item({ name }: { name: string }) {
  const ref = useRef<HTMLLIElement>(null);
  useNSEPresentation(ref, { enter: fade(0, 1), exit: fade(1, 0) });
  return <li ref={ref} data-item={name} />;
}

const items = () => [...document.querySelectorAll("[data-item]")].map((element) => element.getAttribute("data-item"));

describe("keyed presence", () => {
  it("exits only the removed children, in place, and completes once the last has left", async () => {
    const { animator, played } = controlledAnimator();
    const onExitComplete = vi.fn();
    const view = (names: readonly string[]) => (
      <NSEAnimationEnvironmentProvider animator={animator}>
        <ul><NSEPresence onExitComplete={onExitComplete}>{names.map((name) => <Item key={name} name={name} />)}</NSEPresence></ul>
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender } = render(view(["a", "b", "c"]));
    const exitOf = (name: string) => played.find(({ target, definition }) =>
      target.getAttribute("data-item") === name && definition.fill === "forwards")!;
    rerender(view(["a", "d"]));
    expect(items()).toEqual(["a", "b", "c", "d"]);
    expect(played.filter(({ definition }) => definition.fill === "forwards").map(({ target }) => target.getAttribute("data-item")))
      .toEqual(["b", "c"]);
    await exitOf("b").settle("completed");
    expect(items()).toEqual(["a", "c", "d"]);
    expect(onExitComplete).not.toHaveBeenCalled();
    await exitOf("c").settle("completed");
    expect(items()).toEqual(["a", "d"]);
    expect(onExitComplete).toHaveBeenCalledTimes(1);
  });

  it("does not wait on presentations below a presence boundary", async () => {
    const { animator, played } = controlledAnimator();
    const view = (shown: boolean) => (
      <NSEAnimationEnvironmentProvider animator={animator}>
        <ul><NSEPresence>{shown ? (
          <div key="window"><Item name="shell" /><NSEPresenceBoundary><Item name="app" /></NSEPresenceBoundary></div>
        ) : null}</NSEPresence></ul>
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender } = render(view(true));
    rerender(view(false));
    const exits = played.filter(({ definition }) => definition.fill === "forwards");
    expect(exits.map(({ target }) => target.getAttribute("data-item"))).toEqual(["shell"]);
    await exits[0]!.settle("completed");
    expect(items()).toEqual([]);
  });

  it("re-enters a key shown again during its exit, keeping its element", async () => {
    const { animator, played } = controlledAnimator();
    const view = (names: readonly string[]) => (
      <NSEAnimationEnvironmentProvider animator={animator}>
        <ul><NSEPresence>{names.map((name) => <Item key={name} name={name} />)}</NSEPresence></ul>
      </NSEAnimationEnvironmentProvider>
    );
    const { rerender } = render(view(["a", "b"]));
    const b = document.querySelector('[data-item="b"]');
    rerender(view(["a"]));
    const exit = played.at(-1)!;
    expect(exit.definition.fill).toBe("forwards");
    rerender(view(["a", "b"]));
    expect(document.querySelector('[data-item="b"]')).toBe(b);
    expect(exit.handle.state).toBe("cancelled");
    expect(played.at(-1)!.definition.fill).toBe("backwards");
    await act(async () => { await exit.handle.finished; });
    expect(items()).toEqual(["a", "b"]);
  });
});

describe("layout view", () => {
  // jsdom does not lay out: each view reports the position its data attributes
  // give it, so the DOM mutation of an update moves it.
  const originals = {
    left: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft")!,
    top: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop")!,
  };
  const laidOut = (axis: "left" | "top"): PropertyDescriptor => ({
    configurable: true, get(this: HTMLElement) { return Number(this.dataset[axis] ?? 0); },
  });
  function withLayout(run: () => void | Promise<void>) {
    return async () => {
      Object.defineProperty(HTMLElement.prototype, "offsetLeft", laidOut("left"));
      Object.defineProperty(HTMLElement.prototype, "offsetTop", laidOut("top"));
      try { await run(); } finally {
        Object.defineProperty(HTMLElement.prototype, "offsetLeft", originals.left);
        Object.defineProperty(HTMLElement.prototype, "offsetTop", originals.top);
      }
    };
  }
  const reorder: NSELayoutTransitionTiming = { duration: 0.74, timing: { kind: "spring", stiffness: 340, damping: 20, mass: 0.8 } };
  const environment = (animator: NSEAnimator, children: React.ReactNode) => (
    <NSEAnimationEnvironmentProvider animator={animator} reducedMotion={false}>{children}</NSEAnimationEnvironmentProvider>
  );
  const at = (left: number, top: number) => ({ "data-left": left, "data-top": top });

  it("plays a move from the old place to the new one, and animates any shift without a key", withLayout(() => {
    const { animator, played } = controlledAnimator();
    const view = (left: number, top: number) => environment(animator, <NSELayoutView layoutTransition={reorder} {...at(left, top)} />);
    const rendered = render(view(0, 0));
    expect(played).toHaveLength(0);
    rendered.rerender(view(120, 40));
    expect(played).toHaveLength(1);
    expect(played[0]!.definition).toMatchObject({ duration: 0.74, timing: { kind: "spring" }, fill: "backwards" });
    expect(played[0]!.definition.animations[0]).toMatchObject({ keyPath: "transform", from: "translate(-120px, -40px) scale(1)", to: "none" });
    // An update that leaves the view in place moves nothing.
    rendered.rerender(view(120, 40));
    expect(played).toHaveLength(1);
  }));

  it("measures a keyed view only when its key changes", withLayout(() => {
    const { animator, played } = controlledAnimator();
    const view = (key: number, left: number) => environment(animator, <NSELayoutView layoutKey={key} layoutTransition={reorder} {...at(left, 0)} />);
    const rendered = render(view(0, 0));
    rendered.rerender(view(0, 50));
    expect(played).toHaveLength(0);
    rendered.rerender(view(1, 90));
    expect(played[0]!.definition.animations[0]).toMatchObject({ from: "translate(-40px, 0px) scale(1)" });
  }));

  it("continues an interrupted move from where the view is drawn, and moves at once without a transition", withLayout(() => {
    const { animator, played } = controlledAnimator();
    const view = (left: number, transition: NSELayoutTransitionTiming | null = reorder) =>
      environment(animator, <NSELayoutView data-testid="slot" layoutTransition={transition} {...at(left, 0)} />);
    const rendered = render(view(0));
    rendered.rerender(view(100));
    // Part-way home, the view is drawn 30px short of its new place.
    rendered.getByTestId("slot").style.transform = "matrix(1, 0, 0, 1, -30, 0)";
    rendered.rerender(view(200));
    expect(played[0]!.handle.state).toBe("cancelled");
    expect(played[1]!.definition.animations[0]).toMatchObject({ from: "translate(-130px, 0px) scale(1)", to: "none" });
    rendered.getByTestId("slot").style.transform = "";
    rendered.rerender(view(0, null));
    expect(played[1]!.handle.state).toBe("cancelled");
    expect(played).toHaveLength(2);
  }));

  it("keeps a reordered view's move through StrictMode's effect replay", withLayout(() => {
    const { animator, played } = controlledAnimator();
    const list = (order: readonly string[]) => (
      <React.StrictMode>
        {environment(animator, order.map((id, index) => (
          <NSELayoutView key={id} data-testid={id} layoutTransition={reorder} {...at(index * 100, 0)} />
        )))}
      </React.StrictMode>
    );
    const rendered = render(list(["a", "b"]));
    rendered.rerender(list(["b", "a"]));
    for (const id of ["a", "b"]) {
      const moves = played.filter(({ target }) => target === rendered.getByTestId(id));
      expect(moves.at(-1)!.handle.state).toBe("running");
    }
    const [aMove] = played.filter(({ target }) => target === rendered.getByTestId("a")).slice(-1);
    expect(aMove!.definition.animations[0]).toMatchObject({ from: "translate(-100px, 0px) scale(1)" });
  }));
});
