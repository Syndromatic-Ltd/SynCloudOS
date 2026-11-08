/*
 * SynCloudOS
 * Copyright Â© 2026 Syndromatic Ltd. All rights reserved.
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

import type { SynCloudOSAppInfo } from "../SynCloudOS";
import { attachNSEExecutionContext, runWithNSEOwnerExecution } from "../../NSE/applicationHostInterop";
import { assertOwnedExecutionContextLive, currentOwnedExecutionContext, reportOwnedExecutionResourceError, type OwnedExecutionContext } from "../nseRuntimeContracts";
import { applicationResourceErrorReporter } from "../AppSDK/mountedFXExecutionContext";
import { prepareApplicationServices, type PreparedApplicationServices } from "./applicationServicesPreparation";
import { assertApplicationProcessAdmission } from "../AppSDK/applicationProcessAuthority";
import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type {
  NSEApplication,
  NSEApplicationClass,
  NSEApplicationContext,
  NSEOpenWindowOptions,
} from "../../NSE/applicationHostInterop";
import {
  NSEWindowController,
  validateNSEWindowControllerClass,
  type NSEAnyWindowController,
  type NSEWindowControllerClass,
  type NSEWindowControllerContext,
} from "../../NSE/applicationHostInterop";
import { validateNSEViewControllerClass } from "../../NSE/applicationHostInterop";
import {
  enterClassApplication,
  instantiateInOwnerScope,
  nseDisposeFor,
  NSEOwnershipScope,
} from "../../NSE/applicationHostInterop";
import type { SynWareOwnedWindowSnapshot, SynWareWindowPort } from "../../SynCloudOSReact";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { ApplicationLifecycle, ApplicationLifecycleHook } from "../Lifecycle/applicationLifecycleHooks";
import { SynCloudOSLifecycleVeto } from "../Lifecycle/lifecycleTypes";
import { currentClass, trackLiveApplicationObject, type LiveApplicationObject } from "./applicationHotReload";
import { createMountedSynWareRuntime, type MountedSynWareRuntime } from "../AppSDK/appRuntimeFacade";
import { createSynWareContextValue } from "../AppSDK/createSynWareContextValue";
import { installControllerServices } from "../AppSDK/controllerServices";
import type { ResponderRegistrationHandle } from "../SynCloudOS";
import { attachNSEAuthoringContext } from "../../NSE/applicationHostInterop";
import { finalizeNSEAuthoringOwner } from "../../NSE/applicationHostInterop";
import { applicationSystemServices } from "../SynCloudOS";
import { subscribePersistencePreferences } from "../Persistence/Persistence";
import { trackOwnedWork } from "../nseRuntimeContracts";

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

function constructApplication(source: ApplicationSessionSource, appId: string, context: NSEApplicationContext, execution: OwnedExecutionContext | null): ConstructedApplication {
  const scope = new NSEOwnershipScope("NSEApplication", appId);
  if (execution) attachNSEExecutionContext(scope, execution);
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

const sessions = new WeakMap<SynCloudOSRuntime, Map<string, ApplicationSession>>();
const preparing = new WeakMap<SynCloudOSRuntime, Set<string>>();
function sessionsIn(runtime: SynCloudOSRuntime): Map<string, ApplicationSession> {
  let entries = sessions.get(runtime);
  if (!entries) sessions.set(runtime, entries = new Map());
  return entries;
}

let windowSequence = 0;
const windowClasses = new WeakMap<NSEApplicationClass, Map<string, NSEWindowControllerClass>>();
const standardWindowClasses = new WeakMap<Function, NSEWindowControllerClass>();

/** @internal Both shorthand and custom windows use the same session/admission path. */
export function applicationMainWindowClass(AppClass: NSEApplicationClass): NSEWindowControllerClass | undefined {
  if (AppClass.mainWindow && AppClass.mainViewController) throw new TypeError("An application cannot declare both mainWindow and mainViewController.");
  if (AppClass.mainWindow) { validateNSEWindowControllerClass(AppClass.mainWindow); return AppClass.mainWindow; }
  const Root = AppClass.mainViewController;
  if (!Root) return undefined;
  validateNSEViewControllerClass(Root);
  let Window = standardWindowClasses.get(Root);
  if (!Window) {
    Window = class StandardMainWindowController extends NSEWindowController { static override contentViewControllerClass = Root; };
    standardWindowClasses.set(Root, Window);
  }
  return Window;
}

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
  readonly #prepared: PreparedApplicationServices;
  #servicesAttached = false;
  #terminationOperationId: string | null = null;
  #removeLaunchAbort: (() => void) | null = null;
  #removeTerminationAbort: (() => void) | null = null;
  #removeRuntimeAbort: (() => void) | null = null;
  readonly live: LiveApplicationObject;

  constructor(runtime: SynCloudOSRuntime, canonicalApp: SynCloudOSAppInfo, source: ApplicationSessionSource) {
    const identity = { runtimeId: runtime.runtimeId, appId: canonicalApp.bundleIdentifier };
    this.#identity = identity;
    this.#kernel = runtime;
    this.#prepared = prepareApplicationServices(runtime, canonicalApp);
    this.#source = source;
    let constructed: ConstructedApplication;
    try { constructed = constructApplication(source, identity.appId, {
      appId: identity.appId,
      windows: () => Object.freeze([...this.#controllers]),
      backgroundTaskScheduler: () => this.#systemServices().scheduler,
      userNotificationCenter: () => this.#systemServices().notifications,
      setBadgeLabel: label => this.#systemServices().setBadgeLabel(label),
      openWindow: (Controller, options) => this.openWindow(Controller, options),
    }, this.#prepared.execution); } catch (error) { this.#prepared.dispose(error); throw error; }
    this.app = constructed.app;
    this.#scope = constructed.scope;
    this.#leaveClassApplication = constructed.leave;
    this.live = Object.freeze({ appName: source.appName, relaunch: (notice: string) => { this.#relaunch(notice); } });
    this.#untrackApp = trackLiveApplicationObject(this.app, this.live);
    try { this.prepareServices(runtime); }
    catch (error) { try { this.dispose(); } catch (cleanup) { applicationResourceErrorReporter(runtime, identity.appId)(cleanup); } throw error; }
  }

  #systemServices() {
    if (!this.#kernel) throw new DOMException("The application is not attached to its runtime.", "InvalidStateError");
    return applicationSystemServices(this.#kernel, this.#identity.appId, this.app.ownerSignal);
  }

  /** Whether `applicationDidFinishLaunching` already ran for this launch. */
  get launchReported(): boolean {
    return this.#launchReported;
  }

  markLaunchReported(): void {
    this.#launchReported = true;
    this.#removeLaunchAbort?.();
    this.#removeLaunchAbort = null;
  }

  /** Releases an initial launch even when application code ignores cancellation. */
  beginLaunch(operationId: string, signal: AbortSignal): () => void {
    this.#removeLaunchAbort?.();
    const remove = () => {
      signal.removeEventListener("abort", onAbort);
      if (this.#removeLaunchAbort === remove) this.#removeLaunchAbort = null;
    };
    const abandon = () => {
      remove();
      const state = this.#kernel?.lifecycle.getState(this.#identity.appId);
      // Cancellation after the structural launch commit may skip launch:did.
      // That application remains open and must follow the ordinary close path.
      if (!this.#launchReported && state !== "active" && state !== "suspended") this.dispose("application-closed");
    };
    const onAbort = () => {
      // markCommitted notifies operation observers before the lifecycle store
      // publication. Let that synchronous commit finish before reading state.
      if (this.#kernel?.operations.inspectPending().some(record => record.operationId === operationId && record.committed)) queueMicrotask(abandon);
      else abandon();
    };
    this.#removeLaunchAbort = remove;
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    return abandon;
  }

  get isDisposed(): boolean {
    return this.#disposed;
  }
  /** A session cannot be reused across its captured service/process generation. */
  get hasLiveServices(): boolean {
    try { assertOwnedExecutionContextLive(this.#prepared.execution); return true; }
    catch { return false; }
  }

  /** The window controllers in the order they were created. */
  get windowControllers(): readonly NSEAnyWindowController[] {
    return this.#controllers;
  }

  /** The application responder belongs to the application, not one of its views. */
  get ownsApplicationResponder(): boolean { return this.#prepared.ownsApplicationResponder; }

  /** Establishes the same scoped services for headless lifecycle callbacks as for views. */
  prepareServices(runtime: SynCloudOSRuntime): void {
    if (this.#servicesAttached || this.#disposed) return;
    if (runtime !== this.#kernel) throw new TypeError("Application services cannot change runtime ownership.");
    this.#servicesAttached = true;
    const appId = this.#identity.appId;
    this.attachMount(this.#prepared.mount.runtime.windows, runtime);
    const context = createSynWareContextValue(this.#prepared.mount.runtime);
    installControllerServices(context, runtime);
    attachNSEAuthoringContext(this.app, {
      observeManagedTask: work => { trackOwnedWork(runtime.lifecycle, () => work); },
      scheduler: context.scheduler,
      errors: context.errors,
      persistence: context.persistence,
      subscribePreferences: listener => subscribePersistencePreferences(runtime.persistence, key => {
        if (key.startsWith(`${normalizeBundleIdentifier(appId)}:`)) listener();
      }),
    });
    finalizeNSEAuthoringOwner(this.app);
    const report = applicationResourceErrorReporter(runtime, appId);
    const onRuntimeAbort = () => { try { this.dispose("explicit"); } catch (error) { report(error); } };
    runtime.signal.addEventListener("abort", onRuntimeAbort, { once: true });
    this.#removeRuntimeAbort = () => runtime.signal.removeEventListener("abort", onRuntimeAbort);
  }

  #construct(Controller: NSEWindowControllerClass, options: NSEOpenWindowOptions = {}): NSEAnyWindowController {
    Controller = currentClass(Controller);
    validateNSEWindowControllerClass(Controller);
    const scope = new NSEOwnershipScope("NSEWindowController", Controller.name);
    const context: NSEWindowControllerContext = { app: this.app, openingOptions: Object.freeze({ ...options }) };
    const controller = instantiateInOwnerScope(scope, () => {
      const result = new Controller(options);
      const Content = Controller.contentViewControllerClass ? currentClass(Controller.contentViewControllerClass) : undefined;
      if (Content) {
        const assigned = result.contentViewController;
        if (assigned && !(assigned instanceof Content)) throw new TypeError("The window constructor assigned a root conflicting with contentViewControllerClass.");
        if (!assigned) result.contentViewController = instantiateInOwnerScope(
          new NSEOwnershipScope("NSEViewController", Content.name), () => new Content(result as never), undefined, scope,
        );
      }
      if (this.#disposed || this.app.isDisposed) throw new DOMException("The application closed during window construction.", "InvalidStateError");
      return result;
    }, context, this.#scope);
    const leaveApplication = this.#scope.adopt(controller);
    try { finalizeNSEAuthoringOwner(controller); }
    catch (error) { try { controller[nseDisposeFor]("explicit"); } finally { leaveApplication(); } throw error; }
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
    const Controller = applicationMainWindowClass(currentClass(this.#source.AppClass));
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
      } else {
        // Main/key status can move between physical windows. Each keeps its
        // own controller; the stage's controller belongs only to the stage.
        const Controller = applicationMainWindowClass(currentClass(this.#source.AppClass));
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
  beginTermination(operationId: string, signal: AbortSignal): void {
    this.#removeTerminationAbort?.();
    this.#terminationOperationId = operationId;
    const remove = () => {
      signal.removeEventListener("abort", onAbort);
      unsubscribe?.();
      if (this.#removeTerminationAbort === remove) {
        this.#removeTerminationAbort = null;
        this.#terminationOperationId = null;
      }
    };
    const finishAbort = () => {
      remove();
      // A committed close must release its session even if close:did is
      // skipped or is still awaiting an uncooperative application callback.
      if (this.#kernel?.lifecycle.getState(this.#identity.appId) === "closed") this.dispose("application-closed");
    };
    const onAbort = () => {
      if (this.#kernel?.operations.inspectPending().some(record => record.operationId === operationId && record.committed)) queueMicrotask(finishAbort);
      else finishAbort();
    };
    const unsubscribe = this.#kernel?.operations.subscribe(() => {
      if (!this.#kernel?.operations.inspectPending().some(operation => operation.operationId === operationId)) remove();
    });
    this.#removeTerminationAbort = remove;
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  }

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
    if (kernel && kernel !== this.#kernel) throw new TypeError("A session cannot attach a different runtime.");
    this.#ports.add(windows);
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
    this.#removeLaunchAbort?.();
    this.#removeTerminationAbort?.();
    this.#removeRuntimeAbort?.();
    this.#removeLaunchAbort = null;
    this.#removeTerminationAbort = null;
    this.#removeRuntimeAbort = null;
    const entries = sessionsIn(this.#kernel!);
    const key = normalizeBundleIdentifier(this.#identity.appId);
    if (entries.get(key) === this) entries.delete(key);
    this.#untrackApp();
    try {
      this.app[nseDisposeFor](reason);
    } finally {
      this.#leaveClassApplication();
      this.#prepared.dispose("The application closed.");
      this.#byWindowId.clear();
      this.#pendingByRestorationKey.clear();
    }
  }
}

/** The live session of an application, if one was launched. */
export function applicationSessionFor(runtime: SynCloudOSRuntime, appId: string): ApplicationSession | undefined {
  return sessions.get(runtime)?.get(normalizeBundleIdentifier(appId));
}

/** The exact runtime owns preparation; reentrant constructors cannot publish another session. */
export function ensureApplicationSession(runtime: SynCloudOSRuntime, canonicalApp: SynCloudOSAppInfo, source: ApplicationSessionSource): ApplicationSession {
  const key = normalizeBundleIdentifier(canonicalApp.bundleIdentifier);
  if (runtime.apps.getApp(key) !== canonicalApp) throw new TypeError("Application sessions require the canonical application.");
  assertApplicationProcessAdmission(runtime, canonicalApp);
  const entries = sessionsIn(runtime);
  let active = preparing.get(runtime);
  if (!active) preparing.set(runtime, active = new Set());
  if (active.has(key)) throw new TypeError("The application session is already being prepared.");
  active.add(key);
  try {
    const existing = entries.get(key);
    if (existing && !existing.isDisposed && existing.hasLiveServices) return existing;
    if (existing) {
      try { existing.dispose(); } catch (error) { applicationResourceErrorReporter(runtime, canonicalApp.bundleIdentifier)(error); }
    }
    const session = new ApplicationSession(runtime, canonicalApp, source);
    entries.set(key, session);
    return session;
  } finally { active.delete(key); }
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
  const execution = currentOwnedExecutionContext();
  const { app, scope, leave } = constructApplication(source, appId, {
    appId,
    windows: () => [],
    openWindow: () => Promise.reject(new TypeError("A background task has no windows to open.")),
  }, execution);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    context.signal.removeEventListener("abort", onAbort);
    try { app[nseDisposeFor]("application-closed"); }
    finally { try { scope.release("application-closed"); } finally { leave(); } }
  };
  const onAbort = () => {
    try { dispose(); }
    catch (error) { if (execution) reportOwnedExecutionResourceError(execution, error); }
  };
  context.signal.addEventListener("abort", onAbort, { once: true });
  if (context.signal.aborted) onAbort();
  try {
    context.signal.throwIfAborted();
    await runWithNSEOwnerExecution(app, () => app.handleBackgroundTask?.(taskId, context));
  } finally { dispose(); }
}

/**
 * The kernel hooks of an application class: it is instantiated when the kernel
 * starts launching it, told when it launched, became active, resigns and
 * terminates, and disposed after the close commits.
 */
export function createApplicationLifecycle(source: ApplicationSessionSource): ApplicationLifecycle {
  const sessionOf = (runtime: SynCloudOSRuntime, context: { readonly appId: string }) => applicationSessionFor(runtime, context.appId);
  const hooks: Readonly<Record<string, ApplicationLifecycleHook>> = {
    "launch:will": async (runtime, context) => {
      // A suspended application that resumes keeps its instance.
      const existing = sessionOf(runtime, context);
      if (existing?.launchReported) return;
      const session = existing ?? ensureApplicationSession(runtime, runtime.apps.getApp(context.appId)!, source);
      const abandon = session.beginLaunch(context.operationId, context.signal);
      try {
        context.signal.throwIfAborted();
        await session.app.applicationWillFinishLaunching();
      } catch (error) {
        // Cleanup must not replace the application's original launch failure.
        try { abandon(); } finally { throw error; }
      }
    },
    "launch:did": async (runtime, context) => {
      const session = sessionOf(runtime, context);
      if (!session || session.launchReported) return;
      session.markLaunchReported();
      await session.app.applicationDidFinishLaunching();
    },
    "activate:did": async (runtime, context) => {
      await sessionOf(runtime, context)?.app.applicationDidBecomeActive();
    },
    "suspend:will": async (runtime, context) => {
      await sessionOf(runtime, context)?.app.applicationWillResignActive();
    },
    "close:will": async (runtime, context) => {
      const session = sessionOf(runtime, context);
      if (!session) return;
      if ((await session.app.applicationShouldTerminate()) === false) {
        throw new SynCloudOSLifecycleVeto("close", `${source.appName} declined to terminate.`);
      }
      context.signal.throwIfAborted();
      session.beginTermination(context.operationId, context.signal);
    },
    "close:did": async (runtime, context) => {
      const session = sessionOf(runtime, context);
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
      const session = stage === "launch" ? ensureApplicationSession(runtime, runtime.apps.getApp(appId)!, source) : applicationSessionFor(runtime, appId);
      session?.prepareServices(runtime);
    },
    hookFor: (stage, phase) => hooks[`${stage}:${phase}`] ?? null,
  };
}
