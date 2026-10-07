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
  DocumentCloseReason,
  DocumentPresentationCloseCoordinator,
  DocumentPresentationClosePreparation,
  DocumentPresentationCloseRequest,
  DocumentPresentationCloseSetPreparation,
  DocumentPresentationCloseSetRequest,
} from "../Documents";
import type { WindowManager } from "./WindowManager";
import type { WindowClosePreparationToken, WindowCloseRequest, WindowIdPort } from "./windowTypes";

interface LivePresentationPreparation {
  readonly publicPreparation: Extract<DocumentPresentationClosePreparation, { readonly status: "ready" }>;
  readonly windowToken: WindowClosePreparationToken;
}

interface LivePresentationSetPreparation {
  readonly publicPreparation: Extract<DocumentPresentationCloseSetPreparation, { readonly status: "ready" }>;
  readonly windowToken: WindowClosePreparationToken;
}

const windowReasonByDocumentReason: Readonly<Record<DocumentCloseReason, WindowCloseRequest["reason"]>> = {
  user: "command",
  "window-control": "control",
  "window-command": "command",
  "parent-close": "parent-close",
  "application-quit": "application-quit",
  "session-replacement": "application-quit",
  "runtime-dispose": "runtime-dispose",
};

export class WindowDocumentPresentationCloseCoordinator implements DocumentPresentationCloseCoordinator {
  readonly #live = new Map<string, LivePresentationPreparation>();
  readonly #liveSets = new Map<string, LivePresentationSetPreparation>();
  #disposed = false;

  constructor(
    private readonly manager: WindowManager,
    private readonly ids: WindowIdPort,
    private readonly observeError: (error: unknown) => void,
  ) {}

