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
import { afterEach, expect, it } from "vitest";
import { isWithinNSEFocusOrigin, registerNSEFocusOrigin, registerNSEInspectorOrigin, resolveNSEFocusReturnTarget } from "../../src/NSE/Focus/focusOrigin";

afterEach(() => document.body.replaceChildren());

it("follows nested inspector origins, retargets shared panels and rejects stale or cyclic origins", () => {
  const editor = document.createElement("section");
  const well = document.createElement("button");
  editor.append(well);
  const panel = document.createElement("section");
  const picker = document.createElement("button");
  panel.append(picker);
  const menu = document.createElement("section");
  const unrelated = document.createElement("button");
  document.body.append(editor, panel, menu, unrelated);
  const releasePanel = registerNSEInspectorOrigin(panel, well);
  const releaseMenu = registerNSEFocusOrigin(menu, picker);
  expect(isWithinNSEFocusOrigin(editor, menu)).toBe(true);
  expect(resolveNSEFocusReturnTarget(menu)).toBe(picker);
  expect(resolveNSEFocusReturnTarget(picker)).toBe(picker);
  expect(isWithinNSEFocusOrigin(editor, unrelated)).toBe(false);
  well.remove();
  expect(isWithinNSEFocusOrigin(editor, menu)).toBe(false);
  editor.append(well);
  const releaseNewOrigin = registerNSEInspectorOrigin(panel, unrelated);
  releasePanel(); // An old origin's cleanup cannot remove a replacement.
  expect(isWithinNSEFocusOrigin(editor, menu)).toBe(false);
  expect(isWithinNSEFocusOrigin(document.body, menu)).toBe(true);
  releaseNewOrigin();
  const releaseCycle = registerNSEInspectorOrigin(panel, picker);
  expect(isWithinNSEFocusOrigin(editor, menu)).toBe(false);
  releaseCycle();
  releaseMenu();
});
