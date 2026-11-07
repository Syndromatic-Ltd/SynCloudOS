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

import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import type { AFXLayer } from "../../FX/AnimationFX/AFXLayer";
import type { SynCloudOSLifecycleDisposalReason } from "../../SynCloudOS/nseRuntimeContracts";
import type { SynCloudOSPresentationTraits } from "../../SynCloudOS/nseRuntimeContracts";
import {
  instantiateInOwnerScope,
  hasNSEConstructionOwner,
  nseDisposeFor,
  NSEOwnershipScope,
  type NSEControllerOwnershipOptions,
  type NSEOwnedObject,
  type NSEOwner,
} from "../Controllers/ownership";
import { NSEObject } from "../Objects/NSEObject";
import { NSEObjectLifetime } from "./objectLifetime";
import { ownNSEFactory, type NSEDisposable, type NSESynchronousDisposable } from "./ownedFactory";
import { NSEViewActivity } from "./viewActivity";
import { NSEChildViewControllerView } from "./viewControllerRenderer";
import { bindNSEViewOutlets } from "./viewOutlet";
import { finalizeNSEAuthoringOwner } from "./authoringLifecycle";
import { getNSEAuthoringContext } from "./authoringContext";
import type { NSEObservable } from "../Objects/observable";
import { createViewControllerFX, type NSEViewControllerFX, type NSEViewControllerFXClients } from "./viewControllerFX";
import type { NSEWindow } from "./NSEWindowController";
import { NSEAnimationContext } from "../Animation/NSEAnimationContext";
import { nseChildTransition, NSEViewControllerTransitionOptions, type NSEChildTransition } from "./viewControllerTransition";
import { createNSEViewAnimator, type NSEViewAnimator } from "../Animation/NSEViewAnimator";
import { captureAFXTransactionAnimationStart } from "../../FX/AnimationFX/AFXTransaction";

/**
 * The React component a view controller renders. It receives the controller
 * as its only prop and re-renders when the controller announces a change.
 */
export type NSEViewComponent = ComponentType<{ readonly controller: never }>;

/** Where a popover points (the positioning view, preferred edge and behaviour of NSPopover). */
export interface NSEPopoverPositioning {
  /** The element the popover points at (NSPopover's positioning view). */
  readonly of: HTMLElement;
  /** The positioning rectangle in `of`'s local coordinates (the whole view
   * when omitted), as NSPopover.show(relativeTo:of:preferredEdge:). */
  readonly relativeTo?: Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
  /** The edge of `of` the popover prefers to open from, in the view's flipped coordinates: `"maxY"` (below, the default), `"minY"` (above), `"minX"` or `"maxX"`. */
  readonly preferredEdge?: "minX" | "maxX" | "minY" | "maxY";
  /** NSPopover.Behavior: `"transient"` (default), `"semitransient"` or `"applicationDefined"`. */
  readonly behavior?: "transient" | "semitransient" | "applicationDefined";
  /** Draw the standard popover plate (default true). With false the content
   * paints its plate and sets --nse-popover-content-fill on its root for the arrow. */
  readonly drawsBackground?: boolean;
}

/** @internal */
export const nsePopoverPositioning: unique symbol = Symbol("nse.popoverPositioning");
/** @internal How a presented view controller is shown: as a sheet, in a popover, or as a modal window. */
export const nsePresentationStyle: unique symbol = Symbol("nse.presentationStyle");
/** @internal */
export type NSEPresentationStyle = "sheet" | "popover" | "modalWindow" | "custom";

/** NSViewControllerPresentationAnimator. The host mounts the presented view
 * above the presenter's retained view before invoking the animator. Returning
 * a promise keeps a dismissal alive until its animation has settled. */
export interface NSEViewControllerPresentationAnimator {
  animatePresentation(of: NSEViewController<unknown>, from: NSEViewController<unknown>): void | Promise<void>;
  animateDismissal(of: NSEViewController<unknown>, from: NSEViewController<unknown>): void | Promise<void>;
}

/** @internal A host invokes a custom animator only after both views mount. */
export const nseAnimatePresentation: unique symbol = Symbol("nse.animatePresentation");
/** @internal Retained custom presentation state. */
export const nseIsDismissing: unique symbol = Symbol("nse.isDismissing");

export type NSEViewControllerOptions = NSEControllerOwnershipOptions & {
  /** The localised title of the managed view (NSViewController.title), as containers show it. */
  readonly title?: string;
};

