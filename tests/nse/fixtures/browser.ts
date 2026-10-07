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

import { afterEach, beforeEach, vi } from "vitest";

/** jsdom has no layout/scroll implementation; keep this capability local to NSE suites. */
export function installNSEScrollIntoViewFixture() {
  let original: PropertyDescriptor | undefined;
  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    if (!original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });
}
