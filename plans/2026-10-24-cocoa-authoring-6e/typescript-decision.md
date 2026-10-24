# TypeScript 6 versus 7.1 beta

Status: adopted decision, 24 October 2026. The user explicitly approved **TypeScript 6.0.3** for both repositories and inclusion in 6E. Both source manifests pin it exactly; configuration migration preserves the JavaScript compiler API. Security remediation preceded this step. Other upgrades, authoring APIs and app migrations remain proposed; native 7.x is deferred.

## Approved decision

Use stable TypeScript 6.0.3 as the current production/tooling baseline. An isolated 7.1 beta investigation may be proposed separately; no beta is selected for production. Move to native 7.x only after a later decision and successful installed-package/semantic validation of the new API port. Native 7.x is not a prerequisite for the Cocoa authoring rewrite or application migrations.

TypeScript 7.0 is useful for CLI checking and ordinary TSX/class applications. Its missing compiler API makes it an incomplete replacement for this repository's current TypeScript dependency. It is too broad to call the compiler unusable in general; our constraint is the framework's substantial tooling and distributed Vite/MCP integration.

## Comparison for this repository

| Choice | Benefit | Cost and risk | Suggested role |
| --- | --- | --- | --- |
| Stable 6.0.3 | Keeps the JavaScript compiler API; prepares configuration/defaults for 7; least disruptive production upgrade | Does not deliver the native compiler's major speedup; configs, DOM types/inference and compiler consumers still require validation | Approved baseline |
| Stable 7.0.2 | Native checker, declaration emitter and editor performance | No old compiler API; current manifest parsing, semantic boundary/capability audits and MCP tooling cannot simply import it | Useful comparator; insufficient as the sole current framework compiler package |
| 7.1.0 beta | Native speed and the new purpose-specific compiler API | Beta release plus a real API/lifetime port; two changing surfaces while we also rethink authoring | Isolated investigation, not the default production package |
| 7.0 plus official TypeScript 6 sidecar | Native CLI with existing API tools temporarily retained | Two compiler versions, installation/package authority and semantic consistency to maintain | Available tradeoff; not the preferred default here |

Registry metadata on the research date reports stable 6.0.3, stable 7.0.2, and beta 7.1.0-beta. These are point-in-time versions; check the release/advisory state again when implementation is authorized. The 7.1 beta announcement is dated 20 October, four days before this assessment.

## Why stable 6 is a reasonable next step

The existing compiler API is used in `scripts/synware/manifest-source.mjs`, validation and capability/import audits, public-boundary checks, developer MCP discovery/lookup/build helpers, and an installed text-system consumer check. The SDK ships some of this code. A break is therefore more than a local lint failure: an independently installed user's Vite plugin or developer tooling may fail.

TypeScript 6 preserves the existing API family, so we can characterize and update these tools without immediately rewriting them to a new native client. Fix configuration deprecations directly: explicit path targets instead of baseUrl, deliberate root/output layout, explicit ambient type environments, and real type errors from changed inference/library declarations. Avoid relying on ignoreDeprecations as the finished migration. Keep emitted browser target, decorator semantics and public declaration-consumer support separate from the tooling compiler choice.

Some of that work is useful for both 6 and 7, so it is not inherently a throwaway compatibility layer. The later native API rewrite is still separate work and should be acknowledged as such. If the 7.1 stable release becomes available and our bounded port succeeds before a 6 migration starts, revisit whether a direct native move saves an unnecessary intermediate change.

## What the beta experiment must establish

1. Non-executing Info.ts/module parsing preserves accepted and rejected syntax and cannot introduce source execution.
2. Semantic alias/export/type traversal preserves public/private and capability audit decisions on the existing fixtures.
3. API/program/snapshot objects are disposed on successful, failed and cancelled operations; repeated MCP calls do not retain stale state or native resources.
4. Checking, declaration emit, config resolution and error results work on Windows and CI Linux, with compatible installed consumers and no reliance on repository-only imports.
5. Measured checking/build gains exceed any added analysis startup/IPC costs for our actual commands. No unverified upstream speed factor is promised for SynCloudOS.

The new API exposes entries such as `typescript/sync`, `typescript/async`, `typescript/ast` and `typescript/fs`; it is not an import rename for `ts.createProgram`/AST traversal. A successful experiment informs the decision but does not itself authorize a beta production dependency.

## Effect on applications and test optimization

Neither choice requires abandoning classes, standard decorators, bindings or TSX. The Cocoa-style authoring design remains viable with 6. The new decorator descriptors do not depend on native TypeScript 7.

Compiler speed and Vitest execution time are separate. The existing tests use Vite's transform pipeline; moving tsc to native code does not automatically remove jsdom initialization, repeated imports, packing/install work or browser launch costs. We can address those costs and the real security findings while selecting a stable compiler path. The earlier 94-test sample was dominated by overhead, not its 1.80 seconds of test bodies.

## Sources

- [TypeScript 6.0 release and preparation for 7](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/).
- [TypeScript 7.0 release and side-by-side API tooling](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- [TypeScript 7.1 beta and new compiler API](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/).
- [Official registry metadata](https://registry.npmjs.org/typescript).