/** A view controller class, as `addChild` and `static` view slots accept it. */
export interface NSEViewControllerClass<TController extends NSEViewController<unknown> = NSEViewController<unknown>> {
  /** Window content roots receive their owning window; no-argument classes remain valid. */
  new (window: never): TController;
  readonly view?: NSEViewComponent;
  viewDependencies?(controller: TController): readonly (NSEObservable | null | undefined)[];
}

/** @internal Reject ambiguous rendering before constructing or mounting a view. */
export function validateNSEViewControllerClass(Controller: NSEViewControllerClass): void {
  if (Controller.view && typeof Controller.prototype.renderView === "function") {
    throw new TypeError(`${Controller.name} declares both static view and renderView; choose one rendering form.`);
  }
}

/**
 * The view a controller manages (NSViewController.view). A parent places it as AppKit adds a subview:
 * `<this.sidebar.view className="workspace-sidebar" />` renders the child's view, loading it on first
 * mount, inside the parent's own view.
 */
export interface NSEControllerView {
  (props: { readonly className?: string }): ReactElement;
  /** Whether the view has mounted at least once and `viewDidLoad` has run. */
  readonly isLoaded: boolean;
  /** The view's root element. Throws `NSE_VIEW_NOT_LOADED` unless mounted. */
  readonly element: HTMLElement;
  /** Aborts at the end of this committed mount; renewed on a real remount. */
  readonly mountSignal: AbortSignal;
  /**
   * The view's animation layer: draw into it with `addSublayer`. Bound to the
   * mounted element on first use and released when the view unmounts. Throws
   * `NSE_VIEW_NOT_LOADED` before the view loads and after it unmounts.
   */
  readonly layer: AFXLayer;
  /** NSView.animator(): property changes use NSEAnimationContext.current. */
  animator(): NSEViewAnimator;
  /**
   * The window the view is in (NSView.window): its window controller's window, reached through the
   * parent chain. `null` until the controller is a window's content or its descendant.
   */
  readonly window: NSEWindow | null;
}

/** The presentation environment of a controller's view. */
export interface NSETraitCollection {
  readonly reducedMotion: boolean;
  readonly presentation: SynCloudOSPresentationTraits | null;
}

/** @internal Updates presentation traits without replaying appearance callbacks. */
export const nseUpdateTraits: unique symbol = Symbol("nse.updateTraits");
/** @internal Effective presentation/application/browser activity from the mounted host. */
export const nseUpdateViewActivity: unique symbol = Symbol("nse.updateViewActivity");

/** What the React host gives a view controller when its view mounts. */
export interface NSEViewControllerBinding {
  readonly element: HTMLElement;
  readonly traits?: NSETraitCollection;
  readonly active?: boolean;
  /** The mounted application's animation host; absent outside an application. */
  bindLayer?(target: object, signal?: AbortSignal): AFXLayer;
  /** The mounted application's FX clients; absent outside an application. */
  fx?: Partial<NSEViewControllerFXClients>;
}

/** The framework's hook for the React host. Not part of the public API. */
export const nseAttachView: unique symbol = Symbol("nse.attachView");

/** The framework's hook for window controllers: they own a root view controller. Not part of the public API. */
export const nseAdoptViewController: unique symbol = Symbol("nse.adoptViewController");

let viewControllerSequence = 0;

/**
 * Manages one view: loads it, tells it when it appears and disappears, owns
 * its child view controllers and the controllers created while it is
 * constructed, and disposes all of them when it is removed.
 *
 * ```ts
 * class NoteViewController extends NSEViewController {
 *   static view = NoteView;
 *   readonly notes = new NSEArrayController<Note>({ owner: this, id: "notes", getId: (note) => note.id });
 *   viewDidLoad() { this.view.layer.addSublayer(new AFXShapeLayer()); }
 * }
 * ```
 *
 * `static view` renders the controller's view. Declare `@observable accessor`
 * fields for state the view reads. A view controller created anywhere an
 * owner is constructing (field initialisers, the constructor, `addChild`)
 * is owned by it; created anywhere else it throws `NSE_CONTROLLER_UNOWNED`
 * unless `owner` or `ownerSignal` is given.
 *
 * `addChild(ControllerClass)` gives the child its own construction scope. For
 * a raw `new Controller()` nested in another owner's constructor, its own
 * controller fields should pass `owner: this`: the ambient scope still belongs
 * to the outer constructor, including after the nested constructor returns.
 */
