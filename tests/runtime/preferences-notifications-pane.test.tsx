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

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemUILayer } from "../../src/Webspring/SystemUILayer";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";

import { createTestRuntime, registerTestSynWare } from "./helpers";
import { definePreferencePane } from "../../src/SynCloudOS/Preferences";

/**
 * The empty Notifications pane, which is otherwise unreachable in the running
 * app — every build so far has had at least one app that notifies, so the state
 * that shipped was an empty group box nobody had looked at.
 *
 * A bare runtime store IS the empty case: no app has registered yet.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSystemUI(pane = "", prepare?: (runtime: ReturnType<typeof createTestRuntime>) => void, preferences?: ComponentProps<typeof SystemUILayer>["preferences"]) {
  const runtime = createTestRuntime();
  prepare?.(runtime);
  runtime.systemUI.preferences.open(pane);
  return render(
    <SynCloudOSProvider runtime={runtime}>
      <RuntimeInputBoundary><SystemUILayer onLogOut={() => {}} preferences={preferences} /></RuntimeInputBoundary>
    </SynCloudOSProvider>
  );
}

describe("Notifications pane with nothing to list", () => {
  it("uses canonical app metadata, percentage values, and supported haptics", () => {

    let runtime!: ReturnType<typeof createTestRuntime>;
    renderSystemUI("sounds", (value) => {
      runtime = value;
      vi.spyOn(runtime.haptics, "isSupported", "get").mockReturnValue(true);
      registerTestSynWare(runtime, { schemaVersion: 1, id: "example", version: "1.0.0", title: "Example Player" });
      vi.spyOn(runtime.settings, "supportsVibration").mockReturnValue(true);
      const snapshot = Object.freeze({ masterVolume: 0.65, enabled: true, applications: [{ appId: "example", volume: 0.37, sessionCount: 2 }] });
      vi.spyOn(runtime.audio, "getMixerSnapshot").mockReturnValue(snapshot);
    });
    expect(screen.getByText("Applications")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Example Player" }).getAttribute("aria-valuetext")).toBe("37%");
    expect(screen.getByText("37%")).toBeTruthy();
    expect(screen.getByText("65%")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Haptics enabled" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("switch", { name: "Haptics enabled" }), { key: " " });
    expect(runtime.settings.get().vibrationEnabled).toBe(false);
  });
  it("shows master audio and hides applications and unsupported haptics", () => {
    renderSystemUI("sounds");
    expect(screen.getByRole("slider", { name: "Master volume" })).toBeTruthy();
    expect(screen.queryByText("Applications")).toBeNull();
    expect(screen.queryByText("Haptics")).toBeNull();
    expect(screen.getByText("Audio & Haptics")).toBeTruthy();
  });
  it("keeps open portal appearance and locale isolated across two runtimes", async () => {
    const first = createTestRuntime({ id: "preferences-first" });
    const second = createTestRuntime({ id: "preferences-second" });
    first.systemUI.preferences.open();
    second.systemUI.preferences.open();
    render(<>
      <SynCloudOSProvider runtime={first}><RuntimeInputBoundary><SystemUILayer onLogOut={() => {}} /></RuntimeInputBoundary></SynCloudOSProvider>
      <SynCloudOSProvider runtime={second}><RuntimeInputBoundary><SystemUILayer onLogOut={() => {}} /></RuntimeInputBoundary></SynCloudOSProvider>
    </>);

    await act(async () => {
      first.appearance.set("dark");
      first.locale.setLocale("fr-FR");
      second.appearance.set("light");
    });
    const firstPortal = document.querySelector<HTMLElement>('.nse-prefs-backdrop[data-syncloudos-runtime-owner="preferences-first"]');
    const secondPortal = document.querySelector<HTMLElement>('.nse-prefs-backdrop[data-syncloudos-runtime-owner="preferences-second"]');
    expect(firstPortal?.dataset.mode).toBe("dark");
    expect(firstPortal?.textContent).toContain("Préférences");
    expect(secondPortal?.dataset.mode).toBe("light");
    expect(secondPortal?.textContent).toContain("Preferences");
    expect(secondPortal?.textContent).not.toContain("Préférences");
  });

  it("explains the emptiness instead of rendering a blank group box", () => {
    renderSystemUI("notifications");

    expect(screen.getByText("No Apps Yet")).toBeTruthy();
    expect(screen.getByText(/will appear here/)).toBeTruthy();
  });

  it("counts nothing as None rather than 0/0", () => {
    renderSystemUI();

    const row = screen.getByText("Notifications").closest(".nse-control-list-item");
    expect(row?.textContent).toContain("None");
    expect(row?.textContent).not.toContain("0/0");
  });

  it("contains a throwing developer pane without taking down System Preferences", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Broken = () => { throw new Error("pane render failed"); };
    renderSystemUI("broken", undefined, { panes: [definePreferencePane({ id: "broken", title: "Broken", order: 50, view: Broken })] });

    expect(screen.getByRole("dialog", { name: "System Preferences" })).toBeTruthy();
    expect(screen.getByText("This preference pane could not be loaded.")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("carries the runtime-resolved appearance onto its body portal and updates while open", async () => {
    let runtime!: ReturnType<typeof createTestRuntime>;
    renderSystemUI("", (candidate) => {
      runtime = candidate;
      runtime.appearance.set("light");
    });
    const toast = screen.getByRole("dialog", { name: "System Preferences" });
    expect(getComputedStyle(toast).backgroundColor).not.toBe("rgb(38, 44, 52)");

    await act(async () => { runtime.appearance.set("dark"); });
    expect(toast.closest(".nse-prefs-backdrop")?.getAttribute("data-mode")).toBe("dark");
  });

  it("updates open system Preferences from the owning runtime locale and keeps native language names", async () => {
    let runtime!: ReturnType<typeof createTestRuntime>;
    renderSystemUI("", (candidate) => { runtime = candidate; });
    expect(screen.getByRole("dialog", { name: "System Preferences" })).toBeTruthy();

    await act(async () => { runtime.locale.setLocale("fr-FR"); });
    expect(screen.getByRole("dialog", { name: "Préférences Système" })).toBeTruthy();
    expect(screen.getByText("Apparence")).toBeTruthy();
    expect(screen.getByText("Langue")).toBeTruthy();

    await act(async () => { runtime.systemUI.preferences.open("language"); });
    expect(screen.getByText("British English")).toBeTruthy();
    expect(screen.getByText("Français")).toBeTruthy();
    expect(screen.getByText("Español")).toBeTruthy();
    expect(screen.getByText("Deutsch")).toBeTruthy();
    expect(screen.queryByText("French")).toBeNull();
  });
});


