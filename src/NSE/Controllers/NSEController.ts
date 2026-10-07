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
  ResponderGraph,
  ResponderRegistrationHandle,
} from "../../SynCloudOS/SynCloudOS";
import type {
  AutomaticUndoGroup,
  UndoManager,
  UndoOwner,
} from "../../SynCloudOS/SynCloudOS";

export interface ControllerValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

/** Editing needs only registration, so mounted app histories can supply undo. */
export type ControllerUndoRegistration = Pick<UndoManager, "register"> & Partial<Pick<UndoManager, "assertCanRegister">>;

export interface ControllerEditTransaction {
  readonly id: string;
  readonly actionName: string;
  readonly undoManager?: ControllerUndoRegistration;
  readonly automaticGroup?: AutomaticUndoGroup;
}

export type ControllerCommitResult =
  | {
      readonly status: "committed";
      readonly transactionId: string;
      readonly undoActionId: string | null;
    }
  | {
      readonly status: "invalid";
      readonly transactionId: string;
      readonly issues: readonly ControllerValidationIssue[];
    }
  | { readonly status: "not-editing" };

export interface ControllerResponderAttachmentRequest {
  readonly graph: ResponderGraph;
  readonly parentResponderId: string;
  readonly scopeId?: string;
  readonly undoOwner?: UndoOwner;
}

export interface ControllerResponderAttachment {
  readonly responderId: string;
  readonly dispose: () => boolean;
}

export class ControllerResponderAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControllerResponderAttachmentError";
  }
}

export class ControllerReadOnlyError extends Error {
  constructor() {
    super("Controller content is read-only.");
    this.name = "ControllerReadOnlyError";
  }
}

export class ControllerEditingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControllerEditingStateError";
  }
}

export class UnknownControllerFieldError extends Error {
  constructor(readonly field: string) {
    super(`Unknown controller field: ${field}`);
    this.name = "UnknownControllerFieldError";
  }
}

function validateTransaction(
  transaction: ControllerEditTransaction,
): ControllerEditTransaction {
  if (!transaction.id.trim()) {
    throw new ControllerEditingStateError(
      "Controller edit transaction id must not be empty.",
    );
  }
  if (!transaction.actionName.trim()) {
    throw new ControllerEditingStateError(
      "Controller edit action name must not be empty.",
    );
  }
  return Object.freeze({ ...transaction });
}

export abstract class NSEController<TSnapshot, TChange> {
  readonly id: string;
  readonly responderId: string;
  readonly #listeners = new Set<() => void>();
  readonly #changeListeners = new Set<(change: TChange) => void>();
  #responderAttachment: ResponderRegistrationHandle | null = null;
  #disposed = false;
  #disposing = false;
  protected editTransaction: ControllerEditTransaction | null = null;

  protected constructor(options: { readonly id: string; readonly responderId?: string }) {
    if (!options.id.trim()) throw new TypeError("Controller id must not be empty.");
    if (options.responderId !== undefined && !options.responderId.trim()) {
      throw new TypeError("Controller responder id must not be empty.");
    }
    this.id = options.id;
    this.responderId = options.responderId ?? `controller:${options.id}`;
  }

  abstract getSnapshot(): TSnapshot;
  abstract beginEditing(transaction: ControllerEditTransaction): void;
  abstract commitEditing(): ControllerCommitResult | Promise<ControllerCommitResult>;
  abstract discardEditing(): void;

  attachResponder(
    request: ControllerResponderAttachmentRequest,
  ): ControllerResponderAttachment {
    this.assertActive();
    if (this.#responderAttachment) {
      throw new ControllerResponderAttachmentError(
        `Controller "${this.id}" already has a live responder attachment.`,
      );
    }
    const parent = request.graph.get(request.parentResponderId);
    if (!parent) {
      throw new ControllerResponderAttachmentError(
        `Parent responder "${request.parentResponderId}" is not registered.`,
      );
    }
    const handle = request.graph.register({
      id: this.responderId,
      kind: "controller",
      parentId: request.parentResponderId,
      scopeId: request.scopeId ?? parent.scopeId,
      undoOwner: request.undoOwner,
    });
    this.#responderAttachment = handle;
    let live = true;

    return {
      responderId: this.responderId,
      dispose: () => {
        if (!live) return false;
        if (this.#responderAttachment !== handle) {
          live = false;
          return false;
        }
        const removed = this.detachResponder();
        if (removed) live = false;
        return removed;
      },
    };
  }

  detachResponder(): boolean {
    const attachment = this.#responderAttachment;
    if (!attachment) return false;
    const removed = attachment.dispose();
    this.#responderAttachment = null;
    return removed;
  }

  subscribe = (listener: () => void): (() => boolean) => {
    if (this.#disposed) return () => false;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  subscribeChanges = (listener: (change: TChange) => void): (() => boolean) => {
    if (this.#disposed) return () => false;
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  };

  get isEditing(): boolean {
    return this.editTransaction !== null;
  }

  dispose(): void {
    if (this.#disposed || this.#disposing) return;
    this.#disposing = true;
    try {
      this.discardEditing();
    } finally {
      try {
        this.detachResponder();
      } finally {
        this.#disposed = true;
        this.#disposing = false;
        this.#listeners.clear();
        this.#changeListeners.clear();
      }
    }
  }

  protected beginEditTransaction(transaction: ControllerEditTransaction): void {
    this.assertActive();
    if (this.editTransaction) {
      if (this.editTransaction.id === transaction.id) return;
      throw new ControllerEditingStateError(
        `Controller is already editing transaction "${this.editTransaction.id}".`,
      );
    }
    this.editTransaction = validateTransaction(transaction);
  }

  protected assertActive(): void {
    if (this.#disposed || this.#disposing) {
      throw new Error(`Controller "${this.id}" is disposed.`);
    }
  }

  protected publish(change: TChange): void {
    if (this.#disposed || this.#disposing) return;
    for (const listener of [...this.#changeListeners]) listener(change);
    for (const listener of [...this.#listeners]) listener();
  }
}
