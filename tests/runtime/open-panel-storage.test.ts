import { describe, expect, it, vi } from "vitest";
import { createAppFileManager } from "../../src/SynCloudOS/AppSDK/fileManagerClient";
import { createOpenPanelFileSystem, registerOpenPanelFileSystem } from "../../src/SynCloudOS/FilePanels/OpenPanelFileSystem";
import { createBrowserOpenPanelStoragePort } from "../../src/SynCloudOS/PlatformAdapters/BrowserOpenPanelStoragePort";
import { referenceForOpenPanelHandle } from "../../src/SynCloudOS/FilePanels/FileSystemAccessPanelAdapter";

describe("application-support directories", () => {
  it("releases browsed file references when their application mount ends", async () => {
    const owner = new AbortController();
    const handle = { kind: "file", name: "working.png", getFile: vi.fn(), queryPermission: async () => "granted", requestPermission: vi.fn(), createWritable: vi.fn() } as any;
    const reference = await referenceForOpenPanelHandle(handle, "owner-test", 0, () => true, owner.signal);
    owner.abort(); expect(reference.released).toBe(true);
    if (reference.kind !== "directory-handle") await expect(reference.read()).rejects.toThrow(/released/);
    expect(handle.getFile).not.toHaveBeenCalled();
  });
  it("uses one encoded bundle component beneath the private application-support root", async () => {
    const scoped = { name: "org.test.editor" };
    const support = { getDirectoryHandle: vi.fn(async () => scoped) };
    const root = { getDirectoryHandle: vi.fn(async () => support) };
    const getDirectory = vi.fn(async () => root);
    const browser = { isSecureContext: true, navigator: { storage: { getDirectory } } } as any;
    const port = createBrowserOpenPanelStoragePort(browser)!;
    await expect(port.applicationDirectory("org.test/editor")).resolves.toMatchObject(scoped);
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
  it("adapts OPFS handles in browsers without permission methods", async () => {
    const file = { kind: "file", name: "working.txt", getFile: async () => ({ name: "working.txt", type: "text/plain" }), createWritable: vi.fn() };
    const directory = { kind: "directory", name: "org.test.editor", async *values() { yield file; }, getFileHandle: async () => file, getDirectoryHandle: vi.fn() };
    const browser = { navigator: { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => ({ getDirectoryHandle: async () => directory }) }) } } } as any;
    const handle = await createBrowserOpenPanelStoragePort(browser)!.applicationDirectory("org.test.editor");
    await expect(handle.queryPermission({ mode: "read" })).resolves.toBe("granted");
    const [child] = await Array.fromAsync(handle.values());
    await expect(child!.queryPermission({ mode: "read" })).resolves.toBe("granted");
  });
});
