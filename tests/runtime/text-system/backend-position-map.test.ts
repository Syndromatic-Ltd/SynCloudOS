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
import { Schema } from "@tiptap/pm/model";
import { createBackendPositionMap } from "../../../src/NSE/TextEditing/backends/backendPositionMap";

const schema = new Schema({ nodes: {
  doc: { content: "paragraph+" },
  paragraph: { content: "inline*", group: "block" },
  text: { group: "inline" },
  image: { inline: true, group: "inline", atom: true },
  hardBreak: { inline: true, group: "inline" },
}, marks: { bold: {} } });
const p = (...nodes: ReturnType<typeof schema.text>[]) => schema.node("paragraph", null, nodes);

describe("private backend position map", () => {
  it("maps structural paragraph positions independently of UTF-16 content offsets", () => {
    const doc = schema.node("doc", null, [p(schema.text("a😀")), p(), p(schema.text("xyz"))]);
    const map = createBackendPositionMap(doc);
    expect(map.text).toBe("a😀\n\nxyz");
    expect(map.toBackend(0)).toBe(1);
    expect(map.toBackend(3)).toBe(4);
    expect(map.toBackend(4)).toBe(6);
    expect(map.toBackend(5)).toBe(8);
    expect(map.toBackend(8)).toBe(11);
    for (let offset = 0; offset <= map.text.length; offset++) {
      expect(map.toSemantic(map.toBackend(offset))).toBe(offset);
    }
  });
  it("counts attachment atoms, hard breaks and mark-split runs without added markup offsets", () => {
    const doc = schema.node("doc", null, [p(schema.text("ab", [schema.mark("bold")]), schema.node("image"), schema.node("hardBreak"), schema.text("c"))]);
    const map = createBackendPositionMap(doc);
    expect(map.text).toBe("ab\uFFFC\nc");
    expect(map.toSemantic(4)).toBe(3);
    expect(map.toBackend(5)).toBe(6);
  });
  it("rejects invalid positions and unsupported non-text structures", () => {
    const map = createBackendPositionMap(schema.node("doc", null, [p()]));
    expect(() => map.toBackend(-1)).toThrow(RangeError);
    expect(() => map.toSemantic(3)).toThrow(RangeError);
    expect(() => map.toBackend(0.5)).toThrow(RangeError);
  });
});
