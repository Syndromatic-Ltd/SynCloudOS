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

import { NSEViewController } from "./NSEViewController";

/**
 * NSLayoutConstraint.Attribute as a titlebar accessory takes it: `leading` sits beside the title,
 * `trailing` at the far edge of the title bar, `bottom` across the bottom of the title bar,
 * under the toolbar.
 */
export type NSETitlebarAccessoryLayoutAttribute = "leading" | "trailing" | "bottom";

/**
 * NSTitlebarAccessoryViewController: a view controller whose view the window draws in its title bar.
 * Add one with `window.addTitlebarAccessoryViewController(_:)`; the window owns it from then on.
 *
 * ```ts
 * class DocumentMenuAccessory extends NSETitlebarAccessoryViewController {
 *   static view = DocumentMenuButton;
 *   constructor() { super(); this.layoutAttribute = "leading"; }
 * }
 * ```
 */
export class NSETitlebarAccessoryViewController<TSnapshot = number> extends NSEViewController<TSnapshot> {
  #layoutAttribute: NSETitlebarAccessoryLayoutAttribute = "bottom";
  #isHidden = false;

  /** Where the window places the accessory; `bottom`, as AppKit's default, until set. */
  get layoutAttribute(): NSETitlebarAccessoryLayoutAttribute {
    return this.#layoutAttribute;
  }

  set layoutAttribute(attribute: NSETitlebarAccessoryLayoutAttribute) {
    if (attribute !== "leading" && attribute !== "trailing" && attribute !== "bottom") {
      throw new TypeError("A titlebar accessory's layoutAttribute is leading, trailing or bottom.");
    }
    if (attribute === this.#layoutAttribute) return;
    this.#layoutAttribute = attribute;
    this.notifyObservers();
  }

  /** NSTitlebarAccessoryViewController.isHidden: the window keeps the accessory but does not draw it. */
  get isHidden(): boolean {
    return this.#isHidden;
  }

  set isHidden(hidden: boolean) {
    if (hidden === this.#isHidden) return;
    this.#isHidden = hidden;
    this.notifyObservers();
  }
}
