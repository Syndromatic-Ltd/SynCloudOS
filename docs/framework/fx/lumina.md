# LuminaFX

LuminaFX (`LUFX`) is the web-native analogue of Core Spotlight. It builds a searchable index of your application's content on the device and answers queries with ranked results, using tokenisation and text folding that respect the user's language. Every item carries a durable route identity, so choosing a result takes the user back to the place it came from.

The framework has two halves. The value types (`LUFXSearchableItem`, `LUFXQuery`, the tokenizer, the ranker version constants) validate their input strictly and run anywhere JavaScript runs, so you can build and test items and queries in a unit test without a host. The index itself belongs to the mounted session: `useLumina()` returns a client whose `createIndex()` hands your component a private, durable index owned by your application. The host captures the application identity when it mounts your SynWare, so no API takes an owner or application ID, and one application can never read another's index.

Everything stays on the device. Nothing in the framework sends item text to a network service.

```ts
import { LUFXQuery, LUFXSearchableItem } from "@syndromatic/syncloudos/fx/lumina";
```

## At a glance

| | |
| --- | --- |
| Prefix | `LUFX` |
| Entry | `@syndromatic/syncloudos/fx/lumina` |
| Hook | `useLumina`, from `@syndromatic/syncloudos/sdk` |
| Permissions | `lumina.index` to write items, `lumina.query` to read, query and suggest |
| Analogue | Core Spotlight (`CSSearchableItem`, `CSSearchableIndex`, `CSSearchQuery`) |

## What the entry exports

| Area | Symbols |
| --- | --- |
| Items | `LUFXSearchableItem`, `LUFXSearchableItemDescriptor`, `LUFXSearchableItemJSON`, `LUFXVisibility` |
| Activation | `createLUFXActivation`, `LUFXActivation` |
| Queries | `LUFXQuery`, `LUFXQueryDescriptor`, `LUFXQueryFilter` |
| Index | `LUFXIndex`, `LUFXIndexClient`, `LUFXIndexSession`, `LUFXIndexOperationOptions`, `LUFXIndexSnapshot` |
| Storage port | `LUFXIndexBackend`, `LUFXIndexBackendMutation`, `LUFXIndexBackendMutationResult`, `LUFXIndexBackendSnapshot`, `LUFXIndexCheckpoint`, `LUFXIndexState` |
| Execution | `LUFXQueryPlanner`, `LUFXQueryExecutionOptions`, `LUFXQueryResultEntry`, `LUFXQueryResultPage` |
| Snippets and suggestions | `LUFXSnippet`, `LUFXMatchRange`, `LUFXSuggestionOptions`, `LUFXSuggestionResult` |
| Text processing | `tokenizeLUFXText`, `foldLUFXText`, `canonicalLUFXLocale`, `LUFXToken`, `LUFXTokenizerOptions`, `LUFX_TOKENIZER_VERSION`, `LUFX_RANKER_VERSION` |

## A first index

An application declares the permissions it needs, acquires an index, writes items into it and queries it. This component indexes one note and searches for it.

```tsx
import { useState } from "react";
import { LUFXSearchableItem, createLUFXActivation } from "@syndromatic/syncloudos/fx/lumina";
import { useLumina } from "@syndromatic/syncloudos/sdk";

export function IndexAndSearch() {
  const lumina = useLumina();
  const [titles, setTitles] = useState<string[]>([]);

  async function run() {
    const index = lumina.createIndex();
    try {
      const item = new LUFXSearchableItem({
        id: "note-42",
        domain: "notes",
        contentType: "note",
        title: "Quarterly planning",
        body: "Agenda for the planning meeting, with budget and hiring notes.",
        keywords: ["roadmap", "budget"],
        modifiedAt: 1_700_000_000_000,
        resourceReference: "document:note-42",
        activation: createLUFXActivation({
          version: 1,
          kind: "named-route",
          routeName: "note",
          parameters: { id: "42" },
        }),
        revision: "1",
      });
      await index.upsert(item, "note-42@1");
      const page = await index.query({ text: "planing", fuzzy: true, limit: 5 });
      setTitles(page.results.map((entry) => entry.item.title));
    } finally {
      index.dispose();
    }
  }

  return (
    <div>
      <button onClick={() => void run()}>Index and search</button>
      <ul>{titles.map((title) => <li key={title}>{title}</li>)}</ul>
    </div>
  );
}
```

