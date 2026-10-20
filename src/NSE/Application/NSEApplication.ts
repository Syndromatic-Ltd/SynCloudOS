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

import type { SynWareMigration } from "../../SynCloudOS/AppSDK/appDefinitionTypes";
import type { SynWareRouteGraph } from "../../SynCloudOS/Routing/appRouteTypes";
import type { SynCloudOSLifecycleDisposalReason } from "../../SynCloudOS/nseRuntimeContracts";
import { nseDisposeFor, type NSEOwnedObject, type NSEOwner } from "../Controllers/ownership";
import { NSEObject } from "../Objects/NSEObject";
import { NSEObjectLifetime } from "./objectLifetime";
import type { NSEAnyWindowController, NSEWindowController, NSEWindowControllerClass } from "./NSEWindowController";

/** What `openWindow` accepts. */
export interface NSEOpenWindowOptions {
  readonly title?: string;
  readonly width?: number;
  readonly height?: number;
}

/** What the framework hands an application it constructs. */
export interface NSEApplicationContext {
  readonly appId: string;
  windows(): readonly NSEWindowController<NSEApplication>[];
  openWindow(Controller: NSEWindowControllerClass, options: NSEOpenWindowOptions): Promise<NSEWindowController<NSEApplication>>;
}

/** An application class, as the framework instantiates it. */
export interface NSEApplicationClass<TApplication extends NSEApplication = NSEApplication> {
  new (): TApplication;
  readonly mainWindow?: NSEWindowControllerClass;
  readonly routes?: SynWareRouteGraph;
  readonly migrations?: readonly SynWareMigration[];
}

/**
 * The application: one instance per launched application, created by the
 * framework (never with `new`). Override the lifecycle methods you need; the
 * kernel calls them around the launch, activation, suspension and close of
 * the application.
 *
 * ```ts
 * export default class NotesApp extends NSEApplication {
 *   static mainWindow = NotesWindowController;
 *   readonly notes = new NSEArrayController<Note>({ id: "notes", getId: (note) => note.id });
 *   hasUnsavedChanges = false;
 *   async applicationDidFinishLaunching() { this.notes.setContent(await load()); }
 *   applicationShouldTerminate() { return !this.hasUnsavedChanges; }
 * }
 * ```
 *
 * Everything the application constructs while it is being created (field
 * initialisers, the constructor) is owned by it and disposed when the
 * application closes.
 */
export class NSEApplication extends NSEObject implements NSEOwner, NSEOwnedObject {
  /** The window controller the framework opens for the application's window. */
  static mainWindow?: NSEWindowControllerClass;
  /** Routes the application serves, declared as a route graph. */
  static routes?: SynWareRouteGraph;
  /** Versioned migrations of the application's persisted state. */
  static migrations?: readonly SynWareMigration[];

  readonly #lifetime: NSEObjectLifetime;

  constructor() {
    super();
    this.#lifetime = new NSEObjectLifetime(this, "NSEApplication", new.target.name || "NSEApplication", {});
    if (!this.#lifetime.constructedByFramework) {
      throw new TypeError(`${new.target.name} is created by the framework; export it as the default export of the application module instead of calling new.`);
    }
  }

  /** The application's identifier, from its manifest. */
  get id(): string {
    return this.#context.appId;
  }

  /** The application's open windows, oldest first. */
  get windows(): readonly NSEWindowController<NSEApplication>[] {
    return this.#context.windows();
  }

  /** Aborts when the application closes; controllers created for it adopt it. */
  get ownerSignal(): AbortSignal {
    return this.#lifetime.scope.signal;
  }

  get isDisposed(): boolean {
    return this.#lifetime.isDisposed;
  }

  /** Why the application was disposed, or `undefined` while it is running. */
  get disposalReason(): SynCloudOSLifecycleDisposalReason | undefined {
    return this.#lifetime.reason;
  }

  /** Calls `listener` once, after the application is disposed. */
  onDispose(listener: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
    return this.#lifetime.onDispose(listener);
  }

  /**
   * Opens another window of the application, showing `Controller`'s view.
   * Resolves with the window controller once the window is open.
   */
  openWindow<TController extends NSEAnyWindowController>(
    Controller: NSEWindowControllerClass<TController>,
    options: NSEOpenWindowOptions = {},
  ): Promise<TController> {
    return this.#context.openWindow(Controller, options) as Promise<TController>;
  }

  /** The kernel is launching the application; no window exists yet. Awaited. */
  applicationWillFinishLaunching(): void | Promise<void> {}
  /** The application launched. Awaited before the windows render. */
  applicationDidFinishLaunching(): void | Promise<void> {}
  /** The application became the active application. */
  applicationDidBecomeActive(): void | Promise<void> {}
  /** Another application is about to become active, or this one is being suspended. */
  applicationWillResignActive(): void | Promise<void> {}
  /**
   * Asked before the application closes. Return `false` (or a promise of it)
   * to keep it open; the close then reports as cancelled. The close
   * operation's timeout applies (`lifecycleHookTimeoutMs`, 5 seconds unless
   * the host raises it).
   */
  applicationShouldTerminate(): boolean | Promise<boolean> { return true; }
  /** The application is closing and nothing can stop it now. */
  applicationWillTerminate(): void | Promise<void> {}
  /** Runs after the application is disposed, before the controllers it owns are. */
  protected didDispose(): void {}

  /**
   * Handles a background task the host scheduled for this application, when
   * implemented.
   */
  handleBackgroundTask?(taskId: string, context: { readonly signal: AbortSignal }): void | Promise<void>;

  /** @internal Disposal entry used by the application session; records `reason`. */
  [nseDisposeFor](reason: SynCloudOSLifecycleDisposalReason): void {
    this.#lifetime.dispose(reason, () => { this.didDispose(); });
  }

  get #context(): NSEApplicationContext {
    return this.#lifetime.context as NSEApplicationContext;
  }
}
