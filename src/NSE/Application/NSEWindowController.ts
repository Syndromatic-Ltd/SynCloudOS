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
import type { WindowFullScreenNotification } from "../../SynCloudOS/Windows/windowTypes";
import {
  nseDisposeFor,
  type NSEControllerOwnershipOptions,
  type OwnedObject,
  type NSEOwner,
} from "../Controllers/ownership";
import { NSEObject } from "../Objects/NSEObject";
import { LayoutGuideStore, type NSELayoutGuide } from "../Layout/NSELayoutGuide";
import type { NSEScrollRect } from "../Scroll/scrollTypes";
import { validateNSEWindowFrameView, type NSEWindowFrameViewClass } from "./NSEWindowFrameView";
import type { NSEApplication, NSEOpenWindowOptions } from "./NSEApplication";
import { ObjectLifetime } from "./objectLifetime";
import { ownNSEFactory, type Disposable, type SynchronousDisposable } from "./ownedFactory";
import type { NSEToolbar } from "../Toolbars/NSEToolbar";
import type { ReactNode } from "react";
import type { NSETitlebarAccessoryViewController } from "./NSETitlebarAccessoryViewController";
import { nseAdoptViewController, validateNSEViewControllerClass, type NSEViewComponent, type NSEViewController, type NSEViewControllerClass } from "./NSEViewController";

export type NSEWindowControllerOptions = NSEControllerOwnershipOptions & NSEOpenWindowOptions;
const defaultOpeningOptions: Readonly<NSEOpenWindowOptions> = Object.freeze({});

/** What `window.close()` reports. */
export type NSEWindowCloseOutcome = "closed" | "cancelled" | "refused";

/** The window a controller manages. Available once the window has loaded. */
/** The edge of a window's content that carries a content border (NSRectEdge.minY, the bottom). */
export type NSEWindowContentBorderEdge = "minY";

/** NSWindow.ToolbarStyle. Atmo keeps expanded titles fixed, including on compact widths. */
export type NSEWindowToolbarStyle = "automatic" | "expanded" | "preference" | "unified" | "unifiedCompact";

export type NSEWindowStyle = "titled" | "closable" | "miniaturizable" | "resizable" | "fullSizeContentView" | "texturedBackground" | "fullScreen";
export type NSEWindowCollectionBehavior = "fullScreenPrimary" | "fullScreenAuxiliary" | "fullScreenNone";
export type NSEWindowTitleVisibility = "visible" | "hidden";
export type NSEWindowTitlebarPresentation = "attached" | "floating";
export type NSEWindowButtonType = "closeButton" | "miniaturizeButton" | "zoomButton" | "toolbarButton" | "documentIconButton" | "documentVersionsButton" | "fullScreenButton";

const standardButtonSelectors = new Map<NSEWindowButtonType, string>([
  ["closeButton", 'button[data-window-control="close"]'],
  ["miniaturizeButton", 'button[data-window-control="minimise"]'],
  ["zoomButton", 'button:is([data-window-control="zoom"],[data-window-control="fullScreen"])'],
]);

function projectWindowStyle(style: NonNullable<SynWareOwnedWindowSnapshot["style"]>): readonly NSEWindowStyle[] {
  return Object.freeze(style.flatMap(bit => bit === "zoomable" ? [] : [bit === "minimisable" ? "miniaturizable" as const : bit]));
}

