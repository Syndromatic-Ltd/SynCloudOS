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
import { PageCurlView } from "./PageCurlView";
import type { PageEvent, PageHandle } from "./pageTypes";
import { connectPageCurl } from "./pageCurlConnection";

/** How far a horizontal swipe travels before it turns the page, in CSS pixels. */
const SWIPE_DISTANCE = 48;

/**
 * NSPageController.TransitionStyle. `stackHistory` shows one page at a time and keeps the pages
 * visited as a history to go back and forward through; `horizontalStrip` lays the pages side by side
 * and slides between them. `pageCurl` uses the approved UIPageViewController transition name and
 * turns a physical sheet, with one page or a two-page spread selected by `spineLocation`.
 */
export type NSEPageControllerTransitionStyle = "stackHistory" | "horizontalStrip" | "pageCurl";
/** UIPageViewController.SpineLocation: the owner-approved UIKit naming exception. */
export type NSEPageControllerSpineLocation = "min" | "mid";

export interface NSEPageControllerOptions extends NSEViewControllerOptions {
  /** NSPageController.transitionStyle. Default `stackHistory`, as in AppKit. */
  readonly transitionStyle?: NSEPageControllerTransitionStyle;
  /** Single page (`min`, default), or a two-page spread (`mid`). Applies to pageCurl. */
  readonly spineLocation?: NSEPageControllerSpineLocation;
}

export interface NSEPageControllerSnapshot {
  readonly selectedIndex: number;
  readonly count: number;
  readonly turnProgress: number;
  readonly turnDirection: "forward" | "backward" | null;
}

/**
 * NSPageController: a view controller that shows one of its `arrangedObjects` at a time, each through
 * a child view controller. Override the methods AppKit asks of `NSPageControllerDelegate`:
 * `identifierForObject` names the kind of page an object needs, `viewControllerForIdentifier` makes
 * that page (with `this.addChild(...)`; history and strip reuse a child for each identifier), and
 * `prepareViewController` hands it the object (by default as its `representedObject`).
 *
 * In `stackHistory` style the arranged objects are a history: `navigateForwardToObject` drops the
 * pages after the selected one and adds a new one, and `navigateBack` and `navigateForward` move
 * through it. A horizontal swipe turns the page in all three styles. A curl retains a child per
 * arranged object so that neighbouring printed pages can coexist.
 */
export class NSEPageController<T = unknown> extends NSEViewController<NSEPageControllerSnapshot> {
  #objects: readonly T[] = Object.freeze([]);
  #selectedIndex = 0;
  #transitionStyle: NSEPageControllerTransitionStyle;
  #spineLocation: NSEPageControllerSpineLocation;
  #turnProgress = 0;
  #turnDirection: "forward" | "backward" | null = null;
  #pendingIndex: number | null = null;
  readonly #leaves: Partial<Record<"forward" | "backward", PageHandle>> = {};
  // Printed pages coexist. A history may reuse one controller for a kind of
  // object; a curl instead retains one child for each represented object.
  readonly #curlControllers = new Map<T, NSEViewController<unknown>>();
  readonly #controllers = new Map<string, NSEViewController<unknown>>();
  readonly #prepared = new Map<NSEViewController<unknown>, T>();
  #snapshot: NSEPageControllerSnapshot = Object.freeze({ selectedIndex: 0, count: 0, turnProgress: 0, turnDirection: null });

