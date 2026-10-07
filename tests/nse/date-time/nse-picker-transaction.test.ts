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

import { describe, expect, it } from "vitest";

import { createPickerTransaction, reducePickerTransaction } from "../../../src/NSE/DateTime/Pickers/pickerTransaction";

describe("picker transaction reducer", () => {
  it("keeps an immutable opening baseline across previews and restores it on cancel", () => {
    const opening = Object.freeze({ id: "opening" });
    const preview = Object.freeze({ id: "preview" });
    const begun = reducePickerTransaction(createPickerTransaction(opening), { type: "begin", value: opening });
    const previewed = reducePickerTransaction(begun, { type: "preview", value: preview });
    expect(previewed).toMatchObject({ opening, draft: preview, previewed: true, open: true });
    expect(reducePickerTransaction(previewed, { type: "cancel" })).toMatchObject({ opening: null, draft: opening, previewed: false, open: false });
  });

  it("accepts external replacement and clears the old transaction authority", () => {
    const initial = createPickerTransaction({ id: "first" });
    const begun = reducePickerTransaction(initial, { type: "begin", value: initial.draft });
    const replaced = reducePickerTransaction(begun, { type: "replace", value: { id: "external" } });
    expect(replaced).toEqual({ opening: { id: "external" }, hasOpening: true, draft: { id: "external" }, previewed: false, open: true });
  });
});
