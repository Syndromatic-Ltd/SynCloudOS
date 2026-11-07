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

import type { ResponderGraph, ResponderRegistrationHandle } from "../Responders";
import type { WindowContentRegistry } from "./WindowContentRegistry";
import {
  freezeWindowRecord,
  type WindowCloseRequest,
  type WindowCloseResult,
  type WindowContentController,
  type WindowContentState,
  type WindowControllerClosePreparation,
  type WindowControllerDelegate,
  type WindowGeometryState,
  type WindowRecord,
  type WindowSerializableValue,
  canonicalWindowSerializableValue,
} from "./windowTypes";

export interface WindowControllerDependencies {
  readonly responders: ResponderGraph;
  readonly contentRegistry: WindowContentRegistry;
  readonly parentResponderId: string;
  readonly workspaceResponderId: string;
  readonly webspringResponderId: string;
  readonly runtimeResponderId: string;
  readonly delegate?: WindowControllerDelegate;
  readonly observeError?: (error: unknown, phase: "did-open" | "did-close" | "close-commit" | "close-rollback" | "listener" | "unload" | "dispose" | "responder-dispose") => void;
}

export class WindowController {
  readonly #listeners = new Set<() => void>();
  readonly #responderHandles: ResponderRegistrationHandle[] = [];
  #record: WindowRecord;
  #geometryState: WindowGeometryState;
  #contentState: WindowContentState = Object.freeze({ status: "unloaded" });
  #contentController: WindowContentController | null = null;
  #contentRestorationState: WindowSerializableValue | null = null;
  #sheetCompletion: WindowCloseResult | null = null;
  #sheetCompletionPromise: Promise<WindowCloseResult> | null = null;
  #disposed = false;
  #lifecycleGeneration = 0;
  #notificationBatchDepth = 0;
  #notificationPending = false;
  #clearListenersAfterNotification = false;

