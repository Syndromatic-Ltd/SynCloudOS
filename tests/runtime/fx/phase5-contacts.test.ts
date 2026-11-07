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

import { describe, expect, it, vi } from "vitest";
import { BrowserContactsAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserContactsAdapter";
import { createMountedContactsClient } from "../../../src/SynCloudOS/AppSDK/mountedContactsClient";
import { CNFXContactPickerViewController } from "../../../src/FX/ContactsFX/public";

describe("ContactsFX per-request browser picker", () => {
  it("presents the named browser picker controller and freezes request fields", async () => {
    const select = vi.fn(async () => [{ name: ["Ada"] }]);
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    const properties: ("name" | "email")[] = ["name"];
    const controller = new CNFXContactPickerViewController(store, { properties });
    properties.push("email");
    const selected = await controller.present();
    expect(selected[0]!.displayNames).toEqual(["Ada"]);
    expect(select).toHaveBeenCalledWith(["name"], { multiple: false });
    controller.dispose();
    await expect(controller.present()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("promptly cancels picker controller work while the browser dialog remains pending", async () => {
    let finish!: (value: { name: string[] }[]) => void;
    const select = () => new Promise<{ name: string[] }[]>(resolve => { finish = resolve; });
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    const controller = new CNFXContactPickerViewController(store);
    const selected = controller.present().catch(error => error);
    controller.dispose();
    expect((await selected).name).toBe("AbortError");
    finish([{ name: ["late"] }]);
  });
  it("inspects capability and authorization without selecting contacts", async () => {
    const select = vi.fn();
    const adapter = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } });
    const store = adapter.createContactStore();
    expect(adapter.getCapabilities().contactPicker).toBe(true);
    expect(await store.getAuthorizationStatus()).toBe("prompt");
    expect(select).not.toHaveBeenCalled();
  });
  it("returns immutable copies and keeps authorization scoped to each picker request", async () => {
    const names = ["Ada"]; const select = vi.fn(async () => [{ name: names, email: ["ada@example.test"], tel: ["123"] }]);
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    const contacts = await store.requestAccess({ properties: ["name", "email", "tel"], multiple: true });
    names[0] = "changed";
    expect(contacts[0]!.displayNames).toEqual(["Ada"]);
    expect(Object.isFrozen(contacts)).toBe(true);
    expect(Object.isFrozen(contacts[0]!.displayNames)).toBe(true);
    expect(select).toHaveBeenCalledWith(["name", "email", "tel"], { multiple: true });
    expect(await store.getAuthorizationStatus()).toBe("prompt");
  });
  it("cancels locally and ignores picker completion after disposal", async () => {
    let finish!: (value: readonly { name: string[] }[]) => void;
    const select = () => new Promise<readonly { name: string[] }[]>(resolve => { finish = resolve; });
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    const result = store.requestAccess().catch(error => error);
    store.dispose(); finish([{ name: ["late"] }]);
    expect((await result).name).toBe("AbortError");
    expect(await store.getAuthorizationStatus()).toBe("unavailable");
  });
  it("maps picker denial and cancellation without claiming persistent grants", async () => {
    const select = vi.fn().mockRejectedValueOnce(new DOMException("denied", "NotAllowedError")).mockRejectedValueOnce(new DOMException("cancelled", "AbortError"));
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    await expect(store.requestAccess()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(await store.getAuthorizationStatus()).toBe("prompt");
    await expect(store.requestAccess()).rejects.toMatchObject({ name: "AbortError" });
  });
  it("checks declaration and policy at each request and ignores late mounted results", async () => {
    const select = vi.fn(async () => []); let permissions: readonly string[] = [];
    const mount = new AbortController();
    const adapter = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } });
    const client = createMountedContactsClient(adapter, mount.signal, () => permissions, () => true);
    const store = client.createContactStore();
    await expect(store.requestAccess()).rejects.toMatchObject({ name: "SecurityError" });
    expect(select).not.toHaveBeenCalled();
    permissions = ["contacts.select"];
    await expect(store.requestAccess()).resolves.toEqual([]);
    mount.abort();
    expect(client.getCapabilities().contactPicker).toBe(false);
    expect(await store.getAuthorizationStatus()).toBe("unavailable");
  });
  it("does not open a picker when insecure, absent or request-aborted", async () => {
    const select = vi.fn();
    const adapter = new BrowserContactsAdapter({ isSecureContext: false, browserNavigator: { contacts: { select } } });
    expect(adapter.getCapabilities().contactPicker).toBe(false);
    await expect(adapter.createContactStore().requestAccess()).rejects.toMatchObject({ name: "NotSupportedError" });
    const absent = createMountedContactsClient(undefined, new AbortController().signal, () => [], () => true);
    expect(await absent.createContactStore().getAuthorizationStatus()).toBe("unavailable");
    expect(select).not.toHaveBeenCalled();
  });
  it("cancels individual requests and removes late browser values", async () => {
    let finish!: (value: { name: string[] }[]) => void;
    const select = vi.fn(() => new Promise<{ name: string[] }[]>(resolve => { finish = resolve; }));
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    const signal = new AbortController();
    const selected = store.requestAccess({ signal: signal.signal }).catch(error => error);
    await expect(store.requestAccess()).rejects.toMatchObject({ name: "InvalidStateError" });
    signal.abort(); finish([{ name: ["late"] }]);
    expect((await selected).name).toBe("AbortError");
    const alreadyAborted = new AbortController(); alreadyAborted.abort();
    await expect(store.requestAccess({ signal: alreadyAborted.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(select).toHaveBeenCalledOnce();
  });
  it("copies only the fields explicitly selected and rejects empty field requests", async () => {
    const select = vi.fn(async () => [{ name: ["Ada"], email: ["hidden@example.test"] }]);
    const store = new BrowserContactsAdapter({ isSecureContext: true, browserNavigator: { contacts: { select } } }).createContactStore();
    const contacts = await store.requestAccess({ properties: ["name"] });
    expect(contacts[0]!.emailAddresses).toEqual([]);
    await expect(store.requestAccess({ properties: [] })).rejects.toBeInstanceOf(TypeError);
    expect(select).toHaveBeenCalledOnce();
  });
});
