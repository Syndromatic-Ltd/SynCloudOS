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

import type { ComponentType } from "react";
import type { AFXLayer } from "../../FX/AnimationFX/AFXLayer";
import type { SynCloudOSLifecycleDisposalReason } from "../../SynCloudOS/nseRuntimeContracts";
import {
  instantiateInOwnerScope,
  nseDisposeFor,
  NSEOwnershipScope,
  type NSEControllerOwnershipOptions,
  type NSEOwnedObject,
  type NSEOwner,
} from "../Controllers/ownership";
import { NSEObject } from "../Objects/NSEObject";
import { NSEObjectLifetime } from "./objectLifetime";
import { createViewControllerFX, type NSEViewControllerFX, type NSEViewControllerFXClients } from "./viewControllerFX";

/**
 * The React component a view controller renders. It receives the controller
 * as its only prop and re-renders when the controller announces a change.
 */
export type NSEViewComponent = ComponentType<{ readonly controller: never }>;

export type NSEViewControllerOptions = NSEControllerOwnershipOptions;

/** A view controller class, as `addChild` and `static` view slots accept it. */
export interface NSEViewControllerClass<TController extends NSEViewController<unknown> = NSEViewController<unknown>> {
  new (options?: NSEViewControllerOptions): TController;
  readonly view?: NSEViewComponent;
}

/** The view a controller manages, while it is mounted. */
export interface NSEControllerView {
  /** Whether the view has mounted at least once and `viewDidLoad` has run. */
  readonly isLoaded: boolean;
  /** The view's root element. Throws `NSE_VIEW_NOT_LOADED` unless mounted. */
  readonly element: HTMLElement;
  /**
   * The view's animation layer: draw into it with `addSublayer`. Bound to the
   * mounted element on first use and released when the view unmounts. Throws
   * `NSE_VIEW_NOT_LOADED` before the view loads and after it unmounts.
   */
  readonly layer: AFXLayer;
}

