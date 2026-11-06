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
import type { SynWareOwnedWindowSnapshot, SynWareWindowCloseGuard } from "../../SynCloudOS/nseRuntimeContracts";
import {
  nseDisposeFor,
  type NSEControllerOwnershipOptions,
  type NSEOwnedObject,
  type NSEOwner,
} from "../Controllers/ownership";
import { NSEObject } from "../Objects/NSEObject";
import type { NSEApplication, NSEOpenWindowOptions } from "./NSEApplication";
import { NSEObjectLifetime } from "./objectLifetime";
import { ownNSEFactory, type NSEDisposable, type NSESynchronousDisposable } from "./ownedFactory";
import type { NSEToolbar } from "../Toolbars/NSEToolbar";
import type { NSETitlebarAccessoryViewController } from "./NSETitlebarAccessoryViewController";
import { nseAdoptViewController, validateNSEViewControllerClass, type NSEViewComponent, type NSEViewController, type NSEViewControllerClass } from "./NSEViewController";

export type NSEWindowControllerOptions = NSEControllerOwnershipOptions & NSEOpenWindowOptions;
const defaultOpeningOptions: Readonly<NSEOpenWindowOptions> = Object.freeze({});

/** What `window.close()` reports. */
export type NSEWindowCloseOutcome = "closed" | "cancelled" | "refused";

/** The window a controller manages. Available once the window has loaded. */
/** The edge of a window's content that carries a content border (NSRectEdge.minY, the bottom). */
export type NSEWindowContentBorderEdge = "minY";

export interface NSEWindow {
  /** The window's identity, or `null` when the application is shown on the stage. */
  readonly id: string | null;
  /** The window title; assigning it renames the window. On the stage it names the document in the title bar. */
  title: string;
  /** NSWindow.subtitle: a second line of the title, such as a document's state; the theme draws it beside the title. */
  subtitle: string;
  /** NSWindow.isDocumentEdited: whether the window's document has unsaved changes. */
  isDocumentEdited: boolean;
  /** NSWindow.toolbar: the window draws it under its title bar. */
  toolbar: NSEToolbar | null;
  /**
   * NSWindow.contentBorderThickness(for:): the height of the band the window paints along an edge of
   * its content (0 when it paints none). The content's own controls, such as status text fields with
   * `backgroundStyle="raised"`, sit over the band.
   */
  contentBorderThickness(edge: NSEWindowContentBorderEdge): number;
  /** NSWindow.setContentBorderThickness(_:for:). Only the bottom edge (`"minY"`) is drawn. */
  setContentBorderThickness(thickness: number, edge: NSEWindowContentBorderEdge): void;
  /** NSWindow.titlebarAccessoryViewControllers, in the order they were added. */
  readonly titlebarAccessoryViewControllers: readonly NSETitlebarAccessoryViewController<unknown>[];
  /** NSWindow.addTitlebarAccessoryViewController(_:): the window owns the accessory from now on. */
  addTitlebarAccessoryViewController(controller: NSETitlebarAccessoryViewController<unknown>): void;
  /** NSWindow.removeTitlebarAccessoryViewController(at:): removes and disposes the accessory. */
  removeTitlebarAccessoryViewController(index: number): void;
  readonly isKey: boolean;
  readonly isMinimised: boolean;
  /** The window's current bounds, or `null` before it has mounted. */
  readonly frame: Readonly<{ x: number; y: number; width: number; height: number }> | null;
  /** Closes the window, asking `windowShouldClose` first. */
  close(): Promise<NSEWindowCloseOutcome>;
  minimise(): void;
  zoom(): void;
  focus(): void;
  /**
   * Ends a sheet presented on this window (NSWindow.endSheet(_:returnCode:)). Its `beginSheetModal` promise
   * resolves with `returnCode`, or, when omitted, with the response Escape would give. Does nothing when the
   * sheet is not presented on this window.
   */
  endSheet(sheet: NSESheet, returnCode?: number): void;
}

