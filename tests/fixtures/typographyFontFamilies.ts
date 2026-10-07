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

import type { NSEFontFamily } from "../../src/NSE/Text/fontDescriptors";

/** Font metadata supplied by the test host; no framework font catalog. */
export const typographyFontFamilies: readonly NSEFontFamily[] = Object.freeze([
  Object.freeze({ id: "fixture.sans", label: "Fixture Sans", defaultPresetId: "fixture.sans.regular", presets: Object.freeze([
    Object.freeze({ id: "fixture.sans.regular", label: "Regular", familyId: "fixture.sans", family: '"Fixture Sans", sans-serif', weight: 400 }),
    Object.freeze({ id: "fixture.sans.bold-italic", label: "Bold Italic", familyId: "fixture.sans", family: '"Fixture Sans", sans-serif', weight: 700, style: "italic" as const }),
  ]) }),
  Object.freeze({ id: "fixture.serif", label: "Fixture Serif", defaultPresetId: "fixture.serif.regular", presets: Object.freeze([
    Object.freeze({ id: "fixture.serif.regular", label: "Regular", familyId: "fixture.serif", family: '"Fixture Serif", serif', weight: 400 }),
  ]) }),
]);
