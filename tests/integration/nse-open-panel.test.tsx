// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEOpenPanelContent } from "../../src/NSE/FilePanels/NSEOpenPanelContent";
import type { OpenPanelSession } from "../../src/NSE/FilePanels/NSEOpenPanel";
import { createOpenPanelFileSystem, type FilePanelDirectory, type OpenPanelStoragePort } from "../../src/SynCloudOS/FilePanels/OpenPanelFileSystem";

afterEach(cleanup);
const file = (name: string, type: string) => ({ kind: "file" as const, name, getFile: async () => new File(["test"], name, { type }), queryPermission: async () => "granted" as const, requestPermission: async () => "granted" as const, createWritable: vi.fn() });
function directory(name: string, entries: any[] = [], permission: PermissionState = "granted"): FilePanelDirectory {
  return { kind: "directory", name, async *values() { yield* entries; }, queryPermission: vi.fn(async () => permission), requestPermission: vi.fn(async () => "granted"), getDirectoryHandle: vi.fn(), getFileHandle: vi.fn() };
}
function fixture(compact = false) {
  const root = directory("Projects", [directory("Drone", [file("flight.png", "image/png")]), file("sunset.png", "image/png"), file("notes.txt", "text/plain")]);
  const locked = directory("Footage Drive", [], "prompt");
  const bookmarks = [{ id: "projects", name: root.name, handle: root }, { id: "drive", name: locked.name, handle: locked }];
  const port: OpenPanelStoragePort = { isSecureContext: () => true, supportsDirectoryPicker: () => true, supportsApplicationStorage: () => true, hasTransientUserActivation: () => true,
    pickDirectory: vi.fn(async () => root), readBookmarks: async () => bookmarks, writeBookmarks: vi.fn(), applicationDirectory: async () => directory("org.test.editor") };
  const session = { id: "test:open", panel: {} as any, host: { fileSystem: createOpenPanelFileSystem(port, "org.test.editor"), hasTransientUserActivation: () => true } as any,
    signal: new AbortController().signal, compact, anchor: null, canChooseFiles: true, canChooseDirectories: false, allowsMultipleSelection: false,
    allowedContentTypes: ["image/*"], directoryURL: null, mediaSources: [], prompt: "Open", message: "", accept: vi.fn(async () => {}), cancel: vi.fn(), systemChooser: vi.fn(async () => ({ kind: "cancelled" as const })),
  } satisfies OpenPanelSession;
  return { root, locked, port, session };
}
const choose = async (name: string) => { fireEvent.click(await screen.findByText(name)); };
describe("drawn Open panel", () => {
  it("keeps media sources alive through StrictMode's effect replay", async () => {
    const { session } = fixture();
    const source = { id: "pictures", label: "Gallery Pictures", query: async () => ({ items: [{ id: "one", providerId: "pictures", name: "Coast", mimeType: "image/png", kind: "image" as const }], nextCursor: null }) };
    render(<React.StrictMode><NSEOpenPanelContent session={{ ...session, mediaSources: [source] }} /></React.StrictMode>);
    await choose("Gallery Pictures"); expect(await screen.findByText("Coast")).toBeTruthy();
  });
  it("browses a grant, filters content, navigates history and returns file references", async () => {
    const { session } = fixture(); render(<NSEOpenPanelContent session={session} />);
    await choose("Projects"); await screen.findByText("sunset.png");
    expect(screen.queryByText("notes.txt")).toBeNull();
    fireEvent.doubleClick(screen.getByText("Drone")); await screen.findByText("flight.png");
    fireEvent.click(screen.getByRole("button", { name: "Back" })); await screen.findByText("sunset.png");
    fireEvent.click(screen.getByRole("button", { name: "Forward" })); await screen.findByText("flight.png");
    fireEvent.click(screen.getByRole("button", { name: "Back" })); await screen.findByText("sunset.png");
    fireEvent.click(screen.getByText("sunset.png")); fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(session.accept).toHaveBeenCalledWith([expect.objectContaining({ kind: "file-handle", name: "sunset.png" })], expect.any(Function)));
  });
  it("starts compact on Sources and drills into a collection with a back action", async () => {
    const { session } = fixture(true); render(<NSEOpenPanelContent session={session} />);
    expect(screen.getByText("Sources", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull(); await choose("Projects");
    await screen.findByText("sunset.png"); expect(screen.getByRole("searchbox", { name: "Search Projects" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sources" })); expect(screen.queryByText("sunset.png")).toBeNull();
  });
  it("drills into a compact folder once and waits for Open before accepting a file", async () => {
    const { session } = fixture(true); render(<NSEOpenPanelContent session={session} />);
    await choose("Projects"); await choose("Drone"); await screen.findByText("flight.png");
    fireEvent.click(screen.getByText("flight.png")); expect(session.accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" })); await screen.findByText("sunset.png");
    fireEvent.click(screen.getByRole("button", { name: "Forward" })); await screen.findByText("flight.png");
    fireEvent.click(screen.getByText("flight.png")); fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(session.accept).toHaveBeenCalledTimes(1));
  });
  it("shows a locked bookmark without requesting permission and renews it on one click", async () => {
    const { session, locked } = fixture(); render(<NSEOpenPanelContent session={session} />);
    expect(await screen.findByRole("img", { name: "Needs permission" })).toBeTruthy();
    expect(locked.requestPermission).not.toHaveBeenCalled(); await choose("Footage Drive");
    await waitFor(() => expect(locked.requestPermission).toHaveBeenCalledTimes(1));
  });
  it("searches the current directory and clears a hidden selection", async () => {
    const { session } = fixture(); render(<NSEOpenPanelContent session={session} />);
    await choose("Projects"); await screen.findByText("sunset.png"); fireEvent.click(screen.getByText("sunset.png"));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Drone" } });
    await waitFor(() => expect(screen.queryByText("sunset.png")).toBeNull());
    expect((screen.getByRole("button", { name: "Open" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("queries media sources, filters results and transfers chosen leases", async () => {
    const { session } = fixture(); const release = vi.fn();
    const source = { id: "pictures", label: "Gallery Pictures", release, query: vi.fn(async () => ({ items: [
      { id: "one", providerId: "pictures", name: "Coast", mimeType: "image/png", kind: "image" as const, source: "/coast.png" },
      { id: "two", providerId: "pictures", name: "Sound", mimeType: "audio/mpeg", kind: "audio" as const, source: "/sound.mp3" },
    ], nextCursor: null })) };
    const view = render(<NSEOpenPanelContent session={{ ...session, mediaSources: [source] }} />);
    await choose("Gallery Pictures"); await screen.findByText("Coast"); expect(screen.queryByText("Sound")).toBeNull();
    fireEvent.click(screen.getByText("Coast")); fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(session.accept).toHaveBeenCalled());
    const [, relinquish] = session.accept.mock.calls[0]! as unknown as [unknown, () => void]; view.unmount();
    expect(release.mock.calls.flat(2).some((item: any) => item.id === "one")).toBe(false);
    relinquish(); expect(release.mock.calls.flat(2).some((item: any) => item.id === "one")).toBe(true);
  });
  it("does not query activation-only sources on mount and invokes the system fallback from its button", async () => {
    const { session } = fixture(); const query = vi.fn(async () => ({ items: [], nextCursor: null }));
    render(<NSEOpenPanelContent session={{ ...session, mediaSources: [{ id: "device", label: "Device Pictures", requiresUserActivation: true, query }] }} />);
    await screen.findByText("Device Pictures"); expect(query).not.toHaveBeenCalled();
    await choose("Device Pictures"); await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "System Chooser…" })); expect(session.systemChooser).toHaveBeenCalledTimes(1);
  });
});
