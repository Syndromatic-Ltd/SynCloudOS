/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createFilePanelService } from "../FilePanels";
import { createBrowserFilePanelAdapter } from "../FilePanels";
import type { FilePanelReference, FilePanelReleaseReason, OpenPanelRequest, SavePanelRequest } from "../FilePanels";
import { createMountedServiceTerminalOperations } from "./mountedServiceTerminalOperations";
import { registerMountedDocumentWorkflowProvider } from "./mountedDocumentWorkflowProvider";
import { prepareMountedDocumentAssetEdit } from "./mountedDocumentAssetPreparation";
import { DocumentAssetError } from "../Documents";
import type { ApplicationDocument, DocumentEditOptions, DocumentEditResult } from "../Documents";
import { declareSynCloudOSLifecycleSignal } from "../ErrorManager/lifecycleError";
import type { DocumentEditAdmission } from "../HostServices/AppSDKHostServiceTypes";
import type { DocumentEditingContext, DocumentEditingLifetimeOptions, DocumentEditingParticipant, DocumentEditingReason, DocumentEditingSettlementResult } from "../Documents";
import { IFXImageResource } from "../../FX/ImageFX/IFXImageResource";
import { createMountedAnimationLayers } from "../HostServices/mountedAnimationLayers";
import type { GFXImage } from "../../FX/GraphicsFX/GFXImage";
import { createMountedAudioGraphs } from "./mountedAudioGraphs";
import { createMountedAudioSessions } from "./mountedAudioSessions";
import { createMountedAudioFiles } from "./mountedAudioFiles";
import { createMountedHapticsClient } from "./mountedHapticsClient";
import type { AFXAnimationHandle } from "../../FX/AnimationFX/animationTypes";
import type { TFXFontDescriptor } from "../../FX/TextFX/TFXFontDescriptor";
import type { TFXFontReadinessChange, TFXRunDelegateReadinessChange, TFXRunDelegateRequest, TFXPackagedFontResourceLoader } from "../../FX/TextFX/textLayoutTypes";
import { hostFontResourcePrefix } from "./fontAccess";
import { TFXRunDelegate } from "../../FX/TextFX/TFXRunDelegate";
import { createMountedGFXIdentifierIssuer } from "../../FX/GraphicsFX/identifierAuthority";
import { createMountedMotionClient } from "./mountedMotionClient";
import { createMountedMediaClient } from "./mountedMediaClient";
import { createMountedVideoClient } from "./mountedVideoClient";
import { createMountedLocationClient } from "./mountedLocationClient";
import { createMountedMIDIClient } from "./mountedMIDIClient";
import { createMountedLuminaClient } from "./mountedLuminaClient";
import { createMountedSettlementPort } from "./mountedSettlementPort";
import type {
  CommandContext,
  CommandDeclaration,
  CommandDispatchAcceptance,
  CommandDispatchOptions,
  CommandQueryContext,
  CommandValidationOptions,
  CommandPresentation,
  DragEndpoint,
  FocusScopeHandle,
  ApplicationDocumentSnapshot,
  DocumentConflict,
  DocumentConflictResolution,
  DocumentReferenceLease,
  ResponderRegistration,
  ResponderRegistrationHandle,
  RuntimeAnimationOwner,
  RuntimeAnimationOwnerLease,

  RuntimeImageLoadRequest,
  RuntimeImageResource,
  RuntimeAudioLoadRequest,
  RuntimeAudioHandle,
  SynCloudOSAppInfo,
  SynCloudOSDocumentStoreContext,
  SynCloudOSRuntime,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotOptions,
  UndoManager,
  UndoRegistrationLease,
  UndoReservation,
  UndoAction,
  UndoRestorationSnapshot,
  UndoOwner,
} from "../SynCloudOS";
import {
  CommandValidationRequestError,
  commandOperationResult,
  strongerServiceVersion,
  isCommandOperationResult,
  setMountedAppResponderRegistrar,
  clearMountedAppResponderRegistrar,
  setMountedAppOverlayAuthority,
  clearMountedAppOverlayAuthority,
  createContentBoundPresentationTraitsService,
} from "../SynCloudOS";
import type { MountedAppOverlayAuthority } from "../SynCloudOS";
import type { DocumentResourceDescriptor } from "../SynCloudOS";
import {
  hasTrustedBundlePrivilege,
  requireTrustedBundlePrivilege,
  type SynWareTrustedPrivilege,
} from "../BundleLoader/trustedBundleProvenance";
import { createBundleGenerationFence } from "../BundleLoader/bundleGenerationFence";
import { createAppPresentationClient } from "./appPresentationClient";
import type { AppCommandClient, AppDocumentCloseOptions, AppWorkspaceDocumentsClient } from "./appClientTypes";
import {
  isAuthenticSynWareServiceToken,
  SynWareServiceAcquisitionError,
  type SynWareServiceToken,
} from "./serviceToken";
import type {
  SynWareAnimationPort,
  SynWareColourPanelPort,
  SynWareCommandPort,
  SynWareCommandAcceptance,
  SynWareCommandDeclaration,
  SynWareCommandExecutionContext,
  SynWareCommandQueryContext,
  SynWareCommandValidation,
  SynWareCatalogPort,
  SynWareDocumentResourcesPort,
  SynWareDocumentStorePort,
  SynWareImagePort,
  SynWareLifecyclePort,
  SynWareLocalePort,
  SynWareNavigationPort,
  SynWarePlatformPort,
  SynWareRuntime,
  SynWareRuntimeSnapshot,
  SynWareServicePort,
  SynWareAudioPort,
  SynWareStatePort,
  SynWareTrackingPort,
  SynWareTextLayoutPort,
  SynWareWebContentPort,
  SynWareWindowPort,
  SynWareUndoManager,
  SynWareWorkspaceDocumentPort,
} from "./appRuntimeTypes";
import type { AppClientHandle, AppLocaleSnapshot } from "./appClientTypes";
import type {
  SynCloudOSLocaleServicesSnapshot,
  SynCloudOSNotification,
  SynCloudOSNotificationPostInput,
  SynCloudOSNotificationPostOptions,
  UserNotificationPostResult,
  UserNotificationRequest,
} from "../SynCloudOS";
import type { SynWareLocaleServicesSnapshot } from "../../SynCloudOSReact";
import type {
  AppTrustedClient,
  AppTrustedConformanceAccessibilityFinding,
  AppTrustedConformanceAppearanceFact,
} from "./appTrustedClientTypes";
import {
  clearMountedAppEnvironmentClients,
  registerMountedAppEnvironmentClients,
  type MountedAppEnvironmentClients,
} from "./mountedEnvironmentClientRegistry";

export interface MountedSynWareRuntime {
  readonly runtime: SynWareRuntime;
  dispose(reason?: unknown): void;
}

type AppResponderRegistrar = (registration: ResponderRegistration) => ResponderRegistrationHandle;

export interface CreateMountedSynWareRuntimeOptions {
  readonly runtime: SynCloudOSRuntime;
  readonly app: SynCloudOSAppInfo;
  readonly responderId: string;
  readonly windowControllerId?: string;
  /** Host composition only; shares the application's existing TextFX scope. */
  readonly hostFontResourceLoader?: TFXPackagedFontResourceLoader;
}

function securityError(message: string): DOMException {
  return new DOMException(message, "SecurityError");
}

interface MountedDocumentUndoLease {
  readonly manager: SynWareUndoManager;
  readonly registrationLease: UndoRegistrationLease;
  revoke(): void;
}

/** Keep document history owned by the kernel while giving mounted editors the
 * smallest live capability they need.  In particular, never hand an app the
 * raw manager's clear/dispose/inspection/grouping controls. */
function createMountedUndoLease(manager: UndoManager, assertLive: () => void): MountedDocumentUndoLease {
  let revoked = false;
  // A mounted facade is always a history partition.  In particular, a
  // document editor must not silently become the application-wide owner just
  // because it is the first facade to acquire a raw manager.
  const registrationLease = manager.createRegistrationLease();
  const subscriptions = new Set<() => void>();
  const assertLeaseLive = () => {
    assertLive();
    if (revoked) throw securityError("The document undo lease has been revoked.");
  };
  const guardedAction = (action: UndoAction) => {
    let cleaned = false;
    // The manager owns invocation admission.  Do not make a late revocation
    // turn a completed undo into a no-op: the manager must still be able to
    // invoke the inverse while retiring an in-flight action.
    return {
      ...action,
      undo: () => action.undo(),
      redo: () => action.redo(),
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        action.cleanup?.();
      },
    } as UndoAction;
  };
  const lease: SynWareUndoManager = Object.freeze({
    get canUndo() { assertLeaseLive(); return registrationLease.canUndo; },
    get canRedo() { assertLeaseLive(); return registrationLease.canRedo; },
    get undoTitle() { assertLeaseLive(); return registrationLease.undoTitle; },
    get redoTitle() { assertLeaseLive(); return registrationLease.redoTitle; },
    get isExecuting() { assertLeaseLive(); return registrationLease.isExecuting; },
    register(action, options) { assertLeaseLive(); return registrationLease.register(guardedAction(action), options); },
    reserve() {
      assertLeaseLive();
      const reservation = registrationLease.reserve();
      let settled = false;
      return Object.freeze({
        commit(action: Parameters<UndoReservation["commit"]>[0], options?: Parameters<UndoReservation["commit"]>[1]) {
          assertLeaseLive();
          if (settled) throw new Error("The undo reservation is no longer live.");
          try { return reservation.commit(guardedAction(action), options); }
          finally { settled = true; }
        },
        cancel() { if (settled) return; settled = true; reservation.cancel(); },
      });
    },
    undo() { assertLeaseLive(); return registrationLease.undo(); },
    redo() { assertLeaseLive(); return registrationLease.redo(); },
    subscribe(listener) {
      assertLeaseLive();
      const unsubscribe = registrationLease.subscribe(listener);
      let active = true;
      const release = () => {
        if (!active) return;
        active = false;
        subscriptions.delete(release);
        unsubscribe();
      };
      subscriptions.add(release);
      return release;
    },
  });
  return {
    manager: lease,
    registrationLease,
    revoke() {
      if (revoked) return;
      revoked = true;
      for (const release of [...subscriptions]) release();
      subscriptions.clear();
      registrationLease.revoke();
    },
  };
}

const createMountedDocumentUndoLease = createMountedUndoLease;

function frozen<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function isOpaqueDocumentResourceDescriptor(value: object): boolean {
  if (!Object.isFrozen(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  return Boolean(kind && "value" in kind && kind.value === "document-resource");
}

/** Detach every value crossing the AppSDK boundary.  Runtime snapshots often
 * contain nested arrays/records, so a shallow Object.freeze is insufficient:
 * an app could otherwise mutate a child object and corrupt kernel state. */
function immutableProjection<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  if (typeof value === "function") return undefined as T;
  const object = value as object;
  // CommandOperationResult uses a private symbol brand.  An ordinary record
  // projection would discard that symbol and turn a proven nested cancellation
  // into an untyped successful value at the command boundary.
  if (isCommandOperationResult(object)) {
    return commandOperationResult(immutableProjection(object.result, seen)) as T;
  }
  // Resource descriptors are opaque, mount-issued capabilities. Preserve the
  // exact frozen token across the projection used for command callbacks;
  // authority methods still verify that the token belongs to this mount.
  if (isOpaqueDocumentResourceDescriptor(object)) return value;
  const existing = seen.get(object);
  if (existing !== undefined) return existing as T;
  if (value instanceof Date) return Object.freeze(new Date(value.getTime())) as T;
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(object, output);
    for (const entry of value) output.push(immutableProjection(entry, seen));
    return Object.freeze(output) as T;
  }
  const output: Record<string, unknown> = {};
  seen.set(object, output);
  for (const key of Object.keys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) continue;
    output[key] = immutableProjection(descriptor.value, seen);
  }
  return Object.freeze(output) as T;
}

function projected<T>(value: T): T {
  return immutableProjection(value);
}

type MountedCallbackValueProjector = <T>(value: T, label: string) => T;

/** Browsers cannot expose Node's native `util.types.isProxy` brand probe.
 * Structured clone rejects Proxy wrappers before an ordinary descriptor walk;
 * use it only for callback *results* after an app-owned callback has returned.
 * Raw command payloads remain fail-closed without a native probe. */
function detachedCallbackProxyProbe(value: object): boolean {
  try {
    if (typeof structuredClone !== "function") return true;
    structuredClone(value);
    return false;
  } catch {
    return true;
  }
}

function projectMountedCallbackSettlement<T>(
  value: T,
  label: string,
  projectCallbackValue: MountedCallbackValueProjector,
  isNativeProxy: ((value: object) => boolean) | undefined,
): T | Promise<T> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return projectCallbackValue(value, label);
  }
  if (isNativeProxy?.(value as object)) throw securityError(`${label} must not be a proxy.`);
  let then: unknown;
  try {
    then = (value as { readonly then?: unknown }).then;
  } catch (error) {
    return Promise.reject(error);
  }
  if (typeof then !== "function") return projectCallbackValue(value, label);
  // Capture `then` once as app-owned callback execution. The manager-owned
  // carrier lets the native Promise resolution procedure assimilate it without
  // reflecting over the source value or evaluating a getter a second time.
  const capturedThenable = {
    then(resolve: (settled: unknown) => unknown, reject: (reason?: unknown) => unknown) {
      return Reflect.apply(then, value, [resolve, reject]);
    },
  } as PromiseLike<unknown>;
  return Promise.resolve(capturedThenable)
    .then((settled) => projectCallbackValue(settled, label) as T);
}

function snapshotMountedCallbackObject(
  value: unknown,
  label: string,
  allowed: ReadonlySet<string>,
  isNativeProxy: ((value: object) => boolean) | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== "object") throw securityError(`${label} must be an object.`);
  const output: Record<string, unknown> = {};
  if (isNativeProxy) {
    if (isNativeProxy(value)) throw securityError(`${label} must not be a proxy.`);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw securityError(`${label} must use a plain object prototype.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string" || !allowed.has(key)) throw securityError(`${label} contains an unsupported property.`);
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
        throw securityError(`${label}.${key} must be an enumerable accessor-free data property.`);
      }
      output[key] = descriptor.value;
    }
    return output;
  }
  // A browser cannot enumerate a potentially Proxy-owned record safely.
  // Capture only the fixed manager-owned fields and discard the source.
  for (const key of allowed) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
      throw securityError(`${label}.${key} must be an enumerable accessor-free data property.`);
    }
    output[key] = descriptor.value;
  }
  return output;
}

function assertMountedCallbackFunction(value: unknown, label: string): (...arguments_: readonly unknown[]) => unknown {
  if (typeof value !== "function") throw securityError(`${label} must be a function.`);
  return value as (...arguments_: readonly unknown[]) => unknown;
}

/** Mounted command declarations have their own callback context.  The kernel
 * receives a detached wrapper and never calls an app callback with the raw
 * runtime, operation context or undo target. */
function canonicalCommandDeclaration<P, R>(
  declaration: SynWareCommandDeclaration<P, R>,
  getAppRuntime: () => SynWareRuntime,
  projectCallbackValue: MountedCallbackValueProjector,
  isNativeProxy: ((value: object) => boolean) | undefined,
): CommandDeclaration<P, R> {
  const queryContext = (context: CommandQueryContext<P>): SynWareCommandQueryContext<P> => ({
    runtime: getAppRuntime(),
    commandId: context.commandId,
    responderId: context.responderId,
    scopeId: context.scopeId,
    payload: projected(context.payload),
  });
  const executionContext = (context: CommandContext<P>): SynWareCommandExecutionContext<P> => ({
    ...queryContext(context),
    operationId: context.operationId,
    correlationId: context.correlationId,
    signal: context.signal,
    source: context.source,
    // A mounted callback can use its own narrow runtime ports, but never a
    // kernel UndoManager/UndoCommandTarget alias.
    undoManager: null,
  });
  const projectUndoAction = (action: UndoAction): UndoAction => {
    const source = snapshotMountedCallbackObject(
      action,
      "Mounted command undo action",
      new Set(["name", "asyncPolicy", "estimatedBytes", "restoration", "undo", "redo", "cleanup"]),
      isNativeProxy,
    );
    if (typeof source.name !== "string" || (source.asyncPolicy !== "forbid" && source.asyncPolicy !== "await")) {
      throw securityError("Mounted command undo factories must return a named synchronous or awaitable action.");
    }
    if (source.estimatedBytes !== undefined && (typeof source.estimatedBytes !== "number" || !Number.isFinite(source.estimatedBytes))) {
      throw securityError("Mounted command undo action estimatedBytes must be a finite number.");
    }
    const undoCallback = assertMountedCallbackFunction(source.undo, "Mounted command undo action.undo");
    const redoCallback = assertMountedCallbackFunction(source.redo, "Mounted command undo action.redo");
    const cleanupCallback = source.cleanup === undefined
      ? undefined
      : assertMountedCallbackFunction(source.cleanup, "Mounted command undo action.cleanup");
    let cleaned = false;
    const restoration = source.restoration === undefined
      ? undefined
      : (() => {
          const value = snapshotMountedCallbackObject(
            source.restoration,
            "Mounted command undo restoration",
            new Set(["before", "after", "restore"]),
            isNativeProxy,
          );
          const restore = assertMountedCallbackFunction(value.restore, "Mounted command undo restoration.restore");
          return {
            ...(Object.prototype.hasOwnProperty.call(value, "before")
              ? { before: projectCallbackValue(value.before, "Mounted command undo restoration.before") as UndoRestorationSnapshot }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(value, "after")
              ? { after: projectCallbackValue(value.after, "Mounted command undo restoration.after") as UndoRestorationSnapshot }
              : {}),
            restore(snapshot: UndoRestorationSnapshot) {
              return restore(projectCallbackValue(snapshot, "Mounted command undo restoration snapshot")) as void | Promise<void>;
            },
          };
        })();
    return {
      name: source.name,
      asyncPolicy: source.asyncPolicy,
      ...(source.estimatedBytes === undefined ? {} : { estimatedBytes: Math.max(0, source.estimatedBytes) }),
      ...(restoration ? { restoration } : {}),
      // This action never crosses back into the mounted application. It is
      // retained only by the kernel-owned registration lease, which may need
      // to compensate a mutation after the mount's public authority expires.
      undo: () => undoCallback(),
      redo: () => redoCallback(),
      ...(cleanupCallback ? { cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        cleanupCallback();
      } } : {}),
    } as UndoAction;
  };
  const titleDeclaration = declaration.title;
  const title = typeof titleDeclaration === "function"
    ? (context: CommandQueryContext<P>) => projectCallbackValue(titleDeclaration(queryContext(context)), "Mounted command title callback result")
    : projected({
        key: titleDeclaration.key,
        fallback: titleDeclaration.fallback,
        ...(titleDeclaration.values ? { values: { ...titleDeclaration.values } } : {}),
      });
  const payload = Object.freeze({
    description: declaration.payload.description,
    parse: declaration.payload.parse,
  });
  const undoDeclaration = declaration.undo;
  const undo = undoDeclaration.kind === "register"
    ? Object.freeze({
        kind: "register" as const,
        createAction: (context: CommandContext<P>, result: R) =>
          projectUndoAction(undoDeclaration.createAction(executionContext(context), projectCallbackValue(result, "Mounted command result supplied to undo factory"))),
        ...(undoDeclaration.compensate ? {
          compensate: (context: CommandContext<P>, result: R) =>
            undoDeclaration.compensate!(executionContext(context), projectCallbackValue(result, "Mounted command result supplied to compensation")),
        } : {}),
      })
    : Object.freeze({ kind: "none" as const });
  const validate = declaration.validate
    ? (context: CommandQueryContext<P>): SynWareCommandValidation | Promise<SynWareCommandValidation> => {
        const value = declaration.validate!(queryContext(context));
        return projectMountedCallbackSettlement(
          value,
          "Mounted command validation result",
          projectCallbackValue,
          isNativeProxy,
        ) as SynWareCommandValidation | Promise<SynWareCommandValidation>;
      }
    : undefined;
  const execute = (context: CommandContext<P>) => {
    const result = declaration.execute(executionContext(context));
    // Keep a synchronous declaration synchronous.  In particular, an editor
    // can finish its local mutation and command admission before React applies
    // the controlled-value rerender that replaces its responder generation.
    // Async declarations remain fenced after their await by CommandDispatcher.
    return projectMountedCallbackSettlement(
      result,
      "Mounted command execution result",
      projectCallbackValue,
      isNativeProxy,
    );
  };
  return Object.freeze({
    id: declaration.id,
    responderId: declaration.responderId,
    title,
    ...(declaration.icon === undefined ? {} : { icon: declaration.icon }),
    ...(declaration.menuCategory === undefined ? {} : { menuCategory: declaration.menuCategory }),
    payload,
    defaultKeyBindings: Object.freeze(declaration.defaultKeyBindings.map((binding) => Object.freeze({ ...binding, modifiers: binding.modifiers ? Object.freeze([...binding.modifiers]) : undefined }))),
    ...(declaration.allowReservedBrowserShortcut === undefined ? {} : { allowReservedBrowserShortcut: declaration.allowReservedBrowserShortcut }),
    scope: declaration.scope,
    undo,
    ...(declaration.telemetry ? { telemetry: Object.freeze({ ...declaration.telemetry }) } : {}),
    ...(validate ? { validate } : {}),
    execute,
  }) as CommandDeclaration<P, R>;
}

function snapshotOwnDataObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw securityError(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw securityError(`${label} must use a plain object prototype.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor) || descriptor.get || descriptor.set) throw securityError(`${label}.${key} must be an accessor-free data property.`);
    output[key] = descriptor.value;
  }
  return output;
}

interface SnapshotByteBudget {
  count: number;
  readonly limit: number;
}

function countSnapshotBytes(value: string): number {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value).byteLength;
  // This is a conservative UTF-8 upper bound when the host omits TextEncoder.
  return value.length * 3;
}

function chargeSnapshotBytes(budget: SnapshotByteBudget | undefined, bytes: number, label: string): void {
  if (!budget) return;
  budget.count += Math.max(0, bytes);
  if (budget.count > budget.limit) throw securityError(`${label} exceeds the command callback byte limit.`);
}

function snapshotCommandValue(
  value: unknown,
  label: string,
  seen = new Map<object, unknown>(),
  depth = 0,
  nodes = { count: 0 },
  preserveOpaque?: (value: object) => boolean,
  isNativeProxy?: (value: object) => boolean,
  byteBudget?: SnapshotByteBudget,
): unknown {
  nodes.count += 1;
  if (nodes.count > 10_000) throw securityError(`${label} exceeds the command payload node limit.`);
  if (depth > 64) throw securityError(`${label} exceeds the command payload depth limit.`);
  chargeSnapshotBytes(byteBudget, 1, label);
  if (value === undefined || value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    chargeSnapshotBytes(byteBudget, countSnapshotBytes(value), label);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw securityError(`${label} numbers must be finite.`);
    chargeSnapshotBytes(byteBudget, 8, label);
    return value;
  }
  if (typeof value !== "object") throw securityError(`${label} must contain only detached data.`);
  const object = value as object;
  // An issued resource descriptor is an opaque capability, not ordinary
  // payload data. Preserve only a descriptor proven to belong to this mount;
  // cloning it would turn a live lease into a reconstructable look-alike.
  if (preserveOpaque?.(object)) return object;
  // Browser JavaScript cannot distinguish a Proxy from an ordinary object
  // without either invoking Proxy traps or evaluating accessors while cloning.
  // In that host, arbitrary objects fail closed; mounted apps may instead pass
  // the immutable values created by their commands.createPayload helpers.
  if (!isNativeProxy) {
    throw securityError(`${label} must use a runtime-created immutable payload because this host cannot prove Proxy identity.`);
  }
  if (isNativeProxy(object)) throw securityError(`${label} must be native detached data, not a proxy.`);
  const prior = seen.get(object);
  if (prior !== undefined) throw securityError(`${label} must not contain cycles.`);
  seen.set(object, null);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw securityError(`${label} arrays must use the native Array prototype.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length") as PropertyDescriptor | undefined;
    const lengthValue = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || ("get" in lengthDescriptor && lengthDescriptor.get) ||
        ("set" in lengthDescriptor && lengthDescriptor.set) || typeof lengthValue !== "number" ||
        !Number.isSafeInteger(lengthValue) || lengthValue < 0 || lengthValue > 9_999) {
      throw securityError(`${label} arrays must have a bounded dense length.`);
    }
    const length = lengthValue;
    nodes.count += length;
    if (nodes.count > 10_000) throw securityError(`${label} exceeds the command payload node limit.`);
    // Structured clone performs a native Array brand check without invoking
    // a proxy's `get` trap. Use it only for primitive-only arrays, after the
    // descriptor audit, so nested accessors and opaque capability objects are
    // never traversed by this probe.
    const primitiveProbeSafe = Reflect.ownKeys(descriptors).every((key) => {
      if (key === "length") return true;
      if (typeof key !== "string" || !/^\d+$/.test(key)) return false;
      const descriptor = descriptors[key]!;
      return "value" in descriptor && !descriptor.get && !descriptor.set &&
        (descriptor.value === null || (typeof descriptor.value !== "object" && typeof descriptor.value !== "function"));
    });
    if (primitiveProbeSafe) {
      try { if (typeof structuredClone === "function") structuredClone(value); }
      catch { throw securityError(`${label} arrays must be native detached arrays.`); }
    }
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^\d+$/.test(key)) throw securityError(`${label} arrays must not contain custom or symbol properties.`);
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
        throw securityError(`${label} arrays must be dense indexed data.`);
      }
      const descriptor = descriptors[key]!;
      if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
        throw securityError(`${label}[${index}] must be an enumerable accessor-free data property.`);
      }
    }
    for (let index = 0; index < length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
        throw securityError(`${label} arrays must be dense.`);
      }
    }
    // The native structured-clone brand check rejects Proxy wrappers without
    // invoking their userland get trap.  It must run for every audited array,
    // not merely primitive-only arrays, before recursive values are admitted.
    try {
      if (typeof structuredClone !== "function") throw new Error("structuredClone is unavailable");
      structuredClone(value);
    } catch {
      throw securityError(`${label} arrays must be native detached arrays, not proxies.`);
    }
    const result: unknown[] = new Array(length);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key === "length" || typeof key !== "string") continue;
      const index = Number(key);
      const descriptor = descriptors[key]!;
      result[index] = snapshotCommandValue(descriptor.value, `${label}[${index}]`, seen, depth + 1, nodes, preserveOpaque, isNativeProxy, byteBudget);
    }
    const frozen = Object.freeze(result);
    seen.delete(object);
    return frozen;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw securityError(`${label} must use plain object values.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") throw securityError(`${label} must not contain symbol properties.`);
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !("value" in descriptor) || descriptor.get || descriptor.set) {
      throw securityError(`${label}.${key} must be an enumerable accessor-free data property.`);
    }
  }
  // Descriptor validation above rejects accessors without evaluating them;
  // this native probe then rejects any Proxy around an otherwise ordinary
  // nested record before the recursive snapshot observes its data.
  try {
    if (typeof structuredClone !== "function") throw new Error("structuredClone is unavailable");
    structuredClone(value);
  } catch {
    throw securityError(`${label} must be native detached data, not a proxy.`);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key]!;
    chargeSnapshotBytes(byteBudget, countSnapshotBytes(key), label);
    result[key] = snapshotCommandValue(descriptor.value, `${label}.${key}`, seen, depth + 1, nodes, preserveOpaque, isNativeProxy, byteBudget);
  }
  const frozen = Object.freeze(result);
  seen.delete(object);
  return frozen;
}

