# Developer MCP authoring enforcement

**Goal:** Enforce the supplied authoring specification against installed SDK consumers without requiring Atmo or changing Fusion.

**Architecture:** Keep the existing module-graph audit, add a shared construct/replacement registry and focused source/CSS analysers, and collect findings through a single severity and exemption boundary. Generate an offline theme contract from neutral NSE source during SDK packaging; expose scaffold_theme and validate_theme through stdio.

**Constraints:** Base fbb473a, branch fix/blind-rewrite-friction; Fusion read-only; no shims/aliases; British prose and Apple API spelling; no port changes, full suite, push or co-author trailers.

## Work packets

- [x] Error rules: source/CSS analysis and failing/passing fixture pairs; exact replacement imports; third-party renderer exemption. Own new idiom-errors.mjs, idiom-replacements.mjs and idiom-errors.test.ts.
- [x] Warning rules and reconciliation: FX/resource/Foundation warnings with fixture pairs; exhaustive friction-log table and stale-entry notes. Own new idiom-warnings.mjs, idiom-warnings.test.ts and docs/framework/developer-mcp/idiom-rules.md.
- [x] Theme tools: derive neutral contract, scaffold and validate light/dark custom themes, package contract, fixture pairs. Own themes.mjs, build-package.mjs, developer-mcp-theme.test.ts.
- [ ] Integration: root owns idiom-audit.mjs, tools.mjs/server.mjs, existing developer-MCP tests, packaged acceptance and tool documentation. Add central opt-out handling, severity counts and Webspring traversal; review packets and commit small coherent changes.

## Verification

Write fixture expectations before implementations; run only developer-MCP/idiom-audit-related tests. Review diff and exact public exports. Run npm run sdk:build, then node scripts/synware/check-developer-mcp-consumer.mjs serially. Never run full suite. Preserve unrelated files; commit only named task files.
