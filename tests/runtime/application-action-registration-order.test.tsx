// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { observable } from "../../src/NSE/Objects";
import { NSEPushButton } from "../../src/NSE/Controls/Buttons/NSEButtons";
import { action, useAction } from "../../src/SynCloudOS/AppSDK/actions";
import { useCommands } from "../../src/SynCloudOS/AppSDK/hooks/useCommands";
import { createClassApplicationHost, type ClassApplicationHost } from "./fixtures/classApplicationHost";
import { NSEPopup } from "../../src/NSE/Overlays/NSEPopup";
import { NSEViewControllerView } from "../../src/SynCloudOS/AppSDK/applicationHosting";

const hosts: ClassApplicationHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.dispose(); });

it("revalidates action buttons and useAction after a parent registers commands in a passive effect", async () => {
  let controller!: Panel;
  function View() {
    useCommands([{
      id: "com.example.registration-order.escape", title: "Escape",
      defaultKeyBindings: [{ key: "Escape", modifiers: [], scope: "application", repeat: "ignore", allowInEditable: true }],
      execute() { return undefined; },
    }]);
    const ping = useAction("ping");
    return <><NSEPushButton action="ping">Ping button</NSEPushButton><button disabled={!ping.enabled} onClick={() => { void ping.perform(); }}>Ping hook</button></>;
  }
  class Panel extends NSEViewController {
    static override view = View;
    @observable accessor count = 0;
    constructor() { super(); controller = this; }
    @action ping() { this.count += 1; }
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Panel(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.registration-order");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await host.openMainWindow();
  const button = await screen.findByRole("button", { name: "Ping button" }) as HTMLButtonElement;
  const hook = screen.getByRole("button", { name: "Ping hook" }) as HTMLButtonElement;
  await waitFor(() => { expect(button.disabled).toBe(false); expect(hook.disabled).toBe(false); });
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(controller.count).toBe(1));
  await act(async () => { fireEvent.click(hook); });
  await waitFor(() => expect(controller.count).toBe(2));
});

it("revalidates sibling actions after an observable snapshot becomes available without command registration changes", async () => {
  let controller!: Panel;
  function View({ controller: panel }: { readonly controller: Panel }) {
    const exportSnapshot = useAction("exportSnapshot");
    return <>
      <output>{panel.snapshot ? "Snapshot ready" : "No snapshot"}</output>
      <NSEPushButton action="refreshSnapshot">Refresh snapshot</NSEPushButton>
      <NSEPushButton action="exportSnapshot">Export snapshot</NSEPushButton>
      <button disabled={!exportSnapshot.enabled} onClick={() => { void exportSnapshot.perform(); }}>Export hook</button>
    </>;
  }
  class Panel extends NSEViewController {
    static override view = View;
    @observable accessor snapshot: { readonly revision: number } | null = null;
    readonly trusted = { diagnostics: true };
    exports = 0;
    constructor() { super(); controller = this; }
    @action refreshSnapshot() { this.snapshot = { revision: 1 }; }
    @action exportSnapshot() { this.exports += 1; }
    validateExportSnapshot() { return Boolean(this.snapshot && this.trusted.diagnostics); }
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Panel(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.snapshot-actions");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await host.openMainWindow();
  const refresh = await screen.findByRole("button", { name: "Refresh snapshot" }) as HTMLButtonElement;
  const button = screen.getByRole("button", { name: "Export snapshot" }) as HTMLButtonElement;
  const hook = screen.getByRole("button", { name: "Export hook" }) as HTMLButtonElement;
  await waitFor(() => { expect(refresh.disabled).toBe(false); expect(button.disabled).toBe(true); expect(hook.disabled).toBe(true); });
  await act(async () => { fireEvent.click(refresh); });
  expect(await screen.findByText("Snapshot ready")).toBeTruthy();
  await waitFor(() => { expect(button.disabled).toBe(false); expect(hook.disabled).toBe(false); });
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(controller.exports).toBe(1));
  await act(async () => { fireEvent.click(hook); });
  await waitFor(() => expect(controller.exports).toBe(2));
});

it("inherits class-controller ancestry for root and child actions inside a modal popup", async () => {
  const calls: string[] = [];
  class Editor extends NSEViewController {
    static override view = () => <><input aria-label="Collection name" /><NSEPushButton action="saveCollection">Save collection</NSEPushButton></>;
    @action saveCollection() { calls.push("editor.save"); }
  }
  class Panel extends NSEViewController {
    readonly editor = this.addChild(Editor);
    static override view = ({ controller }: { readonly controller: Panel }) => <>
      <p>Library</p>
      <NSEPopup defaultOpen modal title="Collection tools">
        <NSEPushButton action="chooseCollection">Choose collection</NSEPushButton>
        <NSEViewControllerView controller={controller.editor} />
      </NSEPopup>
    </>;
    @action chooseCollection() { calls.push("panel.choose"); }
  }
  class MainWindow extends NSEWindowController {
    constructor() { super(); this.contentViewController = new Panel(); }
  }
  class Application extends NSEApplication { static override mainWindow = MainWindow; }
  const host = createClassApplicationHost(Application, "com.example.popup-actions");
  hosts.push(host);
  await host.launch();
  host.mountWindows();
  await host.openMainWindow();
  const save = await screen.findByRole("button", { name: "Save collection" }) as HTMLButtonElement;
  const choose = screen.getByRole("button", { name: "Choose collection" }) as HTMLButtonElement;
  expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  expect(host.runtime.focus.requestFocus("application:com.example.popup-actions")).toMatchObject({ status: "blocked" });
  await act(async () => { (screen.getByRole("textbox", { name: "Collection name" }) as HTMLInputElement).focus(); });
  await waitFor(() => { expect(save.disabled).toBe(false); expect(choose.disabled).toBe(false); });
  await act(async () => { fireEvent.click(save); });
  await waitFor(() => expect(calls).toEqual(["editor.save"]));
  await act(async () => { fireEvent.click(choose); });
  await waitFor(() => expect(calls).toEqual(["editor.save", "panel.choose"]));
});
