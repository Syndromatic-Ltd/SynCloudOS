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

import { FilePanelReferenceError, isFilePanelAbort, mapFilePanelBrowserException, throwIfFilePanelAborted } from "./FilePanelService";
import type {
  FilePanelAdapter,
  FilePanelCapability,
  FilePanelDirectoryHandle,
  FilePanelFileHandle,
  FilePanelPermissionState,
  FilePanelReference,
  FilePanelReleaseReason,
  FilePanelResult,
  FilePanelWritable,
  FileSystemAccessPanelPort,
  OpenPanelRequest,
  SavePanelRequest,
} from "./filePanelTypes";

type BrowserPermission = "prompt" | "granted" | "denied";

function permissionState(permission: BrowserPermission, wasGranted: boolean): Exclude<FilePanelPermissionState, "not-applicable"> {
  if (permission === "granted") return "granted";
  if (permission === "denied") return wasGranted ? "revoked" : "denied";
  return "prompt";
}

function permissionError(state: Exclude<FilePanelPermissionState, "not-applicable">): FilePanelReferenceError {
  if (state === "revoked") return new FilePanelReferenceError("permission-revoked", "File permission was revoked after it had been granted.");
  if (state === "denied") return new FilePanelReferenceError("permission-denied", "File permission was denied.");
  return new FilePanelReferenceError("permission-required", "File permission must be granted from an active user action.");
}

function errorToPermissionState(error: unknown, wasGranted: boolean): Exclude<FilePanelPermissionState, "not-applicable"> {
  if (isFilePanelAbort(error)) throw error;
  return wasGranted ? "revoked" : "denied";
}

function isPermissionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) return false;
  const name = (error as { readonly name?: unknown }).name;
  return name === "NotAllowedError" || name === "SecurityError";
}

async function throwMappedHandleFailure(
  error: unknown,
  query: () => Promise<Exclude<FilePanelPermissionState, "not-applicable">>,
  wasGranted: boolean,
): Promise<never> {
  if (isFilePanelAbort(error) || error instanceof FilePanelReferenceError) throw error;
  if (!isPermissionFailure(error)) {
    throw new FilePanelReferenceError("operation-failed", "The browser file-handle operation could not be completed.");
  }
  const state = await query();
  throw permissionError(state === "granted" ? (wasGranted ? "revoked" : "denied") : state);
}

async function initialFilePermission(handle: FilePanelFileHandle, mode: "read" | "readwrite"): Promise<BrowserPermission> {
  return handle.queryPermission({ mode });
}

async function initialDirectoryPermission(handle: FilePanelDirectoryHandle, mode: "read" | "readwrite"): Promise<BrowserPermission> {
  return handle.queryPermission({ mode });
}