/** What the React host gives a view controller when its view mounts. */
export interface NSEViewControllerBinding {
  readonly element: HTMLElement;
  /** The mounted application's animation host; absent outside an application. */
  bindLayer?(target: object, signal?: AbortSignal): AFXLayer;
  /** The mounted application's FX clients; absent outside an application. */
  fx?: NSEViewControllerFXClients;
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
 *   readonly notes = new NSEArrayController<Note>({ id: "notes", getId: (note) => note.id });
 *   viewDidLoad() { this.view.layer.addSublayer(new AFXShapeLayer()); }
 * }
 * ```
 *
 * `static view` renders the controller's view. Declare `@observable accessor`
 * fields for state the view reads. A view controller created anywhere an
 * owner is constructing (field initialisers, the constructor, `addChild`)
 * is owned by it; created anywhere else it throws `NSE_CONTROLLER_UNOWNED`
 * unless `owner` or `ownerSignal` is given.
 */
export class NSEViewController<TSnapshot = number> extends NSEObject<TSnapshot> implements NSEOwner, NSEOwnedObject {
  /** The component that renders this controller's view. */
  static view?: NSEViewComponent;

  readonly #lifetime: NSEObjectLifetime;
  readonly #children: NSEViewController<unknown>[] = [];
  readonly #view: NSEControllerView;
  #parent: NSEViewController<unknown> | null = null;
  #loaded = false;
  #binding: NSEViewControllerBinding | null = null;
  #mountSignal: AbortController | null = null;
  #layer: AFXLayer | null = null;
  #appeared = false;
  #pendingDetach: object | null = null;
  #fx: NSEViewControllerFX | null = null;

  constructor(options: NSEViewControllerOptions = {}) {
    super();
    this.#lifetime = new NSEObjectLifetime(
      this,
      "NSEViewController",
      `${new.target.name || "NSEViewController"}#${++viewControllerSequence}`,
      options,
    );
    const controller = this as NSEViewController<unknown>;
    this.#view = Object.freeze({
      get isLoaded() { return controller.#loaded; },
      get element() { return controller.#requireMounted("view.element").element; },
      get layer() { return controller.#boundLayer(); },
    });
  }

  /** The view this controller manages. */
  get view(): NSEControllerView {
    return this.#view;
  }

  /** Aborts when this controller is disposed; controllers created for it adopt it. */
  get ownerSignal(): AbortSignal {
    return this.#lifetime.scope.signal;
  }

  get isDisposed(): boolean {
    return this.#lifetime.isDisposed;
  }

  /**
   * The FX services of the mounted application (motion, location, haptics,
   * MIDI, media, video, Lumina), owned by this controller. Available once the
   * view has mounted, like `view.layer`.
   */
  get fx(): NSEViewControllerFX {
    const binding = this.#requireMounted("fx");
    if (!binding.fx) throw new TypeError("fx needs a mounted application: render the view inside a SynWare.");
    this.#fx ??= createViewControllerFX(binding.fx, this.ownerSignal);
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

  /**
   * Adds a child view controller owned by this one, disposed with it. Pass a
   * class to have the framework construct it (its own controllers belong to
   * it), or an instance created elsewhere.
   */
  addChild<TChild extends NSEViewController<unknown>>(child: TChild | (new (options?: NSEViewControllerOptions) => TChild)): TChild {
    this.#assertLive("addChild", "call");
    const instance = typeof child === "function"
      ? instantiateInOwnerScope(new NSEOwnershipScope("NSEViewController", child.name), () => new child())
      : child;
    const added = instance as NSEViewController<unknown>;
    if (added === (this as NSEViewController<unknown>)) throw new TypeError("A view controller cannot be its own child.");
    added.#assertLive("addChild", "call");
    if (added.#parent && added.#parent !== (this as NSEViewController<unknown>)) {
      throw new TypeError("The view controller already has a parent; call removeFromParent() first.");
    }
    if (added.#parent === (this as NSEViewController<unknown>)) return instance;
    for (let ancestor = this.#parent; ancestor; ancestor = ancestor.#parent) {
      if (ancestor === added) throw new TypeError("A view controller cannot become a child of its own descendant.");
    }
    added.#parent = this as NSEViewController<unknown>;
    added.#lifetime.adoptBy(added, this.#lifetime.scope);
    this.#children.push(added);
    this.notifyObservers();
    return instance;
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
    this.#lifetime.dispose(reason, () => {
      this.#flushDetach();
      const parent = this.#parent;
      this.#parent = null;
      if (parent) {
        const index = parent.#children.indexOf(this as NSEViewController<unknown>);
        if (index >= 0) parent.#children.splice(index, 1);
        if (!parent.isDisposed) parent.notifyObservers();
      }
      this.didDispose();
    });
  }

  /** @internal Makes `scope` (a window controller's) own this root view controller. */
  [nseAdoptViewController](scope: NSEOwnershipScope): void {
    this.#assertLive("contentViewController", "set");
    if (this.#parent) throw new TypeError("A child view controller cannot be a window's content view controller; call removeFromParent() first.");
    this.#lifetime.adoptBy(this, scope);
  }

  /** @internal Called by the React host when the view mounts. Returns the unmount function. */
  [nseAttachView](binding: NSEViewControllerBinding): () => void {
    this.#assertLive("view", "get");
    if (this.#pendingDetach) {
      // React replayed the mount (StrictMode): the view never left.
      this.#pendingDetach = null;
      this.#rebind(binding);
    } else {
      this.#rebind(binding);
      this.#mountSignal = new AbortController();
      if (!this.#loaded) {
        this.#loaded = true;
        this.viewDidLoad();
      }
      this.viewWillAppear();
      this.#appeared = true;
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
  }

  #flushDetach(): void {
    if (!this.#binding && !this.#appeared) return;
    this.#pendingDetach = null;
    const wasAppeared = this.#appeared;
    if (wasAppeared) this.viewWillDisappear();
    this.#appeared = false;
    this.#releaseLayer();
    this.#mountSignal?.abort(new DOMException("The view unmounted.", "AbortError"));
    this.#mountSignal = null;
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
    this.#layer = binding.bindLayer(binding.element, this.#mountSignal?.signal);
    return this.#layer;
  }

  #assertLive(operation: string, access: "call" | "get" | "set"): void {
    if (!this.#lifetime.isDisposed) return;
    throw this.#lifetime.record.error({ code: "NSE_CONTROLLER_DISPOSED", operation, access });
  }
}
