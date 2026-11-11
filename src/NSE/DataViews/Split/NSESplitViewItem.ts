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

import type { NSEViewController } from "../../Application/NSEViewController";

/** NSSplitViewItem.Behavior: the role an item plays, which sets its default collapse and holding behaviour. */
export type NSESplitViewItemBehavior = "default" | "sidebar" | "contentList" | "inspector";

/** NSLayoutPriority.defaultLow, the holding priority of a default item. */
const DEFAULT_LOW = 250;

export interface NSESplitViewItemOptions {
  /**
   * Identifies the item to the split view's restored state and its methods
   * (NSUserInterfaceItemIdentification.identifier).
   */
  readonly identifier: string;
  /** The view controller whose view the item shows. The split view controller adopts it as a child. */
  readonly viewController: NSEViewController<unknown>;
  readonly behavior?: NSESplitViewItemBehavior;
  /** The thinnest the item may be along the split, in CSS pixels. Defaults to 0. */
  readonly minimumThickness?: number;
  /** The thickest the item may be along the split, in CSS pixels. Defaults to no limit. */
  readonly maximumThickness?: number;
  /**
   * The share of the split view's size the item takes until a divider beside it moves, and again after
   * its sizes are reset. An item without one starts at its minimum thickness and grows by its holding
   * priority.
   */
  readonly preferredThicknessFraction?: number;
  /** Whether the item may collapse. Sidebars and inspectors can; other items cannot unless set. */
  readonly canCollapse?: boolean;
  /**
   * The priority at which the item holds its thickness while the split view resizes. Lower priorities
   * take size changes first; when the split view cannot fit every item, the highest-priority item that
   * can collapse collapses first. Defaults to 250, and 260 for sidebars, content lists and inspectors.
   */
  readonly holdingPriority?: number;
  /** Whether the item starts collapsed. */
  readonly isCollapsed?: boolean;
}

/** @internal The split view controller an item belongs to. */
export const nseSplitViewItemHost: unique symbol = Symbol("nse.splitViewItemHost");

/** @internal What an item needs from its split view controller. */
export interface NSESplitViewItemHost {
  isItemCollapsed(identifier: string): boolean;
  setItemCollapsed(identifier: string, collapsed: boolean): void;
}

/** One item of an `NSESplitViewController`: a child view controller and how it sizes and collapses (NSSplitViewItem). */
export class NSESplitViewItem {
  readonly identifier: string;
  readonly viewController: NSEViewController<unknown>;
  readonly behavior: NSESplitViewItemBehavior;
  readonly minimumThickness: number;
  readonly maximumThickness: number;
  readonly preferredThicknessFraction: number | undefined;
  readonly canCollapse: boolean;
  readonly holdingPriority: number;
  #host: NSESplitViewItemHost | null = null;
  #collapsed: boolean;

  constructor(options: NSESplitViewItemOptions) {
    const behavior = options.behavior ?? "default";
    const minimum = options.minimumThickness ?? 0;
    const maximum = options.maximumThickness ?? Number.POSITIVE_INFINITY;
    const fraction = options.preferredThicknessFraction;
    const priority = options.holdingPriority ?? (behavior === "default" ? DEFAULT_LOW : DEFAULT_LOW + 10);
    if (!options.identifier.trim()) throw new TypeError("A split view item's identifier must not be empty.");
    if (
      !Number.isFinite(minimum) || minimum < 0
      || !(Number.isFinite(maximum) || maximum === Number.POSITIVE_INFINITY) || maximum < minimum
      || (fraction !== undefined && (!Number.isFinite(fraction) || fraction < 0 || fraction > 1))
      || !Number.isFinite(priority)
    ) {
      throw new RangeError(`Split view item "${options.identifier}" has invalid thickness constraints.`);
    }
    this.identifier = options.identifier;
    this.viewController = options.viewController;
    this.behavior = behavior;
    this.minimumThickness = minimum;
    this.maximumThickness = maximum;
    this.preferredThicknessFraction = fraction;
    this.canCollapse = options.canCollapse ?? (behavior === "sidebar" || behavior === "inspector");
    this.holdingPriority = priority;
    this.#collapsed = options.isCollapsed === true && this.canCollapse;
  }

  /** Whether the item is collapsed. Setting it collapses or expands the item in its split view. */
  get isCollapsed(): boolean {
    return this.#host ? this.#host.isItemCollapsed(this.identifier) : this.#collapsed;
  }

  set isCollapsed(collapsed: boolean) {
    if (this.#host) this.#host.setItemCollapsed(this.identifier, collapsed);
    else this.#collapsed = collapsed && this.canCollapse;
  }

  /** @internal Joins or leaves a split view controller. */
  [nseSplitViewItemHost](host: NSESplitViewItemHost | null): void {
    if (host && this.#host && this.#host !== host) throw new TypeError(`Split view item "${this.identifier}" already belongs to a split view controller.`);
    this.#host = host;
  }
}