export interface NSEWindow {
  styleMask: readonly NSEWindowStyle[];
  collectionBehavior: readonly NSEWindowCollectionBehavior[];
  titleVisibility: NSEWindowTitleVisibility;
  titlebarPresentation: NSEWindowTitlebarPresentation;
  frameViewClass: NSEWindowFrameViewClass | null;
  backgroundColour: string | null;
  isOpaque: boolean;
  cornerRadius: number | null;
  titlebarAppearsTransparent: boolean;
  readonly isFullScreen: boolean;
  readonly document: NSEWindowDocument | null;
  /** The existing titlebar button for this window, or null if the host does not draw it. */
  standardWindowButton(kind: NSEWindowButtonType): HTMLButtonElement | null;
  toggleFullScreen(): void;
  performClose(): Promise<NSEWindowCloseOutcome>;
  miniaturize(): void;
  readonly contentLayoutRect: NSEScrollRect;
  readonly contentLayoutGuide: NSELayoutGuide;
  /** The window's identity, or `null` when the application is shown on the stage. */
  readonly id: string | null;
  /** The window title; assigning it renames the window. On the stage it names the document in the title bar. */
  title: string;
  /** NSWindow.subtitle: a second line of the title, such as a document's state; the theme draws it beside the title. */
  subtitle: string;
  /** NSWindow.toolbarStyle: the theme's arrangement of the title and toolbar. */
  toolbarStyle: NSEWindowToolbarStyle;
  /** NSWindow.isDocumentEdited: whether the window's document has unsaved changes. */
  isDocumentEdited: boolean;
  /** NSWindow.toolbar: the window draws it under its title bar. */
  toolbar: NSEToolbar | null;
  /** NSE extension: ordinary views in the window's bottom content border, separate from navigation tabs. */
  bottomBarAccessory: ReactNode;
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
  endSheet(sheet: Sheet, returnCode?: number): void;
}

/** @internal What `NSEWindow.endSheet` ends: a sheet presented on a window. */
export interface Sheet {
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
  readonly frameViewClass?: NSEWindowFrameViewClass;
  readonly styleMask?: readonly NSEWindowStyle[];
  readonly collectionBehavior?: readonly NSEWindowCollectionBehavior[];
  readonly titleVisibility?: NSEWindowTitleVisibility;
  readonly titlebarAppearsTransparent?: boolean;
  readonly contentViewControllerClass?: NSEViewControllerClass;
}

/** @internal Definition validation is also used for dynamically opened windows. */
export function validateNSEWindowControllerClass(Controller: NSEWindowControllerClass): void {
  if (Controller.view && Controller.contentViewControllerClass) throw new TypeError(`${Controller.name} declares both static view and contentViewControllerClass.`);
  if (Controller.contentViewControllerClass) validateNSEViewControllerClass(Controller.contentViewControllerClass);
}

/** What the React host gives a window controller while its window is mounted. */
export interface WindowMount {
  readonly contentLayoutGuide?: NSELayoutGuide;
  /** The window's identity, or `null` on the stage. */
  readonly windowId: string | null;
  getSnapshot(): SynWareOwnedWindowSnapshot | null;
  subscribe(listener: () => void): () => void;
  focus(): void;
  minimise(): void;
  zoom(): void;
  setTitle(title: string): void;
  setStyleMask?(style: readonly NSEWindowStyle[]): void;
  setCollectionBehavior?(behavior: NSEWindowCollectionBehavior): void;
  toggleFullScreen?(): void;
  isFullScreen?(): boolean;
  observeFullScreen?(listener: (event: WindowFullScreenNotification) => void): () => void;
  close(): Promise<NSEWindowCloseOutcome>;
  /** Lets the controller veto the window's close and learn it is closing. Does nothing on the stage. Returns the function that removes the guard. */
  registerCloseGuard(guard: SynWareWindowCloseGuard): () => void;
  /** Presents an alert sheet for the window and resolves with the chosen button's id; aborting `signal` dismisses it. */
  presentAlert(request: WindowAlertRequest, signal: AbortSignal): Promise<string>;
  /** Presents an application-modal alert (NSAlert.runModal()) for the window's application, centred over it. */
  presentModalAlert(request: WindowAlertRequest, signal: AbortSignal): Promise<string>;
}