/** @internal What `NSEWindow.endSheet` ends: a sheet presented on a window. */
export interface NSESheet {
  [nseEndSheet](window: NSEWindow, returnCode?: number): void;
}

/** @internal */
export const nseEndSheet: unique symbol = Symbol("nse.endSheet");

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
  readonly contentViewControllerClass?: NSEViewControllerClass;
}

/** @internal Definition validation is also used for dynamically opened windows. */
export function validateNSEWindowControllerClass(Controller: NSEWindowControllerClass): void {
  if (Controller.view && Controller.contentViewControllerClass) throw new TypeError(`${Controller.name} declares both static view and contentViewControllerClass.`);
  if (Controller.contentViewControllerClass) validateNSEViewControllerClass(Controller.contentViewControllerClass);
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
  /** Presents an alert sheet for the window and resolves with the chosen button's id; aborting `signal` dismisses it. */
  presentAlert(request: NSEWindowAlertRequest, signal: AbortSignal): Promise<string>;
}

/** An alert as the window's host presents it. Not part of the public API. */
export interface NSEWindowAlertRequest {
  readonly title: string;
  readonly message?: string;
  readonly style: "warning" | "informational" | "critical";
  readonly buttons: readonly { readonly id: string; readonly label: string; readonly role?: "default" | "cancel" | "destructive" }[];
}

const windowAlertPresenters = new WeakMap<NSEWindow, (request: NSEWindowAlertRequest, signal: AbortSignal) => Promise<string>>();

