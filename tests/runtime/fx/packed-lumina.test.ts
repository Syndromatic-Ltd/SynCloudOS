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

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../../scripts/synware/installed-consumer.mjs";

it("executes and typechecks named-route LuminaFX values from an independently installed SDK archive", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-lumina-packed-");
  expect(readdirSync(join(consumer.installed, "assets")).some((file) => /^lumina-index\.worker-[A-Za-z0-9_-]+\.js$/u.test(file))).toBe(true);
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import assert from "node:assert/strict";
import { createLUFXActivation, LUFXIndex, LUFXSearchableItem, LUFXQuery, LUFX_RANKER_VERSION, LUFX_TOKENIZER_VERSION } from "@syndromatic/syncloudos/fx/lumina";

const activation = createLUFXActivation({
  version: 1,
  kind: "named-route",
  routeName: "journal.post",
  parameters: { postId: "post:stable-42" },
});
const item = new LUFXSearchableItem({
  id: "post:stable-42",
  domain: "journal.posts",
  contentType: "article",
  title: "Durable installed result",
  body: "This record contains no executable activation payload.",
  activation,
  revision: "rev:1",
});
const restored = LUFXSearchableItem.fromJSON(JSON.parse(JSON.stringify(item)));
assert.deepEqual(restored, item);
assert.equal(restored.visibility, "app-only");
assert.equal(new LUFXQuery({ text: "durable", limit: 5 }).limit, 5);

assert.throws(() => createLUFXActivation({
  version: 1,
  kind: "legacy-path",
  pathname: "/journal",
}));
assert.throws(() => createLUFXActivation({
  version: 1,
  kind: "named-route",
  routeName: "journal.post",
  parameters: { postId: "post:stable-42" },
  applicationId: "foreign-app",
}));
assert.throws(() => createLUFXActivation({
  version: 1,
  kind: "named-route",
  routeName: "journal.post",
  parameters: { postId: "post:stable-42" },
  query: { admin: "1" },
}));

let generation = 0;
const indexedItems = new Map();
const backend = {
  async mutate(mutation, signal) {
    signal?.throwIfAborted();
    if (mutation.kind === "upsert") indexedItems.set(mutation.item.id, mutation.item);
    else if (mutation.kind === "delete") indexedItems.delete(mutation.itemId);
    else for (const [id, candidate] of indexedItems) if (candidate.domain === mutation.domain) indexedItems.delete(id);
    generation += 1;
    return { mutationId: mutation.mutationId, checkpoint: { generation, revision: generation }, replayed: false };
  },
  async snapshot(signal) {
    signal?.throwIfAborted();
    return { state: "ready", schemaVersion: 1, checkpoint: { generation, revision: generation }, items: [...indexedItems.values()] };
  },
  dispose() {},
};
const installedIndex = new LUFXIndex(backend);
const installedCommit = await installedIndex.upsert(item, "installed-upsert");
assert.deepEqual(installedCommit.checkpoint, { generation: 1, revision: 1 });
assert.deepEqual((await installedIndex.snapshot()).items.map((entry) => entry.id), ["post:stable-42"]);
const installedQuery = await installedIndex.query(new LUFXQuery({ text: "durable installed result", locale: "en", limit: 1 }));
assert.equal(installedQuery.tokenizerVersion, LUFX_TOKENIZER_VERSION);
assert.equal(installedQuery.rankerVersion, LUFX_RANKER_VERSION);
assert.deepEqual(installedQuery.results.map((entry) => entry.item.id), ["post:stable-42"]);
assert.equal(installedQuery.results[0].snippet.text.includes("executable activation"), true);
const installedSuggestions = await installedIndex.suggest(new LUFXQuery({ text: "dur", locale: "en", prefix: true }), { limit: 5, maximumBytes: 512 });
assert.deepEqual(installedSuggestions.suggestions, ["Durable installed result"]);
await installedIndex.deleteDomain("journal.posts", "installed-delete-domain");
assert.deepEqual((await installedIndex.snapshot()).items, []);
installedIndex.dispose();
console.log("LuminaFX installed values and index contract passed");
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("LuminaFX installed values and index contract passed");

  writeFileSync(join(consumer.root, "consumer.ts"), `
import { createLUFXActivation, LUFXIndex, LUFXSearchableItem, LUFXQuery } from "@syndromatic/syncloudos/fx/lumina";
import type {
  LUFXActivation,
  LUFXIndexBackend,
  LUFXIndexBackendMutation,
  LUFXIndexBackendMutationResult,
  LUFXIndexBackendSnapshot,
  LUFXIndexCheckpoint,
  LUFXIndexClient,
  LUFXIndexOperationOptions,
  LUFXIndexSnapshot,
  LUFXIndexState,
  LUFXMatchRange,
  LUFXQueryDescriptor,
  LUFXQueryExecutionOptions,
  LUFXQueryFilter,
  LUFXQueryResultEntry,
  LUFXQueryResultPage,
  LUFXSearchableItemDescriptor,
  LUFXSearchableItemJSON,
  LUFXSnippet,
  LUFXSuggestionOptions,
  LUFXSuggestionResult,
  LUFXToken,
  LUFXTokenizerOptions,
  LUFXVisibility,
} from "@syndromatic/syncloudos/fx/lumina";
import { useLumina } from "@syndromatic/syncloudos/sdk";
const activation: LUFXActivation = createLUFXActivation({ version: 1, kind: "named-route", routeName: "journal.post", parameters: { postId: "42" } });
const visibility: LUFXVisibility = "app-only";
const descriptor: LUFXSearchableItemDescriptor = { id: "42", domain: "journal", contentType: "article", title: "Title", activation, revision: "1", visibility };
const item = new LUFXSearchableItem(descriptor);
const json: LUFXSearchableItemJSON = item.toJSON();
const queryDescriptor: LUFXQueryDescriptor = { text: "Title", domains: ["journal"], limit: 10 };
const query = new LUFXQuery(queryDescriptor);
const checkpoint: LUFXIndexCheckpoint = { generation: 0, revision: 0 };
const state: LUFXIndexState = "ready";
const backend: LUFXIndexBackend = {
  async mutate(mutation: LUFXIndexBackendMutation): Promise<LUFXIndexBackendMutationResult> {
    return { mutationId: mutation.mutationId, checkpoint, replayed: false };
  },
  async snapshot(): Promise<LUFXIndexBackendSnapshot> {
    return { state, schemaVersion: 1, checkpoint, items: [json] };
  },
  dispose() {},
};
const index = new LUFXIndex(backend);
const options: LUFXIndexOperationOptions = {};
const client: LUFXIndexClient = { createIndex: () => index };
const snapshotPromise: Promise<LUFXIndexSnapshot> = index.snapshot(options);
const filter: LUFXQueryFilter = { kind: "domain", values: ["journal"] };
const queryOptions: LUFXQueryExecutionOptions = {};
const queryPromise: Promise<LUFXQueryResultPage> = index.query(new LUFXQuery({ text: "Title", locale: "en", filter }), queryOptions);
const suggestionOptions: LUFXSuggestionOptions = { limit: 3, maximumBytes: 512 };
const suggestionPromise: Promise<LUFXSuggestionResult> = index.suggest(query, suggestionOptions);
const token: LUFXToken | undefined = undefined;
const tokenizerOptions: LUFXTokenizerOptions = { locale: "en" };
const resultEntry = {} as LUFXQueryResultEntry;
const snippet = resultEntry.snippet as LUFXSnippet;
const range: LUFXMatchRange | undefined = snippet.matches[0];
const hook: typeof useLumina = useLumina;
void json; void query; void client; void snapshotPromise; void queryPromise; void suggestionPromise; void token; void tokenizerOptions; void range; void hook;
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    files: ["consumer.ts"],
  }, null, 2));
  expect(runNode([join(consumer.root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], consumer.root)).toBe("");
}, 120000);
