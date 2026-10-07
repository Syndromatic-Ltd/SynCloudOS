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

import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { NSETextView, TextEditingSession, createUndoableNSETextOwner, attributedContent, paragraph, textRun } from "@syndromatic/syncloudos/nse/text";
const owner = createUndoableNSETextOwner({ flowId: "body", content: attributedContent([paragraph([textRun("Hello 👩‍💻 café")]), paragraph([textRun("Second paragraph")])]) });
const first = new TextEditingSession({ id: "first", owner, history: owner.history });
const second = new TextEditingSession({ id: "second", owner, history: owner.history });
function App() {
  const snapshot = useSyncExternalStore(first.subscribe, first.getSnapshot);
  return <main><h1>Framework text editing</h1><NSETextView session={first} label="First text view" onInputError={error => { document.querySelector("#error")!.textContent = String(error); }} /><NSETextView session={second} label="Second text view" /><button onClick={() => { first.select(0, 5); first.applyAttributes({ bold: true }); }}>Format first word</button><button onClick={() => void first.requestHistory("undo")}>Undo</button><button onClick={() => void first.requestHistory("redo")}>Redo</button><button onClick={() => first.setEditable(!snapshot.editable)}>Toggle read only</button><output id="canonical">{snapshot.model.text}</output><output id="revision">{snapshot.model.revision}</output><output id="error" role="status" /></main>;
}
createRoot(document.getElementById("root")!).render(<App />);