  async prepareClose(request: DocumentPresentationCloseRequest): Promise<DocumentPresentationClosePreparation> {
    if (this.#disposed) return { status: "cancelled", reason: "window-coordinator-disposed" };
    const associationIds = request.associations.map(({ windowControllerId }) => windowControllerId);
    for (const association of request.associations) {
      const controller = this.manager.select(association.windowControllerId);
      if (
        controller.record.documentId !== request.documentId ||
        controller.record.documentAssociationRole !== association.role
      ) return { status: "cancelled", reason: "window-association-mismatch" };
    }
    const associationSet = new Set(associationIds);
    const roots = associationIds.filter((id) => {
      let parentId = this.manager.select(id).record.parentWindowControllerId;
      while (parentId) {
        if (associationSet.has(parentId)) return false;
        parentId = this.manager.select(parentId).record.parentWindowControllerId;
      }
      return true;
    });
    const prepared = await this.manager.prepareCloseForest(roots, {
      reason: windowReasonByDocumentReason[request.reason],
      signal: request.signal,
    }, associationIds[0] ?? request.documentId);
    if (prepared.status !== "ready") return { status: "cancelled", reason: prepared.reason };
    const token = this.ids.next("document-presentation-close-preparation");
    const publicPreparation = Object.freeze({
      status: "ready" as const,
      token,
      documentId: request.documentId,
      associationIds: Object.freeze([...associationIds]),
    });
    this.#live.set(token, { publicPreparation, windowToken: prepared.token });
    return publicPreparation;
  }

  async prepareCloseSet(request: DocumentPresentationCloseSetRequest): Promise<DocumentPresentationCloseSetPreparation> {
    if (this.#disposed) return { status: "cancelled", reason: "window-coordinator-disposed" };
    const documentIds = request.documents.map(({ documentId }) => documentId);
    if (new Set(documentIds).size !== documentIds.length) {
      return { status: "cancelled", reason: "duplicate-document-selection" };
    }
    const associationIdsByDocument: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
    const allAssociationIds: string[] = [];
    for (const document of request.documents) {
      const associationIds = document.associations.map(({ windowControllerId }) => windowControllerId);
      for (const association of document.associations) {
        const controller = this.manager.select(association.windowControllerId);
        if (
          controller.record.documentId !== document.documentId ||
          controller.record.documentAssociationRole !== association.role
        ) return { status: "cancelled", reason: "window-association-mismatch" };
      }
      associationIdsByDocument[document.documentId] = Object.freeze([...associationIds]);
      allAssociationIds.push(...associationIds);
    }
    const associationSet = new Set(allAssociationIds);
    const requestedRoots = request.presentationRootIds?.length
      ? [...new Set(request.presentationRootIds)]
      : [...associationSet].filter((id) => {
          let parentId = this.manager.select(id).record.parentWindowControllerId;
          while (parentId) {
            if (associationSet.has(parentId)) return false;
            parentId = this.manager.select(parentId).record.parentWindowControllerId;
          }
          return true;
        });
    const requestedRootSet = new Set(requestedRoots);
    const roots = requestedRoots.filter((id) => {
      let parentId = this.manager.select(id).record.parentWindowControllerId;
      while (parentId) {
        if (requestedRootSet.has(parentId)) return false;
        parentId = this.manager.select(parentId).record.parentWindowControllerId;
      }
      return true;
    });
    const prepared = await this.manager.prepareCloseForest(roots, {
      reason: windowReasonByDocumentReason[request.reason],
      signal: request.signal,
    }, allAssociationIds[0] ?? documentIds[0] ?? "");
    if (prepared.status !== "ready") return { status: "cancelled", reason: prepared.reason };
    const preparedWindowIds = new Set(prepared.token.preparedWindowControllerIds);
    if (allAssociationIds.some((id) => !preparedWindowIds.has(id))) {
      try { this.manager.rollbackClose(prepared.token); }
      catch (error) { this.observeError(error); }
      return { status: "cancelled", reason: "presentation-root-coverage-mismatch" };
    }
    const token = this.ids.next("document-presentation-close-preparation");
    const publicPreparation = Object.freeze({
      status: "ready" as const,
      token,
      documentIds: Object.freeze([...documentIds]),
      associationIdsByDocument: Object.freeze(associationIdsByDocument),
    });
    this.#liveSets.set(token, { publicPreparation, windowToken: prepared.token });
    return publicPreparation;
  }

  validateCloseSet(
    preparation: Extract<DocumentPresentationCloseSetPreparation, { readonly status: "ready" }>,
  ): void {
    const live = this.#liveSets.get(preparation.token);
    if (!live || live.publicPreparation !== preparation) {
      throw new Error("The document presentation close-set preparation is stale or invalid.");
    }
    this.manager.validateClose(live.windowToken);
  }

  commitCloseSet(
    preparation: Extract<DocumentPresentationCloseSetPreparation, { readonly status: "ready" }>,
    commitDocuments: () => void,
  ): void {
    const live = this.#liveSets.get(preparation.token);
    if (!live || live.publicPreparation !== preparation) {
      throw new Error("The document presentation close-set preparation is stale or invalid.");
    }
    this.manager.validateClose(live.windowToken);
    this.#liveSets.delete(preparation.token);
    try {
      this.manager.commitCloseTransaction(live.windowToken, commitDocuments, preparation.associationIdsByDocument);
    } catch (error) {
      this.observeError(error);
      throw error;
    }
  }

  rollbackCloseSet(
    preparation: Extract<DocumentPresentationCloseSetPreparation, { readonly status: "ready" }>,
  ): void {
    const live = this.#liveSets.get(preparation.token);
    if (!live || live.publicPreparation !== preparation) return;
    this.#liveSets.delete(preparation.token);
    try { this.manager.rollbackClose(live.windowToken); }
    catch (error) { this.observeError(error); }
  }

  commitClose(
    preparation: Extract<DocumentPresentationClosePreparation, { readonly status: "ready" }>,
    commitDocument: () => void,
  ): void {
    const live = this.#live.get(preparation.token);
    if (!live || live.publicPreparation !== preparation) return;
    this.#live.delete(preparation.token);
    try { this.manager.commitCloseTransaction(live.windowToken, commitDocument); }
    catch (error) {
      this.observeError(error);
      throw error;
    }
  }

  rollbackClose(preparation: Extract<DocumentPresentationClosePreparation, { readonly status: "ready" }>): void {
    const live = this.#live.get(preparation.token);
    if (!live || live.publicPreparation !== preparation) return;
    this.#live.delete(preparation.token);
    try { this.manager.rollbackClose(live.windowToken); }
    catch (error) { this.observeError(error); }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const live of this.#live.values()) {
      try { this.manager.rollbackClose(live.windowToken); } catch (error) { this.observeError(error); }
    }
    this.#live.clear();
    for (const live of this.#liveSets.values()) {
      try { this.manager.rollbackClose(live.windowToken); } catch (error) { this.observeError(error); }
    }
    this.#liveSets.clear();
  }
}