function snapshotMountedCallbackValue<T>(
  value: T,
  label: string,
  preserveOpaque: (value: object) => boolean,
  isNativeProxy: ((value: object) => boolean) | undefined,
): T {
  const byteBudget: SnapshotByteBudget = { count: 0, limit: 1_000_000 };
  const callbackProxyProbe = isNativeProxy ?? detachedCallbackProxyProbe;
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const object = value as object;
    if (preserveOpaque(object)) return value;
    if (callbackProxyProbe(object)) throw securityError(`${label} must not be a proxy or non-detached callback value.`);
    if (isCommandOperationResult(object)) {
      const descriptors = Object.getOwnPropertyDescriptors(object);
      const keys = Reflect.ownKeys(descriptors);
      const result = descriptors.result;
      if (keys.length !== 2 || !keys.includes("result") || !keys.some((key) => typeof key === "symbol") ||
          !result || !result.enumerable || !("value" in result) || result.get || result.set) {
        throw securityError(`${label} command operation result must use the issued shape.`);
      }
      return commandOperationResult(snapshotCommandValue(
        result.value,
        `${label}.result`,
        new Map(),
        0,
        { count: 0 },
        preserveOpaque,
        callbackProxyProbe,
        byteBudget,
      ) as never) as T;
    }
  }
  return snapshotCommandValue(value, label, new Map(), 0, { count: 0 }, preserveOpaque, callbackProxyProbe, byteBudget) as T;
}

function snapshotAppCommandDeclaration<P, R>(input: SynWareCommandDeclaration<P, R>): SynWareCommandDeclaration<P, R> {
  const declaration = snapshotOwnDataObject(input, "Command declaration");
  const title = typeof declaration.title === "function"
    ? declaration.title
    : (() => {
        const value = snapshotOwnDataObject(declaration.title, "Command title");
        return Object.freeze({
          key: String(value.key ?? ""),
          fallback: String(value.fallback ?? ""),
          ...(value.values === undefined ? {} : { values: Object.freeze({ ...snapshotOwnDataObject(value.values, "Command title values") }) }),
        });
      })();
  const payloadValue = snapshotOwnDataObject(declaration.payload, "Command payload");
  const payload = Object.freeze({
    description: String(payloadValue.description ?? ""),
    parse: payloadValue.parse,
  });
  if (typeof payload.parse !== "function") throw securityError("Command payload.parse must be a function.");
  const undoValue = snapshotOwnDataObject(declaration.undo, "Command undo");
  const undo = undoValue.kind === "register"
    ? Object.freeze({
        kind: "register" as const,
        createAction: undoValue.createAction,
        ...(undoValue.compensate === undefined ? {} : { compensate: undoValue.compensate }),
      })
    : Object.freeze({ kind: "none" as const });
  if (undo.kind === "register" && typeof undo.createAction !== "function") throw securityError("Command undo.createAction must be a function.");
  if (undo.kind === "register" && undo.compensate !== undefined && typeof undo.compensate !== "function") throw securityError("Command undo.compensate must be a function.");
  if (typeof declaration.execute !== "function") throw securityError("Command execute must be a function.");
  const bindings = declaration.defaultKeyBindings;
  if (!Array.isArray(bindings)) throw securityError("Command defaultKeyBindings must be an array.");
  const defaultKeyBindings = Object.freeze(bindings.map((binding) => {
    const snapshot = snapshotOwnDataObject(binding, "Command key binding");
    return Object.freeze({
      ...snapshot,
      ...(Array.isArray(snapshot.modifiers) ? { modifiers: Object.freeze([...snapshot.modifiers]) } : {}),
    });
  }));
  return Object.freeze({
    id: String(declaration.id ?? ""),
    responderId: String(declaration.responderId ?? ""),
    title,
    ...(declaration.icon === undefined ? {} : { icon: String(declaration.icon) }),
    ...(declaration.menuCategory === undefined ? {} : { menuCategory: String(declaration.menuCategory) }),
    payload,
    defaultKeyBindings,
    ...(declaration.allowReservedBrowserShortcut === undefined ? {} : { allowReservedBrowserShortcut: Boolean(declaration.allowReservedBrowserShortcut) }),
    scope: declaration.scope,
    undo,
    ...(declaration.telemetry === undefined ? {} : { telemetry: Object.freeze({ ...snapshotOwnDataObject(declaration.telemetry, "Command telemetry") }) }),
    ...(declaration.validate === undefined ? {} : { validate: declaration.validate }),
    execute: declaration.execute,
  }) as SynWareCommandDeclaration<P, R>;
}

function abortError(reason: unknown): DOMException {
  return reason instanceof DOMException && reason.name === "AbortError"
    ? reason
    : new DOMException("The mounted application capability was revoked.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function mergeSignals(runtimeSignal: AbortSignal, mountSignal: AbortSignal, callerSignal?: AbortSignal): AbortSignal {
  return callerSignal ? AbortSignal.any([runtimeSignal, mountSignal, callerSignal]) : AbortSignal.any([runtimeSignal, mountSignal]);
}

function awaitMounted<T>(value: Promise<T>, signal: AbortSignal, assertLive: () => void): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError(signal.reason)));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then(
      (result) => finish(() => {
        try {
          assertLive();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }),
      (error) => finish(() => reject(error)),
    );
  });
}

function scopedSnapshot(runtime: SynCloudOSRuntime, appId: string): SynWareRuntimeSnapshot {
  const snapshot = runtime.store.getSnapshot();
  const { activeLocale, ...localeServices } = snapshot.localeServices;
  return projected({
    application: { activeAppId: snapshot.application.activeAppId === appId ? appId : null },
    localeServices: { ...localeServices, locale: activeLocale },
    loginServices: {
      isAuthorised: snapshot.loginServices.isAuthorised,
      status: snapshot.loginServices.status,
      // A redacted capability needed by the existing staff publisher. This is
      // a host-derived boolean, never the session's identity or access class.
      isStaff: snapshot.loginServices.accessClass === "team",
    },
  });
}

function projectMountedLocaleSnapshot(
  snapshot: SynCloudOSLocaleServicesSnapshot,
): SynWareLocaleServicesSnapshot {
  const { activeLocale, ...snapshotFields } = snapshot;
  return projected({ ...snapshotFields, locale: activeLocale });
}

function ownedResponder(runtime: SynCloudOSRuntime, appId: string, responderId: string): boolean {
  let current: string | null = responderId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const registration = runtime.responders.get(current);
    if (!registration) return false;
    if (registration.id === `application:${appId}` && registration.kind === "application") return true;
    if (ownedCanonicalDocumentResponder(runtime, appId, registration.id)) return true;
    current = registration.parentId;
  }
  return false;
}

function ownedCanonicalDocumentResponder(
  runtime: SynCloudOSRuntime,
  appId: string,
  responderId: string,
): boolean {
  if (!responderId.startsWith("document:")) return false;
  const documentId = responderId.slice("document:".length);
  if (!documentId) return false;
  const registration = runtime.responders.get(responderId);
  if (!registration || registration.kind !== "document" ||
      (registration.parentId !== "workspace" && registration.parentId !== `application:${appId}`) ||
      registration.scopeId !== "root" || registration.diagnosticsLabel !== `Document ${documentId}` ||
      registration.undoOwner?.kind !== "document" || registration.undoOwner.id !== documentId) {
    return false;
  }
  const document = runtime.documents.getDocument(documentId);
  return document?.applicationId === appId;
}

function appDocumentContext(runtime: SynCloudOSRuntime, app: SynCloudOSAppInfo, value: SynCloudOSDocumentStoreContext | undefined, signal: AbortSignal): SynCloudOSDocumentStoreContext {
  const trustedSubject = runtime.policy.getCurrentSubject();
  return Object.freeze({
    subject: trustedSubject,
    ...(value?.origin === undefined ? {} : { origin: value.origin }),
    ...(value?.now === undefined ? {} : { now: value.now }),
    appId: app.id,
    source: `app:${app.id}`,
    signal,
  });
}

function deniedCommandPresentation(commandId: string, reason: string): CommandPresentation {
  return Object.freeze({
    commandId,
    responderId: null,
    title: commandId,
    enabled: false,
    denied: true,
    hidden: false,
    state: "off" as const,
    stale: false,
    disabledReason: reason,
  });
}

/**
 * Creates the only capability object that a mounted SynWare can receive.
 * Every property below is written out intentionally. Do not spread the kernel
 * runtime here: capability additions must undergo an AppSDK review.
 */
