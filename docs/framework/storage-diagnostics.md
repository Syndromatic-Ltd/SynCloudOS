# Read-only browser storage diagnostics

`SCOS.storageDiagnostics` lets your application ask the browser how much storage the site is using and whether that storage is persistent. It only reads: it can't request persistence, ask for permission or change anything.

```ts
const { estimate, persistence } = await SCOS.storageDiagnostics.inspect(signal);
if (estimate.state === "observed") showUsage(estimate.usageBytes, estimate.quotaBytes);
```

`inspect(signal?)` queries the browser only when you call it. It returns two independent, immutable results, `estimate` and `persistence`, each with a `state` of `observed`, `unsupported`, `denied` (the browser refused this query) or `failed`. Pass the signal of the view controller or task that's asking, so the query ends with it. The query also rejects once its window, mount, runtime or account goes away. Cancelling stops you receiving a late result, but the browser's own query still runs to completion.

An observed `estimate` has `usageBytes` and `quotaBytes`, each `null` if the browser left it out, and `approximate: true`. Zero means the browser reported zero; it never stands in for an unsupported or failed query. The figures are rough totals for the whole site, not a breakdown by account or document, and not the free space on the device. The result never includes `usageDetails`, error messages, URLs or account identifiers. An observed `persistence` has a `persisted` boolean for the site's storage right now. It isn't a permission decision, and it doesn't mean the data is backed up, available offline or ready for an update. Writes can still fail, so keep your normal document and persistence recovery in place.

The Storage pane in System Preferences uses the same reader. It checks only when the user asks, cancels a check that a newer one replaces, and clears its results when the account, runtime or dialog goes away. Opening the pane doesn't trigger a query, nothing polls, and reopening the pane needs a new check.

The [Storage Standard](https://storage.spec.whatwg.org/#api) separates these status queries from the request that makes storage persistent. Browsers may give imprecise estimates or none at all, so support depends on what the browser reports at run time, not on a browser version. The Storage pane only runs the status queries; installation, service workers, caching, persistence requests and updates are handled separately.
