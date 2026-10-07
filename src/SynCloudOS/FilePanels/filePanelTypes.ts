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
  DocumentController,
  DocumentLocation,
  DocumentVersion,
  SaveAsDocumentResult,
} from "../Documents";

export interface FilePanelAcceptType {
  readonly description: string;
  readonly mimeTypes: readonly `${string}/${string}`[];
  readonly extensions: readonly `.${string}`[];
}

export type FilePanelCapability =
  | "read"
  | "write"
  | "multiple-selection"
  | "directory"
  | "persistent-handle"
  | "download-export";

export type FilePanelPermissionState =
  | "not-applicable"
  | "prompt"
  | "granted"
  | "denied"
  | "revoked";

export interface FilePanelWritable {
  write(data: Blob | Uint8Array | string): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface FilePanelFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FilePanelWritable>;
  queryPermission(options: { readonly mode: "read" | "readwrite" }): Promise<"prompt" | "granted" | "denied">;
  requestPermission(options: { readonly mode: "read" | "readwrite" }): Promise<"prompt" | "granted" | "denied">;
}

export interface FilePanelDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  queryPermission(options: { readonly mode: "read" | "readwrite" }): Promise<"prompt" | "granted" | "denied">;
  requestPermission(options: { readonly mode: "read" | "readwrite" }): Promise<"prompt" | "granted" | "denied">;
}

export type FilePanelReleaseReason = "caller-finished" | "runtime-disposed" | "request-replaced" | "test-complete";

export interface FilePanelReferenceBase {
  readonly id: string;
  readonly name: string;
  readonly issuedByRequestId: string;
  readonly capabilities: readonly FilePanelCapability[];
  readonly released: boolean;
  release(reason: FilePanelReleaseReason): void;
}

export type FilePanelReference =
  | (FilePanelReferenceBase & {
      readonly kind: "ephemeral-file";
      readonly file: File;
      readonly mediaType: string;
      readonly size: number;
      readonly lastModified: number;
      readonly lifetime: "runtime-memory";
      readonly permission: "granted";
      read(signal?: AbortSignal): Promise<File>;
    })
  | (FilePanelReferenceBase & {
      readonly kind: "file-handle";
      readonly handle: FilePanelFileHandle;
      readonly lifetime: "browser-permission";
      readonly access: "read";
      readonly permission: Exclude<FilePanelPermissionState, "not-applicable">;
      queryPermission(): Promise<FilePanelPermissionState>;
      requestPermission(): Promise<FilePanelPermissionState>;
      read(signal?: AbortSignal): Promise<File>;
    })
  | (FilePanelReferenceBase & {
      readonly kind: "file-handle";
      readonly handle: FilePanelFileHandle;
      readonly lifetime: "browser-permission";
      readonly access: "readwrite";
      readonly permission: Exclude<FilePanelPermissionState, "not-applicable">;
      queryPermission(): Promise<FilePanelPermissionState>;
      requestPermission(): Promise<FilePanelPermissionState>;
      read(signal?: AbortSignal): Promise<File>;
      createWritable(signal?: AbortSignal): Promise<FilePanelWritable>;
    })
  | (FilePanelReferenceBase & {
      readonly kind: "directory-handle";
      readonly handle: FilePanelDirectoryHandle;
      readonly lifetime: "browser-permission";
      readonly access: "read" | "readwrite";
      readonly permission: Exclude<FilePanelPermissionState, "not-applicable">;
      queryPermission(): Promise<FilePanelPermissionState>;
      requestPermission(): Promise<FilePanelPermissionState>;
    });