  constructor(record: WindowRecord, private readonly dependencies: WindowControllerDependencies) {
    if (record.runtimeId !== dependencies.responders.runtimeId) throw new TypeError("Window and responder runtime IDs must match.");
    this.#record = freezeWindowRecord(record);
    this.#geometryState = Object.freeze({
      normalBounds: this.#record.bounds,
      zoomed: false,
      minimisedFrom: null,
    });
  }

  get id(): string { return this.#record.id; }
  get record(): WindowRecord { return this.#record; }
  get contentState(): WindowContentState { return this.#contentState; }
  get contentController(): WindowContentController | null { return this.#contentController; }
  get geometryState(): WindowGeometryState { return this.#geometryState; }
  get contentRestorationState(): WindowSerializableValue | null { return this.#contentRestorationState; }
  get sheetCompletion(): WindowCloseResult | null { return this.#sheetCompletion; }
  get windowResponderId(): string { return `window:${this.id}`; }
  get documentPresentationResponderId(): string | null {
    return this.#record.documentId ? `document:${this.#record.documentId}:window:${this.id}` : null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      this.#listeners.delete(listener);
    };
  };

  replaceRecord(record: WindowRecord): void {
    if (record.id !== this.id || record.runtimeId !== this.#record.runtimeId) throw new TypeError("Window controller identity is immutable.");
    this.#record = freezeWindowRecord(record);
    this.#emit();
  }

  replaceManagedZIndex(zIndex: number): void {
    if (!Number.isSafeInteger(zIndex) || zIndex < 0) throw new TypeError("Managed window z-index must be a non-negative safe integer.");
    if (this.#record.zIndex === zIndex) return;
    this.#record = Object.freeze({ ...this.#record, zIndex });
    this.#emit();
  }

  replaceGeometry(record: WindowRecord, geometryState: WindowGeometryState): void {
    if (record.id !== this.id || record.runtimeId !== this.#record.runtimeId) throw new TypeError("Window controller identity is immutable.");
    const frozenRecord = freezeWindowRecord(record);
    this.#record = frozenRecord;
    const normalBounds = geometryState.normalBounds === record.bounds
      ? frozenRecord.bounds
      : Object.isFrozen(geometryState.normalBounds)
        ? geometryState.normalBounds
        : Object.freeze({ ...geometryState.normalBounds });
    this.#geometryState = Object.freeze({
      ...geometryState,
      normalBounds,
    });
    this.#emit();
  }

  setContentRestorationState(state: WindowSerializableValue | null): void {
    this.#contentRestorationState = canonicalWindowSerializableValue(state, "Window content restoration state");
  }

  completeSheet(result: WindowCloseResult): WindowCloseResult {
    if (this.#sheetCompletion) return this.#sheetCompletion;
    this.#sheetCompletion = Object.freeze(result);
    return this.#sheetCompletion;
  }

  beginSheetCompletion(factory: () => Promise<WindowCloseResult>): Promise<WindowCloseResult> {
    if (this.#sheetCompletion) return Promise.resolve(this.#sheetCompletion);
    if (this.#sheetCompletionPromise) return this.#sheetCompletionPromise;
    this.#sheetCompletionPromise = factory().then((result) => this.completeSheet(result));
    return this.#sheetCompletionPromise;
  }

  async loadContent(signal: AbortSignal): Promise<void> {
    if (this.#disposed) throw new Error(`Window controller ${this.id} is disposed.`);
    if (this.#contentState.status === "loaded") return;
    if (this.#contentState.status !== "unloaded") throw new Error(`Window controller ${this.id} cannot load from ${this.#contentState.status}.`);
    if (!this.dependencies.responders.has(this.dependencies.parentResponderId)) {
      throw new Error(`Parent responder "${this.dependencies.parentResponderId}" is not live for window "${this.id}".`);
    }
    signal.throwIfAborted();
    const before = this.#record;
    const lifecycleGeneration = ++this.#lifecycleGeneration;
    this.#setContentState({ status: "loading" });
    let content: WindowContentController | null = null;
    try {
      this.#responderHandles.push(this.dependencies.responders.register({
        id: this.windowResponderId,
        runtimeId: this.#record.runtimeId,
        kind: "window",
        parentId: this.dependencies.parentResponderId,
        scopeId: this.windowResponderId,
        undoOwner: { kind: "window", id: this.id },
        diagnosticsLabel: this.#record.title,
      }));
      const documentResponderId = this.documentPresentationResponderId;
      if (documentResponderId && this.#record.documentId) {
        this.#responderHandles.push(this.dependencies.responders.register({
          id: documentResponderId,
          runtimeId: this.#record.runtimeId,
          kind: "document",
          parentId: this.windowResponderId,
          scopeId: this.windowResponderId,
          undoOwner: { kind: "document", id: this.#record.documentId },
          diagnosticsLabel: this.#record.representedDocument?.displayName ?? this.#record.title,
        }));
      }
      content = this.dependencies.contentRegistry.createController(
        this.#record.content,
        this.id,
        this.#record.applicationId,
      );
      this.#contentController = content;
      this.#responderHandles.push(this.dependencies.responders.register({
        id: content.responderId,
        runtimeId: this.#record.runtimeId,
        kind: "controller",
        parentId: documentResponderId ?? this.windowResponderId,
        scopeId: this.windowResponderId,
        diagnosticsLabel: `${this.#record.title} content`,
      }));
      await content.load({ windowControllerId: this.id, signal });
      signal.throwIfAborted();
      if (this.#disposed || lifecycleGeneration !== this.#lifecycleGeneration || this.#contentController !== content) {
        throw new Error(`Window controller ${this.id} load continuation is stale.`);
      }
      this.#setContentState(Object.freeze({
        status: "loaded",
        mountKey: content.mountKey,
        rootResponderId: content.responderId,
      }));
    } catch (error) {
      const stillAuthoritative = !this.#disposed &&
        lifecycleGeneration === this.#lifecycleGeneration &&
        this.#contentController === content;
      if (content && this.#contentController === content) {
        try { content.unload("load-rollback"); } catch (cleanupError) { this.#reportError(cleanupError, "unload"); }
      }
      if (!this.#disposed) this.#disposeResponders();
      if (content && this.#contentController === content) {
        try { content.dispose(); } catch (cleanupError) { this.#reportError(cleanupError, "dispose"); }
      }
      if (this.#contentController === content) this.#contentController = null;
      if (stillAuthoritative) {
        this.#record = before;
        this.#setContentState({ status: "unloaded" });
      }
      throw error;
    }
  }

  async prepareClose(request: WindowCloseRequest): Promise<WindowControllerClosePreparation> {
    request.signal?.throwIfAborted();
    const content = this.#contentController;
    if (!content || this.#contentState.status !== "loaded") {
      return {
        status: "ready",
        windowControllerId: this.id,
        content: { status: "ready", token: null, commit: () => undefined, rollback: () => undefined },
        commit: () => this.dispose("close-commit"),
        rollback: () => undefined,
      };
    }
    const prepared = await content.prepareClose(request);
    if (prepared.status === "cancelled") return { status: "cancelled", windowControllerId: this.id };
    if (prepared.status === "refused") return { ...prepared, windowControllerId: this.id };
    let settled = false;
    const rollback = () => {
      if (settled) return;
      settled = true;
      try { prepared.rollback(); } catch (error) { this.#reportError(error, "close-rollback"); }
    };
    try {
      // A ready content token is owned from the instant its await resolves.
      // Every later abort, delegate failure, or refusal must settle it before
      // the controller can admit another close preparation.
      request.signal?.throwIfAborted();
      const allowed = this.dependencies.delegate?.shouldClose
        ? await this.dependencies.delegate.shouldClose(request)
        : true;
      request.signal?.throwIfAborted();
      if (!allowed) {
        rollback();
        return { status: "refused", windowControllerId: this.id, reason: "delegate-refused" };
      }
      return {
        status: "ready",
        windowControllerId: this.id,
        content: prepared,
        commit: () => {
          if (settled) return;
          settled = true;
          try { this.dependencies.delegate?.willClose?.(request); } catch (error) { this.#reportError(error, "close-commit"); }
          try { prepared.commit(); } catch (error) { this.#reportError(error, "close-commit"); }
          this.dispose("close-commit");
        },
        rollback,
      };
    } catch (error) {
      rollback();
      throw error;
    }
  }

  /** Defers controller publication until a manager-owned structural batch is complete. */
  beginNotificationBatch(): () => void {
    this.#notificationBatchDepth += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#notificationBatchDepth -= 1;
      if (this.#notificationBatchDepth !== 0) return;
      const publish = this.#notificationPending;
      this.#notificationPending = false;
      if (publish) this.#publishListeners();
      if (this.#clearListenersAfterNotification) {
        this.#clearListenersAfterNotification = false;
        this.#listeners.clear();
      }
    };
  }

  rollbackLoadedContent(): void {
    if (this.#disposed) return;
    if (this.#contentState.status !== "loaded") return;
    const content = this.#contentController;
    if (content) {
      try { content.unload("load-rollback"); } catch (error) { this.#reportError(error, "unload"); }
    }
    this.#disposeResponders();
    if (content) {
      try { content.dispose(); } catch (error) { this.#reportError(error, "dispose"); }
    }
    this.#contentController = null;
    this.#setContentState({ status: "unloaded" });
  }

  notifyDidOpen(): void {
    try { this.dependencies.delegate?.didOpen?.(this.#record); } catch (error) { this.#reportError(error, "did-open"); }
  }

  notifyDidClose(): void {
    try { this.dependencies.delegate?.didClose?.(this.#record); } catch (error) { this.#reportError(error, "did-close"); }
  }

  dispose(reason: "close-commit" | "runtime-dispose" = "runtime-dispose"): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#lifecycleGeneration += 1;
    const content = this.#contentController;
    if (content) {
      this.#setContentState({ status: "disposing" });
      try { content.unload(reason); } catch (error) { this.#reportError(error, "unload"); }
    }
    this.#disposeResponders();
    if (content) {
      try { content.dispose(); } catch (error) { this.#reportError(error, "dispose"); }
    }
    this.#contentController = null;
    this.#setContentState({ status: "disposed" });
    if (this.#notificationBatchDepth > 0) this.#clearListenersAfterNotification = true;
    else this.#listeners.clear();
  }

  #disposeResponders(): void {
    for (const handle of this.#responderHandles.splice(0).reverse()) {
      try { handle.dispose({ cascade: true }); } catch (error) { this.#reportError(error, "responder-dispose"); }
    }
  }

  #setContentState(state: WindowContentState): void {
    this.#contentState = Object.freeze(state);
    this.#emit();
  }

  #emit(): void {
    if (this.#notificationBatchDepth > 0) {
      this.#notificationPending = true;
      return;
    }
    this.#publishListeners();
  }

  #publishListeners(): void {
    for (const listener of this.#listeners) {
      try { listener(); } catch (error) { this.#reportError(error, "listener"); }
    }
  }

  #reportError(error: unknown, phase: NonNullable<WindowControllerDependencies["observeError"]> extends (error: unknown, phase: infer Phase) => void ? Phase : never): void {
    try { this.dependencies.observeError?.(error, phase); } catch { /* diagnostics never own lifecycle authority */ }
  }
}
