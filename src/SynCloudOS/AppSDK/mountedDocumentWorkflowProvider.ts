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

import type { AppClientHandle, AppCommandClient, AppDocumentNewRequest, AppDocumentSnapshot, AppDocumentWorkflowContext, AppDocumentWorkflowProvider, AppWorkspaceDocumentsClient } from "./appClientTypes";
import { DocumentUnavailableError } from "../Documents/DocumentErrors";

/** Registers chooser-backed commands with the existing mounted command port. */
export function registerMountedDocumentWorkflowProvider(options: {
  readonly provider: AppDocumentWorkflowProvider;
  readonly applicationId: string;
  readonly responderId: string;
  readonly commands: Pick<AppCommandClient, "register">;
  readonly documents: Pick<AppWorkspaceDocumentsClient, "newDocument" | "openDocument">;
  readonly signal: AbortSignal;
  readonly assertLive: () => void;
  readonly targetUnavailableReason: () => string | undefined;
}): AppClientHandle {
  options.assertLive();
  const { chooseNewDocument, chooseOpenDocument, validate } = options.provider;
  const registrations: AppClientHandle[] = [];
  let active = true;
  const controller = new AbortController();
  const dispose = () => {
    if (!active) return false;
    active = false;
    controller.abort("Document workflow provider disposed.");
    options.signal.removeEventListener("abort", dispose);
    for (const registration of registrations.splice(0)) registration.dispose();
    return true;
  };
  const register = <TRequest extends AppDocumentNewRequest>(
    action: "new" | "open",
    chooser: (context: AppDocumentWorkflowContext) => TRequest | null | Promise<TRequest | null>,
    commit: (request: TRequest, signal: AbortSignal) => Promise<AppDocumentSnapshot>,
  ) => {
    registrations.push(options.commands.register({
      id: `document.${action}`, responderId: options.responderId,
      title: { key: `command.document.${action}`, fallback: action === "new" ? "New" : "Open…" },
      payload: { description: "No payload.", parse: (value: unknown) => value === undefined ? { ok: true, value: undefined } : { ok: false, issues: ["This command does not accept a payload."] } },
      scope: "application", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => {
        options.assertLive();
        const targetReason = options.targetUnavailableReason();
        if (targetReason) return { enabled: false, disabledReason: targetReason };
        return active ? validate?.(action) ?? { enabled: true } : { enabled: false, disabledReason: "The document workflow provider was disposed." };
      },
      execute: async ({ signal }: { signal: AbortSignal }) => {
        options.assertLive();
        const operationSignal = AbortSignal.any([options.signal, controller.signal, signal]);
        operationSignal.throwIfAborted();
        const targetReason = options.targetUnavailableReason();
        if (targetReason) throw new DocumentUnavailableError(targetReason, { retryable: false });
        const request = await chooser(Object.freeze({ applicationId: options.applicationId, signal: operationSignal }));
        options.assertLive();
        operationSignal.throwIfAborted();
        const currentTargetReason = options.targetUnavailableReason();
        if (currentTargetReason) throw new DocumentUnavailableError(currentTargetReason, { retryable: false });
        if (!request) return null;
        const requestSignal = request.signal ? AbortSignal.any([operationSignal, request.signal]) : operationSignal;
        return commit(request, requestSignal);
      },
    }));
  };
  try {
    if (chooseNewDocument) register("new", chooseNewDocument, (request, signal) => options.documents.newDocument({ ...request, signal }));
    if (chooseOpenDocument) register("open", chooseOpenDocument, (request, signal) => options.documents.openDocument({ ...request, signal }));
    options.signal.addEventListener("abort", dispose, { once: true });
  } catch (error) {
    dispose();
    throw error;
  }
  return Object.freeze({ dispose });
}
