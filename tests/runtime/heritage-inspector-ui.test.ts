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
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import * as view from "../../src/SynCloudOS/Inspector/InspectorView";
import { createInspectorProjection } from "../../src/SynCloudOS/Inspector/inspectorProjection";
import type { InspectorPanel, InspectorSource } from "../../src/SynCloudOS/Inspector/inspectorTypes";
import { createTestRuntime, registerTrustedTestSynWare } from "./helpers";
import diagnosticsManifest from "./diagnostics-fixture";
import { DevInspectorRegion } from "../../src/SynCloudOSReact/DevInspectorRegion";

afterEach(cleanup);
describe("live development Inspector", () => {
  it("loads the real trusted host session, localizes it and removes it on authority revocation", async () => {
    const runtime = createTestRuntime();
    registerTrustedTestSynWare(runtime, diagnosticsManifest, ["diagnostics"]);
    const mount = new AbortController();
    const mounted = render(createElement(DevInspectorRegion, { runtime, appId: "com.example.diagnostics", mountSignal: mount.signal, enabled: true }));
    try {
      await screen.findByRole("region", { name: "Development Inspector" });
      await act(async () => { runtime.locale.registerTranslations("synapps.diagnostics", "en-GB", { "inspector.title": "Live translated Inspector" }); });
      expect(screen.getByRole("region", { name: "Live translated Inspector" })).toBeTruthy();
      const presentation = await act(async () => runtime.presentationSettlements.begin({ operationId: "test", roles: ["route-outlet"], timeoutMs: 10000 }));
      fireEvent.click(within(screen.getByRole("navigation", { name: "Inspector views" })).getByRole("button", { name: "NSE", exact: true }));
      expect(screen.getByText("Awaiting: route-outlet")).toBeTruthy();
      await act(async () => { await runtime.apps.unregister("com.example.diagnostics"); });
      expect(screen.queryByRole("region", { name: "Live translated Inspector" })).toBeNull();
      presentation.cancel();
    } finally { mounted.unmount(); mount.abort(); await runtime.dispose(); }
  });
  it("exports the dedicated view", () => { expect(view.InspectorView).toBeTypeOf("function"); });
  it("uses NSE controls and refreshes labels and direction through the Diagnostics locale port", async () => {
    const client = createInspectorProjection({ runtimeId: "localized", now: () => 1, sources: [] });
    let language = "en-GB";
    const listeners = new Set<() => void>();
    const localization = {
      getSnapshot: () => ({ locale: language, direction: language === "ar" ? "rtl" as const : "ltr" as const, dictionaryVersion: 1 }),
      subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
      t: (key: string, fallback: string) => key === "inspector.title" && language === "ar" ? "Inspecteur localisé" : fallback,
    };
    const mounted = render(createElement(view.InspectorView, { client, localization }));
    expect(screen.getByRole("button", { name: "Pause capture" }).classList.contains("nse-control-button")).toBe(true);
    expect(screen.getByRole("region", { name: "Development Inspector" }).classList.contains("nse-container-pane")).toBe(true);
    await act(async () => { language = "ar"; listeners.forEach(fn => fn()); });
    expect(screen.getByRole("region", { name: "Inspecteur localisé" }).getAttribute("dir")).toBe("rtl");
    const first = within(screen.getByRole("navigation", { name: "Inspector views" })).getByRole("button", { name: "Runtime", exact: true });
    first.focus(); fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement?.textContent).toBe("Applications");
    mounted.unmount(); client.dispose(); expect(listeners.size).toBe(0);
  });
  it("links injected faults, paginates, pauses, resumes and exports sanitized live state", async () => {
    const listeners = new Set<() => void>();
    const records: Partial<Record<InspectorPanel, unknown[]>> = {
      Operations: [{ id: "op", correlationId: "navigation", kind: "route.transition", phase: "will", status: "pending" }],
      Transitions: [{ id: "t", operationId: "op", successorId: "next", kind: "route", status: "blocked" }],
      Routes: [{ id: "loader", operationId: "op", kind: "loader", status: "loading" }, { id: "error", kind: "route", status: "error" }],
      NSE: [{ id: "p", operationId: "op", kind: "presentation", status: "pending", pendingRoles: ["route-outlet"] }],
      Services: [{ id: "svc", kind: "service", status: "revoked", service: "SECRET_UI" }],
    };
    const sources = Object.keys(records).map(panel => ({ panel: panel as InspectorPanel,
      read: () => records[panel as InspectorPanel]!, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } } satisfies InspectorSource));
    const client = createInspectorProjection({ runtimeId: "ui", now: () => 1, sources });
    const mounted = render(createElement(view.InspectorView, { client, pageSize: 1 }));
    const select = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "Inspector views" })).getByRole("button", { name, exact: true }));
    select("Transitions"); expect(screen.getByText("blocked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^operation: / }));
    expect(screen.getByRole("heading", { name: "Operations" })).toBeTruthy();
    expect(screen.getByText("will")).toBeTruthy();
    expect(screen.getByRole("article")).toBe(document.activeElement);
    select("Routes"); expect(screen.getByText("loading")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" })); expect(screen.getByText("error")).toBeTruthy();
    select("NSE"); expect(screen.getByText(/Awaiting: route-outlet/)).toBeTruthy();
    select("Services"); expect(screen.getByText("revoked")).toBeTruthy();
    select("Transitions"); fireEvent.click(screen.getByRole("button", { name: "Pause capture" }));
    records.Transitions = [{ id: "t", operationId: "op", successorId: "next", kind: "route", status: "redirected" }];
    await act(async () => { listeners.forEach(fn => fn()); });
    expect(screen.getByText("blocked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume capture" }));
    expect(screen.getByText("redirected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Export sanitized snapshot" }));
    const content = (screen.getByRole("textbox", { name: "Sanitized snapshot JSON" }) as HTMLTextAreaElement).value;
    expect(content).toContain('"redirected"'); expect(content).not.toContain("SECRET_UI");
    select("FX"); expect(screen.getByText(/Unsupported by this owner/)).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Inspector views" });
    const first = within(nav).getByRole("button", { name: "Runtime", exact: true }); first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" }); expect(document.activeElement?.textContent).toBe("Applications");
    mounted.unmount(); client.dispose(); expect(listeners.size).toBe(0);
  });
});
