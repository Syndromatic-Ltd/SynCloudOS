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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { defineWebspring } from "../../src/Webspring/public";
import { WebspringHost } from "../../src/Webspring/WebspringHost";
import { createTestBundle, createTestRuntime } from "./helpers";

// Canvas decoration is unrelated to the real host, command and launch path under test.
const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => {
  cleanup();
  for (const runtime of runtimes.splice(0)) await runtime.dispose("switcher-auth-test");
});
const shell = defineWebspring({
  manifest: {
    schemaVersion: 1, bundleIdentifier: "com.example.test.switcher-host", version: "1.0.0", displayName: "Switcher host",
    webspringShell: {
      views: [{ id: "main", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "main", tablet: "main", mobile: "main" }, homeRoute: "/",
      branding: { name: { key: "host.name", fallback: "Switcher fixture" } },
    },
  },
  components: { main: ({ applicationOutlet }) => <main>{applicationOutlet}</main> },
});
async function mountHost(authentication: "disabled" | "optional" | "required", startupPhase?: "complete", initialPathname = authentication === "required" ? "/" : "/alpha") {
  const runtime = createTestRuntime({ authenticationPolicy: authentication, initialBundles: [
    createTestBundle({ bundleIdentifier: "com.example.alpha", route: "/alpha", policy: { public: true } }),
    createTestBundle({ bundleIdentifier: "com.example.beta", route: "/beta", policy: { public: true } }),
  ] });
  runtimes.push(runtime);
  await runtime.boot({ initialPathname });
  render(<SynCloudOSProvider runtime={runtime}><WebspringHost shell={shell} authentication={authentication} startupPhase={startupPhase} /></SynCloudOSProvider>);
  expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
  return runtime;
}

describe("WebspringHost anonymous switcher availability", () => {
  it.each([
    ["disabled", "complete"], ["optional", "complete"], ["disabled", undefined], ["optional", undefined],
  ] as const)("opens QuickSwitch and switches public apps with %s authentication and startup %s", async (authentication, startupPhase) => {
    const runtime = await mountHost(authentication, startupPhase);
    const transitions: unknown[] = [];
    const unsubscribe = runtime.store.subscribe(() => {
      const transition = runtime.store.getSnapshot().application.multiSwitch;
      if (transition.status === "switching") transitions.push(transition);
    });
    try {
      fireEvent.click(await screen.findByRole("button", { name: "Open QuickSwitch" }));
      expect(await screen.findByRole("dialog", { name: "QuickSwitch" })).toBeTruthy();
      fireEvent.click(screen.getByRole("option", { name: /^Beta,/ }));
      await waitFor(() => expect(runtime.store.getSnapshot().application.activeAppId).toBe("com.example.beta"));
      expect(transitions).toEqual(expect.arrayContaining([expect.objectContaining({
        status: "switching", fromAppId: "com.example.alpha", toAppId: "com.example.beta",
      })]));
      expect(runtime.store.getSnapshot().loginServices.isAuthorised).toBe(false);
    } finally { unsubscribe(); }
  });

  it("blocks optional anonymous switching while its login gate is presented", async () => {
    const runtime = await mountHost("optional", "complete", "/");
    await act(async () => { runtime.statechart.gotoState("locked.loginWindow"); });
    expect(runtime.store.getSnapshot().statechart.currentState).toBe("locked.loginWindow");
    await act(async () => { runtime.events.publish("webspring.quickSwitch.toggle", { source: "command" }, "QuickSwitch"); });
    expect(screen.queryByRole("dialog", { name: "QuickSwitch" })).toBeNull();
    expect(runtime.store.getSnapshot().application.multiSwitch.status).not.toBe("switching");
  });

  it("keeps QuickSwitch closed for a required unauthenticated host", async () => {
    const runtime = await mountHost("required", "complete");
    await act(async () => { runtime.events.publish("webspring.quickSwitch.toggle", { source: "command" }, "QuickSwitch"); });
    expect(screen.queryByRole("dialog", { name: "QuickSwitch" })).toBeNull();
    expect(runtime.store.getSnapshot().application.multiSwitch.status).not.toBe("switching");
  });
});


describe("Webspring application outlet transport", () => {
  it("respects a successor layout's focus and never revives a removed handoff target", async () => {
    let phase="narrow";
    const movingShell=defineWebspring({...shell,components:{main:({applicationOutlet})=>phase==="hidden"?<article/>:phase==="wide"?<section><button autoFocus>New layout focus</button>{applicationOutlet}</section>:<main>{applicationOutlet}</main>}});
    const runtime=createTestRuntime();runtimes.push(runtime);await runtime.boot();
    const ui=()=> <SynCloudOSProvider runtime={runtime}><WebspringHost shell={movingShell} authentication="disabled" startupPhase="complete" /></SynCloudOSProvider>;
    const view=render(ui());const container=document.querySelector<HTMLElement>(".webspring-application-outlet-host")!;
    const input=document.createElement("input");container.appendChild(input);input.focus();phase="wide";view.rerender(ui());expect(document.activeElement).toBe(screen.getByRole("button",{name:"New layout focus"}));
    input.focus();phase="hidden";view.rerender(ui());input.remove();phase="wide";view.rerender(ui());expect(input.isConnected).toBe(false);expect(document.activeElement).toBe(screen.getByRole("button",{name:"New layout focus"}));
  });
  it("retains focus, input selection and native selection when the shell relocates its live outlet", async () => {
    let wide = false;
    const movingShell = defineWebspring({ ...shell, components: { main: ({ applicationOutlet }) => wide
      ? <section><aside>{applicationOutlet}</aside></section> : <main>{applicationOutlet}</main> } });
    const runtime = createTestRuntime();runtimes.push(runtime);await runtime.boot();
    const ui = () => <SynCloudOSProvider runtime={runtime}><WebspringHost shell={movingShell} authentication="disabled" startupPhase="complete" /></SynCloudOSProvider>;
    const view = render(ui());
    const container = document.querySelector<HTMLElement>(".webspring-application-outlet-host")!;
    const input = document.createElement("input");input.value = "Generated local draft";container.appendChild(input);input.focus();input.setSelectionRange(2,7);
    for (const value of [true,false,true]) {
      wide=value;view.rerender(ui());expect(input.isConnected).toBe(true);expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd]).toEqual([2,7]);
    }
    const editor = document.createElement("div");editor.contentEditable="true";editor.tabIndex=0;const text=document.createTextNode("Retained text selection");editor.appendChild(text);container.appendChild(editor);editor.focus();document.getSelection()!.setBaseAndExtent(text,2,text,8);
    wide=false;view.rerender(ui());expect(document.activeElement).toBe(editor);expect(document.getSelection()!.anchorNode).toBe(text);expect(document.getSelection()!.anchorOffset).toBe(2);expect(document.getSelection()!.focusNode).toBe(text);expect(document.getSelection()!.focusOffset).toBe(8);
  });
});