export class NSEViewController<TSnapshot = number> extends NSEObject<TSnapshot> implements NSEOwner, NSEOwnedObject {
  static readonly TransitionOptions = NSEViewControllerTransitionOptions;
  /** The component that renders this controller's view. */
  static view?: NSEViewComponent;
  /** Additional explicitly observed state; the controller itself is always observed. */
  static viewDependencies?: (controller: never) => readonly (NSEObservable | null | undefined)[];
  /** Optional inline TSX. Compose function components for local React hooks. */
  renderView?(): ReactNode;

  readonly #lifetime: NSEObjectLifetime;
  readonly #children: NSEViewController<unknown>[] = [];
  readonly #view: NSEControllerView;
  #parent: NSEViewController<unknown> | null = null;
  #windowScope: NSEOwnershipScope | null = null;
  #window: NSEWindow | null = null;
  #presenting: NSEViewController<unknown> | null = null;
  #popover: NSEPopoverPositioning | null = null;
  #presentationStyle: NSEPresentationStyle | null = null;
  #presentationAnimator: NSEViewControllerPresentationAnimator | null = null;
  #dismissing = false;
  #animationPhase: "presentation" | "dismissal" | null = null;
  readonly #presented: NSEViewController<unknown>[] = [];
  #preferredContentSize: Readonly<{ width: number; height: number }> | null = null;
  #loaded = false;
  #binding: NSEViewControllerBinding | null = null;
  readonly #activity: NSEViewActivity;
  #active = true;
  #layer: AFXLayer | null = null;
  #appeared = false;
  #pendingDetach: object | null = null;
  #fx: NSEViewControllerFX | null = null;
  #fxClients: Partial<NSEViewControllerFXClients> | undefined;
  #traits: NSETraitCollection = Object.freeze({ reducedMotion: false, presentation: null });
  #title: string | undefined;
  readonly #transitionSlots = new Map<NSEViewController<unknown>, NSEChildTransition>();
  #transitioning = false;