function fileReference(
  handle: FilePanelFileHandle,
  requestId: string,
  index: number,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "read",
): Extract<FilePanelReference, { readonly kind: "file-handle"; readonly access: "read" }>;
function fileReference(
  handle: FilePanelFileHandle,
  requestId: string,
  index: number,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "readwrite",
): Extract<FilePanelReference, { readonly kind: "file-handle"; readonly access: "readwrite" }>;
function fileReference(
  handle: FilePanelFileHandle,
  requestId: string,
  index: number,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "read" | "readwrite",
): Extract<FilePanelReference, { readonly kind: "file-handle" }> {
  let released = false;
  let wasGranted = initial === "granted";
  let lastPermission: Exclude<FilePanelPermissionState, "not-applicable"> = permissionState(initial, wasGranted);
  const assertLive = (signal?: AbortSignal) => {
    throwIfFilePanelAborted(signal);
    if (released) throw new FilePanelReferenceError("reference-released", "This file-handle wrapper has been released.");
  };
  const query = async (mode: "read" | "readwrite") => {
    assertLive();
    try {
      const raw = await handle.queryPermission({ mode });
      if (raw === "granted") wasGranted = true;
      lastPermission = permissionState(raw, wasGranted);
      return lastPermission;
    } catch (error) {
      lastPermission = errorToPermissionState(error, wasGranted);
      return lastPermission;
    }
  };
  const requestPermission = async (mode: "read" | "readwrite") => {
    assertLive();
    if (!hasTransientUserActivation()) {
      throw new FilePanelReferenceError("permission-required", "File permission must be requested from an active user action.");
    }
    try {
      const raw = await handle.requestPermission({ mode });
      if (raw === "granted") wasGranted = true;
      lastPermission = permissionState(raw, wasGranted);
      return lastPermission;
    } catch (error) {
      lastPermission = errorToPermissionState(error, wasGranted);
      return lastPermission;
    }
  };
  const requirePermission = async (mode: "read" | "readwrite", signal?: AbortSignal) => {
    assertLive(signal);
    const state = await query(mode);
    assertLive(signal);
    if (state !== "granted") throw permissionError(state);
  };
  const base = {
    kind: "file-handle",
    id: `${requestId}:handle:${index}`,
    name: handle.name,
    issuedByRequestId: requestId,
    capabilities: Object.freeze<FilePanelCapability[]>(access === "read" ? ["read", "persistent-handle"] : ["read", "write", "persistent-handle"]),
    get released() { return released; },
    release: (_reason: FilePanelReleaseReason) => { released = true; },
    handle,
    lifetime: "browser-permission",
    get permission() { return lastPermission; },
    queryPermission: async () => query(access),
    requestPermission: async () => requestPermission(access),
    read: async (signal?: AbortSignal) => {
      await requirePermission("read", signal);
      try {
        const file = await handle.getFile();
        assertLive(signal);
        return file;
      } catch (error) {
        return throwMappedHandleFailure(error, () => query("read"), wasGranted);
      }
    },
  } as const;
  if (access === "read") {
    return Object.freeze({ ...base, access: "read" as const });
  }
  const reference: Extract<FilePanelReference, { readonly kind: "file-handle"; readonly access: "readwrite" }> = {
    ...base,
    access: "readwrite",
    createWritable: async (signal?: AbortSignal): Promise<FilePanelWritable> => {
      await requirePermission("readwrite", signal);
      let writable: FilePanelWritable;
      try {
        writable = await handle.createWritable();
      } catch (error) {
        return throwMappedHandleFailure(error, () => query("readwrite"), wasGranted);
      }
      try {
        assertLive(signal);
      } catch (error) {
        try {
          await writable.abort(error);
        } catch {
          // Preserve the original abort/lifetime outcome if browser rollback fails.
        }
        throw error;
      }
      return {
        write: async (data) => {
          await requirePermission("readwrite", signal);
          try {
            await writable.write(data);
            assertLive(signal);
          } catch (error) {
            return throwMappedHandleFailure(error, () => query("readwrite"), wasGranted);
          }
        },
        close: async () => {
          await requirePermission("readwrite", signal);
          try {
            await writable.close();
          } catch (error) {
            return throwMappedHandleFailure(error, () => query("readwrite"), wasGranted);
          }
        },
        abort: async (reason?: unknown) => writable.abort(reason),
      };
    },
  };
  return Object.freeze(reference);
}

function directoryReference(
  handle: FilePanelDirectoryHandle,
  requestId: string,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "read" | "readwrite",
): Extract<FilePanelReference, { readonly kind: "directory-handle" }> {
  let released = false;
  let wasGranted = initial === "granted";
  let lastPermission: Exclude<FilePanelPermissionState, "not-applicable"> = permissionState(initial, wasGranted);
  const assertLive = () => {
    if (released) throw new FilePanelReferenceError("reference-released", "This directory-handle wrapper has been released.");
  };
  const query = async () => {
    assertLive();
    try {
      const raw = await handle.queryPermission({ mode: access });
      if (raw === "granted") wasGranted = true;
      lastPermission = permissionState(raw, wasGranted);
      return lastPermission;
    } catch (error) {
      lastPermission = errorToPermissionState(error, wasGranted);
      return lastPermission;
    }
  };
  const requestPermission = async () => {
    assertLive();
    if (!hasTransientUserActivation()) {
      throw new FilePanelReferenceError("permission-required", "Directory permission must be requested from an active user action.");
    }
    try {
      const raw = await handle.requestPermission({ mode: access });
      if (raw === "granted") wasGranted = true;
      lastPermission = permissionState(raw, wasGranted);
      return lastPermission;
    } catch (error) {
      lastPermission = errorToPermissionState(error, wasGranted);
      return lastPermission;
    }
  };
  return Object.freeze({
    kind: "directory-handle" as const,
    id: `${requestId}:directory:0`,
    name: handle.name,
    issuedByRequestId: requestId,
    capabilities: Object.freeze(access === "read"
      ? ["read", "directory", "persistent-handle"] as const
      : ["read", "write", "directory", "persistent-handle"] as const),
    get released() { return released; },
    release: (_reason: FilePanelReleaseReason) => { released = true; },
    handle,
    lifetime: "browser-permission" as const,
    access,
    get permission() { return lastPermission; },
    queryPermission: query,
    requestPermission,
  });
}

