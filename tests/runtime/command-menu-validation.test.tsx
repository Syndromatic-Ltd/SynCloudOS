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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { NSEMenu } from "../../src/NSE/Menus/NSEMenu";
import { NSEOverlayProvider } from "../../src/NSE/Overlays";
import type { CommandDeclaration } from "../../src/SynCloudOS/Commands";
import { SynCloudOSProvider, useCommandMenuItems, useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";

const noPayload = { description: "none", parse: (value: unknown) => value === undefined ? { ok: true as const, value: undefined } : { ok: false as const, issues: ["none"] } };
const command = (validate: CommandDeclaration<undefined, void>["validate"]): CommandDeclaration<undefined, void> => ({
  id: "menu.test", responderId: "runtime", title: { key: "menu.test", fallback: "Original" }, payload: noPayload,
  scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" }, validate, execute: () => {},
});

function TestMenu({ open }: { open: boolean }) {
  const menu = useCommandMenuItems([
    { key: "action", commandId: "menu.test", label: "Original" },
    { key: "separator", separator: true },
    { key: "parent", label: "Parent", children: [{ key: "custom", label: "Custom" }] },
  ], open);
  return <NSEMenu label="Actions" open={open} items={[...menu.items]} onSelect={(value) => { void menu.dispatch(value); }} />;
}

function RuntimeOverlayHost({ children }: { children: React.ReactNode }) {
  const runtimePort = useRuntimeNSEOverlayPort("runtime");
  return <NSEOverlayProvider runtimePort={runtimePort} defaultParentResponderId="runtime">{children}</NSEOverlayProvider>;
}

afterEach(cleanup);

describe("command menu validation", () => {
  it("does not let a replaced declaration execute through an older presentation", async () => {
    const runtime = createTestRuntime();
    const oldExecute = vi.fn();
    const newExecute = vi.fn();
    const registration = runtime.commands.register({ ...command(() => ({ enabled: true })), execute: oldExecute });
    let dispatch!: () => Promise<unknown>;
    function Probe() {
      const menu = useCommandMenuItems([{ key: "action", commandId: "menu.test" }], true);
      dispatch = () => menu.dispatch("action");
      return <span>{menu.items[0]?.disabled ? "disabled" : "enabled"}</span>;
    }
    render(<SynCloudOSProvider runtime={runtime}><Probe /></SynCloudOSProvider>);
    await screen.findByText("enabled");
    registration.dispose();
    runtime.commands.register({ ...command(() => ({ enabled: true })), execute: newExecute });

    await expect(dispatch()).resolves.toMatchObject({ status: "cancelled" });
    expect(oldExecute).not.toHaveBeenCalled();
    expect(newExecute).not.toHaveBeenCalled();
  });
  it("refreshes live presentation for every opening and skips non-command rows", async () => {
    const runtime = createTestRuntime();
    const validate = vi.fn()
      .mockResolvedValueOnce({ enabled: false, disabledReason: "Save the document before undoing." })
      .mockResolvedValueOnce({ enabled: true, title: { key: "undo", fallback: "Undo Typing" } });
    runtime.commands.register(command(validate));
    function PresentationProbe({ open }: { open: boolean }) {
      const menu = useCommandMenuItems([
        { key: "action", commandId: "menu.test", label: "Original" },
        { key: "separator", separator: true },
        { key: "parent", label: "Parent", children: [{ key: "custom", label: "Custom" }] },
      ], open);
      const action = menu.items.find((item) => item.value === "action");
      return <>
        <button disabled={action?.disabled}>{action?.label}</button>
        {action?.disabledReason ? <span>{action.disabledReason}</span> : null}
      </>;
    }
    const view = render(<SynCloudOSProvider runtime={runtime}><PresentationProbe open /></SynCloudOSProvider>);
    expect(await screen.findByRole("button", { name: "Original" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Save the document before undoing.")).toBeTruthy();
    view.rerender(<SynCloudOSProvider runtime={runtime}><PresentationProbe open={false} /></SynCloudOSProvider>);
    await act(async () => {});
    view.rerender(<SynCloudOSProvider runtime={runtime}><PresentationProbe open /></SynCloudOSProvider>);
    expect(await screen.findByRole("button", { name: "Undo Typing" })).toHaveProperty("disabled", false);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it("does not let stale asynchronous validation overwrite a newer opening", async () => {
    const runtime = createTestRuntime();
    let release!: (value: { enabled: boolean; title: { key: string; fallback: string } }) => void;
    const stale = new Promise<{ enabled: boolean; title: { key: string; fallback: string } }>((resolve) => { release = resolve; });
    const validate = vi.fn().mockReturnValueOnce(stale).mockResolvedValueOnce({ enabled: true, title: { key: "new", fallback: "New" } });
    runtime.commands.register(command(validate));
    const view = render(<SynCloudOSProvider runtime={runtime}><RuntimeOverlayHost><TestMenu open /></RuntimeOverlayHost></SynCloudOSProvider>);
    view.rerender(<SynCloudOSProvider runtime={runtime}><RuntimeOverlayHost><TestMenu open={false} /></RuntimeOverlayHost></SynCloudOSProvider>);
    await act(async () => {});
    view.rerender(<SynCloudOSProvider runtime={runtime}><RuntimeOverlayHost><TestMenu open /></RuntimeOverlayHost></SynCloudOSProvider>);
    expect(await screen.findByRole("menuitem", { name: "New" })).toHaveProperty("disabled", false);
    release({ enabled: true, title: { key: "old", fallback: "Old" } });
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Old" })).toBeNull());
  });

  it("revalidates the current opening when portal focus makes its first batch stale", async () => {
    const runtime = createTestRuntime();
    const validate = vi.fn()
      .mockImplementationOnce(() => {
        runtime.focus.requestFocus("runtime");
        return Promise.resolve({ enabled: true, title: { key: "settling", fallback: "Settling" } });
      })
      .mockResolvedValueOnce({ enabled: true, title: { key: "settled", fallback: "Settled" } });
    runtime.commands.register(command(validate));

    render(<SynCloudOSProvider runtime={runtime}><RuntimeOverlayHost><TestMenu open /></RuntimeOverlayHost></SynCloudOSProvider>);

    expect(await screen.findByRole("menuitem", { name: "Settled" })).toHaveProperty("disabled", false);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it("keeps repeated command payloads keyed, hides hidden leaves, and blocks disabled dispatch", async () => {
    const runtime = createTestRuntime();
    const execute = vi.fn();
    runtime.commands.register({
      id: "menu.payload", responderId: "runtime", title: { key: "payload", fallback: "Payload" },
      payload: { description: "variant", parse: (value) => typeof (value as { variant?: unknown } | null)?.variant === "string" ? { ok: true, value: value as { variant: string } } : { ok: false, issues: ["variant"] } },
      scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" },
      validate: ({ payload }) => payload.variant === "hidden" ? { enabled: true, hidden: true } : { enabled: payload.variant !== "disabled", title: { key: payload.variant, fallback: payload.variant } },
      execute,
    });
    function PayloadMenu() {
      const menu = useCommandMenuItems([
        { key: "first", commandId: "menu.payload", payload: { variant: "First" } },
        { key: "second", commandId: "menu.payload", payload: { variant: "Second" } },
        { key: "hidden", commandId: "menu.payload", payload: { variant: "hidden" } },
        { key: "disabled", commandId: "menu.payload", payload: { variant: "disabled" } },
      ], true);
      return <NSEMenu label="Payloads" open items={[...menu.items]} onSelect={(value) => { void menu.dispatch(value); }} />;
    }
    render(<SynCloudOSProvider runtime={runtime}><RuntimeOverlayHost><PayloadMenu /></RuntimeOverlayHost></SynCloudOSProvider>);
    expect(await screen.findByRole("menuitem", { name: "First" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Second" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "hidden" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "disabled" }));
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not bypass a disabled presentation when a host dispatches the menu value directly", async () => {
    const runtime = createTestRuntime();
    const execute = vi.fn();
    const results: string[] = [];
    runtime.commands.register({
      id: "menu.direct-disabled", responderId: "runtime", title: { key: "direct", fallback: "Direct" }, payload: noPayload,
      scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" },
      validate: vi.fn()
        .mockResolvedValueOnce({ enabled: false, disabledReason: "Unavailable in this app." })
        .mockResolvedValueOnce({ enabled: true }),
      execute,
    });
    function DirectDispatchProbe() {
      const menu = useCommandMenuItems([{ key: "disabled", commandId: "menu.direct-disabled" }], true);
      return <button data-disabled={String(menu.items[0]?.disabled)} onClick={() => { void menu.dispatch("disabled").then((result) => results.push(result.status)); }}>Dispatch</button>;
    }
    render(<SynCloudOSProvider runtime={runtime}><DirectDispatchProbe /></SynCloudOSProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Dispatch" }).getAttribute("data-disabled")).toBe("true"));
    fireEvent.click(screen.getByRole("button", { name: "Dispatch" }));
    await waitFor(() => expect(results).toEqual(["disabled"]));
    expect(execute).not.toHaveBeenCalled();
  });
});
