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

import type { SynCloudOSLifecycleDisposalReason } from "../../SynCloudOS/nseRuntimeContracts";
import type { SynWareOwnedWindowSnapshot, SynWareWindowCloseGuard } from "../../SynCloudOSReact/appRuntimeTypes";
import {
  nseDisposeFor,
  type NSEControllerOwnershipOptions,
  type NSEOwnedObject,
  type NSEOwner,
} from "../Controllers/ownership";
import { NSEObject } from "../Objects/NSEObject";
import type { NSEApplication, NSEOpenWindowOptions } from "./NSEApplication";
import { NSEObjectLifetime } from "./objectLifetime";
import { nseAdoptViewController, type NSEViewComponent, type NSEViewController } from "./NSEViewController";

export type NSEWindowControllerOptions = NSEControllerOwnershipOptions & NSEOpenWindowOptions;
const defaultOpeningOptions: Readonly<NSEOpenWindowOptions> = Object.freeze({});

/** What `window.close()` reports. */
export type NSEWindowCloseOutcome = "closed" | "cancelled" | "refused";

/** The window a controller manages. Available once the window has loaded. */
export interface NSEWindow {
  /** The window's identity, or `null` when the application is shown on the stage. */
  readonly id: string | null;
  /** The window title; assigning it renames the window. */
  title: string;
  readonly isKey: boolean;
  readonly isMinimised: boolean;
  /** The window's current bounds, or `null` before it has mounted. */
  readonly frame: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  /** Closes the window, asking `windowShouldClose` first. */
  close(): Promise<NSEWindowCloseOutcome>;
  minimise(): void;
  zoom(): void;
  focus(): void;
}

/** The document a window was opened for. */
export interface NSEWindowDocument {
  readonly id: string;
  readonly role: "primary" | "secondary" | "inspector";
}

/** A window controller class, as `static mainWindow` and `openWindow` accept it. */
// A window controller of any application type: classes are written against their own application.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NSEAnyWindowController = NSEWindowController<any>;

export interface NSEWindowControllerClass<TController extends NSEAnyWindowController = NSEAnyWindowController> {
  new (options?: NSEWindowControllerOptions): TController;
  readonly view?: NSEViewComponent;
}

/** What the React host gives a window controller while its window is mounted. */
export interface NSEWindowMount {
  /** The window's identity, or `null` on the stage. */
  readonly windowId: string | null;
  getSnapshot(): SynWareOwnedWindowSnapshot | null;
  subscribe(listener: () => void): () => void;
  focus(): void;
  minimise(): void;
  zoom(): void;
  setTitle(title: string): void;
  close(): Promise<NSEWindowCloseOutcome>;
  /** Lets the controller veto the window's close and learn it is closing. Does nothing on the stage. Returns the function that removes the guard. */
  registerCloseGuard(guard: SynWareWindowCloseGuard): () => void;
}

/** What the framework hands a window controller it constructs. */
export interface NSEWindowControllerContext {
  readonly app: NSEApplication;
  readonly openingOptions?: NSEOpenWindowOptions;
}

/** The framework's view of a window controller. Not part of the public API. */
export interface NSEWindowControllerInternals {
  /** Whether `windowDidLoad` has run. */
  readonly isLoaded: boolean;
  /** Binds the mounted window; the first call runs `windowDidLoad`. Returns the unbind function. */
  attach(mount: NSEWindowMount): () => void;
  /** Reports a key-window change to `windowDidBecomeKey` / `windowDidResignKey`. */
  setKey(isKey: boolean): void;
  /** Consults `windowShouldClose`. */
  shouldClose(): boolean | Promise<boolean>;
  /** Notifies `windowWillClose`. */
  willClose(): void;
}

export const nseWindowInternals: unique symbol = Symbol("nse.windowInternals");

let windowControllerSequence = 0;

/**
 * Manages one window of an application: its content, its title and its close.
 * The framework constructs one per window (`NSEApplication.mainWindow`, or the
 * class given to `openWindow`) and disposes it when the window closes, with
 * the view controllers and controllers it owns.
 *
 * ```ts
 * class NotesWindowController extends NSEWindowController<NotesApp> {
 *   static view = NotesView;               // receives { controller }
 *   readonly sidebar = new NoteListViewController();
 *   windowShouldClose() { return !this.app.hasUnsavedChanges; }
 * }
 * ```
 *
 * Render with `static view`, or assign `contentViewController` for a window
 * whose root is a view controller. Declare `@action` methods for commands
 * scoped to the window.
 */
export class NSEWindowController<TApp extends NSEApplication = NSEApplication> extends NSEObject implements NSEOwner, NSEOwnedObject {
  /** The component that renders this window's content. */
  static view?: NSEViewComponent;

