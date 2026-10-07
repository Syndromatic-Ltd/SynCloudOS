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
import { createBrowserIdentityCookieAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserIdentityCookieAdapter";

describe("identity cookie adapter boundary", () => {
  it("reads, writes, and removes cookies only through the injected browser port", async () => {
    let cookieString = "session=session%3Aone; theme=dark";
    const writes: string[] = [];
    const adapter = createBrowserIdentityCookieAdapter({
      read: () => cookieString,
      write: (value: string) => {
        writes.push(value);
        cookieString = value;
      },
    });

    await expect(adapter.read("session")).resolves.toBe("session:one");
    await adapter.write({ name: "session", value: "session:two", path: "/", sameSite: "lax", secure: true });
    expect(writes[0]).toContain("session=session%3Atwo");
    expect(writes[0]).toContain("SameSite=Lax");
    expect(writes[0]).toContain("Secure");
    await adapter.remove("session", { path: "/", sameSite: "lax", secure: true });
    expect(writes.at(-1)).toContain("Max-Age=0");
  });

  it("rejects unsafe names, values, and cross-site policy combinations", async () => {
    const adapter = createBrowserIdentityCookieAdapter({ read: () => "", write: () => undefined });
    await expect(adapter.write({ name: "bad;name", value: "one" })).rejects.toMatchObject({ code: "invalid-cookie-name" });
    await expect(adapter.write({ name: "session", value: "bad\nvalue" })).rejects.toMatchObject({ code: "invalid-cookie-value" });
    await expect(adapter.write({ name: "session", value: "one", sameSite: "none", secure: false })).rejects.toMatchObject({ code: "same-site-none-requires-secure" });
  });
});
