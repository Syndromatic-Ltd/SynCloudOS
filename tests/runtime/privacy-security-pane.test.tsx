// @vitest-environment jsdom
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

import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrivacyStore } from "../../src/SynCloudOS/Privacy";
import { PrivacySecurityPane } from "../../src/Webspring/PrivacySecurityPane";

const alice = { userId: "alice", appId: "com.example.one", service: "location" };
const names = { "com.example.one": "Example Maps" };
afterEach(cleanup);

describe("Privacy & Security preference pane", () => {
  it("explains an empty list and the browser permission boundary", () => {
    const store = createPrivacyStore({ runtimeId: "privacy-pane" });
    render(<PrivacySecurityPane store={store} userId="alice" applicationNames={names} />);
    expect(screen.getByText("No privacy requests yet")).toBeTruthy();
    expect(screen.getByText(/cannot grant browser permission/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });
  it("shows only the selected user's services with local and browser status", () => {
    const store = createPrivacyStore({ runtimeId: "privacy-pane" });
    store.setAuthorization(alice, "granted");
    store.forApplication(alice).observe("denied");
    store.setAuthorization({ userId: "bob", appId: "com.example.private", service: "camera" }, "granted");
    render(<PrivacySecurityPane store={store} userId="alice" applicationNames={names} />);
    const app = screen.getByRole("group", { name: "Example Maps" });
    expect(within(app).getByText("Location")).toBeTruthy();
    expect(within(app).getByText("App access: Allowed")).toBeTruthy();
    expect(within(app).getByText("Browser permission: Denied")).toBeTruthy();
    expect(screen.queryByText("com.example.private")).toBeNull();
    expect(screen.queryByText("Camera")).toBeNull();
    expect(screen.getByRole("switch", { name: "Allow Example Maps to use Location" }).getAttribute("aria-checked")).toBe("true");
  });
  it("uses live store updates rather than a copied preference state", () => {
    const store = createPrivacyStore({ runtimeId: "privacy-pane" });
    render(<PrivacySecurityPane store={store} userId="alice" applicationNames={names} />);
    act(() => store.setAuthorization(alice, "denied"));
    expect(screen.queryByText("No privacy requests yet")).toBeNull();
    expect(screen.getByText("App access: Denied")).toBeTruthy();
    act(() => store.setAuthorization(alice, "granted"));
    expect(screen.getByText("App access: Allowed")).toBeTruthy();
  });
  it("revokes a live resource with the real NSE switch and can reset the local choice", () => {
    const store = createPrivacyStore({ runtimeId: "privacy-pane" });
    store.setAuthorization(alice, "granted");
    const dispose = vi.fn();
    store.forApplication(alice).bindResource(dispose);
    render(<PrivacySecurityPane store={store} userId="alice" applicationNames={names} />);
    const toggle = screen.getByRole("switch", { name: "Allow Example Maps to use Location" });
    expect(toggle.className).toContain("nse-control-toggle");
    fireEvent.keyDown(toggle, { key: " " });
    expect(dispose).toHaveBeenCalledOnce();
    expect(store.forApplication(alice).authorizationStatus()).toBe("denied");
    const reset = screen.getByRole("button", { name: "Ask again for Example Maps: Location" });
    expect(reset.className).toContain("nse-control-button");
    fireEvent.click(reset);
    expect(store.forApplication(alice).authorizationStatus()).toBe("prompt");
    expect(screen.getByText("App access: Ask on next request")).toBeTruthy();
  });
  it("never changes browser permission when the app's local switch is enabled", () => {
    const store = createPrivacyStore({ runtimeId: "privacy-pane" });
    store.setAuthorization(alice, "denied");
    store.forApplication(alice).observe("denied");
    render(<PrivacySecurityPane store={store} userId="alice" applicationNames={names} />);
    fireEvent.keyDown(screen.getByRole("switch", { name: "Allow Example Maps to use Location" }), { key: " " });
    expect(store.getSnapshot()[0]?.decision).toBe("granted");
    expect(store.forApplication(alice).authorizationStatus()).toBe("denied");
    expect(screen.getByText("Browser permission: Denied")).toBeTruthy();
  });
  it("updates the visible user without leaking the prior user's rows", () => {
    const store = createPrivacyStore({ runtimeId: "privacy-pane" });
    store.setAuthorization(alice, "granted");
    store.setAuthorization({ userId: "bob", appId: "com.example.two", service: "camera" }, "denied");
    const view = render(<PrivacySecurityPane store={store} userId="alice" applicationNames={names} />);
    view.rerender(<PrivacySecurityPane store={store} userId="bob" applicationNames={names} />);
    expect(screen.queryByRole("group", { name: "Example Maps" })).toBeNull();
    expect(screen.getByRole("group", { name: "com.example.two" })).toBeTruthy();
    expect(screen.getByText("Camera")).toBeTruthy();
  });
});
