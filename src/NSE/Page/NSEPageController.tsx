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

import { useCallback, useId, useLayoutEffect, useRef, type PointerEvent } from "react";
import { NSEViewController, type NSEViewControllerOptions } from "../Application/NSEViewController";
import { NSEPresence } from "../Animation/NSEPresentation";
import { useObserve } from "../Objects/useObserve";
import { NSEButton } from "../Controls/Buttons/NSEButton";
import { NSEControllerNavigationChromeBoundary, useNSEControllerNavigationChrome } from "../Navigation/NSEApplicationNavigationChrome";

/** How far a horizontal swipe travels before it turns the page, in CSS pixels. */
const SWIPE_DISTANCE = 48;

/**
 * NSPageController.TransitionStyle. `stackHistory` shows one page at a time and keeps the pages
 * visited as a history to go back and forward through; `horizontalStrip` lays the pages side by side
 * and slides between them.
 */
export type NSEPageControllerTransitionStyle = "stackHistory" | "horizontalStrip";

export interface NSEPageControllerOptions extends NSEViewControllerOptions {
  /** NSPageController.transitionStyle. Default `stackHistory`, as in AppKit. */
  readonly transitionStyle?: NSEPageControllerTransitionStyle;
}

export interface NSEPageControllerSnapshot {
  readonly selectedIndex: number;
  readonly count: number;
}

/**
 * NSPageController: a view controller that shows one of its `arrangedObjects` at a time, each through
 * a child view controller. Override the methods AppKit asks of `NSPageControllerDelegate`:
 * `identifierForObject` names the kind of page an object needs, `viewControllerForIdentifier` makes
 * that page (with `this.addChild(...)`; one is made for each identifier and reused), and
 * `prepareViewController` hands it the object (by default as its `representedObject`).
 *
 * In `stackHistory` style the arranged objects are a history: `navigateForwardToObject` drops the
 * pages after the selected one and adds a new one, and `navigateBack` and `navigateForward` move
 * through it. A horizontal swipe turns the page in either style.
 */
export class NSEPageController<T = unknown> extends NSEViewController<NSEPageControllerSnapshot> {
  #objects: readonly T[] = Object.freeze([]);
  #selectedIndex = 0;
  #transitionStyle: NSEPageControllerTransitionStyle;
  readonly #controllers = new Map<string, NSEViewController<unknown>>();
  readonly #prepared = new Map<NSEViewController<unknown>, T>();
  #snapshot: NSEPageControllerSnapshot = Object.freeze({ selectedIndex: 0, count: 0 });

  constructor(options: NSEPageControllerOptions = {}) {
    super(options);
    this.#transitionStyle = options.transitionStyle ?? "stackHistory";
  }

  override getSnapshot(): NSEPageControllerSnapshot {
    const { selectedIndex, count } = this.#snapshot;
    if (selectedIndex !== this.#selectedIndex || count !== this.#objects.length) {
      this.#snapshot = Object.freeze({ selectedIndex: this.#selectedIndex, count: this.#objects.length });
    }
    return this.#snapshot;
  }

