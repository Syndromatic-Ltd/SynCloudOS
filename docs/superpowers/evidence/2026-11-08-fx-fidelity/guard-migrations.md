# Documentation and scaffold migration guards

Validated 8 November 2026 against framework starting at `dd86dbc` and the sibling site. This bounded correction changes only the CryptoFX guide and Compression scaffold consumer test; no source API or guard policy changes.

## Causes and corrections

- The unchanged documentation-link guard removes fenced code before extracting links, but reads the inline literal operator call `Type["=="](lhs, rhs)` as a link to `lhs,`. The guide now places that exact call in a TypeScript code fence. The literal API and explanatory security text remain intact.
- Compression's approved scaffold imports `CPFXAlgorithm` and lists Apple's cases, including documented `brotli` and `lzbitmap`. The stale consumer expected removed `gzip` and described a capability query. The updated test asserts the public enum import and exact six-case output, plus the existing absence of entitlements and a mounted hook. It exercises the generated module against the real CompressionFX public entry.

## Verification

The existing full serial log recorded 7,735 passing tests and three failures; two failures belong to this correction. A targeted reproduction in `guard-migrations.log` independently confirmed both: 8 passing, 2 failing across two files. After correction, the same command passed all 10 tests across both files:

```text
npx vitest run tests/runtime/framework-doc-links.test.ts tests/runtime/synware-fx-authoring.test.ts --maxWorkers=1 --no-file-parallelism
```

Framework and sibling site `npx tsc -b --pretty false` both exited 0. Framework `npm run typecheck` and extra `npm run typecheck:authoring` also exited 0. Both repositories' `git diff --check` passed. Command output and exit codes are recorded in `guard-migrations.log`.

No full-suite rerun, SDK build or packed consumer rerun was required for these guide/test-only changes. The separate CryptoFX reset guard failure belongs to another work packet. No push or release is included.
