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
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { definePreferencePane, type PreferencePaneViewProps } from "../../src/SynCloudOS/Preferences";
import { RuntimeInputBoundary, SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { SystemUILayer } from "../../src/Webspring/SystemUILayer";
import type { SystemUIAccount } from "../../src/Webspring/Preferences/systemAccount";
import { defineWebspring } from "../../src/Webspring/Webspring";
import type { WebspringPreferencesOptions } from "../../src/Webspring/webspringTypes";
import { createTestRuntime } from "./helpers";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const builtInTitles = ["Appearance", "Audio & Haptics", "Motion", "Notifications", "Language"];

function renderPreferences(options: { preferences?: WebspringPreferencesOptions; account?: SystemUIAccount; open?: string } = {}) {
  const runtime = createTestRuntime();
  runtime.systemUI.preferences.open(options.open ?? "");
  const view = render(
    <SynCloudOSProvider runtime={runtime}>
      <RuntimeInputBoundary>
        <SystemUILayer onLogOut={() => {}} account={options.account} preferences={options.preferences} />
      </RuntimeInputBoundary>
    </SynCloudOSProvider>,
  );
  return { runtime, ...view };
}

/** The known titles on the root list, top to bottom (rows carry their value and switch too). */
function listedTitles(known: readonly string[]) {
  return [...document.querySelectorAll(".nse-prefs-list > .nse-control-list-item")]
    .map((row) => known.find((title) => (row.textContent ?? "").startsWith(title)) ?? row.textContent ?? "");
}

const pane = (id: string, title: string, order: number, view: () => ReactNode = () => null) =>
  definePreferencePane({ id, title, order, view });

describe("System Preferences panes", () => {
  it("lists the built-ins in their default order, without Account when sign-in is not offered", () => {
    renderPreferences();
    expect(listedTitles(builtInTitles)).toEqual(builtInTitles);
    expect(screen.queryByText("Account")).toBeNull();
  });

  it("lists Account first when the host offers sign-in", () => {
    renderPreferences({ account: { signedIn: false, name: null, onSignIn: () => {} } });
    expect(listedTitles(["Account", ...builtInTitles])).toEqual(["Account", ...builtInTitles]);
    expect(screen.getByText("Not Signed In")).toBeTruthy();
  });

  it("signs in from the Account pane and closes Preferences", () => {
    const onSignIn = vi.fn();
    const { runtime } = renderPreferences({ open: "account", account: { signedIn: false, name: null, onSignIn } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(runtime.systemUI.getSnapshot().preferencesPane).toBeNull();
  });

  it("shows the signed-in name and offers Log Out", () => {
    const { runtime } = renderPreferences({ open: "account", account: { signedIn: true, name: "Ada", onSignIn: () => {} } });
    expect(screen.getByText("Ada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    expect(runtime.systemUI.getSnapshot().logOutOpen).toBe(true);
  });

  it("hides built-ins by id", () => {
    renderPreferences({ preferences: { hide: ["sounds", "motion"] } });
    expect(listedTitles(builtInTitles)).toEqual(["Appearance", "Notifications", "Language"]);
  });

  it("hides Account even when sign-in is offered", () => {
    renderPreferences({ account: { signedIn: false, name: null, onSignIn: () => {} }, preferences: { hide: ["account"] } });
    expect(screen.queryByText("Account")).toBeNull();
  });

  it("adds developer panes and orders every pane by order", () => {
    const titles = ["First", ...builtInTitles, "Between", "Billing"];
    renderPreferences({ preferences: { panes: [pane("billing", "Billing", 600), pane("first", "First", 10), pane("between", "Between", 250)] } });
    expect(listedTitles(titles))
      .toEqual(["First", "Appearance", "Audio & Haptics", "Between", "Motion", "Notifications", "Language", "Billing"]);
  });

  it("replaces a built-in with a developer pane of the same id, in the list and when opened", () => {
    const { runtime } = renderPreferences({ preferences: { panes: [pane("sounds", "My Sounds", 200, () => <p>custom sounds pane</p>)] } });
    expect(listedTitles([...builtInTitles, "My Sounds"])).toEqual(["Appearance", "My Sounds", "Motion", "Notifications", "Language"]);
    act(() => { runtime.systemUI.preferences.open("sounds"); });
    expect(screen.getByText("custom sounds pane")).toBeTruthy();
    expect(screen.queryByRole("slider", { name: "Master volume" })).toBeNull();
  });

  it("renders a developer pane with settings, appearance and locale", () => {
    const seen: PreferencePaneViewProps[] = [];
    const Billing = (props: PreferencePaneViewProps) => {
      seen.push(props);
      return <p>{`${props.settings.motion}|${props.appearance}|${props.locale.activeLocale}`}</p>;
    };
    const { runtime } = renderPreferences({ open: "billing", preferences: { panes: [definePreferencePane({ id: "billing", title: "Billing", order: 600, view: Billing })] } });
    expect(screen.getByText(/^system\|auto\|/)).toBeTruthy();
    act(() => { runtime.appearance.set("dark"); });
    expect(screen.getByText(/\|dark\|/)).toBeTruthy();
    const latest = seen.at(-1)!;
    expect(latest.settings).toBe(runtime.settings.get());
    expect(latest.locale.supportedLocales.length).toBeGreaterThan(0);
  });

  it("shows a developer pane summary and accessory on its list row", () => {
    const Summary = ({ settings }: PreferencePaneViewProps) => <>{settings.soundEnabled ? "loud" : "quiet"}</>;
    const Accessory = () => <button type="button">row switch</button>;
    renderPreferences({ preferences: { panes: [definePreferencePane({ id: "billing", title: "Billing", order: 600, view: () => null, summary: Summary, accessory: Accessory })] } });
    expect(screen.getByText(/loud|quiet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "row switch" })).toBeTruthy();
  });

  it("translates a localisable title from the system dictionary", async () => {
    const { runtime } = renderPreferences({ preferences: { panes: [definePreferencePane({ id: "billing", title: { key: "preferences.language", fallback: "Billing" }, order: 600, view: () => null })] } });
    expect(screen.getAllByText("Language")).toHaveLength(2);
    await act(async () => { runtime.locale.setLocale("fr-FR"); });
    expect(screen.getAllByText("Langue")).toHaveLength(2);
  });

  it("uses the fallback of a localisable title no dictionary knows", () => {
    renderPreferences({ preferences: { panes: [definePreferencePane({ id: "billing", title: { key: "billing.title", fallback: "Billing" }, order: 600, view: () => null })] } });
    expect(screen.getByText("Billing")).toBeTruthy();
  });

  it("contains a failing pane behind the unavailable message while System Preferences stays up", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Broken = () => { throw new Error("boom"); };
    renderPreferences({ open: "broken", preferences: { panes: [definePreferencePane({ id: "broken", title: "Broken", order: 1, view: Broken })] } });
    expect(screen.getByText("This preference pane could not be loaded.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "System Preferences" })).toBeTruthy();
  });

  it("shows Unavailable for a failing summary and drops a failing accessory", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Broken = () => { throw new Error("boom"); };
    renderPreferences({ preferences: { panes: [definePreferencePane({ id: "broken", title: "Broken", order: 1, view: () => null, summary: Broken, accessory: Broken })] } });
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Broken")).toBeTruthy();
  });
});

describe("defineWebspring preferences", () => {
  function define(preferences?: unknown) {
    return defineWebspring({
      manifest: {
        schemaVersion: 1, bundleIdentifier: "com.example.test.preferences", version: "1.0.0", displayName: "Preferences",
        webspringShell: {
          views: [{ id: "board", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
          defaults: { desktop: "board", tablet: "board", mobile: "board" }, homeRoute: "/",
          branding: { name: { key: "site.name", fallback: "Fixture" } },
        },
      },
      components: { board: () => null },
      ...(preferences === undefined ? {} : { preferences: preferences as WebspringPreferencesOptions }),
    });
  }

  it("defaults to no panes and nothing hidden", () => {
    expect(define().preferences).toEqual({ panes: [], hide: [] });
  });

  it("captures panes and hidden ids immutably", () => {
    const billing = pane("billing", "Billing", 600);
    const hide = ["sounds"];
    const shell = define({ panes: [billing], hide });
    hide.push("motion");
    expect(shell.preferences.panes).toEqual([billing]);
    expect(shell.preferences.hide).toEqual(["sounds"]);
    expect(Object.isFrozen(shell.preferences)).toBe(true);
  });

  it.each([
    ["a pane not made with definePreferencePane", { panes: [{ id: "x", title: "x", order: 1, view: () => null }] }, /definePreferencePane/],
    ["duplicate pane ids", { panes: [pane("a", "A", 1), pane("a", "A again", 2)] }, /duplicate/],
    ["a blank hidden id", { hide: [" "] }, /hide/],
    ["unknown fields", { pane: [] }, /pane/],
    ["panes that are not an array", { panes: pane("a", "A", 1) }, /array/],
  ])("rejects %s", (_label, preferences, message) => {
    expect(() => define(preferences)).toThrow(message);
  });
});