export function createMountedSynWareRuntime(options: CreateMountedSynWareRuntimeOptions): MountedSynWareRuntime {
  const { runtime, app, responderId, windowControllerId } = options;
  const canonical = runtime.apps.getApp(app.id);
  if (canonical !== app) throw securityError("Mounted app facades require the canonical registered application.");
  const registrationAuthority = runtime.appManager.getManagerForApp(app.id);
  if (!registrationAuthority) throw securityError("Mounted app facades require a live application registration authority.");

  const transferMount = runtime.transfers.mountApp(app, {
    responderId,
    ...(windowControllerId === undefined ? {} : { windowControllerId }),
  });
  const controller = new AbortController();
  const forwardTransferAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(
        transferMount.signal.reason
        ?? new DOMException("Mounted application capability was revoked.", "AbortError"),
      );
    }
  };
  transferMount.signal.addEventListener("abort", forwardTransferAbort, { once: true });
  if (transferMount.signal.aborted) forwardTransferAbort();
  const mountSignal = AbortSignal.any([controller.signal, transferMount.signal]);
  const mountedBundle = runtime.bundles.getBundle(app.id);
  const bundleGenerationFence = mountedBundle
    ? createBundleGenerationFence(runtime, mountedBundle, mountSignal)
    : null;
  const signal = bundleGenerationFence
    ? AbortSignal.any([runtime.signal, mountSignal, bundleGenerationFence.signal])
    : mergeSignals(runtime.signal, controller.signal, transferMount.signal);
  // Resources an application hands this signal as their owner record
  // "application-closed" when the session ends.
  declareSynCloudOSLifecycleSignal(signal, "application-closed");
  const hostFontLoader = options.hostFontResourceLoader;
  const fontResourceLoader: TFXPackagedFontResourceLoader | undefined = hostFontLoader
    ? async (path, resourceSignal) => {
      if (path.startsWith(hostFontResourcePrefix)) return hostFontLoader(path, resourceSignal);
      if (!mountedBundle?.fontResourceLoader) throw new DOMException("This application has no packaged font resource authority.", "NotSupportedError");
      return mountedBundle.fontResourceLoader(path, resourceSignal);
    }
    : mountedBundle?.fontResourceLoader;
  const textFontScope = runtime.textLayout.createFontScope(signal, fontResourceLoader);
  signal.addEventListener("abort", () => bundleGenerationFence?.dispose(), { once: true });
  let disposed = false;
  const assertLive = () => {
    if (transferMount.signal.aborted) {
      const transferReason = transferMount.signal.reason;
      if (transferReason instanceof Error) throw transferReason;
      throw new DOMException("Mounted application capability was revoked.", "AbortError");
    }
    if (disposed || signal.aborted || runtime.appManager.getManagerForApp(app.id) !== registrationAuthority) throw abortError(signal.reason);
    if (runtime.lifecycle.getState(app.id) === "closed") throw securityError("The mounted application has closed.");
  };
  const requireTrustedPrivilege = (privilege: SynWareTrustedPrivilege, capability: string) => {
    assertLive();
    requireTrustedBundlePrivilege(runtime, app.id, privilege, capability);
  };
  type TestControlCategory = keyof NonNullable<typeof runtime.environment.testControls>;
  const runTestControl = <T>(
    category: TestControlCategory,
    operation: string,
    operationSignal: AbortSignal | undefined,
    action: () => T | Promise<T>,
  ): Promise<T> => {
    const control = runtime.environment.testControls?.[category];
    if (control) return control.run(operation, operationSignal, action);
    // Browser-backed capabilities may need to consume transient activation
    // synchronously (for example HTMLMediaElement.play). Do not insert a
    // microtask boundary when no test-control gate is installed; preserve the
    // action's native call stack while retaining Promise rejection semantics.
    try { return Promise.resolve(action()); }
    catch (error) { return Promise.reject(error); }
  };
  const runTestControlSync = <T>(category: TestControlCategory, operation: string, action: () => T): T => {
    const control = runtime.environment.testControls?.[category];
    return control ? control.runSync(operation, action) : action();
  };
  // An application can remain in React's visual exit tree for a frame after
  // its mount scope has been revoked.  Keep only already-issued presentation
  // values available to that departing tree: it cannot observe a newer
  // runtime snapshot, invoke a service, or revive any transfer authority.
  // This prevents useSyncExternalStore from converting an intentional mount
  // revocation into a watchdog error while preserving immediate capability
  // revocation for all active operations.
  let presentationSource = runtime.store.getSnapshot();
  let presentationSnapshot = scopedSnapshot(runtime, app.id);
  let presentationAppearanceSource = runtime.appearance.get();
  let presentationAppearance = projected(presentationAppearanceSource);
  let presentationResolvedMode = runtime.appearance.resolved();
  let presentationLocaleSource = runtime.locale.getSnapshot();
  let presentationLocaleSnapshot = projectMountedLocaleSnapshot(presentationLocaleSource);
  let presentationLocale = runtime.locale.getActiveLocale();
  let presentationSupportedLocales = projected([...runtime.locale.getSupportedLocales()]);
  let platformWorkAreaSource = runtime.environment.workArea.getSnapshot();
  let platformWorkAreaSnapshot = projected(platformWorkAreaSource);
  let settingsSource = runtime.settings.get();
  const projectAppSettings = (settings: typeof settingsSource) => projected({
    soundEnabled: settings.soundEnabled, vibrationEnabled: settings.vibrationEnabled, motion: settings.motion,
    notificationsEnabled: settings.notificationsEnabled, notifications: settings.notifications,
  });
  let settingsSnapshot = projectAppSettings(settingsSource);
  const canRefreshPresentation = () => {
    if (disposed || signal.aborted || runtime.apps.getApp(app.id) !== app) return false;
    try {
      return runtime.lifecycle.getState(app.id) !== "closed";
    } catch {
      return false;
    }
  };
  const refreshPresentation = () => {
    if (!canRefreshPresentation()) return;
    const nextSource = runtime.store.getSnapshot();
    if (nextSource !== presentationSource) {
      presentationSource = nextSource;
      presentationSnapshot = scopedSnapshot(runtime, app.id);
    }
    const nextAppearance = runtime.appearance.get();
    if (nextAppearance !== presentationAppearanceSource) {
      presentationAppearanceSource = nextAppearance;
      presentationAppearance = projected(nextAppearance);
    }
    const nextResolvedMode = runtime.appearance.resolved();
    if (nextResolvedMode !== presentationResolvedMode) presentationResolvedMode = nextResolvedMode;
    const nextLocale = runtime.locale.getSnapshot();
    if (nextLocale !== presentationLocaleSource) {
      presentationLocaleSource = nextLocale;
      presentationLocaleSnapshot = projectMountedLocaleSnapshot(nextLocale);
    }
    presentationLocale = runtime.locale.getActiveLocale();
    presentationSupportedLocales = projected([...runtime.locale.getSupportedLocales()]);
  };
  const ownResponder = (candidate: string) => {
    assertLive();
    if (!ownedResponder(runtime, app.id, candidate)) throw securityError("Application capabilities may only target owned responders.");
  };
  const cleanupOnAbort = (cleanup: () => void): (() => void) => {
    let active = true;
    const finish = () => {
      if (!active) return;
      active = false;
      signal.removeEventListener("abort", finish);
      cleanup();
    };
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
    return finish;
  };

  try {
  // A physical window owns its own content bounds.  Stage mounts intentionally
  // project the runtime host traits because their rendered content is the host
  // composition itself, not a synthetic application window.
  const mountedTraits = (() => {
    if (windowControllerId === undefined) return { source: runtime.presentationTraits, dispose: null };
    let mountedWindow;
    try {
      mountedWindow = runtime.windows.select(windowControllerId);
    } catch {
      // A renderer can be constructed for a restoration/exit placeholder
      // after its manager controller has gone away. It has no independent
      // content geometry to observe, so retain the host projection rather
      // than manufacturing a stale or global window lookup capability.
      return { source: runtime.presentationTraits, dispose: null };
    }
    if (mountedWindow.record.applicationId !== app.id) {
      throw securityError("Mounted presentation traits require an application-owned window.");
    }
    const source = createContentBoundPresentationTraitsService({
      contentBounds: {
        getSnapshot: () => mountedWindow.record.bounds,
        subscribe: (listener) => mountedWindow.subscribe(() => listener(mountedWindow.record.bounds)),
      },
      screen: runtime.screen,
      matchMedia: runtime.environment.matchMedia,
      requestAnimationFrame: runtime.environment.requestAnimationFrame,
      cancelAnimationFrame: runtime.environment.cancelAnimationFrame,
    });
    return { source, dispose: () => source.dispose() };
  })();
  const presentation = createAppPresentationClient(mountedTraits.source, signal);
  if (mountedTraits.dispose) cleanupOnAbort(mountedTraits.dispose);

  const callerWindowIdentity = (() => {
    if (windowControllerId === undefined) {
      return Object.freeze({ applicationSessionId: app.id, workspaceId: "workspace-main" });
    }
    let mountedWindow;
    try { mountedWindow = runtime.windows.select(windowControllerId); }
    catch { throw securityError("Mounted window authority is no longer live."); }
    if (
      mountedWindow.record.applicationId !== app.id ||
      !mountedWindow.record.applicationSessionId ||
      !mountedWindow.record.workspaceId
    ) {
      throw securityError("Mounted window authority does not belong to this application.");
    }
    return Object.freeze({
      applicationSessionId: mountedWindow.record.applicationSessionId,
      workspaceId: mountedWindow.record.workspaceId,
    });
  })();
  const allowedDocumentWindowRequestKeys = new Set([
    "documentId",
    "title",
    "restorationKey",
    "preferredBounds",
    "mobilePolicy",
  ]);
  const mobilePolicies = new Set(["fullscreen", "sheet", "popover-to-sheet", "hidden"]);
  const requestRecord = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Secondary document windows require a plain request object.");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Secondary document-window requests must be plain records.");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!allowedDocumentWindowRequestKeys.has(key)) {
        throw securityError(`Secondary document-window requests cannot select host field \"${key}\".`);
      }
      if (!("value" in descriptor) || !descriptor.enumerable) {
        throw new TypeError("Secondary document-window request fields must be enumerable data properties.");
      }
    }
    return value as Readonly<Record<string, unknown>>;
  };
  const canonicalRequestText = (value: unknown, label: string) => {
    if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
      throw new TypeError(`${label} must be a non-empty canonical string.`);
    }
    return value;
  };
  const canonicalBounds = (value: unknown, fallback: Readonly<{ x: number; y: number; width: number; height: number }>) => {
    const candidate = value === undefined ? fallback : (() => {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError("preferredBounds must be a plain bounds record.");
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors).sort();
      if (keys.join("\u0000") !== ["height", "width", "x", "y"].join("\u0000") ||
          Object.values(descriptors).some((descriptor) => !("value" in descriptor) || !descriptor.enumerable)) {
        throw new TypeError("preferredBounds accepts only x, y, width, and height data fields.");
      }
      return value as Readonly<{ x: number; y: number; width: number; height: number }>;
    })();
    for (const [key, number] of Object.entries(candidate)) {
      if (typeof number !== "number" || !Number.isFinite(number)) {
        throw new TypeError(`preferredBounds.${key} must be finite.`);
      }
    }
    const workArea = runtime.environment.workArea.getSnapshot();
    const width = Math.min(workArea.width, Math.max(app.window.minimumSize.width, candidate.width));
    const height = Math.min(workArea.height, Math.max(app.window.minimumSize.height, candidate.height));
    return Object.freeze({
      x: Math.min(workArea.x + workArea.width - width, Math.max(workArea.x, candidate.x)),
      y: Math.min(workArea.y + workArea.height - height, Math.max(workArea.y, candidate.y)),
      width,
      height,
    });
  };
  const ownsWindow = (record: Readonly<{
    applicationId: string | null;
    applicationSessionId: string | null;
    workspaceId: string;
  }>) => record.applicationId === app.id &&
    record.applicationSessionId === callerWindowIdentity.applicationSessionId &&
    record.workspaceId === callerWindowIdentity.workspaceId;
  const ownedWindow = (id: string) => {
    assertLive();
    if (typeof id !== "string" || !id.trim() || id !== id.trim()) {
      throw securityError("Window operations require an owned canonical identifier.");
    }
    let candidate;
    try { candidate = runtime.windows.select(id); }
    catch { throw securityError("The requested window is not owned by this mounted application."); }
    if (!ownsWindow(candidate.record)) {
      throw securityError("The requested window is not owned by this mounted application session.");
    }
    return candidate;
  };
  const projectWindow = (record: ReturnType<typeof runtime.windows.select>["record"]) => Object.freeze({
    id: record.id,
    title: record.title,
    state: record.state as "opening" | "open" | "minimised" | "closing",
    bounds: Object.freeze({ ...record.bounds }),
    documentId: record.documentId,
    documentAssociationRole: record.documentAssociationRole,
    mobilePolicy: record.mobilePolicy,
    restorationKey: record.restorationKey,
    isKey: record.isKey,
    isMain: record.isMain,
  });
  let windowSnapshotSource = runtime.windows.snapshot();
  const buildWindowSnapshot = () => {
    const owned = Object.freeze(runtime.windows.list({
      workspaceId: callerWindowIdentity.workspaceId,
      applicationId: app.id,
      applicationSessionId: callerWindowIdentity.applicationSessionId,
    }).filter(({ record }) => record.state !== "closed").map(({ record }) => projectWindow(record)));
    let current = null;
    if (windowControllerId !== undefined) {
      try {
        const record = runtime.windows.select(windowControllerId).record;
        if (record.state !== "closed" && ownsWindow(record)) current = projectWindow(record);
      } catch { /* a closing renderer projects no current window */ }
    }
    return Object.freeze({ current, owned, surface: windowControllerId === undefined ? "application" as const : "window" as const });
  };
  let mountedWindowSnapshot = buildWindowSnapshot();
  const refreshWindowSnapshot = () => {
    const source = runtime.windows.snapshot();
    if (source !== windowSnapshotSource) {
      windowSnapshotSource = source;
      mountedWindowSnapshot = buildWindowSnapshot();
    }
    return mountedWindowSnapshot;
  };
  const windows: SynWareWindowPort = frozen<SynWareWindowPort>({
    getSnapshot() {
      // A departing tree (mount revocation mid-commit) must keep reading its
      // last-issued snapshot instead of throwing from useSyncExternalStore.
      if (canRefreshPresentation()) return refreshWindowSnapshot();
      return mountedWindowSnapshot;
    },
    subscribe(listener) {
      if (!canRefreshPresentation()) return () => undefined;
      return cleanupOnAbort(runtime.windows.subscribe(() => {
        if (signal.aborted) return;
        refreshWindowSnapshot();
        listener();
      }));
    },
    async openDocumentWindow(request) {
      assertLive();
      const fields = requestRecord(request);
      const documentId = canonicalRequestText(fields.documentId, "documentId");
      const title = canonicalRequestText(fields.title, "title");
      const callerRestorationKey = canonicalRequestText(fields.restorationKey, "restorationKey");
      const document = runtime.documents.getDocument(documentId);
      if (!document || document.applicationId !== app.id || document.state === "closed" || document.state === "closing") {
        throw securityError("Secondary document windows require a live caller-owned document.");
      }
      requireOwnedDocumentReference(documentId);
      const mobilePolicy = fields.mobilePolicy === undefined ? app.window.mobilePolicy : fields.mobilePolicy;
      if (typeof mobilePolicy !== "string" || !mobilePolicies.has(mobilePolicy)) {
        throw new TypeError("mobilePolicy must be a supported compact window policy.");
      }
      const restorationKey = `application.${app.id}.document.${callerRestorationKey}`;
      const existing = runtime.windows.list({
        workspaceId: callerWindowIdentity.workspaceId,
        applicationId: app.id,
        applicationSessionId: callerWindowIdentity.applicationSessionId,
      }).find(({ record }) => record.restorationKey === restorationKey);
      if (existing) {
        if (existing.record.documentId !== documentId || existing.record.documentAssociationRole !== "secondary") {
          throw securityError("The restoration identity belongs to another caller-owned document window.");
        }
        if (existing.record.state === "minimised") runtime.windows.restore(existing.id);
        else runtime.windows.makeKey(existing.id);
        return projectWindow(runtime.windows.select(existing.id).record);
      }
      const bounds = canonicalBounds(fields.preferredBounds, app.window.defaultBounds);
      const created = runtime.windows.create({
        workspaceId: callerWindowIdentity.workspaceId,
        applicationId: app.id,
        applicationSessionId: callerWindowIdentity.applicationSessionId,
        documentId,
        documentAssociationRole: "secondary",
        representedDocument: null,
        toolbar: null,
        role: "standard",
        style: app.window.style,
        chromeMode: app.window.chrome,
        smoothSurface: app.window.smoothSurface,
        title,
        content: { rendererId: "application", parameters: { appId: app.id } },
        bounds,
        minimumSize: app.window.minimumSize,
        maximumSize: null,
        level: "normal",
        parentWindowControllerId: null,
        anchor: null,
        pinned: false,
        mobilePolicy: mobilePolicy as "fullscreen" | "sheet" | "popover-to-sheet" | "hidden",
        restorationKey,
      });
      const opened = await runTestControl("windows", "window.open", signal, () => runtime.windows.open(created.id));
      assertLive();
      if (!ownsWindow(opened.record)) throw securityError("The opened window lost caller ownership.");
      return projectWindow(opened.record);
    },
    focus(id) {
      const candidate = ownedWindow(id);
      if (candidate.record.state === "minimised") runtime.windows.restore(candidate.id);
      else runtime.windows.makeKey(candidate.id);
      return projectWindow(runtime.windows.select(candidate.id).record);
    },
    async close(id) {
      const candidate = ownedWindow(id);
      const result = await runTestControl("windows", "window.close", signal, () => runtime.windows.requestClose(candidate.id, {
        reason: "command",
        signal,
      }));
      assertLive();
      if (result.outcome === "refused") {
        return Object.freeze({ outcome: "refused" as const, windowId: result.windowControllerId, reason: result.reason });
      }
      return Object.freeze({ outcome: result.outcome, windowId: result.windowControllerId });
    },
  });

    const state: SynWareStatePort = frozen<SynWareStatePort>({
      getSnapshot() {
        refreshPresentation();
        return presentationSnapshot;
      },
      subscribe(listener) {
        if (!canRefreshPresentation()) return () => undefined;
        const unsubscribe = runtime.store.subscribe(() => {
          if (!canRefreshPresentation()) return;
          refreshPresentation();
          listener();
        });
        return cleanupOnAbort(unsubscribe);
      },
    });

    const ownedTimeouts = new Set<unknown>();
    const ownedFrames = new Set<unknown>();
    cleanupOnAbort(() => {
      for (const handle of ownedTimeouts) runtime.environment.clearTimeout(handle);
      for (const handle of ownedFrames) runtime.environment.cancelAnimationFrame(handle);
      ownedTimeouts.clear();
      ownedFrames.clear();
    });
    const platform: SynWarePlatformPort = frozen<SynWarePlatformPort>({
      matchMedia(query) {
        assertLive();
        const media = runtime.environment.matchMedia(query);
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          media.dispose();
        };
        const removeAbort = cleanupOnAbort(close);
        return Object.freeze({
          get matches() { return !closed && media.matches; },
          subscribe(listener: (matches: boolean) => void) {
            if (closed || signal.aborted) return () => undefined;
            const unsubscribe = media.subscribe(() => { if (!closed && !signal.aborted) listener(media.matches); });
            return () => { unsubscribe(); };
          },
          dispose() {
            removeAbort();
          },
        });
      },
      online() {
        assertLive();
        return runtime.environment.browser.getNavigator()?.onLine !== false;
      },
      subscribeOnline(listener) {
        assertLive();
        const online = runtime.environment.addWindowListener("online", () => { if (!signal.aborted) listener(); });
        const offline = runtime.environment.addWindowListener("offline", () => { if (!signal.aborted) listener(); });
        return cleanupOnAbort(() => { offline(); online(); });
      },
      now() { assertLive(); return runtime.environment.now(); },
      randomUUID() { assertLive(); return runtime.environment.randomUUID(); },
      setTimeout(callback, delayMs) {
        assertLive();
        let handle: unknown;
        let handleAssigned = false;
        let callbackRan = false;
        handle = runtime.environment.setTimeout(() => {
          callbackRan = true;
          if (handleAssigned) ownedTimeouts.delete(handle);
          if (!signal.aborted) callback();
        }, delayMs);
        handleAssigned = true;
        if (!callbackRan) ownedTimeouts.add(handle);
        return handle;
      },
      clearTimeout(handle) {
        // React effect cleanup can run after the mount owner has revoked its
        // signal (the parent layout cleanup precedes descendant cleanup). A
        // handle issued by this capability remains safe to release during
        // that teardown window, while unknown handles never gain authority.
        if (!ownedTimeouts.delete(handle)) {
          if (!signal.aborted) assertLive();
          return;
        }
        runtime.environment.clearTimeout(handle);
      },
      requestAnimationFrame(callback) {
        assertLive();
        let handle: unknown;
        let handleAssigned = false;
        let callbackRan = false;
        handle = runtime.environment.requestAnimationFrame((timestamp) => {
          callbackRan = true;
          if (handleAssigned) ownedFrames.delete(handle);
          if (!signal.aborted) callback(timestamp);
        });
        handleAssigned = true;
        if (!callbackRan) ownedFrames.add(handle);
        return handle;
      },
      cancelAnimationFrame(handle) {
        if (!ownedFrames.delete(handle)) {
          if (!signal.aborted) assertLive();
          return;
        }
        runtime.environment.cancelAnimationFrame(handle);
      },
      workArea: frozen<SynWarePlatformPort["workArea"]>({
        getSnapshot() {
          assertLive();
          const next = runtime.environment.workArea.getSnapshot();
          if (next !== platformWorkAreaSource) {
            platformWorkAreaSource = next;
            platformWorkAreaSnapshot = projected(next);
          }
          return platformWorkAreaSnapshot;
        },
        subscribe(listener) {
          assertLive();
          const unsubscribe = runtime.environment.workArea.subscribe((snapshot) => { if (!signal.aborted) listener(snapshot); });
          return cleanupOnAbort(unsubscribe);
        },
      }),
      ...(runtime.environment.imageGeometry ? {
        imageGeometry: Object.freeze({
          measure(element: HTMLElement) { assertLive(); return projected(runtime.environment.imageGeometry!.measure(element)); },
          observe(element: HTMLElement, listener: () => void) {
            assertLive();
            const unsubscribe = runtime.environment.imageGeometry!.observe(element, () => { if (!signal.aborted) listener(); });
            return cleanupOnAbort(unsubscribe);
          },
          ...(runtime.environment.imageGeometry.localPoint ? {
            localPoint(element: HTMLElement, clientX: number, clientY: number) {
              assertLive();
              return projected(runtime.environment.imageGeometry!.localPoint!(element, clientX, clientY));
            },
          } : {}),
        }),
      } : {}),
    });

    const documents: SynWareDocumentStorePort = frozen<SynWareDocumentStorePort>({
      getKind(kind) { assertLive(); return projected(runtime.documentStore.getKind(kind)); },
      listKinds() { assertLive(); return projected(runtime.documentStore.listKinds()); },
      async readPublished(reference, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await runTestControl("documents", "document.read", operationSignal, () => runTestControl("files", "file.read", operationSignal, () => awaitMounted(
          runtime.documentStore.readPublished(reference, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ))));
      },
      async listPublished(query, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await awaitMounted(
          runtime.documentStore.listPublished(query, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ));
      },
      async getDraft(documentId, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await awaitMounted(
          runtime.documentStore.getDraft(documentId, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ));
      },
      async saveDraft(draft, context, writeOptions) {
        assertLive();
        const operationSignal = mergeSignals(runtime.signal, controller.signal, writeOptions?.signal);
        const options = { ...(writeOptions ?? {}), signal: operationSignal };
        return projected(await runTestControl("documents", "document.write", operationSignal, () => runTestControl("files", "file.write", operationSignal, () => awaitMounted(
          runtime.documentStore.saveDraft(draft, appDocumentContext(runtime, app, context, operationSignal), options),
          operationSignal,
          assertLive,
        ))));
      },
      async listDraftVersions(documentId, context, readOptions) {
        assertLive();
        const operationSignal = mergeSignals(runtime.signal, controller.signal, readOptions?.signal);
        const options = { ...(readOptions ?? {}), signal: operationSignal };
        return projected(await runTestControl("recovery", "recovery.read", operationSignal, () => awaitMounted(
          runtime.documentStore.listDraftVersions(documentId, appDocumentContext(runtime, app, context, operationSignal), options),
          operationSignal,
          assertLive,
        )));
      },
      async readDraftVersion(documentId, versionId, context, readOptions) {
        assertLive();
        const operationSignal = mergeSignals(runtime.signal, controller.signal, readOptions?.signal);
        const options = { ...(readOptions ?? {}), signal: operationSignal };
        return projected(await awaitMounted(
          runtime.documentStore.readDraftVersion(documentId, versionId, appDocumentContext(runtime, app, context, operationSignal), options),
          operationSignal,
          assertLive,
        ));
      },
      async deleteDraft(documentId, context, writeOptions) {
        assertLive();
        const operationSignal = mergeSignals(runtime.signal, controller.signal, writeOptions?.signal);
        const options = { ...(writeOptions ?? {}), signal: operationSignal };
        await runTestControl("documents", "document.remove", operationSignal, () => runTestControl("files", "file.remove", operationSignal, () => awaitMounted(
          runtime.documentStore.deleteDraft(documentId, appDocumentContext(runtime, app, context, operationSignal), options),
          operationSignal,
          assertLive,
        )));
      },
      async createRevision(documentId, revisionOptions, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await runTestControl("recovery", "recovery.write", operationSignal, () => awaitMounted(
          runtime.documentStore.createRevision(documentId, revisionOptions, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        )));
      },
      async publish(documentId, publishOptions, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await awaitMounted(
          runtime.documentStore.publish(documentId, publishOptions, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ));
      },
      async unpublish(documentId, unpublishOptions, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await awaitMounted(
          runtime.documentStore.unpublish(documentId, unpublishOptions, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ));
      },
      async resolveSlug(slug, slugOptions, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await awaitMounted(
          runtime.documentStore.resolveSlug(slug, slugOptions, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ));
      },
      async attachMedia(documentId, media, context) {
        assertLive();
        const operationSignal = signal;
        return projected(await awaitMounted(
          runtime.documentStore.attachMedia(documentId, media, appDocumentContext(runtime, app, context, operationSignal)),
          operationSignal,
          assertLive,
        ));
      },
    });

    const ownedWorkspaceDocument = (documentId: string) => {
      const document = runtime.documents.getDocument(documentId);
      if (!document || document.applicationId !== app.id) throw securityError("The document is not owned by this mounted application.");
      return document;
    };
    // A document's snapshot is immutable and cached until it changes, so its
    // projection is too: repeated reads return the same object, which is what
    // useSyncExternalStore requires of getSnapshot, and a large model is
    // detached once per change rather than once per read.
    const documentSnapshotProjections = new WeakMap<object, unknown>();
    const projectedDocumentSnapshot = <T extends object>(snapshot: T): T => {
      const existing = documentSnapshotProjections.get(snapshot);
      if (existing) return existing as T;
      const projection = projected(snapshot);
      documentSnapshotProjections.set(snapshot, projection);
      return projection;
    };
    type MountedDocumentReference = { readonly lease: DocumentReferenceLease; readonly owner: boolean; readonly document: object };
    const documentReferenceLeases = new Map<string, MountedDocumentReference>();
    const documentUndoLeases = new Map<string, { readonly document: object; readonly lease: MountedDocumentUndoLease }>();
    const documentObserverUndoManagers = new Map<string, { readonly document: object; readonly manager: SynWareUndoManager }>();
    const documentObserverSubscriptions = new Set<() => void>();
    const documentOwnerOperations = new Map<string, { readonly owner: MountedDocumentReference; readonly operations: Set<Promise<unknown>> }>();
    const releasedDocumentReferences = new Set<MountedDocumentReference>();
    const retireMountedDocumentCaches = (documentId: string, document?: object): void => {
      const undo = documentUndoLeases.get(documentId);
      if (undo && (!document || undo.document === document)) {
        undo.lease.revoke();
        documentUndoLeases.delete(documentId);
      }
      const observer = documentObserverUndoManagers.get(documentId);
      if (observer && (!document || observer.document === document)) {
        documentObserverUndoManagers.delete(documentId);
      }
      const reference = documentReferenceLeases.get(documentId);
      if (reference && (!document || reference.document === document)) {
        documentReferenceLeases.delete(documentId);
        void runtime.documents.releaseDocumentReferenceLease(reference.lease, { closeIfFinalOwner: reference.owner }).catch(() => undefined);
      }
    };
    const ensureDocumentReferenceLease = (documentId: string, kind: DocumentReferenceLease["kind"]) => {
      assertLive();
      const document = ownedWorkspaceDocument(documentId);
      const existing = documentReferenceLeases.get(documentId);
      if (existing && existing.document === document && (existing.owner || kind === "observer")) return existing;
      if (existing) {
        retireMountedDocumentCaches(documentId, existing.document);
      }
      const lease = runtime.documents.acquireDocumentReferenceLease(documentId, app.id, kind);
      const entry = { lease, owner: kind === "owner", document };
      documentReferenceLeases.set(documentId, entry);
      return entry;
    };
    const compensateDocumentAdmission = async <TModel, TSerialized>(document: ApplicationDocument<TModel, TSerialized>): Promise<void> => {
      const unclaimed = () => runtime.documents.getDocument(document.id) === document && document.applicationId === app.id &&
        !runtime.documents.hasActiveDocumentOwnerLease(document.id, app.id) && document.windowControllerIds.length === 0 &&
        !document.hasTerminalReconciliationLease;
      if (!unclaimed()) return;
      // The selected-close transaction owns an exact generation and rolls back
      // its preparation if another mount adopts the document during review.
      // Its structural commit is synchronous, so no owner can arrive between
      // the final authority check and removal. Never mint a revoked owner just
      // to trigger final-owner cleanup.
      const preparation = await runtime.documents.prepareCloseDocuments([document.id], "parent-close", runtime.signal);
      if (preparation.status !== "ready") return;
      try {
        if (!unclaimed()) return;
        runtime.documents.commitCloseDocuments(preparation);
        await runtime.documents.settleClosedDocuments([document.id]);
      } finally {
        await runtime.documents.cancelCloseDocuments(preparation);
      }
    };
    const admitMountedDocument = async <TModel, TSerialized>(
      operation: (operationSignal: AbortSignal) => Promise<ApplicationDocument<TModel, TSerialized>>,
      callerSignal?: AbortSignal,
      assertCurrent?: () => void,
    ): Promise<ApplicationDocumentSnapshot<TModel>> => {
      assertLive();
      const operationSignal = callerSignal ? AbortSignal.any([signal, callerSignal]) : signal;
      if (operationSignal.aborted) throw abortError(operationSignal.reason);
      const preexisting = new Set(runtime.documents.openDocuments);
      const document = await operation(operationSignal);
      try {
        assertLive();
        if (operationSignal.aborted) throw abortError(operationSignal.reason);
        assertCurrent?.();
        if (runtime.documents.getDocument(document.id) !== document) throw securityError("The document generation changed during admission.");
        ensureDocumentReferenceLease(document.id, "owner");
        return projectedDocumentSnapshot(document.snapshot()) as ApplicationDocumentSnapshot<TModel>;
      } catch (error) {
        // Opening an existing document does not confer cleanup authority over
        // its contents. Failed cleanup also must not turn a stale result into
        // success or replace the original revocation error.
        if (!preexisting.has(document)) await compensateDocumentAdmission(document).catch(() => undefined);
        throw error;
      }
    };
    const requireOwnedDocumentReference = (documentId: string) => {
      const entry = documentReferenceLeases.get(documentId);
      if (entry && runtime.documents.getDocument(documentId) !== entry.document) retireMountedDocumentCaches(documentId, entry.document);
      if (!entry?.owner || runtime.documents.getDocument(documentId) !== entry.document || !runtime.documents.hasDocumentReferenceLease(entry.lease, "owner")) {
        throw securityError("The mounted application does not hold an owner lease for this document.");
      }
      return entry;
    };
    const requireExactOwnedDocumentReference = (documentId: string, expected: MountedDocumentReference): void => {
      const current = requireOwnedDocumentReference(documentId);
      if (current !== expected || current.lease !== expected.lease || current.document !== expected.document) {
        throw securityError("The mounted document owner lease changed while the operation was in flight.");
      }
    };
    const trackOwnedDocumentOperation = <T>(
      documentId: string,
      owner: MountedDocumentReference,
      operation: () => Promise<T>,
    ): Promise<T> => {
      let state = documentOwnerOperations.get(documentId);
      if (!state || state.owner !== owner) {
        state = { owner, operations: new Set<Promise<unknown>>() };
        documentOwnerOperations.set(documentId, state);
      }
      const task = Promise.resolve().then(operation);
      state.operations.add(task);
      void task.then(
        () => {
          state!.operations.delete(task);
          if (state!.operations.size === 0 && documentOwnerOperations.get(documentId) === state) documentOwnerOperations.delete(documentId);
        },
        () => {
          state!.operations.delete(task);
          if (state!.operations.size === 0 && documentOwnerOperations.get(documentId) === state) documentOwnerOperations.delete(documentId);
        },
      );
      return task;
    };
    const waitForOwnedDocumentOperations = async (documentId: string, owner: MountedDocumentReference): Promise<void> => {
      for (;;) {
        const state = documentOwnerOperations.get(documentId);
        if (!state || state.owner !== owner || state.operations.size === 0) return;
        await Promise.allSettled([...state.operations]);
      }
    };
    const releaseOwnedDocumentReference = async (documentId: string): Promise<boolean> => {
      const entry = documentReferenceLeases.get(documentId);
      if (!entry?.owner) throw securityError("The mounted application does not hold an owner lease for this document.");
      await waitForOwnedDocumentOperations(documentId, entry);
      if (documentReferenceLeases.get(documentId) !== entry) return false;
      if (runtime.documents.getDocument(documentId) !== entry.document || !runtime.documents.hasDocumentReferenceLease(entry.lease, "owner")) {
        retireMountedDocumentCaches(documentId, entry.document);
        return false;
      }
      if (releasedDocumentReferences.has(entry)) return false;
      const undo = documentUndoLeases.get(documentId);
      if (undo?.document === entry.document) {
        undo.lease.revoke();
        documentUndoLeases.delete(documentId);
      }
      documentObserverUndoManagers.delete(documentId);
      documentReferenceLeases.delete(documentId);
      releasedDocumentReferences.add(entry);
      return await runtime.documents.releaseDocumentReferenceLease(entry.lease, { closeIfFinalOwner: true });
    };
    cleanupOnAbort(() => {
      for (const { lease } of documentUndoLeases.values()) lease.revoke();
      documentUndoLeases.clear();
      documentObserverUndoManagers.clear();
      for (const unsubscribe of [...documentObserverSubscriptions]) unsubscribe();
      documentObserverSubscriptions.clear();
      const references = [...documentReferenceLeases.entries()];
      documentReferenceLeases.clear();
      void (async () => {
        for (const [documentId, entry] of references) {
          // Disposal cannot relinquish an owner lease while one of its version
          // or conflict operations may still mutate the canonical document.
          // The operation signal has already been aborted; this fence only
          // retires the lease after that operation has settled.
          if (entry.owner) await waitForOwnedDocumentOperations(documentId, entry);
          if (releasedDocumentReferences.has(entry)) continue;
          releasedDocumentReferences.add(entry);
          await runtime.documents.releaseDocumentReferenceLease(entry.lease, {
            closeIfFinalOwner: entry.owner,
          });
        }
      })().catch(() => undefined);
    });
    const ensureMountedDocumentUndoLease = (documentId: string): MountedDocumentUndoLease => {
      const document = ownedWorkspaceDocument(documentId);
      const existing = documentUndoLeases.get(documentId);
      if (existing?.document === document) return existing.lease;
      if (existing) {
        existing.lease.revoke();
        documentUndoLeases.delete(documentId);
      }
      const owner = { kind: "document" as const, id: documentId };
      const lease = createMountedDocumentUndoLease(runtime.undo.get(owner) ?? runtime.undo.create(owner), assertLive);
      documentUndoLeases.set(documentId, { document, lease });
      return lease;
    };
    const createMountedDocumentEditAdmission = (documentId: string, owner: MountedDocumentReference): DocumentEditAdmission => {
      const history = ensureMountedDocumentUndoLease(documentId);
      const assertCurrent = () => {
        assertLive();
        requireExactOwnedDocumentReference(documentId, owner);
        const current = documentUndoLeases.get(documentId);
        if (current?.document !== owner.document || current.lease !== history) {
          throw securityError("The mounted document history partition was revoked.");
        }
      };
      return Object.freeze({
        isCurrent() { try { assertCurrent(); return true; } catch { return false; } },
        reserveHistory() { assertCurrent(); return history.manager.reserve(); },
      });
    };
    type MountedWorkspaceDocuments = SynWareWorkspaceDocumentPort;
    const documentEditingMountId = `${app.id}:${responderId}:${runtime.environment.randomUUID()}`;
    const workspaceDocuments: MountedWorkspaceDocuments = frozen<MountedWorkspaceDocuments>({
      hasType(typeId) {
        assertLive();
        return runTestControlSync("workspace", "workspace.activate", () => runtime.documents.isTypeAvailableToApplication(typeId, app.id));
      },
      subscribeDocument(documentId, listener) {
        assertLive();
        const document = ownedWorkspaceDocument(documentId);
        ensureDocumentReferenceLease(documentId, "observer");
        const unsubscribe = document.subscribe(() => {
          if (signal.aborted || runtime.documents.getDocument(documentId) !== document) return;
          listener();
        });
        return cleanupOnAbort(unsubscribe);
      },
      getDocument(documentId) {
        assertLive();
        // A missing document is a normal lookup result for applications that
        // create their backing document lazily.  Do not turn absence into an
        // authority oracle, however: an existing document must still belong to
        // this mounted application before it is exposed.
        return runTestControlSync("workspace", "workspace.switch", () => {
          if (!runtime.documents.getDocument(documentId)) return null;
          ensureDocumentReferenceLease(documentId, "observer");
          return projectedDocumentSnapshot(ownedWorkspaceDocument(documentId).snapshot());
        });
      },
      retainDocument<TModel>(documentId: string) {
        assertLive();
        if (!runtime.documents.getDocument(documentId)) return null;
        ensureDocumentReferenceLease(documentId, "owner");
        return projectedDocumentSnapshot(ownedWorkspaceDocument(documentId).snapshot()) as ApplicationDocumentSnapshot<TModel>;
      },
      releaseDocument(documentId) {
        assertLive();
        return releaseOwnedDocumentReference(documentId);
      },
      getUndoManager(documentId) {
        assertLive();
        ownedWorkspaceDocument(documentId);
        const owned = (() => {
          try { requireOwnedDocumentReference(documentId); return true; }
          catch { return false; }
        })();
        if (!owned) {
          ensureDocumentReferenceLease(documentId, "observer");
          const observedDocument = ownedWorkspaceDocument(documentId);
          const existingObserver = documentObserverUndoManagers.get(documentId);
          if (existingObserver?.document === observedDocument) return existingObserver.manager;
          if (existingObserver) documentObserverUndoManagers.delete(documentId);
          const raw = observedDocument.undoManager;
          const readOnly = Object.freeze({
            get canUndo() { assertLive(); return raw.canUndo; },
            get canRedo() { assertLive(); return raw.canRedo; },
            get undoTitle() { assertLive(); return raw.undoTitle; },
            get redoTitle() { assertLive(); return raw.redoTitle; },
            get isExecuting() { assertLive(); return raw.isExecuting; },
            register() { throw securityError("Document observer leases cannot mutate undo history."); },
            reserve() { throw securityError("Document observer leases cannot reserve undo history."); },
            undo() { throw securityError("Document observer leases cannot undo document history."); },
            redo() { throw securityError("Document observer leases cannot redo document history."); },
            subscribe(listener: () => void) {
              assertLive();
              const unsubscribe = raw.subscribe(listener);
              let active = true;
              const release = () => { if (!active) return; active = false; documentObserverSubscriptions.delete(release); unsubscribe(); };
              documentObserverSubscriptions.add(release);
              return release;
            },
          }) as SynWareUndoManager;
          documentObserverUndoManagers.set(documentId, { document: observedDocument, manager: readOnly });
          return readOnly;
        }
        return ensureMountedDocumentUndoLease(documentId).manager;
      },
      async openDocument<TModel, TSerialized = TModel>(request: Parameters<SynCloudOSRuntime["documents"]["openDocument"]>[0]): Promise<ApplicationDocumentSnapshot<TModel>> {
        assertLive();
        if (!runtime.documents.isTypeAvailableToApplication(request.typeId, app.id)) throw securityError("The document type is not provisioned for this application.");
        return admitMountedDocument(
          (operationSignal) => runtime.documents.openDocument<TModel, TSerialized>({ ...request, applicationId: app.id, signal: operationSignal }),
          request.signal,
        );
      },
      async newDocument<TModel, TSerialized = TModel>(request: Parameters<SynCloudOSRuntime["documents"]["newDocument"]>[0]): Promise<ApplicationDocumentSnapshot<TModel>> {
        assertLive();
        if (!runtime.documents.isTypeAvailableToApplication(request.typeId, app.id)) throw securityError("The document type is not provisioned for this application.");
        return admitMountedDocument(
          (operationSignal) => runtime.documents.newDocument<TModel, TSerialized>({ ...request, applicationId: app.id, signal: operationSignal } as never),
          request.signal,
        );
      },
      registerWorkflowProvider(provider): AppClientHandle {
        assertLive();
        const applicationResponderId = `application:${app.id}`;
        ownResponder(applicationResponderId);
        return registerMountedDocumentWorkflowProvider({ provider, applicationId: app.id, responderId: applicationResponderId, commands, documents: workspaceDocuments, signal, assertLive,
          targetUnavailableReason() {
            const active = runtime.documents.activeDocumentId && runtime.documents.getDocument(runtime.documents.activeDocumentId);
            return active && active.applicationId === app.id && active.hasTerminalReconciliationLease ? "The active document is under terminal reconciliation." : undefined;
          },
        });
      },
      async newProjectionDocument<TModel, TSerialized = TModel>(request: Parameters<SynCloudOSRuntime["documents"]["newProjectionDocument"]>[0]): Promise<ApplicationDocumentSnapshot<TModel>> {
        assertLive();
        if (!runtime.documents.isTypeAvailableToApplication(request.typeId, app.id)) throw securityError("The document type is not provisioned for this application.");
        // Ownership is structural and exclusive: a caller-supplied
        // applicationId (ownership spoofing), location (persistence
        // smuggling), or documentKind (escalation) is rejected before the
        // facade stamps the calling application's id.
        if ("applicationId" in request && request.applicationId !== undefined) {
          throw securityError("Projection documents cannot be created for another application.");
        }
        if ("location" in request && request.location !== undefined) throw securityError("Projection documents cannot carry a save location.");
        if ("documentKind" in request && request.documentKind !== undefined) throw securityError("Projection document kind is kernel-minted.");
        return admitMountedDocument(
          (operationSignal) => runtime.documents.newProjectionDocument<TModel, TSerialized>({ ...request, applicationId: app.id, signal: operationSignal } as never),
          request.signal,
        );
      },
      updateDocument(documentId, transform, options) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        // Core owns staging, history commitment and publication. The private
        // admission keeps legacy updates in the same mounted history partition
        // as transactions, without a second replay/publication path.
        document.update((current) => {
          const next = transform(current as never);
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          return next;
        }, { ...options, signal }, createMountedDocumentEditAdmission(documentId, owner));
      },
      transactDocument<TModel>(documentId: string, transform: (current: Readonly<TModel>) => TModel, editOptions: DocumentEditOptions<TModel>): DocumentEditResult {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        ownedWorkspaceDocument(documentId);
        const result = runtime.documents.transactDocument<TModel>(documentId, (current) => {
          const next = transform(current);
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          return next;
        }, { ...editOptions, signal: mergeSignals(runtime.signal, controller.signal, editOptions.signal),
          restoreSelection: editOptions.restoreSelection && ((receipt) => {
            if (signal.aborted) return;
            try { requireExactOwnedDocumentReference(documentId, owner); } catch { return; }
            editOptions.restoreSelection!(projected(receipt));
          }),
        }, createMountedDocumentEditAdmission(documentId, owner));
        if (result.status === "committed") return projected(result);
        const error = new Error(result.error.message);
        error.name = result.error.name;
        return Object.freeze({ ...result, error: Object.freeze(error) });
      },
      registerEditingParticipant<TModel>(documentId: string, participant: DocumentEditingParticipant<TModel>, lifetime?: Pick<DocumentEditingLifetimeOptions, "signal">) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        ownedWorkspaceDocument(documentId);
        const admission = createMountedDocumentEditAdmission(documentId, owner);
        const isCurrent = admission.isCurrent;
        const contextForApp = (context: DocumentEditingContext<TModel>): DocumentEditingContext<TModel> => Object.freeze({
          documentId: context.documentId, reason: context.reason, signal: context.signal,
          isCurrent: () => isCurrent() && context.isCurrent(),
          transact: (transform: (current: Readonly<TModel>) => TModel, editOptions: DocumentEditOptions<TModel>): DocumentEditResult => {
            if (!isCurrent() || !context.isCurrent()) return Object.freeze({ status: "rejected", documentId, reason: "unavailable", error: securityError("The editing participant's document owner was revoked.") });
            return context.transact((current) => {
              const next = transform(current);
              assertLive();
              requireExactOwnedDocumentReference(documentId, owner);
              return next;
            }, { ...editOptions, signal: mergeSignals(runtime.signal, context.signal, editOptions.signal) });
          },
        });
        // Stamp actual mount/window lifetime; apps cannot register on behalf of
        // a sibling mount or capture an unguarded core transaction capability.
        const settle = participant.settle.bind(participant);
        const discard = participant.discard?.bind(participant);
        return runtime.documents.registerEditingParticipant<TModel>(documentId, {
          id: participant.id,
          settle: (context) => settle(contextForApp(context)),
          ...(discard ? { discard: (context: DocumentEditingContext<TModel>) => discard(contextForApp(context)) } : {}),
        }, { signal: mergeSignals(runtime.signal, controller.signal, lifetime?.signal), mountId: documentEditingMountId, windowControllerId, isCurrent }, admission);
      },
      settleEditing(documentId: string, reason: DocumentEditingReason, callerSignal?: AbortSignal) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        ownedWorkspaceDocument(documentId);
        const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
        return trackOwnedDocumentOperation(documentId, owner, async (): Promise<DocumentEditingSettlementResult> => {
          const result = await runtime.documents.settleEditing(documentId, reason, operationSignal);
          return projected(result);
        });
      },
      synchroniseDocument(documentId, transform) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        document.update((current) => {
          const next = transform(current as never);
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          return next;
        }, {
          actionName: "Synchronise document editor",
          recordUndo: false,
          signal,
        }, createMountedDocumentEditAdmission(documentId, owner));
      },
      listDocumentVersions(documentId, callerSignal) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        return trackOwnedDocumentOperation(documentId, owner, async () => {
          const versions = await document.listVersions(mergeSignals(runtime.signal, controller.signal, callerSignal));
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          if (runtime.documents.getDocument(documentId) !== document) {
            throw securityError("The document generation changed while listing versions.");
          }
          return versions;
        });
      },
      readDocumentVersion(documentId, version, callerSignal) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        return trackOwnedDocumentOperation(documentId, owner, async () => {
          const model = await runtime.documents.readDocumentVersion(documentId, version, mergeSignals(runtime.signal, controller.signal, callerSignal));
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          if (runtime.documents.getDocument(documentId) !== document) {
            throw securityError("The document generation changed while reading a version.");
          }
          return model as never;
        });
      },
      restoreDocumentVersion(documentId, version, callerSignal) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        return trackOwnedDocumentOperation(documentId, owner, async () => {
          const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
          await runtime.documents.restoreVersion(documentId, version, operationSignal);
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          if (runtime.documents.getDocument(documentId) !== document) {
            throw securityError("The document generation changed while restoring a version.");
          }
        });
      },
      enterDocumentConflict(documentId, conflict) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        requireExactOwnedDocumentReference(documentId, owner);
        document.enterConflict(conflict as Omit<DocumentConflict<unknown>, "detectedAt"> & { readonly detectedAt?: string });
      },
      resolveDocumentConflict(documentId, resolution, callerSignal) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        return trackOwnedDocumentOperation(documentId, owner, async () => {
          const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
          await document.resolveConflict(resolution as DocumentConflictResolution<unknown>, operationSignal);
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          if (runtime.documents.getDocument(documentId) !== document) {
            throw securityError("The document generation changed while resolving a conflict.");
          }
        });
      },
      saveDocument(documentId, saveOptions) {
        assertLive();
        requireOwnedDocumentReference(documentId);
        ownedWorkspaceDocument(documentId);
        return runtime.documents.saveDocument(documentId, { reason: saveOptions?.reason ?? "explicit", signal: mergeSignals(runtime.signal, controller.signal, saveOptions?.signal) });
      },
      saveAsDocument(request) {
        assertLive();
        const owner = requireOwnedDocumentReference(request.documentId);
        ownedWorkspaceDocument(request.documentId);
        const captured = { ...request, destination: structuredClone(request.destination), conflict: request.conflict && structuredClone(request.conflict), signal: mergeSignals(runtime.signal, controller.signal, request.signal) };
        return trackOwnedDocumentOperation(request.documentId, owner, async () => {
          assertLive();
          requireExactOwnedDocumentReference(request.documentId, owner);
          const result = await runtime.documents.saveAsDocument(captured);
          assertLive();
          requireExactOwnedDocumentReference(request.documentId, owner);
          return projected(result);
        });
      },
      duplicateDocument<TModel = unknown>(documentId: string, location: Parameters<AppWorkspaceDocumentsClient["duplicateDocument"]>[1]) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        ownedWorkspaceDocument(documentId);
        const destination = structuredClone(location);
        return trackOwnedDocumentOperation(documentId, owner, async () => {
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          return admitMountedDocument(
            () => runtime.documents.duplicateDocument(documentId, destination),
            undefined,
            () => requireExactOwnedDocumentReference(documentId, owner),
          ) as Promise<ApplicationDocumentSnapshot<TModel>>;
        });
      },
      moveDocument(request) {
        assertLive();
        const owner = requireOwnedDocumentReference(request.documentId);
        ownedWorkspaceDocument(request.documentId);
        const captured = { ...request, destination: structuredClone(request.destination), conflict: request.conflict && structuredClone(request.conflict), expectedSourceVersion: structuredClone(request.expectedSourceVersion), signal: mergeSignals(runtime.signal, controller.signal, request.signal) };
        return trackOwnedDocumentOperation(request.documentId, owner, async () => {
          assertLive();
          requireExactOwnedDocumentReference(request.documentId, owner);
          const result = await runtime.documents.moveDocument(captured);
          assertLive();
          requireExactOwnedDocumentReference(request.documentId, owner);
          // Error.message/name are non-enumerable. Project an explicit receipt
          // so the public client retains the source-removal explanation.
          return projected(result.outcome === "moved" ? result : {
            ...result,
            sourceRemovalError: { name: result.sourceRemovalError.name, code: result.sourceRemovalError.code, message: result.sourceRemovalError.message },
          });
        });
      },
      revertDocument(documentId, version, callerSignal) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        ownedWorkspaceDocument(documentId);
        const capturedVersion = version && structuredClone(version);
        return trackOwnedDocumentOperation(documentId, owner, async () => {
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
          await runtime.documents.revertDocument(documentId, capturedVersion, mergeSignals(runtime.signal, controller.signal, callerSignal));
          assertLive();
          requireExactOwnedDocumentReference(documentId, owner);
        });
      },
      closeDocument(documentId: string, options?: AppDocumentCloseOptions | Parameters<SynCloudOSRuntime["documents"]["closeDocument"]>[1], legacySignal?: AbortSignal) {
        assertLive();
        requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        // The public client uses an options object. Internal legacy callers may
        // still use the positional port while its consumers are migrated.
        const reason = typeof options === "string" ? options : options?.reason ?? "user";
        const callerSignal = typeof options === "string" ? legacySignal : options?.signal;
        return runtime.documents.closeDocument(documentId, reason, mergeSignals(runtime.signal, controller.signal, callerSignal)).finally(() => {
          if (runtime.documents.getDocument(documentId) !== document) retireMountedDocumentCaches(documentId, document);
        });
      },
    });

    const documentResourceLeases = new WeakMap<object, { readonly documentId: string; readonly document: object; readonly descriptor: DocumentResourceDescriptor }>();
    const liveDocumentResourceLeases = new Set<{ readonly documentId: string; readonly document: object; readonly descriptor: DocumentResourceDescriptor }>();
    const documentResourceReferenceKey = (descriptor: Pick<DocumentResourceDescriptor, "documentId" | "resourceId" | "leaseId" | "generation" | "mimeType" | "byteLength">) =>
      JSON.stringify([descriptor.documentId, descriptor.resourceId, descriptor.leaseId, descriptor.generation, descriptor.mimeType, descriptor.byteLength]);
    const documentResourceLeasesByReference = new Map<string, { readonly documentId: string; readonly document: object; readonly descriptor: DocumentResourceDescriptor }>();
    const admitDocumentResource = (documentId: string, document: object, descriptor: DocumentResourceDescriptor, operationSignal: AbortSignal) => {
      // An ID may be reused after close; admission retains the exact source
      // document and rejects late descriptors from any prior generation.
      if (operationSignal.aborted || signal.aborted || runtime.documents.getDocument(documentId) !== document) {
        runtime.documentResources.release(documentId, descriptor);
        if (operationSignal.aborted || signal.aborted) throw abortError(operationSignal.reason ?? signal.reason);
        throw securityError("The document generation changed while acquiring a resource.");
      }
      const lease = { documentId, document, descriptor };
      documentResourceLeases.set(descriptor, lease);
      liveDocumentResourceLeases.add(lease);
      documentResourceLeasesByReference.set(documentResourceReferenceKey(descriptor), lease);
      return descriptor;
    };
    cleanupOnAbort(() => {
      for (const lease of liveDocumentResourceLeases) {
        try { runtime.documentResources.release(lease.documentId, lease.descriptor); } catch { /* invalidation may already have retired it */ }
      }
      liveDocumentResourceLeases.clear();
      documentResourceLeasesByReference.clear();
    });
    const documentResources: SynWareDocumentResourcesPort = frozen<SynWareDocumentResourcesPort>({
      get assetCapabilities() {
        assertLive();
        return runtime.documentResources.assetCapabilities && projected(runtime.documentResources.assetCapabilities);
      },
      acquire(documentId, resource, callerSignal) {
        assertLive();
        const document = ownedWorkspaceDocument(documentId);
        const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
        return runtime.documentResources.acquire(documentId, resource, operationSignal).then((descriptor) => admitDocumentResource(documentId, document, descriptor, operationSignal));
      },
      acquireAsset(documentId, reference, callerSignal) {
        assertLive();
        const document = ownedWorkspaceDocument(documentId);
        const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
        return runtime.documentResources.acquireAsset(documentId, reference, operationSignal).then((descriptor) => admitDocumentResource(documentId, document, descriptor, operationSignal));
      },
      persist(documentId, descriptor, callerSignal) {
        assertLive();
        const document = ownedWorkspaceDocument(documentId);
        const lease = descriptor && typeof descriptor === "object" ? documentResourceLeases.get(descriptor) : undefined;
        if (!lease || lease.documentId !== documentId || lease.document !== document || lease.descriptor !== descriptor) {
          throw securityError("The mounted application does not hold this document resource lease.");
        }
        const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
        return runtime.documentResources.persist(documentId, descriptor, operationSignal).then((reference) => {
          assertLive();
          if (operationSignal.aborted) throw abortError(operationSignal.reason);
          if (runtime.documents.getDocument(documentId) !== document || documentResourceLeases.get(descriptor) !== lease || !runtime.documentResources.isActive(documentId, descriptor)) {
            throw securityError("The document resource lease changed while persisting an asset.");
          }
          return projected(reference);
        });
      },
      prepareEdit<TModel>(documentId: string, before: Readonly<TModel>, after: Readonly<TModel>, options?: Readonly<{ signal?: AbortSignal }>) {
        assertLive();
        const owner = requireOwnedDocumentReference(documentId);
        const document = ownedWorkspaceDocument(documentId);
        const assets = runtime.documentAssets;
        if (!assets) return Promise.reject(new DocumentAssetError("asset-unsupported", "Document asset model preparation is not configured."));
        const operationSignal = mergeSignals(runtime.signal, controller.signal, options?.signal);
        const prepared = prepareMountedDocumentAssetEdit({ before, after, expectedRevision: document.dirtyRevision, typeId: document.type.id, signal: operationSignal,
          assertCurrent() { assertLive(); requireExactOwnedDocumentReference(documentId, owner); },
          current: () => ({ revision: document.dirtyRevision, model: document.model }),
          prepare: (capturedBefore, capturedAfter, signal) => assets.prepareEdit<TModel>(documentId, capturedBefore, capturedAfter, signal),
        });
        return trackOwnedDocumentOperation(documentId, owner, () => prepared);
      },
      isActive(documentId, descriptor): descriptor is DocumentResourceDescriptor {
        assertLive();
        const document = ownedWorkspaceDocument(documentId);
        if (!runtime.documentResources.isActive(documentId, descriptor)) return false;
        const lease = descriptor && typeof descriptor === "object" ? documentResourceLeases.get(descriptor) : undefined;
        return Boolean(lease && lease.documentId === documentId && lease.document === document && lease.descriptor === descriptor);
      },
      resolve(documentId, descriptor, callerSignal) {
        assertLive();
        const document = ownedWorkspaceDocument(documentId);
        const lease = descriptor && typeof descriptor === "object" ? documentResourceLeases.get(descriptor) : undefined;
        if (!lease || lease.documentId !== documentId || lease.document !== document || lease.descriptor !== descriptor) return null;
        return runtime.documentResources.resolve(documentId, descriptor, mergeSignals(runtime.signal, controller.signal, callerSignal));
      },
      subscribeInvalidation(listener) {
        assertLive();
        return cleanupOnAbort(runtime.documentResources.subscribeInvalidation((entry) => {
          const lease = documentResourceLeases.get(entry.descriptor);
          if (!lease || lease.documentId !== entry.documentId || runtime.documents.getDocument(entry.documentId) !== lease.document) return;
          documentResourceLeases.delete(entry.descriptor);
          liveDocumentResourceLeases.delete(lease);
          documentResourceLeasesByReference.delete(documentResourceReferenceKey(entry.descriptor));
          if (signal.aborted) return;
          listener(entry);
        }));
      },
      release(documentId, descriptor) {
        const lease = descriptor && typeof descriptor === "object" ? documentResourceLeases.get(descriptor) : undefined;
        if (!lease || lease.documentId !== documentId || runtime.documents.getDocument(documentId) !== lease.document || lease.descriptor !== descriptor) return false;
        documentResourceLeases.delete(descriptor);
        liveDocumentResourceLeases.delete(lease);
        documentResourceLeasesByReference.delete(documentResourceReferenceKey(descriptor));
        return runtime.documentResources.release(documentId, descriptor);
      },
    });

    const applicationUndoLeases = new Map<string, MountedDocumentUndoLease>();
    cleanupOnAbort(() => {
      for (const lease of applicationUndoLeases.values()) lease.revoke();
      applicationUndoLeases.clear();
    });
    const ensureApplicationUndoLease = (): MountedDocumentUndoLease => {
      const existing = applicationUndoLeases.get(app.id);
      if (existing) return existing;
      const lease = createMountedUndoLease(runtime.undo.get({ kind: "application", id: app.id }) ?? runtime.undo.create({ kind: "application", id: app.id }), assertLive);
      applicationUndoLeases.set(app.id, lease);
      return lease;
    };

    let appRuntime!: SynWareRuntime;
    const commandScopeToken = Object.freeze({});
    const mountedAcceptances = new WeakMap<object, {
      readonly acceptance: CommandDispatchAcceptance;
      readonly originalPayload: unknown;
      readonly payloadSnapshot: unknown;
    }>();
    const exposeAcceptance = (acceptance: CommandDispatchAcceptance, originalPayload: unknown, payloadSnapshot: unknown): CommandDispatchAcceptance => {
      const exposed = Object.freeze({
        commandId: acceptance.commandId,
        responderId: acceptance.responderId,
      }) as CommandDispatchAcceptance;
      mountedAcceptances.set(exposed, { acceptance, originalPayload, payloadSnapshot });
      return exposed;
    };
    const unwrapAcceptance = (acceptance: SynWareCommandAcceptance | undefined): CommandDispatchAcceptance | undefined => {
      if (!acceptance) return undefined;
      return mountedAcceptances.get(acceptance as object)?.acceptance ?? ({} as CommandDispatchAcceptance);
    };
    const ownedCommandResponders = new Map<string, Set<string>>();
    type MountedCommandRegistration = {
      readonly commandId: string;
      readonly responderId: string;
      dispose(): boolean;
    };
    type PendingCommandRegistration = MountedCommandRegistration & {
      readonly declaration: CommandDeclaration<unknown, unknown>;
      active: boolean;
      underlying: MountedCommandRegistration | null;
    };
    const commandRegistrations = new Set<MountedCommandRegistration>();
    const pendingCommandRegistrations = new Set<PendingCommandRegistration>();
    cleanupOnAbort(() => {
      for (const registration of commandRegistrations) registration.dispose();
      commandRegistrations.clear();
      pendingCommandRegistrations.clear();
    });
    const attachCommandRegistration = (pending: PendingCommandRegistration): void => {
      if (!pending.active || pending.underlying) return;
      const registration = runtime.commands.register(pending.declaration);
      pending.underlying = registration;
      pendingCommandRegistrations.delete(pending);
      const responders = ownedCommandResponders.get(pending.commandId) ?? new Set<string>();
      responders.add(pending.responderId);
      ownedCommandResponders.set(pending.commandId, responders);
    };
    const drainPendingCommandRegistrations = (): void => {
      for (const pending of [...pendingCommandRegistrations]) {
        if (!pending.active) {
          pendingCommandRegistrations.delete(pending);
          continue;
        }
        if (!runtime.responders.get(pending.responderId)) continue;
        if (!ownedResponder(runtime, app.id, pending.responderId)) {
          pending.dispose();
          throw securityError("Application capabilities may only target owned responders.");
        }
        attachCommandRegistration(pending);
      }
    };
    // These are the only host-mediated commands an app menu may request. They
    // do not expose arbitrary runtime/session/webspring operations: logout is
    // confirmation-only, About is app-scoped, Preferences is host-owned, and
    // return-to-Webspring is a fixed route with no target payload.
    const safeHostCommandResponders = new Map<string, string>([
      ["application.showAbout", "runtime"],
      ["system.showPreferences", "runtime"],
      // The shared Font and Colours panels are the system's (Webspring's
      // SystemPanelsLayer); any app may show them.
      ["system.showFonts", "runtime"],
      ["system.showColours", "runtime"],
      ["system.setLocale", "runtime"],
      ["session.requestLogOut", "runtime"],
      ["workspace.returnToWebspring", "workspace"],
    ]);
    const focusRequiredCommandIds = new Set(["nse.drag.begin", "nse.drag.drop", "nse.drag.cancel"]);
    const commandResponder = (commandId: string): string | null => {
      const responders = ownedCommandResponders.get(commandId);
      if (!responders || responders.size === 0) return null;
      const focused = runtime.focus.getFocusedResponderId();
      if (focused) {
        const chain = runtime.responders.resolveChain(focused);
        for (const responder of chain) {
          if (responders.has(responder.id)) return responder.id;
        }
        // Keyboard drag commands are intentionally tied to the concrete
        // focused control. They must never select a sibling merely because
        // it is the only registered owner of the command id.
        if (focusRequiredCommandIds.has(commandId)) return null;
      }
      // Application-scoped commands retain their initial no-focus admission,
      // but a command with several concrete control owners must never select
      // an arbitrary sibling before a focus boundary has been established.
      return responders.size === 1 ? [...responders][0] ?? null : null;
    };
    const safeEditorCommandIds = new Set([
      "edit.undo", "edit.redo", "edit.copy", "edit.cut", "edit.paste", "edit.select-all", "edit.delete-backward", "edit.delete-forward",
      "editor.toggle-bold", "editor.toggle-italic", "editor.toggle-underline", "editor.insert-line-break", "editor.insert-text",
      "editor.find", "editor.replace", "editor.replace-all", "editor.align-paragraph", "editor.insert-attachment",
      "format.font", "format.paragraph", "format.attributes",
    ]);
    const safeColourPanelCommandIds = new Set([
      "colour-panel.show", "colour-panel.hide", "colour-panel.choose-picker", "colour-panel.copy", "colour-panel.paste", "colour-panel.commit", "colour-panel.cancel",
    ]);
    const isSafeAppCommandId = (commandId: string): boolean => safeEditorCommandIds.has(commandId)
      || commandId === "document.new" || commandId === "document.open"
      || safeColourPanelCommandIds.has(commandId)
      || commandId === "nse.drag.begin"
      || commandId === "nse.drag.drop"
      || commandId === "nse.drag.cancel"
      || commandId.startsWith(`${app.id}.`)
      || commandId.startsWith(`${app.id}:`);
    type OwnedCommandPayload = Readonly<{
      readonly snapshot: object;
      readonly nodes: number;
      readonly depth: number;
    }>;
    const ownedCommandPayloads = new WeakMap<object, OwnedCommandPayload>();
    const payloadValue = (value: unknown, label: string): Readonly<{ readonly value: unknown; readonly nodes: number; readonly depth: number }> => {
      if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") {
        return Object.freeze({ value, nodes: 1, depth: 0 });
      }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw securityError(`${label} numbers must be finite.`);
        return Object.freeze({ value, nodes: 1, depth: 0 });
      }
      if (typeof value !== "object") throw securityError(`${label} must be primitive, a mounted capability, or another runtime-created payload.`);
      const object = value as object;
      if (documentResourceLeases.has(object)) return Object.freeze({ value: object, nodes: 1, depth: 0 });
      const nested = ownedCommandPayloads.get(object);
      if (nested) return Object.freeze({ value: nested.snapshot, nodes: nested.nodes, depth: nested.depth });
      throw securityError(`${label} must be primitive, a mounted capability, or another runtime-created payload.`);
    };
    const recordOwnedPayload = (snapshot: object, nodes: number, depth: number): object => {
      if (nodes > 10_000) throw securityError("Command payload exceeds the command payload node limit.");
      if (depth > 64) throw securityError("Command payload exceeds the command payload depth limit.");
      ownedCommandPayloads.set(snapshot, Object.freeze({ snapshot, nodes, depth }));
      return snapshot;
    };
    const createOwnedPayload = (...fields: readonly unknown[]): Readonly<Record<string, unknown>> => {
      if (fields.length % 2 !== 0 || fields.length > 1_024) {
        throw securityError("Runtime-created command payloads require at most 512 string/value pairs.");
      }
      const output: Record<string, unknown> = {};
      let nodes = 1;
      let nestedDepth = 0;
      for (let index = 0; index < fields.length; index += 2) {
        const key = fields[index];
        if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/u.test(key) || Object.prototype.hasOwnProperty.call(output, key)) {
          throw securityError("Runtime-created command payloads require unique bounded identifier keys.");
        }
        const entry = payloadValue(fields[index + 1], `Command payload.${key}`);
        nodes += entry.nodes;
        nestedDepth = Math.max(nestedDepth, entry.depth);
        if (nodes > 10_000) throw securityError("Command payload exceeds the command payload node limit.");
        Object.defineProperty(output, key, { value: entry.value, enumerable: true, writable: false, configurable: false });
      }
      return recordOwnedPayload(Object.freeze(output), nodes, nestedDepth + 1) as Readonly<Record<string, unknown>>;
    };
    const createOwnedPayloadArray = (...values: readonly unknown[]): readonly unknown[] => {
      if (values.length > 9_999) throw securityError("Runtime-created command payload arrays must have a bounded length.");
      const output: unknown[] = [];
      let nodes = 1;
      let nestedDepth = 0;
      for (let index = 0; index < values.length; index += 1) {
        const entry = payloadValue(values[index], `Command payload[${index}]`);
        nodes += entry.nodes;
        nestedDepth = Math.max(nestedDepth, entry.depth);
        if (nodes > 10_000) throw securityError("Command payload exceeds the command payload node limit.");
        output.push(entry.value);
      }
      return recordOwnedPayload(Object.freeze(output), nodes, nestedDepth + 1) as readonly unknown[];
    };
    const assertOwnedCommandPayload = (payload: unknown): unknown => {
      const owned = payload && typeof payload === "object" ? ownedCommandPayloads.get(payload) : undefined;
      const snapshot = owned?.snapshot ?? snapshotCommandValue(
        payload,
        "Command payload",
        new Map(),
        0,
        { count: 0 },
        (value) => documentResourceLeases.has(value),
        runtime.environment.isNativeProxy,
      );
      const visit = (value: unknown): void => {
        if (!value || typeof value !== "object") return;
        if (documentResourceLeases.has(value)) return;
        for (const [key, nested] of Object.entries(value)) {
          const child = nested;
          const field = child;
          if ((key === "appId" || key === "applicationId") && typeof child === "string" && child !== app.id) throw securityError("Application commands may not target another application.");
          if (key === "windowControllerId" && typeof child === "string" && child !== windowControllerId) throw securityError("Application commands may not target another window.");
          if (key === "documentId" && typeof child === "string") {
          const document = runtime.documents.getDocument(child);
          if (!document || document.applicationId !== app.id) throw securityError("Application commands may not target another document.");
          }
          visit(field);
        }
      };
      visit(snapshot);
      return snapshot;
    };
    const commandTarget = (commandId: string): string | null => commandResponder(commandId) ?? safeHostCommandResponders.get(commandId) ?? null;
    const commandAllowed = (commandId: string): boolean => commandTarget(commandId) !== null;
    const commandDeniedReason = "This command is not owned by the mounted application.";
    const snapshotCommandOptions = (options: CommandDispatchOptions | CommandValidationOptions | undefined): Readonly<Record<string, unknown> & { readonly signal?: AbortSignal; readonly acceptance?: SynWareCommandAcceptance }> => {
      if (options === undefined) return Object.freeze({});
      const snapshot = snapshotOwnDataObject(options, "Command options");
      if (snapshot.signal !== undefined && !(snapshot.signal instanceof AbortSignal)) throw securityError("Command options.signal must be an AbortSignal.");
      return Object.freeze({
        ...(snapshot.source === undefined ? {} : { source: snapshot.source }),
        ...(snapshot.correlationId === undefined ? {} : { correlationId: snapshot.correlationId }),
        ...(snapshot.generation === undefined ? {} : { generation: snapshot.generation }),
        ...(snapshot.signal === undefined ? {} : { signal: snapshot.signal }),
        ...(snapshot.acceptance === undefined ? {} : { acceptance: snapshot.acceptance }),
      }) as Readonly<Record<string, unknown> & { readonly signal?: AbortSignal; readonly acceptance?: SynWareCommandAcceptance }>;
    };
    const undoRegistrationLeaseForResponder = (responderId: string): UndoRegistrationLease => {
      const owner = runtime.responders.resolveChain(responderId).find((responder) => responder.undoOwner)?.undoOwner;
      if (owner?.kind === "document") {
        const document = runtime.documents.getDocument(owner.id);
        if (!document || document.applicationId !== app.id) {
          throw securityError("A mounted application command cannot acquire another document's undo history.");
        }
        // A document responder is writable only through the mount's owner
        // reference.  An observer may inspect a document, never attach a
        // registration capability to its history.
        requireOwnedDocumentReference(owner.id);
        return ensureMountedDocumentUndoLease(owner.id).registrationLease;
      }
      if (owner?.kind === "application" && owner.id !== app.id) {
        throw securityError("A mounted application command cannot acquire another application's undo history.");
      }
      return ensureApplicationUndoLease().registrationLease;
    };
    const scopedCommandOptions = <T extends CommandDispatchOptions | CommandValidationOptions>(commandId: string, options: T | undefined): T & { responderId: string; scopeToken: object; signal: AbortSignal; isLive: () => boolean; undoRegistrationLease: UndoRegistrationLease } => {
      const target = commandTarget(commandId);
      if (!target) throw securityError(commandDeniedReason);
      const snapshot = snapshotCommandOptions(options);
      const undoRegistrationLease = undoRegistrationLeaseForResponder(target);
      return {
        ...snapshot,
        responderId: target,
        scopeToken: commandScopeToken,
        signal: mergeSignals(runtime.signal, controller.signal, snapshot.signal as AbortSignal | undefined),
        isLive: () => {
          try { assertLive(); return true; } catch { return false; }
        },
        undoRegistrationLease,
      } as T & { responderId: string; scopeToken: object; signal: AbortSignal; isLive: () => boolean; undoRegistrationLease: UndoRegistrationLease };
    };
    const commands = frozen<SynWareCommandPort & Pick<AppCommandClient, "getPresentationGeneration">>({
      getPresentationGeneration() {
        assertLive();
        return Object.freeze({
          registryGeneration: runtime.commands.inspect().generation,
          responderGeneration: runtime.responders.generation,
        });
      },
      createPayload(...fields: readonly unknown[]) {
        assertLive();
        return createOwnedPayload(...fields);
      },
      createPayloadArray(...values: readonly unknown[]) {
        assertLive();
        return createOwnedPayloadArray(...values);
      },
      register(declaration: object) {
        assertLive();
        const snapshot = snapshotAppCommandDeclaration(declaration as SynWareCommandDeclaration<unknown, unknown>);
        if (!isSafeAppCommandId(snapshot.id)) throw securityError("This command is reserved for system-owned runtime services.");
        if (snapshot.responderId.trim().length === 0) throw securityError("Application commands require a responder owner.");
        const canonical = canonicalCommandDeclaration(
          snapshot,
          () => appRuntime,
          (value, label) => snapshotMountedCallbackValue(value, label, (candidate) => documentResourceLeases.has(candidate), runtime.environment.isNativeProxy),
          runtime.environment.isNativeProxy,
        );
        let active = true;
        const scopedRegistration: PendingCommandRegistration = {
          commandId: canonical.id,
          responderId: canonical.responderId,
          declaration: canonical as CommandDeclaration<unknown, unknown>,
          active,
          underlying: null,
          dispose() {
            if (!active) return false;
            active = false;
            scopedRegistration.active = false;
            pendingCommandRegistrations.delete(scopedRegistration);
            const removed = scopedRegistration.underlying?.dispose() ?? true;
            const current = ownedCommandResponders.get(canonical.id);
            current?.delete(canonical.responderId);
            if (current && current.size === 0) ownedCommandResponders.delete(canonical.id);
            commandRegistrations.delete(scopedRegistration);
            return removed;
          },
        };
        if (runtime.responders.get(snapshot.responderId)) {
          ownResponder(snapshot.responderId);
          attachCommandRegistration(scopedRegistration);
        } else {
          pendingCommandRegistrations.add(scopedRegistration);
        }
        commandRegistrations.add(scopedRegistration);
        return scopedRegistration;
      },
      async dispatch(commandId, payload, commandOptions) {
        assertLive();
        if (!commandAllowed(commandId)) return { status: "denied", commandId, responderId, reason: commandDeniedReason };
        const optionsSnapshot = snapshotCommandOptions(commandOptions);
        const acceptanceRecord = optionsSnapshot.acceptance
          ? mountedAcceptances.get(optionsSnapshot.acceptance as object)
          : undefined;
        // A one-shot acceptance already owns the detached payload snapshot
        // produced during prepare. Reuse it only for the exact original input
        // object; otherwise let the kernel reject the stale tuple.
        const payloadSnapshot = acceptanceRecord && Object.is(acceptanceRecord.originalPayload, payload)
          ? acceptanceRecord.payloadSnapshot
          : assertOwnedCommandPayload(payload);
        try {
          const { acceptance, ...rest } = optionsSnapshot;
          return await runtime.commands.dispatch(commandId, payloadSnapshot, {
            ...scopedCommandOptions(commandId, rest),
            ...(acceptance ? { acceptance: unwrapAcceptance(acceptance) } : {}),
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return { status: "cancelled", commandId, operationId: "", reason: "The mounted application command was cancelled." };
          }
          throw error;
        }
      },
      prepareDispatch(commandId, payload, commandOptions): ReturnType<AppCommandClient["prepareDispatch"]> {
        assertLive();
        if (!commandAllowed(commandId)) return { status: "denied", reason: commandDeniedReason };
        const payloadSnapshot = assertOwnedCommandPayload(payload);
        const optionsSnapshot = snapshotCommandOptions(commandOptions);
        const { acceptance, ...rest } = optionsSnapshot;
        const prepared = runtime.commands.prepareDispatch(commandId, payloadSnapshot, {
          ...scopedCommandOptions(commandId, rest),
          ...(acceptance ? { acceptance: unwrapAcceptance(acceptance) } : {}),
        });
        const expose = (result: Awaited<typeof prepared>) => result.status === "accepted"
          ? { ...result, acceptance: exposeAcceptance(result.acceptance, payload, payloadSnapshot) }
          : result;
        return prepared instanceof Promise ? prepared.then(expose) : expose(prepared);
      },
      async validate(commandId, payload, commandOptions) {
        try {
          assertLive();
          if (!commandAllowed(commandId)) return deniedCommandPresentation(commandId, commandDeniedReason);
          const payloadSnapshot = assertOwnedCommandPayload(payload);
          return await runtime.commands.validate(commandId, payloadSnapshot, scopedCommandOptions(commandId, commandOptions));
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return deniedCommandPresentation(commandId, "The mounted application command was cancelled.");
          throw error;
        }
      },
      async validateMany(requests, commandOptions) {
        const result = new Map<string, CommandPresentation>();
        let snapshots: readonly { readonly key: string; readonly commandId: string; readonly payload: unknown }[] = [];
        try {
          assertLive();
          const optionsSnapshot = snapshotCommandOptions(commandOptions);
          const keys = new Set<string>();
          requests.forEach((request, requestIndex) => {
            if (typeof request.key !== "string" || request.key.trim().length === 0) {
              throw new CommandValidationRequestError("empty-key", typeof request.key === "string" ? request.key : "", requestIndex);
            }
            if (keys.has(request.key)) throw new CommandValidationRequestError("duplicate-key", request.key, requestIndex);
            keys.add(request.key);
          });
          snapshots = requests.map((request) => {
            const value = snapshotOwnDataObject(request, "Command validation request");
            if (typeof value.key !== "string" || typeof value.commandId !== "string") throw securityError("Command validation requests require string keys and command IDs.");
            return Object.freeze({ key: value.key, commandId: value.commandId, payload: assertOwnedCommandPayload(value.payload) });
          });
          const allowed = snapshots.filter((request) => commandAllowed(request.commandId));
          for (const request of allowed) {
            const presentation = await runtime.commands.validate(request.commandId, request.payload, scopedCommandOptions(request.commandId, optionsSnapshot));
            result.set(request.key, projected(presentation));
          }
          for (const request of snapshots) {
            if (!result.has(request.key)) result.set(request.key, deniedCommandPresentation(request.commandId, commandDeniedReason));
          }
          return result;
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
          return new Map(snapshots.map((request) => [request.key, deniedCommandPresentation(request.commandId, "The mounted application command was cancelled.")]));
        }
      },
    });

    let colourTargetLease: object | null = null;
    let colourTargetId: string | null = null;
    let colourTargetEverActivated = false;
    let disconnectColourTarget: (() => void) | null = null;
    const colourPickerNamespace = `${app.id}:${runtime.environment.randomUUID()}`;
    const colourPickerIds = new Map<string, string>();
    const colourPickerReleases = new Set<() => void>();
    let colourPanelSource: ReturnType<SynCloudOSRuntime["colourPanel"]["getSnapshot"]> | null = null;
    let colourPanelSourceTargetId: string | null = null;
    // The shared panel outlives its target (a well on a page the user left):
    // the app that last held the target still sees it open, empty, and may
    // close it. A peer app's target ends that, and reveals nothing of it.
    let colourPanelLastOwner = false;
    let colourPanelSnapshot: ReturnType<SynCloudOSRuntime["colourPanel"]["getSnapshot"]> = projected(runtime.colourPanel.getSnapshot());
    const refreshColourPanel = () => {
      const next = runtime.colourPanel.getSnapshot();
      // The projection depends on which target this app holds as well as on
      // the source: a target switch lands its lease after the source publishes.
      if (next !== colourPanelSource || colourTargetId !== colourPanelSourceTargetId) {
        colourPanelSource = next;
        colourPanelSourceTargetId = colourTargetId;
        const ownTarget = colourTargetLease !== null && next.activeTargetId === colourTargetId;
        if (ownTarget) colourPanelLastOwner = true;
        else if (next.activeTargetId !== null) colourPanelLastOwner = false;
        const heldEmpty = next.activeTargetId === null && colourPanelLastOwner;
        const ownPickers = next.pickers
          .filter((picker) => [...colourPickerIds.values()].includes(picker.id))
          .map((picker) => Object.freeze({ ...picker, id: [...colourPickerIds.entries()].find(([, globalId]) => globalId === picker.id)?.[0] ?? picker.id }));
        const activePickerId = next.activePickerId
          ? [...colourPickerIds.entries()].find(([, globalId]) => globalId === next.activePickerId)?.[0] ?? null
          : null;
        colourPanelSnapshot = projected({
          ...next,
          open: ownTarget || heldEmpty ? next.open : false,
          activeTargetId: ownTarget ? next.activeTargetId : null,
          activePickerId,
          currentCSS: ownTarget || heldEmpty ? next.currentCSS : null,
          previousCSS: ownTarget || heldEmpty ? next.previousCSS : null,
          pickers: ownPickers,
        });
      }
      return colourPanelSnapshot;
    };
    // Ownership follows every publication, not only this app's reads, so a
    // peer's target that came and went between reads still ends it.
    cleanupOnAbort(runtime.colourPanel.subscribe(() => {
      const next = runtime.colourPanel.getSnapshot();
      if (colourTargetLease !== null && next.activeTargetId === colourTargetId) colourPanelLastOwner = true;
      else if (next.activeTargetId !== null) colourPanelLastOwner = false;
    }));
    const requireColourLease = () => {
      assertLive();
      if (!colourTargetLease) throw securityError("The mounted application has no active colour-panel target lease.");
      return colourTargetLease;
    };
    /** The panel with no target, held by this app (it had the last target, or
     * the panel shows no colour at all): usable as a plain colour chooser
     * without a lease. A peer's leftover colour stays the peer's. */
    const emptyColourPanel = () => {
      assertLive();
      const current = runtime.colourPanel.getSnapshot();
      if (colourTargetLease || current.activeTargetId !== null) return false;
      return colourPanelLastOwner || current.currentCSS === null;
    };
    /** The lease for a mutation, or none for the empty panel, which the app
     * then holds until a target (its own or a peer's) takes the panel. */
    const colourAuthority = () => {
      if (!emptyColourPanel()) return requireColourLease();
      colourPanelLastOwner = true;
      colourPanelSource = null;
      return undefined;
    };
    cleanupOnAbort(() => {
      disconnectColourTarget?.();
      disconnectColourTarget = null;
      colourTargetLease = null;
      colourTargetId = null;
      for (const release of colourPickerReleases) release();
      colourPickerReleases.clear();
      colourPickerIds.clear();
    });
    const colourPanel: SynWareColourPanelPort = frozen<SynWareColourPanelPort>({
      ownerToken: runtime.colourPanel.ownerToken,
      // React may ask an outgoing external-store consumer for one final
      // presentation snapshot after its mount capability has been revoked.
      // These projections expose only this app's target and picker IDs, so
      // retaining read access cannot revive a mutation authority or reveal a
      // peer application's active colour state.
      getSnapshot() { return refreshColourPanel(); },
      getPickers() { return refreshColourPanel().pickers; },
      subscribe(listener) { assertLive(); return cleanupOnAbort(runtime.colourPanel.subscribe(() => { if (!signal.aborted) listener(); })); },
      registerPicker(descriptor) {
        assertLive();
        if (colourPickerIds.has(descriptor.id)) throw securityError("This colour picker is already registered by the mounted application.");
        const globalId = `${colourPickerNamespace}:${descriptor.id}`;
        const removeGlobal = runtime.colourPanel.registerPicker({ ...descriptor, id: globalId });
        colourPickerIds.set(descriptor.id, globalId);
        let live = true;
        const remove = () => {
          if (!live) return;
          live = false;
          colourPickerIds.delete(descriptor.id);
          colourPickerReleases.delete(remove);
          removeGlobal();
        };
        colourPickerReleases.add(remove);
        return remove;
      },
      activateTarget(target) {
        ownResponder(target.responderId);
        disconnectColourTarget?.();
        const activateTargetWithLease = runtime.colourPanel.activateTargetWithLease;
        if (!activateTargetWithLease) throw securityError("The mounted colour-panel target lease is unavailable.");
        const connection = activateTargetWithLease(target);
        colourTargetLease = connection.lease;
        colourTargetId = target.id;
        colourTargetEverActivated = true;
        disconnectColourTarget = connection.disconnect;
        return () => {
          connection.disconnect();
          if (disconnectColourTarget === connection.disconnect) disconnectColourTarget = null;
          if (colourTargetLease === connection.lease) {
            colourTargetLease = null;
            colourTargetId = null;
          }
        };
      },
      // With no target anywhere, the empty panel is nobody's: any app may show
      // it (Show Colours) or close it. Otherwise only the target's lease may.
      open() {
        runTestControlSync("panels", "panel.open", () => runtime.colourPanel.open(colourAuthority()));
      },
      close(reason) {
        runTestControlSync("panels", "panel.close", () => runtime.colourPanel.close(reason, colourAuthority()));
      },
      choosePicker(id) {
        const globalId = colourPickerIds.get(id);
        if (!globalId) throw securityError("The colour picker is not owned by this mounted application.");
        runtime.colourPanel.choosePicker(globalId, colourAuthority());
      },
      preview(css, reason) { runtime.colourPanel.preview(css, reason, colourAuthority()); },
      commit(css, reason) { runtime.colourPanel.commit(css, reason, colourAuthority()); },
      cancel(reason) { runtime.colourPanel.cancel(reason, colourAuthority()); },
      // Palette/recent metadata is not a mutation of another app's active
      // target, so providers may hydrate it before a colour well acquires its
      // target lease. Target preview/commit/cancel/open/close remain leased.
      addRecent(css) { assertLive(); runtime.colourPanel.addRecent(css, colourTargetEverActivated ? colourAuthority() : undefined); },
      setSwatches(css) { assertLive(); runtime.colourPanel.setSwatches(css, colourTargetEverActivated ? colourAuthority() : undefined); },
    });

    const trackingRegistrations = new Set<{ readonly raw: ReturnType<SynCloudOSRuntime["tracking"]["register"]>; readonly wrapper: object }>();
    cleanupOnAbort(() => {
      for (const entry of trackingRegistrations) {
        try { entry.raw.dispose("mounted application capability revoked"); } catch { /* teardown remains idempotent */ }
      }
      trackingRegistrations.clear();
    });
    const tracking: SynWareTrackingPort = frozen<SynWareTrackingPort>({
      register(input) {
        assertLive();
        const raw = runtime.tracking.register({
          ...input,
          ownerId: `${app.id}:${input.ownerId}`,
          ...(windowControllerId === undefined ? {} : { windowControllerId }),
        });
        let live = true;
        let entry!: { readonly raw: typeof raw; readonly wrapper: object };
        const wrapper = Object.freeze({
          id: raw.id,
          get disposed() { return !live || raw.disposed; },
          dispose(reason?: string) {
            if (!live) return;
            live = false;
            trackingRegistrations.delete(entry);
            raw.dispose(reason);
          },
        });
        entry = { raw, wrapper };
        trackingRegistrations.add(entry);
        return wrapper as ReturnType<SynWareTrackingPort["register"]>;
      },
      diagnostics() {
        assertLive();
        const activeRegionCount = [...trackingRegistrations]
          .filter(({ wrapper }) => !(wrapper as { readonly disposed: boolean }).disposed)
          .length;
        return projected({ regionCount: activeRegionCount });
      },
    });

    const animationOwners = new Set<object>();
    const rawAnimationOwners = new WeakMap<object, RuntimeAnimationOwnerLease>();
    const animationHandles = new Set<AFXAnimationHandle>();
    cleanupOnAbort(() => {
      for (const handle of animationHandles) {
        try { handle.cancel("mounted application capability revoked"); } catch { /* animation teardown remains idempotent */ }
      }
      animationHandles.clear();
      for (const owner of animationOwners) {
        try { (owner as { release?: (reason?: string) => void }).release?.("mounted application capability revoked"); }
        catch { /* lease release is idempotent and teardown must continue */ }
      }
      animationOwners.clear();
    });
    const animations: SynWareAnimationPort = frozen<SynWareAnimationPort>({
      acquireOwner(owner) {
        assertLive();
        if (owner.appId !== app.id || (windowControllerId !== undefined && owner.windowControllerId !== windowControllerId)) {
          throw securityError("Animation ownership must remain inside the mounted application.");
        }
        const rawLease = runtime.animations.acquireOwner(owner as RuntimeAnimationOwner);
        let live = true;
        const lease = Object.freeze({
          appId: rawLease.appId,
          ...(rawLease.windowControllerId === undefined ? {} : { windowControllerId: rawLease.windowControllerId }),
          viewId: rawLease.viewId,
          epoch: rawLease.epoch,
          release(reason?: string) {
            if (!live) return;
            live = false;
            animationOwners.delete(lease);
            rawAnimationOwners.delete(lease);
            rawLease.release(reason);
          },
        });
        animationOwners.add(lease);
        rawAnimationOwners.set(lease, rawLease);
        return lease as ReturnType<SynWareAnimationPort["acquireOwner"]>;
      },
      animate(target, definition, owner, generation) {
        assertLive();
        if (!animationOwners.has(owner) || !rawAnimationOwners.has(owner)) throw securityError("Animation lease was not issued to this mounted application.");
        const raw = runTestControlSync("animation", "animation.animate", () => (
          runtime.animations.animate(target, definition, rawAnimationOwners.get(owner)!, generation)
        ));
        let live = true;
        let wrapped!: AFXAnimationHandle;
        wrapped = Object.freeze({
          get id() { return raw.id; },
          get finished() { return raw.finished; },
          get progress() { return raw.progress; },
          get state() { return raw.state; },
          cancel(reason?: string) {
            if (!live) return;
            live = false;
            animationHandles.delete(wrapped);
            runTestControlSync("animation", "animation.cancel", () => raw.cancel(reason));
          },
          seek(seconds: number) {
            if (!live || signal.aborted) throw securityError("Animation handle is no longer live for this application scope.");
            raw.seek(seconds);
          },
          pause() {
            if (!live || signal.aborted) throw securityError("Animation handle is no longer live for this application scope.");
            raw.pause();
          },
          resume() {
            if (!live || signal.aborted) throw securityError("Animation handle is no longer live for this application scope.");
            raw.resume();
          },
        }) as AFXAnimationHandle;
        animationHandles.add(wrapped);
        void raw.finished.finally(() => { live = false; animationHandles.delete(wrapped); }).catch(() => undefined);
        return wrapped;
      },
      diagnostics() {
        assertLive();
        const activeCount = [...animationHandles].filter((handle) => handle.state === "running").length;
        const pausedCount = [...animationHandles].filter((handle) => handle.state === "paused").length;
        return projected({ activeCount, pausedCount });
      },
    });

    const imagePixelReaders = new WeakMap<object, (callerSignal?: AbortSignal) => Promise<GFXImage>>();
    const imageExporters = new WeakMap<object, (format: "image/png" | "image/webp", callerSignal?: AbortSignal) => Promise<Uint8Array>>();
    const imageResources = new Set<RuntimeImageResource>();
    const imageOperations = new Set<object>();
    cleanupOnAbort(() => {
      for (const resource of imageResources) {
        try { resource.release(); } catch { /* image release is idempotent */ }
      }
      imageResources.clear();
    });
    const images: SynWareImagePort = frozen<SynWareImagePort>({
      createGraphicsIdentifierIssuer() {
        assertLive();
        return createMountedGFXIdentifierIssuer(runtime.images.createGraphicsIdentifierIssuer(), assertLive);
      },
      load(request) {
        assertLive();
        if (request.source.kind === "document-resource") {
          ownedWorkspaceDocument(request.source.documentId);
          if (request.subject?.documentId !== request.source.documentId) {
            throw securityError("Document image loads require the mounted document as their policy subject.");
          }
          const descriptor = request.source.descriptor;
          const lease = descriptor && typeof descriptor === "object" ? documentResourceLeases.get(descriptor) : undefined;
          if (!lease || lease.documentId !== request.source.documentId || runtime.documents.getDocument(request.source.documentId) !== lease.document || lease.descriptor !== descriptor ||
            !runtime.documentResources.isActive(request.source.documentId, descriptor)) {
            throw securityError("Document image loads require an opaque live mounted resource lease.");
          }
        }
        const operation = Object.freeze({});
        imageOperations.add(operation);
        const subject = Object.freeze({
          appId: app.id,
          capability: request.subject?.capability ?? "image.decode",
          ...(windowControllerId === undefined ? {} : { windowControllerId }),
          ...(request.subject?.documentId === undefined ? {} : { documentId: request.subject.documentId }),
        });
        let raw: RuntimeImageResource;
        try {
          raw = runTestControlSync("image", "image.decode", () => runtime.images.load({
            source: request.source,
            subject,
            ...(request.accessibleLabel === undefined ? {} : { accessibleLabel: request.accessibleLabel }),
            ...(request.renderingMode === undefined ? {} : { renderingMode: request.renderingMode }),
            ...(request.tintColour === undefined ? {} : { tintColour: request.tintColour }),
            ...(request.capInsets === undefined ? {} : { capInsets: request.capInsets }),
            ...(request.resizingMode === undefined ? {} : { resizingMode: request.resizingMode }),
          } satisfies RuntimeImageLoadRequest));
        } catch (error) {
          imageOperations.delete(operation);
          throw error;
        }
        void raw.ready.finally(() => {
          imageOperations.delete(operation);
          if (signal.aborted) {
            try { raw.release(); } catch { /* late image completion is already revoked */ }
          }
        }).catch(() => undefined);
        let live = true;
        const resource = Object.freeze({
          get state() { return raw.state; },
          get revision() { return raw.revision; },
          get src() { return raw.src; },
          get intrinsicSize() { return raw.intrinsicSize; },
          get density() { return raw.density; },
          get sourceOrientation() { return raw.sourceOrientation; },
          get sourceICCProfile() { return raw.sourceICCProfile; },
          accessibleLabel: raw.accessibleLabel,
          renderingMode: raw.renderingMode,
          tintColour: raw.tintColour,
          capInsets: raw.capInsets,
          resizingMode: raw.resizingMode,
          ready: raw.ready,
          subscribe(listener: () => void) { return raw.subscribe(listener); },
          release() {
            if (!live) return;
            live = false;
            imageResources.delete(resource);
            raw.release();
          },
        }) satisfies RuntimeImageResource;
        imagePixelReaders.set(resource, async callerSignal => {
          assertLive();
          if (!live) throw securityError("Image resource is released.");
          const pixels = await runtime.images.readPixels(raw, mergeSignals(runtime.signal, signal, callerSignal));
          assertLive();
          if (!live) throw securityError("Image resource was released during pixel access.");
          return pixels;
        });
        imageExporters.set(resource, async (format, callerSignal) => {
          assertLive();
          if (!live) throw securityError("Image resource is released.");
          const bytes = await runtime.images.export(raw, format, mergeSignals(runtime.signal, signal, callerSignal));
          assertLive();
          if (!live) throw securityError("Image resource was released during export.");
          return bytes;
        });
        imageResources.add(resource);
        return resource;
      },
      diagnostics() { assertLive(); return projected({ activeOperationCount: imageOperations.size, activeReferenceCount: imageResources.size }); },
    });

    type TextAttachmentPixels = Readonly<{
      image: GFXImage;
      inline: number;
      block: number;
      bytes: number;
      resourceId: string;
    }>;
    type PendingTextAttachment = {
      readonly key: string;
      readonly resourceId: string;
      readonly controller: AbortController;
      promise: Promise<TextAttachmentPixels>;
      waiters: number;
      reservedBytes: number;
    };
    const textAttachmentCache = new Map<string, TextAttachmentPixels>();
    const pendingTextAttachments = new Map<string, PendingTextAttachment>();
    const textAttachmentListeners = new Set<(change: TFXRunDelegateReadinessChange) => void>();
    let textAttachmentCacheBytes = 0;
    let textAttachmentReservedBytes = 0;
    let textAttachmentGeneration = 0;
    const publishTextAttachment = (resourceId: string, state: TFXRunDelegateReadinessChange["state"]) => {
      textAttachmentGeneration += 1;
      const change = Object.freeze({ resourceId, generation: textAttachmentGeneration, state });
      for (const listener of [...textAttachmentListeners]) {
        try { listener(change); } catch { /* readiness publication remains authoritative */ }
      }
    };
    const removeTextAttachmentCache = (key: string) => {
      const cached = textAttachmentCache.get(key);
      if (!cached || !textAttachmentCache.delete(key)) return false;
      textAttachmentCacheBytes = Math.max(0, textAttachmentCacheBytes - cached.bytes);
      return true;
    };
    const cacheTextAttachment = (key: string, value: TextAttachmentPixels) => {
      removeTextAttachmentCache(key);
      while (textAttachmentCache.size >= 64 || textAttachmentCacheBytes + textAttachmentReservedBytes + value.bytes > 32 * 1024 * 1024) {
        const oldest = textAttachmentCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        removeTextAttachmentCache(oldest);
      }
      textAttachmentCache.set(key, value);
      textAttachmentCacheBytes += value.bytes;
    };
    const releaseTextAttachmentReservation = (pending: PendingTextAttachment) => {
      if (pending.reservedBytes === 0) return;
      textAttachmentReservedBytes = Math.max(0, textAttachmentReservedBytes - pending.reservedBytes);
      pending.reservedBytes = 0;
    };
    const invalidateTextAttachment = (descriptor: DocumentResourceDescriptor) => {
      const key = documentResourceReferenceKey(descriptor);
      const pending = pendingTextAttachments.get(key);
      pending?.controller.abort(new DOMException("Text attachment resource was released.", "AbortError"));
      const changed = removeTextAttachmentCache(key) || Boolean(pending);
      if (changed) publishTextAttachment(descriptor.resourceId, "released");
    };
    const unsubscribeTextAttachmentInvalidation = runtime.documentResources.subscribeInvalidation(({ descriptor }) => invalidateTextAttachment(descriptor));
    // Decoded attachment pixels are per-mount cache-only residency; pending
    // decodes hold active reservations. Under pressure the least recently
    // cached attachments are dropped exactly as capacity eviction does; a
    // later layout re-requests them.
    const unregisterTextAttachmentAccounting = runtime.resources.register({
      id: `mount:${app.id}:text-attachments`,
      kind: "text-attachment",
      owner: app.id,
      *measure() {
        for (const cached of textAttachmentCache.values()) yield { key: cached, bytes: cached.bytes, state: "cache" as const };
        for (const pending of pendingTextAttachments.values())
          if (pending.reservedBytes > 0) yield { key: pending, bytes: pending.reservedBytes, state: "active" as const };
      },
      reclaim(request) {
        if (request.level !== "cache") return 0;
        let released = 0;
        while (released < request.targetBytes) {
          const oldest = textAttachmentCache.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          released += textAttachmentCache.get(oldest)?.bytes ?? 0;
          removeTextAttachmentCache(oldest);
        }
        return released;
      },
    });
    cleanupOnAbort(() => {
      unregisterTextAttachmentAccounting();
      unsubscribeTextAttachmentInvalidation();
      for (const pending of [...pendingTextAttachments.values()]) pending.controller.abort(new DOMException("Text attachment owner was released.", "AbortError"));
      textAttachmentCache.clear();
      textAttachmentCacheBytes = 0;
      textAttachmentListeners.clear();
    });

    const inspectTextAttachmentRequest = (request: TFXRunDelegateRequest) => {
      const raw = snapshotOwnDataObject(request, "Text attachment request");
      const allowed = new Set(["attachmentKind", "source", "accessibilityLabel", "intrinsicSize"]);
      if (Object.keys(raw).some((key) => !allowed.has(key)) || raw.attachmentKind !== "image") throw securityError("Only image text attachments are supported.");
      if (typeof raw.accessibilityLabel !== "string" || !raw.accessibilityLabel.trim() || raw.accessibilityLabel.length > 4096) throw securityError("A bounded text attachment accessibility label is required.");
      const source = snapshotOwnDataObject(raw.source, "Text attachment source");
      const sourceKeys = new Set(["kind", "documentId", "resourceId", "leaseId", "generation", "mimeType", "byteLength"]);
      if (Object.keys(source).length !== sourceKeys.size || Object.keys(source).some((key) => !sourceKeys.has(key)) || source.kind !== "document-resource") {
        throw securityError("Text attachment drawing requires a live document resource.");
      }
      for (const key of ["documentId", "resourceId", "leaseId", "mimeType"] as const) {
        if (typeof source[key] !== "string" || !(source[key] as string).length || (source[key] as string).length > 256) throw securityError("Text attachment resource reference is invalid.");
      }
      if (!Number.isSafeInteger(source.generation) || (source.generation as number) < 0 || !Number.isSafeInteger(source.byteLength) || (source.byteLength as number) < 0 || (source.byteLength as number) > 8 * 1024 * 1024) {
        throw securityError("Text attachment resource bounds are invalid.");
      }
      const descriptor = Object.freeze({
        kind: "document-resource" as const,
        documentId: source.documentId as string,
        resourceId: source.resourceId as string,
        leaseId: source.leaseId as string,
        generation: source.generation as number,
        mimeType: source.mimeType as string,
        byteLength: source.byteLength as number,
      });
      let intrinsic: { readonly inline: number; readonly block: number } | undefined;
      if (raw.intrinsicSize !== undefined) {
        const size = snapshotOwnDataObject(raw.intrinsicSize, "Text attachment intrinsic size");
        if (Object.keys(size).length !== 2 || typeof size.inline !== "number" || !Number.isFinite(size.inline) || size.inline <= 0 || size.inline > 32_768 || typeof size.block !== "number" || !Number.isFinite(size.block) || size.block <= 0 || size.block > 32_768) {
          throw securityError("Text attachment intrinsic size is invalid.");
        }
        intrinsic = Object.freeze({ inline: size.inline, block: size.block });
      }
      return Object.freeze({ descriptor, intrinsic, accessibilityLabel: raw.accessibilityLabel as string });
    };

    const resolveTextAttachmentPixels = (descriptor: DocumentResourceDescriptor): PendingTextAttachment => {
      const key = documentResourceReferenceKey(descriptor);
      const existing = pendingTextAttachments.get(key);
      if (existing) return existing;
      if (pendingTextAttachments.size >= 4) throw new RangeError("The mounted text attachment decode limit was reached.");
      const lease = documentResourceLeasesByReference.get(key);
      if (!lease || lease.documentId !== descriptor.documentId || runtime.documents.getDocument(descriptor.documentId) !== lease.document) {
        throw securityError("Text attachment resource is not owned by this mounted application.");
      }
      const reservation = 8 * 1024 * 1024;
      while (textAttachmentCacheBytes + textAttachmentReservedBytes + reservation > 32 * 1024 * 1024) {
        const oldest = textAttachmentCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        removeTextAttachmentCache(oldest);
      }
      if (textAttachmentCacheBytes + textAttachmentReservedBytes + reservation > 32 * 1024 * 1024) {
        throw new RangeError("The mounted text attachment pixel budget was reached.");
      }
      textAttachmentReservedBytes += reservation;
      const pending: PendingTextAttachment = { key, resourceId: descriptor.resourceId, controller: new AbortController(), promise: Promise.resolve(null as never), waiters: 0, reservedBytes: reservation };
      pendingTextAttachments.set(key, pending);
      pending.promise = Promise.resolve().then(async () => {
        const operationSignal = mergeSignals(runtime.signal, signal, pending.controller.signal);
        let raw: ReturnType<typeof runtime.images.load> | null = null;
        try {
          operationSignal.throwIfAborted();
          raw = runtime.images.load({
            source: Object.freeze({ kind: "document-resource", documentId: descriptor.documentId, descriptor: lease.descriptor }),
            subject: Object.freeze({ appId: app.id, capability: "image.decode", documentId: descriptor.documentId, ...(windowControllerId === undefined ? {} : { windowControllerId }) }),
            accessibleLabel: "Text attachment",
          });
          await awaitMounted(raw.ready, operationSignal, assertLive);
          operationSignal.throwIfAborted();
          const size = raw.intrinsicSize;
          const density = raw.density;
          if (!size || typeof density !== "number" || !Number.isFinite(density) || density <= 0 || size.width * size.height * 4 > 8 * 1024 * 1024) {
            throw new RangeError("Decoded text attachment exceeds the 8 MiB pixel limit.");
          }
          const image = await runtime.images.readPixels(raw, operationSignal);
          operationSignal.throwIfAborted();
          const bytes = image.bytesPerRow * image.height;
          if (!Number.isSafeInteger(bytes) || bytes > 8 * 1024 * 1024) throw new RangeError("Decoded text attachment exceeds the 8 MiB pixel limit.");
          if (documentResourceLeasesByReference.get(key) !== lease) throw new DOMException("Text attachment resource became stale.", "AbortError");
          const value = Object.freeze({ image, inline: size.width / density, block: size.height / density, bytes, resourceId: descriptor.resourceId });
          releaseTextAttachmentReservation(pending);
          cacheTextAttachment(key, value);
          publishTextAttachment(descriptor.resourceId, "ready");
          operationSignal.throwIfAborted();
          if (documentResourceLeasesByReference.get(key) !== lease) throw new DOMException("Text attachment resource became stale.", "AbortError");
          return value;
        } finally {
          raw?.release();
          if (raw) await runtime.images.whenActivationSettled(raw);
          releaseTextAttachmentReservation(pending);
        }
      });
      void pending.promise.then(
        () => { if (pendingTextAttachments.get(key) === pending) pendingTextAttachments.delete(key); },
        () => { if (pendingTextAttachments.get(key) === pending) pendingTextAttachments.delete(key); },
      );
      return pending;
    };

    const resolveTextRunDelegate: SynWareTextLayoutPort["resolveRunDelegate"] = async (request, callerSignal) => {
      assertLive();
      const inspected = inspectTextAttachmentRequest(request);
      const key = documentResourceReferenceKey(inspected.descriptor);
      const waiterSignal = mergeSignals(runtime.signal, signal, callerSignal);
      waiterSignal.throwIfAborted();
      let pixels = textAttachmentCache.get(key);
      if (pixels) {
        textAttachmentCache.delete(key);
        textAttachmentCache.set(key, pixels);
      } else {
        const pending = resolveTextAttachmentPixels(inspected.descriptor);
        pending.waiters += 1;
        try {
          pixels = await awaitMounted(pending.promise, waiterSignal, assertLive);
        } finally {
          pending.waiters = Math.max(0, pending.waiters - 1);
          if (pending.waiters === 0 && pendingTextAttachments.get(key) === pending) pending.controller.abort(new DOMException("Text attachment resolution has no remaining callers.", "AbortError"));
        }
      }
      assertLive();
      waiterSignal.throwIfAborted();
      const lease = documentResourceLeasesByReference.get(key);
      if (!lease || lease.documentId !== inspected.descriptor.documentId || runtime.documents.getDocument(inspected.descriptor.documentId) !== lease.document) {
        throw new DOMException("Text attachment resource became stale.", "AbortError");
      }
      const metrics = inspected.intrinsic ?? Object.freeze({ inline: pixels.inline, block: pixels.block });
      return new TFXRunDelegate({ width: metrics.inline, ascent: metrics.block, descent: 0, attachment: { image: pixels.image, accessibilityLabel: inspected.accessibilityLabel } });
    };

    const soundIds = new Set<string>();
    // Keep retired IDs distinguishable from arbitrary caller input so a
    // cleanup callback that runs after mount revocation can release its own
    // handle idempotently without reopening the authority. Unknown IDs still
    // fail closed while the mount is live.
    const issuedSoundIds = new Set<string>();
    const soundHandles = new Map<string, RuntimeAudioHandle>();
    const pendingSoundLoads = new Set<object>();
    const requireSound = (handleId: string) => {
      assertLive();
      if (!soundIds.has(handleId)) throw securityError("Sound handles are owned by the issuing mounted application.");
    };
    const audio: SynWareAudioPort = frozen<SynWareAudioPort>({
      async load(request, callerSignal) {
        assertLive();
        const pending = Object.freeze({});
        pendingSoundLoads.add(pending);
        try {
          const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
          const handle = await runTestControl("audio", "audio.load", operationSignal, () => runtime.audio.load({
            source: request.source,
            ownerId: request.ownerId,
            appId: app.id,
            ...(windowControllerId === undefined ? {} : { windowControllerId }),
            ...(request.loop === undefined ? {} : { loop: request.loop }),
            ...(request.volume === undefined ? {} : { volume: request.volume }),
          } satisfies RuntimeAudioLoadRequest, operationSignal));
          if (signal.aborted) {
            runtime.audio.release(handle.id, "mounted application capability revoked");
            throw abortError(signal.reason);
          }
          soundIds.add(handle.id);
          issuedSoundIds.add(handle.id);
          soundHandles.set(handle.id, handle);
          return handle;
        } finally {
          pendingSoundLoads.delete(pending);
        }
      },
      activation(handleId) { requireSound(handleId); return runtime.audio.activation(handleId); },
      play(handleId, activation) {
        requireSound(handleId);
        return runTestControl("audio", "audio.play", signal, () => runtime.audio.play(handleId, activation));
      },
      pause(handleId) { requireSound(handleId); return runtime.audio.pause(handleId); },
      stop(handleId) { requireSound(handleId); return runtime.audio.stop(handleId); },
      setLoop(handleId, loop) { requireSound(handleId); runtime.audio.setLoop(handleId, loop); },
      setVolume(handleId, volume) { requireSound(handleId); runtime.audio.setVolume(handleId, volume); },
      setRate(handleId, rate) { requireSound(handleId); runtime.audio.setRate(handleId, rate); },
      setCurrentTime(handleId, time) { requireSound(handleId); runtime.audio.setCurrentTime(handleId, time); },
      release(handleId, reason) {
        if (!soundIds.has(handleId)) {
          if (issuedSoundIds.has(handleId)) return false;
          assertLive();
          throw securityError("Sound handles are owned by the issuing mounted application.");
        }
        soundIds.delete(handleId);
        soundHandles.delete(handleId);
        return runtime.audio.release(handleId, reason);
      },
      suspend() { assertLive(); runtime.audio.suspendOwner(app.id); },
      resume() { assertLive(); runtime.audio.resumeOwner(app.id); },
      diagnostics() {
        assertLive();
        const playingCount = [...soundHandles.values()].filter((handle) => handle.state === "playing").length;
        return projected({ handleCount: soundHandles.size, playingCount, pendingLoadCount: pendingSoundLoads.size });
      },
    });

    const focusHandles = new Set<FocusScopeHandle>();
    const focusRestorations = new Map<FocusScopeHandle, string | null>();
    const focusScopeIds = new Set<string>();
    let focusRestorationLive = true;
    cleanupOnAbort(() => {
      focusRestorationLive = false;
      for (const handle of focusHandles) {
        try { handle.close({ restore: false }); } catch { /* stale focus teardown is idempotent */ }
        focusRestorations.delete(handle);
      }
      focusHandles.clear();
      focusScopeIds.clear();
    });

    let activeTextLayoutOperations = 0;
    let activeTextMeasurementNodes = 0;
    let lastTextLayoutWork = { segmentCount: 0, measurementCount: 0, graphemeAdvanceCount: 0, lineCount: 0 };
    const runTextLayout = async <T>(operation: Promise<T>, operationSignal: AbortSignal): Promise<T> => {
      activeTextLayoutOperations += 1;
      activeTextMeasurementNodes += 1;
      try {
        return await awaitMounted(operation, operationSignal, assertLive);
      } finally {
        activeTextLayoutOperations = Math.max(0, activeTextLayoutOperations - 1);
        activeTextMeasurementNodes = Math.max(0, activeTextMeasurementNodes - 1);
      }
    };
    const createWebContentSession: SynWareWebContentPort["createSession"] = async (request, callerSignal) => {
        assertLive();
        const operationSignal = mergeSignals(runtime.signal, controller.signal, callerSignal);
        return await runTestControl("webContent", "web-content.load", operationSignal, () => (
          transferMount.scope.webContent.createSession(request, operationSignal)
        ));
      };
    const webContent: SynWareWebContentPort = Object.freeze({
      createSession: createWebContentSession,
      diagnostics() {
        const diagnostics = transferMount.scope.webContent.diagnostics();
        return projected({ sessionCount: diagnostics.sessionCount, pendingOperationCount: diagnostics.pendingOperationCount });
      },
    });
    const drag = Object.freeze({
      manager: transferMount.scope.drag.manager,
      endpoint(endpointOptions?: { readonly responderId?: string }) {
        return runTestControlSync("drag", "drag.authorise", () => transferMount.scope.drag.endpoint(endpointOptions));
      },
    });
    const wrapPasteboard = (board: typeof transferMount.scope.pasteboards.system) => Object.freeze({
      name: board.name,
      context: board.context,
      get changeCount() { return board.changeCount; },
      snapshot(operationSignal?: AbortSignal) {
        assertLive();
        return runTestControl("clipboard", "clipboard.read", operationSignal, () => board.snapshot(operationSignal));
      },
      write(values: Parameters<typeof board.write>[0], operationSignal?: AbortSignal) {
        assertLive();
        return runTestControl("clipboard", "clipboard.write", operationSignal, () => board.write(values, operationSignal));
      },
      read(types: readonly string[], operationSignal?: AbortSignal) {
        assertLive();
        return runTestControl("clipboard", "clipboard.read", operationSignal, () => board.read(types, operationSignal));
      },
      readFirst(types: readonly string[], operationSignal?: AbortSignal) {
        assertLive();
        return runTestControl("clipboard", "clipboard.read", operationSignal, () => board.readFirst(types, operationSignal));
      },
      clear() {
        assertLive();
        return runTestControlSync("clipboard", "clipboard.write", () => board.clear());
      },
    });
    const pasteboards = Object.freeze({
      context: transferMount.scope.pasteboards.context,
      system: wrapPasteboard(transferMount.scope.pasteboards.system),
      drag: wrapPasteboard(transferMount.scope.pasteboards.drag),
      find: wrapPasteboard(transferMount.scope.pasteboards.find),
      named(name: Parameters<typeof transferMount.scope.pasteboards.named>[0]) {
        return wrapPasteboard(transferMount.scope.pasteboards.named(name));
      },
    });
    const terminalOperationsByService = new Map<string, ReturnType<typeof createMountedServiceTerminalOperations>>();
    const unavailableService = (message: string) => Object.freeze({
      available: false,
      client: null,
      denial: Object.freeze({ code: "unavailable" as const, message }),
    });
    const acquireService = <TClient,>(
      token: SynWareServiceToken<TClient>,
      required = false,
    ) => {
        assertLive();
        if (!isAuthenticSynWareServiceToken(token)) return unavailableService("SynWare services require an authentic runtime service token.");
        const { id, contractVersion } = token;
        const bundle = runtime.bundles.getBundle(app.id);
        const declaration = bundle?.synWareManifest;
        const service = declaration?.services?.find((candidate) => candidate.id === id);
        if (!declaration || !service) {
          return unavailableService(`Service \"${id}\" was not declared by this SynWare manifest.`);
        }
        const minimumVersion = strongerServiceVersion(service.minimumVersion, token.minimumVersion);
        if (minimumVersion === null) return unavailableService(`Service \"${id}\" received an invalid minimum version requirement.`);
        const decision = runTestControlSync("permissions", "permission.request", () => runTestControlSync("policy", "policy.evaluate", () => runtime.policy.authorise({
          action: "service.use",
          origin: "runtime",
          source: "SynWareServiceClient.acquire",
          app,
          bundlePermissions: [...(declaration.permissions ?? [])],
          context: {
            appId: app.id,
            serviceId: id,
            declared: true,
            required: service.required !== false || required,
            minimumVersion: minimumVersion ?? null,
          },
        })));
        if (!decision.allowed) {
          return Object.freeze({
            available: false,
            client: null,
            denial: Object.freeze({ code: "denied" as const, message: decision.reason }),
          });
        }
        let serviceTerminalOperations = terminalOperationsByService.get(id);
        if (!serviceTerminalOperations) {
          serviceTerminalOperations = createMountedServiceTerminalOperations({
            runtime, applicationId: app.id, serviceId: id, windowControllerId: windowControllerId ?? null,
            signal, assertLive, requireOwner: requireOwnedDocumentReference,
          });
          terminalOperationsByService.set(id, serviceTerminalOperations);
        }
        const resolved = runTestControlSync("services", "service.resolve", () => runtime.services.resolveAppClient<TClient>({
          appId: app.id,
          serviceId: id,
          permissions: declaration.permissions ?? [],
          ...(minimumVersion === undefined ? {} : { minimumVersion }),
          ...(contractVersion === undefined ? {} : { contractVersion }),
          signal,
          terminalOperations: serviceTerminalOperations,
        }));
        if (!resolved.available) {
          return Object.freeze({
            available: false,
            client: null,
            denial: Object.freeze({ code: resolved.denied ? "denied" as const : "unavailable" as const, message: resolved.reason ?? `Service \"${id}\" is unavailable.` }),
          });
        }
        return Object.freeze({ available: true, client: resolved.client, denial: null });
    };
    const services: SynWareServicePort = frozen<SynWareServicePort>({
      optional<TClient>(token: SynWareServiceToken<TClient>) {
        return acquireService(token);
      },
      require<TClient>(token: SynWareServiceToken<TClient>) {
        const resolved = acquireService(token, true);
        if (resolved.available && resolved.client) return resolved.client;
        throw new SynWareServiceAcquisitionError(
          isAuthenticSynWareServiceToken(token) ? token.id : "invalid-token",
          resolved.denial ?? Object.freeze({ code: "unavailable", message: "The required SynWare service is unavailable." }),
        );
      },
      subscribe(token: SynWareServiceToken<unknown>, listener: () => void) {
        assertLive();
        if (!isAuthenticSynWareServiceToken(token)) return () => undefined;
        const serviceId = token.id;
        const notifyService = (event: Readonly<{ payload?: unknown }>) => {
          if (signal.aborted) return;
          const payload = event.payload;
          const changedId = payload && typeof payload === "object" && "serviceId" in payload
            ? (payload as { readonly serviceId?: unknown }).serviceId
            : undefined;
          if (typeof changedId === "string" && changedId !== serviceId) return;
          listener();
        };
        const notifyPolicy = () => { if (!signal.aborted) listener(); };
        const unsubscribeAvailable = runtime.events.subscribe("service.available", notifyService);
        const unsubscribeUnavailable = runtime.events.subscribe("service.unavailable", notifyService);
        const unsubscribePolicyRegister = runtime.events.subscribe("policy.register", notifyPolicy);
        const unsubscribePolicyRemove = runtime.events.subscribe("policy.remove", notifyPolicy);
        const unsubscribePolicyMode = runtime.events.subscribe("policy.accessMode.changed", notifyPolicy);
        const unsubscribeIdentity = runtime.identity.session.subscribe(notifyPolicy);
        return cleanupOnAbort(() => {
          unsubscribeIdentity();
          unsubscribePolicyMode();
          unsubscribePolicyRemove();
          unsubscribePolicyRegister();
          unsubscribeUnavailable();
          unsubscribeAvailable();
        });
      },
    });
    function postNotification(request: UserNotificationRequest): Promise<UserNotificationPostResult>;
    function postNotification(request: SynCloudOSNotificationPostInput, options?: SynCloudOSNotificationPostOptions): SynCloudOSNotification | null;
    function postNotification(request: UserNotificationRequest | SynCloudOSNotificationPostInput, options?: SynCloudOSNotificationPostOptions) {
      assertLive();
      if ("delivery" in request) {
        return awaitMounted(runtime.notifications.post({ ...request, appId: app.id }), signal, assertLive).then(projected);
      }
      return projected(runtime.notifications.post({ ...request, appId: app.id }, options));
    }
    let cachedRuntimeFontReadinessGeneration = textFontScope.fontReadinessGeneration;
    let cachedRuntimeAttachmentReadinessGeneration = textAttachmentGeneration;
    appRuntime = frozen<SynWareRuntime>({
      id: runtime.runtimeId,
      app: Object.freeze({ id: app.id, name: app.name, shortName: app.shortName, packageName: app.packageName, route: app.route }),
      responderId,
      signal,
      state,
      presentation,
      platform,
      navigation: frozen<SynWareNavigationPort>({
        openRoute(pathname, routeOptions) {
          assertLive();
          const activeAppId = runtime.store.getSnapshot().application.activeAppId;
          if (runtime.lifecycle.getState(app.id) === "suspended" || (activeAppId !== null && activeAppId !== app.id)) {
            throw securityError("Only the foreground application may change the browser route.");
          }
          const { hostBeforeCommit: _hostBeforeCommit, ...mountedRouteOptions } = routeOptions ?? {};
          return runTestControlSync("navigation", "navigation.navigate", () => runtime.routes.openRoute(pathname, { ...mountedRouteOptions, signal: mountedRouteOptions.signal ? mergeSignals(signal, mountedRouteOptions.signal) : signal, source: `app:${app.id}` }));
        },
      }),
      catalog: frozen<SynWareCatalogPort>({
        getApp(appId) {
          assertLive();
          const descriptor = runtime.apps.getApp(appId);
          if (!descriptor) return null;
          return projected({
            id: descriptor.id,
            name: descriptor.name,
            shortName: descriptor.shortName,
            packageName: descriptor.packageName,
            route: descriptor.route,
            displayName: descriptor.displayName,
          });
        },
      }),
      application: frozen<SynWareLifecyclePort>({
        closeSelf(closeOptions) {
          assertLive();
          return runTestControlSync("windows", "window.close", () => runtime.lifecycle.close(app.id, closeOptions));
        },
        subscribe(listener) {
          if (!canRefreshPresentation()) return () => undefined;
          const notify = (event: Readonly<{ payload?: unknown }>) => {
            if (signal.aborted || !event.payload || typeof event.payload !== "object") return;
            const payload = event.payload as { readonly appId?: unknown; readonly to?: unknown };
            if (payload.appId !== app.id || (payload.to !== "suspended" && payload.to !== "closed")) return;
            listener(Object.freeze({ state: payload.to }));
          };
          const unsubscribeLifecycle = runtime.events.subscribe("app.lifecycle", notify);
          const unsubscribeTransition = runtime.events.subscribe("app.lifecycle.transition", notify);
          return cleanupOnAbort(() => {
            unsubscribeTransition();
            unsubscribeLifecycle();
          });
        },
      }),
      windows,
      services,
      locale: frozen<SynWareLocalePort>({
        getSnapshot() { refreshPresentation(); return presentationLocaleSnapshot; },
        subscribe(listener) {
          if (!canRefreshPresentation()) return () => undefined;
          let observed = presentationLocaleSource;
          return cleanupOnAbort(runtime.store.subscribe(() => {
            refreshPresentation();
            if (presentationLocaleSource === observed) return;
            observed = presentationLocaleSource;
            listener();
          }));
        },
        getActiveLocale() { refreshPresentation(); return presentationLocale; },
        getSupportedLocales() {
          refreshPresentation();
          return projected(presentationSupportedLocales.flatMap((entry) => {
            if (typeof entry === "string") return [entry];
            if (entry && typeof entry === "object" && typeof (entry as { readonly code?: unknown }).code === "string") {
              return [(entry as { readonly code: string }).code];
            }
            return [];
          }));
        },
        formatDate(value, localeOptions) { assertLive(); return runtime.locale.formatDate(value, localeOptions); },
        formatTime(value, localeOptions) { assertLive(); return runtime.locale.formatTime(value, localeOptions); },
        formatNumber(value, localeOptions) { assertLive(); return runtime.locale.formatNumber(value, localeOptions); },
        formatFileSize(bytes, localeOptions) { assertLive(); return runtime.locale.formatFileSize(bytes, localeOptions); },
        formatRelativeTime(value, unit, localeOptions) { assertLive(); return runtime.locale.formatRelativeTime(value, unit, localeOptions); },
        formatList(values, localeOptions) { assertLive(); return runtime.locale.formatList(values, localeOptions); },
        t(key, params, namespace) {
          // SynWare already supply an authored fallback for every public
          // string.  A revoked outgoing frame may use that fallback, but may
          // not read the current global dictionary through its stale mount.
          if (!canRefreshPresentation()) return key;
          return runtime.locale.t(key, params, namespace);
        },
      }),
      persistence: Object.freeze({
        getPreference(key, fallback) {
          assertLive();
          return projected(runTestControlSync("credentials", "credentials.read", () => (
            runTestControlSync("storage", "storage.read", () => runtime.persistence.getPreference(`${app.id}:${key}`, fallback))
          )));
        },
        setPreference(key, value) {
          assertLive();
          return runTestControlSync("credentials", "credentials.write", () => (
            runTestControlSync("storage", "storage.write", () => runtime.persistence.setPreference(`${app.id}:${key}`, projected(value)))
          ));
        },
        removePreference(key) {
          assertLive();
          runTestControlSync("credentials", "credentials.remove", () => (
            runTestControlSync("storage", "storage.remove", () => runtime.persistence.removePreference(`${app.id}:${key}`))
          ));
        },
      }),
      documentStore: documents,
      documentResources,
      workspaceDocuments,
      commands,
      focus: Object.freeze({
        requestFocus(target, focusOptions) { ownResponder(target); return runtime.focus.requestFocus(target, focusOptions); },
        openScope(scope) {
          assertLive();
          ownResponder(scope.parentResponderId);
          if (scope.parentScopeId !== undefined && !focusScopeIds.has(scope.parentScopeId)) {
            throw securityError("Application focus scopes may only descend from an owned mounted scope.");
          }
           if (scope.restoreResponderId !== undefined) ownResponder(scope.restoreResponderId);
           const handle = runtime.focus.openScope(scope);
           focusHandles.add(handle);
           focusScopeIds.add(handle.id);
           focusRestorations.set(handle, scope.restoreResponderId ?? scope.parentResponderId ?? null);
           const closeOwned = (options?: { readonly restore?: boolean }) => {
             const shouldRestore = options?.restore !== false;
             const restoration = focusRestorations.get(handle) ?? null;
             const canRestore = shouldRestore && focusRestorationLive && !disposed && !signal.aborted &&
               runtime.apps.getApp(app.id) === app && restoration !== null && ownedResponder(runtime, app.id, restoration);
             let result: ReturnType<FocusScopeHandle["close"]>;
             try { result = handle.close({ restore: false }); }
             catch { result = { status: "missing", scopeId: handle.id, restoredResponderId: null }; }
             focusHandles.delete(handle);
             focusScopeIds.delete(handle.id);
             focusRestorations.delete(handle);
             if (!canRestore) return result;
             const focused = runtime.focus.requestFocus(restoration);
             return result.status === "closed" && focused.status === "focused" ? { ...result, restoredResponderId: restoration } : result;
           };
           const wrapped = Object.freeze({
             id: handle.id,
             close: closeOwned,
             dispose() { return closeOwned(); },
           });
          return wrapped;
        },
        isScopeWithin(scopeId, ancestorScopeId) {
          assertLive();
          if (!focusScopeIds.has(scopeId) || !focusScopeIds.has(ancestorScopeId)) return false;
          return runtime.focus.isScopeWithin(scopeId, ancestorScopeId);
        },
        getFocusedResponderId() {
          assertLive();
          const focused = runtime.focus.getFocusedResponderId();
          return focused && ownedResponder(runtime, app.id, focused) ? focused : null;
        },
      }),
      undo: Object.freeze({
        get(owner: UndoOwner) {
          assertLive();
          if (owner.kind !== "application" || owner.id !== app.id) throw securityError("Undo ownership must remain inside the mounted application.");
          const existing = applicationUndoLeases.get(owner.id);
          if (existing) return existing.manager;
          const manager = runtime.undo.get(owner);
          if (!manager) return null;
          const lease = createMountedUndoLease(manager, assertLive);
          applicationUndoLeases.set(owner.id, lease);
          return lease.manager;
        },
        create(owner: UndoOwner, undoOptions: Parameters<SynCloudOSRuntime["undo"]["create"]>[1]) {
          assertLive();
          if (owner.kind !== "application" || owner.id !== app.id) throw securityError("Undo ownership must remain inside the mounted application.");
          const existing = applicationUndoLeases.get(owner.id);
          if (existing) return existing.manager;
          const lease = createMountedUndoLease(runtime.undo.create(owner, undoOptions), assertLive);
          applicationUndoLeases.set(owner.id, lease);
          return lease.manager;
        },
      }),
      colourPanel,
      pasteboards,
      drag,
      webContent,
      tracking,
      textLayout: Object.freeze({
        geometryCapabilities: runtime.textLayout.geometryCapabilities,
        get fontReadinessGeneration() {
          if (!signal.aborted) {
            assertLive();
            cachedRuntimeFontReadinessGeneration = textFontScope.fontReadinessGeneration;
          }
          return cachedRuntimeFontReadinessGeneration;
        },
        get attachmentReadinessGeneration() {
          if (!signal.aborted) {
            assertLive();
            cachedRuntimeAttachmentReadinessGeneration = textAttachmentGeneration;
          }
          return cachedRuntimeAttachmentReadinessGeneration;
        },
        registerFont(bytes: Uint8Array, descriptor: TFXFontDescriptor, callerSignal?: AbortSignal) {
          assertLive();
          return textFontScope.registerFont(bytes, descriptor, callerSignal === undefined
            ? signal
            : AbortSignal.any([signal, callerSignal]));
        },
        registerFontResource(relativeBundlePath: string, descriptor: TFXFontDescriptor, callerSignal?: AbortSignal) {
          assertLive();
          return textFontScope.registerFontResource(relativeBundlePath, descriptor, callerSignal === undefined
            ? signal
            : AbortSignal.any([signal, callerSignal]));
        },
        subscribeFontReadiness(listener: (change: TFXFontReadinessChange) => void) {
          assertLive();
          return textFontScope.subscribeFontReadiness(listener);
        },
        resolveRunDelegate: resolveTextRunDelegate,
        subscribeAttachmentReadiness(listener: (change: TFXRunDelegateReadinessChange) => void) {
          assertLive();
          if (typeof listener !== "function") throw new TypeError("A text attachment readiness listener is required.");
          textAttachmentListeners.add(listener);
          let subscribed = true;
          return () => {
            if (!subscribed) return;
            subscribed = false;
            textAttachmentListeners.delete(listener);
          };
        },
        segment(input) {
          assertLive();
          return runTestControlSync("text", "text.segment", () => runtime.textLayout.segment({ ...input, signal: mergeSignals(runtime.signal, controller.signal, input.signal) }));
        },
        layout(input, containers) {
          assertLive();
          const operationSignal = mergeSignals(runtime.signal, controller.signal, input.signal);
          return runTestControl("text", "text.layout", operationSignal, () => runTextLayout(
            runtime.textLayout.layout({ ...input, signal: operationSignal }, containers),
            operationSignal,
          )).then((result) => {
            lastTextLayoutWork = {
              segmentCount: result.fragments.length,
              measurementCount: result.fragments.length,
              graphemeAdvanceCount: result.fragments.length,
              lineCount: new Set(result.fragments.map((fragment) => `${fragment.containerIndex}:${fragment.rect.y}:${fragment.baseline}`)).size,
            };
            return result;
          });
        },
        measure(input) {
          assertLive();
          const operationSignal = mergeSignals(runtime.signal, controller.signal, input.signal);
          return runTestControl("text", "text.measure", operationSignal, () => runTextLayout(
            runtime.textLayout.measure({ ...input, signal: operationSignal }),
            operationSignal,
          ));
        },
        diagnostics() {
          assertLive();
          return projected({ activeOperationCount: activeTextLayoutOperations, activeMeasurementNodeCount: activeTextMeasurementNodes, lastLayoutWork: lastTextLayoutWork });
        },
      }),
      images,
      animations,
      audio,
      events: Object.freeze({
        subscribe(type, listener) {
          assertLive();
          if (type === "*") throw securityError("Mounted applications may not subscribe to wildcard runtime events.");
          const unsubscribe = runtime.events.subscribe(type, (event) => {
            if (signal.aborted) return;
            const value = event && typeof event === "object" ? event as unknown as Record<string, unknown> : null;
            const appIdFromRecord = (record: Record<string, unknown> | null | undefined): string | null | undefined => {
              if (!record) return undefined;
              if (Object.prototype.hasOwnProperty.call(record, "appId")) return typeof record.appId === "string" ? record.appId : null;
              if (Object.prototype.hasOwnProperty.call(record, "applicationId")) return typeof record.applicationId === "string" ? record.applicationId : null;
              if (record.notification && typeof record.notification === "object") {
                const notification = record.notification as Record<string, unknown>;
                if (Object.prototype.hasOwnProperty.call(notification, "appId")) return typeof notification.appId === "string" ? notification.appId : null;
              }
              return undefined;
            };
            const payload = value?.payload && typeof value.payload === "object" ? value.payload as Record<string, unknown> : null;
            const eventAppId = appIdFromRecord(value) ?? appIdFromRecord(payload);
            if (eventAppId !== undefined && eventAppId !== app.id) return;
            if (eventAppId === undefined && type !== "locale.changed") return;
            listener(projected(event));
          });
          return cleanupOnAbort(unsubscribe);
        },
      }),
      notifications: Object.freeze({ post: postNotification }),
      errors: Object.freeze({
        capture(payload) { assertLive(); return projected(runtime.errors.capture({ ...payload, appId: app.id })); },
      }),
      diagnostics: Object.freeze({
        getReport() {
          assertLive();
          return projected({
            runtimeId: runtime.runtimeId,
            appId: app.id,
            responderId,
            windowControllerId: windowControllerId ?? null,
            live: !signal.aborted,
          });
        },
        async refreshConformanceSnapshot(options: ConformanceInspectorSnapshotOptions = {}) {
          requireTrustedPrivilege("diagnostics", "diagnostics.view");
          const operationSignal = mergeSignals(runtime.signal, signal, options.signal);
          return awaitMounted(
            runtime.inspector.refreshConformanceSnapshot({ ...options, signal: operationSignal }),
            operationSignal,
            () => requireTrustedPrivilege("diagnostics", "diagnostics.view"),
          );
        },
        exportConformanceSnapshot(snapshot: ConformanceInspectorSnapshot) {
          requireTrustedPrivilege("diagnostics", "diagnostics.view");
          return projected(runtime.inspector.exportConformanceSnapshot(snapshot));
        },
      }),
      settings: Object.freeze({
        get() {
          assertLive();
          const next = runtime.settings.get();
          if (next !== settingsSource) {
            settingsSource = next;
            settingsSnapshot = projectAppSettings(next);
          }
          return settingsSnapshot;
        },
        subscribe(listener) { assertLive(); return cleanupOnAbort(runtime.settings.subscribe(() => { if (!signal.aborted) listener(); })); },
        supportsVibration() { assertLive(); return runtime.settings.supportsVibration(); },
        notificationsAllowed() { assertLive(); return runtime.settings.notificationsAllowed(app.id); },
        appNotificationsAllowed() { assertLive(); return runtime.settings.appNotificationsAllowed(app.id); },
      }),
      appearance: Object.freeze({
        get() { refreshPresentation(); return presentationAppearance; },
        resolved() { refreshPresentation(); return presentationResolvedMode; },
        subscribe(listener) {
          if (!canRefreshPresentation()) return () => undefined;
          return cleanupOnAbort(runtime.appearance.subscribe(() => {
            if (!canRefreshPresentation()) return;
            refreshPresentation();
            listener();
          }));
        },
      }),
    });

    const requireDeclaredCapability = (capability: string, operation: string) => {
      assertLive();
      const declaration = runtime.bundles.getBundle(app.id)?.synWareManifest;
      if (!declaration?.permissions?.includes(capability)) {
        throw securityError(`SynWare capability "${capability}" must be declared before ${operation}.`);
      }
    };

    const trustedClients: AppTrustedClient = Object.freeze({
      ...(hasTrustedBundlePrivilege(runtime, app.id, "diagnostics", "diagnostics.view") ? {
        diagnostics: Object.freeze({
          async refreshConformanceSnapshot(options?: Readonly<{ signal?: AbortSignal }>) {
            requireTrustedPrivilege("diagnostics", "diagnostics.view");
            const operationSignal = mergeSignals(runtime.signal, signal, options?.signal);
            return await awaitMounted(
              runtime.inspector.refreshConformanceSnapshot({ ...options, signal: operationSignal }),
              operationSignal,
              () => requireTrustedPrivilege("diagnostics", "diagnostics.view"),
            );
          },
          exportConformanceSnapshot(snapshot: unknown) {
            requireTrustedPrivilege("diagnostics", "diagnostics.view");
            return projected(runtime.inspector.exportConformanceSnapshot(snapshot as ConformanceInspectorSnapshot));
          },
        }),
      } : {}),
      ...(hasTrustedBundlePrivilege(runtime, app.id, "conformance", "diagnostics.view") ? {
        conformance: (() => {
          const retainEvidence = (release: () => void): AppClientHandle => {
            let active = true;
            const releaseOnAbort = cleanupOnAbort(() => {
              if (!active) return;
              active = false;
              release();
            });
            return Object.freeze({
              dispose() {
                if (!active) return false;
                releaseOnAbort();
                return true;
              },
            });
          };
          return Object.freeze({
            registerAppearanceFact(fact: Readonly<AppTrustedConformanceAppearanceFact>) {
              requireTrustedPrivilege("conformance", "diagnostics.view");
              return retainEvidence(runtime.inspector.registerConformanceAppearanceFact(fact as never));
            },
            registerAccessibilityFinding(finding: Readonly<AppTrustedConformanceAccessibilityFinding>) {
              requireTrustedPrivilege("conformance", "diagnostics.view");
              return retainEvidence(runtime.inspector.registerConformanceAccessibilityFinding(finding as never));
            },
            getRuntimeEvidence() {
              requireTrustedPrivilege("conformance", "diagnostics.view");
              return projected({
                trackingRegionCount: appRuntime.tracking.diagnostics().regionCount,
                activeTextMeasurementNodeCount: appRuntime.textLayout.diagnostics().activeMeasurementNodeCount,
                activeImageReferenceCount: appRuntime.images.diagnostics().activeReferenceCount,
                activeAnimationCount: appRuntime.animations.diagnostics().activeCount,
                soundHandleCount: appRuntime.audio.diagnostics().handleCount,
                webContentSessionCount: appRuntime.webContent.diagnostics().sessionCount,
              });
            },
            getLocaleEvidence() {
              requireTrustedPrivilege("conformance", "diagnostics.view");
              const locale = runtime.locale.getSnapshot();
              return projected({
                locale: locale.activeLocale,
                supportedLocales: locale.supportedLocales.map((entry) => ({
                  code: entry.code,
                  englishName: entry.englishName,
                  nativeName: entry.nativeName,
                  direction: entry.direction,
                  translationCompleteness: entry.translationCompleteness,
                })),
              });
            },
          });
        })(),
      } : {}),
    });

    let identitySource = runtime.store.getSnapshot().loginServices;
    let identitySnapshot = Object.freeze({
      authenticated: identitySource.isAuthorised,
      displayName: identitySource.displayName ?? null,
    });
    const refreshIdentity = () => {
      const next = runtime.store.getSnapshot().loginServices;
      if (next === identitySource) return;
      identitySource = next;
      identitySnapshot = Object.freeze({
        authenticated: next.isAuthorised,
        displayName: next.displayName ?? null,
      });
    };

    let environmentWorkAreaSource = runtime.environment.workArea.getSnapshot();
    let environmentWorkAreaSnapshot = Object.freeze({
      width: environmentWorkAreaSource.width,
      height: environmentWorkAreaSource.height,
      devicePixelRatio: environmentWorkAreaSource.devicePixelRatio,
    });
    const refreshEnvironmentWorkArea = () => {
      const next = runtime.environment.workArea.getSnapshot();
      if (next === environmentWorkAreaSource) return;
      environmentWorkAreaSource = next;
      environmentWorkAreaSnapshot = Object.freeze({
        width: next.width,
        height: next.height,
        devicePixelRatio: next.devicePixelRatio,
      });
    };

    let settingsAvailabilitySource = runtime.settings.get();
    let settingsAvailabilitySnapshot = Object.freeze({
      vibration: runtime.settings.supportsVibration(),
      notifications: runtime.settings.notificationsAllowed(app.id),
      appNotifications: runtime.settings.appNotificationsAllowed(app.id),
    });
    const refreshSettingsAvailability = () => {
      const next = runtime.settings.get();
      if (next === settingsAvailabilitySource) return;
      settingsAvailabilitySource = next;
      settingsAvailabilitySnapshot = Object.freeze({
        vibration: runtime.settings.supportsVibration(),
        notifications: runtime.settings.notificationsAllowed(app.id),
        appNotifications: runtime.settings.appNotificationsAllowed(app.id),
      });
    };

    const schedulerHandle = (cancel: () => void) => {
      let live = true;
      const settle = () => {
        if (!live) return;
        live = false;
        signal.removeEventListener("abort", markRevoked);
      };
      const markRevoked = () => settle();
      signal.addEventListener("abort", markRevoked, { once: true });
      if (signal.aborted) markRevoked();
      return Object.freeze({
        handle: Object.freeze({
          dispose() {
            if (!live) return false;
            settle();
            cancel();
            return true;
          },
        }) satisfies AppClientHandle,
        settle,
      });
    };

    const mediaQueryEntries = new Map<string, Readonly<{
      readonly media: ReturnType<SynWareRuntime["platform"]["matchMedia"]>;
      readonly release: () => void;
    }>>();
    const mediaQueryFor = (query: string) => {
      const existing = mediaQueryEntries.get(query);
      if (existing) return existing.media;
      const media = appRuntime.platform.matchMedia(query);
      const release = cleanupOnAbort(() => {
        mediaQueryEntries.delete(query);
        media.dispose();
      });
      mediaQueryEntries.set(query, Object.freeze({ media, release }));
      return media;
    };

    const notificationActionListeners = new Set<(action: Readonly<{ notificationId: string; actionId: string }>) => void>();
    const notificationActionReleases = new Map<string, () => boolean>();
    const rawNotificationActionId = (actionId: string) => `${app.id}:${responderId}:${actionId}`;
    const registerNotificationAction = (actionId: string) => {
      if (actionId.trim().length === 0) throw new TypeError("Application notification action IDs must not be empty.");
      const rawId = rawNotificationActionId(actionId);
      if (notificationActionReleases.has(rawId)) return rawId;
      if (typeof runtime.notifications.registerAction !== "function") return rawId;
      const release = runtime.notifications.registerAction(rawId, ({ notificationId }) => {
        if (signal.aborted) return;
        const action = Object.freeze({ notificationId, actionId });
        for (const listener of [...notificationActionListeners]) listener(action);
      });
      notificationActionReleases.set(rawId, release);
      return rawId;
    };
    cleanupOnAbort(() => {
      notificationActionListeners.clear();
      for (const release of notificationActionReleases.values()) release();
      notificationActionReleases.clear();
    });

    const audioInputCapability = Object.freeze({});
    const videoCaptureCapability = Object.freeze({});
    const mountedSettlement = createMountedSettlementPort(runtime);
    let cachedFontReadinessGeneration = appRuntime.textLayout.fontReadinessGeneration;
    let cachedAttachmentReadinessGeneration = appRuntime.textLayout.attachmentReadinessGeneration;
    const environmentClients = Object.freeze({
      audioGraphs: createMountedAudioGraphs(runtime.audioGraphs, signal, () => {
        assertLive();
        return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
      }, app.id, audioInputCapability, mountedSettlement),
      audioSessions: createMountedAudioSessions(runtime.environment.audioCapture, signal, () => {
        assertLive();
        return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
      }, audioInputCapability, app.id, mountedSettlement),
      audioFiles: createMountedAudioFiles(runtime.environment.audioFiles, signal, () => {
        assertLive();
        return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
      }),
      haptics: createMountedHapticsClient(runtime.hapticHost, signal, () => {
        assertLive();
        return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
      }),
      motion: createMountedMotionClient(runtime.motion, signal, () => {
        assertLive();
        return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
      }),
      media: createMountedMediaClient(runtime.mediaClock, signal),
      video: createMountedVideoClient(
        runtime.video,
        signal,
        () => {
          assertLive();
          return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
        },
        (capability) => {
          assertLive();
          const declaration = runtime.bundles.getBundle(app.id)?.synWareManifest;
          if (!declaration) return false;
          try {
            const decision = runTestControlSync("permissions", "permission.request", () =>
              runTestControlSync("policy", "policy.evaluate", () => runtime.policy.authorise({
                action: capability,
                origin: "runtime",
                source: "SynWareVideoClient",
                app,
                bundlePermissions: [...(declaration.permissions ?? [])],
                context: Object.freeze({ appId: app.id, capability }),
              })),
            );
            return decision.allowed;
          } catch (error) {
            if (error instanceof DOMException && error.name === "SecurityError") return false;
            throw error;
          }
        },
        app.id,
        videoCaptureCapability,
        runtime.audioGraphs,
        audioInputCapability,
        {},
        { owner: app.id, register: (participant) => runtime.resources.register(participant) },
      ),
      location: createMountedLocationClient(
        runtime.location,
        signal,
        () => {
          assertLive();
          return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
        },
        (capability) => {
          assertLive();
          const declaration = runtime.bundles.getBundle(app.id)?.synWareManifest;
          if (!declaration) return false;
          const decision = runTestControlSync("permissions", "permission.request", () =>
            runTestControlSync("policy", "policy.evaluate", () => runtime.policy.authorise({
              action: capability,
              origin: "runtime",
              source: "SynWareLocationClient",
              app,
              bundlePermissions: [...(declaration.permissions ?? [])],
              context: Object.freeze({ appId: app.id, capability }),
            })),
          );
          return decision.allowed;
        },
        app.id,
        mountedSettlement,
      ),
      midi: createMountedMIDIClient(
        runtime.midi,
        signal,
        () => {
          assertLive();
          return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
        },
        (capability) => {
          assertLive();
          const declaration = runtime.bundles.getBundle(app.id)?.synWareManifest;
          if (!declaration) return false;
          try {
            const decision = runTestControlSync("permissions", "permission.request", () =>
              runTestControlSync("policy", "policy.evaluate", () => runtime.policy.authorise({
                action: capability,
                origin: "runtime",
                source: "SynWareMIDIClient",
                app,
                bundlePermissions: [...(declaration.permissions ?? [])],
                context: Object.freeze({ appId: app.id, capability }),
              })),
            );
            return decision.allowed;
          } catch (error) {
            if (error instanceof DOMException && error.name === "SecurityError") return false;
            throw error;
          }
        },
      ),
      lumina: createMountedLuminaClient(
        runtime.lumina,
        signal,
        () => {
          assertLive();
          return runtime.bundles.getBundle(app.id)?.synWareManifest?.permissions ?? [];
        },
        (capability) => {
          assertLive();
          const declaration = runtime.bundles.getBundle(app.id)?.synWareManifest;
          if (!declaration) return false;
          const decision = runTestControlSync("permissions", "permission.request", () =>
            runTestControlSync("policy", "policy.evaluate", () => runtime.policy.authorise({
              action: capability,
              origin: "runtime",
              source: "SynWareLuminaClient",
              app,
              bundlePermissions: [...(declaration.permissions ?? [])],
              context: Object.freeze({ appId: app.id, capability }),
            })),
          );
          return decision.allowed;
        },
        app.id,
      ),
      persistence: Object.freeze({
        getPreference<T>(key: string, fallback: T): T {
          assertLive();
          return appRuntime.persistence.getPreference(key, fallback);
        },
        setPreference<T>(key: string, value: T): boolean {
          assertLive();
          return appRuntime.persistence.setPreference(key, value);
        },
        removePreference(key: string) {
          assertLive();
          appRuntime.persistence.removePreference(key);
        },
      }),
      scheduler: Object.freeze({
        now() {
          assertLive();
          return appRuntime.platform.now();
        },
        createIdentifier() {
          assertLive();
          return appRuntime.platform.randomUUID();
        },
        setTimeout(callback: () => void, delayMs: number) {
          assertLive();
          let raw: unknown;
          let assigned = false;
          let completed = false;
          const owned = schedulerHandle(() => {
            if (assigned && !completed) appRuntime.platform.clearTimeout(raw);
          });
          raw = appRuntime.platform.setTimeout(() => {
            if (completed || signal.aborted) return;
            completed = true;
            owned.settle();
            callback();
          }, Math.max(0, delayMs));
          assigned = true;
          return owned.handle;
        },
        requestAnimationFrame(callback: (time: number) => void) {
          if (signal.aborted) return schedulerHandle(() => undefined).handle;
          assertLive();
          let raw: unknown;
          let assigned = false;
          let completed = false;
          const owned = schedulerHandle(() => {
            if (assigned && !completed) appRuntime.platform.cancelAnimationFrame(raw);
          });
          raw = appRuntime.platform.requestAnimationFrame((time) => {
            if (completed || signal.aborted) return;
            completed = true;
            owned.settle();
            callback(time);
          });
          assigned = true;
          return owned.handle;
        },
      }),
      mediaQueries: Object.freeze({
        getSnapshot(query: string) {
          assertLive();
          return mediaQueryFor(query).matches;
        },
        subscribe(query: string, listener: () => void) {
          if (!canRefreshPresentation()) return () => undefined;
          const media = mediaQueryFor(query);
          const unsubscribe = media.subscribe(() => { if (!signal.aborted) listener(); });
          return cleanupOnAbort(unsubscribe);
        },
      }),
      identity: Object.freeze({
        getSnapshot() {
          // Departing-tree read: serve the last-issued identity instead of
          // throwing from useSyncExternalStore during mount revocation.
          if (canRefreshPresentation()) {
            assertLive();
            refreshIdentity();
          }
          return identitySnapshot;
        },
        subscribe(listener: () => void) {
          if (!canRefreshPresentation()) return () => undefined;
          let observed = identitySnapshot;
          const unsubscribe = runtime.store.subscribe(() => {
            if (signal.aborted) return;
            refreshIdentity();
            if (identitySnapshot === observed) return;
            observed = identitySnapshot;
            listener();
          });
          return cleanupOnAbort(unsubscribe);
        },
      }),
      notifications: Object.freeze({
        async post(request: Readonly<{ title: string; body: string; actionIds?: readonly string[] }>) {
          requireDeclaredCapability("notifications.post", "posting an application notification");
          if (request.title.trim().length === 0 || request.body.trim().length === 0) {
            throw new TypeError("Application notifications require a title and body.");
          }
          const result = await awaitMounted(appRuntime.notifications.post({
            idempotencyKey: `${app.id}:${appRuntime.platform.randomUUID()}`,
            title: request.title,
            body: request.body,
            delivery: "in-app",
            appId: app.id,
            actions: request.actionIds?.map((id: string) => ({ id: registerNotificationAction(id), title: id })),
          }), signal, assertLive);
          const record = result as { readonly notification?: { readonly id?: unknown }; readonly id?: unknown };
          const notificationId = record.notification?.id ?? record.id;
          if (typeof notificationId !== "string") throw new DOMException("The host did not return an application notification identifier.", "OperationError");
          return notificationId;
        },
        subscribeActions(listener: (action: Readonly<{ notificationId: string; actionId: string }>) => void) {
          assertLive();
          notificationActionListeners.add(listener);
          return cleanupOnAbort(() => notificationActionListeners.delete(listener));
        },
      }),
      errors: Object.freeze({
        capture(error: unknown, context: Parameters<MountedAppEnvironmentClients["errors"]["capture"]>[1]) {
          assertLive();
          const operation = context.operation;
          const requestedCode = context.code;
          const durationMs = context.timeoutMs;
          const retryOperation = context.retry;
          function captureRecovery(cause: unknown) {
            if (signal.aborted) return;
            const timeout = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "OperationTimeoutError" || cause.name === "RouteDataTimeoutError");
            const code = timeout ? "APP_NOT_RESPONDING" : requestedCode;
            const errorContext = { operation, source: `SynWare:${operation}`, durationMs,
              technicalMessage: cause instanceof Error ? cause.message : String(cause),
              reason: code === "APP_NOT_RESPONDING" ? "request-timeout" : "transport-failure" };
            let captured: ReturnType<SynCloudOSRuntime["errors"]["capture"]>;
            let retrying = false;
            const stillOwned = () => !signal.aborted && runtime.errors.getHistory().some(error => error.id === captured.id);
            const retry = retryOperation ? async () => {
              if (retrying || !stillOwned()) return;
              retrying = true;
              try {
                await retryOperation();
                if (!signal.aborted) runtime.errors.dismiss(captured.id);
              } catch (failure) {
                // Once started, the mounted owner governs completion. Bounded
                // diagnostic history eviction does not cancel a live operation.
                if (!signal.aborted) { runtime.errors.dismiss(captured.id); captureRecovery(failure); }
              } finally { retrying = false; }
            } : undefined;
            captured = code === "APP_NOT_RESPONDING"
              ? runtime.errors.createNotRespondingError(app, errorContext, retry)
              : code === "CONNECTION_ERROR"
                ? runtime.errors.createConnectionError(app, cause, errorContext, retry)
                : runtime.errors.capture({ code: "APP_CONTENT_FAILED", title: "SynWare operation failed",
                  error: cause, source: errorContext.source,
                  appId: app.id, category: "app", context: { operation, scope: "app" } });
            if (code) {
              const ownerClosed = () => runtime.errors.dismiss(captured.id);
              signal.addEventListener("abort", ownerClosed, { once: true });
              const unsubscribe = runtime.store.subscribe(() => {
                if (!runtime.errors.getHistory().some(error => error.id === captured.id)) {
                  signal.removeEventListener("abort", ownerClosed);
                  unsubscribe();
                }
              });
              // Removal above releases the retry closure before a later owner abort.
            }
          }
          captureRecovery(error);
        },
      }),
      externalActions: Object.freeze({
        async openMailto(address: string, subject?: string, body?: string) {
          requireDeclaredCapability("external.open", "opening mail");
          if (address.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address)) throw new TypeError("A valid mail address is required.");
          const query = new URLSearchParams();
          if (subject !== undefined) query.set("subject", subject);
          if (body !== undefined) query.set("body", body);
          const href = `mailto:${encodeURIComponent(address)}${query.size === 0 ? "" : `?${query.toString()}`}`;
          await awaitMounted(runTestControl("browser", "browser.mailto", signal, () => {
            runtime.environment.browser.getWindow()?.open(href, "_self");
          }), signal, assertLive);
        },
      }),
      share: Object.freeze({
        available() {
          assertLive();
          return typeof runtime.environment.browser.getNavigator()?.share === "function";
        },
        async share(request: Readonly<{ title: string; text?: string; url?: string }>) {
          requireDeclaredCapability("web.share", "sharing application content");
          const share = runtime.environment.browser.getNavigator()?.share;
          if (typeof share !== "function") return "cancelled";
          try {
            await awaitMounted(runTestControl("browser", "browser.share", signal, () => share({ ...request })), signal, assertLive);
            return "shared" as const;
          } catch (error) {
            if (signal.aborted) throw error;
            if (isAbortError(error)) return "cancelled" as const;
            throw error;
          }
        },
      }),
      workArea: Object.freeze({
        getSnapshot() {
          if (canRefreshPresentation()) {
            assertLive();
            refreshEnvironmentWorkArea();
          }
          return environmentWorkAreaSnapshot;
        },
        subscribe(listener: () => void) {
          if (!canRefreshPresentation()) return () => undefined;
          let observed = environmentWorkAreaSnapshot;
          const unsubscribe = runtime.environment.workArea.subscribe(() => {
            if (!canRefreshPresentation()) return;
            refreshEnvironmentWorkArea();
            if (environmentWorkAreaSnapshot === observed) return;
            observed = environmentWorkAreaSnapshot;
            listener();
          });
          return cleanupOnAbort(unsubscribe);
        },
      }),
      settingsAvailability: Object.freeze({
        getSnapshot() {
          if (!signal.aborted) {
            assertLive();
            refreshSettingsAvailability();
          }
          return settingsAvailabilitySnapshot;
        },
        subscribe(listener: () => void) {
          assertLive();
          let observed = settingsAvailabilitySnapshot;
          const unsubscribe = runtime.settings.subscribe(() => {
            if (signal.aborted) return;
            refreshSettingsAvailability();
            if (settingsAvailabilitySnapshot === observed) return;
            observed = settingsAvailabilitySnapshot;
            listener();
          });
          return cleanupOnAbort(unsubscribe);
        },
      }),
      connectivity: Object.freeze({
        getSnapshot() {
          assertLive();
          return appRuntime.platform.online();
        },
        subscribe(listener: () => void) {
          assertLive();
          return appRuntime.platform.subscribeOnline(listener);
        },
      }),
      events: Object.freeze({
        subscribe(type: "locale.changed" | "notification.action", listener: (event: Readonly<Record<string, unknown>>) => void) {
          assertLive();
          return appRuntime.events.subscribe(type, (event) => listener(event as unknown as Readonly<Record<string, unknown>>));
        },
      }),
      tracking: Object.freeze({
        register(options: Readonly<Record<string, unknown>>) {
          assertLive();
          const registration = appRuntime.tracking.register(options as never);
          return Object.freeze({
            dispose() { return registration.dispose("application tracking registration released"); },
          });
        },
      }),
      textLayout: Object.freeze({
        geometryCapabilities: appRuntime.textLayout.geometryCapabilities,
        get fontReadinessGeneration() {
          if (!signal.aborted) {
            assertLive();
            cachedFontReadinessGeneration = appRuntime.textLayout.fontReadinessGeneration;
          }
          return cachedFontReadinessGeneration;
        },
        get attachmentReadinessGeneration() {
          if (!signal.aborted) {
            assertLive();
            cachedAttachmentReadinessGeneration = appRuntime.textLayout.attachmentReadinessGeneration;
          }
          return cachedAttachmentReadinessGeneration;
        },
        registerFont(bytes: Uint8Array, descriptor: TFXFontDescriptor, callerSignal?: AbortSignal) {
          assertLive();
          return appRuntime.textLayout.registerFont(bytes, descriptor, callerSignal);
        },
        registerFontResource(relativeBundlePath: string, descriptor: TFXFontDescriptor, callerSignal?: AbortSignal) {
          assertLive();
          return appRuntime.textLayout.registerFontResource(relativeBundlePath, descriptor, callerSignal);
        },
        subscribeFontReadiness(listener: (change: TFXFontReadinessChange) => void) {
          assertLive();
          return appRuntime.textLayout.subscribeFontReadiness(listener);
        },
        resolveRunDelegate(request: TFXRunDelegateRequest, callerSignal?: AbortSignal) {
          assertLive();
          return appRuntime.textLayout.resolveRunDelegate(request, callerSignal);
        },
        subscribeAttachmentReadiness(listener: (change: TFXRunDelegateReadinessChange) => void) {
          assertLive();
          return appRuntime.textLayout.subscribeAttachmentReadiness(listener);
        },
        segment(input: Readonly<Record<string, unknown>>) {
          assertLive();
          return appRuntime.textLayout.segment(input as never);
        },
        layout(input: Readonly<Record<string, unknown>>, containers?: readonly unknown[]) {
          assertLive();
          return appRuntime.textLayout.layout(input as never, containers as never);
        },
        measure(input: Readonly<Record<string, unknown>>) {
          assertLive();
          return appRuntime.textLayout.measure(input as never);
        },
      }),
      animations: (() => {
        const owners = new WeakMap<object, { readonly release: (reason?: string) => void }>();
        return Object.freeze({
          ...createMountedAnimationLayers(runtime.environment.animationLayers, signal, assertLive,
            { owner: app.id, register: (participant) => runtime.resources.register(participant) }),
          acquireOwner(viewId: string) {
            assertLive();
            // A window-scoped mount owns animations only for its own window.
            const raw = appRuntime.animations.acquireOwner({
              appId: app.id,
              viewId,
              ...(windowControllerId === undefined ? {} : { windowControllerId }),
            });
            const owner = Object.freeze({
              viewId,
              dispose() {
                const issued = owners.get(owner);
                if (!issued) return false;
                owners.delete(owner);
                issued.release("application animation owner released");
                return true;
              },
            });
            owners.set(owner, raw);
            return owner;
          },
          animate(target: object, definition: Readonly<Record<string, unknown>>, owner: object) {
            assertLive();
            const issued = owners.get(owner);
            if (!issued) throw securityError("Animation ownership was not issued to this mounted application.");
            const animation = appRuntime.animations.animate(target, definition as never, issued as never);
            return Object.freeze({
              id: animation.id,
              finished: animation.finished,
              get progress() { return animation.progress; },
              cancel(reason?: string) { animation.cancel(reason); },
              seek(seconds: number) { animation.seek(seconds); },
              pause() { animation.pause(); },
              resume() { animation.resume(); },
              dispose() {
                animation.cancel("application animation released");
              },
            });
          },
        });
      })(),
      images: Object.freeze({
        createGraphicsIdentifierIssuer() {
          assertLive();
          return appRuntime.images.createGraphicsIdentifierIssuer() as never;
        },
        load(request: Readonly<Record<string, unknown>>) {
          assertLive();
          const resource = appRuntime.images.load(request as never);
          const readPixels = imagePixelReaders.get(resource);
          const exportImage = imageExporters.get(resource);
          if (!readPixels || !exportImage) throw securityError("Image resource has no mounted pixel authority.");
          return new IFXImageResource({ resource, readPixels, export: exportImage });
        },
        ...(appRuntime.platform.imageGeometry ? {
          geometry: appRuntime.platform.imageGeometry as never,
        } : {}),
      }),
      filePanels: (() => {
        const picker = runtime.environment.filePicker;
        const service = picker ? createFilePanelService([createBrowserFilePanelAdapter(picker)]) : null;
        if (service) cleanupOnAbort(() => service.dispose());
        const signalFor = (callerSignal?: AbortSignal) => mergeSignals(runtime.signal, controller.signal, callerSignal);
        return Object.freeze({
          open(request: OpenPanelRequest, callerSignal?: AbortSignal) {
            assertLive();
            if (!service) return Promise.resolve({ kind: "unavailable" as const, missingCapabilities: Object.freeze(["read" as const]), message: "This host has no file chooser." });
            return service.open(request, signalFor(callerSignal));
          },
          save(request: SavePanelRequest, callerSignal?: AbortSignal) {
            assertLive();
            if (!service) return Promise.resolve({ kind: "unavailable" as const, missingCapabilities: Object.freeze(["write" as const]), message: "This host has no file chooser." });
            return service.save(request, signalFor(callerSignal));
          },
          release(reference: FilePanelReference, reason: FilePanelReleaseReason = "caller-finished") {
            if (service) service.release(reference, reason); else reference.release(reason);
          },
          dispose() { /* The mount owns its panel service. */ },
        });
      })(),
      webContent: Object.freeze({
        createSession(request: Readonly<Record<string, unknown>>, callerSignal?: AbortSignal) {
          assertLive();
          return appRuntime.webContent.createSession(request as never, callerSignal) as never;
        },
      }),
      trusted: trustedClients,
    } satisfies MountedAppEnvironmentClients);
    registerMountedAppEnvironmentClients(appRuntime, environmentClients);
    cleanupOnAbort(() => clearMountedAppEnvironmentClients(appRuntime));

    const responderHandles = new Set<ResponderRegistrationHandle>();
    type PendingResponder = {
      readonly registration: ResponderRegistration;
      active: boolean;
      underlying: ResponderRegistrationHandle | null;
      dispose(): boolean;
    };
    const pendingResponders = new Set<PendingResponder>();
    const drainPendingResponders = () => {
      for (const pending of [...pendingResponders]) {
        if (!pending.active) {
          pendingResponders.delete(pending);
          continue;
        }
        const parentId = pending.registration.parentId;
        if (parentId && !ownedResponder(runtime, app.id, parentId)) {
          // A parent that appeared under another owner can never become a
          // valid app lease. Drop the pending child without touching it.
          if (runtime.responders.get(parentId)) {
            pending.active = false;
            pendingResponders.delete(pending);
          }
          continue;
        }
        const handle = runtime.responders.register({ ...pending.registration, runtimeId: runtime.runtimeId });
        pending.underlying = handle;
        responderHandles.add(handle);
        pendingResponders.delete(pending);
      }
    };
    const registerAppResponder: AppResponderRegistrar = (registration) => {
      assertLive();
      if (registration.kind === "document" &&
          registration.parentId === `application:${app.id}` &&
          registration.scopeId === registration.id &&
          registration.undoOwner?.kind === "document" &&
          registration.undoOwner.id === registration.id.slice("document:".length) &&
          ownedCanonicalDocumentResponder(runtime, app.id, registration.id)) {
        // A canonical document can outlive its view mount, so its standard
        // command responder may already exist under the workspace. The
        // replacement view borrows that exact responder instead of registering
        // a duplicate. Descendants remain mount-owned; this no-op lease never
        // disposes kernel state.
        let active = true;
        return Object.freeze({
          id: registration.id,
          dispose() {
            if (!active) return false;
            active = false;
            return true;
          },
        });
      }
      if (registration.parentId && !ownedResponder(runtime, app.id, registration.parentId)) {
        if (runtime.responders.get(registration.parentId)) {
          throw securityError("Application responder scopes may only descend from an owned responder.");
        }
        let pending!: PendingResponder;
        pending = {
          registration,
          active: true,
          underlying: null,
          dispose() {
            if (!pending.active) return false;
            pending.active = false;
            pendingResponders.delete(pending);
            if (!pending.underlying) return true;
            const removed = pending.underlying.dispose();
            responderHandles.delete(pending.underlying);
            pending.underlying = null;
            return removed;
          },
        };
        pendingResponders.add(pending);
        return Object.freeze({ id: registration.id, dispose: pending.dispose });
      }
      const handle = runtime.responders.register({ ...registration, runtimeId: runtime.runtimeId });
      responderHandles.add(handle);
      const dispose = (options?: { readonly cascade?: boolean }) => {
        const removed = handle.dispose(options);
        if (removed) responderHandles.delete(handle);
        return removed;
      };
      drainPendingResponders();
      drainPendingCommandRegistrations();
      return Object.freeze({ id: handle.id, dispose });
    };
    setMountedAppResponderRegistrar(appRuntime, registerAppResponder);
    let overlayWorkAreaSource = runtime.environment.workArea.getSnapshot();
    let overlayWorkAreaSnapshot = projected(overlayWorkAreaSource);
    let overlayVisualViewportSource = runtime.environment.visualViewport.getSnapshot();
    let overlayVisualViewportSnapshot = projected(overlayVisualViewportSource);
    setMountedAppOverlayAuthority(appRuntime, Object.freeze({
      runtimeId: runtime.runtimeId,
      environment: Object.freeze({
        browser: Object.freeze({
          // Outgoing application frames may remain in React's visual exit
          // tree after their transfer authority is revoked. DOM reads are
          // presentation-only and must remain available until that tree is
          // removed; mutating capabilities continue to assertLive elsewhere.
          getDocument() { return runtime.environment.browser.getDocument(); },
          getWindow() { return runtime.environment.browser.getWindow(); },
        }),
        workArea: Object.freeze({
          getSnapshot() {
            if (!signal.aborted) {
              const next = runtime.environment.workArea.getSnapshot();
              if (next !== overlayWorkAreaSource) {
                overlayWorkAreaSource = next;
                overlayWorkAreaSnapshot = projected(next);
              }
            }
            return overlayWorkAreaSnapshot;
          },
          subscribe(listener: () => void) {
            if (signal.aborted) return () => undefined;
            return cleanupOnAbort(runtime.environment.workArea.subscribe(() => { if (!signal.aborted) listener(); }));
          },
        }),
        visualViewport: Object.freeze({
          getSnapshot() {
            if (!signal.aborted) {
              const next = runtime.environment.visualViewport.getSnapshot();
              if (next !== overlayVisualViewportSource) {
                overlayVisualViewportSource = next;
                overlayVisualViewportSnapshot = projected(next);
              }
            }
            return overlayVisualViewportSnapshot;
          },
          subscribe(listener: () => void) {
            if (signal.aborted) return () => undefined;
            return cleanupOnAbort(runtime.environment.visualViewport.subscribe(() => { if (!signal.aborted) listener(); }));
          },
        }),
        presentation,
        setTimeout(callback: () => void, delayMs: number) {
          if (signal.aborted) return undefined;
          return runTestControlSync("overlays", "overlay.present", () => (
            runtime.environment.setTimeout(() => { if (!signal.aborted) callback(); }, delayMs)
          ));
        },
        clearTimeout(handle: unknown) {
          if (handle !== undefined) {
            runTestControlSync("overlays", "overlay.dismiss", () => runtime.environment.clearTimeout(handle));
          }
        },
      }),
      observeFiniteWork(receipt: Promise<void>, input: Readonly<{ kind: "focus-restore"; label: string }>) {
        mountedSettlement.track(receipt, { owner: "overlay", kind: input.kind, label: input.label });
      },
    }) satisfies MountedAppOverlayAuthority);
    cleanupOnAbort(() => {
      transferMount.signal.removeEventListener("abort", forwardTransferAbort);
      for (const pending of pendingResponders) pending.dispose();
      pendingResponders.clear();
      for (const handle of responderHandles) handle.dispose({ cascade: true });
      responderHandles.clear();
      clearMountedAppResponderRegistrar(appRuntime);
      clearMountedAppOverlayAuthority(appRuntime);
    });

    return Object.freeze({
      runtime: appRuntime,
      dispose(reason?: unknown) {
        if (disposed) return;
        disposed = true;
        for (const handleId of [...soundIds]) runtime.audio.release(handleId, "mounted application disposed");
        soundIds.clear();
        soundHandles.clear();
        controller.abort(reason);
        transferMount.dispose(reason);
      },
    });
  } catch (error) {
    controller.abort(error);
    transferMount.dispose(error);
    throw error;
  }
}