The manifest for this component lists both permissions:

```ts
export default {
  schemaVersion: 1,
  bundleIdentifier: "com.example.notes",
  version: "1.0.0",
  displayName: "Notes",
  routes: [{ path: "/notes", primary: true }],
  permissions: ["lumina.index", "lumina.query"],
} as const;
```

## Searchable items

### `LUFXSearchableItem`

One entry in the index. The constructor validates the descriptor and freezes the result, so an item is a safe immutable value that you can pass between components and store.

```text
new LUFXSearchableItem(value: LUFXSearchableItemDescriptor)
```

The descriptor must be plain data. The constructor throws `TypeError` for a custom prototype, symbol keys, accessor properties, unknown fields or a missing required field.

| Member | Type | Description |
| --- | --- | --- |
| `id` | `string` | Your identifier for the item. Required. Unique within its domain. 1 to 256 bytes, with no whitespace or control characters. |
| `domain` | `string` | A grouping for related items, for example `"notes"` or `"contacts"`. Required, same limits as `id`. Queries and `deleteDomain` work on domains. |
| `contentType` | `string` | A kind within the domain, for example `"note"`. Required, same limits as `id`. Queries can filter on it. |
| `title` | `string` | The main searchable text and the text shown for suggestions. Required, 1 to 1024 bytes. |
| `subtitle` | `string \| undefined` | A secondary line. Up to 2048 bytes. |
| `alternateNames` | `readonly string[] \| undefined` | Other names people use for the item. Up to 64 entries of at most 512 bytes each. |
| `body` | `string \| undefined` | Longer text. Up to 256 KiB. May be empty. Snippets are cut from it. |
| `keywords` | `readonly string[] \| undefined` | Search terms that need not appear in the visible text. Up to 64 entries of at most 512 bytes each. |
| `createdAt` | `number \| undefined` | Creation time in milliseconds since the epoch. Must be finite. |
| `modifiedAt` | `number \| undefined` | Last change time in the same units. Drives recency ranking. |
| `rankingHint` | `number \| undefined` | Your own nudge between -1 and 1. Outside that range the constructor throws `RangeError`. |
| `resourceReference` | `string \| undefined` | A pointer to the content, written as `document:<id>` or `resource:<path>`. See the rules below. |
| `activation` | `LUFXActivation` | The route that opens the item. Required. |
| `visibility` | `LUFXVisibility` | `"app-only"` (the default) or `"eligible-donation"`. |
| `revision` | `string` | A version label for the indexed content, such as a version counter or hash. Required, same limits as `id`. |
| `toJSON()` | `LUFXSearchableItemJSON` | A plain copy with defaults filled in, suitable for storage. Optional fields that are unset are omitted. |
| `static fromJSON(value)` | `LUFXSearchableItem` | Validates any unknown value and builds an item. Use it when reading stored data. |

Every string field also has a byte limit, measured in UTF-8. A string longer than its limit makes the constructor throw `RangeError`.

**Resource references.** A `document:` reference names a document by its identifier, using letters, digits and the characters `. _ ~ : @ -`. A `resource:` reference names a path made of segments separated by `/`, where no segment may be empty, `.` or `..`, and no percent-decoded segment may contain a slash or backslash. References cannot contain `?`, `#`, backslashes or control characters. Anything else throws `TypeError`.

**Visibility.** `"app-only"` keeps an item visible to your application's own index only. `"eligible-donation"` marks an item the host may offer to system-level search where policy allows it. Leave the default unless you have decided the item is safe to show outside your application.

**Revisions.** A revision tells the index which version of an item it holds. Upserting the same `id` and `domain` with a new revision replaces the old entry.

### `LUFXSearchableItemDescriptor` and `LUFXSearchableItemJSON`

`LUFXSearchableItemDescriptor` is the input to the constructor. It has the fields of the table above, with `visibility` optional. `LUFXSearchableItemJSON` is the same shape with `visibility` always present. It is what `toJSON()` returns and what a backend stores.

