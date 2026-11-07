import { describe, expect, it, vi } from "vitest";
import { createOpenPanelFileSystem, matchesOpenPanelContentType } from "../../src/SynCloudOS/FilePanels/OpenPanelFileSystem";

function directory(name: string, entries: any[] = [], permission = "granted") {
  return { kind: "directory" as const, name,
    queryPermission: vi.fn(async () => permission), requestPermission: vi.fn(async () => "granted"),
    async *values() { yield* entries; },
    getDirectoryHandle: vi.fn(async (child: string) => directory(child)),
  };
}
function port() {
  const saved = new Map<string, any[]>();
  const roots = new Map<string, any>();
  return { isSecureContext: () => true, supportsDirectoryPicker: () => true, supportsApplicationStorage: () => true,
    hasTransientUserActivation: () => true, pickDirectory: vi.fn(async () => directory("Projects")),
    readBookmarks: vi.fn(async (scope: string) => saved.get(scope) ?? []),
    writeBookmarks: vi.fn(async (scope: string, entries: any[]) => { saved.set(scope, entries); }),
    applicationDirectory: vi.fn(async (bundle: string) => { if (!roots.has(bundle)) roots.set(bundle, directory(bundle)); return roots.get(bundle); }),
  };
}

describe("Open panel filesystem", () => {
  it("persists handles, rechecks restored permission and only renews on an activated action", async () => {
    const storage = port();
    const handle = directory("Projects", [], "prompt");
    storage.pickDirectory.mockResolvedValue(handle);
    const fs = createOpenPanelFileSystem(storage, "org.test.editor");
    await fs.addFolder();
    const restored = createOpenPanelFileSystem(storage, "org.test.editor");
    expect((await restored.folders())[0]).toMatchObject({ name: "Projects", permission: "prompt", handle });
    expect(handle.requestPermission).not.toHaveBeenCalled();
    storage.hasTransientUserActivation = () => false;
    await expect(restored.unlock(handle)).rejects.toThrow(/user action/i);
    expect(handle.requestPermission).not.toHaveBeenCalled();
    storage.hasTransientUserActivation = () => true;
    await expect(restored.unlock(handle)).resolves.toBe("granted");
    expect(handle.requestPermission).toHaveBeenCalledTimes(1);
  });
  it("never opens a directory chooser without activation", async () => {
    const storage = port(); storage.hasTransientUserActivation = () => false;
    await expect(createOpenPanelFileSystem(storage, "org.test").addFolder()).rejects.toThrow(/user action/i);
    expect(storage.pickDirectory).not.toHaveBeenCalled();
  });
  it("enumerates folders first and filters extensions, MIME and search without hiding directories", async () => {
    const file = (name: string, type: string) => ({ kind: "file" as const, name, getFile: async () => ({ name, type }) });
    const fs = createOpenPanelFileSystem(port(), "org.test");
    const items = await fs.entries(directory("Root", [file("z.PNG", ""), file("a.txt", "text/plain"), directory("Drone"), file("b.jpg", "image/jpeg")]), ["image/*"], "");
    expect(items.map(item => item.name)).toEqual(["Drone", "b.jpg", "z.PNG"]);
    expect((await fs.entries(directory("Root", [file("z.PNG", ""), directory("Drone")]), [".png"], "z")).map(item => item.name)).toEqual(["z.PNG"]);
    expect(matchesOpenPanelContentType("cut.MOV", "", ["public.movie"])).toBe(true);
    expect(matchesOpenPanelContentType("a.txt", "text/plain", ["image/png"])).toBe(false);
  });
  it("scopes application support and bookmarks to a bundle and hides unsupported sources", async () => {
    const storage = port();
    const a = createOpenPanelFileSystem(storage, "org.test.a"); const b = createOpenPanelFileSystem(storage, "org.test.b");
    await a.addFolder(); expect(await b.folders()).toEqual([]);
    expect(await a.applicationSupportDirectory()).not.toBe(await b.applicationSupportDirectory());
    storage.supportsDirectoryPicker = () => false; storage.supportsApplicationStorage = () => false;
    expect(a.capabilities()).toEqual({ folders: false, applicationStorage: false });
    expect(await a.applicationSupportDirectory()).toBeNull();
    storage.isSecureContext = () => false;
    expect(a.capabilities()).toEqual({ folders: false, applicationStorage: false });
  });
  it("does not publish a late chooser handle after the owner ends", async () => {
    const storage = port(); const owner = new AbortController();
    let finish!: (handle: any) => void;
    storage.pickDirectory.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const fs = createOpenPanelFileSystem(storage, "org.test", owner.signal);
    const pending = fs.addFolder(); owner.abort(); finish(directory("Late"));
    await expect(pending).rejects.toThrow(); expect(storage.writeBookmarks).not.toHaveBeenCalled();
  });
});