export interface OpenPanelRequest {
  readonly id: string;
  readonly accepts: readonly FilePanelAcceptType[];
  readonly selection: "single-file" | "multiple-files" | "single-directory";
  readonly access: "read" | "readwrite";
  readonly requires: readonly FilePanelCapability[];
  /** A caller-controlled content check; names/MIME metadata are never a trust boundary. */
  readonly validateContent?: (
    reference: FilePanelReference,
    signal: AbortSignal,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
}

export interface FilePanelConflict {
  readonly kind: "existing-file" | "document-version";
  readonly displayName: string;
  readonly target: FilePanelSaveTarget | DocumentLocation;
  readonly expectedVersion?: DocumentVersion;
}

export type FilePanelConflictDecision = "replace" | "choose-another" | "cancel";

export interface FilePanelExportPayload {
  readonly fileName: string;
  readonly mediaType: string;
  readonly blob: Blob;
}

export interface FilePanelExportSink {
  readonly kind: "file-handle-export" | "download-export";
  write(
    payload: FilePanelExportPayload,
    signal?: AbortSignal,
  ): Promise<{ readonly kind: "exported"; readonly fileName: string } | { readonly kind: "cancelled" }>;
}

export type FilePanelSaveTarget =
  | {
      readonly kind: "file-handle";
      readonly reference: Extract<FilePanelReference, { readonly kind: "file-handle" }>;
      readonly sink: FilePanelExportSink;
      readonly exists: boolean;
    }
  | {
      readonly kind: "download-export";
      readonly suggestedName: string;
      readonly sink: FilePanelExportSink;
      readonly exists: false;
    };

interface SavePanelRequestBase {
  readonly id: string;
  readonly accepts: readonly FilePanelAcceptType[];
  readonly suggestedName: string;
  readonly destination: "persistent-handle-required" | "handle-or-download";
  readonly existingTarget?: FilePanelSaveTarget;
}

export type SavePanelRequest =
  | (SavePanelRequestBase & {
      readonly conflictPolicy: "fail-if-exists";
      readonly confirmConflict?: never;
    })
  | (SavePanelRequestBase & {
      readonly conflictPolicy: "confirm-replace";
      readonly confirmConflict: (
        conflict: FilePanelConflict,
        signal: AbortSignal,
      ) => Promise<FilePanelConflictDecision>;
    });

export type FilePanelResult<T> =
  | { readonly kind: "accepted"; readonly values: readonly T[] }
  | { readonly kind: "cancelled" }
  /** A conflict chooser explicitly asked the caller to present destination selection again. */
  | { readonly kind: "choose-another" }
  | { readonly kind: "denied"; readonly reason: "permission" | "policy"; readonly message: string }
  | { readonly kind: "unavailable"; readonly missingCapabilities: readonly FilePanelCapability[]; readonly message: string }
  | { readonly kind: "revoked"; readonly referenceId: string; readonly message: string }
  | { readonly kind: "interrupted"; readonly message: string }
  | { readonly kind: "error"; readonly message: string; readonly cause?: unknown };

export interface FilePanelAdapter {
  readonly id: string;
  readonly capabilities: ReadonlySet<FilePanelCapability>;
  supports(request: OpenPanelRequest | SavePanelRequest): boolean;
  open(request: OpenPanelRequest, signal: AbortSignal): Promise<FilePanelResult<FilePanelReference>>;
  save(request: SavePanelRequest, signal: AbortSignal): Promise<FilePanelResult<FilePanelSaveTarget>>;
}

export interface FilePanelService {
  open(request: OpenPanelRequest, signal?: AbortSignal): Promise<FilePanelResult<FilePanelReference>>;
  save(request: SavePanelRequest, signal?: AbortSignal): Promise<FilePanelResult<FilePanelSaveTarget>>;
  release(reference: FilePanelReference, reason: FilePanelReleaseReason): void;
  dispose(): void;
}

/** Browser input is injected by the platform boundary; the adapter never reaches for document/window itself. */
interface BrowserFilePanelSelectionBase {
  /** Idempotently removes the platform-owned detached input after settlement. */
  cleanup(): void;
}

export type BrowserFilePanelSelection =
  | (BrowserFilePanelSelectionBase & { readonly kind: "accepted"; readonly files: readonly File[] })
  | (BrowserFilePanelSelectionBase & { readonly kind: "cancelled" });

export interface BrowserFilePanelPort {
  /**
   * The platform owns its detached `<input>` and must remove it before a
   * rejection. Returned selections carry an idempotent settlement cleanup so
   * the adapter can remove it after converting files to ephemeral wrappers.
   */
  readonly id?: string;
  pickFiles(request: OpenPanelRequest, signal: AbortSignal): Promise<BrowserFilePanelSelection>;
}

export interface FileSystemAccessOpenOptions {
  readonly accepts: readonly FilePanelAcceptType[];
  readonly multiple: boolean;
}

export interface FileSystemAccessSaveOptions {
  readonly accepts: readonly FilePanelAcceptType[];
  readonly suggestedName: string;
}

export interface FileSystemAccessSaveSelection {
  readonly handle: FilePanelFileHandle;
  readonly exists: boolean;
}

/** The only browser-facing authority for File System Access. */
export interface FileSystemAccessPanelPort {
  isSecureContext(): boolean;
  /** False means the browser does not expose this capability at all. */
  isAvailable?(): boolean;
  hasTransientUserActivation(): boolean;
  openFiles(options: FileSystemAccessOpenOptions, signal: AbortSignal): Promise<readonly FilePanelFileHandle[]>;
  openDirectory(signal: AbortSignal): Promise<FilePanelDirectoryHandle | null>;
  saveFile(options: FileSystemAccessSaveOptions, signal: AbortSignal): Promise<FileSystemAccessSaveSelection | null>;
}

export interface DownloadFilePanelPort {
  readonly id?: string;
  export(
    payload: FilePanelExportPayload,
    signal?: AbortSignal,
  ): Promise<{ readonly kind: "exported"; readonly fileName: string } | { readonly kind: "cancelled" }>;
}

export interface FilePanelDocumentSaveBinding {
  readonly documentId: string;
  readonly documentController: Pick<DocumentController, "saveAsDocument">;
  resolveDocumentDestination(
    target: FilePanelSaveTarget,
    signal: AbortSignal,
  ): Promise<{
    readonly location: DocumentLocation;
    readonly expectedVersion?: DocumentVersion;
  } | null>;
  createExportPayload(
    target: FilePanelSaveTarget,
    signal: AbortSignal,
  ): Promise<FilePanelExportPayload>;
  confirmConflict(
    conflict: FilePanelConflict,
    signal: AbortSignal,
  ): Promise<FilePanelConflictDecision>;
}

export type FilePanelDocumentSaveResult = SaveAsDocumentResult
  | { readonly kind: "exported"; readonly fileName: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "choose-another" };