### `LUFXVisibility`

The union `"app-only" | "eligible-donation"`.

### `createLUFXActivation`

```text
createLUFXActivation(value: unknown): LUFXActivation
```

Validates and freezes an activation. An activation is a named route identity of the form:

```text
{
  version: 1,
  kind: "named-route",
  routeName: string,                    // letters, digits, . _ -, starting with a letter, up to 128 bytes
  parameters: Record<string, string>,   // up to 16 entries, names up to 64 bytes, values up to 512 bytes
}
```

The value must be plain data with exactly those four fields. The function returns a frozen copy with the parameters in sorted order, and it throws `TypeError` or `RangeError` on any violation. An activation identifies a place in your application by name. The application ownership comes from the mounted index, so the value carries no application ID.

`LUFXActivation` is the type of that value.

## Queries

### `LUFXQuery`

A validated, frozen description of a search. The index also accepts a plain `LUFXQueryDescriptor` and builds the query for you, so construct a `LUFXQuery` yourself when you want to reuse or serialise it.

```text
new LUFXQuery(value: LUFXQueryDescriptor)
```

| Member | Type | Description |
| --- | --- | --- |
| `text` | `string` | The search text, up to 4096 bytes. An empty string is allowed and matches every item that passes the filters. |
| `domains` | `readonly string[]` | Restricts results to these domains. Empty means all. Up to 32 distinct entries. |
| `contentTypes` | `readonly string[]` | Restricts results to these content types. Empty means all. Up to 32 distinct entries. |
| `limit` | `number` | Maximum results in one page, an integer from 1 to 100. Default 20. |
| `asOf` | `number \| undefined` | The reference time, in milliseconds since the epoch, for recency ranking. Without it, recency does not affect the score. |
| `locale` | `string` | The canonical locale used for folding and tokenising. Default `"und"` (no locale). |
| `prefix` | `boolean` | When true, a query word also matches longer words that start with it. Default false. |
| `fuzzy` | `boolean` | When true, a query word of four or more characters also matches words one edit away. Default false. |
| `filter` | `LUFXQueryFilter \| undefined` | A structured filter tree. See below. |
| `maximumBytes` | `number` | An upper bound on the serialised size of one page of results, from 524288 to 8388608. Default 1048576. |
| `toJSON()` | `LUFXQueryDescriptor` | A plain descriptor that rebuilds an equal query. |

The constructor throws `TypeError` for unknown fields or non-plain data, and `RangeError` for values outside the ranges above or for duplicate entries in `domains` and `contentTypes`.

**Query text.** Words are folded and tokenised, and every word must match. Put words in double quotes to require them as a phrase, in order and adjacent. `budget "planning meeting"` matches items that contain `budget` and the exact phrase `planning meeting` in one field. A query can hold at most 64 distinct terms and 16 phrases of at most 16 words.

### `LUFXQueryDescriptor`

The plain-data form of a query. Every field except `text` is optional and takes the default listed above.

### `LUFXQueryFilter`

A tree of conditions that further restrict results. Each node is one of:

| Node | Shape | Matches |
| --- | --- | --- |
| Combination | `{ kind: "and" \| "or", filters: LUFXQueryFilter[] }` | All or any of 1 to 32 child filters. |
| Domain | `{ kind: "domain", values: string[] }` | Items whose domain is in the list. |
| Content type | `{ kind: "content-type", values: string[] }` | Items whose content type is in the list. |
| Created | `{ kind: "created-at", minimum?, maximum? }` | Items whose `createdAt` lies in the inclusive range. Items with no `createdAt` never match. |
| Modified | `{ kind: "modified-at", minimum?, maximum? }` | The same test on `modifiedAt`. |

A date filter needs at least one bound, and `minimum` cannot exceed `maximum`. A filter tree can be at most 6 levels deep and hold at most 64 nodes.

```ts
import { LUFXQuery } from "@syndromatic/syncloudos/fx/lumina";

const query = new LUFXQuery({
  text: "budget",
  prefix: true,
  filter: {
    kind: "and",
    filters: [
      { kind: "domain", values: ["notes", "tasks"] },
      { kind: "modified-at", minimum: Date.UTC(2026, 0, 1) },
    ],
  },
});

export const summary = `${query.limit} results at most, locale ${query.locale}`;
```

