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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
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
import { createMountedSynWareRuntime, type MountedSynWareRuntime } from "./appRuntimeFacade";
import { createSynWareContextValue } from "./createSynWareContextValue";
import { installControllerServices } from "./controllerServices";
import type { ResponderRegistrationHandle } from "../Responders/responderTypes";

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

interface ControllerDocumentOwner {
  readonly mount: MountedSynWareRuntime;
  readonly responder: ResponderRegistrationHandle;
  readonly controllers: Set<NSEAnyWindowController>;
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
  return `${runtimeId}:${normalizeBundleIdentifier(appId)}`;
}

let windowSequence = 0;
const windowClasses = new WeakMap<NSEApplicationClass, Map<string, NSEWindowControllerClass>>();

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
  readonly #documentOwners = new Map<string, ControllerDocumentOwner>();
  readonly #ports = new Set<SynWareWindowPort>();
  readonly #portWaiters = new Set<() => void>();
  #kernel: SynCloudOSRuntime | null = null;
  #main: NSEAnyWindowController | null = null;
  #launchReported = false;
  #disposed = false;
  #servicesMount: MountedSynWareRuntime | null = null;
  #applicationResponder: ResponderRegistrationHandle | null = null;
  #terminationOperationId: string | null = null;
  #serviceResponder: ResponderRegistrationHandle | null = null;
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

  /** The application responder belongs to the application, not one of its views. */
  get ownsApplicationResponder(): boolean { return this.#applicationResponder !== null; }

  /** Establishes the same scoped services for headless lifecycle callbacks as for views. */
  prepareServices(runtime: SynCloudOSRuntime): void {
    if (this.#servicesMount || this.#disposed) return;
    this.#kernel = runtime;
    const appId = this.#identity.appId;
    const applicationId = `application:${appId}`;
    if (!runtime.responders.get(applicationId)) {
      this.#applicationResponder = runtime.responders.register({
        id: applicationId, kind: "application", parentId: "workspace", scopeId: applicationId,
        undoOwner: { kind: "application", id: appId },
      });
    }
    const responderId = `controller:${appId}:application-services`;
    this.#serviceResponder = runtime.responders.register({ id: responderId, kind: "controller", parentId: applicationId, scopeId: applicationId });
    const app = runtime.apps.getApp(appId);
    if (!app) throw new TypeError(`The application ${appId} is not registered.`);
    this.#servicesMount = createMountedSynWareRuntime({ runtime, app, responderId });
    this.attachMount(this.#servicesMount.runtime.windows, runtime);
    const context = createSynWareContextValue(this.#servicesMount.runtime);
    installControllerServices(context, runtime);
    runtime.signal.addEventListener("abort", () => { this.dispose("explicit"); }, { once: true });
  }

  #construct(Controller: NSEWindowControllerClass, options: NSEOpenWindowOptions = {}): NSEAnyWindowController {
    const scope = new NSEOwnershipScope("NSEWindowController", Controller.name);
    const context: NSEWindowControllerContext = { app: this.app, openingOptions: Object.freeze({ ...options }) };
    const controller = instantiateInOwnerScope(scope, () => new (currentClass(Controller))(options), context);
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
    else {
      const restored = current.restorationKey && this.#kernel?.persistence.getPreference<{ controller: string; options: NSEOpenWindowOptions } | null>(
        `application-controller:${current.restorationKey}`, null);
      if (restored) {
        const Controller = this.#source.AppClass.windowControllers?.[restored.controller] ?? windowClasses.get(this.#source.AppClass)?.get(restored.controller);
        if (!Controller) throw new TypeError(`Cannot restore window controller "${restored.controller}"; declare it in static windowControllers.`);
        controller = this.#construct(Controller, restored.options);
      } else if (current.isMain) controller = this.#mainController();
      else {
        const Controller = this.#source.AppClass.mainWindow;
        controller = Controller ? this.#construct(Controller) : null;
      }
    }
    if (controller) {
      try {
        if (current.documentId) this.#retainControllerDocument(controller, current.documentId);
        this.#byWindowId.set(current.id, controller);
      } catch (error) {
        controller[nseDisposeFor]("window-closed");
        throw error;
      }
    }
    return controller ?? null;
  }

  /** Keeps application-owned controllers alive until the accepted quit commits. */
  beginTermination(operationId: string): void { this.#terminationOperationId = operationId; }

  /** Disposes the controllers of windows that are no longer open, with the reason `"window-closed"`. */
  pruneClosedWindows(owned: readonly SynWareOwnedWindowSnapshot[]): void {
    if (this.#terminationOperationId && this.#kernel?.operations.inspectPending().some(operation => operation.operationId === this.#terminationOperationId)) return;
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

  #retainControllerDocument(controller: NSEAnyWindowController, documentId: string): { port: SynWareWindowPort; release: () => void } {
    let owner = this.#documentOwners.get(documentId);
    if (!owner) {
      const runtime = this.#kernel;
      const app = runtime?.apps.getApp(this.#identity.appId);
      if (!runtime || !app) throw new TypeError("Document windows require a registered application runtime.");
      // A separate facade gives class controllers their own owner lease: closing
      // their last window must not revoke a lifecycle callback's bootstrap lease.
      // Transfer mounts are keyed by responder and window, so sharing an
      // application responder would revoke the stage or another document.
      const applicationId = `application:${this.#identity.appId}`;
      const responderId = `controller:${this.#identity.appId}:document-windows:${runtime.environment.randomUUID()}`;
      const responder = runtime.responders.register({ id: responderId, kind: "controller", parentId: applicationId, scopeId: applicationId });
      try {
        const mount = createMountedSynWareRuntime({ runtime, app, responderId });
        owner = { mount, responder, controllers: new Set() };
      } catch (error) {
        responder.dispose({ cascade: true });
        throw error;
      }
    }
    try {
      if (!owner.mount.runtime.workspaceDocuments.retainDocument(documentId)) {
        throw new DOMException("Document windows require a live application-owned document.", "SecurityError");
      }
    } catch (error) {
      if (owner.controllers.size === 0) {
        try { owner.mount.dispose("Document window admission failed."); }
        finally { owner.responder.dispose({ cascade: true }); }
      }
      throw error;
    }
    this.#documentOwners.set(documentId, owner);
    if (owner.controllers.has(controller)) return { port: owner.mount.runtime.windows, release: () => {} };
    owner.controllers.add(controller);
    const retained = owner;
    const release = () => {
      if (!retained.controllers.delete(controller) || retained.controllers.size !== 0) return;
      if (this.#documentOwners.get(documentId) === retained) this.#documentOwners.delete(documentId);
      try { retained.mount.dispose("The last class-controlled document window closed."); }
      finally { retained.responder.dispose({ cascade: true }); }
    };
    controller.onDispose(release);
    return { port: owner.mount.runtime.windows, release };
  }

  async openWindow<TController extends NSEAnyWindowController>(
    Controller: NSEWindowControllerClass<TController>,
    options: NSEOpenWindowOptions = {},
  ): Promise<TController> {
    if (this.#disposed) throw new DOMException("The application is closed.", "InvalidStateError");
    const port = await this.#waitForPort();
    const key = options.restorationKey ?? `${++windowSequence}`;
    const restorationKey = `application.${normalizeBundleIdentifier(this.#identity.appId)}.${options.documentId ? "document" : "window"}.${key}`;
    const existing = [...this.#byWindowId.values()].find(controller => controller.openingOptions.restorationKey === options.restorationKey && options.restorationKey !== undefined);
    if (existing && !(existing instanceof currentClass(Controller))) throw new TypeError("The restoration key belongs to another window controller class.");
    const classes = windowClasses.get(this.#source.AppClass) ?? new Map<string, NSEWindowControllerClass>();
    windowClasses.set(this.#source.AppClass, classes);
    const className = Object.entries(this.#source.AppClass.windowControllers ?? {}).find(([, registered]) => registered === Controller)?.[0] ?? Controller.name;
    classes.set(className, Controller);
    const controller = existing ?? this.#construct(Controller, options);
    this.#pendingByRestorationKey.set(restorationKey, controller);
    let documentOwner: { port: SynWareWindowPort; release: () => void } | undefined;
    try {
      if (options.documentId) documentOwner = this.#retainControllerDocument(controller, options.documentId);
      const area = this.#kernel?.environment.workArea.getSnapshot();
      const defaults = this.#kernel?.apps.getApp(this.#identity.appId)?.window.defaultBounds;
      const width = options.width ?? defaults?.width ?? 640;
      const height = options.height ?? defaults?.height ?? 480;
      const preferredBounds = typeof options.preferredBounds === "object" ? options.preferredBounds
        : options.preferredBounds === "centred" && area
          ? { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height }
          : options.preferredBounds || options.width !== undefined || options.height !== undefined
            ? { x: (area?.x ?? 0) + 96 + 32 * this.#controllers.length, y: (area?.y ?? 0) + 96 + 32 * this.#controllers.length, width, height }
            : undefined;
      const request = {
        title: options.title ?? this.#source.appName,
        restorationKey: key,
        ...(preferredBounds ? { preferredBounds } : {}),
        ...(options.mobilePolicy ? { mobilePolicy: options.mobilePolicy } : {}),
      };
      const opened = options.documentId
        ? await documentOwner!.port.openDocumentWindow({ ...request, documentId: options.documentId })
        : await port.openWindow(request);
      if (!existing) this.#kernel?.persistence.setPreference(`application-controller:${restorationKey}`, { controller: className, options: controller.openingOptions });
      if (!this.#byWindowId.has(opened.id)) this.#byWindowId.set(opened.id, controller);
      this.#pendingByRestorationKey.delete(restorationKey);
      return controller as TController;
    } catch (error) {
      this.#pendingByRestorationKey.delete(restorationKey);
      documentOwner?.release();
      if (!existing) controller[nseDisposeFor]("window-closed");
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
      this.#servicesMount?.dispose("The application closed.");
      this.#servicesMount = null;
      this.#serviceResponder?.dispose({ cascade: true });
      this.#applicationResponder?.dispose({ cascade: true });
      this.#serviceResponder = null;
      this.#applicationResponder = null;
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
      const existing = sessionOf(context);
      if (existing?.launchReported) return;
      const session = existing ?? ensureApplicationSession(context, source);
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
      session.beginTermination(context.operationId);
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
    prepare(runtime, appId, stage) {
      const identity = { runtimeId: runtime.runtimeId, appId };
      const session = stage === "launch" ? ensureApplicationSession(identity, source) : applicationSessionFor(identity);
      session?.prepareServices(runtime);
    },
    hookFor: (stage, phase) => hooks[`${stage}:${phase}`] ?? null,
  };
}
