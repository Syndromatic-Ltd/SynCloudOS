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

import type { CommandSystem } from "../Commands";
import type {
  ApplicationSessionCloseLease,
  ApplicationSessionMutationTicket,
  DocumentClosePreparation,
  DocumentController,
  DocumentCloseReason,
} from "../Documents";
import type { FocusManager } from "../Focus";
import type { FocusScopeHandle } from "../Focus/focusTypes";
import type { KeyBindingManager } from "../KeyBindings";
import type { OperationCoordinator, SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { SynWareOwnedProjectionResult } from "../AppSDK/runtimeContracts";
import type { ResponderGraph, ResponderRegistrationHandle } from "../Responders";
import type { UndoManagerRegistry } from "../Undo";
import type { ScreenService } from "./ScreenService";
import { WindowBoundsScheduler } from "./WindowBoundsScheduler";
import { WindowController } from "./WindowController";
import { WindowContentFactoryUnavailableError, type WindowContentRegistry } from "./WindowContentRegistry";
import { WindowDocumentPresentationCloseCoordinator } from "./WindowDocumentPresentationCloseCoordinator";
import {
  freezeWindowRestorationSnapshot,
  InvalidWindowRestorationSnapshotError,
  resolveWindowPresentation,
  validateWindowRestorationSnapshot,
  type RestorableWindowRecord,
  type WindowRestorationDependencies,
  type WindowRestorationFailure,
  type WindowRestorationReport,
  type WindowRestorationSnapshot,
} from "./WindowRestoration";
import {
  assertFiniteWindowBounds,
  canonicalWindowChromeMode,
  createCanonicalWindowRecord,
  defaultWindowSmoothSurface,
  freezeWindowRecord,
  normaliseWindowSmoothSurface,
  type CreateWindowRequest,
  type ApplicationClosePreparation,
  type ApplicationClosePreparationToken,
  type DismissTransientWindowsRequest,
  type OpenWindowOptions,
  type WindowClosePreparation,
  type WindowClosePreparationToken,
  type WindowClosePreparedNode,
  type WindowCloseRequest,
  type WindowCloseResult,
  type WindowBounds,
  type WindowBoundsChangeReason,
  type WindowAnchor,
  type WindowControllerClosePreparation,
  type WindowContentFactoryRegistration,
  type WindowContentRegistration,
  type WindowListQuery,
  type WindowIdPort,
  type WindowManagerDiagnostics,
  type WindowManagerSnapshot,
  type WindowOrderPlacement,
  type WindowRecord,
  type WindowScheduledBoundsChange,
} from "./windowTypes";

export interface WindowManagerDependencies {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly operations: OperationCoordinator;
  readonly commands: CommandSystem;
  readonly responders: ResponderGraph;
  readonly focus: FocusManager;
  readonly keyBindings: KeyBindingManager;
  readonly undo: UndoManagerRegistry;
  readonly documents: DocumentController;
  readonly screen: ScreenService;
  readonly content: WindowContentRegistry;
  readonly ids: WindowIdPort;
  readonly restoration: WindowRestorationDependencies;
  readonly resolveApplicationWindow?: (applicationId: string) => CreateWindowRequest | null;
  /** Host-owned bridge to an app's narrow exact-document rematerialiser.
   * WindowManager never hands application code raw runtime authority. */
  readonly rematerialiseOwnedDocument?: (request: Readonly<{
    applicationId: string;
    documentId: string;
    restorationKey: string | null;
    signal: AbortSignal;
  }>) => Promise<SynWareOwnedProjectionResult | null>;
  readonly requestFrame: (callback: (timestamp: number) => void) => unknown;
  readonly cancelFrame: (handle: unknown) => void;
  readonly observeError?: (error: unknown, context: string) => void;
}

interface LiveCloseToken {
  readonly token: WindowClosePreparationToken;
  readonly preparations: readonly Extract<WindowControllerClosePreparation, { readonly status: "ready" }>[];
  readonly reservedWindowControllerIds: readonly string[];
  readonly controllerAuthorities: ReadonlyMap<string, number>;
}

interface LiveApplicationClosePreparation {
  readonly token: ApplicationClosePreparationToken;
  readonly lease: ApplicationSessionCloseLease;
  readonly applicationControllerIds: readonly string[];
  readonly ownedDocumentIds: readonly string[];
  readonly documentPreparation: Extract<import("../Documents").DocumentCloseSetPreparation, { status: "ready" }> | null;
  readonly windowPreparation: Extract<WindowClosePreparation, { status: "ready" }> | null;
}

const documentReasonByWindowReason: Readonly<Record<WindowCloseRequest["reason"], DocumentCloseReason>> = {
  control: "window-control",
  command: "window-command",
  "parent-close": "parent-close",
  "application-quit": "application-quit",
  "runtime-dispose": "runtime-dispose",
};

const levelRank: Readonly<Record<WindowRecord["level"], number>> = {
  normal: 0,
  floating: 1,
  modal: 2,
  status: 3,
};

export class InvalidWindowClosePreparationError extends Error {
  constructor() {
    super("The window close preparation is foreign, stale, or already settled.");
    this.name = "InvalidWindowClosePreparationError";
  }
}

export class WindowManager {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly #controllers = new Map<string, WindowController>();
  readonly #applicationClosePreparations = new Map<string, LiveApplicationClosePreparation>();
  readonly #listeners = new Set<() => void>();
  readonly #order: string[] = [];
  readonly #indexes = {
    workspace: new Map<string, Set<string>>(),
    application: new Map<string, Set<string>>(),
    applicationSession: new Map<string, Set<string>>(),
    document: new Map<string, Set<string>>(),
    role: new Map<string, Set<string>>(),
    parent: new Map<string, Set<string>>(),
  };
  readonly #childrenByParent = new Map<string, Set<string>>();
  readonly #restorationKeys = new Map<string, string>();
  readonly #applicationResponders = new Map<string, { readonly handle: ResponderRegistrationHandle | null; count: number; readonly applicationId: string }>();
  readonly #ownedWindowUndoIds = new Set<string>();
  readonly #ownedApplicationUndoIds = new Set<string>();
  readonly #liveCloseTokens = new Map<string, LiveCloseToken>();
  readonly #closeReservations = new Set<string>();
  readonly #openingWindowControllerIds = new Set<string>();
  readonly #applicationWindowAdmissions = new Map<string, Set<Promise<unknown>>>();
  readonly #controllerAuthorities = new Map<string, number>();
  readonly #lastFocusedByWindow = new Map<string, string>();
  readonly #modalScopes = new Map<string, FocusScopeHandle>();
  readonly #sheetEndData = new Map<string, unknown>();
  readonly #closedSheetCompletions = new Map<string, WindowCloseResult>();
  readonly #presentationCoordinator: WindowDocumentPresentationCloseCoordinator;
  readonly #presentationRegistration;
  readonly #boundsScheduler: WindowBoundsScheduler;
  readonly #restorationIdentity: Readonly<{
    namespace: WindowRestorationDependencies["namespace"];
    installationId: string;
  }>;
  #snapshot: WindowManagerSnapshot;
  #generation = 0;
  #queryCandidateVisits = 0;
  #orderedCandidateVisits = 0;
  #fullRegistryScans = 0;
  #orderPublications = 0;
  #scheduledGeometryChanged = false;
  #runtimeDisposalPreparing = false;
  #runtimeDisposalGeneration = 0;
  #authorityGeneration = 0;
  #disposed = false;

  constructor(readonly dependencies: WindowManagerDependencies) {
    this.runtimeId = dependencies.runtimeId;
    if (
      dependencies.responders.runtimeId !== this.runtimeId ||
      dependencies.focus.runtimeId !== this.runtimeId ||
      dependencies.undo.runtimeId !== this.runtimeId
    ) throw new TypeError("Every WindowManager service must belong to the same runtime.");
    if (dependencies.restoration.ids !== dependencies.ids) {
      throw new TypeError("Window restoration and runtime window IDs must use the same injected port.");
    }
    if (
      dependencies.restoration.persistence.read("windows.workspace-v1") !== null &&
      dependencies.restoration.persistence.read("windows.installation-id") === null
    ) {
      throw new InvalidWindowRestorationSnapshotError(
        "A persisted window workspace without its installation identity cannot be restored safely.",
      );
    }
    const installationId = dependencies.restoration.installationIdentity.getOrCreate({
      namespace: dependencies.restoration.namespace,
      persistence: dependencies.restoration.persistence,
      create: () => dependencies.ids.next("installation"),
    });
    if (!installationId.trim()) throw new TypeError("Window installation identities must not be empty.");
    this.#restorationIdentity = Object.freeze({
      namespace: dependencies.restoration.namespace,
      installationId,
    });
    this.#snapshot = this.#makeSnapshot();
    this.#presentationCoordinator = new WindowDocumentPresentationCloseCoordinator(this, dependencies.ids, (error) => {
      this.#reportError(error, "document-presentation-close");
    });
    this.#presentationRegistration = dependencies.documents.registerPresentationCloseCoordinator(this.#presentationCoordinator);
    this.#boundsScheduler = new WindowBoundsScheduler({
      requestFrame: dependencies.requestFrame,
      cancelFrame: dependencies.cancelFrame,
      readBounds: (windowControllerId) => this.select(windowControllerId).record.bounds,
      commit: (windowControllerId, bounds, reason) => {
        if (this.#commitBounds(windowControllerId, bounds, reason)) this.#scheduledGeometryChanged = true;
      },
      publish: () => {
        if (!this.#scheduledGeometryChanged) return;
        this.#scheduledGeometryChanged = false;
        this.#publish(false);
      },
      observeError: (error) => this.#reportError(error, "window-bounds-frame-cancel"),
    });
  }

  snapshot = (): WindowManagerSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      this.#listeners.delete(listener);
    };
  };

  /** Window-manager-owned registration seam for host renderers; NSE never owns this registry. */
  registerContentFactory(factory: WindowContentFactoryRegistration): WindowContentRegistration {
    this.#assertMutable();
    return this.dependencies.content.register(factory);
  }

  create(request: CreateWindowRequest): WindowController {
    this.#assertMutable();
    this.dependencies.documents.assertApplicationAdmissionAllowed(request.applicationId);
    const id = request.id?.trim() || this.dependencies.ids.next("window");
    if (this.#controllers.has(id) || this.#openingWindowControllerIds.has(id)) {
      throw new Error(`Window controller "${id}" already exists or is settling a transition.`);
    }
    this.#closedSheetCompletions.delete(id);
    if (request.restorationKey && this.#restorationKeys.has(request.restorationKey)) {
      throw new Error(`Window restoration key "${request.restorationKey}" already exists.`);
    }
    if (request.parentWindowControllerId) {
      if (request.parentWindowControllerId === id) throw new Error("A window cannot parent itself.");
      const parent = this.#controllers.get(request.parentWindowControllerId);
      if (!parent) throw new Error(`Parent window "${request.parentWindowControllerId}" does not exist.`);
      if (parent.record.runtimeId !== this.runtimeId) throw new Error("Window relationships cannot cross runtimes.");
      if ((request.role === "sheet" || request.role === "modal") && !["standard", "modal"].includes(parent.record.role)) {
        throw new Error("Sheets and parented modals require a standard or modal parent.");
      }
      if ((request.role === "panel" || request.role === "hud") && parent.record.role !== "standard") {
        throw new Error("Owned panels and HUDs require a standard parent.");
      }
      let ancestor: WindowController | undefined = parent;
      const visited = new Set<string>();
      while (ancestor && !visited.has(ancestor.id)) {
        if (this.#closeReservations.has(ancestor.id)) {
          throw new Error(`Window "${ancestor.id}" is reserved by a closing transition.`);
        }
        visited.add(ancestor.id);
        ancestor = ancestor.record.parentWindowControllerId
          ? this.#controllers.get(ancestor.record.parentWindowControllerId)
          : undefined;
      }
    }
    if (request.documentId && !this.dependencies.documents.getDocument(request.documentId)) {
      throw new Error(`Document "${request.documentId}" is not open.`);
    }
    const record = createCanonicalWindowRecord(request, this.runtimeId, id);
    const parentResponderId = record.applicationSessionId
      ? `application:${record.applicationSessionId}`
      : "workspace";
    const controller = new WindowController(record, {
      responders: this.dependencies.responders,
      contentRegistry: this.dependencies.content,
      parentResponderId,
      workspaceResponderId: "workspace",
      webspringResponderId: "webspring",
      runtimeResponderId: "runtime",
      observeError: (error, phase) => this.#reportError(error, `window-controller:${phase}`),
    });
    this.#controllers.set(id, controller);
    this.#controllerAuthorities.set(id, ++this.#authorityGeneration);
    if (record.restorationKey) this.#restorationKeys.set(record.restorationKey, id);
    if (record.parentWindowControllerId) this.#setFor(this.#childrenByParent, record.parentWindowControllerId).add(id);
    return controller;
  }

  async open(windowControllerId: string, options: OpenWindowOptions = {}): Promise<WindowController> {
    const controller = this.select(windowControllerId);
    const ticket = this.dependencies.documents.captureApplicationMutation(controller.record.applicationId);
    const operation = this.#openWithApplicationAdmission(windowControllerId, options, ticket);
    return this.#trackApplicationWindowAdmission(ticket, operation);
  }

  #trackApplicationWindowAdmission<T>(
    ticket: ApplicationSessionMutationTicket | null,
    operation: Promise<T>,
  ): Promise<T> {
    if (!ticket) return operation;
    const admissions = this.#applicationWindowAdmissions.get(ticket.applicationId) ?? new Set<Promise<unknown>>();
    this.#applicationWindowAdmissions.set(ticket.applicationId, admissions);
    admissions.add(operation);
    void operation.finally(() => {
      admissions.delete(operation);
      if (admissions.size === 0 && this.#applicationWindowAdmissions.get(ticket.applicationId) === admissions) {
        this.#applicationWindowAdmissions.delete(ticket.applicationId);
      }
    }).catch(() => undefined);
    return operation;
  }

  async #openWithApplicationAdmission(
    windowControllerId: string,
    options: OpenWindowOptions,
    applicationTicket: ApplicationSessionMutationTicket | null,
  ): Promise<WindowController> {
    this.#assertMutable();
    const controller = this.select(windowControllerId);
    if (controller.record.state === "open" || controller.record.state === "minimised") {
      this.dependencies.documents.validateApplicationMutation(applicationTicket);
      if (options.activate !== false) this.makeKey(controller.id);
      return controller;
    }
    if (controller.record.state !== "closed") throw new Error(`Window "${controller.id}" cannot open from ${controller.record.state}.`);
    this.#assertControllerTransitionAvailable(controller.id);
    const controllerAuthority = this.#controllerAuthorities.get(controller.id)!;
    this.#openingWindowControllerIds.add(controller.id);
    const before = controller.record;
    this.#validateOpenRelationship(controller);
    let documentAssociated = false;
    let applicationRetained = false;
    let windowUndoCreated = false;
    let modalScopeOpened = false;
    try {
      if (before.applicationSessionId && before.applicationId) {
        this.#retainApplicationResponder(before.applicationSessionId, before.applicationId);
        applicationRetained = true;
      }
      if (!this.dependencies.undo.get({ kind: "window", id: controller.id })) {
        this.dependencies.undo.create({ kind: "window", id: controller.id });
        this.#ownedWindowUndoIds.add(controller.id);
        windowUndoCreated = true;
      }
      controller.replaceRecord({ ...before, state: "opening" });
      if (before.documentId && before.documentAssociationRole) {
        this.dependencies.documents.associateWindow(before.documentId, {
          windowControllerId: controller.id,
          role: before.documentAssociationRole,
        });
        documentAssociated = true;
      }
      await controller.loadContent(options.signal ?? new AbortController().signal);
      this.dependencies.documents.validateApplicationMutation(applicationTicket);
      this.#requireControllerAuthority(controller.id, controller, controllerAuthority);
      if (before.role === "modal" || before.role === "sheet") {
        this.#openModalScope(controller);
        modalScopeOpened = true;
      }
      this.#order.push(controller.id);
      this.#addIndexes(before);
      const zIndex = this.#order.length;
      controller.replaceRecord({ ...before, state: "open", zIndex });
      if (options.activate !== false) this.#makeKey(controller.id, false);
      else {
        this.#normaliseRelationshipOrder();
        this.#reindexZ();
      }
      controller.notifyDidOpen();
      this.#publish(true);
      return controller;
    } catch (error) {
      const stillAuthoritative = this.#controllers.get(controller.id) === controller &&
        this.#controllerAuthorities.get(controller.id) === controllerAuthority;
      if (stillAuthoritative) {
        if (modalScopeOpened) this.#closeModalScope(controller.id, false);
        if (documentAssociated && before.documentId) {
          try { this.dependencies.documents.dissociateWindow(before.documentId, controller.id); } catch { /* retain the original open error */ }
        }
        controller.rollbackLoadedContent();
        controller.replaceRecord(before);
        if (windowUndoCreated && this.#ownedWindowUndoIds.delete(controller.id)) {
          this.#tryCleanup("window-undo-open-rollback", () => this.dependencies.undo.remove({ kind: "window", id: controller.id }));
        }
        if (applicationRetained && before.applicationSessionId) this.#releaseApplicationResponder(before.applicationSessionId);
      }
      throw error;
    } finally {
      this.#openingWindowControllerIds.delete(controller.id);
    }
  }

  async openApplicationWindow(
    applicationId: string,
    options: OpenWindowOptions = {},
    applicationTicket: ApplicationSessionMutationTicket | null = this.dependencies.documents.captureApplicationMutation(applicationId),
  ): Promise<WindowController | null> {
    this.#assertMutable();
    this.dependencies.documents.validateApplicationMutation(applicationTicket);
    const existing = this.list({ applicationId }).find(({ record }) => (
      (record.state === "open" || record.state === "minimised") &&
      // Stage windows only. Document windows of this app (Keep Windows /
      // detached notes) keep the user's stacking order — making the first
      // listed document key would pop a background note in front on every
      // enter/exit of the owning app.
      record.documentId === null &&
      record.documentAssociationRole === null
    ));
    if (existing) {
      if (existing.record.state === "minimised") this.restore(existing.id);
      if (options.activate !== false) this.makeKey(existing.id);
      return existing;
    }
    const request = this.dependencies.resolveApplicationWindow?.(applicationId) ?? null;
    if (!request) return null;
    const controller = this.create(request);
    try {
      return await this.#trackApplicationWindowAdmission(
        applicationTicket,
        this.#openWithApplicationAdmission(controller.id, options, applicationTicket),
      );
    } catch (error) {
      this.#discardController(controller.id, "runtime-dispose");
      throw error;
    }
  }

  async requestCloseApplication(
    applicationId: string,
    request: WindowCloseRequest,
    authority?: ApplicationSessionCloseLease,
  ): Promise<WindowCloseResult | null> {
    this.#assertMutable();
    if (!applicationId || applicationId !== applicationId.trim()) {
      throw new TypeError("Application close IDs must be non-empty canonical identifiers.");
    }
    const lease = authority ?? this.beginApplicationClose(applicationId);
    const ownsLease = authority === undefined;
    try {
      const prepared = await this.prepareCloseApplication(applicationId, request, lease);
      if (!prepared) return null;
      if (prepared.status === "cancelled") return { outcome: "cancelled", windowControllerId: prepared.windowControllerId };
      if (prepared.status === "refused") return { outcome: "refused", windowControllerId: prepared.windowControllerId, reason: prepared.reason };
      const livePreparation = this.#applicationClosePreparations.get(prepared.token.tokenId);
      if (livePreparation && livePreparation.applicationControllerIds.length === 0 && livePreparation.ownedDocumentIds.length === 0) {
        await this.rollbackCloseApplication(prepared.token, lease);
        return null;
      }
      return await this.commitCloseApplication(prepared.token, lease);
    } finally {
      if (ownsLease) this.endApplicationClose(lease);
    }
  }

  async prepareCloseApplication(
    applicationId: string,
    request: WindowCloseRequest,
    lease: ApplicationSessionCloseLease,
  ): Promise<ApplicationClosePreparation | null> {
    this.#assertMutable();
    if (!applicationId || applicationId !== applicationId.trim()) throw new TypeError("Application close IDs must be non-empty canonical identifiers.");
    if (lease.applicationId !== applicationId) throw new Error("Application close authority belongs to another application.");
    this.validateApplicationCloseAuthority(lease);
    const applicationControllers = [...this.#controllers.values()].filter(({ record }) => record.applicationId === applicationId);
    const applicationControllerIds = Object.freeze(applicationControllers.map(({ id }) => id));
    const applicationIdSet = new Set(applicationControllerIds);
    const roots = Object.freeze(applicationControllers.filter(({ record }) => (
      !record.parentWindowControllerId || !applicationIdSet.has(record.parentWindowControllerId) || record.state === "closed"
    )).map(({ id }) => id));
    const coveredIds = new Set(roots.flatMap((id) => this.#collectOpenForestIds(id)));
    if ([...coveredIds].some((id) => !applicationIdSet.has(id))) throw new Error("Application close cannot absorb a foreign-application window forest.");
    if (coveredIds.size !== applicationIdSet.size) throw new Error("Application close could not reserve its complete window membership.");
    const ownedDocumentIds = this.dependencies.documents.applicationDocumentIds(applicationId);
    const documentIds = Object.freeze([...new Set([...ownedDocumentIds, ...this.#finalDocumentIdsWithin(coveredIds)])]);
    const resultWindowControllerId = roots[0] ?? `application:${applicationId}`;
    let documentPreparation: LiveApplicationClosePreparation["documentPreparation"] = null;
    let windowPreparation: LiveApplicationClosePreparation["windowPreparation"] = null;
    if (documentIds.length > 0) {
      const prepared = await this.dependencies.documents.prepareCloseDocuments(
        documentIds,
        documentReasonByWindowReason[request.reason],
        request.signal,
        roots,
      );
      if (prepared.status !== "ready") {
        return prepared.status === "cancelled"
          ? { status: "cancelled", windowControllerId: resultWindowControllerId }
          : { status: "refused", windowControllerId: resultWindowControllerId, reason: "blocked" };
      }
      documentPreparation = prepared;
    } else {
      const prepared = await this.prepareCloseForest(roots, request, resultWindowControllerId);
      if (prepared.status !== "ready") return prepared;
      windowPreparation = prepared;
    }
    try {
      this.dependencies.documents.validateApplicationCloseLease(lease, ownedDocumentIds);
      this.#validateApplicationWindowMembership(applicationId, applicationControllerIds);
      if (documentPreparation) this.dependencies.documents.validateCloseDocuments(documentPreparation);
      if (windowPreparation) this.validateClose(windowPreparation.token);
      const token = Object.freeze({
        tokenId: this.dependencies.ids.next("application-close-preparation"),
        runtimeId: this.runtimeId,
        applicationId,
        resultWindowControllerId,
      }) as ApplicationClosePreparationToken;
      this.#applicationClosePreparations.set(token.tokenId, {
        token,
        lease,
        applicationControllerIds,
        ownedDocumentIds,
        documentPreparation,
        windowPreparation,
      });
      return { status: "ready", token };
    } catch (error) {
      if (documentPreparation) await this.dependencies.documents.cancelCloseDocuments(documentPreparation);
      if (windowPreparation) this.rollbackClose(windowPreparation.token);
      throw error;
    }
  }

  validateCloseApplication(token: ApplicationClosePreparationToken, lease: ApplicationSessionCloseLease): void {
    const prepared = this.#applicationClosePreparations.get(token.tokenId);
    if (!prepared || prepared.token !== token || prepared.lease !== lease || token.runtimeId !== this.runtimeId) {
      throw new Error("Application close preparation is stale or invalid.");
    }
    this.dependencies.documents.validateApplicationCloseLease(lease, prepared.ownedDocumentIds);
    this.#validateApplicationWindowMembership(token.applicationId, prepared.applicationControllerIds);
    if (prepared.documentPreparation) this.dependencies.documents.validateCloseDocuments(prepared.documentPreparation);
    if (prepared.windowPreparation) this.validateClose(prepared.windowPreparation.token);
  }

  async commitCloseApplication(token: ApplicationClosePreparationToken, lease: ApplicationSessionCloseLease): Promise<WindowCloseResult> {
    this.validateCloseApplication(token, lease);
    const prepared = this.#applicationClosePreparations.get(token.tokenId)!;
    if (prepared.documentPreparation) {
      this.dependencies.documents.commitCloseDocuments(prepared.documentPreparation);
      this.#applicationClosePreparations.delete(token.tokenId);
      try {
        await this.dependencies.documents.settleClosedDocuments(prepared.documentPreparation.documentIds);
      } catch (error) {
        // Structural close has already committed. Settlement failures are
        // observable diagnostics, not a fictitious rollback opportunity.
        this.#reportError(error, "application-close-settlement");
      }
    } else if (prepared.windowPreparation) {
      this.commitClose(prepared.windowPreparation.token);
      this.#applicationClosePreparations.delete(token.tokenId);
    } else {
      this.#applicationClosePreparations.delete(token.tokenId);
    }
    if (this.dependencies.documents.applicationDocumentIds(token.applicationId).length > 0 ||
        [...this.#controllers.values()].some(({ record }) => record.applicationId === token.applicationId)) {
      throw new Error(`Application "${token.applicationId}" close left live membership.`);
    }
    return { outcome: "closed", windowControllerId: token.resultWindowControllerId };
  }

  async rollbackCloseApplication(token: ApplicationClosePreparationToken, lease: ApplicationSessionCloseLease): Promise<void> {
    const prepared = this.#applicationClosePreparations.get(token.tokenId);
    if (!prepared || prepared.token !== token || prepared.lease !== lease) return;
    this.#applicationClosePreparations.delete(token.tokenId);
    if (prepared.documentPreparation) await this.dependencies.documents.cancelCloseDocuments(prepared.documentPreparation);
    if (prepared.windowPreparation) this.rollbackClose(prepared.windowPreparation.token);
  }

  beginApplicationClose(applicationId: string): ApplicationSessionCloseLease {
    this.#assertMutable();
    return this.dependencies.documents.acquireApplicationCloseLease(applicationId);
  }

  validateApplicationCloseAuthority(authority: ApplicationSessionCloseLease): void {
    this.dependencies.documents.validateApplicationCloseLease(
      authority,
      this.dependencies.documents.applicationDocumentIds(authority.applicationId),
    );
  }

  endApplicationClose(authority: ApplicationSessionCloseLease): void {
    this.dependencies.documents.releaseApplicationCloseLease(authority);
  }

  assertApplicationAdmissionAllowed(applicationId: string): void {
    this.dependencies.documents.assertApplicationAdmissionAllowed(applicationId);
  }

  captureApplicationMutation(applicationId: string): ApplicationSessionMutationTicket {
    const ticket = this.dependencies.documents.captureApplicationMutation(applicationId);
    if (!ticket) throw new TypeError("Application mutation tickets require an application ID.");
    return ticket;
  }

  validateApplicationMutation(authority: ApplicationSessionMutationTicket): void {
    this.dependencies.documents.validateApplicationMutation(authority);
  }

  advanceApplicationSessionEpoch(applicationId: string): void {
    this.dependencies.documents.advanceApplicationSessionEpoch(applicationId);
  }

  async requestClose(windowControllerId: string, request: WindowCloseRequest): Promise<WindowCloseResult> {
    this.#assertMutable();
    const controller = this.select(windowControllerId);
    if (
      (request.reason === "control" || request.reason === "command") &&
      this.#blockedWindowIds().has(windowControllerId) &&
      !this.#hasModalDescendant(windowControllerId)
    ) return { outcome: "refused", windowControllerId, reason: "blocked" };
    const documentClose = await this.#requestCloseWithFinalDocument([windowControllerId], windowControllerId, request);
    if (documentClose) return documentClose;
    const preparation = await this.prepareClose(windowControllerId, request);
    if (preparation.status !== "ready") {
      if (preparation.status === "cancelled") return { outcome: "cancelled", windowControllerId };
      return { outcome: "refused", windowControllerId, reason: preparation.reason };
    }
    return this.commitClose(preparation.token);
  }

  prepareClose(windowControllerId: string, request: WindowCloseRequest): Promise<WindowClosePreparation> {
    return this.prepareCloseForest([windowControllerId], request, windowControllerId);
  }

  async prepareCloseForest(
    rootWindowControllerIds: readonly string[],
    request: WindowCloseRequest,
    resultWindowControllerId = rootWindowControllerIds[0] ?? "",
  ): Promise<WindowClosePreparation> {
    this.#assertLive();
    const reservedWindowControllerIds = Object.freeze([
      ...new Set(rootWindowControllerIds.flatMap((id) => this.#collectOpenForestIds(id))),
    ]);
    if (reservedWindowControllerIds.some((id) => this.#closeReservations.has(id))) {
      return { status: "refused", windowControllerId: resultWindowControllerId, reason: "blocked" };
    }
    for (const id of reservedWindowControllerIds) this.#closeReservations.add(id);
    const controllerAuthorities = new Map(reservedWindowControllerIds.map((id) => [
      id,
      this.#controllerAuthorities.get(id) ?? -1,
    ]));
    const preparations: Array<Extract<WindowControllerClosePreparation, { readonly status: "ready" }>> = [];
    const preparedIds: string[] = [];
    const visiting = new Set<string>();
    const prepareNode = async (id: string): Promise<WindowClosePreparedNode | WindowClosePreparation> => {
      request.signal?.throwIfAborted();
      const controller = this.select(id);
      this.#requireControllerAuthority(id, controller, controllerAuthorities.get(id)!);
      if ((request.reason === "control" || request.reason === "command") && !controller.record.style.includes("closable")) {
        return { status: "refused", windowControllerId: id, reason: "not-closable" };
      }
      if (visiting.has(id)) throw new Error("Window relationship cycle encountered during close preparation.");
      visiting.add(id);
      const children: WindowClosePreparedNode[] = [];
      for (const childId of this.#openChildrenTopmostFirst(id)) {
        const child = await prepareNode(childId);
        if ("status" in child) {
          visiting.delete(id);
          return child;
        }
        children.push(child);
      }
      const pendingControllerPreparation = controller.prepareClose(request);
      let controllerPreparation: WindowControllerClosePreparation;
      if (request.signal) {
        const signal = request.signal;
        let abortListener: (() => void) | null = null;
        const aborted = new Promise<{ readonly kind: "aborted" }>((resolve) => {
          abortListener = () => resolve({ kind: "aborted" });
          if (signal.aborted) abortListener();
          else signal.addEventListener("abort", abortListener, { once: true });
        });
        const outcome = await Promise.race([
          pendingControllerPreparation.then((value) => ({ kind: "prepared" as const, value })),
          aborted,
        ]);
        if (abortListener) signal.removeEventListener("abort", abortListener);
        if (outcome.kind === "aborted") {
          void pendingControllerPreparation.then((late) => {
            if (late.status === "ready") this.#tryCleanup("window-close-late-rollback", () => late.rollback());
          }).catch((error) => {
            if (!signal.aborted) this.#reportError(error, "window-close-late-prepare");
          });
          signal.throwIfAborted();
          throw new DOMException("Window close preparation was cancelled.", "AbortError");
        }
        controllerPreparation = outcome.value;
      } else {
        controllerPreparation = await pendingControllerPreparation;
      }
      try {
        request.signal?.throwIfAborted();
        this.#requireControllerAuthority(id, controller, controllerAuthorities.get(id)!);
      } catch (error) {
        if (controllerPreparation.status === "ready") {
          this.#tryCleanup("window-close-stale-rollback", () => controllerPreparation.rollback());
        }
        throw error;
      }
      visiting.delete(id);
      if (controllerPreparation.status === "cancelled") {
        return { status: "cancelled", windowControllerId: id, reason: "delegate-cancelled" };
      }
      if (controllerPreparation.status === "refused") return controllerPreparation;
      preparations.push(controllerPreparation);
      preparedIds.push(id);
      return Object.freeze({
        windowControllerId: id,
        children: Object.freeze(children),
        controllerPreparation,
      });
    };

    try {
      const roots: WindowClosePreparedNode[] = [];
      for (const id of rootWindowControllerIds) {
        const root = await prepareNode(id);
        if ("status" in root) {
          this.#rollbackPreparations(preparations);
          this.#releaseCloseReservations(reservedWindowControllerIds);
          return root.status === "cancelled"
            ? { ...root, windowControllerId: resultWindowControllerId }
            : root;
        }
        roots.push(root);
      }
      const token = Object.freeze({
        tokenId: this.dependencies.ids.next("window-close-preparation"),
        runtimeId: this.runtimeId,
        reason: request.reason,
        roots: Object.freeze(roots),
        preparedWindowControllerIds: Object.freeze(preparedIds),
      }) as WindowClosePreparationToken;
      this.#liveCloseTokens.set(token.tokenId, {
        token,
        preparations: Object.freeze(preparations),
        reservedWindowControllerIds,
        controllerAuthorities,
      });
      return { status: "ready", token };
    } catch (error) {
      this.#rollbackPreparations(preparations);
      this.#releaseCloseReservations(reservedWindowControllerIds);
      if (request.signal?.aborted) {
        return { status: "cancelled", windowControllerId: resultWindowControllerId, reason: "aborted" };
      }
      throw error;
    }
  }

  commitClose(preparation: WindowClosePreparationToken): WindowCloseResult {
    return this.#commitClose(preparation);
  }

  validateClose(preparation: WindowClosePreparationToken): void {
    this.#requireValidLiveClose(preparation);
  }

  commitCloseTransaction(
    preparation: WindowClosePreparationToken,
    commitDocument: () => void,
    coveredAssociations: Readonly<Record<string, readonly string[]>> = Object.freeze({}),
  ): WindowCloseResult {
    return this.#commitClose(preparation, commitDocument, coveredAssociations);
  }

  rollbackClose(preparation: WindowClosePreparationToken): void {
    const live = this.#requireLiveToken(preparation);
    this.#liveCloseTokens.delete(preparation.tokenId);
    this.#rollbackPreparations(live.preparations);
    this.#releaseCloseReservations(live.reservedWindowControllerIds);
  }

  order(windowControllerId: string, placement: WindowOrderPlacement): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    const controller = this.select(windowControllerId);
    if (controller.record.state !== "open" && controller.record.state !== "minimised") return;
    if (this.#blockedWindowIds().has(windowControllerId)) return;
    this.#moveRelationshipTree(windowControllerId, placement);
    this.#reindexZ();
    this.#publish(true);
  }

  makeKey(windowControllerId: string): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#makeKey(windowControllerId, true);
  }

  /**
   * No window is key or main: the user clicked the application behind them.
   * The mounted application is not a managed window, so choosing it leaves
   * every window, floating panels included, drawn inactive, and commands go
   * to the application rather than to the window last clicked. Clicking a
   * window makes it key again.
   */
  resignKey(): void {
    this.#assertMutable();
    if (!this.#orderedControllers().some(({ record }) => record.isKey || record.isMain)) return;
    this.#rememberCurrentWindowFocus();
    for (const controller of this.#orderedControllers()) {
      if (controller.record.isKey || controller.record.isMain) {
        controller.replaceRecord({ ...controller.record, isKey: false, isMain: false });
      }
    }
    const { windowResponderId: _window, documentResponderId: _document, ...anchors } = this.dependencies.focus.getActiveAnchors();
    this.dependencies.focus.setActiveAnchors(anchors);
    this.#publish(false);
  }

  makeMain(windowControllerId: string): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    const target = this.select(windowControllerId);
    if (target.record.role !== "standard" || target.record.state !== "open") return;
    for (const controller of this.#orderedControllers()) {
      const isMain = controller.id === target.id;
      if (controller.record.isMain !== isMain) controller.replaceRecord({ ...controller.record, isMain });
    }
    this.#publish(false);
  }

  async attachSheet(parentWindowControllerId: string, sheetWindowControllerId: string): Promise<void> {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(parentWindowControllerId);
    this.#assertControllerTransitionAvailable(sheetWindowControllerId);
    const parent = this.select(parentWindowControllerId);
    const sheet = this.select(sheetWindowControllerId);
    if (parent.record.state !== "open" || !["standard", "modal"].includes(parent.record.role)) {
      throw new Error("A sheet requires an open standard or modal parent.");
    }
    if (sheet.record.role !== "sheet" || sheet.record.parentWindowControllerId !== parent.id) {
      throw new Error("The sheet relationship does not match its declared parent.");
    }
    const attached = this.#openChildrenTopmostFirst(parent.id).find((id) => (
      id !== sheet.id && this.select(id).record.role === "sheet"
    ));
    if (attached) throw new Error(`Window "${parent.id}" already has an attached sheet.`);
    if (sheet.record.state === "closed") {
      await this.open(sheet.id);
      return;
    }
    if (sheet.record.state !== "open") throw new Error(`Sheet "${sheet.id}" cannot attach from ${sheet.record.state}.`);
    this.#makeKey(sheet.id, true);
  }

  endSheet(sheetWindowControllerId: string, data?: unknown): Promise<WindowCloseResult> {
    this.#assertMutable();
    this.#assertLive();
    const closedCompletion = this.#closedSheetCompletions.get(sheetWindowControllerId);
    if (closedCompletion) return Promise.resolve(closedCompletion);
    const sheet = this.select(sheetWindowControllerId);
    if (sheet.record.role !== "sheet") throw new Error(`Window "${sheet.id}" is not a sheet.`);
    return sheet.beginSheetCompletion(async () => {
      this.#sheetEndData.set(sheet.id, data);
      try {
        const result = await this.requestClose(sheet.id, { reason: "command" });
        return sheet.sheetCompletion ?? result;
      } finally {
        this.#sheetEndData.delete(sheet.id);
      }
    });
  }

  setBounds(windowControllerId: string, bounds: WindowBounds, reason: WindowBoundsChangeReason): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#assertLive();
    if (this.#commitBounds(windowControllerId, bounds, reason)) this.#publish(false);
  }

  updatePresentation(windowControllerId: string, presentation: { readonly title: string; readonly anchor: WindowAnchor | null }): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#assertLive();
    const controller = this.select(windowControllerId);
    const current = controller.record;
    if (current.title === presentation.title && JSON.stringify(current.anchor) === JSON.stringify(presentation.anchor)) return;
    controller.replaceRecord({ ...current, title: presentation.title, anchor: presentation.anchor });
    this.#publish(false);
  }

  scheduleBoundsChange(windowControllerId: string, change: WindowScheduledBoundsChange): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#assertLive();
    const controller = this.select(windowControllerId);
    const values = change.kind === "replace" ? change.bounds : change.delta;
    assertFiniteWindowBounds(values, change.kind === "replace" ? "bounds" : "delta", change.kind === "replace");
    if (
      controller.record.state !== "open" ||
      this.#blockedWindowIds().has(windowControllerId) ||
      this.isCompactPresentation(windowControllerId) ||
      controller.geometryState.zoomed
    ) return;
    const resize = change.reason === "pointer-resize" || change.reason === "keyboard-resize";
    if (resize && !controller.record.style.includes("resizable")) return;
    if (!resize && (values.width !== 0 || values.height !== 0) && change.kind === "delta") {
      throw new TypeError("Window move deltas cannot resize the window.");
    }
    this.#boundsScheduler.schedule(windowControllerId, change);
  }

  flushScheduledBoundsChange(windowControllerId: string): void {
    this.#boundsScheduler.flush(windowControllerId);
  }

  cancelScheduledBoundsChange(windowControllerId: string): void {
    this.#boundsScheduler.cancel(windowControllerId);
  }

  isCompactPresentation(windowControllerId: string): boolean {
    const controller = this.select(windowControllerId);
    return this.dependencies.screen.getCurrentSnapshot().breakpoint === "compact" && controller.record.mobilePolicy !== "hidden";
  }

  minimise(windowControllerId: string): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#assertLive();
    const controller = this.select(windowControllerId);
    if (
      controller.record.state !== "open" ||
      this.#blockedWindowIds().has(windowControllerId) ||
      !controller.record.style.includes("minimisable")
    ) return;
    this.#boundsScheduler.cancel(windowControllerId);
    controller.replaceGeometry(
      { ...controller.record, state: "minimised", isKey: false },
      {
        ...controller.geometryState,
        minimisedFrom: controller.geometryState.zoomed ? "zoomed" : "open",
      },
    );
    this.#restoreKeyAndMain();
    this.#publish(false);
  }

  restore(windowControllerId: string): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#assertLive();
    const controller = this.select(windowControllerId);
    if (controller.record.state !== "minimised" || this.#blockedWindowIds().has(windowControllerId)) return;
    const geometry = controller.geometryState;
    const restoringZoom = geometry.minimisedFrom === "zoomed";
    const bounds = restoringZoom
      ? this.dependencies.screen.getSnapshot().workArea
      : this.#constrainBounds(controller, geometry.normalBounds);
    controller.replaceGeometry(
      { ...controller.record, bounds, state: "open" },
      { normalBounds: geometry.normalBounds, zoomed: restoringZoom, minimisedFrom: null },
    );
    this.#makeKey(windowControllerId, false);
    this.#publish(true);
  }

  zoom(windowControllerId: string): void {
    this.#assertMutable();
    this.#assertControllerTransitionAvailable(windowControllerId);
    this.#assertLive();
    const controller = this.select(windowControllerId);
    if (
      controller.record.state !== "open" ||
      this.#blockedWindowIds().has(windowControllerId) ||
      !controller.record.style.includes("zoomable") ||
      this.isCompactPresentation(windowControllerId)
    ) return;
    this.#boundsScheduler.cancel(windowControllerId);
    const geometry = controller.geometryState;
    if (geometry.zoomed) {
      const bounds = this.#constrainBounds(controller, geometry.normalBounds);
      controller.replaceGeometry(
        { ...controller.record, bounds },
        { normalBounds: bounds, zoomed: false, minimisedFrom: null },
      );
    } else {
      const bounds = this.dependencies.screen.getSnapshot().workArea;
      controller.replaceGeometry(
        { ...controller.record, bounds },
        { normalBounds: controller.record.bounds, zoomed: true, minimisedFrom: null },
      );
    }
    this.#publish(false);
  }

  cycle(direction: "forward" | "backward"): WindowController | null {
    this.#assertMutable();
    const blocked = new Set(this.#snapshot.blockedWindowControllerIds);
    const candidates = this.#orderedControllers().filter(({ record, id }) => (
      record.state === "open" && !blocked.has(id)
    ));
    if (candidates.length < 2) return null;
    const keyIndex = Math.max(0, candidates.findIndex(({ id }) => id === this.#snapshot.keyWindowControllerId));
    const offset = direction === "forward" ? 1 : -1;
    const target = candidates[(keyIndex + offset + candidates.length) % candidates.length];
    this.order(target.id, "front");
    this.makeKey(target.id);
    return target;
  }

  list(query: WindowListQuery = {}): readonly WindowController[] {
    if (!this.#hasIndexedQuery(query)) this.#fullRegistryScans += 1;
    const candidates = this.#indexedCandidates(query);
    this.#queryCandidateVisits += candidates.size;
    this.#orderedCandidateVisits += candidates.size;
    const controllers = [...candidates]
      .map((id) => this.#controllers.get(id))
      .filter((controller): controller is WindowController => Boolean(controller))
      .filter((controller) => this.#matches(controller.record, query))
      .sort((left, right) => left.record.zIndex - right.record.zIndex);
    return Object.freeze(controllers);
  }

  select(windowControllerId: string): WindowController {
    const controller = this.#controllers.get(windowControllerId);
    if (!controller) throw new Error(`Window controller "${windowControllerId}" does not exist.`);
    return controller;
  }

  async dismissTransientWindows(request: DismissTransientWindowsRequest): Promise<void> {
    this.#assertMutable();
    const transient = [...this.#orderedControllers()].reverse().filter(({ record }) => (
      record.role === "popover" && !record.pinned && record.id !== request.except
    ));
    for (const controller of transient) await this.requestClose(controller.id, { reason: "command" });
  }

  createRestorationSnapshot(): WindowRestorationSnapshot {
    this.#assertLive();
    const capturedAtEpochMs = this.dependencies.restoration.clock.now();
    const windows: RestorableWindowRecord[] = [];
    for (const controller of this.#controllers.values()) {
      const record = controller.record;
      if (!record.restorationKey) continue;
      windows.push({
        windowControllerId: record.id,
        workspaceId: record.workspaceId,
        applicationId: record.applicationId,
        applicationSessionId: record.applicationSessionId,
        documentId: record.documentId,
        documentKind: record.documentId ? this.dependencies.documents.getDocument(record.documentId)?.documentKind ?? null : null,
        documentAssociationRole: record.documentAssociationRole,
        representedDocument: record.representedDocument,
        toolbar: record.toolbar,
        role: record.role,
        style: record.style,
        title: record.title,
        content: record.content,
        contentRestorationState: controller.contentRestorationState,
        normalBounds: controller.geometryState.normalBounds,
        minimumSize: record.minimumSize,
        maximumSize: record.maximumSize,
        level: record.level,
        parentWindowControllerId: record.parentWindowControllerId,
        anchor: record.anchor,
        pinned: record.pinned,
        wasMinimised: record.state === "minimised",
        wasZoomed: controller.geometryState.zoomed || controller.geometryState.minimisedFrom === "zoomed",
        mobilePolicy: record.mobilePolicy,
        restorationKey: record.restorationKey,
        zOrder: record.zIndex,
        chromeMode: record.chromeMode,
        smoothSurface: record.smoothSurface,
      });
    }
    const durableIds = new Set(windows.map(({ windowControllerId }) => windowControllerId));
    const raw = {
      schemaVersion: 1,
      namespace: this.#restorationIdentity.namespace,
      installationId: this.#restorationIdentity.installationId,
      capturedAtEpochMs,
      keyWindowControllerId: this.#snapshot.keyWindowControllerId && durableIds.has(this.#snapshot.keyWindowControllerId)
        ? this.#snapshot.keyWindowControllerId
        : null,
      mainWindowControllerId: this.#snapshot.mainWindowControllerId && durableIds.has(this.#snapshot.mainWindowControllerId)
        ? this.#snapshot.mainWindowControllerId
        : null,
      windows,
    } as WindowRestorationSnapshot;
    validateWindowRestorationSnapshot(raw, {
      ...this.#restorationIdentity,
      runtimeId: this.runtimeId,
    });
    return freezeWindowRestorationSnapshot(raw);
  }

  saveRestorationSnapshot(): WindowRestorationSnapshot {
    const snapshot = this.createRestorationSnapshot();
    this.dependencies.restoration.persistence.write(
      "windows.workspace-v1",
      snapshot as unknown as import("./windowTypes").WindowSerializableValue,
    );
    return snapshot;
  }

  async restorePersistedWorkspace(signal?: AbortSignal): Promise<WindowRestorationReport> {
    this.#assertMutable();
    this.#assertLive();
    const persisted = this.dependencies.restoration.persistence.read("windows.workspace-v1");
    if (persisted === null) return emptyRestorationReport();
    return this.restoreWorkspace(persisted as WindowRestorationSnapshot, signal);
  }

  /**
   * Offers the owning app's bundle hook the chance to rematerialise a
   * missing restoration document (e.g. Leather projections from Publisher
   * data). Returns true when a live document owned by the same application
   * exists afterwards. Every failure mode — no loader, no hook, hook throw,
   * wrong document, foreign owner — resolves false so the window fails
   * closed with `document-unavailable`, exactly as without the seam.
   */
  async #rematerialiseOwnedDocument(
    source: RestorableWindowRecord,
    operationSignal: AbortSignal,
  ): Promise<string | null> {
    const rematerialise = this.dependencies.rematerialiseOwnedDocument;
    const applicationId = source.applicationId;
    const documentId = source.documentId;
    if (!rematerialise || !applicationId || !documentId || source.documentKind !== "projection") return null;
    if (operationSignal.aborted) return null;
    let result: SynWareOwnedProjectionResult | null = null;
    try {
      result = await rematerialise(Object.freeze({
        applicationId,
        documentId,
        restorationKey: source.restorationKey,
        signal: operationSignal,
      }));
    } catch (error) {
      this.#reportError(error, `window.restore.rematerialise:${documentId}`);
      return null;
    }
    if (!result || result.documentId !== documentId || result.documentKind !== "projection") return null;
    const document = this.dependencies.documents.getDocument(documentId);
    const valid = Boolean(
      document &&
      document.applicationId === applicationId &&
      document.id === documentId &&
      document.type.id === result.documentTypeId &&
      document.documentKind === "projection" &&
      document.readOnly &&
      document.state === "clean" &&
      !document.hasUnsavedChanges &&
      document.dirtyRevision === 0 &&
      document.location === null &&
      document.conflict === null
    );
    if (!valid) {
      this.dependencies.documents.discardRestorationProjection(documentId, applicationId);
      return null;
    }
    return documentId;
  }

  async restoreWorkspace(snapshot: WindowRestorationSnapshot, signal?: AbortSignal): Promise<WindowRestorationReport> {
    this.#assertMutable();
    this.#assertLive();
    const validated = freezeWindowRestorationSnapshot(validateWindowRestorationSnapshot(snapshot, {
      ...this.#restorationIdentity,
      runtimeId: this.runtimeId,
    }));
    const operationSignal = signal ?? new AbortController().signal;
    operationSignal.throwIfAborted();
    const restoredWindowControllerIds: string[] = [];
    const reusedWindowControllerIds: string[] = [];
    const failures: WindowRestorationFailure[] = [];
    const actualIdBySavedId = new Map<string, string>();
    const created: Array<{
      readonly source: RestorableWindowRecord;
      readonly controller: WindowController;
      readonly applicationTicket: ApplicationSessionMutationTicket | null;
    }> = [];
    const applicationTicketsByControllerId = new Map<string, ApplicationSessionMutationTicket | null>();
    const restorationOnlyProjectionIds = new Map<string, string>();
    const cleanupRestorationOnlyProjections = () => {
      for (const [documentId, applicationId] of restorationOnlyProjectionIds) {
        this.dependencies.documents.discardRestorationProjection(documentId, applicationId);
      }
    };
    const abortRestoration = (error?: unknown): never => {
      this.#rollbackRestorationControllers(created);
      cleanupRestorationOnlyProjections();
      if (error !== undefined) throw error;
      operationSignal.throwIfAborted();
      throw new DOMException("Window restoration was cancelled.", "AbortError");
    };

    for (const source of this.#orderedRestorationRecords(validated.windows)) {
      if (operationSignal.aborted) abortRestoration();
      let applicationTicket: ApplicationSessionMutationTicket | null = null;
      try {
        applicationTicket = source.applicationId
          ? this.dependencies.documents.captureApplicationMutation(source.applicationId)
          : null;
      } catch (error) {
        failures.push(restorationFailure(source, "relationship-unavailable", error));
        continue;
      }
      const parentWindowControllerId = source.parentWindowControllerId
        ? actualIdBySavedId.get(source.parentWindowControllerId) ?? null
        : null;
      if (source.parentWindowControllerId && !parentWindowControllerId) {
        failures.push(restorationFailure(source, "relationship-unavailable", new Error(`Parent window "${source.parentWindowControllerId}" could not be restored.`)));
        continue;
      }
      const existingId = this.#restorationKeys.get(source.restorationKey);
      if (existingId) {
        const existing = this.#controllers.get(existingId);
        if (!existing || existing.record.applicationId !== source.applicationId ||
            existing.record.applicationSessionId !== source.applicationSessionId ||
            existing.record.documentId !== source.documentId ||
            existing.record.documentAssociationRole !== source.documentAssociationRole ||
            existing.record.workspaceId !== source.workspaceId ||
            existing.record.role !== source.role ||
            existing.record.parentWindowControllerId !== parentWindowControllerId) {
          failures.push(restorationFailure(
            source,
            "identity-conflict",
            new Error(`Restoration key "${source.restorationKey}" belongs to another window identity.`),
          ));
          continue;
        }
        try { this.dependencies.documents.validateApplicationMutation(applicationTicket); }
        catch (error) {
          failures.push(restorationFailure(source, "relationship-unavailable", error));
          continue;
        }
        actualIdBySavedId.set(source.windowControllerId, existingId);
        reusedWindowControllerIds.push(existingId);
        applicationTicketsByControllerId.set(existingId, applicationTicket);
        continue;
      }
      if (this.#controllers.has(source.windowControllerId)) {
        failures.push(restorationFailure(source, "identity-conflict", new Error(`Window controller "${source.windowControllerId}" already exists.`)));
        continue;
      }
      if (source.documentId) {
        const existingDocument = this.dependencies.documents.getDocument(source.documentId);
        if (existingDocument && source.documentKind !== undefined && source.documentKind !== null && existingDocument.documentKind !== source.documentKind) {
          failures.push(restorationFailure(source, "document-unavailable", new Error(`Document "${source.documentId}" has the wrong semantic kind.`)));
          continue;
        }
        if (!existingDocument) {
          const rematerialised = await this.#rematerialiseOwnedDocument(source, operationSignal);
          if (!rematerialised) {
            failures.push(restorationFailure(source, "document-unavailable", new Error(`Document "${source.documentId}" is not open.`)));
            continue;
          }
          restorationOnlyProjectionIds.set(rematerialised, source.applicationId!);
        }
        const resolvedDocument = this.dependencies.documents.getDocument(source.documentId);
        if (!resolvedDocument || (source.documentKind !== undefined && source.documentKind !== null && resolvedDocument.documentKind !== source.documentKind)) {
          failures.push(restorationFailure(source, "document-unavailable", new Error(`Document "${source.documentId}" is not open.`)));
          continue;
        }
      }
      let restoredContent;
      try {
        restoredContent = await this.dependencies.content.restore(
          source.content,
          source.contentRestorationState,
          operationSignal,
          source.applicationId,
        );
      } catch (error) {
        if (operationSignal.aborted) abortRestoration(error);
        failures.push(restorationFailure(
          source,
          error instanceof WindowContentFactoryUnavailableError ? "content-unavailable" : "content-restore-failed",
          error,
        ));
        continue;
      }
      if (operationSignal.aborted) abortRestoration();
      try { this.dependencies.documents.validateApplicationMutation(applicationTicket); }
      catch (error) {
        failures.push(restorationFailure(source, "relationship-unavailable", error));
        continue;
      }
      try {
        const controller = this.create({
          id: source.windowControllerId,
          workspaceId: source.workspaceId,
          applicationId: source.applicationId,
          applicationSessionId: source.applicationSessionId,
          documentId: source.documentId,
          documentAssociationRole: source.documentAssociationRole,
          representedDocument: source.representedDocument,
          toolbar: source.toolbar,
          role: source.role,
          style: source.style,
          title: source.title,
          content: restoredContent.descriptor,
          bounds: source.normalBounds,
          minimumSize: source.minimumSize,
          maximumSize: source.maximumSize,
          level: source.level,
          parentWindowControllerId,
          anchor: source.anchor,
          pinned: source.pinned,
          mobilePolicy: source.mobilePolicy,
          restorationKey: source.restorationKey,
          chromeMode: canonicalWindowChromeMode(source.role, source.chromeMode),
          smoothSurface: normaliseWindowSmoothSurface(source.smoothSurface),
        });
        controller.setContentRestorationState(restoredContent.state);
        actualIdBySavedId.set(source.windowControllerId, controller.id);
        applicationTicketsByControllerId.set(controller.id, applicationTicket);
        created.push({ source, controller, applicationTicket });
      } catch (error) {
        failures.push(restorationFailure(source, "relationship-unavailable", error));
      }
    }

    for (const entry of created) {
      if (operationSignal.aborted) abortRestoration();
      try { this.dependencies.documents.validateApplicationMutation(entry.applicationTicket); }
      catch (error) {
        failures.push(restorationFailure(entry.source, "relationship-unavailable", error));
        if (this.#controllers.get(entry.controller.id) === entry.controller) {
          this.#discardController(entry.controller.id, "load-rollback");
        }
        continue;
      }
      if (this.#controllers.get(entry.controller.id) !== entry.controller) {
        failures.push(restorationFailure(entry.source, "relationship-unavailable", new Error("The restored window authority became stale.")));
        continue;
      }
      const presentation = resolveWindowPresentation(entry.controller.record, this.dependencies.screen.getCurrentSnapshot());
      if (!presentation.visible) {
        restoredWindowControllerIds.push(entry.controller.id);
        continue;
      }
      if (entry.source.parentWindowControllerId) {
        const parentId = actualIdBySavedId.get(entry.source.parentWindowControllerId);
        if (!parentId || this.select(parentId).record.state !== "open") {
          failures.push(restorationFailure(entry.source, "relationship-unavailable", new Error("The restored parent window did not open.")));
          this.#discardController(entry.controller.id, "load-rollback");
          continue;
        }
      }
      try {
        await this.open(entry.controller.id, { activate: false, signal: operationSignal });
        this.dependencies.documents.validateApplicationMutation(entry.applicationTicket);
        if (this.#controllers.get(entry.controller.id) !== entry.controller) {
          throw new Error("The restored window authority became stale while opening.");
        }
        if (entry.source.wasZoomed && !this.isCompactPresentation(entry.controller.id)) this.zoom(entry.controller.id);
        if (entry.source.wasMinimised) this.minimise(entry.controller.id);
        restoredWindowControllerIds.push(entry.controller.id);
      } catch (error) {
        if (operationSignal.aborted) abortRestoration(error);
        failures.push(restorationFailure(entry.source, "content-load-failed", error));
        this.#discardController(entry.controller.id, "load-rollback");
      }
    }

    const restoredOrReused = new Set([...restoredWindowControllerIds, ...reusedWindowControllerIds].filter((id) => {
      if (!this.#controllers.has(id)) return false;
      try {
        this.dependencies.documents.validateApplicationMutation(applicationTicketsByControllerId.get(id) ?? null);
        return true;
      } catch {
        return false;
      }
    }));
    const mainId = validated.mainWindowControllerId
      ? actualIdBySavedId.get(validated.mainWindowControllerId) ?? null
      : null;
    if (mainId && restoredOrReused.has(mainId) && this.#controllers.has(mainId)) {
      const main = this.select(mainId);
      if (main.record.role === "standard" && main.record.state === "open") this.makeMain(mainId);
    }
    const requestedKeyId = validated.keyWindowControllerId
      ? actualIdBySavedId.get(validated.keyWindowControllerId) ?? null
      : null;
    const requestedKey = requestedKeyId && restoredOrReused.has(requestedKeyId) && this.#controllers.has(requestedKeyId)
      ? this.select(requestedKeyId)
      : null;
    if (requestedKey?.record.state === "open") this.makeKey(requestedKey.id);
    else {
      const fallback = [...this.#orderedControllers()].reverse().find(({ record }) => record.role === "standard" && record.state === "open");
      if (fallback) this.makeKey(fallback.id);
    }

    cleanupRestorationOnlyProjections();
    return Object.freeze({
      restoredWindowControllerIds: Object.freeze(restoredWindowControllerIds.filter((id) => restoredOrReused.has(id))),
      reusedWindowControllerIds: Object.freeze(reusedWindowControllerIds.filter((id) => restoredOrReused.has(id))),
      failures: Object.freeze(failures),
    });
  }

  diagnostics(): WindowManagerDiagnostics {
    return Object.freeze({
      controllerCount: this.#controllers.size,
      openControllerCount: this.#order.length,
      fullRegistryScans: this.#fullRegistryScans,
      queryCandidateVisits: this.#queryCandidateVisits,
      orderedCandidateVisits: this.#orderedCandidateVisits,
      orderPublications: this.#orderPublications,
      listenerCount: this.#listeners.size,
      listenerDelta: 0,
    });
  }

  resetDiagnostics(): void {
    this.#queryCandidateVisits = 0;
    this.#orderedCandidateVisits = 0;
    this.#fullRegistryScans = 0;
    this.#orderPublications = 0;
  }

  async prepareRuntimeDisposal(context: import("../Runtime/disposalTypes").RuntimeDisposalPrepareContext): Promise<import("../Runtime/disposalTypes").RuntimeDisposalPreparation> {
    this.#assertMutable();
    const disposalGeneration = ++this.#runtimeDisposalGeneration;
    this.#runtimeDisposalPreparing = true;
    const schedulerSnapshot = this.#boundsScheduler.freeze();
    const transitionControllers = [...this.#controllers.values()].filter(({ record }) => (
      record.state === "opening" || record.state === "open" || record.state === "minimised"
    ));
    const transitionIds = new Set(transitionControllers.map(({ id }) => id));
    const roots = transitionControllers
      .filter(({ record }) => !record.parentWindowControllerId || !transitionIds.has(record.parentWindowControllerId))
      .map(({ id }) => id);
    let preparation: WindowClosePreparation | null = null;
    try {
      if (roots.length > 0) {
        const closePreparation = this.prepareCloseForest(roots, {
          reason: "runtime-dispose",
          signal: context.preparationSignal,
        });
        const aborted = new Promise<{ readonly kind: "aborted" }>((resolve) => {
          if (context.preparationSignal.aborted) resolve({ kind: "aborted" });
          else context.preparationSignal.addEventListener("abort", () => resolve({ kind: "aborted" }), { once: true });
        });
        const outcome = await Promise.race([
          closePreparation.then((value) => ({ kind: "prepared" as const, value })),
          aborted,
        ]);
        if (outcome.kind === "aborted") {
          if (this.#runtimeDisposalGeneration === disposalGeneration) {
            this.#runtimeDisposalPreparing = false;
            this.#boundsScheduler.restore(schedulerSnapshot);
          }
          void closePreparation.then((late) => {
            if (late.status === "ready") this.rollbackClose(late.token);
          }).catch((error) => this.#reportError(error, "runtime-disposal-late-prepare"));
          return {
            status: "cancelled",
            reason: String(context.preparationSignal.reason ?? "runtime-disposal-cancelled"),
          };
        }
        preparation = outcome.value;
      }
      if (preparation && preparation.status !== "ready") {
        if (this.#runtimeDisposalGeneration === disposalGeneration) {
          this.#runtimeDisposalPreparing = false;
          this.#boundsScheduler.restore(schedulerSnapshot);
        }
        return {
          status: "cancelled",
          reason: preparation.status === "cancelled" ? preparation.reason : preparation.reason,
        };
      }
      let settled = false;
      return {
        status: "ready",
        rollback: () => {
          if (settled) return;
          settled = true;
          if (preparation?.status === "ready") this.rollbackClose(preparation.token);
          if (this.#runtimeDisposalGeneration === disposalGeneration) {
            this.#runtimeDisposalPreparing = false;
            this.#boundsScheduler.restore(schedulerSnapshot);
          }
        },
        commit: () => {
          if (settled) return;
          if (!context.runtimeSignal.aborted) throw new Error("Runtime disposal commit requires an aborted runtime signal.");
          settled = true;
          if (preparation?.status === "ready") this.commitClose(preparation.token);
          this.dispose();
        },
      };
    } catch (error) {
      if (preparation?.status === "ready") this.rollbackClose(preparation.token);
      if (this.#runtimeDisposalGeneration === disposalGeneration) {
        this.#runtimeDisposalPreparing = false;
        this.#boundsScheduler.restore(schedulerSnapshot);
      }
      if (context.preparationSignal.aborted) {
        return { status: "cancelled", reason: String(context.preparationSignal.reason ?? "runtime-disposal-cancelled") };
      }
      throw error;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const live of [...this.#liveCloseTokens.values()]) {
      this.#tryCleanup("window-close-rollback", () => this.#rollbackPreparations(live.preparations));
    }
    this.#liveCloseTokens.clear();
    this.#closeReservations.clear();
    for (const id of [...this.#modalScopes.keys()].reverse()) {
      this.#tryCleanup("window-modal-scope-dispose", () => this.#closeModalScope(id, false));
    }
    this.#tryCleanup("document-presentation-coordinator-dispose", () => this.#presentationCoordinator.dispose());
    this.#tryCleanup("document-presentation-registration-dispose", () => this.#presentationRegistration.dispose());
    for (const id of [...this.#controllers.keys()].reverse()) {
      this.#tryCleanup("window-controller-dispose", () => this.#discardController(id, "runtime-dispose"));
    }
    this.#tryCleanup("window-bounds-dispose", () => this.#boundsScheduler.dispose());
    for (const { handle } of this.#applicationResponders.values()) {
      if (handle) this.#tryCleanup("application-responder-dispose", () => handle.dispose({ cascade: true }));
    }
    this.#applicationResponders.clear();
    for (const id of this.#ownedWindowUndoIds) {
      this.#tryCleanup("window-undo-dispose", () => this.dependencies.undo.remove({ kind: "window", id }));
    }
    this.#ownedWindowUndoIds.clear();
    for (const id of this.#ownedApplicationUndoIds) {
      this.#tryCleanup("application-undo-dispose", () => this.dependencies.undo.remove({ kind: "application", id }));
    }
    this.#ownedApplicationUndoIds.clear();
    this.#closedSheetCompletions.clear();
    this.#tryCleanup("window-content-registry-dispose", () => this.dependencies.content.dispose());
    this.#tryCleanup("window-screen-dispose", () => this.dependencies.screen.dispose());
    this.#listeners.clear();
  }

  async #requestCloseWithFinalDocument(
    rootWindowControllerIds: readonly string[],
    resultWindowControllerId: string,
    request: WindowCloseRequest,
  ): Promise<WindowCloseResult | null> {
    const targetIds = new Set(rootWindowControllerIds.flatMap((id) => this.#collectOpenForestIds(id)));
    const selectedDocumentIds = this.#finalDocumentIdsWithin(targetIds);
    if (selectedDocumentIds.length === 0) return null;
    const presentationRootIds = Object.freeze([...rootWindowControllerIds]);
    let prepared: Awaited<ReturnType<DocumentController["prepareCloseDocuments"]>> | null = null;
    try {
      prepared = await this.dependencies.documents.prepareCloseDocuments(
        selectedDocumentIds,
        documentReasonByWindowReason[request.reason],
        request.signal,
        presentationRootIds,
      );
      if (prepared.status !== "ready") {
        return prepared.status === "cancelled"
          ? { outcome: "cancelled", windowControllerId: resultWindowControllerId }
          : { outcome: "refused", windowControllerId: resultWindowControllerId, reason: "blocked" };
      }
      this.dependencies.documents.validateCloseDocuments(prepared);
      this.dependencies.documents.commitCloseDocuments(prepared);
      await this.dependencies.documents.settleClosedDocuments(prepared.documentIds);
      return { outcome: "closed", windowControllerId: resultWindowControllerId };
    } catch (error) {
      if (prepared?.status === "ready") await this.dependencies.documents.cancelCloseDocuments(prepared);
      throw error;
    }
  }

  #validateApplicationWindowMembership(applicationId: string, expectedIds: readonly string[]): void {
    const actual = [...this.#controllers.values()]
      .filter(({ record }) => record.applicationId === applicationId)
      .map(({ id }) => id);
    const expected = new Set(expectedIds);
    if (actual.length !== expected.size || actual.some((id) => !expected.has(id))) {
      throw new Error("Application window membership changed during close.");
    }
  }

  #finalDocumentIdsWithin(targetIds: ReadonlySet<string>): readonly string[] {
    const candidateDocumentIds = new Set<string>();
    for (const id of targetIds) {
      const record = this.#controllers.get(id)?.record;
      if (record?.documentId) candidateDocumentIds.add(record.documentId);
    }
    return Object.freeze([...candidateDocumentIds].filter((documentId) => {
      const document = this.dependencies.documents.getDocument(documentId);
      if (!document) return false;
      const removesEveryAssociation = document.windowAssociations.length > 0 &&
        document.windowAssociations.every(({ windowControllerId }) => targetIds.has(windowControllerId));
      const removesPrimary = document.windowAssociations.some(({ windowControllerId, role }) => (
        role === "primary" && targetIds.has(windowControllerId)
      ));
      return removesEveryAssociation && removesPrimary;
    }));
  }

  #discardController(id: string, reason: "runtime-dispose" | "load-rollback"): void {
    const controller = this.#controllers.get(id);
    if (!controller) return;
    const record = controller.record;
    const orderIndex = this.#order.indexOf(id);
    const wasOpen = orderIndex >= 0;
    const ownedOpenResources = wasOpen || record.state === "opening" || this.#openingWindowControllerIds.has(id);
    this.#boundsScheduler.cancel(id);
    this.#closeModalScope(id, false);
    if (wasOpen) {
      this.#removeIndexes(record);
      this.#order.splice(orderIndex, 1);
    }
    if (ownedOpenResources) {
      if (record.documentId) {
        this.#tryCleanup("window-document-dissociation", () => {
          this.dependencies.documents.dissociateWindow(record.documentId!, id);
        });
      }
      if (record.applicationSessionId) this.#releaseApplicationResponder(record.applicationSessionId);
      if (this.#ownedWindowUndoIds.delete(id)) {
        this.#tryCleanup("window-undo-dispose", () => this.dependencies.undo.remove({ kind: "window", id }));
      }
    }
    this.#controllers.delete(id);
    this.#controllerAuthorities.delete(id);
    this.#openingWindowControllerIds.delete(id);
    this.#authorityGeneration += 1;
    this.#lastFocusedByWindow.delete(id);
    if (record.restorationKey && this.#restorationKeys.get(record.restorationKey) === id) {
      this.#restorationKeys.delete(record.restorationKey);
    }
    this.#childrenByParent.delete(id);
    if (record.parentWindowControllerId) this.#deleteFrom(this.#childrenByParent, record.parentWindowControllerId, id);
    controller.dispose(reason === "load-rollback" ? "runtime-dispose" : reason);
  }

  #rollbackRestorationControllers(
    created: readonly { readonly controller: WindowController }[],
  ): void {
    for (const { controller } of [...created].reverse()) {
      this.#discardController(controller.id, "load-rollback");
    }
    this.#reindexZ();
    this.#restoreKeyAndMain();
    this.#publish(true);
  }

  #requireControllerAuthority(id: string, controller: WindowController, authority: number): void {
    if (this.#controllers.get(id) !== controller || this.#controllerAuthorities.get(id) !== authority) {
      throw new Error(`Window "${id}" transition continuation is stale.`);
    }
  }

  #assertControllerTransitionAvailable(id: string): void {
    let current: string | null = id;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (this.#closeReservations.has(current)) {
        throw new Error(`Window "${current}" is reserved by a closing transition.`);
      }
      visited.add(current);
      current = this.#controllers.get(current)?.record.parentWindowControllerId ?? null;
    }
  }

  #rememberCurrentWindowFocus(): void {
    const focused = this.dependencies.focus.getFocusedResponderId();
    if (!focused || !this.dependencies.responders.has(focused)) return;
    const windowResponder = this.dependencies.responders.resolveChain(focused)
      .find(({ kind }) => kind === "window");
    if (!windowResponder || !windowResponder.id.startsWith("window:")) return;
    const windowId = windowResponder.id.slice("window:".length);
    if (this.#controllers.has(windowId)) this.#lastFocusedByWindow.set(windowId, focused);
  }

  #focusTarget(controller: WindowController): string {
    const remembered = this.#lastFocusedByWindow.get(controller.id);
    if (remembered && this.dependencies.responders.has(remembered)) {
      const insideWindow = this.dependencies.responders.resolveChain(remembered)
        .some(({ id }) => id === controller.windowResponderId);
      if (insideWindow && this.dependencies.responders.isEnabled(remembered)) return remembered;
    }
    return controller.contentState.status === "loaded"
      ? controller.contentState.rootResponderId
      : controller.windowResponderId;
  }

  #commitClose(
    preparation: WindowClosePreparationToken,
    commitDocument?: () => void,
    coveredAssociations: Readonly<Record<string, readonly string[]>> = Object.freeze({}),
  ): WindowCloseResult {
    const live = this.#requireValidLiveClose(preparation);
    const notificationReleases = live.preparations.map(({ windowControllerId }) => (
      this.select(windowControllerId).beginNotificationBatch()
    ));
    const coveredPairs = new Map<string, Set<string>>();
    for (const [documentId, ids] of Object.entries(coveredAssociations)) {
      coveredPairs.set(documentId, new Set(ids));
    }
    this.#liveCloseTokens.delete(preparation.tokenId);
    const rootId = preparation.roots[0]?.windowControllerId ?? preparation.preparedWindowControllerIds.at(-1) ?? "";
    for (const controllerPreparation of live.preparations) {
      const controller = this.select(controllerPreparation.windowControllerId);
      this.#boundsScheduler.cancel(controller.id);
      const record = controller.record;
      controller.replaceRecord({ ...record, state: "closing", isKey: false, isMain: false });
      this.#tryCleanup("window-close-controller-commit", () => controllerPreparation.commit());
      this.#closeModalScope(controller.id, true);
      this.#removeIndexes(record);
      const orderIndex = this.#order.indexOf(controller.id);
      if (orderIndex >= 0) this.#order.splice(orderIndex, 1);
      if (record.documentId && !coveredPairs.get(record.documentId)?.has(controller.id)) {
        try { this.dependencies.documents.dissociateWindow(record.documentId, controller.id); } catch (error) {
          this.#reportError(error, "window-document-dissociation");
        }
      }
      if (record.applicationSessionId) this.#releaseApplicationResponder(record.applicationSessionId);
      if (this.#ownedWindowUndoIds.delete(controller.id)) {
        this.#tryCleanup("window-undo-dispose", () => this.dependencies.undo.remove({ kind: "window", id: controller.id }));
      }
      controller.replaceRecord({ ...record, state: "closed", isKey: false, isMain: false, zIndex: 0 });
      if (record.role === "sheet") {
        const hasData = this.#sheetEndData.has(controller.id);
        controller.completeSheet({
          outcome: "closed",
          windowControllerId: controller.id,
          ...(hasData ? { data: this.#sheetEndData.get(controller.id) } : {}),
        });
        if (controller.sheetCompletion) this.#closedSheetCompletions.set(controller.id, controller.sheetCompletion);
      }
      controller.notifyDidClose();
      this.#controllers.delete(controller.id);
      this.#controllerAuthorities.delete(controller.id);
      this.#authorityGeneration += 1;
      this.#lastFocusedByWindow.delete(controller.id);
      if (record.restorationKey && this.#restorationKeys.get(record.restorationKey) === controller.id) {
        this.#restorationKeys.delete(record.restorationKey);
      }
      this.#childrenByParent.delete(controller.id);
      if (record.parentWindowControllerId) {
        this.#deleteFrom(this.#childrenByParent, record.parentWindowControllerId, controller.id);
      }
    }
    commitDocument?.();
    this.#releaseCloseReservations(live.reservedWindowControllerIds);
    this.#reindexZ();
    this.#restoreKeyAndMain();
    this.#publish(false);
    // WindowManager is the transaction authority. Controller observers are
    // released only after the manager and optional document callback expose
    // the complete forest, never each intermediate controller state.
    for (const release of notificationReleases) release();
    return { outcome: "closed", windowControllerId: rootId };
  }

  #requireLiveToken(token: WindowClosePreparationToken): LiveCloseToken {
    const live = this.#liveCloseTokens.get(token.tokenId);
    if (!live || live.token !== token || token.runtimeId !== this.runtimeId) throw new InvalidWindowClosePreparationError();
    return live;
  }

  #requireValidLiveClose(token: WindowClosePreparationToken): LiveCloseToken {
    const live = this.#requireLiveToken(token);
    for (const [id, authority] of live.controllerAuthorities) {
      const controller = this.#controllers.get(id);
      if (!controller || this.#controllerAuthorities.get(id) !== authority) {
        throw new InvalidWindowClosePreparationError();
      }
    }
    return live;
  }

  #commitBounds(
    windowControllerId: string,
    bounds: WindowBounds,
    reason: WindowBoundsChangeReason,
  ): boolean {
    const controller = this.select(windowControllerId);
    assertFiniteWindowBounds(bounds, "bounds", false);
    if (
      controller.record.state !== "open" ||
      this.#blockedWindowIds().has(windowControllerId) ||
      this.isCompactPresentation(windowControllerId)
    ) return false;
    if (
      !controller.record.style.includes("resizable") &&
      reason !== "content-size" &&
      (bounds.width !== controller.record.bounds.width || bounds.height !== controller.record.bounds.height)
    ) throw new Error(`Window "${windowControllerId}" is not resizable.`);
    const constrained = this.#constrainBounds(controller, bounds);
    const current = controller.record.bounds;
    if (
      current.x === constrained.x && current.y === constrained.y &&
      current.width === constrained.width && current.height === constrained.height &&
      !controller.geometryState.zoomed
    ) return false;
    const normalBounds = constrained;
    controller.replaceGeometry(
      { ...controller.record, bounds: constrained },
      { normalBounds, zoomed: false, minimisedFrom: null },
    );
    return true;
  }

  #constrainBounds(controller: WindowController, requested: WindowBounds): WindowBounds {
    assertFiniteWindowBounds(requested, "bounds", false);
    const record = controller.record;
    const workArea = this.dependencies.screen.getSnapshot().workArea;
    const width = Math.min(
      record.maximumSize?.width ?? Number.POSITIVE_INFINITY,
      Math.max(record.minimumSize.width, requested.width),
    );
    const height = Math.min(
      record.maximumSize?.height ?? Number.POSITIVE_INFINITY,
      Math.max(record.minimumSize.height, requested.height),
    );
    const minimumX = workArea.x - width + 96;
    const maximumX = workArea.x + workArea.width - 96;
    const minimumY = workArea.y;
    const maximumY = workArea.y + workArea.height - 31;
    const x = Math.min(maximumX, Math.max(minimumX, requested.x));
    const y = Math.min(maximumY, Math.max(minimumY, requested.y));
    const current = requested;
    if (current.x === x && current.y === y && current.width === width && current.height === height) return current;
    const existing = controller.record.bounds;
    if (existing.x === x && existing.y === y && existing.width === width && existing.height === height) return existing;
    return Object.freeze({ x, y, width, height });
  }

  #rollbackPreparations(preparations: readonly Extract<WindowControllerClosePreparation, { readonly status: "ready" }>[]): void {
    for (const preparation of [...preparations].reverse()) {
      this.#tryCleanup("window-close-rollback", () => preparation.rollback());
    }
  }

  #openChildrenTopmostFirst(parentId: string): string[] {
    const children = this.#childrenByParent.get(parentId) ?? new Set<string>();
    return [...children]
      .filter((id) => {
        const state = this.#controllers.get(id)?.record.state;
        return state === "opening" || state === "open" || state === "minimised";
      })
      .sort((left, right) => this.#order.indexOf(right) - this.#order.indexOf(left));
  }

  #collectOpenForestIds(rootId: string): string[] {
    this.select(rootId);
    const result: string[] = [];
    const visit = (id: string) => {
      if (result.includes(id)) throw new Error("Window relationship cycle encountered while reserving close authority.");
      result.push(id);
      for (const childId of this.#openChildrenTopmostFirst(id)) visit(childId);
    };
    visit(rootId);
    return result;
  }

  #releaseCloseReservations(ids: readonly string[]): void {
    for (const id of ids) this.#closeReservations.delete(id);
  }

  #validateOpenRelationship(controller: WindowController): void {
    const record = controller.record;
    if (!record.parentWindowControllerId) return;
    const parent = this.select(record.parentWindowControllerId);
    if (parent.record.state !== "open") {
      throw new Error(`Child window "${record.id}" requires an open parent window.`);
    }
    if (record.role === "sheet") {
      if (!["standard", "modal"].includes(parent.record.role)) {
        throw new Error("A sheet requires a standard or modal parent.");
      }
      const attached = this.#openChildrenTopmostFirst(parent.id).find((id) => (
        id !== controller.id && this.select(id).record.role === "sheet"
      ));
      if (attached) throw new Error(`Window "${parent.id}" already has an attached sheet.`);
    }
  }

  #openModalScope(controller: WindowController): void {
    if (this.#modalScopes.has(controller.id)) return;
    this.#rememberCurrentWindowFocus();
    const parent = controller.record.parentWindowControllerId
      ? this.select(controller.record.parentWindowControllerId)
      : null;
    const parentResponderId = parent
      ? parent.windowResponderId
      : controller.record.applicationSessionId
        ? `application:${controller.record.applicationSessionId}`
        : "workspace";
    const parentScopeId = parent && this.#modalScopes.has(parent.id) ? `window:${parent.id}` : undefined;
    const restoreResponderId = parent
      ? this.#focusTarget(parent)
      : this.dependencies.focus.getFocusedResponderId() ?? parentResponderId;
    const handle = this.dependencies.focus.openScope({
      id: `window:${controller.id}`,
      kind: "modal",
      ...(parentScopeId ? { parentScopeId } : {}),
      parentResponderId,
      modal: true,
      trapFocus: true,
      restoreResponderId,
    });
    this.#modalScopes.set(controller.id, handle);
  }

  #closeModalScope(windowControllerId: string, restore: boolean): void {
    const handle = this.#modalScopes.get(windowControllerId);
    if (!handle) return;
    this.#modalScopes.delete(windowControllerId);
    try { handle.close({ restore }); } catch (error) {
      this.#reportError(error, "window-modal-scope-close");
    }
  }

  #relationshipRoot(windowControllerId: string): string {
    let current = windowControllerId;
    const visited = new Set<string>();
    while (!visited.has(current)) {
      visited.add(current);
      const parent = this.#controllers.get(current)?.record.parentWindowControllerId;
      if (!parent || !this.#order.includes(parent)) return current;
      current = parent;
    }
    throw new Error("Window relationship cycle encountered while resolving ordering.");
  }

  #standardAncestor(windowControllerId: string): string | null {
    let current = this.#controllers.get(windowControllerId)?.record.parentWindowControllerId ?? null;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const controller = this.#controllers.get(current);
      if (!controller) return null;
      if (controller.record.role === "standard" && controller.record.state === "open") return controller.id;
      current = controller.record.parentWindowControllerId;
    }
    return null;
  }

  #relationshipTreeIds(rootWindowControllerId: string): string[] {
    const descendants = new Set<string>();
    const visit = (id: string) => {
      if (descendants.has(id)) throw new Error("Window relationship cycle encountered while ordering.");
      descendants.add(id);
      for (const childId of this.#childrenByParent.get(id) ?? []) {
        if (this.#order.includes(childId)) visit(childId);
      }
    };
    visit(rootWindowControllerId);
    return this.#order.filter((id) => descendants.has(id));
  }

  #moveRelationshipTree(windowControllerId: string, placement: WindowOrderPlacement): void {
    const root = this.#relationshipRoot(windowControllerId);
    const tree = this.#relationshipTreeIds(root);
    for (const id of tree) {
      const index = this.#order.indexOf(id);
      if (index >= 0) this.#order.splice(index, 1);
    }
    if (placement === "front") this.#order.push(...tree);
    else this.#order.unshift(...tree);
    this.#normaliseRelationshipOrder();
  }

  #normaliseRelationshipOrder(): void {
    const rank = new Map(this.#order.map((id, index) => [id, index]));
    const live = new Set(this.#order);
    const ordered: string[] = [];
    const visited = new Set<string>();
    const append = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      ordered.push(id);
      const children = [...(this.#childrenByParent.get(id) ?? [])]
        .filter((childId) => live.has(childId))
        .sort((left, right) => (rank.get(left) ?? 0) - (rank.get(right) ?? 0));
      for (const childId of children) append(childId);
    };
    for (const id of this.#order) {
      const parent = this.#controllers.get(id)?.record.parentWindowControllerId;
      if (!parent || !live.has(parent)) append(id);
    }
    for (const id of this.#order) append(id);
    this.#order.splice(0, this.#order.length, ...ordered);
  }

  #isDescendantOf(candidateId: string, ancestorId: string): boolean {
    let current = this.#controllers.get(candidateId)?.record.parentWindowControllerId ?? null;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current === ancestorId) return true;
      visited.add(current);
      current = this.#controllers.get(current)?.record.parentWindowControllerId ?? null;
    }
    return false;
  }

  #hasModalDescendant(windowControllerId: string): boolean {
    return this.#order.some((id) => {
      const controller = this.#controllers.get(id);
      return Boolean(
        controller &&
        controller.record.state === "open" &&
        (controller.record.role === "modal" || controller.record.role === "sheet") &&
        this.#isDescendantOf(id, windowControllerId)
      );
    });
  }

  #blockedWindowIds(): Set<string> {
    const blocked = new Set<string>();
    const open = this.#order.map((id) => this.#controllers.get(id)!).filter(Boolean);
    for (const blocker of open) {
      if (blocker.record.state !== "open") continue;
      if (blocker.record.role === "sheet" && blocker.record.parentWindowControllerId) {
        blocked.add(blocker.record.parentWindowControllerId);
        continue;
      }
      if (blocker.record.role !== "modal") continue;
      const root = blocker.record.parentWindowControllerId ? this.#relationshipRoot(blocker.id) : null;
      for (const candidate of open) {
        if (candidate.id === blocker.id || candidate.record.state !== "open") continue;
        const inDomain = root
          ? this.#relationshipRoot(candidate.id) === root && !this.#isDescendantOf(candidate.id, blocker.id)
          : blocker.record.applicationSessionId
            ? candidate.record.applicationSessionId === blocker.record.applicationSessionId
            : candidate.record.workspaceId === blocker.record.workspaceId;
        const isLower = root
          ? candidate.record.zIndex < blocker.record.zIndex
          : levelRank[candidate.record.level] < levelRank[blocker.record.level];
        if (inDomain && isLower) blocked.add(candidate.id);
      }
    }
    return blocked;
  }

  #makeKey(windowControllerId: string, publish: boolean): void {
    this.#rememberCurrentWindowFocus();
    const target = this.select(windowControllerId);
    if (target.record.state !== "open") return;
    if (this.#blockedWindowIds().has(windowControllerId)) return;
    const targetMayBeMain = target.record.role === "standard";
    const currentMainId = this.#standardAncestor(target.id) ??
      this.#snapshot.mainWindowControllerId ??
      this.#orderedControllers().find(({ record }) => record.isMain)?.id ??
      null;
    for (const controller of this.#orderedControllers()) {
      const isKey = controller.id === target.id;
      const isMain = targetMayBeMain ? controller.id === target.id : controller.id === currentMainId;
      if (controller.record.isKey !== isKey || controller.record.isMain !== isMain) {
        controller.replaceRecord({ ...controller.record, isKey, isMain });
      }
    }
    this.#moveRelationshipTree(target.id, "front");
    this.#reindexZ();
    this.dependencies.focus.setActiveAnchors({
      applicationResponderId: target.record.applicationSessionId ? `application:${target.record.applicationSessionId}` : null,
      windowResponderId: target.windowResponderId,
      documentResponderId: target.documentPresentationResponderId,
      workspaceResponderId: "workspace",
      webspringResponderId: "webspring",
      runtimeResponderId: "runtime",
    });
    const focusTarget = this.#focusTarget(target);
    this.dependencies.focus.requestFocus(focusTarget);
    if (publish) this.#publish(true);
  }

  #restoreKeyAndMain(): void {
    this.#rememberCurrentWindowFocus();
    const blocked = this.#blockedWindowIds();
    const eligible = [...this.#orderedControllers()].reverse().find(({ record, id }) => record.state === "open" && !blocked.has(id)) ?? null;
    const main = [...this.#orderedControllers()].reverse().find(({ record, id }) => record.state === "open" && record.role === "standard" && !blocked.has(id)) ?? null;
    for (const controller of this.#orderedControllers()) {
      const isKey = controller.id === eligible?.id;
      const isMain = controller.id === main?.id;
      if (controller.record.isKey !== isKey || controller.record.isMain !== isMain) {
        controller.replaceRecord({ ...controller.record, isKey, isMain });
      }
    }
    this.dependencies.focus.setActiveAnchors({
      applicationResponderId: eligible?.record.applicationSessionId ? `application:${eligible.record.applicationSessionId}` : null,
      windowResponderId: eligible?.windowResponderId ?? null,
      documentResponderId: eligible?.documentPresentationResponderId ?? null,
      workspaceResponderId: "workspace",
      webspringResponderId: "webspring",
      runtimeResponderId: "runtime",
    });
    if (eligible) this.dependencies.focus.requestFocus(this.#focusTarget(eligible));
  }

  #retainApplicationResponder(sessionId: string, applicationId: string): void {
    const existing = this.#applicationResponders.get(sessionId);
    if (existing) {
      if (existing.applicationId !== applicationId) throw new Error("An application session cannot change application identity.");
      existing.count += 1;
      return;
    }
    const id = `application:${sessionId}`;
    if (!this.dependencies.responders.has("workspace")) {
      throw new Error(`Parent responder "workspace" is not live for application session "${sessionId}".`);
    }
    const handle = this.dependencies.responders.has(id) ? null : this.dependencies.responders.register({
      id,
      runtimeId: this.runtimeId,
      kind: "application",
      parentId: "workspace",
      scopeId: id,
      undoOwner: { kind: "application", id: applicationId },
      diagnosticsLabel: applicationId,
    });
    if (!this.dependencies.undo.get({ kind: "application", id: applicationId })) {
      this.dependencies.undo.create({ kind: "application", id: applicationId });
      this.#ownedApplicationUndoIds.add(applicationId);
    }
    this.#applicationResponders.set(sessionId, { handle, count: 1, applicationId });
  }

  #releaseApplicationResponder(sessionId: string): void {
    const entry = this.#applicationResponders.get(sessionId);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    if (entry.handle) this.#tryCleanup("application-responder-dispose", () => entry.handle!.dispose({ cascade: true }));
    this.#applicationResponders.delete(sessionId);
    const stillUsed = [...this.#applicationResponders.values()].some(({ applicationId }) => applicationId === entry.applicationId);
    if (!stillUsed && this.#ownedApplicationUndoIds.delete(entry.applicationId)) {
      this.#tryCleanup("application-undo-dispose", () => {
        this.dependencies.undo.remove({ kind: "application", id: entry.applicationId });
      });
    }
  }

  #addIndexes(record: WindowRecord): void {
    this.#setFor(this.#indexes.workspace, record.workspaceId).add(record.id);
    if (record.applicationId) this.#setFor(this.#indexes.application, record.applicationId).add(record.id);
    if (record.applicationSessionId) this.#setFor(this.#indexes.applicationSession, record.applicationSessionId).add(record.id);
    if (record.documentId) this.#setFor(this.#indexes.document, record.documentId).add(record.id);
    this.#setFor(this.#indexes.role, record.role).add(record.id);
    if (record.parentWindowControllerId) this.#setFor(this.#indexes.parent, record.parentWindowControllerId).add(record.id);
  }

  #removeIndexes(record: WindowRecord): void {
    this.#deleteFrom(this.#indexes.workspace, record.workspaceId, record.id);
    if (record.applicationId) this.#deleteFrom(this.#indexes.application, record.applicationId, record.id);
    if (record.applicationSessionId) this.#deleteFrom(this.#indexes.applicationSession, record.applicationSessionId, record.id);
    if (record.documentId) this.#deleteFrom(this.#indexes.document, record.documentId, record.id);
    this.#deleteFrom(this.#indexes.role, record.role, record.id);
    if (record.parentWindowControllerId) this.#deleteFrom(this.#indexes.parent, record.parentWindowControllerId, record.id);
  }

  #indexedCandidates(query: WindowListQuery): Set<string> {
    const indexed: Array<Set<string>> = [];
    if (query.workspaceId !== undefined) indexed.push(this.#indexes.workspace.get(query.workspaceId) ?? new Set());
    if (query.applicationId !== undefined) indexed.push(this.#indexes.application.get(query.applicationId) ?? new Set());
    if (query.applicationSessionId !== undefined) indexed.push(this.#indexes.applicationSession.get(query.applicationSessionId) ?? new Set());
    if (query.documentId !== undefined) indexed.push(this.#indexes.document.get(query.documentId) ?? new Set());
    if (query.role !== undefined) indexed.push(this.#indexes.role.get(query.role) ?? new Set());
    if (query.parentWindowControllerId !== undefined) indexed.push(this.#indexes.parent.get(query.parentWindowControllerId) ?? new Set());
    if (indexed.length === 0) return new Set(this.#order);
    return new Set([...indexed.sort((left, right) => left.size - right.size)[0]!]);
  }

  #hasIndexedQuery(query: WindowListQuery): boolean {
    return query.workspaceId !== undefined ||
      query.applicationId !== undefined ||
      query.applicationSessionId !== undefined ||
      query.documentId !== undefined ||
      query.role !== undefined ||
      query.parentWindowControllerId !== undefined;
  }

  #orderedControllers(): readonly WindowController[] {
    return this.#order
      .map((id) => this.#controllers.get(id))
      .filter((controller): controller is WindowController => Boolean(controller));
  }

  #matches(record: WindowRecord, query: WindowListQuery): boolean {
    return (query.workspaceId === undefined || record.workspaceId === query.workspaceId) &&
      (query.applicationId === undefined || record.applicationId === query.applicationId) &&
      (query.applicationSessionId === undefined || record.applicationSessionId === query.applicationSessionId) &&
      (query.documentId === undefined || record.documentId === query.documentId) &&
      (query.role === undefined || record.role === query.role) &&
      (query.parentWindowControllerId === undefined || record.parentWindowControllerId === query.parentWindowControllerId);
  }

  #orderedRestorationRecords(records: readonly RestorableWindowRecord[]): readonly RestorableWindowRecord[] {
    const originalIndex = new Map(records.map((record, index) => [record.windowControllerId, index]));
    const byId = new Map(records.map((record) => [record.windowControllerId, record]));
    const orderedInput = [...records].sort((left, right) => (
      left.zOrder - right.zOrder ||
      (originalIndex.get(left.windowControllerId) ?? 0) - (originalIndex.get(right.windowControllerId) ?? 0)
    ));
    const result: RestorableWindowRecord[] = [];
    const added = new Set<string>();
    const append = (record: RestorableWindowRecord): void => {
      if (added.has(record.windowControllerId)) return;
      if (record.parentWindowControllerId) append(byId.get(record.parentWindowControllerId)!);
      added.add(record.windowControllerId);
      result.push(record);
    };
    for (const record of orderedInput) append(record);
    return result;
  }

  #reindexZ(): void {
    const bandWidth = this.#order.length + 1;
    this.#order.forEach((id, index) => {
      const controller = this.#controllers.get(id)!;
      controller.replaceManagedZIndex(levelRank[controller.record.level] * bandWidth + index);
    });
  }
  #makeSnapshot(): WindowManagerSnapshot {
    const open = this.#order.map((id) => this.#controllers.get(id)!).filter(Boolean);
    const blocked = this.#blockedWindowIds();
    const blockedApplicationIds = new Set<string>();
    for (const id of blocked) {
      const applicationId = this.#controllers.get(id)?.record.applicationId;
      if (applicationId) blockedApplicationIds.add(applicationId);
    }
    const topLevelModals = open.filter(({ record }) => (
      record.state === "open" && (record.role === "modal" || record.role === "sheet") && !record.parentWindowControllerId
    ));
    for (const { record } of topLevelModals) {
      if (record.applicationId) blockedApplicationIds.add(record.applicationId);
    }
    return Object.freeze({
      runtimeId: this.runtimeId,
      generation: this.#generation,
      windowControllerIds: Object.freeze(open.map(({ id }) => id)),
      keyWindowControllerId: open.find(({ record }) => record.isKey)?.id ?? null,
      mainWindowControllerId: open.find(({ record }) => record.isMain)?.id ?? null,
      blockedWindowControllerIds: Object.freeze(this.#order.filter((id) => blocked.has(id))),
      dirtyWindowControllerIds: Object.freeze(open.filter(({ record }) => (
        record.documentId ? this.dependencies.documents.getDocument(record.documentId)?.hasUnsavedChanges : false
      )).map(({ id }) => id)),
      blockedApplicationIds: Object.freeze([...blockedApplicationIds]),
      applicationStageBlocked: topLevelModals.some(({ record }) => !record.applicationId),
    });
  }

  #publish(orderChanged: boolean): void {
    this.#generation += 1;
    if (orderChanged) this.#orderPublications += 1;
    this.#snapshot = this.#makeSnapshot();
    for (const listener of this.#listeners) {
      try { listener(); } catch (error) { this.#reportError(error, "window-manager-listener"); }
    }
  }

  #tryCleanup(context: string, cleanup: () => void): void {
    try { cleanup(); } catch (error) { this.#reportError(error, context); }
  }

  #reportError(error: unknown, context: string): void {
    try { this.dependencies.observeError?.(error, context); } catch { /* diagnostics never own lifecycle authority */ }
  }

  #setFor(map: Map<string, Set<string>>, key: string): Set<string> {
    const existing = map.get(key);
    if (existing) return existing;
    const created = new Set<string>();
    map.set(key, created);
    return created;
  }

  #deleteFrom(map: Map<string, Set<string>>, key: string, id: string): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("WindowManager is disposed.");
  }

  #assertMutable(): void {
    this.#assertLive();
    if (this.#runtimeDisposalPreparing) throw new Error("WindowManager is quiesced for runtime disposal.");
  }
}

function restorationFailure(
  source: RestorableWindowRecord,
  reason: WindowRestorationFailure["reason"],
  error: unknown,
): WindowRestorationFailure {
  return Object.freeze({
    windowControllerId: source.windowControllerId,
    restorationKey: source.restorationKey,
    reason,
    error,
  });
}

function emptyRestorationReport(): WindowRestorationReport {
  return Object.freeze({
    restoredWindowControllerIds: Object.freeze([]),
    reusedWindowControllerIds: Object.freeze([]),
    failures: Object.freeze([]),
  });
}