## The index

### `LUFXIndexClient`

What `useLumina()` returns.

| Member | Description |
| --- | --- |
| `createIndex(signal?)` | Returns an `LUFXIndexSession` for your application. It throws a `SecurityError` `DOMException` when the manifest declares neither `lumina.index` nor `lumina.query`, or when policy denies every declared capability. An application can hold at most two sessions at once. The optional signal releases the session when it aborts. |

Acquire a session when you need it and dispose of it when you finish. The host also disposes any session that is still open when the application closes.

### `LUFXIndexSession`

The application-facing index. Each write needs `lumina.index` and each read needs `lumina.query`. A call without the matching permission rejects with a `SecurityError`.

| Method | Permission | Description |
| --- | --- | --- |
| `upsert(item, mutationId, options?)` | `lumina.index` | Adds or replaces an item, keyed by its domain and `id`. |
| `delete(itemId, mutationId, options?)` | `lumina.index` | Removes one item. |
| `deleteDomain(domain, mutationId, options?)` | `lumina.index` | Removes every item in a domain. |
| `snapshot(options?)` | `lumina.query` | Returns the whole index as `LUFXIndexSnapshot`. |
| `query(value, options?)` | `lumina.query` | Runs a search and returns one page of results. |
| `suggest(value, options?)` | `lumina.query` | Returns title suggestions for the text typed so far. |
| `dispose()` | none | Releases the session. Later calls reject with an `AbortError`. |

**Mutation IDs.** Every write takes a `mutationId`, a string you choose (1 to 256 bytes, no whitespace). The backend remembers the IDs it has applied. When you send the same ID again, it returns the earlier result with `replayed: true` and applies nothing twice. Derive the ID from the change, such as `"note-42@7"`, and a retry after a lost response becomes safe.

`upsert` requires an `LUFXSearchableItem` instance and throws `TypeError` for a plain object. Build items with the constructor so they are validated.

### `LUFXIndex`

The concrete class behind a session. It wraps an `LUFXIndexBackend`, checks arguments, and runs queries in the planner when the backend cannot run them itself. An application obtains sessions from the client and does not construct one. Hosts, tests and tools that supply their own storage construct it directly.

```text
new LUFXIndex(backend: LUFXIndexBackend)
```

| Member | Description |
| --- | --- |
| `backend` | The storage the index wraps. |
| `upsert`, `delete`, `deleteDomain`, `snapshot`, `query`, `suggest`, `dispose` | The same as `LUFXIndexSession`. |

The constructor throws `TypeError` unless the backend has `mutate`, `snapshot` and `dispose` functions. When the backend also implements `query` or `suggest`, the index sends the work there and returns only the bounded result, so a large index is never copied into the page. Otherwise the index takes a snapshot and runs the planner locally. `dispose()` is idempotent and disposes the backend.

### `LUFXIndexOperationOptions`

| Field | Type | Description |
| --- | --- | --- |
| `signal` | `AbortSignal \| undefined` | Cancels the operation. An aborted signal makes the call reject with the signal's reason. |

### `LUFXIndexSnapshot`

A frozen picture of the index at one moment.

| Field | Type | Description |
| --- | --- | --- |
| `state` | `LUFXIndexState` | `"ready"`, or `"rebuild-required"` when stored data is out of date. |
| `schemaVersion` | `number` | The storage schema version. |
| `checkpoint` | `LUFXIndexCheckpoint` | The generation and revision the snapshot reflects. |
| `items` | `readonly LUFXSearchableItem[]` | Every item, validated. |

### `LUFXIndexCheckpoint`

`generation` and `revision`, both numbers. The revision advances with each change. The generation identifies one build of the index, and a paging cursor is valid only for the generation that issued it.

### `LUFXIndexState`

`"ready"` or `"rebuild-required"`. Queries against a snapshot in the `"rebuild-required"` state reject with an `InvalidStateError`, because results from stale data would mislead. Rebuild by upserting your content again.

### `LUFXIndexBackendMutationResult`

What a write returns.

