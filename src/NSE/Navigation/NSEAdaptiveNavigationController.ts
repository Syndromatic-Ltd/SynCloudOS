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

import { NSEViewController, type NSEViewControllerOptions } from "../Application/NSEViewController";
import type { SynCloudOSPresentationTraits } from "../../SynCloudOS/SynCloudOS";
import { NSENavigationStackController } from "./NSENavigationStackController";
import { NSETabBarController } from "./NSETabBarController";
import type {
  NSEAdaptiveNavigationModel,
  NSEAdaptiveNavigationPresentation,
  NSEAdaptiveNavigationRenderer,
  NSEAdaptiveNavigationSnapshot,
} from "./navigationTypes";

export interface NSEAdaptiveNavigationControllerOptions<TContent = unknown> extends NSEViewControllerOptions {
  readonly id: string;
  readonly model: NSEAdaptiveNavigationModel;
  readonly presentation?: NSEAdaptiveNavigationPresentation;
  readonly tabController: NSETabBarController<TContent>;
  readonly stackController?: NSENavigationStackController;
  readonly traits: SynCloudOSPresentationTraits;
}

function requireId(value: string): string {
  if (!value.trim()) throw new TypeError("Adaptive navigation controller id must not be empty.");
  return value;
}

function cloneTraits(source: SynCloudOSPresentationTraits): SynCloudOSPresentationTraits {
  return Object.freeze({
    ...source,
    contentBounds: Object.freeze({ ...source.contentBounds }),
    hostViewportBounds: Object.freeze({ ...source.hostViewportBounds }),
    workArea: Object.freeze({ ...source.workArea }),
    visualViewportBounds: Object.freeze({ ...source.visualViewportBounds }),
    safeAreaInsets: Object.freeze({ ...source.safeAreaInsets }),
  });
}

function sameBounds(
  left: SynCloudOSPresentationTraits["contentBounds"],
  right: SynCloudOSPresentationTraits["contentBounds"],
): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function sameTraits(left: SynCloudOSPresentationTraits, right: SynCloudOSPresentationTraits): boolean {
  return left.revision === right.revision &&
    sameBounds(left.contentBounds, right.contentBounds) &&
    sameBounds(left.hostViewportBounds, right.hostViewportBounds) &&
    left.horizontalSizeClass === right.horizontalSizeClass &&
    left.orientation === right.orientation &&
    sameBounds(left.workArea, right.workArea) &&
    sameBounds(left.visualViewportBounds, right.visualViewportBounds) &&
    left.safeAreaInsets.blockStart === right.safeAreaInsets.blockStart &&
    left.safeAreaInsets.inlineEnd === right.safeAreaInsets.inlineEnd &&
    left.safeAreaInsets.blockEnd === right.safeAreaInsets.blockEnd &&
    left.safeAreaInsets.inlineStart === right.safeAreaInsets.inlineStart &&
    left.virtualKeyboardInset === right.virtualKeyboardInset &&
    left.devicePixelRatio === right.devicePixelRatio &&
    left.primaryPointer === right.primaryPointer &&
    left.hover === right.hover &&
    left.touch === right.touch &&
    left.reducedMotion === right.reducedMotion &&
    left.reducedTransparency === right.reducedTransparency &&
    left.forcedColours === right.forcedColours;
}

function rendererFor(
  model: NSEAdaptiveNavigationModel,
  presentation: NSEAdaptiveNavigationPresentation,
  traits: SynCloudOSPresentationTraits,
): NSEAdaptiveNavigationRenderer {
  if (model === "peer") return presentation === "bottom-tabs" || traits.horizontalSizeClass === "compact" ? "tabs" : "source-list-content";
  return traits.horizontalSizeClass === "compact" ? "stack" : "list-detail";
}

function freezeSnapshot(input: NSEAdaptiveNavigationSnapshot): NSEAdaptiveNavigationSnapshot {
  return Object.freeze({
    ...input,
    traits: cloneTraits(input.traits),
    stack: input.stack ? Object.freeze({ ...input.stack, path: Object.freeze([...input.stack.path]) }) : null,
  });
}

/** Chooses a renderer policy from canonical traits while retaining semantic
 * controllers and their content objects across every transition. */
export class NSEAdaptiveNavigationController<TContent = unknown> extends NSEViewController<NSEAdaptiveNavigationSnapshot> {
  readonly id: string;
  readonly model: NSEAdaptiveNavigationModel;
  readonly presentation: NSEAdaptiveNavigationPresentation;
  readonly tabController: NSETabBarController<TContent>;
  readonly stackController: NSENavigationStackController | null;
  readonly #unsubscribeTab: () => void;
  readonly #unsubscribeStack: (() => void) | null;
  #traits: SynCloudOSPresentationTraits;
  #snapshot: NSEAdaptiveNavigationSnapshot;
  #revision = 0;

  constructor(options: NSEAdaptiveNavigationControllerOptions<TContent>) {
    super(options);
    this.id = requireId(options.id);
    this.model = options.model;
    this.presentation = options.presentation ?? "adaptive";
    this.tabController = options.tabController;
    this.stackController = options.stackController ?? null;
    if (this.model !== "peer" && this.model !== "hierarchy") {
      throw new TypeError("Adaptive navigation model must be peer or hierarchy.");
    }
    if (this.presentation !== "adaptive" && this.presentation !== "bottom-tabs") {
      throw new TypeError("Adaptive navigation presentation must be adaptive or bottom-tabs.");
    }
    if (this.model === "hierarchy" && this.presentation === "bottom-tabs") {
      throw new TypeError("Hierarchy navigation cannot use the bottom-tabs presentation.");
    }
    if (this.model === "hierarchy" && !this.stackController) {
      throw new TypeError("Hierarchy adaptive navigation requires a stack controller.");
    }
    if (this.model === "peer" && this.stackController) {
      throw new TypeError("Peer adaptive navigation cannot use a stack controller.");
    }
    this.#traits = cloneTraits(options.traits);
    this.#snapshot = this.#makeSnapshot();
    this.#unsubscribeTab = this.tabController.subscribe(() => this.#publish());
    this.#unsubscribeStack = this.stackController?.subscribe(() => this.#publish()) ?? null;
    this.getSnapshot = () => this.#snapshot;
  }

  setTraits(traits: SynCloudOSPresentationTraits): void {
    if (this.isDisposed || sameTraits(this.#traits, traits)) return;
    this.#traits = cloneTraits(traits);
    this.#publish();
  }

  protected override didDispose(): void {
    this.#unsubscribeTab();
    this.#unsubscribeStack?.();
  }

  #makeSnapshot(): NSEAdaptiveNavigationSnapshot {
    const tabSnapshot = this.tabController.getSnapshot();
    return freezeSnapshot({
      revision: this.#revision,
      id: this.id,
      model: this.model,
      presentation: this.presentation,
      renderer: rendererFor(this.model, this.presentation, this.#traits),
      traits: this.#traits,
      selectedDestinationId: tabSnapshot.selectedDestinationId,
      stack: this.stackController?.getSnapshot() ?? null,
    });
  }

  #publish(): void {
    if (this.isDisposed) return;
    this.#revision += 1;
    this.#snapshot = this.#makeSnapshot();
    this.notifyObservers();
  }
}
