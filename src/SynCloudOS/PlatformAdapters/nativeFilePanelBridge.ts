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

import { NSEData } from "../../Foundation/NSEData";
import type { FilePanelFileHandle, FilePanelWritable } from "../FilePanels/filePanelTypes";
import type { FilePanelDirectory } from "../FilePanels/OpenPanelFileSystem";

/** Native browser protocols stay inside the platform boundary. */
export interface NativeFilePanelHandle extends Omit<FilePanelFileHandle, "createWritable"> {
  createWritable(): Promise<{ write(data: Blob | Uint8Array | string): Promise<void>; close(): Promise<void>; abort(reason?: unknown): Promise<void> }>;
}
export interface NativeFilePanelDirectory extends Omit<FilePanelDirectory, "values" | "getDirectoryHandle" | "getFileHandle"> {
  values(): AsyncIterableIterator<NativeFilePanelDirectory | NativeFilePanelHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<NativeFilePanelDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<NativeFilePanelHandle>;
}
const files = new WeakMap<NativeFilePanelHandle, FilePanelFileHandle>();
const directories = new WeakMap<NativeFilePanelDirectory, FilePanelDirectory>();
const nativeDirectories = new WeakMap<FilePanelDirectory, NativeFilePanelDirectory>();

export function bridgeFilePanelFile(handle: NativeFilePanelHandle): FilePanelFileHandle {
  const existing = files.get(handle); if (existing) return existing;
  const file: FilePanelFileHandle = Object.freeze<FilePanelFileHandle>({
    kind: "file", name: handle.name, getFile: () => handle.getFile(),
    queryPermission: async options => typeof handle.queryPermission === "function" ? handle.queryPermission(options) : "granted",
    requestPermission: async options => typeof handle.requestPermission === "function" ? handle.requestPermission(options) : "granted",
    async createWritable(): Promise<FilePanelWritable> {
      const native = await handle.createWritable();
      return Object.freeze<FilePanelWritable>({
        write: data => native.write(typeof data === "string" ? data : NSEData.from(data).bytes),
        close: () => native.close(), abort: reason => native.abort(reason),
      });
    },
  });
  files.set(handle, file); return file;
}
export function bridgeFilePanelDirectory(handle: NativeFilePanelDirectory): FilePanelDirectory {
  const existing = directories.get(handle); if (existing) return existing;
  const directory: FilePanelDirectory = Object.freeze<FilePanelDirectory>({
    kind: "directory", name: handle.name,
    queryPermission: async options => typeof handle.queryPermission === "function" ? handle.queryPermission(options) : "granted",
    requestPermission: async options => typeof handle.requestPermission === "function" ? handle.requestPermission(options) : "granted",
    async *values() { for await (const child of handle.values()) yield child.kind === "directory" ? bridgeFilePanelDirectory(child) : bridgeFilePanelFile(child); },
    getDirectoryHandle: async (name, options) => bridgeFilePanelDirectory(await handle.getDirectoryHandle(name, options)),
    getFileHandle: async (name, options) => bridgeFilePanelFile(await handle.getFileHandle(name, options)),
  });
  directories.set(handle, directory); nativeDirectories.set(directory, handle); return directory;
}
export function nativeFilePanelDirectory(handle: FilePanelDirectory): NativeFilePanelDirectory {
  const native = nativeDirectories.get(handle);
  if (!native) throw new TypeError("Only browser-issued directories can be persisted as native bookmarks.");
  return native;
}