function preflight(port: FileSystemAccessPanelPort): FilePanelResult<never> | null {
  if (!port.isSecureContext()) {
    return { kind: "unavailable", missingCapabilities: Object.freeze(["persistent-handle"]), message: "File System Access requires a secure browser context." };
  }
  if (port.isAvailable && !port.isAvailable()) {
    return { kind: "unavailable", missingCapabilities: Object.freeze(["persistent-handle"]), message: "File System Access is unavailable in this browser." };
  }
  if (!port.hasTransientUserActivation()) {
    return { kind: "denied", reason: "policy", message: "File selection must begin from an active user action." };
  }
  return null;
}

/** File System Access adapter with wrapper-only lifetime; browser handles are never persisted or logged. */
export function createFileSystemAccessPanelAdapter(port: FileSystemAccessPanelPort): FilePanelAdapter {
  return {
    id: "file-system-access",
    capabilities: new Set(["read", "write", "multiple-selection", "directory", "persistent-handle"]),
    supports: () => true,
    async open(request: OpenPanelRequest, signal: AbortSignal): Promise<FilePanelResult<FilePanelReference>> {
      try {
        throwIfFilePanelAborted(signal);
        const blocked = preflight(port);
        if (blocked) return blocked;
        if (request.selection === "single-directory") {
          const handle = await port.openDirectory(signal);
          throwIfFilePanelAborted(signal);
          if (!handle) return { kind: "cancelled" };
          const initial = await initialDirectoryPermission(handle, request.access);
          if (initial === "denied") return { kind: "denied", reason: "permission", message: "Directory access was denied." };
          return { kind: "accepted", values: Object.freeze([directoryReference(handle, request.id, initial, port.hasTransientUserActivation, request.access)]) };
        }
        const handles = await port.openFiles({ accepts: request.accepts, multiple: request.selection === "multiple-files" }, signal);
        throwIfFilePanelAborted(signal);
        if (handles.length === 0) return { kind: "cancelled" };
        if (request.selection === "single-file" && handles.length !== 1) {
          return { kind: "error", message: "The browser returned more than one file for a single-file request." };
        }
        const mode = request.access;
        const initialPermissions = await Promise.all(handles.map((handle) => initialFilePermission(handle, mode)));
        throwIfFilePanelAborted(signal);
        if (initialPermissions.some((permission) => permission === "denied")) {
          return { kind: "denied", reason: "permission", message: "File access was denied." };
        }
        return {
          kind: "accepted",
          values: Object.freeze(handles.map((handle, index) => request.access === "read"
            ? fileReference(handle, request.id, index, initialPermissions[index]!, port.hasTransientUserActivation, "read")
            : fileReference(handle, request.id, index, initialPermissions[index]!, port.hasTransientUserActivation, "readwrite"))),
        };
      } catch (error) {
        return mapFilePanelBrowserException(error);
      }
    },
    async save(request: SavePanelRequest, signal: AbortSignal): Promise<FilePanelResult<import("./filePanelTypes").FilePanelSaveTarget>> {
      try {
        throwIfFilePanelAborted(signal);
        const blocked = preflight(port);
        if (blocked) return blocked;
        const selected = await port.saveFile({ accepts: request.accepts, suggestedName: request.suggestedName }, signal);
        throwIfFilePanelAborted(signal);
        if (!selected) return { kind: "cancelled" };
        const initial = await initialFilePermission(selected.handle, "readwrite");
        if (initial === "denied") return { kind: "denied", reason: "permission", message: "Write access was denied." };
        const reference = fileReference(selected.handle, request.id, 0, initial, port.hasTransientUserActivation, "readwrite");
        const sink = {
          kind: "file-handle-export" as const,
          async write(payload: import("./filePanelTypes").FilePanelExportPayload, writeSignal?: AbortSignal) {
            throwIfFilePanelAborted(writeSignal);
            let writable: FilePanelWritable | null = null;
            try {
              const created = await reference.createWritable(writeSignal);
              writable = created;
              await created.write(payload.blob);
              throwIfFilePanelAborted(writeSignal);
              await created.close();
              writable = null;
              return { kind: "exported" as const, fileName: payload.fileName };
            } catch (error) {
              if (writable) {
                try {
                  await writable.abort(error);
                } catch {
                  // A best-effort backend rollback must never replace the primary outcome.
                }
              }
              if (isFilePanelAbort(error)) return { kind: "cancelled" as const };
              throw error;
            }
          },
        };
        return { kind: "accepted", values: Object.freeze([{ kind: "file-handle", reference, sink, exists: selected.exists }]) };
      } catch (error) {
        return mapFilePanelBrowserException(error);
      }
    },
  };
}
