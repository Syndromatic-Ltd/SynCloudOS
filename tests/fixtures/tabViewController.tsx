import React, { type ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { NSEViewController, nseUpdateTraits } from "../../src/NSE/Application/NSEViewController";
import { NSETabViewController, NSETabViewItem, type NSETabViewControllerTabStyle } from "../../src/NSE/Navigation/NSETabViewController";
import { ViewControllerView } from "../../src/SynCloudOS/AppHosting/applicationHosting";
import type { SynCloudOSPresentationTraits } from "../../src/SynCloudOS/SynCloudOS";

export class TestContentViewController extends NSEViewController {
  constructor(title: string, readonly content: () => ReactNode) { super({ title }); }
  renderView() { return this.content(); }
}

export function tabViewController(options: {
  readonly ids?: readonly string[];
  readonly title?: string;
  readonly style?: NSETabViewControllerTabStyle;
  readonly content?: (id: string) => ReactNode;
}) {
  const controller = new NSETabViewController({ title: options.title ?? "Destinations", tabStyle: options.style ?? "sidebarAdaptable" });
  for (const id of options.ids ?? ["Home", "Library", "Search", "Settings", "Sharing", "Activity", "History"]) {
    controller.addTabViewItem(new NSETabViewItem({ identifier: id, label: id, toolTip: `${id} destination`,
      image: { kind: "vector", path: `/navigation/${id.toLowerCase()}.svg` },
      viewController: controller.addChild(TestContentViewController, id, () => options.content?.(id) ?? <input aria-label={`Draft ${id}`} defaultValue="Unsaved" />),
    }));
  }
  return controller;
}

export function updateTraits(controller: NSEViewController<unknown>, traits: SynCloudOSPresentationTraits) {
  act(() => controller[nseUpdateTraits]({ reducedMotion: traits.reducedMotion, presentation: traits }));
}

export function renderTabController(controller: NSETabViewController, traits: SynCloudOSPresentationTraits) {
  const view = render(<ViewControllerView controller={controller} />);
  updateTraits(controller, traits);
  return view;
}
