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
import React from "react";
import { act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mountSynCloudOS, type MountedSynCloudOSHost } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring } from "../../src/Webspring/public";
import { SystemPanelsLayer } from "../../src/Webspring/SystemPanelsLayer";
import { WindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";

vi.mock("../../src/App", () => ({ App: () => <SystemPanelsLayer windowContentRegistry={new WindowContentRendererRegistry()} /> }));
vi.mock("../../src/NSE/NSE", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/NSE/NSE")>(),
  NSEFontPanel: ({ manager }: { manager: { availableFamilies: unknown } }) => <output data-testid="host-fonts">{JSON.stringify(manager.availableFamilies)}</output>,
}));

const shell = defineWebspring({ manifest: {
  schemaVersion: 1, bundleIdentifier: "com.example.host-fonts", displayName: "Host fonts", version: "1.0.0",
  webspringShell: { views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }], defaults: { desktop: "site", tablet: "site", mobile: "site" }, homeRoute: "/", branding: { name: { key: "site.name", fallback: "Host fonts" } } },
}, components: { site: () => null } });
const families = [{ id: "example", label: "Example Site Typeface", defaultPresetId: "example-regular", presets: [{ id: "example-regular", label: "Regular", familyId: "example", family: '"Example Site Typeface", sans-serif', weight: 400, style: "normal" as const }] }];
const hosts: MountedSynCloudOSHost[] = [];
const elements: HTMLElement[] = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await act(async () => { await host.dispose("test-cleanup"); });
  for (const element of elements.splice(0)) element.remove();
});
async function mount(fontFamilies?: typeof families) {
  window.history.replaceState(null, "", "/");
  const element = document.createElement("div"); document.body.append(element); elements.push(element);
  await act(async () => { hosts.push(await mountSynCloudOS({ element, shell, shellResources: { fontFamilies } })); });
  return element;
}
it("supplies the shared system panel with the host's arbitrary font metadata", async () => {
  const element = await mount(families);
  expect(JSON.parse(element.querySelector('[data-testid="host-fonts"]')!.textContent!)).toEqual(families);
});
it("keeps an unconfigured host empty instead of inheriting another site's catalogue", async () => {
  await mount(families);
  const previous = hosts.pop()!;
  await act(async () => { await previous.dispose("next-site"); });
  const element = await mount();
  expect(JSON.parse(element.querySelector('[data-testid="host-fonts"]')!.textContent!)).toEqual([]);
});
it("captures supplied font metadata so later caller mutations cannot change the panel", async () => {
  const input = structuredClone(families);
  const element = await mount(input);
  input[0]!.label = "Changed by caller";
  expect(JSON.parse(element.querySelector('[data-testid="host-fonts"]')!.textContent!)[0].label).toBe("Example Site Typeface");
});
it("rejects accessor font metadata without invoking the getter", async () => {
  let reads = 0;
  const input = structuredClone(families);
  Object.defineProperty(input[0], "label", { enumerable: true, get() { reads++; return "Invalid"; } });
  await expect(mount(input)).rejects.toThrow(/non-data|unsupported/);
  expect(reads).toBe(0);
});
