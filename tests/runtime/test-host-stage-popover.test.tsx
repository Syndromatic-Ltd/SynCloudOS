// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { NSEApplication, NSEViewController, NSEWindowController } from "../../src/NSE/Application";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";

class Options extends NSEViewController {
  renderView() { return <input aria-label="Stage popover value" defaultValue="Retained" />; }
}
class Content extends NSEViewController {
  renderView() { return <button onClick={event => this.presentAsPopover(Options, { of: event.currentTarget })}>Open stage options</button>; }
}
class Window extends NSEWindowController { static override contentViewControllerClass = Content; }
class Application extends NSEApplication { static override mainWindow = Window; }

it("renders a stage app's presented popover in the test host's real window layer", async () => {
  const host = createSynWareTestHost({ application: Application, document, manifest: {
    schemaVersion: 1, bundleIdentifier: "com.example.stage-popover-host", version: "1.0.0", displayName: "Stage popover host",
    routes: [{ path: "/stage-popover-host", primary: true }],
  } });
  try {
    await act(async () => { await host.render(); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open stage options" })); });
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Stage popover value" })).toBeTruthy());
    const input = screen.getByRole("textbox", { name: "Stage popover value" });
    expect(input.closest("[data-nse-window-popover]")).not.toBeNull();
    expect(document.querySelector(".webspring-window-layer")).not.toBeNull();
  } finally { await act(async () => { await host.dispose(); }); }
});