/** An alert as the window's host presents it. Not part of the public API. */
export interface WindowAlertRequest {
  readonly title: string;
  readonly message?: string;
  readonly style: "warning" | "informational" | "critical";
  readonly buttons: readonly { readonly id: string; readonly label: string; readonly role?: "default" | "cancel" | "destructive" }[];
}

const windowAlertPresenters = new WeakMap<NSEWindow, (request: WindowAlertRequest, signal: AbortSignal) => Promise<string>>();
const windowSubscriptions = new WeakMap<NSEWindow, (listener: () => void) => () => void>();
const windowTitlePresenters = new WeakMap<NSEWindow, (title: string) => () => void>();
const presentedWindowTitles = new WeakMap<NSEWindow, string>();

/** @internal Compact More presents its own title without overwriting the app's NSWindow.title. */
export function nsePresentWindowTitle(window: NSEWindow, title: string): () => void {
  return windowTitlePresenters.get(window)?.(title) ?? (() => {});
}

/** @internal The title currently drawn by the host. */
export function nseWindowPresentedTitle(window: NSEWindow): string {
  return presentedWindowTitles.get(window) ?? window.title;
}

/** @internal Observes window-owned chrome without adding a second public window state API. */
export function nseSubscribeWindowChrome(window: NSEWindow, listener: () => void): () => void {
  return windowSubscriptions.get(window)?.(listener) ?? (() => {});
}

/** @internal Presents an NSEAlert as a sheet on a window a window controller manages; aborting `signal` ends it. */
export function nsePresentWindowAlert(window: NSEWindow, request: WindowAlertRequest, signal: AbortSignal): Promise<string> {
  const present = windowAlertPresenters.get(window);
  if (!present) return Promise.reject(new TypeError("An alert is presented on a window controller's window (this.window)."));
  return present(request, signal);
}

type AlertPresenter = (request: WindowAlertRequest, signal: AbortSignal) => Promise<string>;
let keyWindowModalPresenter: { readonly owner: object; readonly present: AlertPresenter } | null = null;

/**
 * @internal The key window reports its application's modal-alert presenter: an application-modal alert
 * (NSAlert.runModal()) belongs to the active application, NSApp, whose window is key. `null` withdraws
 * the owner's presenter when it is still the current one.
 */
export function nseSetKeyWindowModalPresenter(owner: object, present: AlertPresenter | null): void {
  if (present) keyWindowModalPresenter = { owner, present };
  else if (keyWindowModalPresenter?.owner === owner) keyWindowModalPresenter = null;
}

