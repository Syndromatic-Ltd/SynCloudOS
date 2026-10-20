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

import type {
  NSEApplication,
  NSEApplicationClass,
  NSEApplicationContext,
  NSEOpenWindowOptions,
} from "../../NSE/Application/NSEApplication";
import type {
  NSEAnyWindowController,
  NSEWindowControllerClass,
  NSEWindowControllerContext,
} from "../../NSE/Application/NSEWindowController";
import {
  enterClassApplication,
  instantiateInOwnerScope,
  nseDisposeFor,
  NSEOwnershipScope,
} from "../../NSE/Controllers/ownership";
import type { SynWareOwnedWindowSnapshot, SynWareWindowPort } from "../../SynCloudOSReact/appRuntimeTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { ApplicationLifecycle } from "../Lifecycle/applicationLifecycleHooks";
import { SynCloudOSLifecycleVeto, type SynCloudOSLifecycleHook } from "../Lifecycle/lifecycleTypes";
import { currentClass, trackLiveApplicationObject, type LiveApplicationObject } from "./applicationHotReload";

/** How a class-based application is identified inside the runtime that launched it. */
export interface ApplicationSessionIdentity {
  readonly runtimeId: string;
  readonly appId: string;
}

/** What creates a session: the class, and the name the application is shown under. */
export interface ApplicationSessionSource {
  readonly AppClass: NSEApplicationClass;
  readonly appName: string;
  /**
   * Whether controllers constructed outside an owner throw. Applications the
   * framework wraps around a function component are not class-based and keep
   * the hook-based ownership they were written with.
   */
  readonly strictOwnership: boolean;
}

interface ConstructedApplication {
  readonly app: NSEApplication;
  readonly scope: NSEOwnershipScope;
  readonly leave: () => void;
}

function constructApplication(source: ApplicationSessionSource, appId: string, context: NSEApplicationContext): ConstructedApplication {
  const scope = new NSEOwnershipScope("NSEApplication", appId);
  const leave = source.strictOwnership ? enterClassApplication() : () => {};
  try {
    const app = instantiateInOwnerScope(scope, () => new (currentClass(source.AppClass))(), context);
    return { app, scope, leave };
  } catch (error) {
    try {
      scope.disposeAdopted("application-closed");
    } finally {
      scope.release("application-closed");
      leave();
    }
    throw error;
  }
}

const sessions = new Map<string, ApplicationSession>();

function keyOf({ runtimeId, appId }: ApplicationSessionIdentity): string {
  return `${runtimeId}:${appId}`;
}

let windowSequence = 0;

/**
 * One launched class-based application: its instance, its window controllers
 * and the bridge to the windows the host mounts. Created when the kernel
 * launches the application (or, in a host that mounts an application without
 * running its lifecycle, when it first mounts) and disposed when it closes.
 */
export class ApplicationSession {
  readonly app: NSEApplication;
  readonly #identity: ApplicationSessionIdentity;
  readonly #source: ApplicationSessionSource;
  readonly #scope: NSEOwnershipScope;
  readonly #leaveClassApplication: () => void;
  readonly #untrackApp: () => void;
  readonly #controllers: NSEAnyWindowController[] = [];
  readonly #byWindowId = new Map<string, NSEAnyWindowController>();
  readonly #pendingByRestorationKey = new Map<string, NSEAnyWindowController>();
  readonly #ports = new Set<SynWareWindowPort>();
  readonly #portWaiters = new Set<() => void>();
  #kernel: SynCloudOSRuntime | null = null;
  #main: NSEAnyWindowController | null = null;
  #launchReported = false;
  #disposed = false;
  readonly live: LiveApplicationObject;

