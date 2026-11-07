import { describe, expect, it, vi } from "vitest";
import { createAppFileManager } from "../../src/SynCloudOS/AppSDK/fileManagerClient";
import { createOpenPanelFileSystem, registerOpenPanelFileSystem } from "../../src/SynCloudOS/FilePanels/OpenPanelFileSystem";
import { createBrowserOpenPanelStoragePort } from "../../src/SynCloudOS/PlatformAdapters/BrowserOpenPanelStoragePort";

describe("application-support directories", () => {
  it("uses one encoded bundle component beneath the private application-support root", async () => {
    const scoped = { name: "org.test.editor" };
    const support = { getDirectoryHandle: vi.fn(async () => scoped) };
    const root = { getDirectoryHandle: vi.fn(async () => support) };
    const getDirectory = vi.fn(async () => root);
    const browser = { isSecureContext: true, navigator: { storage: { getDirectory } } } as any;
    const port = createBrowserOpenPanelStoragePort(browser)!;
    await expect(port.applicationDirectory("org.test/editor")).resolves.toBe(scoped);
    expect(root.getDirectoryHandle).toHaveBeenCalledWith("SynCloudOS-Application-Support", { create: true });
    expect(support.getDirectoryHandle).toHaveBeenCalledWith("org.test%2Feditor", { create: true });
  });
  it("returns an empty collection when OPFS is unavailable and refuses other directories", async () => {
    const client = {};
    registerOpenPanelFileSystem(client, createOpenPanelFileSystem(null, "org.test.editor"));
    const manager = createAppFileManager(client, new AbortController().signal);
    await expect(manager.urls("applicationSupportDirectory", "userDomainMask")).resolves.toEqual([]);
    await expect(manager.urls("desktopDirectory" as any, "userDomainMask")).rejects.toThrow(/Only/);
  });
  it("rejects an application-support lookup when its mount has ended", async () => {
    const owner = new AbortController(); const manager = createAppFileManager({}, owner.signal);
    owner.abort(); await expect(manager.urls("applicationSupportDirectory", "userDomainMask")).rejects.toThrow();
  });
});