| Field | Type | Description |
| --- | --- | --- |
| `mutationId` | `string` | The ID you sent. |
| `checkpoint` | `LUFXIndexCheckpoint` | The checkpoint after the change. |
| `replayed` | `boolean` | True when the backend had already applied this mutation ID. |

## Results

### `LUFXQueryResultPage`

| Field | Type | Description |
| --- | --- | --- |
| `results` | `readonly LUFXQueryResultEntry[]` | The entries on this page, best first. |
| `nextCursor` | `string \| undefined` | Present when more results exist. Pass it back as `cursor` to fetch the next page. |
| `checkpoint` | `LUFXIndexCheckpoint` | The index state the page came from. |
| `tokenizerVersion` | `"lufx-tokenizer-v1"` | The tokenizer that produced the terms. |
| `rankerVersion` | `"lufx-lexical-v2"` | The ranker that produced the scores. |

The two version fields let you notice, and invalidate anything you cached, when the text processing changes.

### `LUFXQueryResultEntry`

| Field | Type | Description |
| --- | --- | --- |
| `item` | `LUFXSearchableItem` | The matching item. Read `item.activation` to open it. |
| `score` | `number` | The rank score. Higher is better. Compare scores within one page or one query only. |
| `snippet` | `LUFXSnippet` | A short extract with the matches marked. |

### `LUFXQueryExecutionOptions`

| Field | Type | Description |
| --- | --- | --- |
| `signal` | `AbortSignal \| undefined` | Cancels the query. |
| `cursor` | `string \| undefined` | A `nextCursor` from an earlier page of the same query. |

A cursor is valid for one query on one generation. It rejects with an `InvalidStateError` when the query text or filters differ, when the generation changed, or when the item it points at no longer exists. Start again from the first page when that happens.

### `LUFXSnippet` and `LUFXMatchRange`

A snippet holds `text`, an extract of at most 240 characters cut from the item's `body` (falling back to `subtitle`, then `title`) with markup stripped, and `matches`, a list of `{ start, end }` ranges into `text`. Ranges use UTF-16 offsets, so you can slice with them directly to render highlights.

```tsx
import type { LUFXSnippet } from "@syndromatic/syncloudos/fx/lumina";

export function Highlighted({ snippet }: { snippet: LUFXSnippet }) {
  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  for (const match of snippet.matches) {
    if (match.start > cursor) parts.push({ text: snippet.text.slice(cursor, match.start), hit: false });
    parts.push({ text: snippet.text.slice(match.start, match.end), hit: true });
    cursor = match.end;
  }
  if (cursor < snippet.text.length) parts.push({ text: snippet.text.slice(cursor), hit: false });
  return (
    <p>
      {parts.map((part, index) => (part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}
    </p>
  );
}
```

## Paging through results

```tsx
import { useCallback, useRef, useState } from "react";
import type { LUFXIndexSession, LUFXQueryDescriptor } from "@syndromatic/syncloudos/fx/lumina";

export function usePagedSearch(index: LUFXIndexSession) {
  const [titles, setTitles] = useState<string[]>([]);
  const cursor = useRef<string | undefined>(undefined);
  const query = useRef<LUFXQueryDescriptor>({ text: "" });

  const start = useCallback(async (descriptor: LUFXQueryDescriptor) => {
    query.current = descriptor;
    const page = await index.query(descriptor);
    cursor.current = page.nextCursor;
    setTitles(page.results.map((entry) => entry.item.title));
  }, [index]);

  const more = useCallback(async () => {
    if (!cursor.current) return;
    try {
      const page = await index.query(query.current, { cursor: cursor.current });
      cursor.current = page.nextCursor;
      setTitles((existing) => [...existing, ...page.results.map((entry) => entry.item.title)]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "InvalidStateError") await start(query.current);
      else throw error;
    }
  }, [index, start]);

  return { titles, start, more, hasMore: () => cursor.current !== undefined };
}
```

## Suggestions

`suggest()` ranks the same way `query()` does and returns the distinct titles of the best matches, which suits a search-as-you-type list. Set `prefix: true` in the query so a half-typed word matches.