  constructor(options: NSEViewControllerOptions = {}) {
    super();
    this.#title = options.title;
    this.#lifetime = new NSEObjectLifetime(
      this,
      "NSEViewController",
      `${new.target.name || "NSEViewController"}#${++viewControllerSequence}`,
      options,
    );
    this.#activity = new NSEViewActivity(this);
    const controller = this as NSEViewController<unknown>;
    // One stable component per controller, so React keeps the child's view mounted across renders.
    const view = ({ className }: { readonly className?: string }) => createElement(NSEChildViewControllerView, { controller, className });
    Object.defineProperties(view, {
      displayName: { value: `${new.target.name || "NSEViewController"}.view` },
      isLoaded: { get: () => controller.#loaded },
      element: { get: () => controller.#requireMounted("view.element").element },
      mountSignal: { get: () => { controller.#requireMounted("view.mountSignal"); return controller.#activity.snapshot("mounted").signal; } },
      layer: { get: () => controller.#boundLayer() },
      animator: { value: () => createNSEViewAnimator(() => controller.#requireMounted("view.animator").element, () => controller.#boundLayer(), () => controller.traitCollection.reducedMotion) },
      window: { get: () => controller.#windowOf() },
    });
    this.#view = Object.freeze(view) as unknown as NSEControllerView;
  }

  /**
   * The localised title of the managed view (NSViewController.title). A split view controller labels
   * its items with it when a compact width shows one item at a time.
   */
  get title(): string | undefined { return this.#title; }
  set title(title: string | undefined) {
    if (title === this.#title) return;
    this.#title = title;
    this.notifyObservers();
  }

  #representedObject: unknown = undefined;
  /**
   * The object the view shows (NSViewController.representedObject). A page controller sets it on the
   * page that shows an object; the view reads it, and observers hear when it changes.
   */
  get representedObject(): unknown { return this.#representedObject; }
  set representedObject(object: unknown) {
    if (Object.is(object, this.#representedObject)) return;
    this.#representedObject = object;
    this.notifyObservers();
  }

  /** The view this controller manages. */
  get view(): NSEControllerView {
    return this.#view;
  }

  /** Current NSE animation and content-bound presentation traits. */
  get traitCollection(): NSETraitCollection { return this.#traits; }

  /** @internal Updates activity without replaying presentation lifecycle callbacks. */
  [nseUpdateViewActivity](active: boolean): void { this.#active = active; this.#activity.setActive(active); }

  /** Called when traits change; observing this controller also observes traits. */
  traitCollectionDidChange(_previous: NSETraitCollection): void {}

  /** @internal Called by the presentation host. */
  [nseUpdateTraits](traits: NSETraitCollection): void {
    if (traits.reducedMotion === this.#traits.reducedMotion && traits.presentation === this.#traits.presentation) return;
    const previous = this.#traits;
    this.#traits = traits;
    this.traitCollectionDidChange(previous);
    this.notifyObservers();
  }

  /** Aborts when this controller is disposed; controllers created for it adopt it. */
  get ownerSignal(): AbortSignal {
    return this.#lifetime.scope.signal;
  }

  get isDisposed(): boolean {
    return this.#lifetime.isDisposed;
  }

  /** Constructs and owns a disposable synchronously, including after await. */
  own<T extends NSEDisposable>(factory: (signal: AbortSignal) => NSESynchronousDisposable<T>): T {
    return ownNSEFactory(this, factory);
  }

  /**
   * The FX services of the mounted application (motion, location, haptics,
   * MIDI, media, video, Lumina), owned by this controller. Available once the
   * view has mounted, like `view.layer`.
   */
  get fx(): NSEViewControllerFX {
    const binding = this.#requireMounted("fx");
    if (!binding.fx) throw new TypeError("fx needs a mounted application: render the view inside a SynWare.");
    // A retained controller can return in a new application mount. Its old
    // ports remain retired; only the current binding may supply new FX work.
    if (!this.#fx || this.#fxClients !== binding.fx) {
      this.#fx = createViewControllerFX(binding.fx, this.ownerSignal, this);
      this.#fxClients = binding.fx;
    }
    return this.#fx;
  }

  /** Why this controller was disposed, or `undefined` while it is live. */
  get disposalReason(): SynCloudOSLifecycleDisposalReason | undefined {
    return this.#lifetime.reason;
  }

  get parent(): NSEViewController<unknown> | null {
    return this.#parent;
  }

  get children(): readonly NSEViewController<unknown>[] {
    return this.#children;
  }

  /** NSViewController.transition(from:to:options:completionHandler:). Both
   * controllers remain children; only the incoming view remains in the slot. */
  transition(from: NSEViewController<unknown>, to: NSEViewController<unknown>, options: NSEViewControllerTransitionOptions = NSEViewControllerTransitionOptions.none, completionHandler?: () => void): void {
    this.#assertLive("transition", "call");
    if (from.parent !== this || to.parent !== this || from.isDisposed || to.isDisposed) throw new TypeError("A transition requires two live children of this controller.");
    const effect = options & 127;
    if (!Number.isInteger(options) || options < 0 || options > 255 || (effect && (effect & (effect - 1)))) throw new TypeError("A transition takes at most one effect, optionally with allowUserInteraction.");
    if (completionHandler !== undefined && typeof completionHandler !== "function") throw new TypeError("The completion handler must be callable.");
    if (this.#transitioning) throw new Error("A child transition is already in progress.");
    if (from === to) { completionHandler?.(); return; }
    const slot = [...this.#transitionSlots].find(([, value]) => value.to === from && !value.from)?.[0] ?? from;
    const context = NSEAnimationContext.current;
    this.#transitioning = true;
    const transition: NSEChildTransition = Object.freeze({ from, to, options, duration: context.duration, timing: context.timingFunction, finish: () => {
      if (this.isDisposed || this.#transitionSlots.get(slot) !== transition) return;
      this.#transitioning = false;
      this.#transitionSlots.set(slot, Object.freeze({ ...transition, from: null }));
      this.notifyObservers();
      completionHandler?.();
    } });
    this.#transitionSlots.set(slot, transition);
    const finished = new Promise<import("../../FX/AnimationFX/animationTypes").AFXAnimationSettlement>(resolve => {
      const stop = this.subscribe(() => {
        if (this.#transitionSlots.get(slot) === transition && !this.isDisposed) return;
        stop();
        resolve(Object.freeze({ state: this.isDisposed ? "cancelled" : "completed", reduced: this.traitCollection.reducedMotion }));
      });
    });
    captureAFXTransactionAnimationStart(() => finished);
    this.notifyObservers();
  }

  /** @internal The host resolves replacements in their original child slot. */
  [nseChildTransition](child: NSEViewController<unknown>): NSEChildTransition | undefined { return this.#transitionSlots.get(child); }

  /** Whether the view is currently on screen. */
  get isViewVisible(): boolean {
    return this.#appeared;
  }

  /** Calls `listener` once, after this controller is disposed. */
  onDispose(listener: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
    return this.#lifetime.onDispose(listener);
  }

  /** The view mounted for the first time. Override to read `this.view.layer`. */
  viewDidLoad(): void {}
  /** The view is about to appear. */
  viewWillAppear(): void {}
  /** The view appeared. */
  viewDidAppear(): void {}
  /** The view is about to leave the screen. */
  viewWillDisappear(): void {}
  /** The view left the screen. */
  viewDidDisappear(): void {}
  /** Runs after the controller is disposed, before the controllers it owns are. */
  protected didDispose(): void {}
  /** The committed view is about to lay out, initially and when its frame changes. */
  viewWillLayout(): void {}
  /** The committed view has laid out; its DOM geometry can be read. */
  viewDidLayout(): void {}

  /**
   * Adds a child view controller owned by this one, disposed with it. Pass a
   * class to have the framework construct it (its own controllers belong to
   * it), or an instance created elsewhere.
   */
  addChild<TChild extends NSEViewController<unknown>>(child: TChild): TChild;
  addChild<TChild extends NSEViewController<unknown>, TArgs extends unknown[]>(Controller: new (...args: TArgs) => TChild, ...args: TArgs): TChild;
  addChild<TChild extends NSEViewController<unknown>, TArgs extends unknown[]>(child: TChild | (new (...args: TArgs) => TChild), ...args: TArgs): TChild {
    this.#assertLive("addChild", "call");
    const instance = typeof child === "function"
      ? instantiateInOwnerScope(new NSEOwnershipScope("NSEViewController", child.name), () => {
        const result = new child(...args);
        try { this.#assertLive("addChild", "call"); }
        catch (error) { try { result[nseDisposeFor](this.disposalReason ?? "explicit"); } finally { throw error; } }
        return result;
      })
      : child;
    const added = instance as NSEViewController<unknown>;
    if (added === (this as NSEViewController<unknown>)) throw new TypeError("A view controller cannot be its own child.");
    added.#assertLive("addChild", "call");
    if (added.#windowScope) throw new TypeError("A window's content view controller cannot also be a child view controller.");
    if (added.#parent && added.#parent !== (this as NSEViewController<unknown>)) {
      throw new TypeError("The view controller already has a parent; call removeFromParent() first.");
    }
    if (added.#parent === (this as NSEViewController<unknown>)) return instance;
    for (let ancestor = this.#parent; ancestor; ancestor = ancestor.#parent) {
      if (ancestor === added) throw new TypeError("A view controller cannot become a child of its own descendant.");
    }
    added.#lifetime.adoptBy(added, this.#lifetime.scope);
    added.#parent = this as NSEViewController<unknown>;
    this.#children.push(added);
    if (!hasNSEConstructionOwner() && getNSEAuthoringContext(this)) {
      try { finalizeNSEAuthoringOwner(added); }
      catch (error) {
        if (typeof child === "function") { try { added[nseDisposeFor]("explicit"); } catch { /* Preserve finalization failure. */ } }
        throw error;
      }
    }
    this.notifyObservers();
    return instance;
  }

  /**
   * The size the view prefers when it is presented (NSViewController.preferredContentSize): a sheet is
   * this wide, up to the window's width. `null` lets the content decide.
   */
  get preferredContentSize(): Readonly<{ width: number; height: number }> | null { return this.#preferredContentSize; }
  set preferredContentSize(size: Readonly<{ width: number; height: number }> | null) {
    if (size !== null && !(Number.isFinite(size?.width) && size.width >= 0 && Number.isFinite(size?.height) && size.height >= 0))
      throw new TypeError("A preferred content size needs a finite width and height of 0 or more.");
    this.#preferredContentSize = size === null ? null : Object.freeze({ width: size.width, height: size.height });
    this.notifyObservers();
  }

  /** The view controllers this one presents, as sheets, popovers and modal windows (NSViewController.presentedViewControllers). */
  get presentedViewControllers(): readonly NSEViewController<unknown>[] { return Object.freeze([...this.#presented]); }

  /** @internal How a presented controller is positioned when it is a popover; `null` for a sheet. */
  get [nsePopoverPositioning](): NSEPopoverPositioning | null { return this.#popover; }

  /** @internal How this controller is presented, or `null` when it is not presented. */
  get [nsePresentationStyle](): NSEPresentationStyle | null { return this.#presentationStyle; }

  /** The view controller presenting this one (NSViewController.presentingViewController), or `null`. */
  get presentingViewController(): NSEViewController<unknown> | null { return this.#presenting; }

  /** NSViewController.present(_:animator:). The presenter remains mounted underneath. */
  present<TController extends NSEViewController<unknown>>(viewController: TController, animator: NSEViewControllerPresentationAnimator): TController {
    if (!animator || typeof animator.animatePresentation !== "function" || typeof animator.animateDismissal !== "function")
      throw new TypeError("present needs an NSViewControllerPresentationAnimator with presentation and dismissal methods.");
    if (viewController.presentingViewController === this) return viewController;
    const result = this.#present("present", "custom", null, viewController, []);
    (result as NSEViewController<unknown>).#presentationAnimator = animator;
    return result;
  }

  get [nseIsDismissing](): boolean { return this.#dismissing; }

  /** @internal Called after mounting, or after a request to dismiss. */
  [nseAnimatePresentation](): void {
    const from = this.#presenting, animator = this.#presentationAnimator;
    if (!from || !animator || this.isDisposed) return;
    const phase = this.#dismissing ? "dismissal" : "presentation";
    if (this.#animationPhase === phase) return;
    this.#animationPhase = phase;
    const complete = () => {
      if (phase === "dismissal" && this.#dismissing && !this.isDisposed) this[nseDisposeFor]("removed-from-parent");
    };
    try {
      const result = phase === "dismissal" ? animator.animateDismissal(this, from) : animator.animatePresentation(this, from);
      if (result) void Promise.resolve(result).then(complete, complete);
      else complete();
    } catch {
      // Cosmetic animation failures must never strand a live presentation.
      complete();
    }
  }

  /**
   * Presents `viewController` as a sheet on this controller's window (NSViewController.presentAsSheet(_:)).
   * The sheet attaches under the window's title bar and toolbar and blocks the rest of the window, whose
   * close button is refused until it is dismissed; its actions reach this controller after its own. Escape sends the sheet `cancelOperation()` when it has one, and otherwise
   * dismisses it. The presenter owns the sheet: dismissing it disposes it.
   */
  presentAsSheet<TSheet extends NSEViewController<unknown>>(viewController: TSheet): TSheet;
  /** Creates the view controller in this controller's ownership, as `addChild` does, and presents it as a sheet. */
  presentAsSheet<TSheet extends NSEViewController<unknown>, TArgs extends unknown[]>(Controller: new (...args: TArgs) => TSheet, ...args: TArgs): TSheet;
  presentAsSheet<TSheet extends NSEViewController<unknown>, TArgs extends unknown[]>(viewController: TSheet | (new (...args: TArgs) => TSheet), ...args: TArgs): TSheet {
    return this.#present("presentAsSheet", "sheet", null, viewController, args);
  }

  /**
   * Presents `viewController` as an application-modal window, centred over the application
   * (NSViewController.presentAsModalWindow(_:)). It takes the controller's `title` as its title and
   * `preferredContentSize.width` as its width; the rest of the application takes no input until it is
   * dismissed. Escape sends it `cancelOperation()` when it has one, and otherwise dismisses it. The
   * presenter owns it: dismissing it disposes it.
   */
  presentAsModalWindow<TWindow extends NSEViewController<unknown>>(viewController: TWindow): TWindow;
  /** Creates the view controller in this controller's ownership, as `addChild` does, and presents it as a modal window. */
  presentAsModalWindow<TWindow extends NSEViewController<unknown>, TArgs extends unknown[]>(Controller: new (...args: TArgs) => TWindow, ...args: TArgs): TWindow;
  presentAsModalWindow<TWindow extends NSEViewController<unknown>, TArgs extends unknown[]>(viewController: TWindow | (new (...args: TArgs) => TWindow), ...args: TArgs): TWindow {
    return this.#present("presentAsModalWindow", "modalWindow", null, viewController, args);
  }

  /**
   * Presents `viewController` in a popover next to `positioning.of`
   * (NSViewController.present(_:asPopoverRelativeTo:of:preferredEdge:behavior:)). The popover takes the
   * presented controller's `title` as its accessible name and `preferredContentSize` as its size. A
   * `"transient"` popover (the default) closes when the person clicks elsewhere or presses Escape; a
   * `"semitransient"` one only on Escape; an `"applicationDefined"` one only when it is dismissed. Every
   * popover closes when its positioning element leaves the document. Closing dismisses (disposes) it.
   */
  presentAsPopover<TPopover extends NSEViewController<unknown>>(viewController: TPopover, positioning: NSEPopoverPositioning): TPopover;
  /** Creates the view controller in this controller's ownership, as `addChild` does, and presents it in a popover. */
  presentAsPopover<TPopover extends NSEViewController<unknown>, TArgs extends unknown[]>(Controller: new (...args: TArgs) => TPopover, positioning: NSEPopoverPositioning, ...args: TArgs): TPopover;
  presentAsPopover<TPopover extends NSEViewController<unknown>, TArgs extends unknown[]>(viewController: TPopover | (new (...args: TArgs) => TPopover), positioning: NSEPopoverPositioning, ...args: TArgs): TPopover {
    const view = positioning?.of as unknown;
    if (!view || typeof view !== "object" || (view as Node).nodeType !== 1) throw new TypeError("presentAsPopover needs positioning.of, the element the popover points at.");
    const edge = positioning.preferredEdge ?? "maxY";
    if (edge !== "minX" && edge !== "maxX" && edge !== "minY" && edge !== "maxY") throw new TypeError("A popover's preferredEdge is minX, maxX, minY or maxY.");
    const behavior = positioning.behavior ?? "transient";
    if (behavior !== "transient" && behavior !== "semitransient" && behavior !== "applicationDefined") throw new TypeError("A popover's behavior is transient, semitransient or applicationDefined.");
    const drawsBackground = positioning.drawsBackground ?? true;
    if (typeof drawsBackground !== "boolean") throw new TypeError("A popover's drawsBackground is a boolean.");
    const rect = positioning.relativeTo;
    if (rect && (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0)) throw new TypeError("A popover's relativeTo is a finite rectangle with non-negative size.");
    const relativeTo = rect ? Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }) : undefined;
    return this.#present("presentAsPopover", "popover", Object.freeze({ of: positioning.of, preferredEdge: edge, behavior, drawsBackground, ...(relativeTo ? { relativeTo } : {}) }), viewController, args);
  }

  #present<TSheet extends NSEViewController<unknown>, TArgs extends unknown[]>(operation: string, style: NSEPresentationStyle, popover: NSEPopoverPositioning | null, viewController: TSheet | (new (...args: TArgs) => TSheet), args: TArgs): TSheet {
    this.#assertLive(operation, "call");
    const instance = typeof viewController === "function"
      ? instantiateInOwnerScope(new NSEOwnershipScope("NSEViewController", viewController.name), () => {
        const result = new viewController(...args);
        try { this.#assertLive(operation, "call"); }
        catch (error) { try { result[nseDisposeFor](this.disposalReason ?? "explicit"); } finally { throw error; } }
        return result;
      })
      : viewController;
    const sheet = instance as NSEViewController<unknown>;
    if (!(sheet instanceof NSEViewController)) throw new TypeError(`${operation} needs a view controller.`);
    sheet.#assertLive(operation, "call");
    if (sheet === (this as NSEViewController<unknown>)) throw new TypeError("A view controller cannot present itself.");
    if (sheet.#presenting === (this as NSEViewController<unknown>)) return instance;
    if (sheet.#parent || sheet.#windowScope || sheet.#presenting) throw new TypeError("A presented view controller cannot already be a child, a window's content or presented elsewhere.");
    sheet.#lifetime.adoptBy(sheet, this.#lifetime.scope);
    sheet.#presenting = this as NSEViewController<unknown>;
    sheet.#popover = popover;
    sheet.#presentationStyle = style;
    this.#presented.push(sheet);
    if (typeof viewController === "function" && !hasNSEConstructionOwner() && getNSEAuthoringContext(this)) {
      try { finalizeNSEAuthoringOwner(sheet); }
      catch (error) { try { sheet[nseDisposeFor]("explicit"); } catch { /* Preserve finalization failure. */ } throw error; }
    }
    this.notifyObservers();
    return instance;
  }

  /**
   * Dismisses a view controller this one presents (NSViewController.dismiss(_:)), disposing it. With no
   * argument, a presented controller dismisses itself.
   */
  dismiss(viewController?: NSEViewController<unknown>): void {
    if (viewController === undefined) {
      this.#presenting?.dismiss(this as NSEViewController<unknown>);
      return;
    }
    if (viewController.#presenting !== (this as NSEViewController<unknown>)) return;
    if (viewController.#presentationStyle === "custom" && viewController.#binding) {
      if (viewController.#dismissing) return;
      viewController.#dismissing = true;
      viewController.notifyObservers();
      return;
    }
    viewController[nseDisposeFor]("removed-from-parent");
  }

  /** Disposes this controller (reason `"removed-from-parent"`) and detaches it from its parent. */
  removeFromParent(): void {
    if (!this.#parent) return;
    this[nseDisposeFor]("removed-from-parent");
  }

  /** Disposes this controller, its children and the controllers it owns. */
  dispose(): void {
    this[nseDisposeFor]("explicit");
  }

  /** @internal Disposal entry used by owners; records `reason`. */
  [nseDisposeFor](reason: SynCloudOSLifecycleDisposalReason): void {
    if (this.isDisposed) return;
    try {
      this.#lifetime.dispose(reason, () => {
        this.#flushDetach();
        const parent = this.#parent ?? this.#presenting;
        this.#parent = null;
        this.#presenting = null;
        if (parent) {
          const index = parent.#children.indexOf(this as NSEViewController<unknown>);
          if (index >= 0) parent.#children.splice(index, 1);
          const presented = parent.#presented.indexOf(this as NSEViewController<unknown>);
          if (presented >= 0) parent.#presented.splice(presented, 1);
          if (!parent.isDisposed) parent.notifyObservers();
        }
        this.didDispose();
      });
    } finally {
      this.notifyObservers();
    }
  }

  /** @internal Makes `scope` (a window controller's) own this root view controller. */
  [nseAdoptViewController](scope: NSEOwnershipScope, window: NSEWindow): void {
    this.#assertLive("contentViewController", "set");
    if (this.#parent) throw new TypeError("A child view controller cannot be a window's content view controller; call removeFromParent() first.");
    if (this.#windowScope && this.#windowScope !== scope) throw new TypeError("The view controller is already another window's content view controller.");
    this.#lifetime.adoptBy(this, scope);
    this.#windowScope = scope;
    this.#window = window;
  }

  #windowOf(): NSEWindow | null {
    let controller: NSEViewController<unknown> | null = this as NSEViewController<unknown>;
    while (controller) {
      if (controller.#window) return controller.#window;
      controller = controller.#parent ?? controller.#presenting;
    }
    return null;
  }

  /** @internal Called by the React host when the view mounts. Returns the unmount function. */
  [nseAttachView](binding: NSEViewControllerBinding): () => void {
    this.#assertLive("view", "get");
    finalizeNSEAuthoringOwner(this);
    if (this.#pendingDetach) {
      // React replayed the mount (StrictMode): the view never left.
      this.#pendingDetach = null;
      this.#rebind(binding);
    } else {
      this.#rebind(binding);
      this.#activity.mount();
      if (!this.#loaded) {
        this.#loaded = true;
        this.viewDidLoad();
      }
      this.#activity.didLoad();
      this.viewWillAppear();
      this.#appeared = true;
      this.#activity.present(this.#active);
      this.viewDidAppear();
    }
    const token = {};
    return () => {
      this.#pendingDetach = token;
      queueMicrotask(() => {
        if (this.#pendingDetach === token) this.#flushDetach();
      });
    };
  }

  #rebind(binding: NSEViewControllerBinding): void {
    if (this.#binding && this.#binding.element !== binding.element) this.#releaseLayer();
    this.#binding = binding;
    bindNSEViewOutlets(this, binding);
    if (binding.active !== undefined) this[nseUpdateViewActivity](binding.active);
    if (binding.traits) this[nseUpdateTraits](binding.traits);
  }

  #flushDetach(): void {
    if (!this.#binding && !this.#appeared) return;
    this.#pendingDetach = null;
    const wasAppeared = this.#appeared;
    if (wasAppeared) this.viewWillDisappear();
    this.#appeared = false;
    bindNSEViewOutlets(this, null);
    this.#releaseLayer();
    this.#activity.unmount();
    this.#binding = null;
    if (wasAppeared) this.viewDidDisappear();
  }

  #releaseLayer(): void {
    this.#layer = null;
  }

  #requireMounted(member: string): NSEViewControllerBinding {
    if (this.#binding) return this.#binding;
    throw this.#lifetime.record.error({
      code: "NSE_VIEW_NOT_LOADED",
      operation: member,
      access: "get",
      problem: this.#loaded ? "The view has unmounted." : "The view has not mounted yet.",
    });
  }

  #boundLayer(): AFXLayer {
    const binding = this.#requireMounted("view.layer");
    if (this.#layer) return this.#layer;
    if (!binding.bindLayer) {
      throw new TypeError("view.layer needs a mounted application: render the view inside a SynWare.");
    }
    this.#layer = binding.bindLayer(binding.element, this.#activity.snapshot("mounted").signal);
    return this.#layer;
  }

  #assertLive(operation: string, access: "call" | "get" | "set"): void {
    if (!this.#lifetime.isDisposed) return;
    throw this.#lifetime.record.error({ code: "NSE_CONTROLLER_DISPOSED", operation, access });
  }
}
