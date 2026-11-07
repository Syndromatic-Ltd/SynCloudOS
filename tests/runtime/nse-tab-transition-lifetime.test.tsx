// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSETabViewController, NSETabViewItem } from "../../src/NSE/Navigation/NSETabViewController";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import { nseUnowned } from "../../src/NSE/Controllers/ownership";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation/NSEAnimationEnvironment";

afterEach(cleanup);

it("keeps the incoming tab mounted through transition settlement", async () => {
  class Pane extends NSEViewController {
    renderView() { return <p>{this.title}</p>; }
    override viewDidAppear = vi.fn();
  }
  class Tabs extends NSETabViewController {
    effect = NSEViewController.TransitionOptions.crossfade;
    readonly first = this.addChild(Pane, { title: "First" });
    readonly second = this.addChild(Pane, { title: "Second" });
    constructor() {
      super({ owner: nseUnowned });
      for (const pane of [this.first, this.second]) this.addTabViewItem(new NSETabViewItem({ viewController: pane, identifier: pane.title! }));
    }
    override willSelect(item: NSETabViewItem) {
      this.transition(this.selectedTabViewItem!.viewController, item.viewController, this.effect);
    }
  }
  const tabs = new Tabs();
  const finish: Array<() => void> = [];
  const animator = { ownerAppId: "tab-test", animations: {
    acquireOwner: () => ({ release() {} }),
    animate: () => ({ finished: new Promise(resolve => finish.push(() => resolve({ state: "completed", reduced: false }))), cancel() {} }),
  } } as unknown as NSEAnimator;
  const mounted = render(<NSEAnimationEnvironmentProvider animator={animator}><NSEViewControllerView controller={tabs} /></NSEAnimationEnvironmentProvider>);
  await act(async () => { tabs.selectTabViewItem("Second"); });
  await act(async () => { for (const done of finish.splice(0)) done(); });
  expect(tabs.second.viewDidAppear).toHaveBeenCalledTimes(1);
  tabs.effect = NSEViewController.TransitionOptions.none;
  await act(async () => { tabs.selectTabViewItem("First"); });
  expect(finish.length).toBeGreaterThan(0);
  await act(async () => { for (const done of finish.splice(0)) done(); });
  expect(tabs.first.viewDidAppear).toHaveBeenCalledTimes(2);
  mounted.unmount(); tabs.dispose();
});
