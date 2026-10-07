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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => { act(() => root.unmount()); host.remove(); });
  const render = (props: { staged: boolean; keyWindow: boolean }) => act(() => root.render(
    <AppViewChrome.Root zIndex={1} {...props}><p>app</p></AppViewChrome.Root>));
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

it("never takes focus another element holds, and ignores stages that are not key", () => {
  const input = document.createElement("input");
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