| Option | Type | Description |
| --- | --- | --- |
| `limit` | `number \| undefined` | Number of suggestions, an integer from 1 to 50. Default 10. |
| `maximumBytes` | `number \| undefined` | Total size of the titles returned, from 1 to 65536. Default 4096. A title that would exceed the budget is skipped. |
| `signal` | `AbortSignal \| undefined` | Cancels the call. |

`LUFXSuggestionOptions` names the first two options and `LUFXSuggestionResult` holds `suggestions`, a frozen `string[]`. A range error is thrown for values outside the limits.

```ts
import type { LUFXIndexSession } from "@syndromatic/syncloudos/fx/lumina";

export async function completions(index: LUFXIndexSession, typed: string, signal: AbortSignal) {
  const result = await index.suggest({ text: typed, prefix: true }, { limit: 6, signal });
  return result.suggestions;
}
```

## How ranking works

The ranker (`LUFX_RANKER_VERSION`, currently `"lufx-lexical-v2"`) is lexical. Each query word must match, and the score adds up these parts:

- **Field weight.** A match in the title counts 8, in an alternate name 5, in a keyword 4, in the subtitle 3 and in the body 1. Repeated matches in one field add less each time.
- **Rarity.** A word that few items contain scores higher than a word most items contain.
- **Phrases.** Each quoted phrase that is present adds a fixed bonus.
- **Title match.** A title equal to the whole query gains a large bonus, and a title that starts with it gains a smaller one.
- **Recency.** When the query has `asOf`, an item modified just now gains 2 points, and the bonus falls to 1 point for an item modified 180 days earlier.
- **Your hint.** `rankingHint` adds up to 1.5 points in either direction.

Results with equal scores order by title, then domain, then ID, so the order is stable between runs.

`LUFX_TOKENIZER_VERSION` (currently `"lufx-tokenizer-v1"`) versions the text processing that both indexing and querying use.

## Text processing

The tokenizer functions are exported so that your own search UI can match the index exactly, for example to highlight terms in text the index did not return.

### `canonicalLUFXLocale`

```text
canonicalLUFXLocale(locale?: string): string
```

Returns the canonical form of a BCP 47 locale, or `"und"` when the argument is missing or empty. It throws `TypeError` for a value longer than 64 characters or one that is not a valid locale.

### `foldLUFXText`

```text
foldLUFXText(value: string, locale?: string): string
```

Lower-cases the text for the locale, expands `ß` to `ss`, and strips combining marks, so `"Café"` folds to `"cafe"`. The result compares equal for text that differs only in case and accents.

### `tokenizeLUFXText`

```text
tokenizeLUFXText(value: string, options?: LUFXTokenizerOptions): readonly LUFXToken[]
```

Splits text into tokens. Runs of letters, digits and marks form one token each. Each Han, Hiragana, Katakana and Hangul character is a token of its own, so Chinese, Japanese and Korean text is searchable without spaces. Punctuation and spaces separate tokens and are dropped.

`LUFXTokenizerOptions` has one field, `locale`. A `LUFXToken` has:

| Field | Type | Description |
| --- | --- | --- |
| `term` | `string` | The folded text, which is what matching compares. |
| `display` | `string` | The original text of the token. |
| `start`, `end` | `number` | The UTF-16 range of the token in the input. |
| `position` | `number` | The token's index in the sequence. |

```ts
import { foldLUFXText, tokenizeLUFXText } from "@syndromatic/syncloudos/fx/lumina";

const tokens = tokenizeLUFXText("Crème brûlée, 東京", { locale: "fr" });
// terms: "creme", "brulee", "東", "京"
export const terms = tokens.map((token) => token.term);
export const folded = foldLUFXText("Straße"); // "strasse"
```

## The query planner

### `LUFXQueryPlanner`

Runs queries against a snapshot in memory. `LUFXIndex` uses one when its backend lacks its own query support. Use it directly to search a snapshot you already hold, or in tests.

```text
new LUFXQueryPlanner()
```

| Method | Description |
| --- | --- |
| `execute(snapshot, query, options?)` | Filters, ranks and pages the snapshot. Returns an `LUFXQueryResultPage`. Throws an `InvalidStateError` `DOMException` when the snapshot is in the `"rebuild-required"` state or the cursor is stale, and honours `options.signal`. |
| `suggest(snapshot, query, options?)` | The same for suggestions. |

