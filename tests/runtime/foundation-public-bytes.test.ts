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
import { NSEData } from "../../src/Foundation/NSEData";
import { Pasteboard } from "../../src/SynCloudOS/Pasteboard";
import { createInMemoryDocumentAssetStore } from "../../src/SynCloudOS/Documents/DocumentAssetStore";
import { createDocumentResourceService } from "../../src/SynCloudOS/Documents/DocumentResourceService";
import type { RuntimeOwnerToken } from "../../src/SynCloudOS/Runtime/runtimeOwner";

describe("public Foundation byte contracts", () => {
  it("captures convertible pasteboard data before yielding and delivers immutable data", async () => {
    const board = new Pasteboard("find");
    const bytes = new Uint8Array([1, 2, 3]);
    const write = board.write([{ type: "image/png", value: bytes }]);
    bytes[0] = 99;
    await write;
    const item = await board.readFirst(["image/png"]);
    expect(item?.value).toBeInstanceOf(NSEData);
    expect((item?.value as NSEData).bytes).toEqual(new Uint8Array([1, 2, 3]));
    board.dispose();
  });

  it("accepts data and array buffers in asset storage and delivers data", async () => {
    const store = createInMemoryDocumentAssetStore();
    const scope = { authorizationId: "app:a", documentId: "doc:a" };
    for (const bytes of [NSEData.from(new Uint8Array([1, 2])), new Uint8Array([1, 2]).buffer]) {
      const ref = await store.put(scope, { bytes, mimeType: "image/png" });
      const result = await store.read(scope, ref);
      expect(result).toBeInstanceOf(NSEData);
      expect(result.bytes).toEqual(new Uint8Array([1, 2]));
    }
    store.dispose();
  });

  it("reads resources as Foundation data without exposing a native byte port", async () => {
    const signal = new AbortController().signal;
    const service = createDocumentResourceService({ runtimeId: "runtime:a", ownerToken: {} as RuntimeOwnerToken,
      signal, randomUUID: () => crypto.randomUUID() });
    const descriptor = await service.acquire("doc:a", { type: "image/png", size: 2,
      data: async () => NSEData.from(new Uint8Array([4, 5])) }, signal);
    expect(service.resolve("doc:a", descriptor)).toBeInstanceOf(NSEData);
    expect(service.resolve("doc:a", descriptor)?.bytes).toEqual(new Uint8Array([4, 5]));
    service.release("doc:a", descriptor);
    expect(service.resolve("doc:a", descriptor)).toBeNull();
    service.dispose();
  });
});
