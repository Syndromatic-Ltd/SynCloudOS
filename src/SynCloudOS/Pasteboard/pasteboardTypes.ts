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

import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicySubject } from "../PolicyKit/policyTypes";

export type PasteboardName = "system" | "drag" | "find" | `app:${string}`;

/**
 * The caller that is asking the runtime-owned board to cross a capability
 * boundary. This is a handle context, never a synthetic pasteboard identity.
 */
export interface PasteboardAccessContext {
  readonly appId: string;
  readonly windowControllerId?: string;
  readonly responderId?: string;
}

/** Opaque runtime-issued authority. A copied object or a lease from another
 * runtime is not recognised by the registry that owns the board. */
declare const pasteboardAccessLeaseBrand: unique symbol;
export interface PasteboardAccessLease {
  readonly [pasteboardAccessLeaseBrand]: true;
}

export type PasteboardCanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly PasteboardCanonicalValue[]
  | { readonly [key: string]: PasteboardCanonicalValue };

export type PasteboardRepresentation =
  | { readonly type: "text/plain" | "text/html" | "text/uri-list" | "text/rtf"; readonly value: string }
  | { readonly type: "application/x-syncloudos-colour"; readonly value: string }
  | {
      readonly type: "application/x-syncloudos-document";
      readonly value: { readonly typeId: string; readonly documentId: string };
    }
  | { readonly type: `application/x-syncloudos-${string}`; readonly value: PasteboardCanonicalValue }
  | { readonly type: `image/${string}` | "application/octet-stream"; readonly value: Blob };

export interface LazyPasteboardRepresentation {
  readonly type: PasteboardRepresentation["type"];
  provide(signal: AbortSignal): PasteboardRepresentation["value"] | Promise<PasteboardRepresentation["value"]>;
}

export type PasteboardRepresentationInput = PasteboardRepresentation | LazyPasteboardRepresentation;

export interface PasteboardAdapter {
  read(
    types: readonly string[],
    signal?: AbortSignal,
  ): Promise<readonly PasteboardRepresentation[]>;
  write(
    values: readonly PasteboardRepresentation[],
    signal?: AbortSignal,
  ): Promise<void | PasteboardWriteResult>;
}

/** An explicit browser fallback result. Partial writes are never implicit. */
export interface PasteboardWriteResult {
  readonly writtenTypes: readonly string[];
  readonly omittedTypes: readonly string[];
  readonly partial: boolean;
}

export interface PasteboardRegistry {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly system: Pasteboard;
  readonly drag: Pasteboard;
  readonly find: Pasteboard;
  named(name: PasteboardName): Pasteboard;
  /** Creates a caller-bound facade only for a runtime-issued opaque lease. */
  forLease(lease: PasteboardAccessLease): PasteboardRegistryHandle;
  dispose(): void;
}

/** A caller-bound view over canonical runtime boards; it owns no board state. */
export interface PasteboardRegistryHandle {
  readonly context: PasteboardAccessContext;
  readonly system: PasteboardHandle;
  readonly drag: PasteboardHandle;
  readonly find: PasteboardHandle;
  named(name: PasteboardName): PasteboardHandle;
}

export interface Pasteboard {
  readonly name: PasteboardName;
  readonly changeCount: number;
  snapshot(): readonly PasteboardRepresentation[];
  write(values: readonly PasteboardRepresentationInput[], signal?: AbortSignal): Promise<void | PasteboardWriteResult>;
  read(types: readonly string[], signal?: AbortSignal): Promise<readonly PasteboardRepresentation[]>;
  readFirst(types: readonly string[], signal?: AbortSignal): Promise<PasteboardRepresentation | null>;
  clear(): void;
  dispose(): void;
}

/** A caller-bound operation handle over one canonical Pasteboard. */
export interface PasteboardHandle {
  readonly name: PasteboardName;
  readonly context: PasteboardAccessContext;
  readonly changeCount: number;
  snapshot(signal?: AbortSignal): Promise<readonly PasteboardRepresentation[]>;
  write(values: readonly PasteboardRepresentationInput[], signal?: AbortSignal): Promise<void | PasteboardWriteResult>;
  read(types: readonly string[], signal?: AbortSignal): Promise<readonly PasteboardRepresentation[]>;
  readFirst(types: readonly string[], signal?: AbortSignal): Promise<PasteboardRepresentation | null>;
  clear(signal?: AbortSignal): Promise<void>;
}

export type PasteboardTransferCapability = "transfer.same-application" | "transfer.cross-application";

export interface PasteboardPolicyRequest {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly name: PasteboardName;
  readonly operation: "read" | "write" | "snapshot" | "clear";
  readonly types: readonly string[];
  readonly capability: PasteboardTransferCapability;
  readonly context?: PasteboardAccessContext;
  readonly subject?: SynCloudOSPolicySubject;
}

export interface PasteboardAuthorisationPort {
  authorise(request: PasteboardPolicyRequest, signal: AbortSignal): boolean | Promise<boolean> | SynCloudOSPolicyDecision;
}

export interface CreatePasteboardRegistryOptions {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly signal: AbortSignal;
  readonly adapter?: PasteboardAdapter | null;
  readonly authorise?: PasteboardAuthorisationPort["authorise"];
}

/** Kernel-only issuance/control surface. It is deliberately separate from the
 * app-visible registry so caller-provided ids can never mint an app handle. */
export interface PasteboardRuntimeControl {
  /** @internal Only the drag endpoint issuer may mint a lease that can mirror
   * the active drag payload. Application-visible scopes never receive it. */
  issueLease(
    context: PasteboardAccessContext,
    validate: () => PasteboardAccessContext | null,
    options?: { readonly allowDrag?: boolean; readonly ownsPrivateBoard?: boolean },
  ): PasteboardAccessLease;
  /** Clears only the app-private board owned by this lease during teardown. */
  clearLease(lease: PasteboardAccessLease): Promise<void>;
  forLease(lease: PasteboardAccessLease): PasteboardRegistryHandle;
}