Both methods are synchronous and take a `LUFXQuery` or a `LUFXQueryDescriptor`.

```ts
import { LUFXIndex, LUFXQueryPlanner } from "@syndromatic/syncloudos/fx/lumina";
import type { LUFXIndexSession } from "@syndromatic/syncloudos/fx/lumina";

export async function searchOffline(index: LUFXIndexSession, text: string) {
  const snapshot = await index.snapshot();
  const planner = new LUFXQueryPlanner();
  return planner.execute(snapshot, { text, prefix: true }).results.map((entry) => entry.item.id);
}

export type Wrapped = LUFXIndex;
```

## The storage port

`LUFXIndexBackend` is the seam where storage plugs in. The host supplies a durable backend for your application, and tests can supply an in-memory one. Applications never implement it, but the types are public so that hosts and test doubles can.

| Method | Description |
| --- | --- |
| `mutate(mutation, signal?)` | Applies one `LUFXIndexBackendMutation` and returns an `LUFXIndexBackendMutationResult`. Must be idempotent on `mutationId`. |
| `snapshot(signal?)` | Returns an `LUFXIndexBackendSnapshot`, the same as `LUFXIndexSnapshot` but with items in JSON form. |
| `dispose()` | Releases the storage. |

A backend may also implement `query(descriptor, options)` and `suggest(descriptor, options)` to rank next to its storage.

`LUFXIndexBackendMutation` is one of `{ kind: "upsert", mutationId, item }`, `{ kind: "delete", mutationId, itemId }` or `{ kind: "delete-domain", mutationId, domain }`.

A minimal in-memory backend for tests:

```ts
import {
  LUFXIndex,
  type LUFXIndexBackend,
  type LUFXIndexBackendMutation,
  type LUFXSearchableItemJSON,
} from "@syndromatic/syncloudos/fx/lumina";

export function createMemoryIndex() {
  const items = new Map<string, LUFXSearchableItemJSON>();
  const applied = new Set<string>();
  let revision = 0;

  const backend: LUFXIndexBackend = {
    async mutate(mutation: LUFXIndexBackendMutation) {
      const replayed = applied.has(mutation.mutationId);
      if (!replayed) {
        applied.add(mutation.mutationId);
        revision += 1;
        if (mutation.kind === "upsert") items.set(`${mutation.item.domain}/${mutation.item.id}`, mutation.item);
        else if (mutation.kind === "delete") {
          for (const key of [...items.keys()]) if (key.endsWith(`/${mutation.itemId}`)) items.delete(key);
        } else {
          for (const key of [...items.keys()]) if (key.startsWith(`${mutation.domain}/`)) items.delete(key);
        }
      }
      return { mutationId: mutation.mutationId, checkpoint: { generation: 1, revision }, replayed };
    },
    async snapshot() {
      return { state: "ready", schemaVersion: 1, checkpoint: { generation: 1, revision }, items: [...items.values()] };
    },
    dispose() {
      items.clear();
    },
  };
  return new LUFXIndex(backend);
}
```

## Errors

| Situation | Error |
| --- | --- |
| Item or query data is not plain data, has unknown fields or wrong types | `TypeError` |
| A value is outside its numeric range, over its byte limit or a list is too long | `RangeError` |
| A permission is missing from the manifest, or policy denies it | `DOMException` named `SecurityError` |
| The session was disposed | `DOMException` named `AbortError` |
| A signal aborted | The signal's reason, usually an `AbortError` |
| The index needs rebuilding, or a cursor no longer applies | `DOMException` named `InvalidStateError` |

## Privacy

The index lives in your application's private partition, keyed by the identity the host captured at mount. Items marked `"app-only"` stay there. The host decides what, if anything, an `"eligible-donation"` item may reach, and it applies the user's settings. Keep confidential text out of `body` and `keywords` when an item is eligible.

## Related

- [Overview of the FX frameworks](README.md)
- [Manifest reference](../synware-manifest.md), for declaring permissions
- [SynWare SDK](../synware-sdk.md), for the session hooks
- [Testing a SynWare](../testing-synware.md)
