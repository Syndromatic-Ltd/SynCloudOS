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
import { SystemUILayer } from "../../src/Webspring/SystemUILayer";
import type { OperationHandle } from "../../src/SynCloudOS/Operations/operationTypes";
import { createTestRuntime } from "./helpers";

afterEach(cleanup);

describe("SystemUILayer log-out confirmation", () => {
  it("cancels without logging out and confirms exactly one authoritative log-out command", async () => {
    const runtime = createTestRuntime();
    await runtime.boot({ initialPathname: "/" });
    const dispatch = vi.spyOn(runtime.commands, "dispatch");
    let confirmedLogOut: Promise<unknown> | null = null;
    render(
      <SynCloudOSProvider runtime={runtime}>
        <SystemUILayer onLogOut={async () => {
          confirmedLogOut = runtime.commands.dispatch("session.logOut", undefined, { source: "system" });
          const result = await confirmedLogOut;
          return result.status === "executed";
        }} />
      </SynCloudOSProvider>,
    );

    await act(async () => { await runtime.commands.dispatch("session.requestLogOut", undefined, { source: "menu" }); });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(runtime.statechart.getCurrentState()).not.toBe("locked.loginWindow");
    expect(dispatch.mock.calls.filter(([id]) => id === "session.logOut")).toHaveLength(0);

    await act(async () => { await runtime.commands.dispatch("session.requestLogOut", undefined, { source: "menu" }); });
    const confirmation = await screen.findByRole("alertdialog");
    expect(confirmation.closest<HTMLElement>("[data-syncloudos-focus-scope]")?.dataset.syncloudosFocusScope).toBe("system-ui:log-out");
    fireEvent.click(await screen.findByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(confirmedLogOut).not.toBeNull());
    let confirmedResult: unknown;
    await act(async () => { confirmedResult = await confirmedLogOut; });
    expect(confirmedResult).toMatchObject({ status: "executed" });
    expect(runtime.statechart.getCurrentState()).toBe("locked.loginWindow");
    expect(dispatch.mock.calls.filter(([id]) => id === "session.logOut")).toHaveLength(1);
  });

  it("keeps the confirmation open when the authoritative log-out operation is rejected", async () => {
    const runtime = createTestRuntime();
    const failedLogOut: OperationHandle<never> = {
      operationId: "logout:failed",
      correlationId: "logout:failed",
      signal: new AbortController().signal,
      cancel: () => undefined,
      result: Promise.resolve({
        status: "failed",
        committed: false,
        phase: "will",
        error: { code: "logout-rejected", name: "LogOutRejected", message: "Log out rejected", phase: "will" },
      }),
    };
    vi.spyOn(runtime, "logOut").mockReturnValue(failedLogOut);
    render(
      <SynCloudOSProvider runtime={runtime}>
        <SystemUILayer onLogOut={async () => (await runtime.commands.dispatch("session.logOut", undefined, { source: "system" })).status === "executed"} />
      </SynCloudOSProvider>,
    );

    await act(async () => { await runtime.commands.dispatch("session.requestLogOut", undefined, { source: "menu" }); });
    fireEvent.click(await screen.findByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(runtime.commands.inspect().history.at(-1)?.outcome).toBe("failed"));
    expect(runtime.systemUI.getSnapshot().logOutOpen).toBe(true);
    expect(runtime.statechart.getCurrentState()).not.toBe("locked.loginWindow");
  });
});
