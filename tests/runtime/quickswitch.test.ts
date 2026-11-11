/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WebspringQuickSwitchView } from "../../src/Webspring/WebspringQuickSwitchView";
import { createTestRuntime } from "./helpers";
import {
  getQuickSwitchInitialIndex,
  getQuickSwitchMnemonic,
  isEditableQuickSwitchTarget,
  isQuickSwitchOpenedApp,
  isQuickSwitchShortcutEvent,
  moveQuickSwitchSelection,
  normalizeQuickSwitchKey,
  selectQuickSwitchMnemonicIndex
} from "../../src/Webspring/quickswitchModel";

vi.mock("../../src/Webspring/WebspringIconEffect", () => ({
  WebspringIconEffect: ({ active, className }: { active?: boolean; className?: string }) => (
    React.createElement("span", {
      className,
      "data-testid": "quickswitch-netburst",
      "data-active": active ? "true" : "false"
    })
  )
}));

function app(id: string, displayName: string, shortName = displayName) {
  return { version: "1.0.0",
    bundleIdentifier: id,
    displayName,
    shortName,
    packageName: `com.test.${id}`,
    route: `/${id.split(".").at(-1)}`,
    icon: { src: `/icons/${id}.png` },
    notifications: { badgeCount: 0 },
    isDisabled: false
  } as unknown as SynCloudOSAppInfo;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Webspring QuickSwitch model", () => {
  it("normalizes mnemonic keys and resolves app mnemonic letters", () => {
    expect(normalizeQuickSwitchKey("a")).toBe("A");
    expect(normalizeQuickSwitchKey("7")).toBe("7");
    expect(normalizeQuickSwitchKey("Enter")).toBeNull();
    expect(getQuickSwitchMnemonic(app("com.example.about", "About"))).toBe("A");
    expect(getQuickSwitchMnemonic(app("com.example.studio", "Studio", "  Studio"))).toBe("S");
  });

  it("selects initial, arrow, and duplicate-letter indices deterministically", () => {
    const disabledArchive = app("com.example.archive", "Archive");
    disabledArchive.isDisabled = true;
    const apps = [
      app("com.example.about", "About"),
      disabledArchive,
      app("com.example.studio", "Studio")
    ];
    const selectable = (item: { isDisabled?: boolean }) => !item.isDisabled;

    expect(getQuickSwitchInitialIndex(apps, null, "com.example.studio")).toBe(2);
    expect(moveQuickSwitchSelection(0, apps.length, "ArrowLeft")).toBe(2);
    expect(moveQuickSwitchSelection(2, apps.length, "ArrowRight")).toBe(0);
    expect(selectQuickSwitchMnemonicIndex(apps, "A", -1)).toBe(0);
    expect(selectQuickSwitchMnemonicIndex(apps, "A", 0)).toBe(1);
    expect(selectQuickSwitchMnemonicIndex(apps, "A", 1)).toBe(0);
    expect(getQuickSwitchInitialIndex(apps, "com.example.archive", null, selectable)).toBe(0);
    expect(moveQuickSwitchSelection(0, apps.length, "ArrowRight", [0, 2])).toBe(2);
    expect(selectQuickSwitchMnemonicIndex(apps, "A", 0, selectable)).toBe(0);
  });

  it("derives opened indicators from runtime application and lifecycle authority", () => {
    expect(isQuickSwitchOpenedApp("com.example.about", { activeAppId: "com.example.about" })).toBe(true);
    expect(isQuickSwitchOpenedApp("com.example.about", { openAppIds: ["com.example.about"] })).toBe(true);
    expect(isQuickSwitchOpenedApp("com.example.about", { lifecycle: { "com.example.about": "ready" } })).toBe(false);
    expect(isQuickSwitchOpenedApp("com.example.about", { lifecycle: { "com.example.about": "loading" } })).toBe(false);
    expect(isQuickSwitchOpenedApp("com.example.about", { lifecycle: { "com.example.about": "suspended" } })).toBe(true);
    expect(isQuickSwitchOpenedApp("com.example.about", { lifecycle: { "com.example.about": "registered" } })).toBe(false);
  });

  it("guards the opener shortcut around editable targets without suppressing standard dialogs", () => {
    expect(isQuickSwitchShortcutEvent({ key: "k", ctrlKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(isQuickSwitchShortcutEvent({ key: "k", ctrlKey: true, metaKey: false, altKey: true })).toBe(false);

    const input = document.createElement("input");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const dialogInput = document.createElement("input");
    dialog.append(dialogInput);
    const plain = document.createElement("button");

    expect(isEditableQuickSwitchTarget(input)).toBe(true);
    expect(isEditableQuickSwitchTarget(dialog)).toBe(false);
    expect(isEditableQuickSwitchTarget(dialogInput)).toBe(true);
    expect(isEditableQuickSwitchTarget(plain)).toBe(false);
  });
});

describe("WebspringQuickSwitchView", () => {
  it("selects by mnemonic and opens only after Enter", async () => {
    const apps = [
      app("com.example.about", "About"),
      app("com.example.archive", "Archive"),
      app("com.example.studio", "Studio")
    ];
    const onClose = vi.fn();
    const runtime = createTestRuntime();
    const dispatch = vi.spyOn(runtime.commands, "dispatch");

    render(React.createElement(SynCloudOSProvider, { runtime }, React.createElement(WebspringQuickSwitchView, {
      open: true,
      apps,
      lifecycle: { "com.example.about": "registered", archive: "registered", "com.example.studio": "active" },
      windows: [],
      openAppIds: ["com.example.studio"],
      activeAppId: "com.example.studio",
      selectedAppId: null,
      onClose
    })));

    expect(screen.getByRole("option", { name: /Studio, opened, S shortcut/i }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "A" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /About, not opened, A shortcut/i }).getAttribute("aria-selected")).toBe("true");
    });
    expect(dispatch).not.toHaveBeenCalledWith("workspace.openApp", expect.anything(), expect.anything());

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "A" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Archive, not opened, A shortcut/i }).getAttribute("aria-selected")).toBe("true");
    });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith("workspace.openApp", { appId: "com.example.archive" }, { source: "keyboard" });
    });
  });

  it("moves with arrows and closes on Escape", async () => {
    const apps = [app("com.example.about", "About"), app("com.example.studio", "Studio")];
    const onClose = vi.fn();
    const runtime = createTestRuntime();

    render(React.createElement(SynCloudOSProvider, { runtime }, React.createElement(WebspringQuickSwitchView, {
      open: true,
      apps,
      lifecycle: { "com.example.about": "registered", "com.example.studio": "registered" },
      windows: [],
      openAppIds: [],
      activeAppId: null,
      selectedAppId: null,
      onClose
    })));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Studio, not opened, S shortcut/i }).getAttribute("aria-selected")).toBe("true");
    });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("skips disabled options and activates the selected app with Space", async () => {
    const disabledArchive = app("com.example.archive", "Archive");
    disabledArchive.isDisabled = true;
    const apps = [app("com.example.about", "About"), disabledArchive, app("com.example.studio", "Studio")];
    const onClose = vi.fn();
    const runtime = createTestRuntime();
    const dispatch = vi.spyOn(runtime.commands, "dispatch");

    render(React.createElement(SynCloudOSProvider, { runtime }, React.createElement(WebspringQuickSwitchView, {
      open: true,
      apps,
      lifecycle: { "com.example.about": "registered", archive: "disabled", "com.example.studio": "registered" },
      windows: [],
      openAppIds: [],
      activeAppId: null,
      selectedAppId: null,
      onClose
    })));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Studio, not opened, S shortcut/i }).getAttribute("aria-selected")).toBe("true");
    });

    fireEvent.keyDown(screen.getByRole("dialog"), { key: " " });

    expect(onClose).toHaveBeenCalled();
    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith("workspace.openApp", { appId: "com.example.studio" }, { source: "keyboard" });
    });
  });
});