  /** NSPageController.transitionStyle. */
  get transitionStyle(): NSEPageControllerTransitionStyle { return this.#transitionStyle; }
  set transitionStyle(style: NSEPageControllerTransitionStyle) {
    if (style !== "stackHistory" && style !== "horizontalStrip") throw new TypeError(`Unknown transition style "${String(style)}".`);
    if (style === this.#transitionStyle) return;
    this.#transitionStyle = style;
    this.#update();
  }

  /** NSPageController.arrangedObjects. The selected index is kept, or clamped to the new objects. */
  get arrangedObjects(): readonly T[] { return this.#objects; }
  set arrangedObjects(objects: readonly T[]) {
    this.#objects = Object.freeze([...objects]);
    this.#selectedIndex = this.#clamp(this.#selectedIndex);
    this.#update();
  }

  /** NSPageController.selectedIndex. */
  get selectedIndex(): number { return this.#selectedIndex; }
  set selectedIndex(index: number) {
    const next = this.#clamp(index);
    if (next === this.#selectedIndex) return;
    this.#selectedIndex = next;
    this.#update();
  }

  /** NSPageController.selectedViewController: the view controller showing the selected object. */
  get selectedViewController(): NSEViewController<unknown> | undefined {
    return this.viewControllerAt(this.#selectedIndex);
  }

  /** The view controller showing the object at `index`, while it shows that object. */
  viewControllerAt(index: number): NSEViewController<unknown> | undefined {
    if (index < 0 || index >= this.#objects.length) return undefined;
    const object = this.#objects[index] as T;
    const controller = this.#controllers.get(this.identifierForObject(object));
    return controller && this.#prepared.get(controller) === object ? controller : undefined;
  }

  /**
   * navigateForwardToObject: (Swift `navigateForward(to:)`): drops the history after the selected
   * page, adds `object` and shows it.
   */
  navigateForwardToObject(object: T): void {
    const kept = this.#objects.length ? this.#objects.slice(0, this.#selectedIndex + 1) : [];
    this.#objects = Object.freeze([...kept, object]);
    this.#selectedIndex = this.#objects.length - 1;
    this.#update();
    this.didTransitionToObject(object);
  }

  /** NSPageController.navigateBack(_:): shows the page before the selected one. */
  navigateBack(): void { this.#turn(-1); }
  /** NSPageController.navigateForward(_:): shows the page after the selected one. */
  navigateForward(): void { this.#turn(1); }

  /** Whether there is a page before the selected one, as `navigateBack` validates. */
  get canNavigateBack(): boolean { return this.#selectedIndex > 0; }
  /** Whether there is a page after the selected one, as `navigateForward` validates. */
  get canNavigateForward(): boolean { return this.#selectedIndex < this.#objects.length - 1; }

  /**
   * pageController(_:identifierFor:): the kind of page `object` needs. Objects with the same identifier
   * share one view controller. Default: the object itself, when it is a string.
   */
  identifierForObject(object: T): string {
    if (typeof object === "string") return object;
    throw new TypeError(`${this.constructor.name} must override identifierForObject for objects that are not strings.`);
  }

  /** pageController(_:viewControllerForIdentifier:): makes the page for `identifier` with `this.addChild(...)`. */
  viewControllerForIdentifier(identifier: string): NSEViewController<unknown> {
    throw new TypeError(`${this.constructor.name} must override viewControllerForIdentifier to make the page "${identifier}".`);
  }

  /** pageController(_:prepare:with:): readies a page to show `object`. Default: sets its `representedObject`. */
  prepareViewController(viewController: NSEViewController<unknown>, object: T): void {
    viewController.representedObject = object;
  }

  /** pageController(_:didTransitionTo:): a swipe or a navigate method turned to `object`. */
  didTransitionToObject(_object: T): void {}

  /** @internal A swipe across the view turns the page one way or the other. */
  turn(direction: -1 | 1): void { this.#turn(direction); }

  #turn(direction: -1 | 1): void {
    const next = this.#selectedIndex + direction;
    if (next < 0 || next >= this.#objects.length) return;
    this.#selectedIndex = next;
    this.#update();
    this.didTransitionToObject(this.#objects[next] as T);
  }

  #clamp(index: number): number {
    const count = this.#objects.length;
    return count ? Math.min(Math.max(0, Math.trunc(index) || 0), count - 1) : 0;
  }

  #controllerFor(identifier: string): NSEViewController<unknown> {
    let controller = this.#controllers.get(identifier);
    if (!controller) {
      controller = this.viewControllerForIdentifier(identifier);
      if (controller.parent !== this) {
        throw new TypeError(`The page "${identifier}" must be a child of its page controller: make it with this.addChild(...).`);
      }
      this.#controllers.set(identifier, controller);
    }
    return controller;
  }

  #prepare(index: number): void {
    const object = this.#objects[index] as T;
    const controller = this.#controllerFor(this.identifierForObject(object));
    if (this.#prepared.has(controller) && this.#prepared.get(controller) === object) return;
    this.#prepared.set(controller, object);
    this.prepareViewController(controller, object);
  }

  /** Makes and prepares the pages that show: every page of a strip, or the selected page of a history. */
  #update(): void {
    if (this.#objects.length) {
      if (this.#transitionStyle === "horizontalStrip") {
        const seen = new Set([this.identifierForObject(this.#objects[this.#selectedIndex] as T)]);
        for (let index = 0; index < this.#objects.length; index++) {
          const identifier = this.identifierForObject(this.#objects[index] as T);
          // A page sharing the selected page's view controller stays empty until it is selected.
          if (!seen.has(identifier)) { seen.add(identifier); this.#prepare(index); }
        }
      }
      this.#prepare(this.#selectedIndex);
    }
    this.notifyObservers();
  }

  static override view = NSEPageControllerView;
}

function NSEPageControllerView({ controller }: { readonly controller: NSEPageController<unknown> }) {
  useObserve(controller);
  const swipe = useRef<{ readonly pointerId: number; readonly x: number; readonly y: number } | null>(null);
  const index = controller.selectedIndex;
  const objects = controller.arrangedObjects;
  const endSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(event.clientY - start.y)) controller.turn(dx < 0 ? 1 : -1);
  };
  const strip = controller.transitionStyle === "horizontalStrip";
  const Selected = controller.selectedViewController;
  const compact = !strip && controller.traitCollection.presentation?.horizontalSizeClass === "compact";
  const backLabel = index > 0 ? `Back to ${controller.viewControllerAt(index - 1)?.title ?? controller.identifierForObject(objects[index - 1])}` : "Back";
  const goBack = useCallback(() => controller.navigateBack(), [controller]);
  const chromeId = useId();
  const stageOwnsChrome = useNSEControllerNavigationChrome(compact ? {
    ownerId: `page:${chromeId}`,
    title: index > 0 ? Selected?.title ?? controller.title ?? "Page" : controller.title ?? Selected?.title ?? "Page",
    back: index > 0 ? { label: backLabel, onActivate: goBack } : null,
  } : null);
  const content = useRef<HTMLDivElement>(null);
  const previousIndex = useRef(index);
  useLayoutEffect(() => {
    if (compact && previousIndex.current !== index) content.current?.focus({ preventScroll: true });
    previousIndex.current = index;
  }, [compact, index]);
  return (
    <NSEControllerNavigationChromeBoundary>
    <div
      className={strip ? "nse-page-controller nse-container-sliding-view" : "nse-page-controller"}
      aria-label={controller.title}
      data-nse-control="page-controller"
      data-transition-style={controller.transitionStyle}
      data-axis="horizontal"
      data-selected-index={index}
      style={compact ? { display: "flex", flexDirection: "column", minHeight: 0 } : undefined}
      onPointerDown={(event) => { if (event.isPrimary) swipe.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; }}
      onPointerUp={endSwipe}
      onPointerCancel={() => { swipe.current = null; }}
    >
      {compact && index > 0 && !stageOwnsChrome ? <div data-nse-part="page-compact-chrome"><NSEButton title={backLabel} onClick={goBack} /></div> : null}
      {strip ? (
        <div className="nse-container-sliding-view-viewport">
          <div className="nse-container-sliding-view-track" style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}>
            {objects.map((_object, objectIndex) => {
              const Page = controller.viewControllerAt(objectIndex);
              return (
                <section
                  key={objectIndex}
                  className="nse-container-sliding-view-panel"
                  aria-roledescription="page"
                  aria-hidden={objectIndex !== index}
                  inert={objectIndex !== index}
                  data-active={objectIndex === index ? "true" : "false"}
                >
                  {Page ? <Page.view /> : null}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div ref={content} tabIndex={-1} role="region" aria-label={Selected?.title ?? "Page content"}
          style={compact ? { flex: "1 1 auto", minHeight: 0 } : { height: "100%" }}>
          <NSEPresence>{Selected ? <Selected.view key={controller.identifierForObject(objects[index])} /> : null}</NSEPresence>
        </div>
      )}
    </div>
    </NSEControllerNavigationChromeBoundary>
  );
}
