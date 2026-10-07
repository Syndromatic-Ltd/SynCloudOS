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

import { parseAttributedContent, plainNSETextContent, type NSEAttributedContent } from "../../../src/NSE/Text";
import { TextEditingSession } from "../../../src/NSE/TextEditing/TextEditingSession";
import { NSETextCommands, registerNSETextCommands } from "../../../src/NSE/TextEditing/textCommands";
import { createSynWareContextValue } from "../../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import { createSynWareNSETextOwner } from "../../../src/SynCloudOS/AppSDK/SynWareTextAdapter";
import { InMemoryDocumentAdapter } from "../../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import type { DocumentType } from "../../../src/SynCloudOS/Documents/documentTypes";
import type { CommandDeclaration } from "../../../src/SynCloudOS/Commands/commandTypes";
import type { NSETextClipboardPort } from "../../../src/NSE/TextEditing/textClipboard";
import { authoriseTestRuntime, createTestRuntime, createTestRuntimeEnvironment, mountTestSynWareRuntime, registerTestSynWare } from "../helpers";

export interface CurrentTextTestModel { readonly title: string; readonly content: NSEAttributedContent }

// Application test policy: a native document embeds a portable text flow.
// This fixture composes existing capabilities; it does not provide an editor API.
const type: DocumentType<CurrentTextTestModel> = {
  id: "test.current-text", displayName: "Test text", schemaVersion: 1,
  extensions: ["currenttext"], mimeTypes: ["application/x-test-current-text+json"],
  capabilities: { versions: true, conflicts: true }, autosave: "disabled",
  create: () => ({ title: "Test", content: plainNSETextContent("") }),
  read: serialized => ({ ...serialized }), write: model => ({ ...model }),
  validate(value): value is CurrentTextTestModel {
    try {
      if (!value || typeof value !== "object" || typeof (value as CurrentTextTestModel).title !== "string") return false;
      parseAttributedContent((value as CurrentTextTestModel).content); return true;
    } catch { return false; }
  },
};

export async function currentTextDocumentFixture(
  initial: string | NSEAttributedContent = "Cloud",
  options: { readonly clipboard?: NSETextClipboardPort; readonly runtimeOptions?: Parameters<typeof createTestRuntime>[0] } = {},
) {
  const environment = options.runtimeOptions?.environment ?? createTestRuntimeEnvironment();
  const runtime = authoriseTestRuntime(createTestRuntime({ ...options.runtimeOptions, environment,
    applicationDocuments: { initialTypes: [type], initialAdapters: [new InMemoryDocumentAdapter(environment)] },
  }));
  runtime.store.mutate(draft => { draft.loginServices.accessClass = "team"; });
  runtime.documents.registerCloseReviewer({ review: async () => "discard" });
  const appId = "current-text-tests";
  registerTestSynWare(runtime, { schemaVersion: 1, id: appId, version: "1.0.0", title: "Current text tests",
    routes: [{ path: "/current-text-tests", primary: true }], documentTypes: [{ id: type.id, displayName: type.displayName }],
  });
  const mounted = mountTestSynWareRuntime(runtime, appId);
  const documents = createSynWareContextValue(mounted.runtime).documents.workspaceDocuments;
  const owners: Array<{ dispose(): void }> = [];
  const sessions: TextEditingSession[] = [];
  const controllers: NSETextCommands[] = [];
  const registrations: Array<{ dispose(): unknown }> = [];
  let next = 0;
  const add = async (value: string | NSEAttributedContent) => {
    const index = ++next;
    const document = await documents.newDocument<CurrentTextTestModel>({ typeId: type.id,
      location: { kind: "memory", namespace: "current-text-tests", key: String(index) },
      initialModel: { title: `Text ${index}`, content: typeof value === "string" ? plainNSETextContent(value) : value },
    });
    const owner = createSynWareNSETextOwner<CurrentTextTestModel>({ documents, documentId: document.id,
      flowId: "body", signal: mounted.runtime.signal, readContent: model => model.content,
      writeContent: (model, content) => ({ ...model, content }),
    });
    owners.push(owner);
    const history = documents.getUndoManager(document.id);
    const session = new TextEditingSession({ id: `text-view-${index}`, documentId: document.id, owner, history });
    sessions.push(session);
    const commands = new NSETextCommands({ session, clipboard: options.clipboard,
      signal: mounted.runtime.signal, historyPresentation: () => history,
    });
    controllers.push(commands);
    // The host registers the control and semantic commands. Native document authority
    // still comes exclusively from the real mounted application's document lease.
    const responderId = `current-text:control:${index}`;
    registrations.push(runtime.responders.register({ id: responderId, kind: "control",
      parentId: `application:${appId}`, scopeId: responderId, undoOwner: { kind: "document", id: document.id },
    }));
    registrations.push(registerNSETextCommands({ controller: commands, responderId,
      commands: { register: declaration => runtime.commands.register(declaration as CommandDeclaration<unknown, unknown>) },
    }));
    return { document, owner, session, commands, history, responderId };
  };
  const first = await add(initial);
  return { runtime, mounted, documents, add, ...first,
    async dispose() {
      for (const registration of registrations.splice(0).reverse()) registration.dispose();
      for (const commands of controllers) commands.dispose();
      for (const session of sessions) session.dispose();
      for (const owner of owners) owner.dispose();
      mounted.dispose("current text fixture cleanup");
      await runtime.dispose("current text fixture cleanup");
    },
  };
}
