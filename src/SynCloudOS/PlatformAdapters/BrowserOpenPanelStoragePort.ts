/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { FilePanelDirectory, OpenPanelBookmark, OpenPanelStoragePort } from "../FilePanels/OpenPanelFileSystem";
import { createBrowserFileSystemAccessPanelPort } from "./BrowserFileSystemAccessPanelPort";
import type { NativeOperationActivity } from "../Updates/updateReadiness";
import type { FilePanelFileHandle } from "../FilePanels/filePanelTypes";

// OPFS is already origin-private. Safari and Firefox can expose these handles
// without the user-visible File System Access permission methods.
function privateFile(handle: FilePanelFileHandle): FilePanelFileHandle {
  if (typeof handle.queryPermission === "function" && typeof handle.requestPermission === "function") return handle;
  return { kind: "file", name: handle.name, queryPermission: async () => "granted", requestPermission: async () => "granted",
    getFile: () => handle.getFile(), createWritable: () => handle.createWritable() };
}
function privateDirectory(handle: FilePanelDirectory): FilePanelDirectory {
  if (typeof handle.queryPermission === "function" && typeof handle.requestPermission === "function") return handle;
  return { kind: "directory", name: handle.name, queryPermission: async () => "granted", requestPermission: async () => "granted",
    async *values() { for await (const child of handle.values()) yield child.kind === "directory" ? privateDirectory(child) : privateFile(child); },
    getDirectoryHandle: async (name, options) => privateDirectory(await handle.getDirectoryHandle(name, options)),
    getFileHandle: async (name, options) => privateFile(await handle.getFileHandle(name, options)),
  };
}

/** IndexedDB preserves the actual structured-cloneable handles, never serialised file paths. */
export function createBrowserOpenPanelStoragePort(window: Window | null, activity?: NativeOperationActivity): OpenPanelStoragePort | null {
  if (!window) return null;
  const native = createBrowserFileSystemAccessPanelPort(window, activity)!;
  const browser = window as Window & typeof globalThis;
  let database: Promise<IDBDatabase> | undefined;
  const open = () => database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!browser.indexedDB) { reject(new Error("Folder bookmark storage is unavailable.")); return; }
    const request = browser.indexedDB.open("SynCloudOS.OpenPanel", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("bookmarks");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("Folder bookmark storage is blocked.")); };
  });
  const store = async <T>(scope: string, bookmarks?: readonly OpenPanelBookmark[]): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("bookmarks", bookmarks ? "readwrite" : "readonly");
      const objectStore = transaction.objectStore("bookmarks");
      const request = bookmarks ? objectStore.put(bookmarks, scope) : objectStore.get(scope);
      transaction.oncomplete = () => resolve(request.result as T);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Bookmark transaction was aborted."));
    });
  };
  return {
    isSecureContext: native.isSecureContext,
    supportsDirectoryPicker: () => native.isAvailable?.("directory") === true && !!browser.indexedDB,
    supportsApplicationStorage: () => typeof browser.navigator.storage?.getDirectory === "function",
    hasTransientUserActivation: native.hasTransientUserActivation,
    focusedElement: () => browser.document.activeElement instanceof browser.HTMLElement ? browser.document.activeElement : null,
    pickDirectory: async signal => await native.openDirectory(signal) as FilePanelDirectory | null,
    readBookmarks: async scope => await store<readonly OpenPanelBookmark[] | undefined>(scope) ?? [],
    writeBookmarks: async (scope, bookmarks) => { await store(scope, bookmarks); },
    async applicationDirectory(bundle) {
      // Encode the entire bundle as one component; no caller-controlled path traversal.
      const root = await browser.navigator.storage.getDirectory();
      const applications = await root.getDirectoryHandle("SynCloudOS-Application-Support", { create: true });
      return privateDirectory(await applications.getDirectoryHandle(encodeURIComponent(bundle), { create: true }) as unknown as FilePanelDirectory);
    },
  };
}
