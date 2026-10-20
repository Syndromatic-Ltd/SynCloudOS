// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createAppSCOS, unboundSCOS } from "../../src/SynCloudOS/AppSDK/scos/scosFacade";
import type { MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact/SynCloudOSProvider";
import { useSCOS } from "../../src/SynCloudOS/AppSDK/scos/useSCOS";
import { SynWareProvider } from "../../src/SynCloudOS/AppSDK/SynWareContext";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createSynCloudOSAlertCenter } from "../../src/SynCloudOS/SystemUI/alertCenter";
import { SCOSAlertPresenter } from "../../src/SynCloudOSReact/SCOSAlertPresenter";
import { createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";

const mounts: MountedSynWareRuntime[] = [];
afterEach(() => { for (const mount of mounts.splice(0)) mount.dispose(); });
function fixture(id = "com.example.notes", runtimeId = `runtime:${id}`) {
  const runtime = createTestRuntime({ id: runtimeId });
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: id, displayName: "Notes", version: "1.2.3", routes: [{ path: `/${id.split(".").at(-1)}`, primary: true }] });
  runtime.store.mutate(draft => { draft.loginServices.isAuthorised = true; });
  const mount = mountTestSynWareRuntime(runtime, id);
  mounts.push(mount);
  return { runtime, mount, context: createSynWareContextValue(mount.runtime) };
}

it("binds apps independently across awaits, timers and replacement mounts", async () => {
  const first = fixture();
  fixture("com.example.journal");
  const notes = createAppSCOS("COM.EXAMPLE.NOTES");
  const journal = createAppSCOS("com.example.journal");
  await Promise.resolve();
  notes.preferences.set("theme", "paper");
  await new Promise<void>(resolve => notes.scheduler.setTimeout(() => {
    expect(notes.app).toEqual({ bundleIdentifier: "com.example.notes", displayName: "Notes", version: "1.2.3" });
    expect(notes.preferences.get("theme")).toBe("paper");
    expect(journal.preferences.get("theme")).toBeUndefined();
    resolve();
  }, 0));
  first.mount.dispose();
  fixture("com.example.notes", "runtime:replacement");
  expect(notes.app.bundleIdentifier).toBe("com.example.notes");
});

it("reports absent, ambiguous and unbound sessions with actionable codes", () => {
  const app = createAppSCOS("com.example.notes");
  expect(() => app.app).toThrow(expect.objectContaining({ code: "SCOS_APP_NOT_RUNNING" }));
  fixture(); fixture("com.example.notes", "runtime:second-notes");
  expect(() => app.app).toThrow(expect.objectContaining({ code: "SCOS_AMBIGUOUS_SESSION", message: expect.stringContaining("useSCOS()") }));
  expect(() => unboundSCOS.preferences).toThrow(expect.objectContaining({ code: "SCOS_UNBOUND", file: expect.stringContaining("scos.test.tsx") }));
});

it("uses the nearest provider in shared code despite ambiguous module bindings", () => {
  const outer = fixture();
  const inner = fixture("com.example.notes", "runtime:inner-notes");
  function Shared() { const scos = useSCOS(); return <output>{scos.runtimeInfo.id}:{scos.app.bundleIdentifier}</output>; }
  render(<SynWareProvider value={outer.context}><SynWareProvider value={inner.context}><Shared /></SynWareProvider></SynWareProvider>);
  expect(screen.getByText("runtime:inner-notes:com.example.notes")).toBeTruthy();
});

it("opens bundle identifiers case-insensitively and routes, removes preferences and closes itself", async () => {
  const { runtime, context } = fixture();
  registerTestSynWare(runtime, { schemaVersion: 1, bundleIdentifier: "com.example.journal", displayName: "Journal", version: "1.0.0", routes: [{ path: "/journal", primary: true }] });
  const app = createAppSCOS("com.example.notes");
  expect((await app.open("/notes")).committed).toBe(true);
  expect((await app.open("COM.EXAMPLE.JOURNAL")).committed).toBe(true);
  await expect(app.open("missing")).rejects.toMatchObject({ code: "SCOS_APP_NOT_FOUND" });
  app.preferences.set("theme", "paper");
  expect(context.persistence.getPreference("theme")).toBe("paper");
  app.preferences.remove("theme");
  expect(app.preferences.get("theme", "plain")).toBe("plain");
  const pending = app.alert({ title: "Unsaved", buttons: [{ id: "discard", label: "Discard" }, { id: "cancel", label: "Cancel", role: "cancel" }] });
  const queued = app.alert({ title: "Queued", buttons: [{ id: "stay", label: "Stay", role: "cancel" }] });
  app.close();
  await expect(pending).resolves.toBe("cancel");
  await expect(queued).resolves.toBe("stay");
  expect(() => app.app).toThrow(expect.objectContaining({ code: "SCOS_APP_NOT_RUNNING" }));
});

it("reports an unbound shared hook without a provider", () => {
  const { result } = renderHook(() => {
    try { return useSCOS(); } catch (error) { return error; }
  });
  expect(result.current).toMatchObject({ code: "SCOS_UNBOUND", message: expect.stringContaining("useSCOS()") });
});

it("queues presentations, renders choices and resolves safe dismissal", async () => {
  const center = createSynCloudOSAlertCenter();
  const runtime = createTestRuntime({ id: "runtime:alert-presenter" });
  const view = render(<SynCloudOSProvider runtime={runtime}><SCOSAlertPresenter center={center} /></SynCloudOSProvider>);
  let first!: Promise<string>; let second!: Promise<string>;
  act(() => {
    first = center.present({ title: "First", message: "Choose", buttons: [{ id: "save", label: "Save", role: "default" }, { id: "cancel", label: "Cancel", role: "cancel" }] });
    second = center.present({ title: "Second" });
  });
  expect(screen.getByRole("alertdialog").textContent).toContain("First");
  expect(screen.queryByText("Second")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await expect(first).resolves.toBe("save");
  expect(screen.getByRole("alertdialog").textContent).toContain("Second");
  fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
  await expect(second).resolves.toBe("ok");
  expect(center.getSnapshot()).toEqual({ current: null, queued: 0 });
  view.unmount(); center.dispose();
});

it("cancels current and queued alerts on owner abort without disturbing another owner", async () => {
  const center = createSynCloudOSAlertCenter();
  const controller = new AbortController();
  const request = { title: "Pending", buttons: [{ id: "yes", label: "Yes" }, { id: "no", label: "No", role: "cancel" as const }] };
  const first = center.present(request, { ownerAppId: "com.example.notes", signal: controller.signal });
  const second = center.present(request, { ownerAppId: "com.example.notes", signal: controller.signal });
  const other = center.present({ title: "Other" }, { ownerAppId: "com.example.journal" });
  controller.abort();
  await expect(Promise.all([first, second])).resolves.toEqual(["no", "no"]);
  expect(center.getSnapshot().current?.title).toBe("Other");
  center.dispose();
  await expect(other).resolves.toBe("ok");
});
