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
import { createInMemoryNSETextOwner, attributedContent, paragraph, textRun } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
const content = (text: string) => attributedContent([paragraph([textRun(text)])]);
describe("retained text target lifetime", () => {
  it("maps a retained semantic target through another view's edit", () => {
    const owner = createInMemoryNSETextOwner({ content: content("hello") });
    const session = new TextEditingSession({ id: "origin", textOwner: owner, documentId: "doc" });
    session.select(1, 4); const target = session.captureTarget();
    owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 0 }, content: content("!") }] });
    expect(session.resolveTarget(target)?.range).toEqual({ location: 2, length: 3 });
    session.select(0, 0); expect(session.resolveTarget(target)).toBeNull();
  });
  it("rejects foreign flow, owner revocation and deleted selection", () => {
    const owner = createInMemoryNSETextOwner({ content: content("hello"), flowId: "one" });
    const session = new TextEditingSession({ id: "origin", textOwner: owner });
    session.select(1, 4); const target = session.captureTarget();
    expect(session.resolveTarget({ ...target, flowId: "two" })).toBeNull();
    owner.commit({ expectedRevision: 0, operations: [{ kind: "replace", range: { location: 0, length: 5 }, content: content("") }] });
    expect(session.resolveTarget(target)).toBeNull();
    session.dispose(); expect(session.resolveTarget(session.captureTarget())).toBeNull();
  });
});
