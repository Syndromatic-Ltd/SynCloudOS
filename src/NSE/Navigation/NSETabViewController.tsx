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

import { useId, type ReactNode } from "react";
import { NSEViewController, type NSEViewControllerOptions } from "../Application/NSEViewController";
import { useObserve } from "../Objects/useObserve";
import { NSEChildViewControllerView } from "../Application/viewControllerRenderer";
import { TabBar } from "./TabBar";
import { TabBarController } from "./TabBarController";
import { getNSETabBarPanelId, getNSETabBarTabId } from "./NSENavigationDestinationHost";
import type { NSENavigationIcon } from "./navigationTypes";
import { registerNSEAuthoringFinalizer } from "../Application/authoringLifecycle";
import { connectNSENavigationRestoration, type NSENavigationRestorationDescriptor } from "./navigationRestoration";
import { NSETreeController } from "../Controllers/NSETreeController";
import { AdaptiveTabView, type AdaptiveTabOutlineItem } from "./adaptiveTabView";
import { useTabToolbar } from "./tabToolbarView";
import { registerTabViewProjection, tabViewProjection } from "./tabViewInternals";

/**
 * NSTabViewController.TabStyle. Atmo draws `segmentedControlOnBottom` as its bottom tab bar and
 * `segmentedControlOnTop` as the same control above the content; `unspecified` draws no tab control,
 * for an app that switches items itself. `sidebarAdaptable` is an NSE extension after SwiftUI's
 * sidebar-adaptable TabView style: source list, bottom tabs or a rail, chosen from content traits.
 */
export type NSETabViewControllerTabStyle = "segmentedControlOnTop" | "segmentedControlOnBottom" | "toolbar" | "unspecified" | "sidebarAdaptable";

export interface NSETabViewItemOptions {
  /** The item's view controller (NSTabViewItem(viewController:)). It must be a child of the tab view controller. */
  readonly viewController: NSEViewController<unknown>;
  /** NSTabViewItem.identifier. Defaults to a generated one. */
  readonly identifier?: string;
  readonly label?: string;
  readonly image?: NSENavigationIcon;
  readonly toolTip?: string;
}

let itemSequence = 0;

/** One tab of an NSETabViewController (NSTabViewItem): a view controller and how its tab is labelled. */
export class NSETabViewItem {
  readonly identifier: string;
  readonly viewController: NSEViewController<unknown>;
  #label: string;
  #image: NSENavigationIcon | undefined;
  #toolTip: string | undefined;
  /** @internal The tab view controller the item belongs to, told when its tab changes. */
  owner: NSETabViewController | null = null;

  constructor(options: NSETabViewItemOptions) {
    this.viewController = options.viewController;
    this.identifier = options.identifier ?? `nse-tab-${++itemSequence}`;
    if (!this.identifier.trim()) throw new TypeError("A tab view item's identifier must not be empty.");
    this.#label = options.label ?? options.viewController.title ?? "";
    this.#image = options.image;
    this.#toolTip = options.toolTip;
  }

