// @vitest-environment jsdom
import React from "react";
import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { ViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { outlet, type NSEViewOutlet } from "../../src/NSE/Application/viewOutlet";
import { Presence } from "../../src/NSE/Animation/NSEPresentation";

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
  const mounted = render(<ViewControllerView controller={presenter} />);
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
  render(<ViewControllerView controller={presenter} />);
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
  render(<ViewControllerView controller={parent} />);
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

it("hands a transition to a newly selected child without mounting its outlets twice", async () => {
  class Child extends NSEViewController {
    @outlet accessor content!: NSEViewOutlet<HTMLDivElement>;
    renderView() { return <div ref={this.content.ref}>{this.title}</div>; }
  }
  class Tabs extends NSEViewController {
    readonly first = this.addChild(Child, { title: "Original tab" });
    readonly second = this.addChild(Child, { title: "Selected tab" });
    selected = this.first;
    renderView() { return <Presence><this.selected.view key={this.selected.title} /></Presence>; }
    select() { this.transition(this.first, this.second, NSEViewController.TransitionOptions.crossfade); this.selected = this.second; this.notifyObservers(); }
  }
  const tabs = new Tabs({ owner: nseUnowned });
  const mounted = render(<ViewControllerView controller={tabs} />);
  await act(async () => { tabs.select(); });
  expect(screen.queryByText("Original tab")).toBeNull();
  expect(screen.getAllByText("Selected tab")).toHaveLength(1);
  mounted.unmount(); tabs.dispose();
});
