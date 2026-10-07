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

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import React from "react";
import { NSEFocusPortProvider, NSEOverlayProvider } from "../../src/NSE/NSE";
import { NSEMenu } from "../../src/NSE/Menus";
import { FocusScope, RuntimeInputBoundary, SynCloudOSProvider, useRuntimeNSEFocusPort, useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact";
import type { CommandDeclaration } from "../../src/SynCloudOS/Commands";
import { createTestRuntime } from "./helpers";

afterEach(cleanup);

const noPayload = {
  description: "No payload.",
  parse: (value: unknown) => value === undefined
    ? ({ ok: true as const, value: undefined })
    : ({ ok: false as const, issues: ["No payload is accepted."] }),
};

function command(id: string, responderId: string, execute = vi.fn(), options: Partial<CommandDeclaration<undefined, void>> = {}): CommandDeclaration<undefined, void> {
  return {
    id,
    responderId,
    title: { key: id, fallback: id },
    payload: noPayload,
    scope: "runtime",
    defaultKeyBindings: [{ key: "j", modifiers: ["primary"], scope: "runtime" }],
    undo: { kind: "none" },
    execute,
    ...options,
  };
}

function keydown(target: Element, key = "j") {
  const event = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("RuntimeInputBoundary", () => {
  it("stops local bubbling after synchronous shortcut acceptance", async () => {
    const runtime = createTestRuntime();
    const execute = vi.fn();
    const local = vi.fn();
    runtime.commands.register(command("runtime.accepted", "runtime", execute));
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary><button onKeyDown={local}>Accepted target</button></RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const event = keydown(screen.getByRole("button", { name: "Accepted target" }));
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(local).not.toHaveBeenCalled();
  });
  it("does not suppress browser fallback while asynchronous keyboard validation is unresolved", () => {
    const runtime = createTestRuntime();
    const execute = vi.fn();
    runtime.commands.register(command("editor.pending", "runtime", execute, {
      validate: () => new Promise(() => undefined),
    }));
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary><button>Editable fallback</button></RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const event = keydown(screen.getByRole("button", { name: "Editable fallback" }));
    expect(event.defaultPrevented).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("assigns a nested runtime its own keyboard event without outer interception", async () => {
    const outer = createTestRuntime({ id: "runtime:outer-input" });
    const inner = createTestRuntime({ id: "runtime:inner-input" });
    const outerExecute = vi.fn();
    const innerExecute = vi.fn();
    outer.commands.register(command("outer.command", "runtime", outerExecute));
    inner.commands.register(command("inner.command", "runtime", innerExecute));
    render(
      <SynCloudOSProvider runtime={outer}>
        <RuntimeInputBoundary>
          <SynCloudOSProvider runtime={inner}>
            <RuntimeInputBoundary><button>Nested runtime target</button></RuntimeInputBoundary>
          </SynCloudOSProvider>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const event = keydown(screen.getByRole("button", { name: "Nested runtime target" }));
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(innerExecute).toHaveBeenCalledTimes(1));
    expect(outerExecute).not.toHaveBeenCalled();
  });

  it("routes mounted application-owned keyboard events through the host runtime", async () => {
    const runtime = createTestRuntime();
    const execute = vi.fn();
    runtime.responders.register({ id: "app:mounted", kind: "application", parentId: "runtime", scopeId: "app:mounted" });
    runtime.commands.register(command("mounted.command", "app:mounted", execute, {
      scope: "application",
      defaultKeyBindings: [{ key: "m", modifiers: ["primary"], scope: "application" }],
    }));
    runtime.focus.requestFocus("app:mounted");
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          <div data-syncloudos-runtime-owner="app:mounted"><button>Mounted application target</button></div>
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const event = keydown(screen.getByRole("button", { name: "Mounted application target" }), "m");
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
  });

  it("retains a portalled FocusScope's logical command authority", async () => {
    const runtime = createTestRuntime();
    const portal = document.createElement("div");
    document.body.append(portal);
    const portalExecute = vi.fn();
    const backgroundExecute = vi.fn();
    runtime.responders.register({ id: "app", kind: "application", parentId: "runtime", scopeId: "root" });
    runtime.responders.register({ id: "background", kind: "control", parentId: "app", scopeId: "root" });
    runtime.commands.register(command("portal.command", "app", portalExecute, {
      scope: "application",
      defaultKeyBindings: [{ key: "z", modifiers: ["primary"], scope: "application" }],
    }));
    runtime.commands.register(command("background.command", "background", backgroundExecute, {
      scope: "focused",
      defaultKeyBindings: [{ key: "z", modifiers: ["primary"], scope: "focused" }],
    }));
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary>
          {createPortal(
            <FocusScope scopeId="portal:menu" kind="menu" parentResponderId="app">
              <button>Portal command target</button>
            </FocusScope>,
            portal,
          )}
        </RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );

    const event = keydown(screen.getByRole("button", { name: "Portal command target" }), "z");
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(portalExecute).toHaveBeenCalledTimes(1));
    expect(backgroundExecute).not.toHaveBeenCalled();
    portal.remove();
  });

  it("injects logical scope ownership into a generic NSE menu portal without coupling NSE to the runtime", async () => {
    const runtime = createTestRuntime();
    function RuntimeMenu() {
      const focusPort = useRuntimeNSEFocusPort("runtime");
      const overlayPort = useRuntimeNSEOverlayPort("runtime");
      return <NSEOverlayProvider runtimePort={overlayPort} defaultParentResponderId="runtime">
        <NSEFocusPortProvider port={focusPort}>
          <NSEMenu label="Scoped NSE menu" open items={[{ value: "one", label: "One" }]} />
        </NSEFocusPortProvider>
      </NSEOverlayProvider>;
    }
    render(
      <SynCloudOSProvider runtime={runtime}>
        <RuntimeInputBoundary><RuntimeMenu /></RuntimeInputBoundary>
      </SynCloudOSProvider>,
    );
    const menu = await screen.findByRole("menu");
    const scope = menu.closest<HTMLElement>("[data-syncloudos-focus-scope]");
    expect(scope?.dataset.syncloudosFocusScope).toMatch(/^nse-overlay:nse-item-menu:/);
    expect(scope?.dataset.syncloudosRuntimeOwner).toBe(runtime.runtimeId);
  });

  it("replaces an inherited outer-runtime NSE port inside a nested runtime", async () => {
    const outer = createTestRuntime({ id: "runtime:outer-port" });
    const inner = createTestRuntime({ id: "runtime:inner-port" });
    function InnerMenu() {
      const focusPort = useRuntimeNSEFocusPort("runtime");
      const overlayPort = useRuntimeNSEOverlayPort("runtime");
      return <NSEOverlayProvider runtimePort={overlayPort} defaultParentResponderId="runtime">
        <NSEFocusPortProvider port={focusPort}><NSEMenu label="Nested port menu" open items={[{ value: "one", label: "One" }]} /></NSEFocusPortProvider>
      </NSEOverlayProvider>;
    }
    function OuterHost() {
      const port = useRuntimeNSEFocusPort("runtime");
      return <NSEFocusPortProvider port={port}>
        <SynCloudOSProvider runtime={inner}><RuntimeInputBoundary><InnerMenu /></RuntimeInputBoundary></SynCloudOSProvider>
      </NSEFocusPortProvider>;
    }
    render(<SynCloudOSProvider runtime={outer}><RuntimeInputBoundary><OuterHost /></RuntimeInputBoundary></SynCloudOSProvider>);

    const menu = await screen.findByRole("menu");
    const scope = menu.closest<HTMLElement>("[data-syncloudos-focus-scope]");
    expect(scope?.dataset.syncloudosRuntimeOwner).toBe(inner.runtimeId);
    expect(inner.focus.inspect().scopes).toHaveLength(1);
    expect(outer.focus.inspect().scopes).toHaveLength(0);
  });
});