  /** NSTabViewItem.label. Defaults to the view controller's title. */
  get label(): string { return this.#label; }
  set label(label: string) { if (label !== this.#label) { this.#label = label; this.owner?.[tabItemChanged](this, "title"); } }
  /** NSTabViewItem.image. */
  get image(): NSENavigationIcon | undefined { return this.#image; }
  set image(image: NSENavigationIcon | undefined) { if (image !== this.#image) { this.#image = image; this.owner?.[tabItemChanged](this, "image"); } }
  /** NSTabViewItem.toolTip. */
  get toolTip(): string | undefined { return this.#toolTip; }
  set toolTip(toolTip: string | undefined) { if (toolTip !== this.#toolTip) { this.#toolTip = toolTip; this.owner?.[tabItemChanged](this, "title"); } }
}

const tabItemChanged: unique symbol = Symbol("nse.tabItemChanged");

/** What a tab view controller's restoration captures: the selected item's identifier. */
export interface NSETabViewControllerSnapshot {
  readonly selectedIdentifier: string | null;
}

export interface NSETabViewControllerOptions extends NSEViewControllerOptions {
  readonly tabStyle?: NSETabViewControllerTabStyle;
  /**
   * Remembers the selected tab across launches. `capture` receives the snapshot; `restore` usually calls
   * `selectTabViewItem(withIdentifier)`. It connects once the subclass constructor has added its items.
   */
  readonly restoration?: NSENavigationRestorationDescriptor<NSETabViewController, unknown>;
}

function refused(): DOMException { return new DOMException("The tab view controller refused the selection.", "AbortError"); }

/**
 * A container that shows one of its children at a time, chosen with a tab control
 * (NSTabViewController). Each child is an NSETabViewItem; `<tabs.view />` draws the selected item's view
 * and the tab control its `tabStyle` names. Override `shouldSelect`, `willSelect` and `didSelect` (the
 * tab view delegate methods AppKit's controller implements) to take part in a change of tab.
 */
export class NSETabViewController extends NSEViewController<NSETabViewControllerSnapshot> {
  readonly #items: NSETabViewItem[] = [];
  #selectedIndex = -1;
  #tabStyle: NSETabViewControllerTabStyle;
  #model: TabBarController<ReactNode> | null = null;
  #unsubscribeModel: (() => void) | null = null;
  #outline: NSETreeController<AdaptiveTabOutlineItem, string> | null = null;

  constructor(options: NSETabViewControllerOptions = {}) {
    super(options);
    this.#tabStyle = options.tabStyle ?? "segmentedControlOnTop";
    registerTabViewProjection(this, { control: () => this.#model, outline: () => this.#tabOutlineModel() });
    if (options.restoration) registerNSEAuthoringFinalizer(this, () => connectNSENavigationRestoration(this, options.restoration!), 15);
  }

  #snapshot: NSETabViewControllerSnapshot = Object.freeze({ selectedIdentifier: null });
  override getSnapshot(): NSETabViewControllerSnapshot {
    const selectedIdentifier = this.selectedTabViewItem?.identifier ?? null;
    if (selectedIdentifier !== this.#snapshot.selectedIdentifier) this.#snapshot = Object.freeze({ selectedIdentifier });
    return this.#snapshot;
  }

  /** NSTabView.selectTabViewItem(withIdentifier:): selects the item with `identifier`, if there is one. */
  selectTabViewItem(withIdentifier: string): void {
    const index = this.#items.findIndex(item => item.identifier === withIdentifier);
    if (index !== -1) this.selectedTabViewItemIndex = index;
  }

  /** NSTabViewController.tabStyle. */
  get tabStyle(): NSETabViewControllerTabStyle { return this.#tabStyle; }
  set tabStyle(style: NSETabViewControllerTabStyle) {
    if (style !== "segmentedControlOnTop" && style !== "segmentedControlOnBottom" && style !== "toolbar" && style !== "unspecified" && style !== "sidebarAdaptable") throw new TypeError(`Unknown tab style "${String(style)}".`);
    if (style === this.#tabStyle) return;
    this.#tabStyle = style;
    this.#rebuild();
  }

  /** NSTabViewController.tabViewItems. */
  get tabViewItems(): readonly NSETabViewItem[] { return Object.freeze([...this.#items]); }

  /** NSTabViewController.tabViewItem(for:): the item showing `viewController`, or `null`. */
  tabViewItem(viewController: NSEViewController<unknown>): NSETabViewItem | null {
    return this.#items.find(item => item.viewController === viewController) ?? null;
  }

  /** NSTabViewController.addTabViewItem(_:). */
  addTabViewItem(item: NSETabViewItem): void { this.insertTabViewItem(item, this.#items.length); }

  /** NSTabViewController.insertTabViewItem(_:at:). The item's view controller must be a child of this controller. */
  insertTabViewItem(item: NSETabViewItem, index: number): void {
    if (!(item instanceof NSETabViewItem)) throw new TypeError("insertTabViewItem needs an NSETabViewItem.");
    if (item.viewController.parent !== (this as NSEViewController<unknown>)) throw new TypeError("A tab view item's view controller must be a child of its tab view controller; create it with addChild.");
    if (item.owner) throw new TypeError("The tab view item already belongs to a tab view controller.");
    if (this.#items.some(existing => existing.identifier === item.identifier)) throw new TypeError(`A tab view item with identifier "${item.identifier}" already exists.`);
    if (!Number.isInteger(index) || index < 0 || index > this.#items.length) throw new RangeError(`Tab view item index ${index} is out of range.`);
    item.owner = this;
    this.#items.splice(index, 0, item);
    if (this.#selectedIndex === -1) this.#selectedIndex = 0;
    else if (index <= this.#selectedIndex) this.#selectedIndex += 1;
    this.#rebuild();
  }

  /** NSTabViewController.removeTabViewItem(_:): removes the item and its view controller. */
  removeTabViewItem(item: NSETabViewItem): void {
    const index = this.#items.indexOf(item);
    if (index === -1) return;
    this.#items.splice(index, 1);
    item.owner = null;
    if (this.#items.length === 0) this.#selectedIndex = -1;
    else if (index < this.#selectedIndex || this.#selectedIndex >= this.#items.length) this.#selectedIndex = Math.max(0, this.#selectedIndex - 1);
    this.#rebuild();
    item.viewController.removeFromParent();
  }

  /** NSTabViewController.selectedTabViewItemIndex: the selected item's index, or -1 with no items. */
  get selectedTabViewItemIndex(): number { return this.#selectedIndex; }
  set selectedTabViewItemIndex(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#items.length) throw new RangeError(`Tab view item index ${index} is out of range.`);
    if (index === this.#selectedIndex) return;
    const item = this.#items[index]!;
    if (!this.shouldSelect(item)) return;
    this.willSelect(item);
    this.#select(index);
    void this.#model?.select(item.identifier).catch(() => {});
  }

  /** The selected item (NSTabView.selectedTabViewItem), or `null`. */
  get selectedTabViewItem(): NSETabViewItem | null { return this.#items[this.#selectedIndex] ?? null; }

  /** `tabView(_:shouldSelect:)`: return false to keep the current tab. */
  shouldSelect(_tabViewItem: NSETabViewItem): boolean { return true; }
  /** `tabView(_:willSelect:)`. */
  willSelect(_tabViewItem: NSETabViewItem): void {}
  /** `tabView(_:didSelect:)`. */
  didSelect(_tabViewItem: NSETabViewItem): void {}

  #tabOutlineModel(): NSETreeController<AdaptiveTabOutlineItem, string> {
    if (!this.#outline) this.#outline = new NSETreeController({
      owner: this, id: `${this.constructor.name}:tab-outline`,
      content: this.#outlineItems(), getId: item => item.identifier,
      getChildren: () => [], withChildren: item => item, editable: false,
      selection: { mode: "single", allowsEmpty: false },
    });
    return this.#outline;
  }

  #outlineItems(): AdaptiveTabOutlineItem[] {
    return this.#items.map(item => ({ identifier: item.identifier, label: item.label, image: item.image }));
  }

  [tabItemChanged](item: NSETabViewItem, change: "title" | "image"): void {
    // New words retitle the tab control in place; a new picture rebuilds it.
    if (change === "title" && this.#model) {
      this.#model.retitle({ destinations: { [item.identifier]: { label: item.label, ...(item.toolTip ? { accessibleLabel: item.toolTip } : {}) } } });
      this.#outline?.setContent(this.#outlineItems());
      this.notifyObservers();
      return;
    }
    this.#rebuild();
  }

  #select(index: number): void {
    this.#selectedIndex = index;
    this.notifyObservers();
    this.didSelect(this.#items[index]!);
  }

  #rebuild(): void {
    this.#outline?.setContent(this.#outlineItems());
    this.#unsubscribeModel?.();
    this.#unsubscribeModel = null;
    this.#model?.dispose();
    this.#model = null;
    if (this.#items.length > 0) {
      const selected = this.#items[this.#selectedIndex]!;
      const model = new TabBarController<ReactNode>({
        owner: this,
        id: `${this.constructor.name || "NSETabViewController"}:tabs`,
        initialSelectedId: selected.identifier,
        // A fixed segmented style shows every item. The adaptive bottom bar keeps
        // the tab bar's five slots and moves the rest under More, as before.
        ...(this.#tabStyle === "sidebarAdaptable" ? {} : { maximumDirectTabs: this.#items.length }),
        destinations: this.#items.map(item => ({
          id: item.identifier,
          label: item.label,
          ...(item.toolTip ? { accessibleLabel: item.toolTip } : {}),
          icon: item.image ?? { kind: "template" as const, name: item.identifier },
        })),
        onSelect: (destination) => {
          const item = this.#items.find(candidate => candidate.identifier === destination.id);
          if (!item || this.#items.indexOf(item) === this.#selectedIndex) return;
          if (!this.shouldSelect(item)) throw refused();
          this.willSelect(item);
        },
      });
      this.#model = model;
      this.#unsubscribeModel = model.subscribe(() => {
        const index = this.#items.findIndex(item => item.identifier === model.getSnapshot().selectedDestinationId);
        if (index !== -1 && index !== this.#selectedIndex) this.#select(index);
      });
    }
    this.notifyObservers();
  }

  protected override didDispose(): void {
    this.#unsubscribeModel?.();
    this.#unsubscribeModel = null;
    super.didDispose?.();
  }

  static override view = TabViewControllerView;
}

function TabViewControllerView({ controller }: { readonly controller: NSETabViewController }) {
  useObserve(controller);
  const scope = useId().replace(/[^\w-]/g, "");
  useTabToolbar(controller);
  // Keeping these two styles in one projection preserves the selected item's DOM when an outer
  // split supplies the regular sidebar and hands compact navigation back to this tab controller.
  if (controller.tabStyle === "sidebarAdaptable" || controller.tabStyle === "unspecified" || controller.tabStyle === "toolbar") return <div className="nse-tab-view-controller" data-tab-style={controller.tabStyle}>
    <AdaptiveTabView controller={controller} scope={scope} />
  </div>;
  const model = tabViewProjection(controller).control();
  const selected = controller.selectedTabViewItem;
  const Selected = selected?.viewController;
  const bar = model
    ? <TabBar controller={model} aria-label={controller.title ?? "Tabs"} renderPanels={false} idScope={scope} className="nse-tab-view-controller-tabs" />
    : null;
  return <div className="nse-tab-view-controller" data-tab-style={controller.tabStyle}>
    {controller.tabStyle === "segmentedControlOnTop" ? bar : null}
    <div className="nse-tab-view-controller-content" role={bar && selected ? "tabpanel" : undefined} data-nse-role={bar && selected ? "tabpanel" : undefined}
      id={selected ? getNSETabBarPanelId(scope, selected.identifier) : undefined}
      aria-labelledby={bar && selected ? getNSETabBarTabId(scope, selected.identifier) : undefined}>
      {/* One superview slot owns both children through a swap. A keyed presence
          creates a second slot, remounting the incoming controller at handoff
          and losing its layer presentation. */}
      {Selected ? <NSEChildViewControllerView controller={Selected} /> : null}
    </div>
    {controller.tabStyle === "segmentedControlOnBottom" ? bar : null}
  </div>;
}
