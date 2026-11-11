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
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { AppViewChrome } from "../../src/Webspring/AppViewChrome";
import { registerNSEFocusOrigin } from "../../src/NSE/Focus/focusOrigin";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
const runtimeOwner = "runtime:stage-focus";
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function mount(children: React.ReactNode = <p>app</p>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => { act(() => root.unmount()); host.remove(); });
  const render = (props: { staged: boolean; keyWindow: boolean }) => act(() => root.render(
    <AppViewChrome.Root zIndex={1} {...props} data-syncloudos-runtime-owner={runtimeOwner}>{children}</AppViewChrome.Root>));
  return { host, render, frame: () => host.querySelector<HTMLElement>(".webspring-app-view-frame")! };
}

it("focuses the key window once it is presented if nothing else holds focus", () => {
  const { render, frame } = mount();
  render({ staged: true, keyWindow: true });
  expect(frame().hasAttribute("inert")).toBe(true);
  expect(document.activeElement).toBe(document.body);
  render({ staged: false, keyWindow: true });
  expect(document.activeElement).toBe(frame());
});

it.each([undefined, "runtime:another"])("leaves external focus alone (owner %s) and ignores non-key stages", (owner) => {
  const input = document.createElement("input");
  if (owner) input.dataset.syncloudosRuntimeOwner = owner;
  document.body.append(input);
  cleanups.push(() => input.remove());
  input.focus();
  const first = mount();
  first.render({ staged: false, keyWindow: true });
  expect(document.activeElement).toBe(input);
  input.blur();
  const second = mount();
  second.render({ staged: false, keyWindow: false });
  expect(document.activeElement).toBe(document.body);
});

it("transfers launcher focus to the newly presented key stage", () => {
  const launcher = document.createElement("button");
  launcher.dataset.syncloudosRuntimeOwner = runtimeOwner;
  document.body.append(launcher);
  cleanups.push(() => launcher.remove());
  launcher.focus();
  const { render, frame } = mount();
  render({ staged: true, keyWindow: true });
  expect(document.activeElement).toBe(launcher);
  render({ staged: false, keyWindow: true });
  expect(document.activeElement).toBe(frame());
});

it.each(["inside", "portal"])("preserves the application's focused editor %s its frame", (placement) => {
  const { render, frame } = mount(<><button>Anchor</button><input /></>);
  render({ staged: false, keyWindow: false });
  let input = frame().querySelector("input")!;
  if (placement === "portal") {
    const portal = document.createElement("div");
    portal.dataset.syncloudosRuntimeOwner = runtimeOwner;
    input = document.createElement("input");
    portal.append(input);
    document.body.append(portal);
    const unregister = registerNSEFocusOrigin(portal, frame().querySelector("button"));
    cleanups.push(() => { unregister(); portal.remove(); });
  }
  input.focus();
  render({ staged: false, keyWindow: true });
  expect(document.activeElement).toBe(input);
});