  constructor(identity: ApplicationSessionIdentity, source: ApplicationSessionSource) {
    this.#identity = identity;
    this.#source = source;
    const constructed = constructApplication(source, identity.appId, {
      appId: identity.appId,
      windows: () => Object.freeze([...this.#controllers]),
      openWindow: (Controller, options) => this.openWindow(Controller, options),
    });
    this.app = constructed.app;
    this.#scope = constructed.scope;
    this.#leaveClassApplication = constructed.leave;
    this.live = Object.freeze({ appName: source.appName, relaunch: (notice: string) => { this.#relaunch(notice); } });
    this.#untrackApp = trackLiveApplicationObject(this.app, this.live);
  }

  /** Whether `applicationDidFinishLaunching` already ran for this launch. */
  get launchReported(): boolean {
    return this.#launchReported;
  }

  markLaunchReported(): void {
    this.#launchReported = true;
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }

  /** The window controllers in the order they were created. */
  get windowControllers(): readonly NSEAnyWindowController[] {
    return this.#controllers;
  }

  #construct(Controller: NSEWindowControllerClass): NSEAnyWindowController {
    const scope = new NSEOwnershipScope("NSEWindowController", Controller.name);
    const context: NSEWindowControllerContext = { app: this.app };
    const controller = instantiateInOwnerScope(scope, () => new (currentClass(Controller))(), context);
    const leaveApplication = this.#scope.adopt(controller);
    const untrack = trackLiveApplicationObject(controller, this.live);
    this.#controllers.push(controller);
    controller.onDispose(() => {
      leaveApplication();
      untrack();
      this.#controllers.splice(this.#controllers.indexOf(controller), 1);
      if (this.#main === controller) this.#main = null;
      for (const [id, bound] of this.#byWindowId) if (bound === controller) this.#byWindowId.delete(id);
      for (const [key, pending] of this.#pendingByRestorationKey) if (pending === controller) this.#pendingByRestorationKey.delete(key);
    });
    return controller;
  }

  #mainController(): NSEAnyWindowController | null {
    if (this.#main && !this.#main.isDisposed) return this.#main;
    const Controller = this.#source.AppClass.mainWindow;
    if (!Controller) return null;
    this.#main = this.#construct(Controller);
    return this.#main;
  }

  /**
   * The window controller that renders the window the host just mounted in
   * (`null` for a stage mount). Idempotent: React may ask more than once.
   */
  controllerFor(current: SynWareOwnedWindowSnapshot | null): NSEAnyWindowController | null {
    if (this.#disposed) return null;
    if (!current) return this.#mainController();
    const bound = this.#byWindowId.get(current.id);
    if (bound && !bound.isDisposed) return bound;
    const pending = current.restorationKey ? this.#pendingByRestorationKey.get(current.restorationKey) : undefined;
    let controller: NSEAnyWindowController | null | undefined = pending;
    if (pending) this.#pendingByRestorationKey.delete(current.restorationKey!);
    else if (current.isMain) controller = this.#mainController();
    else {
      // A document window the application opened itself: another window of the main kind.
      const Controller = this.#source.AppClass.mainWindow;
      controller = Controller ? this.#construct(Controller) : null;
    }
    if (controller) this.#byWindowId.set(current.id, controller);
    return controller ?? null;
  }

  /** Disposes the controllers of windows that are no longer open, with the reason `"window-closed"`. */
  pruneClosedWindows(owned: readonly SynWareOwnedWindowSnapshot[]): void {
    const open = new Set(owned.map((window) => window.id));
    for (const [id, controller] of [...this.#byWindowId]) {
      if (open.has(id)) continue;
      this.#byWindowId.delete(id);
      controller[nseDisposeFor]("window-closed");
    }
  }

  /**
   * Registers a mounted window port: `openWindow` uses it, and closed windows
   * are pruned as it reports them. Returns the function that unregisters it.
   */
  attachMount(windows: SynWareWindowPort, kernel: SynCloudOSRuntime | null): () => void {
    this.#ports.add(windows);
    if (kernel) this.#kernel = kernel;
    for (const wake of [...this.#portWaiters]) wake();
    const unsubscribe = windows.subscribe(() => { this.pruneClosedWindows(windows.getSnapshot().owned); });
    return () => {
      unsubscribe();
      this.#ports.delete(windows);
    };
  }

  #waitForPort(): Promise<SynWareWindowPort> {
    const [existing] = this.#ports;
    if (existing) return Promise.resolve(existing);
    return new Promise<SynWareWindowPort>((resolve, reject) => {
      const signal = this.ownerSignal;
      const onAbort = () => {
        this.#portWaiters.delete(wake);
        reject(new DOMException("The application closed before a window host mounted.", "AbortError"));
      };
      const wake = () => {
        const [port] = this.#ports;
        if (!port) return;
        this.#portWaiters.delete(wake);
        signal.removeEventListener("abort", onAbort);
        resolve(port);
      };
      this.#portWaiters.add(wake);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  get ownerSignal(): AbortSignal {
    return this.app.ownerSignal;
  }

  async openWindow<TController extends NSEAnyWindowController>(
    Controller: NSEWindowControllerClass<TController>,
    options: NSEOpenWindowOptions = {},
  ): Promise<TController> {
    if (this.#disposed) throw new DOMException("The application is closed.", "InvalidStateError");
    const port = await this.#waitForPort();
    const key = `${++windowSequence}`;
    const restorationKey = `application.${this.#identity.appId}.window.${key}`;
    const controller = this.#construct(Controller);
    this.#pendingByRestorationKey.set(restorationKey, controller);
    try {
      const preferredBounds = options.width !== undefined && options.height !== undefined
        ? { x: 96 + 32 * this.#controllers.length, y: 96 + 32 * this.#controllers.length, width: options.width, height: options.height }
        : undefined;
      const opened = await port.openWindow({
        title: options.title ?? this.#source.appName,
        restorationKey: key,
        ...(preferredBounds ? { preferredBounds } : {}),
      });
      // The host may have mounted the window already and claimed the controller through its restoration key.
      if (!this.#byWindowId.has(opened.id)) this.#byWindowId.set(opened.id, controller);
      this.#pendingByRestorationKey.delete(restorationKey);
      return controller as TController;
    } catch (error) {
      this.#pendingByRestorationKey.delete(restorationKey);
      controller[nseDisposeFor]("window-closed");
      throw error;
    }
  }

  #relaunch(notice: string): void {
    const kernel = this.#kernel;
    if (!kernel) return;
    const { appId } = this.#identity;
    void (async () => {
      await kernel.launchServices.closeApp(appId);
      kernel.launchServices.openApp(appId);
      kernel.notifications.post({ kind: "system", title: notice, message: this.#source.appName, appId });
    })().catch(() => undefined);
  }

  /** Disposes the application and everything it owns, once, recording `reason`. */
  dispose(reason: "application-closed" | "explicit" = "application-closed"): void {
    if (this.#disposed) return;
    this.#disposed = true;
    sessions.delete(keyOf(this.#identity));
    this.#untrackApp();
    try {
      this.app[nseDisposeFor](reason);
    } finally {
      this.#leaveClassApplication();
      this.#byWindowId.clear();
      this.#pendingByRestorationKey.clear();
    }
  }
}

/** The live session of an application, if one was launched. */
export function applicationSessionFor(identity: ApplicationSessionIdentity): ApplicationSession | undefined {
  return sessions.get(keyOf(identity));
}

/** The session of an application, creating it when the host mounts one whose lifecycle never ran. */
export function ensureApplicationSession(identity: ApplicationSessionIdentity, source: ApplicationSessionSource): ApplicationSession {
  const key = keyOf(identity);
  const existing = sessions.get(key);
  if (existing) return existing;
  const session = new ApplicationSession(identity, source);
  sessions.set(key, session);
  return session;
}

/**
 * Runs one background task with a short-lived instance of the application: no
 * windows, disposed (with everything it constructed) when the task settles.
 */
export async function runApplicationBackgroundTask(
  source: ApplicationSessionSource,
  appId: string,
  taskId: string,
  context: { readonly signal: AbortSignal },
): Promise<void> {
  const { app, scope, leave } = constructApplication(source, appId, {
    appId,
    windows: () => [],
    openWindow: () => Promise.reject(new TypeError("A background task has no windows to open.")),
  });
  try {
    await app.handleBackgroundTask?.(taskId, context);
  } finally {
    try {
      app[nseDisposeFor]("application-closed");
    } finally {
      scope.release("application-closed");
      leave();
    }
  }
}

/**
 * The kernel hooks of an application class: it is instantiated when the kernel
 * starts launching it, told when it launched, became active, resigns and
 * terminates, and disposed after the close commits.
 */
export function createApplicationLifecycle(source: ApplicationSessionSource): ApplicationLifecycle {
  const sessionOf = (context: { readonly runtimeId: string; readonly appId: string }) => applicationSessionFor(context);
  const hooks: Readonly<Record<string, SynCloudOSLifecycleHook>> = {
    "launch:will": async (context) => {
      // A suspended application that resumes keeps its instance.
      if (sessionOf(context)) return;
      const session = ensureApplicationSession(context, source);
      await session.app.applicationWillFinishLaunching();
    },
    "launch:did": async (context) => {
      const session = sessionOf(context);
      if (!session || session.launchReported) return;
      session.markLaunchReported();
      await session.app.applicationDidFinishLaunching();
    },
    "activate:did": async (context) => {
      await sessionOf(context)?.app.applicationDidBecomeActive();
    },
    "suspend:will": async (context) => {
      await sessionOf(context)?.app.applicationWillResignActive();
    },
    "close:will": async (context) => {
      const session = sessionOf(context);
      if (!session) return;
      if ((await session.app.applicationShouldTerminate()) === false) {
        throw new SynCloudOSLifecycleVeto("close", `${source.appName} declined to terminate.`);
      }
    },
    "close:did": async (context) => {
      const session = sessionOf(context);
      if (!session) return;
      try {
        await session.app.applicationWillTerminate();
      } finally {
        session.dispose("application-closed");
      }
    },
  };
  return {
    hookFor: (stage, phase) => hooks[`${stage}:${phase}`] ?? null,
  };
}