  readonly #lifetime: NSEObjectLifetime;
  readonly #window: NSEWindow;
  readonly #internals: NSEWindowControllerInternals;
  #mount: NSEWindowMount | null = null;
  #loaded = false;
  #key = false;
  #pendingTitle: string | null = null;
  #contentViewController: NSEViewController<unknown> | null = null;
  /** The options used to open or restore this controller, available in its constructor. */
  get openingOptions(): Readonly<NSEOpenWindowOptions> {
    return (this.#lifetime.context as NSEWindowControllerContext).openingOptions ?? defaultOpeningOptions;
  }

  constructor(options: NSEWindowControllerOptions = {}) {
    super();
    this.#lifetime = new NSEObjectLifetime(
      this,
      "NSEWindowController",
      `${new.target.name || "NSEWindowController"}#${++windowControllerSequence}`,
      options,
    );
    const controller = this as NSEWindowController<NSEApplication>;
    const requireMount = (member: string): NSEWindowMount => {
      const mount = controller.#mount;
      if (mount) return mount;
      throw controller.#lifetime.record.error({
        code: "NSE_VIEW_NOT_LOADED",
        operation: `window.${member}`,
        access: member === "close" || member === "minimise" || member === "zoom" || member === "focus" ? "call" : "get",
        problem: "The window has not mounted yet or has closed.",
      });
    };
    this.#window = Object.freeze({
      get id() { return controller.#mount?.windowId ?? null; },
      get title() { return controller.#mount?.getSnapshot()?.title ?? controller.#pendingTitle ?? ""; },
      set title(value: string) {
        controller.#pendingTitle = value;
        controller.#mount?.setTitle(value);
      },
      get isKey() { return controller.#key; },
      get isMinimised() { return controller.#mount?.getSnapshot()?.state === "minimised"; },
      get frame() { return controller.#mount?.getSnapshot()?.bounds ?? null; },
      close: () => requireMount("close").close(),
      minimise: () => requireMount("minimise").minimise(),
      zoom: () => requireMount("zoom").zoom(),
      focus: () => requireMount("focus").focus(),
    });
    this.#internals = {
      get isLoaded() { return controller.#loaded; },
      attach: (mount) => controller.#attach(mount),
      setKey: (isKey) => controller.#setKey(isKey),
      shouldClose: () => controller.windowShouldClose(),
      willClose: () => controller.windowWillClose(),
    };
  }

  /** The application this window belongs to. */
  get app(): TApp {
    const context = this.#lifetime.context as NSEWindowControllerContext | undefined;
    if (!context) throw new TypeError("This window controller was not created by an application; it has no app.");
    return context.app as TApp;
  }

  /** The window this controller manages. */
  get window(): NSEWindow {
    return this.#window;
  }

  /** The document the window was opened for, or `null`. */
  get document(): NSEWindowDocument | null {
    const snapshot = this.#mount?.getSnapshot();
    if (!snapshot?.documentId) return null;
    return Object.freeze({ id: snapshot.documentId, role: snapshot.documentAssociationRole ?? "primary" });
  }

  /**
   * The window's root view controller, rendered instead of `static view`. The
   * window controller owns it: replacing it disposes the previous one.
   */
  get contentViewController(): NSEViewController<unknown> | null {
    return this.#contentViewController;
  }

  set contentViewController(controller: NSEViewController<unknown> | null) {
    this.#assertLive("contentViewController", "set");
    if (controller === this.#contentViewController) return;
    const previous = this.#contentViewController;
    this.#contentViewController = controller;
    if (controller) controller[nseAdoptViewController](this.#lifetime.scope);
    if (previous) previous[nseDisposeFor]("removed-from-parent");
    this.notifyObservers();
  }

  /** Aborts when this window controller is disposed. */
  get ownerSignal(): AbortSignal {
    return this.#lifetime.scope.signal;
  }

  get isDisposed(): boolean {
    return this.#lifetime.isDisposed;
  }

  /** Why this window controller was disposed, or `undefined` while it is live. */
  get disposalReason(): SynCloudOSLifecycleDisposalReason | undefined {
    return this.#lifetime.reason;
  }

  /** Calls `listener` once, after this window controller is disposed. */
  onDispose(listener: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
    return this.#lifetime.onDispose(listener);
  }

  /** The window mounted; `this.window` is usable. Runs before any view loads. */
  windowDidLoad(): void {}
  /**
   * Asked before the window closes. Return `false` (or a promise of it) to
   * keep the window open. Skipped when the whole application is quitting;
   * that is `applicationShouldTerminate`'s decision.
   */
  windowShouldClose(): boolean | Promise<boolean> { return true; }
  /** The window is closing and nothing can stop it now. Synchronous. */
  windowWillClose(): void {}
  /** The window became the key window. */
  windowDidBecomeKey(): void {}
  /** The window stopped being the key window. */
  windowDidResignKey(): void {}
  /** Runs after the window controller is disposed, before the controllers it owns are. */
  protected didDispose(): void {}

  /** Disposes this window controller, its view controllers and its controllers. */
  dispose(): void {
    this[nseDisposeFor]("explicit");
  }

  /** @internal Disposal entry used by owners; records `reason`. */
  [nseDisposeFor](reason: SynCloudOSLifecycleDisposalReason): void {
    this.#lifetime.dispose(reason, () => {
      this.#mount = null;
      this.didDispose();
    });
  }

  /** @internal The framework's hook for the React host. */
  get [nseWindowInternals](): NSEWindowControllerInternals {
    return this.#internals;
  }

  #attach(mount: NSEWindowMount): () => void {
    this.#assertLive("window", "get");
    this.#mount = mount;
    if (this.#pendingTitle !== null) mount.setTitle(this.#pendingTitle);
    if (!this.#loaded) {
      this.#loaded = true;
      this.windowDidLoad();
    }
    return () => {
      if (this.#mount === mount) this.#mount = null;
    };
  }

  #setKey(isKey: boolean): void {
    if (this.#key === isKey) return;
    this.#key = isKey;
    if (isKey) this.windowDidBecomeKey();
    else this.windowDidResignKey();
    this.notifyObservers();
  }

  #assertLive(operation: string, access: "call" | "get" | "set"): void {
    if (!this.#lifetime.isDisposed) return;
    throw this.#lifetime.record.error({ code: "NSE_CONTROLLER_DISPOSED", operation, access });
  }
}