  constructor(options: NSEPageControllerOptions = {}) {
    super(options);
    this.#transitionStyle = options.transitionStyle ?? "stackHistory";
    this.#spineLocation = options.spineLocation ?? "min";
    this.#validateStyle(this.#transitionStyle);
    this.#validateSpine(this.#spineLocation);
    connectPageCurl(this, this.#curl);
  }

  override getSnapshot(): NSEPageControllerSnapshot {
    const { selectedIndex, count, turnProgress, turnDirection } = this.#snapshot;
    if (selectedIndex !== this.#selectedIndex || count !== this.#objects.length || turnProgress !== this.#turnProgress || turnDirection !== this.#turnDirection) {
      this.#snapshot = Object.freeze({ selectedIndex: this.#selectedIndex, count: this.#objects.length, turnProgress: this.#turnProgress, turnDirection: this.#turnDirection });
    }
    return this.#snapshot;
  }

  /** NSPageController.transitionStyle. */
  get transitionStyle(): NSEPageControllerTransitionStyle { return this.#transitionStyle; }
  set transitionStyle(style: NSEPageControllerTransitionStyle) {
    this.#validateStyle(style);
    if (style === this.#transitionStyle) return;
    this.#resetCurl();
    this.#transitionStyle = style;
    this.#update();
  }

  get spineLocation(): NSEPageControllerSpineLocation { return this.#spineLocation; }
  set spineLocation(location: NSEPageControllerSpineLocation) {
    this.#validateSpine(location);
    if (location === this.#spineLocation) return;
    this.#resetCurl();
    this.#spineLocation = location;
    this.#update();
  }

  /** NSPageController.arrangedObjects. The selected index is kept, or clamped to the new objects. */
  get arrangedObjects(): readonly T[] { return this.#objects; }
  set arrangedObjects(objects: readonly T[]) {
    this.#resetCurl();
    this.#objects = Object.freeze([...objects]);
    this.#selectedIndex = this.#clamp(this.#selectedIndex);
    this.#update();
  }

  /** NSPageController.selectedIndex. */
  get selectedIndex(): number { return this.#selectedIndex; }
  set selectedIndex(index: number) {
    const wasTurning = this.#turnDirection != null;
    this.#resetCurl();
    const next = this.#clamp(index);
    if (next === this.#selectedIndex) { if (wasTurning) this.notifyObservers(); return; }
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
    if (this.#transitionStyle === "pageCurl") return this.#curlControllers.get(object);
    const controller = this.#controllers.get(this.identifierForObject(object));
    return controller && this.#prepared.get(controller) === object ? controller : undefined;
  }

  /**
   * navigateForwardToObject: (Swift `navigateForward(to:)`): drops the history after the selected
   * page, adds `object` and shows it.
   */
  navigateForwardToObject(object: T): void {
    if (this.#transitionStyle === "pageCurl") {
      const next = this.#objects.indexOf(object);
      if (next === this.#targetIndex(1)) this.#beginCurl(next);
      else if (next !== this.#selectedIndex) throw new RangeError("A page curl navigates to the next arranged object; use selectedIndex to select a distant page.");
      return;
    }
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
  get canNavigateBack(): boolean { return this.#targetIndex(-1) >= 0; }
  /** Whether there is a page after the selected one, as `navigateForward` validates. */
  get canNavigateForward(): boolean { return this.#targetIndex(1) < this.#objects.length; }

  /**
   * pageController(_:identifierFor:): the kind of page `object` needs. Objects with the same identifier
   * share one view controller in history and strip styles. A curl keeps one child per arranged
   * object. Default: the object itself, when it is a string.
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
    const next = this.#targetIndex(direction);
    if (next < 0 || next >= this.#objects.length) return;
    if (this.#transitionStyle === "pageCurl") { this.#beginCurl(next); return; }
    this.#selectedIndex = next;
    this.#update();
    this.didTransitionToObject(this.#objects[next] as T);
  }

  #validateStyle(style: NSEPageControllerTransitionStyle): void {
    if (style !== "stackHistory" && style !== "horizontalStrip" && style !== "pageCurl") throw new TypeError(`Unknown transition style "${String(style)}".`);
  }

  #validateSpine(location: NSEPageControllerSpineLocation): void {
    if (location !== "min" && location !== "mid") throw new TypeError(`Unknown spine location "${String(location)}".`);
  }

  #targetIndex(direction: -1 | 1): number {
    const spread = this.#transitionStyle === "pageCurl" && this.#spineLocation === "mid";
    return spread ? this.#selectedIndex - this.#selectedIndex % 2 + direction * 2 : this.#selectedIndex + direction;
  }

  #beginCurl(index: number): void {
    if (index === this.#selectedIndex) return;
    if (this.#turnDirection) {
      const active = this.#leaves[this.#turnDirection]?.getSnapshot();
      // A command may take over a cosmetic corner peek. A real drag, turn
      // or pending surface wait still owns the navigation until it ends.
      if (!active || active.phase !== "turning" || active.targetProgress > 0.1) return;
    }
    const direction = index > this.#selectedIndex ? "forward" : "backward";
    const leaf = this.#leaves[direction];
    if (!leaf) {
      // There is no visible sheet to animate before loading (or between
      // mounts). Navigation still completes and prepares the selected child.
      this.#selectedIndex = this.#clamp(index);
      this.#update();
      this.didTransitionToObject(this.#objects[this.#selectedIndex] as T);
      return;
    }
    this.#pendingIndex = index;
    this.#turnDirection = direction;
    this.#turnProgress = 0;
    this.notifyObservers();
    leaf.turnTo(1, { durationMs: 560, direction, edge: direction === "forward" ? "right" : "left" });
  }

  #resetCurl(): void {
    this.#pendingIndex = null;
    this.#turnDirection = null;
    this.#turnProgress = 0;
    for (const leaf of Object.values(this.#leaves)) leaf.reset();
  }

  /** @internal Renderer callbacks; no curl handle or engine is public. */
  readonly #curl = {
    attach: (direction: "forward" | "backward", leaf: PageHandle | null): void => {
      if (leaf) this.#leaves[direction] = leaf;
      else delete this.#leaves[direction];
    },
    progress: (progress: number, event: PageEvent): void => {
      if (event.reason === "superseded" || event.reason === "reset") return;
      const { phase, direction } = event.snapshot;
      if (phase === "idle") {
        if (event.reason === "cancel") {
          this.#pendingIndex = null;
          this.#turnProgress = 0;
          this.#turnDirection = null;
          this.notifyObservers();
        }
        return;
      }
      if (progress <= 0 && !this.#turnDirection && phase !== "dragging" && event.snapshot.targetProgress <= 0.1) return;
      if (this.#turnDirection && direction !== this.#turnDirection) return;
      const next = this.#targetIndex(direction === "forward" ? 1 : -1);
      if (next < 0 || next >= this.#objects.length) return;
      this.#pendingIndex ??= next;
      this.#turnDirection = direction;
      this.#turnProgress = Math.min(1, Math.max(0, progress));
      this.notifyObservers();
    },
    end: (event: PageEvent): void => {
      if (event.reason === "superseded" || event.reason === "reset") return;
      const next = this.#pendingIndex;
      const completed = event.snapshot.progress >= 0.999 && next != null;
      this.#pendingIndex = null;
      this.#turnDirection = null;
      this.#turnProgress = 0;
      if (completed) {
        this.#selectedIndex = this.#clamp(next);
        this.#update();
        this.didTransitionToObject(this.#objects[this.#selectedIndex] as T);
      } else this.notifyObservers();
    },
    layFlat: (): void => { for (const leaf of Object.values(this.#leaves)) leaf.setProgress(0, "reset"); },
    reset: (): void => { this.#resetCurl(); this.notifyObservers(); },
  };

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
    let controller: NSEViewController<unknown>;
    if (this.#transitionStyle === "pageCurl") {
      controller = this.#curlControllers.get(object)!;
      if (!controller) {
        controller = this.viewControllerForIdentifier(this.identifierForObject(object));
        if (controller.parent !== this) throw new TypeError("A curling page must be a child of its page controller: make it with this.addChild(...).");
        if ([...this.#curlControllers.values()].includes(controller)) throw new TypeError("Simultaneously printed pages need distinct child view controllers.");
        this.#curlControllers.set(object, controller);
      }
    } else controller = this.#controllerFor(this.identifierForObject(object));
    if (this.#prepared.has(controller) && this.#prepared.get(controller) === object) return;
    this.#prepared.set(controller, object);
    this.prepareViewController(controller, object);
  }

  /** Makes and prepares the pages that show: every page of a strip, or the selected page of a history. */
  #update(): void {
    if (this.#objects.length) {
      if (this.#transitionStyle === "pageCurl") {
        const base = this.#spineLocation === "mid" ? this.#selectedIndex - this.#selectedIndex % 2 : this.#selectedIndex;
        for (let index = Math.max(0, base - 2); index <= Math.min(this.#objects.length - 1, base + 3); index++) this.#prepare(index);
      }
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

  static override view = PageControllerView;
}

function PageControllerView({ controller }: { readonly controller: NSEPageController<unknown> }) {
  return controller.transitionStyle === "pageCurl" ? <PageCurlView controller={controller} /> : <PageNavigationView controller={controller} />;
}

function PageNavigationView({ controller }: { readonly controller: NSEPageController<unknown> }) {
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
      data-nse-control="page-controller" data-nse-part="content"
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