/** @internal Presents an application-modal alert for the active application. */
export function nsePresentModalAlert(request: WindowAlertRequest, signal: AbortSignal): Promise<string> {
  if (!keyWindowModalPresenter) return Promise.reject(new TypeError("runModal needs an active application with a key window."));
  return keyWindowModalPresenter.present(request, signal);
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
  attach(mount: WindowMount): () => void;
  /** Reports a key-window change to `windowDidBecomeKey` / `windowDidResignKey`. */
  setKey(isKey: boolean): void;
  setStandardControls(controls: HTMLElement | null): void;
  updateContentLayout(rect: NSEScrollRect): void;
  notifySnapshotChange(): void;
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
export class NSEWindowController<TApp extends NSEApplication = NSEApplication> extends NSEObject implements NSEOwner, OwnedObject {
  /** The component that renders this window's content. */
  static view?: NSEViewComponent;
  static frameViewClass?: NSEWindowFrameViewClass;
  static styleMask?: readonly NSEWindowStyle[];
  static collectionBehavior?: readonly NSEWindowCollectionBehavior[];
  static titleVisibility?: NSEWindowTitleVisibility;
  static titlebarAppearsTransparent?: boolean;
  /** The class constructed in a fresh scope for this window's initial root. */
  static contentViewControllerClass?: NSEViewControllerClass;

  readonly #lifetime: ObjectLifetime;
  readonly #window: NSEWindow;
  readonly #internals: NSEWindowControllerInternals;
  #mount: WindowMount | null = null;
  readonly #contentLayout = new LayoutGuideStore();
  #stopContentLayout: (() => void) | null = null;
  #stopFullScreen: (() => void) | null = null;
  #standardControls: HTMLElement | null = null;
  #loaded = false;
  #key = false;
  #pendingTitle: string | null = null;
  #subtitle = "";
  #toolbarStyle: NSEWindowToolbarStyle = "automatic";
  #documentEdited = false;
  #styleMask: readonly NSEWindowStyle[] | undefined;
  #collectionBehavior: readonly NSEWindowCollectionBehavior[] | undefined;
  #titleVisibility: NSEWindowTitleVisibility;
  #titlebarPresentation: NSEWindowTitlebarPresentation = "attached";
  #frameViewClass: NSEWindowFrameViewClass | null;
  #backgroundColour: string | null = null;
  #isOpaque = true;
  #cornerRadius: number | null = null;
  #titlebarAppearsTransparent: boolean;
  #contentBorderMinY = 0;
  #toolbar: NSEToolbar | null = null;
  #bottomBarAccessory: ReactNode = null;
  #accessories: readonly NSETitlebarAccessoryViewController<unknown>[] = Object.freeze([]);
  #contentViewController: NSEViewController<unknown> | null = null;
  /** The options used to open or restore this controller, available in its constructor. */
  get openingOptions(): Readonly<NSEOpenWindowOptions> {
    return (this.#lifetime.context as NSEWindowControllerContext).openingOptions ?? defaultOpeningOptions;
  }

  constructor(options: NSEWindowControllerOptions = {}) {
    super();
    this.#lifetime = new ObjectLifetime(
      this,
      "NSEWindowController",
      `${new.target.name || "NSEWindowController"}#${++windowControllerSequence}`,
      options,
    );
    const Controller = new.target as NSEWindowControllerClass;
    this.#frameViewClass = Controller.frameViewClass ?? null;
    validateNSEWindowFrameView(this.#frameViewClass);
    this.#styleMask = options.styleMask ?? Controller.styleMask;
    this.#collectionBehavior = options.collectionBehavior ?? Controller.collectionBehavior;
    this.#titleVisibility = options.titleVisibility ?? Controller.titleVisibility ?? "visible";
    this.#titlebarAppearsTransparent = options.titlebarAppearsTransparent ?? Controller.titlebarAppearsTransparent ?? false;
    const controller = this as NSEWindowController<NSEApplication>;
    const requireMount = (member: string): WindowMount => {
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
      get styleMask() {
        const record = controller.#mount?.getSnapshot();
        return record?.style ? projectWindowStyle(record.style) : controller.#styleMask ?? Object.freeze([]);
      },
      set styleMask(value: readonly NSEWindowStyle[]) {
        if (!Array.isArray(value) || value.some(bit => !["titled", "closable", "miniaturizable", "resizable", "fullSizeContentView", "texturedBackground", "fullScreen"].includes(bit)) ||
            new Set(value).size !== value.length) throw new TypeError("Unknown or duplicate NSEWindow style.");
        controller.#styleMask = Object.freeze(value.filter(bit => bit !== "fullScreen"));
        controller.#mount?.setStyleMask?.(controller.#styleMask);
        controller.notifyObservers();
      },
      get collectionBehavior() {
        const current = controller.#mount?.getSnapshot()?.collectionBehavior;
        return current ? Object.freeze([current]) : controller.#collectionBehavior ?? Object.freeze(["fullScreenNone" as const]);
      },
      set collectionBehavior(value: readonly NSEWindowCollectionBehavior[]) {
        if (!Array.isArray(value) || value.length > 1 || value.some(bit => !["fullScreenPrimary", "fullScreenAuxiliary", "fullScreenNone"].includes(bit))) {
          throw new TypeError("NSEWindow collection behavior permits one full-screen role.");
        }
        controller.#collectionBehavior = Object.freeze([...value]);
        controller.#mount?.setCollectionBehavior?.(value[0] ?? "fullScreenNone");
        controller.notifyObservers();
      },
      get titleVisibility() { return controller.#titleVisibility; },
      set titleVisibility(value: NSEWindowTitleVisibility) {
        if (value !== "visible" && value !== "hidden") throw new TypeError("Unknown NSEWindow title visibility.");
        if (value === controller.#titleVisibility) return;
        controller.#titleVisibility = value;
        controller.notifyObservers();
      },
      get frameViewClass() { return controller.#frameViewClass; },
      set frameViewClass(value: NSEWindowFrameViewClass | null) {
        validateNSEWindowFrameView(value);
        if (value === controller.#frameViewClass) return;
        controller.#frameViewClass = value;
        controller.notifyObservers();
      },
      get backgroundColour() { return controller.#backgroundColour; },
      set backgroundColour(value: string | null) {
        if (value !== null && typeof value !== "string") throw new TypeError("A window background is a CSS colour or null.");
        if (value === controller.#backgroundColour) return;
        controller.#backgroundColour = value;
        controller.notifyObservers();
      },
      get isOpaque() { return controller.#isOpaque; },
      set isOpaque(value: boolean) {
        if (typeof value !== "boolean") throw new TypeError("Window opacity must be a boolean.");
        if (value === controller.#isOpaque) return;
        controller.#isOpaque = value;
        controller.notifyObservers();
      },
      get cornerRadius() { return controller.#cornerRadius; },
      set cornerRadius(value: number | null) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) throw new RangeError("A window corner radius must be finite and non-negative.");
        if (value === controller.#cornerRadius) return;
        controller.#cornerRadius = value;
        controller.notifyObservers();
      },
      get titlebarPresentation() { return controller.#titlebarPresentation; },
      set titlebarPresentation(value: NSEWindowTitlebarPresentation) {
        if (value !== "attached" && value !== "floating") throw new TypeError("Unknown NSEWindow titlebar presentation.");
        if (value === controller.#titlebarPresentation) return;
        controller.#titlebarPresentation = value;
        controller.notifyObservers();
      },
      get titlebarAppearsTransparent() { return controller.#titlebarAppearsTransparent; },
      set titlebarAppearsTransparent(value: boolean) {
        if (typeof value !== "boolean") throw new TypeError("NSEWindow titlebarAppearsTransparent must be boolean.");
        if (value === controller.#titlebarAppearsTransparent) return;
        controller.#titlebarAppearsTransparent = value;
        controller.notifyObservers();
      },
      get document() { return controller.document; },
      get isFullScreen() { return controller.#mount?.isFullScreen?.() ?? (controller.#mount?.getSnapshot()?.fullScreen === "on"); },
      standardWindowButton(kind: NSEWindowButtonType) {
        const controls = controller.#standardControls;
        const selector = standardButtonSelectors.get(kind);
        return controls?.isConnected && selector ? controls.querySelector<HTMLButtonElement>(selector) : null;
      },
      toggleFullScreen: () => requireMount("toggleFullScreen").toggleFullScreen?.(),
      performClose: () => requireMount("performClose").close(),
      miniaturize: () => requireMount("miniaturize").minimise(),
      get contentLayoutRect() { return controller.#contentLayout.frame; },
      get contentLayoutGuide() { return controller.#contentLayout; },
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
      get toolbarStyle() { return controller.#toolbarStyle; },
      set toolbarStyle(value: NSEWindowToolbarStyle) {
        if (!["automatic", "expanded", "preference", "unified", "unifiedCompact"].includes(value)) throw new TypeError("Unknown NSWindow toolbarStyle.");
        if (value === controller.#toolbarStyle) return;
        controller.#toolbarStyle = value;
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
      get bottomBarAccessory() { return controller.#bottomBarAccessory; },
      set bottomBarAccessory(accessory: ReactNode) {
        controller.#assertLive("bottomBarAccessory", "set");
        if (accessory === controller.#bottomBarAccessory) return;
        controller.#bottomBarAccessory = accessory;
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
      endSheet: (sheet: Sheet, returnCode?: number) => {
        if (returnCode !== undefined && !Number.isInteger(returnCode)) throw new TypeError("A sheet's return code must be an integer.");
        sheet?.[nseEndSheet]?.(controller.#window, returnCode);
      },
    });
    windowSubscriptions.set(this.#window, listener => controller.subscribe(listener));
    const titleClaims = new Map<symbol, string>();
    const publishTitle = () => {
      const title = [...titleClaims.values()].at(-1);
      if (title === undefined) presentedWindowTitles.delete(this.#window);
      else presentedWindowTitles.set(this.#window, title);
      controller.notifyObservers();
    };
    windowTitlePresenters.set(this.#window, title => {
      const token = Symbol();
      titleClaims.set(token, title);
      publishTitle();
      return () => { if (titleClaims.delete(token)) publishTitle(); };
    });
    windowAlertPresenters.set(this.#window, (request, signal) => {
      controller.#assertLive("beginSheetModal", "call");
      return requireMount("beginSheetModal").presentAlert(request, AbortSignal.any([controller.ownerSignal, signal]));
    });
    this.#internals = {
      get isLoaded() { return controller.#loaded; },
      attach: (mount) => controller.#attach(mount),
      setKey: (isKey) => controller.#setKey(isKey),
      setStandardControls: (controls) => { controller.#standardControls = controls; },
      updateContentLayout: (rect) => controller.#contentLayout.setFrame(rect),
      notifySnapshotChange: () => controller.notifyObservers(),
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
  own<T extends Disposable>(factory: (signal: AbortSignal) => SynchronousDisposable<T>): T {
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
  windowWillEnterFullScreen(): void {}
  windowDidEnterFullScreen(): void {}
  windowWillExitFullScreen(): void {}
  windowDidExitFullScreen(): void {}
  windowDidFailToEnterFullScreen(): void {}
  windowDidFailToExitFullScreen(): void {}
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
        this.#stopContentLayout?.();
        this.#stopContentLayout = null;
        this.#stopFullScreen?.();
        this.#stopFullScreen = null;
        this.#standardControls = null;
        this.#contentLayout.dispose();
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

  #attach(mount: WindowMount): () => void {
    this.#assertLive("window", "get");
    this.#mount = mount;
    this.#stopContentLayout?.();
    this.#stopFullScreen?.();
    const stopFullScreen = mount.observeFullScreen?.(event => this[event]()) ?? null;
    this.#stopFullScreen = stopFullScreen;
    const updateLayout = () => {
      const bounds = mount.getSnapshot()?.bounds;
      this.#contentLayout.setFrame(mount.contentLayoutGuide?.frame ?? { x: 0, y: 0, width: bounds?.width ?? 0, height: bounds?.height ?? 0 });
    };
    updateLayout();
    const stopLayout = mount.contentLayoutGuide ? mount.contentLayoutGuide.observe(updateLayout) : mount.subscribe(updateLayout);
    this.#stopContentLayout = stopLayout;
    if (this.#pendingTitle !== null) mount.setTitle(this.#pendingTitle);
    if (!this.#loaded) {
      if (this.#styleMask) mount.setStyleMask?.(this.#styleMask);
      if (this.#collectionBehavior) mount.setCollectionBehavior?.(this.#collectionBehavior[0] ?? "fullScreenNone");
      this.#loaded = true;
      this.windowDidLoad();
    }
    return () => {
      stopLayout();
      stopFullScreen?.();
      if (this.#stopContentLayout === stopLayout) this.#stopContentLayout = null;
      if (this.#stopFullScreen === stopFullScreen) this.#stopFullScreen = null;
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
