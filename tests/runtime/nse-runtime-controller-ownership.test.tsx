// @vitest-environment jsdom
import * as React from "react";
import { nseMenuModel } from "../../src/NSE/Menus/menuTypes";
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEUserDefaultsController } from "../../src/NSE/Controllers/NSEUserDefaultsController";
import { instantiateInOwnerScope, NSEOwnershipScope, type NSEControllerOwnershipOptions } from "../../src/NSE/Controllers/ownership";
import { NSEMenu } from "../../src/NSE/Menus/NSEMenu";
import type { NSEMenuRuntimePort } from "../../src/NSE/Menus/menuTypes";
import { NSEToolbarController } from "../../src/NSE/Toolbars/NSEToolbarController";
import type { ToolbarPreferences } from "../../src/NSE/Toolbars/toolbarTypes";
import { useRuntimeNSEMenuPort } from "../../src/SynCloudOSReact/nseMenuPort";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { defaultsFrom } from "../fixtures/userDefaults";

const hosts: ClassApplicationHost[] = [];
const disposables: Array<{ dispose(): void }> = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.dispose();
  for (const value of disposables.splice(0).reverse()) value.dispose();
});
const kinds = ["menu", "toolbar"] as const;
type Kind = typeof kinds[number];
function preferences(signal: AbortSignal) {
  const value = new NSEUserDefaultsController<ToolbarPreferences>({
    ownerSignal: signal, namespace: "runtime-owned-toolbar", schema: {
      version: 1, defaults: { itemIds: [], displayMode: "icon-only", sizeMode: "regular" }, migrations: [],
      fields: {
        itemIds: { validate: (value): value is readonly string[] => Array.isArray(value) && value.every(item => typeof item === "string") },
        displayMode: { validate: (value): value is ToolbarPreferences["displayMode"] => value === "icon-only" || value === "icon-and-label" || value === "label-only" },
        sizeMode: { validate: (value): value is ToolbarPreferences["sizeMode"] => value === "small" || value === "regular" },
      },
    }, defaults: defaultsFrom({ read: () => null, write() {}, remove() {} }),
  });
  disposables.push(value);
  return value;
}
function construct(kind: Kind, runtime: NSEMenuRuntimePort, options: NSEControllerOwnershipOptions = {}, sharedPreferences = preferences(new AbortController().signal)) {
  const value = kind === "menu"
    ? new NSEMenu({ ...options, runtime, [nseMenuModel]: { id: "runtime-owned-menu", entries: [] } })
    : new NSEToolbarController({ ...options, runtime, preferences: sharedPreferences, items: [], configuration: {
      identifier: "runtime-owned-toolbar", owner: { kind: "application", applicationId: "runtime-owner-app" }, displayMode: "icon-only", sizeMode: "regular", allowedItemIds: [], defaultItemIds: [],
    } });
  disposables.push(value);
  return value;
}
async function launched() {
  class Application extends NSEApplication {}
  const host = createClassApplicationHost(Application, "com.example.runtime-owner");
  hosts.push(host); await host.launch(); return host;
}
function runtimeFor(host: ClassApplicationHost, signal = host.runtime.signal): NSEMenuRuntimePort {
  return { signal, commands: {
    getPresentationGeneration: () => ({ registryGeneration: host.runtime.commands.inspect().generation, responderGeneration: host.runtime.responders.generation }),
    validateMany: host.runtime.commands.validateMany.bind(host.runtime.commands),
    prepareDispatch: host.runtime.commands.prepareDispatch.bind(host.runtime.commands),
    dispatch: host.runtime.commands.dispatch.bind(host.runtime.commands),
  } };
}

