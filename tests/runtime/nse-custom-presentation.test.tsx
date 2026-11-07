// @vitest-environment jsdom
import React from "react";
import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";

afterEach(cleanup);

class Presenter extends NSEViewController {
  static override view = () => <p>Underlying list</p>;
}
class Editor extends NSEViewController {
  static override view = () => <p>Presented editor</p>;
}

it("mounts custom presentations above a retained presenter and waits for dismissal", async () => {
  const presenter = new Presenter({ owner: nseUnowned });
  const editor = new Editor({ owner: nseUnowned });
  let finish!: () => void;
  const animator = {
    animatePresentation: vi.fn((of: NSEViewController<unknown>, from: NSEViewController<unknown>) => {
      expect(of.view.element.isConnected).toBe(true);
      expect(from.view.element.isConnected).toBe(true);
    }),
    animateDismissal: vi.fn(() => new Promise<void>(resolve => { finish = resolve; })),
  };
  const mounted = render(<NSEViewControllerView controller={presenter} />);
  act(() => { presenter.present(editor, animator); });
  expect(screen.getByText("Underlying list")).toBeTruthy();
  expect(screen.getByText("Presented editor")).toBeTruthy();
  expect(animator.animatePresentation).toHaveBeenCalledTimes(1);
  act(() => { presenter.dismiss(editor); presenter.dismiss(editor); });
  expect(animator.animateDismissal).toHaveBeenCalledTimes(1);
  expect(editor.isDisposed).toBe(false);
  await act(async () => { finish(); });
  expect(editor.isDisposed).toBe(true);
  expect(presenter.presentedViewControllers).toEqual([]);
  expect(screen.queryByText("Presented editor")).toBeNull();
  mounted.unmount(); presenter.dispose();
});

it("settles refused dismissals and disposes a presentation when its owner leaves", async () => {
  const presenter = new Presenter({ owner: nseUnowned });
  const editor = new Editor({ owner: nseUnowned });
  render(<NSEViewControllerView controller={presenter} />);
  act(() => { presenter.present(editor, { animatePresentation() {}, animateDismissal() { throw new Error("refused"); } }); });
  await act(async () => { editor.dismiss(); });
  expect(editor.isDisposed).toBe(true);
  act(() => { presenter.present(new Editor({ owner: nseUnowned }), { animatePresentation() {}, animateDismissal() {} }); });
  const next = presenter.presentedViewControllers[0]!;
  act(() => { presenter.dispose(); });
  expect(next.isDisposed).toBe(true);
});

it("replaces children in their existing slot, retaining the incoming controller for the next swap", async () => {
  class Child extends NSEViewController {
    renderView() { return <p>{this.title}</p>; }
  }
  class Container extends NSEViewController {
    readonly first = this.addChild(Child, { title: "First child" });
    readonly second = this.addChild(Child, { title: "Second child" });
    renderView() { return <this.first.view />; }
  }
  const parent = new Container({ owner: nseUnowned });
  const completion = vi.fn();
  render(<NSEViewControllerView controller={parent} />);
  await act(async () => { parent.transition(parent.first, parent.second, NSEViewController.TransitionOptions.crossfade, completion); });
  expect(screen.queryByText("First child")).toBeNull();
  expect(screen.getByText("Second child")).toBeTruthy();
  expect(parent.first.isDisposed).toBe(false);
  expect(completion).toHaveBeenCalledTimes(1);
  await act(async () => { parent.transition(parent.second, parent.first, NSEViewController.TransitionOptions.slideBackward); });
  expect(screen.getByText("First child")).toBeTruthy();
  expect(screen.queryByText("Second child")).toBeNull();
  expect(() => parent.transition(parent.first, new Editor({ owner: nseUnowned }), 0)).toThrow(/children/);
  expect(() => parent.transition(parent.first, parent.second, 3)).toThrow(/one/);
  act(() => { parent.dispose(); });
});
