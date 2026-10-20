// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { NSEPushButton } from "../../src/NSE/Controls/Buttons/NSEButtons";
import { NSEFocusScope } from "../../src/NSE/Focus";
import { observable } from "../../src/NSE/Objects";
import { action } from "../../src/SynCloudOS/AppSDK/actions";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppSDK/applicationHosting";
import { useResponderHierarchy } from "../../src/SynCloudOSReact/responderHierarchy";
import { ResponderScope } from "../../src/SynCloudOSReact/ResponderScope";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { createTestBundle, createTestRuntime, mountTestSynWareRuntime, registerTestSynWare } from "./helpers";
import type { MountedSynWareRuntime } from "../../src/SynCloudOS/AppSDK/appRuntimeFacade";
import type { FocusScopeHandle } from "../../src/SynCloudOS/Focus/focusTypes";

const hosts: ClassApplicationHost[] = [];
const foreignMounts: MountedSynWareRuntime[] = [];
afterEach(async () => {
  cleanup();
  for (const mount of foreignMounts.splice(0)) mount.dispose();
  for (const host of hosts.splice(0)) await host.dispose();
});

async function mountModal(explicitParent = false) {
  const ParentResponder = React.createContext<string | undefined>(undefined);
  let controller!: Parent;
  class Child extends NSEViewController {
    @observable accessor selected = "none";
    @action selectTemplate(value: string) { this.selected = value; }
    @action dismiss() { (this.parent as Parent).shown = false; }
    static override view = function ChildView({ controller: child }: { readonly controller: Child }) {
      const parentResponderId = React.useContext(ParentResponder);
      return <NSEFocusScope options={{ scopeId: "templates", kind: "modal", parentResponderId, restoreFocus: true }}>
        <section role="dialog" aria-label="Templates">
          <label>Template name<input aria-label="Template name" /></label>
          <output aria-label="Child choice">{child.selected}</output>
          <NSEPushButton action="selectTemplate" actionPayload="paper">Choose paper</NSEPushButton>
          <NSEPushButton action="dismiss">Close templates</NSEPushButton>
        </section>
      </NSEFocusScope>;
    };
  }
  class Parent extends NSEViewController {
    @observable accessor shown = false;
    @observable accessor selected = "none";
    readonly child = this.addChild(Child);
    constructor() { super(); controller = this; }
    @action selectTemplate(value: string) { this.selected = value; }
    @action dismiss() { this.shown = false; }
    static override view = function ParentView({ controller: parent }: { readonly controller: Parent }) {
      const hierarchy = useResponderHierarchy();
      return <>
        <button onClick={() => { parent.shown = true; }}>Open templates</button>
        <output aria-label="Parent choice">{parent.selected}</output>
        {parent.shown && <ParentResponder.Provider value={explicitParent ? hierarchy.responderId ?? undefined : undefined}>
          <NSEViewControllerView controller={parent.child} />
        </ParentResponder.Provider>}
      </>;
    };
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Parent(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.modal-controller");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  const opener = await screen.findByRole("button", { name: "Open templates" });
  await act(async () => { opener.focus(); });
  const previousResponder = host.runtime.focus.getFocusedResponderId();
  await act(async () => { fireEvent.click(opener); });
  const input = await screen.findByRole("textbox", { name: "Template name" });
  await act(async () => { input.focus(); });
  const choose = screen.getByRole("button", { name: "Choose paper" }) as HTMLButtonElement;
  await waitFor(() => expect(choose.disabled).toBe(false));
  return { host, controller, previousResponder, input, choose };
}

it("routes native modal controls through the enclosing child controller while blocking foreign focus and restoring on close", async () => {
  const { host, controller, previousResponder, input, choose } = await mountModal();
  const foreignId = "com.example.foreign-modal-app";
  registerTestSynWare(host.runtime, { schemaVersion: 1, bundleIdentifier: foreignId, displayName: "Other app", version: "1.0.0" });
  const foreign = mountTestSynWareRuntime(host.runtime, foreignId);
  foreignMounts.push(foreign);
  expect(foreign.runtime.focus.requestFocus(`application:${foreignId}`)).toMatchObject({ status: "blocked" });
  expect(document.activeElement).toBe(input);
  await act(async () => { choose.focus(); });
  await act(async () => { choose.click(); });
  await waitFor(() => expect(controller.child.selected).toBe("paper"));
  expect(controller.selected).toBe("none");
  const close = screen.getByRole("button", { name: "Close templates" }) as HTMLButtonElement;
  await waitFor(() => expect(close.disabled).toBe(false));
  await act(async () => { close.focus(); });
  await act(async () => { close.click(); });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Templates" })).toBeNull());
  expect(host.runtime.focus.getFocusedResponderId()).toBe(previousResponder);
  expect(host.runtime.focus.inspect().scopes.filter(scope => scope.kind === "modal")).toEqual([]);
  expect(foreign.runtime.focus.requestFocus(`application:${foreignId}`)).toMatchObject({ status: "focused" });
});

it("keeps an explicit live parent ahead of the nearest child controller", async () => {
  const { controller, choose } = await mountModal(true);
  await act(async () => { choose.focus(); });
  await act(async () => { choose.click(); });
  await waitFor(() => expect(controller.selected).toBe("paper"));
  expect(controller.child.selected).toBe("none");
});

it("restores a live owned modal parent when its previously focused child button has been removed", async () => {
  let rootResponderId: string | null = null;
  class Content extends NSEViewController {
    @observable accessor shown = false;
    @observable accessor openerVisible = true;
    @action removeOpener() { this.openerVisible = false; }
    @action dismiss() { this.shown = false; }
    static override view = function ContentView({ controller }: { readonly controller: Content }) {
      const hierarchy = useResponderHierarchy();
      const openerId = React.useId();
      const modalControlId = React.useId();
      const modalScopeId = React.useId();
      if (!hierarchy.responderId) throw new Error("The class view has no mounted responder.");
      rootResponderId = hierarchy.responderId;
      return <>
        {controller.openerVisible && <ResponderScope responderId={openerId} kind="control" scopeId={hierarchy.responderId}>
          <button onClick={() => { controller.shown = true; }}>Open removable templates</button>
        </ResponderScope>}
        {controller.shown && <NSEFocusScope options={{ scopeId: modalScopeId, kind: "modal", restoreFocus: true }}>
          <section role="dialog" aria-label="Removable templates">
            <ResponderScope responderId={modalControlId} kind="control" scopeId={modalScopeId}>
              <input aria-label="Temporary template name" />
            </ResponderScope>
            <NSEPushButton action="removeOpener">Remove original opener</NSEPushButton>
            <NSEPushButton action="dismiss">Close removable templates</NSEPushButton>
          </section>
        </NSEFocusScope>}
      </>;
    };
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Content(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.modal-fallback");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await act(async () => { await host.openMainWindow(); });
  const opener = await screen.findByRole("button", { name: "Open removable templates" });
  const openerResponder = opener.closest<HTMLElement>("[data-syncloudos-responder-id]")!.dataset.syncloudosResponderId!;
  await act(async () => {
    opener.focus();
    expect(host.runtime.focus.requestFocus(openerResponder)).toMatchObject({ status: "focused" });
  });
  expect(host.runtime.focus.getFocusedResponderId()).toBe(openerResponder);
  await act(async () => { opener.click(); });
  const input = await screen.findByRole("textbox", { name: "Temporary template name" });
  const modalResponder = input.closest<HTMLElement>("[data-syncloudos-responder-id]")!.dataset.syncloudosResponderId!;
  await act(async () => {
    input.focus();
    expect(host.runtime.focus.requestFocus(modalResponder)).toMatchObject({ status: "focused" });
  });
  const remove = screen.getByRole("button", { name: "Remove original opener" }) as HTMLButtonElement;
  await waitFor(() => expect(remove.disabled).toBe(false));
  await act(async () => { remove.click(); });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Open removable templates" })).toBeNull());
  expect(host.runtime.responders.has(openerResponder)).toBe(false);
  const close = screen.getByRole("button", { name: "Close removable templates" }) as HTMLButtonElement;
  await waitFor(() => expect(close.disabled).toBe(false));
  await act(async () => { close.click(); });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Removable templates" })).toBeNull());
  expect(rootResponderId).not.toBeNull();
  expect(host.runtime.focus.getFocusedResponderId()).toBe(rootResponderId);
  expect(host.runtime.focus.getFocusedResponderId()).not.toBe(openerResponder);
  expect(host.runtime.focus.getFocusedResponderId()).not.toBe(modalResponder);
});

it.each([true, false])("skips a disabled saved responder and restores only an enabled owned parent (parent enabled: %s)", async parentAvailable => {
  const appId = `com.example.disabled-focus.${parentAvailable ? "parent" : "none"}`;
  const appResponderId = `application:${appId}`;
  const parentId = `${appId}:parent`;
  const openerId = `${appId}:opener`;
  const modalId = `${appId}:modal`;
  const modalControlId = `${appId}:modal-control`;
  const runtime = createTestRuntime({ initialBundles: [createTestBundle({ bundleIdentifier: appId })] });
  const mounted = mountTestSynWareRuntime(runtime, appId, appResponderId);
  let openerEnabled = true;
  let parentEnabled = true;
  runtime.responders.register({ id: parentId, kind: "controller", parentId: appResponderId, scopeId: appResponderId, enabled: () => parentEnabled });
  runtime.responders.register({ id: openerId, kind: "control", parentId, scopeId: appResponderId, enabled: () => openerEnabled });
  runtime.responders.register({ id: modalControlId, kind: "control", parentId, scopeId: modalId });
  const container = document.createElement("div");
  const opener = document.createElement("button");
  const modalControl = document.createElement("button");
  opener.textContent = "Open enabled-callback modal";
  modalControl.textContent = "Modal control";
  container.append(opener, modalControl);
  document.body.append(container);
  let scope: FocusScopeHandle | undefined;
  opener.addEventListener("focus", () => { mounted.runtime.focus.requestFocus(openerId); });
  modalControl.addEventListener("focus", () => { mounted.runtime.focus.requestFocus(modalControlId); });
  opener.addEventListener("click", () => {
    scope = mounted.runtime.focus.openScope({ id: modalId, kind: "modal", parentResponderId: parentId, modal: true, trapFocus: false });
    modalControl.focus();
  });
  try {
    opener.focus();
    expect(runtime.focus.getFocusedResponderId()).toBe(openerId);
    opener.click();
    expect(runtime.focus.getFocusedResponderId()).toBe(modalControlId);
    openerEnabled = false;
    parentEnabled = parentAvailable;
    expect(runtime.responders.has(openerId)).toBe(true);
    expect(runtime.responders.isEnabled(openerId)).toBe(false);
    expect(scope!.close()).toMatchObject({
      status: "closed",
      restoredResponderId: parentAvailable ? parentId : null,
    });
    expect(runtime.focus.getFocusedResponderId()).toBe(parentAvailable ? parentId : modalControlId);
    expect(mounted.runtime.focus.requestFocus(appResponderId)).toMatchObject({ status: "focused" });
    expect(scope!.close().status).toBe("missing");
    expect(runtime.focus.getFocusedResponderId()).toBe(appResponderId);
  } finally {
    container.remove();
    mounted.dispose();
    await runtime.dispose();
  }
});
