// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { observable } from "../../src/NSE/Objects";
import { action, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

it("keeps implicit application responders independent across native windows, close and reopen", async () => {
  let app!: SingleApplication;
  class WorkspaceController extends NSEViewController {
    static override view = function WorkspaceView({ controller }: { readonly controller: WorkspaceController }) {
      const record = useAction("recordInteraction");
      return <main>
        <label>Workspace draft<input value={controller.draft} onChange={event => { controller.draft = event.target.value; }} /></label>
        <button disabled={!record.enabled} onClick={() => { void record.perform(); }}>Main action</button>
      </main>;
    };
    @observable accessor draft = "Main draft";
  }
  class WorkspaceWindow extends NSEWindowController<SingleApplication> {
    readonly workspace = new WorkspaceController();
    override windowDidLoad() { this.contentViewController = this.workspace; }
  }
  class InspectorWindow extends NSEWindowController<SingleApplication> {
    static override view = function InspectorView() {
      const record = useAction("recordInteraction");
      return <section><h2>Workspace Inspector</h2>
        <button disabled={!record.enabled} onClick={() => { void record.perform(); }}>Inspector action</button>
      </section>;
    };
  }
  class SingleApplication extends NSEApplication {
    static override mainWindow = WorkspaceWindow;
    static override windowControllers = { inspector: InspectorWindow };
    interactions = 0;
    constructor() { super(); app = this; }
    @action async showInspector() {
      return this.openWindow(InspectorWindow, { title: "Workspace Inspector", width: 460, height: 340, preferredBounds: "centred" });
    }
    @action recordInteraction() { this.interactions += 1; }
  }
  const host = createClassApplicationHost(SingleApplication, "com.example.native-window-identity");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  const mainWindowId = await host.openMainWindow();
  const draft = await screen.findByRole("textbox", { name: "Workspace draft" }) as HTMLInputElement;
  const main = app.windows.find(controller => controller.window.id === mainWindowId) as WorkspaceWindow;
  const mainAction = screen.getByRole("button", { name: "Main action" }) as HTMLButtonElement;
  await waitFor(() => expect(mainAction.disabled).toBe(false));
  fireEvent.change(draft, { target: { value: "Keep this draft" } });

  let first!: InspectorWindow;
  await act(async () => { first = await app.showInspector(); });
  expect(await screen.findByRole("heading", { name: "Workspace Inspector" })).toBeTruthy();
  const firstId = first.window.id;
  const inspectorAction = screen.getByRole("button", { name: "Inspector action" }) as HTMLButtonElement;
  await waitFor(() => expect(inspectorAction.disabled).toBe(false));
  const mainResponder = mainAction.closest("[data-syncloudos-responder-id]")!.getAttribute("data-syncloudos-responder-id")!;
  const inspectorResponder = inspectorAction.closest("[data-syncloudos-responder-id]")!.getAttribute("data-syncloudos-responder-id")!;
  expect(inspectorResponder).not.toBe(mainResponder);
  expect(host.runtime.responders.get(mainResponder)).toBeDefined();
  expect(host.runtime.responders.get(inspectorResponder)).toBeDefined();
  await act(async () => { fireEvent.click(inspectorAction); });
  await waitFor(() => expect(app.interactions).toBe(1));

  await act(async () => { expect(await first.window.close()).toBe("closed"); });
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Workspace Inspector" })).toBeNull());
  expect(first.isDisposed).toBe(true);
  expect(app.windows).not.toContain(first);
  expect(main.isDisposed).toBe(false);
  expect(main.workspace.isDisposed).toBe(false);
  expect(draft.value).toBe("Keep this draft");
  expect(host.runtime.responders.get(mainResponder)).toBeDefined();
  expect(host.runtime.responders.get(inspectorResponder)).toBeNull();
  await act(async () => { fireEvent.click(mainAction); });
  await waitFor(() => expect(app.interactions).toBe(2));
  fireEvent.change(draft, { target: { value: "Still editable" } });
  expect(main.workspace.draft).toBe("Still editable");

  let reopened!: InspectorWindow;
  await act(async () => { reopened = await app.showInspector(); });
  expect(await screen.findByRole("heading", { name: "Workspace Inspector" })).toBeTruthy();
  expect(reopened).not.toBe(first);
  expect(reopened.window.id).not.toBe(firstId);
  expect(reopened.isDisposed).toBe(false);
  expect(reopened.app).toBe(app);
  expect(main.workspace.draft).toBe("Still editable");
  const reopenedAction = screen.getByRole("button", { name: "Inspector action" }) as HTMLButtonElement;
  await waitFor(() => expect(reopenedAction.disabled).toBe(false));
  await act(async () => { fireEvent.click(reopenedAction); });
  await waitFor(() => expect(app.interactions).toBe(3));
  await act(async () => { expect(await reopened.window.close()).toBe("closed"); });
  await waitFor(() => expect(reopened.isDisposed).toBe(true));
  await act(async () => { fireEvent.click(mainAction); });
  await waitFor(() => expect(app.interactions).toBe(4));
});
