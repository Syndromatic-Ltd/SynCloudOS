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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact/SynCloudOSProvider";
import { useRuntimeSelector } from "../../src/SynCloudOSReact/runtimeHooks";
import { createTestRuntime } from "./helpers";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

const runtimes: SynCloudOSRuntime[] = [];
afterEach(async () => { cleanup(); for (const runtime of runtimes.splice(0)) await runtime.dispose({ reason: "selector test", inFlight: "cancel" }); });

it("recomputes a changed selector even when the runtime snapshot is unchanged", () => {
  const runtime = createTestRuntime(); runtimes.push(runtime);
  function Selected({ prefix }: { prefix: string }) {
    const value = useRuntimeSelector(snapshot => `${prefix}:${snapshot.application.activeAppId ?? "home"}`);
    return <output>{value}</output>;
  }
  const view = render(<SynCloudOSProvider runtime={runtime}><Selected prefix="first" /></SynCloudOSProvider>);
  const snapshot = runtime.store.getSnapshot();
  view.rerender(<SynCloudOSProvider runtime={runtime}><Selected prefix="second" /></SynCloudOSProvider>);
  expect(runtime.store.getSnapshot()).toBe(snapshot);
  expect(screen.getByRole("status").textContent).toBe("second:home");
});

it("keeps equal selections stable on unrelated store updates", () => {
  const runtime = createTestRuntime(); runtimes.push(runtime);
  const rendered = vi.fn();
  function Selected() {
    const value = useRuntimeSelector(snapshot => ({ appId: snapshot.application.activeAppId }), (left, right) => left.appId === right.appId);
    rendered(value);
    return <output>{value.appId ?? "home"}</output>;
  }
  render(<SynCloudOSProvider runtime={runtime}><Selected /></SynCloudOSProvider>);
  const before = rendered.mock.calls.length;
  const previousSnapshot = runtime.store.getSnapshot();
  act(() => runtime.store.mutate(draft => { draft.webspring.lowerShelfMode = "preview"; }));
  expect(runtime.store.getSnapshot()).not.toBe(previousSnapshot);
  expect(rendered).toHaveBeenCalledTimes(before);
});

it("preserves the committed selection while another selector render is suspended", () => {
  const runtime = createTestRuntime(); runtimes.push(runtime);
  const committed = vi.fn();
  const suspended = vi.fn();
  const pending = new Promise<void>(() => {});
  function Selected({ alternate }: { alternate: boolean }) {
    const value = useRuntimeSelector(snapshot => ({ value: alternate ? snapshot.webspring.lowerShelfMode : snapshot.application.activeAppId }), (left, right) => left.value === right.value);
    React.useEffect(() => { committed(value); }, [value]);
    if (alternate) { suspended(); throw pending; }
    return <output>{value.value ?? "home"}</output>;
  }
  function Parent() {
    const [alternate, setAlternate] = React.useState(false);
    return <><button onClick={() => React.startTransition(() => setAlternate(true))}>Switch</button><React.Suspense fallback="Loading"><Selected alternate={alternate} /></React.Suspense></>;
  }
  render(<SynCloudOSProvider runtime={runtime}><Parent /></SynCloudOSProvider>);
  expect(committed).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Switch" }));
  expect(suspended).toHaveBeenCalled();
  act(() => runtime.store.mutate(draft => { draft.webspring.lowerShelfMode = "preview"; }));
  expect(screen.getByRole("status").textContent).toBe("home");
  expect(committed).toHaveBeenCalledTimes(1);
});
