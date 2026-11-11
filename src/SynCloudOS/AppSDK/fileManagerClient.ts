/* SynWare SDK — Copyright © 2026 Syndromatic Ltd. Apache-2.0. */
import { openPanelFileSystemFor, type FilePanelDirectory } from "../FilePanels";

/** FileManager.urls(for:in:). Browser handles stand for directories, never guessed OS paths. */
export interface AppFileManager {
  urls(directory: "applicationSupportDirectory", domain: "userDomainMask"): Promise<readonly FilePanelDirectory[]>;
}
export function createAppFileManager(client: object, signal: AbortSignal): AppFileManager {
  return Object.freeze({
    async urls(directory: "applicationSupportDirectory", domain: "userDomainMask"): Promise<readonly FilePanelDirectory[]> {
      signal.throwIfAborted();
      if (directory !== "applicationSupportDirectory" || domain !== "userDomainMask") throw new TypeError("Only the user's application-support directory is supported.");
      const handle = await openPanelFileSystemFor(client)?.applicationSupportDirectory();
      signal.throwIfAborted();
      return Object.freeze(handle ? [handle] : []);
    },
  });
}