/** @internal Presents an NSEAlert as a sheet on a window a window controller manages; aborting `signal` ends it. */
export function nsePresentWindowAlert(window: NSEWindow, request: NSEWindowAlertRequest, signal: AbortSignal): Promise<string> {
  const present = windowAlertPresenters.get(window);
  if (!present) return Promise.reject(new TypeError("An alert is presented on a window controller's window (this.window)."));
  return present(request, signal);
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
  /** The class constructed in a fresh scope for this window's initial root. */
  static contentViewControllerClass?: NSEViewControllerClass;

  readonly #lifetime: NSEObjectLifetime;
  readonly #window: NSEWindow;
  readonly #internals: NSEWindowControllerInternals;
  #mount: NSEWindowMount | null = null;
  #loaded = false;
  #key = false;
  #pendingTitle: string | null = null;
  #subtitle = "";
  #documentEdited = false;
  #contentBorderMinY = 0;
  #toolbar: NSEToolbar | null = null;
  #accessories: readonly NSETitlebarAccessoryViewController<unknown>[] = Object.freeze([]);
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
        access: member === "close" || member === "minimise" || member === "zoom" || member === "focus" || member === "beginSheetModal" ? "call" : "get",
        problem: "The window has not mounted yet or has closed.",
      });
    };
    this.#window = Object.freeze({
      get id() { return controller.#mount?.windowId ?? null; },
      get title() { return controller.#mount?.getSnapshot()?.title ?? controller.#pendingTitle ?? ""; },
      set title(value: string) {
        if (typeof value !== "string") throw new TypeError("A window's title is a string.");
        if (value === controller.#pendingTitle) return;
        controller.#pendingTitle = value;
        controller.#mount?.setTitle(value);
        controller.notifyObservers();
      },
      get subtitle() { return controller.#subtitle; },
      set subtitle(value: string) {
        if (typeof value !== "string") throw new TypeError("A window's subtitle is a string.");
        if (value === controller.#subtitle) return;
        controller.#subtitle = value;
        controller.notifyObservers();
      },
      get isDocumentEdited() { return controller.#documentEdited; },
      set isDocumentEdited(edited: boolean) {
        if (typeof edited !== "boolean") throw new TypeError("A window's isDocumentEdited is a boolean.");
        if (edited === controller.#documentEdited) return;
        controller.#documentEdited = edited;
        controller.notifyObservers();
      },
      contentBorderThickness(edge: NSEWindowContentBorderEdge) {
        if (edge !== "minY") throw new RangeError(`A window draws a content border only at its bottom edge ("minY"), not "${String(edge)}".`);
        return controller.#contentBorderMinY;
      },
      setContentBorderThickness(thickness: number, edge: NSEWindowContentBorderEdge) {
        if (edge !== "minY") throw new RangeError(`A window draws a content border only at its bottom edge ("minY"), not "${String(edge)}".`);
        if (typeof thickness !== "number" || !Number.isFinite(thickness) || thickness < 0) throw new RangeError("A content border's thickness is a finite number of points, 0 or more.");
        if (thickness === controller.#contentBorderMinY) return;
        controller.#contentBorderMinY = thickness;
        controller.notifyObservers();
      },
      get toolbar() { return controller.#toolbar; },
      set toolbar(toolbar: NSEToolbar | null) {
        controller.#assertLive("toolbar", "set");
        if (toolbar === controller.#toolbar) return;
        controller.#toolbar = toolbar;
        controller.notifyObservers();
      },
      get titlebarAccessoryViewControllers() { return controller.#accessories; },
      addTitlebarAccessoryViewController: (accessory: NSETitlebarAccessoryViewController<unknown>) => {
        controller.#assertLive("addTitlebarAccessoryViewController", "call");
        if (controller.#accessories.includes(accessory)) throw new TypeError("This titlebar accessory is already in the window.");
        accessory[nseAdoptViewController](controller.#lifetime.scope, controller.#window);
        controller.#accessories = Object.freeze([...controller.#accessories, accessory]);
        controller.notifyObservers();
      },
      removeTitlebarAccessoryViewController: (index: number) => {
        controller.#assertLive("removeTitlebarAccessoryViewController", "call");
        const accessory = Number.isInteger(index) ? controller.#accessories[index] : undefined;
        if (!accessory) throw new RangeError(`This window has no titlebar accessory at index ${index}.`);
        controller.#accessories = Object.freeze(controller.#accessories.filter((_, position) => position !== index));
        try {
          accessory[nseDisposeFor]("removed-from-parent");
        } finally {
          controller.notifyObservers();
        }
      },
      get isKey() { return controller.#key; },
      get isMinimised() { return controller.#mount?.getSnapshot()?.state === "minimised"; },
      get frame() { return controller.#mount?.getSnapshot()?.bounds ?? null; },
      close: () => requireMount("close").close(),
      minimise: () => requireMount("minimise").minimise(),
      zoom: () => requireMount("zoom").zoom(),
      focus: () => requireMount("focus").focus(),
      endSheet: (sheet: NSESheet, returnCode?: number) => {
        if (returnCode !== undefined && !Number.isInteger(returnCode)) throw new TypeError("A sheet's return code must be an integer.");
        sheet?.[nseEndSheet]?.(controller.#window, returnCode);
      },
    });
    windowAlertPresenters.set(this.#window, (request, signal) => {
      controller.#assertLive("beginSheetModal", "call");
      return requireMount("beginSheetModal").presentAlert(request, AbortSignal.any([controller.ownerSignal, signal]));
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
   * A root cannot also be a child or another window's root. Rejected ownership
   * leaves the current content unchanged.
   */
  get contentViewController(): NSEViewController<unknown> | null {
    return this.#contentViewController;
  }

  set contentViewController(controller: NSEViewController<unknown> | null) {
    this.#assertLive("contentViewController", "set");
    if (controller === this.#contentViewController) return;
    const previous = this.#contentViewController;
    if (controller) controller[nseAdoptViewController](this.#lifetime.scope, this.#window);
    this.#contentViewController = controller;
    try {
      if (previous) previous[nseDisposeFor]("removed-from-parent");
    } finally {
      this.notifyObservers();
    }
  }

  /** Aborts when this window controller is disposed. */
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
    if (this.isDisposed) return;
    try {
      this.#lifetime.dispose(reason, () => {
        this.#mount = null;
        this.didDispose();
      });
    } finally {
      this.notifyObservers();
    }
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