describe.each(kinds)("%s canonical runtime ownership", kind => {
  it("constructs in a live class application's React effect and is revoked with that mounted runtime", async () => {
    let controller: ReturnType<typeof construct> | undefined;
    let runtime: NSEMenuRuntimePort | undefined;
    const errors: unknown[] = [];
    function EffectView() {
      const port = useRuntimeNSEMenuPort();
      const [ready, setReady] = React.useState(false);
      React.useEffect(() => {
        runtime = port;
        try { controller = construct(kind, port); } catch (error) { errors.push(error); }
        setReady(true);
      }, [port]);
      return <p>{ready ? "effect settled" : "waiting for effect"}</p>;
    }
    class MainWindow extends NSEWindowController { static override view = EffectView; }
    class Application extends NSEApplication { static override mainWindow = MainWindow; }
    const host = createClassApplicationHost(Application, `com.example.effect-${kind}`);
    hosts.push(host); await host.launch(); host.mountWindows();
    await act(async () => { await host.openMainWindow(); });
    await screen.findByText("effect settled");
    expect(errors).toEqual([]);
    expect(controller?.isDisposed).toBe(false);
    expect(runtime?.signal.aborted).toBe(false);
    await act(async () => { await host.quit(); });
    expect(runtime?.signal.aborted).toBe(true);
    expect(controller?.isDisposed).toBe(true);
  });

  it("does not borrow another live application's lifetime for a late constructor", async () => {
    const first = await launched(), second = await launched();
    await Promise.resolve();
    const controller = construct(kind, runtimeFor(first));
    await second.dispose();
    expect(controller.isDisposed).toBe(false);
    await first.dispose();
    expect(controller.isDisposed).toBe(true);
  });

  it("keeps an explicit owner ahead of the construction owner and runtime", async () => {
    const host = await launched();
    const explicit = new AbortController();
    const ambient = new NSEOwnershipScope("test", "ambient");
    const controller = instantiateInOwnerScope(ambient, () => construct(kind, runtimeFor(host), { owner: { ownerSignal: explicit.signal } }));
    ambient.release("explicit");
    expect(controller.isDisposed).toBe(false);
    explicit.abort();
    expect(controller.isDisposed).toBe(true);
    expect(host.runtime.signal.aborted).toBe(false);
  });

  it("keeps ownerSignal ahead of owner and keeps an ambient owner ahead of runtime", async () => {
    const host = await launched(), explicit = new AbortController(), owner = new AbortController();
    const first = construct(kind, runtimeFor(host), { ownerSignal: explicit.signal, owner: { ownerSignal: owner.signal } });
    owner.abort(); expect(first.isDisposed).toBe(false);
    explicit.abort(); expect(first.isDisposed).toBe(true);
    const ambient = new NSEOwnershipScope("test", "ambient-only");
    const second = instantiateInOwnerScope(ambient, () => construct(kind, runtimeFor(host)));
    ambient.release("explicit"); expect(second.isDisposed).toBe(true);
    expect(host.runtime.signal.aborted).toBe(false);
  });

  it.each(["owner", "ownerSignal", "runtime"] as const)("refuses a dead %s before observing toolbar preferences", async source => {
    const host = await launched(), dead = new AbortController();
    dead.abort(new Error("closed authority"));
    const shared = preferences(host.runtime.signal), subscribe = vi.spyOn(shared, "subscribe");
    const options = source === "owner" ? { owner: { ownerSignal: dead.signal } } : source === "ownerSignal" ? { ownerSignal: dead.signal } : {};
    expect(() => construct(kind, runtimeFor(host, source === "runtime" ? dead.signal : host.runtime.signal), options, shared)).toThrow("closed authority");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("rolls back construction-owned presentation resources on a derived construction failure", async () => {
    const host = await launched(), scope = new NSEOwnershipScope("test", "failed-owner");
    const error = new Error("derived construction failed");
    let controller!: ReturnType<typeof construct>;
    expect(() => instantiateInOwnerScope(scope, () => { controller = construct(kind, runtimeFor(host)); throw error; })).toThrow(error);
    expect(controller.isDisposed).toBe(true);
    expect(host.runtime.signal.aborted).toBe(false);
  });
});
