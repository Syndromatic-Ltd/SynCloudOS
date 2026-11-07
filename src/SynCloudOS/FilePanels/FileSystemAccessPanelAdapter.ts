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

import type { NativeOperationActivity } from "../Updates/updateReadiness";
type ObserveHandleWork = <T>(invoke: () => Promise<T>, rollback?: boolean) => Promise<T>;
const observeDirect: ObserveHandleWork = invoke => invoke();

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

async function initialFilePermission(handle: FilePanelFileHandle, mode: "read" | "readwrite", observe: ObserveHandleWork, signal: AbortSignal): Promise<BrowserPermission> {
  return observe(() => { signal.throwIfAborted(); return handle.queryPermission({ mode }); });
}

async function initialDirectoryPermission(handle: FilePanelDirectoryHandle, mode: "read" | "readwrite", observe: ObserveHandleWork, signal: AbortSignal): Promise<BrowserPermission> {
  return observe(() => { signal.throwIfAborted(); return handle.queryPermission({ mode }); });
}

function fileReference(
  handle: FilePanelFileHandle,
  requestId: string,
  index: number,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "read",
  observe?: ObserveHandleWork,
): Extract<FilePanelReference, { readonly kind: "file-handle"; readonly access: "read" }>;
function fileReference(
  handle: FilePanelFileHandle,
  requestId: string,
  index: number,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "readwrite",
  observe?: ObserveHandleWork,
): Extract<FilePanelReference, { readonly kind: "file-handle"; readonly access: "readwrite" }>;
function fileReference(
  handle: FilePanelFileHandle,
  requestId: string,
  index: number,
  initial: BrowserPermission,
  hasTransientUserActivation: () => boolean,
  access: "read" | "readwrite",
  observe: ObserveHandleWork = observeDirect,
): Extract<FilePanelReference, { readonly kind: "file-handle" }> {
  let released = false;
  let wasGranted = initial === "granted";
  let lastPermission: Exclude<FilePanelPermissionState, "not-applicable"> = permissionState(initial, wasGranted);
  const assertLive = (signal?: AbortSignal) => {
    throwIfFilePanelAborted(signal);
    if (released) throw new FilePanelReferenceError("reference-released", "This file-handle wrapper has been released.");
  };
  const invoke = <T,>(run: () => Promise<T>, signal?: AbortSignal) => observe(() => { assertLive(signal); return run(); });
  const query = async (mode: "read" | "readwrite", signal?: AbortSignal) => {
    assertLive();
    try {
      const raw = await invoke(() => handle.queryPermission({ mode }), signal);
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
      const raw = await invoke(() => handle.requestPermission({ mode }));
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
    const state = await query(mode, signal);
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
        const file = await invoke(() => handle.getFile(), signal);
        assertLive(signal);
        return file;
      } catch (error) {
        return throwMappedHandleFailure(error, () => query("read"), wasGranted);
      }
    },
  } as const;
  if (access === "read") {
    return Object.freeze({ ...base, access: "read" as const, get released() { return released; }, get permission() { return lastPermission; } });
  }
  const reference: Extract<FilePanelReference, { readonly kind: "file-handle"; readonly access: "readwrite" }> = {
    ...base,
    access: "readwrite",
    get released() { return released; },
    get permission() { return lastPermission; },
    createWritable: async (signal?: AbortSignal): Promise<FilePanelWritable> => {
      await requirePermission("readwrite", signal);
      let writable: FilePanelWritable;
      try {
        writable = await invoke(() => handle.createWritable(), signal);
      } catch (error) {
        return throwMappedHandleFailure(error, () => query("readwrite"), wasGranted);
      }
      try {
        assertLive(signal);
      } catch (error) {
        try {
          await observe(() => writable.abort(error), true);
        } catch {
          // Preserve the original abort/lifetime outcome if browser rollback fails.
        }
        throw error;
      }
      return {
        write: async (data) => {
          await requirePermission("readwrite", signal);
          try {
            await invoke(() => writable.write(data), signal);
            assertLive(signal);
          } catch (error) {
            return throwMappedHandleFailure(error, () => query("readwrite"), wasGranted);
          }
        },
        close: async () => {
          await requirePermission("readwrite", signal);
          try {
            await invoke(() => writable.close(), signal);
          } catch (error) {
            return throwMappedHandleFailure(error, () => query("readwrite"), wasGranted);
          }
        },
        abort: async (reason?: unknown) => observe(() => writable.abort(reason), true),
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
  observe: ObserveHandleWork = observeDirect,
): Extract<FilePanelReference, { readonly kind: "directory-handle" }> {
  let released = false;
  let wasGranted = initial === "granted";
  let lastPermission: Exclude<FilePanelPermissionState, "not-applicable"> = permissionState(initial, wasGranted);
  const assertLive = () => {
    if (released) throw new FilePanelReferenceError("reference-released", "This directory-handle wrapper has been released.");
  };
  const invoke = <T,>(run: () => Promise<T>) => observe(() => { assertLive(); return run(); });
  const query = async () => {
    assertLive();
    try {
      const raw = await invoke(() => handle.queryPermission({ mode: access }));
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
      const raw = await invoke(() => handle.requestPermission({ mode: access }));
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

function preflight(port: FileSystemAccessPanelPort, operation: "open" | "save" | "directory"): FilePanelResult<never> | null {
  if (!port.isSecureContext()) {
    return { kind: "unavailable", missingCapabilities: Object.freeze(["persistent-handle"]), message: "File System Access requires a secure browser context." };
  }
  if (port.isAvailable && !port.isAvailable(operation)) {
    return { kind: "unavailable", missingCapabilities: Object.freeze(["persistent-handle"]), message: "File System Access is unavailable in this browser." };
  }
  if (!port.hasTransientUserActivation()) {
    return { kind: "denied", reason: "policy", message: "File selection must begin from an active user action." };
  }
  return null;
}

function pickerFailure(error:unknown,signal:AbortSignal):FilePanelResult<never>{
  const name=typeof error==='object'&&error!==null&&'name'in error?error.name:null;
  if(!signal.aborted&&name==='AbortError')return {kind:'cancelled'};
  // Availability/secure-context checks have already passed. A native security
  // refusal is a denial, not a reason to try a different export transport.
  if(!signal.aborted&&name==='SecurityError')return {kind:'denied',reason:'policy',message:'Browser policy did not admit this file selection.'};
  return mapFilePanelBrowserException(error);
}

/** File System Access adapter with wrapper-only lifetime; browser handles are never persisted or logged. */
export function createFileSystemAccessPanelAdapter(port: FileSystemAccessPanelPort, nativeActivity?: NativeOperationActivity): FilePanelAdapter {
  const observe: ObserveHandleWork = async (action, rollback = false) => {
    if (!nativeActivity) return action();
    let invoked = false;
    try {
      return await nativeActivity.track(() => { invoked = true; return action(); });
    } catch (error) {
      // Instrumentation retirement must not prevent already-owned rollback.
      // This fallback never starts a new read/write or permission request.
      if (rollback && !invoked && nativeActivity.signal.aborted) return action();
      throw error;
    }
  };
  return {
    id: "file-system-access",
    capabilities: new Set(["read", "write", "multiple-selection", "directory", "persistent-handle"]),
    supports: () => true,
    async open(request: OpenPanelRequest, signal: AbortSignal): Promise<FilePanelResult<FilePanelReference>> {
      try {
        throwIfFilePanelAborted(signal);
        const blocked = preflight(port, request.selection === "single-directory" ? "directory" : "open");
        if (blocked) return blocked;
        if (request.selection === "single-directory") {
          const handle = await port.openDirectory(signal);
          throwIfFilePanelAborted(signal);
          if (!handle) return { kind: "cancelled" };
          const initial = await initialDirectoryPermission(handle, request.access, observe, signal);
          if (initial === "denied") return { kind: "denied", reason: "permission", message: "Directory access was denied." };
          return { kind: "accepted", values: Object.freeze([directoryReference(handle, request.id, initial, port.hasTransientUserActivation, request.access, observe)]) };
        }
        const handles = await port.openFiles({ accepts: request.accepts, multiple: request.selection === "multiple-files" }, signal);
        throwIfFilePanelAborted(signal);
        if (handles.length === 0) return { kind: "cancelled" };
        if (request.selection === "single-file" && handles.length !== 1) {
          return { kind: "error", message: "The browser returned more than one file for a single-file request." };
        }
        const mode = request.access;
        const initialPermissions = await Promise.all(handles.map((handle) => initialFilePermission(handle, mode, observe, signal)));
        throwIfFilePanelAborted(signal);
        if (initialPermissions.some((permission) => permission === "denied")) {
          return { kind: "denied", reason: "permission", message: "File access was denied." };
        }
        return {
          kind: "accepted",
          values: Object.freeze(handles.map((handle, index) => request.access === "read"
            ? fileReference(handle, request.id, index, initialPermissions[index]!, port.hasTransientUserActivation, "read", observe)
            : fileReference(handle, request.id, index, initialPermissions[index]!, port.hasTransientUserActivation, "readwrite", observe))),
        };
      } catch (error) {
        return pickerFailure(error,signal);
      }
    },
    async save(request: SavePanelRequest, signal: AbortSignal): Promise<FilePanelResult<import("./filePanelTypes").FilePanelSaveTarget>> {
      try {
        throwIfFilePanelAborted(signal);
        const blocked = preflight(port, "save");
        if (blocked) return blocked;
        const selected = await port.saveFile({ accepts: request.accepts, suggestedName: request.suggestedName }, signal);
        throwIfFilePanelAborted(signal);
        if (!selected) return { kind: "cancelled" };
        const initial = await initialFilePermission(selected.handle, "readwrite", observe, signal);
        if (initial === "denied") return { kind: "denied", reason: "permission", message: "Write access was denied." };
        const reference = fileReference(selected.handle, request.id, 0, initial, port.hasTransientUserActivation, "readwrite", observe);
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
        return pickerFailure(error,signal);
      }
    },
  };
}

/** @internal Wraps a browsed handle with the existing reference lifetime and permission rules. */
export async function referenceForOpenPanelHandle(handle: FilePanelFileHandle | FilePanelDirectoryHandle, requestId: string, index: number, activation: () => boolean, ownerSignal?: AbortSignal): Promise<FilePanelReference> {
  throwIfFilePanelAborted(ownerSignal);
  const permission = typeof handle.queryPermission === "function" ? await handle.queryPermission({ mode: "read" }) : "granted";
  throwIfFilePanelAborted(ownerSignal);
  if (permission !== "granted") throw new Error("The selected item needs permission. Choose its folder to unlock it.");
  const reference = handle.kind === "directory" ? directoryReference(handle, requestId, permission, activation, "read") : fileReference(handle, requestId, index, permission, activation, "read");
  if (!ownerSignal) return reference;
  const abort = () => owned.release("runtime-disposed");
  const descriptors = Object.getOwnPropertyDescriptors(reference);
  const owned = Object.freeze(Object.defineProperties({}, { ...descriptors,
    release: { enumerable: true, value(reason: FilePanelReleaseReason) { ownerSignal.removeEventListener("abort", abort); reference.release(reason); } },
  })) as FilePanelReference;
  ownerSignal.addEventListener("abort", abort, { once: true });
  return owned;
}
