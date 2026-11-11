/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { FilePanelAcceptType, FilePanelDirectoryHandle, FilePanelFileHandle } from "./filePanelTypes";

/** A traversable browser directory, also returned for application-support storage. */
export interface FilePanelDirectory extends FilePanelDirectoryHandle {
  values(): AsyncIterableIterator<FilePanelDirectory | FilePanelFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FilePanelDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FilePanelFileHandle>;
}
export interface OpenPanelBookmark { readonly id: string; readonly name: string; readonly handle: FilePanelDirectory }
export interface OpenPanelFolder extends OpenPanelBookmark { readonly permission: PermissionState }

/** Host-owned structured-clone storage and native activation boundary. Never supplied by an app. */
export interface OpenPanelStoragePort {
  isSecureContext(): boolean;
  supportsDirectoryPicker(): boolean;
  supportsApplicationStorage(): boolean;
  hasTransientUserActivation(): boolean;
  focusedElement?(): HTMLElement | null;
  pickDirectory(signal: AbortSignal): Promise<FilePanelDirectory | null>;
  readBookmarks(scope: string): Promise<readonly OpenPanelBookmark[]>;
  writeBookmarks(scope: string, bookmarks: readonly OpenPanelBookmark[]): Promise<void>;
  applicationDirectory(bundleIdentifier: string): Promise<FilePanelDirectory>;
}

const extensions: Readonly<Record<string, readonly string[]>> = {
  "public.image": ["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "svg", "bmp", "tiff"],
  "public.movie": ["mov", "mp4", "m4v", "webm", "mkv", "avi"],
  "public.audio": ["mp3", "wav", "m4a", "ogg", "flac", "aac"],
  "public.text": ["txt", "md", "csv", "html", "css", "js", "json", "xml"],
  "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/gif": ["gif"], "image/webp": ["webp"],
  "video/quicktime": ["mov"], "video/mp4": ["mp4", "m4v"], "audio/mpeg": ["mp3"], "text/plain": ["txt"],
};
export function openPanelAcceptTypes(types: readonly string[]): readonly FilePanelAcceptType[] {
  if (types.some(type => ["public.item", "public.data", "*/*"].includes(type))) return [];
  return types.map(raw => {
    const type = raw.toLowerCase();
    const mime = type.includes("/") ? type : ({ "public.image": "image/*", "public.movie": "video/*", "public.audio": "audio/*", "public.text": "text/*" } as const)[type as "public.image"] ?? "application/octet-stream";
    return { description: raw, mimeTypes: [mime as `${string}/${string}`], extensions: type.startsWith(".") ? [type as `.${string}`] : (extensions[type] ?? []).map(ext => `.${ext}` as `.${string}`) };
  });
}
export function matchesOpenPanelContentType(name: string, mime: string, types: readonly string[]): boolean {
  if (!types.length || types.includes("public.data") || types.includes("public.item") || types.includes("*/*")) return true;
  const lower = name.toLocaleLowerCase();
  return types.some(raw => {
    const type = raw.toLowerCase();
    if (type.startsWith(".")) return lower.endsWith(type);
    if (mime && (type === mime.toLowerCase() || (type.endsWith("/*") && mime.startsWith(type.slice(0, -1))))) return true;
    const candidates = extensions[type] ?? (type === "image/*" ? extensions["public.image"] : type === "video/*" ? extensions["public.movie"] : type === "audio/*" ? extensions["public.audio"] : []);
    return candidates?.some(ext => lower.endsWith(`.${ext}`)) ?? false;
  });
}
export function isOpenPanelDirectory(handle: FilePanelDirectoryHandle): handle is FilePanelDirectory {
  return typeof (handle as FilePanelDirectory).values === "function";
}
export function createOpenPanelFileSystem(port: OpenPanelStoragePort | null | undefined, bundle: string, owner = new AbortController().signal) {
  const live = () => owner.throwIfAborted();
  const capabilities = () => ({ folders: !!port?.isSecureContext() && port.supportsDirectoryPicker(), applicationStorage: !!port?.isSecureContext() && port.supportsApplicationStorage() });
  const activation = () => { live(); if (!port?.hasTransientUserActivation()) throw new Error("This operation requires an active user action."); };
  return {
    capabilities,
    isSecureContext: () => port?.isSecureContext() === true,
    hasTransientUserActivation: () => port?.hasTransientUserActivation() === true,
    focusedElement: () => port?.focusedElement?.() ?? null,
    async folders(): Promise<readonly OpenPanelFolder[]> {
      live(); if (!capabilities().folders || !port) return [];
      const bookmarks = await port.readBookmarks(bundle); live();
      return Promise.all(bookmarks.map(async bookmark => {
        let permission: PermissionState = "denied";
        try { permission = await bookmark.handle.queryPermission({ mode: "read" }); } catch { /* A revoked bookmark stays visible and locked. */ }
        live(); return { ...bookmark, permission };
      }));
    },
    async addFolder(): Promise<OpenPanelFolder | null> {
      activation(); if (!capabilities().folders || !port) throw new Error("Folder selection is unavailable.");
      // Invoke before the first await: native pickers require this very gesture.
      const handle = await port.pickDirectory(owner); live(); if (!handle) return null;
      const bookmarks = await port.readBookmarks(bundle); live();
      const id = `folder:${bookmarks.length}:${handle.name}`;
      const bookmark = { id, name: handle.name, handle };
      await port.writeBookmarks(bundle, [...bookmarks, bookmark]); live();
      return { ...bookmark, permission: await handle.queryPermission({ mode: "read" }) };
    },
    async unlock(handle: FilePanelDirectory): Promise<PermissionState> {
      activation(); const permission = await handle.requestPermission({ mode: "read" }); live(); return permission;
    },
    async applicationSupportDirectory(): Promise<FilePanelDirectory | null> {
      live(); if (!capabilities().applicationStorage || !port) return null;
      const directory = await port.applicationDirectory(bundle); live(); return directory;
    },
    async entries(directory: FilePanelDirectory, types: readonly string[], search: string, signal?: AbortSignal) {
      live(); signal?.throwIfAborted();
      const items: (FilePanelDirectory | FilePanelFileHandle)[] = [];
      for await (const handle of directory.values()) {
        live(); signal?.throwIfAborted();
        if (!handle.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) continue;
        if (handle.kind === "file") {
          const file = await handle.getFile(); live(); signal?.throwIfAborted();
          if (!matchesOpenPanelContentType(handle.name, file.type, types)) continue;
        }
        items.push(handle);
      }
      return items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "directory" ? -1 : 1) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    },
  };
}
export type OpenPanelFileSystem = ReturnType<typeof createOpenPanelFileSystem>;
const clients = new WeakMap<object, OpenPanelFileSystem>();
export function registerOpenPanelFileSystem(client: object, fileSystem: OpenPanelFileSystem): void { clients.set(client, fileSystem); }
export function openPanelFileSystemFor(client: object): OpenPanelFileSystem | undefined { return clients.get(client); }
