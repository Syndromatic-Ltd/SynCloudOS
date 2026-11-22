// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEApplication, NSEWindowController } from "../../src/NSE/Application";
import { createAppSCOS } from "../../src/SynCloudOS/AppSDK";
import { NSEMenu } from "../../src/NSE/Menus";
import { NSEToolbar, NSEToolbarItem } from "../../src/NSE/Toolbars";
import { createSynWareDefinitionFromApplicationClass } from "../../src/SynCloudOS/AppHosting/applicationClass";
import { createSynWareTestHost } from "../../src/SynCloudOS/AppSDK/testing/createSynWareTestHost";

afterEach(cleanup);

it.each([[false, false], [true, false], [false, true], [true, true]])(
  "keeps the File menu bar (%s) and a toolbar application menu (%s) independent", async (bar, item) => {
    class Main extends NSEWindowController {
      static override view = () => <p>Window content</p>;
      override windowDidLoad() {
        if (bar) this.app.mainMenu = new NSEMenu({ owner: this.app, runtime: createAppSCOS("com.example.window-menus").menus.runtime, title: "Menus", items: [{ title: "File", submenu: [] }] });
        if (item) {
          const menu = NSEToolbarItem.applicationMenu("person");
          this.window.toolbar = new NSEToolbar({ identifier: "test-toolbar", items: [menu], defaultItemIdentifiers: [menu.id] });
        }
      }
    }
    class Application extends NSEApplication { static override mainWindow = Main; }
    const app = createSynWareDefinitionFromApplicationClass(Application, {
      schemaVersion: 1, bundleIdentifier: "com.example.window-menus", displayName: "Window Menus", version: "1.0.0",
    });
    const container = document.createElement("div");
    document.body.append(container);
    const host = createSynWareTestHost({ app, document, container, surface: "window" });
    try {
      await act(() => host.render());
      await screen.findByText("Window content");
      const menuBar = screen.queryByRole("menubar");
      expect(Boolean(menuBar)).toBe(bar);
      if (menuBar) expect(menuBar.firstElementChild?.textContent).toContain("Window Menus");
      const button = screen.queryByRole("button", { name: "Application Menu" });
      expect(Boolean(button)).toBe(item);
      if (button) {
        fireEvent.click(button);
        expect(button.getAttribute("aria-expanded")).toBe("true");
        await waitFor(async () => {
          await act(async () => { host.clock.advance(25); });
          expect(document.querySelector("[data-nse-application-menu]")?.textContent).toContain("System Preferences");
        });
      }
    } finally {
      await host.dispose();
      container.remove();
    }
  },
);
