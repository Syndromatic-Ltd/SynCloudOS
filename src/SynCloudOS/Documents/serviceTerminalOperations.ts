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

import type { ApplicationDocumentSnapshot } from "./ApplicationDocument";
import type { DocumentCloseReason, DocumentCloseResult } from "./documentTypes";
import type { ReserveTerminalProviderOperationRequest, TerminalProviderOperationSnapshot } from "./DocumentController";

/** Host service capability issued by one mounted application, not an app-callable provider executor. */
export interface ServiceTerminalReceipt<TState, TResult = unknown> {
  readonly serviceId: string;
  readonly documentId: string;
  readonly operationKind: string;
  readonly operationIdentity: string;
  operationSnapshot(): TerminalProviderOperationSnapshot<TState, TResult>;
  waitForProvider(signal?: AbortSignal): Promise<TResult>;
  updateState(state: TState): unknown;
  snapshot<TModel>(): ApplicationDocumentSnapshot<TModel>;
  synchronise<TModel>(transform: (current: Readonly<TModel>) => TModel): ApplicationDocumentSnapshot<TModel>;
  save(signal?: AbortSignal): Promise<void>;
  recoverWrite(signal?: AbortSignal): Promise<void>;
  close(reason: DocumentCloseReason, signal?: AbortSignal): Promise<DocumentCloseResult>;
  release(): Promise<boolean>;
}

export interface ServiceTerminalOperations {
  reserve<TState, TResult>(request: Omit<ReserveTerminalProviderOperationRequest<TState, TResult>, "applicationId" | "serviceId" | "initialClaim">): ServiceTerminalReceipt<TState, TResult>;
  claim<TState, TResult = unknown>(): ServiceTerminalReceipt<TState, TResult> | null;
  subscribe(listener: () => void): () => void;
}

/** An application supplies domain intent and opaque reconciliation state.
 * Only the installed host provider can turn that intent into an executor. */
export interface ServiceTerminalRequest<TIntent, TState> {
  readonly documentId: string;
  readonly providerDocumentId: string;
  readonly operationIdentity: string;
  readonly operation: TIntent;
  readonly initialState: TState;
}

export interface ServiceTerminalClient<TIntent, TResult = unknown> {
  reserveTerminalProviderOperation<TState>(request: ServiceTerminalRequest<TIntent, TState>): ServiceTerminalReceipt<TState, TResult>;
  claimTerminalProviderOperation<TState>(): ServiceTerminalReceipt<TState, TResult> | null;
  subscribeTerminalProviderOperations(listener: () => void): () => void;
}
