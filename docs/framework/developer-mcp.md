# Developer MCP

The SynCloudOS Developer MCP server gives AI coding agents local project inspection, SDK lookup, validation, scaffolding and error explanations over stdio. It reads the SDK installed in your project, not a checkout or a remote documentation service. It does not inspect a running application, expose AgentKit/WebMCP, or audit resource lifetimes.

## Install the matching companion

Use a patched Node.js release: 22.23.4+, 24.22.1+, or 26.12.1+ on its respective release line. Build the framework with `npm ci --ignore-scripts && npm run build`. The build writes two packages to `.artifacts/synapp-sdk/packages/` and two content-addressed `.tgz` archives to `.artifacts/synapp-sdk/archives/`:

- `syncloudos`: `@syndromatic/syncloudos`, the application SDK.
- `syncloudos-developer-mcp`: `@syndromatic/syncloudos-developer-mcp`, the developer server.

The exact archive paths are in `.artifacts/synapp-sdk/build-manifest.json`: `archive` is the SDK archive and `developerMcp.archive` is the companion archive. Install both archives from the same build in your consumer project:

```bash
npm install /absolute/path/to/the-sdk-archive.tgz
npm install --save-dev /absolute/path/to/the-mcp-archive.tgz
```

These paths stand for the actual filenames from that build manifest; the beta packages are not assumed to be published to npm. The companion has an **exact-version** peer dependency on the SDK. Its server also checks the installed version and refuses a mismatch. Update both together.

Only the companion depends on the official `@modelcontextprotocol/sdk`, TypeScript, Zod and the validator's Ajv runtime. Adding MCP does not add an MCP runtime dependency to the browser SDK. The SDK contains `docs/framework/`, `tooling/manifest.schema.json`, a generated `tooling/error-catalogue.json` and `tooling/build-receipt.json`. The receipt records the source commit and source fingerprint; the external build manifest additionally records archive integrity. No network access is needed for the tools once dependencies are installed.

The companion package also ships its own `README.md` with the install, `--project` and client-configuration steps on this page. If `npm install` reports blocked install scripts for `esbuild`, see [Install in Getting started](getting-started.md#install).

## Configure a TOML-configured client

For a coding agent that reads MCP servers from a TOML file, add this to its configuration file, replacing the two project paths with your absolute consumer-project path:

```toml
[mcp_servers.syncloudos]
command = "node"
args = ["/absolute/project/node_modules/@syndromatic/syncloudos-developer-mcp/scripts/developer-mcp/server.mjs", "--project", "/absolute/project"]
```

On Windows, forward slashes work in these paths (`C:/Projects/my-site/...`). Using `node` with the installed entrypoint avoids shell-specific `.cmd` wrappers and accidental `npx` downloads. The package also installs a `syncloudos-mcp` bin for terminal use:

```bash
npx --no-install syncloudos-mcp --project /absolute/project
```

## Configure a `.mcp.json` client

For a coding agent that reads project-scoped `.mcp.json`, create it in your consumer project:

```json
{
  "mcpServers": {
    "syncloudos": {
      "command": "node",
      "args": [
        "/absolute/project/node_modules/@syndromatic/syncloudos-developer-mcp/scripts/developer-mcp/server.mjs",
        "--project",
        "/absolute/project"
      ]
    }
  }
}
```

The server writes MCP protocol messages only to stdout. Configuration and startup diagnostics go to stderr. Without `--project`, it starts from the process working directory. Each tool accepts an optional `projectRoot` override; project detection walks upward to the nearest `package.json` and resolves the SDK as that consumer would.

## Tool reference

Every successful call includes both JSON text content and the same object in MCP `structuredContent`. Tool failures return `isError: true` and an explanatory text message. Paths in findings and created-file lists are relative to the detected project. SDK locations and the detected project root are absolute.

### `inspect_project`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false }`.

Output: `{ projectRoot, sdk: { version, path, buildReceipt }, vite: { config, pluginPresent, options, unresolved }, bundles: [{ directory, id, manifest, entry, error }], shell: { enabled, path, exists }, dependencies, devDependencies }`.

Discovers direct `*.app` bundles using the Vite plugin's shared discovery rules: default `src/SynWare`, case-insensitive bundle suffixes, no case-colliding names or symbolic links, and `Contents/Info.ts` plus `Contents/index.tsx`. It reports incomplete bundles so they can be repaired. The default shell is `src/Webspring/Contents/index.tsx`.

Vite configuration is parsed **without executing it**. Literal `synCloudOS({ appsDirectory, webspringEntry })` options, including an aliased named import, are understood. Computed options require explicit tool overrides rather than guessing a directory. This is inspection of configuration hints, not execution of Vite's configuration pipeline.

### `lookup_sdk`

Input: `{ projectRoot?: string, entry?: string, query?: string, limit?: number, full?: boolean }` (`limit` defaults to 8, range 1–100).

With neither `entry` nor `query`, output is `{ version, entries: string[] }`. Otherwise output is `{ version, symbols: [{ entry, entries, name, signature, outlined, jsDoc, file, line, score }], docs: [{ file, heading, text, truncated, score }] }`.

Use entry names such as `sdk`, `nse` or `fx/animation`. An entry without a query lists its exports. Queries fuzzy-match exported names, follow declaration re-exports and return declaration signatures, attached JSDoc and relevant sections of the installed framework docs. A low-confidence query can return no symbols; it does not invent an API. Each symbol appears once: `entries` lists every package entry that exports it and `entry` is the one to import from. A class or interface longer than about 1,200 characters comes back as an outline, its header and public member signatures without bodies, with `outlined: true`; pass `full: true` for complete declarations. At most three documentation sections are returned, each capped at 1,500 characters with `truncated: true` when cut; read the named `file` for the rest.

Broad `application menu`, `settings`, `preferences` and `account` queries prioritise the public `useApplicationMenuTrigger` hook and `SynWareApplicationMenuManifest` before lower-level menu props or availability APIs. Documentation ranking favours the corresponding application-menu/Preferences sections and worked examples. Exact exported names still take precedence; equally relevant symbols from the main `sdk` entry rank before other entries.

### `validate`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false, typescript?: boolean, idioms?: boolean, launch?: boolean }` (`typescript`, `idioms` and `launch` default to `true`).

Output: `{ ok: boolean, findings: [{ file, line, column?, rule, severity?, message }], bundles: [{ directory, id, ok, error }], typescript: { ran, exitCode, projects }, launch: { ran, entry?, reason?, limits? }, host: { status: "checked" | "unresolved" | "not-found", reason?, file?, line?, application?: { id, frame } | null, authentication? }, idiomAudit: { applications: [...], stylesheets: {...}, warnings } | null }`. `ok` is false only for findings without `severity: "warning"`.

Uses the **same static manifest parser, import checks and directory validator as the repository's `validate-synware.mjs`**, compiled against the installed SDK's manifest schema and exports. It does not evaluate `Info.ts`. It then invokes the consumer's installed TypeScript compiler with `--noEmit --pretty false`; missing TypeScript or compiler failure is a finding, never a passing check. Set `typescript: false` only when intentionally requesting manifest/bundle checks without project type checking. Schema/import findings currently identify the containing file at line 1; TypeScript findings preserve the compiler's line and column.

For a directly imported `mountSynCloudOS` call with inline, literal host options, validation also reports `synware.application-menu` on a primary manifest missing `applicationMenu: { trigger: "content" }` when the app fills the page under `"optional"` or `"required"` authentication. This includes the default fullscreen frame and `frame: "declared"` with an `appView` presentation. A declared windowed primary or disabled authentication does not require this trigger.

With `authentication: "disabled"` (the default), nobody can sign in, so the host opens the primary application publicly whatever its manifest says. A primary that declares `runtime: { policy: { requiresLogin: true } }` contradicts that and fails to mount; validation reports it as `synware.public-policy` on its `Info.ts`.

`host.status` makes the limits explicit: `"checked"` means a single direct top-level mount's relevant options were read safely; `"unresolved"` supplies a reason when computed options, spreads, duplicate properties, nested/ambiguous calls or an unavailable primary prevent that check. `"not-found"` means no directly imported mount was found. The scanner reads project TypeScript/JavaScript source, excluding dependency, hidden, generated (`dist`, `build`, `coverage`), test, script and `.app` directories. It recognises named imports (including aliases) and namespace imports from `@syndromatic/syncloudos/browser`, but does not execute code, follow re-exports or evaluate wrappers/control flow. No missing-trigger finding is guessed for unresolved hosts. This checks the manifest declaration, not whether a handwritten component actually renders its trigger button; verify that interaction in the running app.

#### Launch check

A project that builds can still fail to start. A capability can be denied, a document might not exist yet, a launch hook can throw, or a view can throw on first render. Type checking cannot see any of these, so `validate` also launches the application.

It reads the module script that `index.html` loads (the host entry, usually `src/main.tsx`). It loads that script in a jsdom page through the project's own Vite configuration and plugins, so the production browser host launches the primary application as a browser would. The check runs in a child process with a 60-second limit and reports:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `launch.failed` | error | The host entry threw, or the launch did not commit. The message carries the cause, for example `APP_LAUNCH_FAILED: The workspace could not be opened`. |
| `launch.stopped` | error | The launch finished, but the page ended on a system alert. The message gives the alert text, its technical details (error code, message, where it was caught) and any errors logged. |
| `launch.error` | warning | Something was logged through `console.error` or thrown after launch, and the page did not end on an alert. |

The check needs `vite` and `jsdom` installed in the project. If either is missing, or `index.html` has no module script, `launch.ran` is `false` and `launch.reason` says why. The check then reports nothing as passing. Pass `launch: false` to skip it.

`launch.limits` lists what the page cannot show:

- There is no layout, canvas drawing or WebGL, so visual problems are not detected.
- Workers start but never reply, so work done in a worker is not checked.

A passing launch check means the application starts and renders without an error. It does not mean the application looks or behaves right; check that in a browser.

#### Idiom audit

A project can be valid and still bypass most of SynCloudOS. The idiom audit reports where an application departs from the [authoring contract](authoring-contract.md), as findings with `severity: "warning"`. Warnings never make `ok` false, but **a project with idiom warnings is not idiomatic SynCloudOS**; don't read "no errors" as done.

For each valid application, the audit follows the relative imports of `Contents/index.tsx`, including code outside the bundle such as `src/App.tsx`, and reports:

| Rule | Finds | Use instead |
| --- | --- | --- |
| `idiom.cocoa-class-authoring` | An application with no `NSEApplication` subclass, with the number of `useState`/`useReducer` hooks its code uses. | An `NSEApplication` subclass and `NSEViewController` with `@observable`, `bind`, `@action` and `actionRef`. |
| `idiom.nse-controls` | Raw `<button>`, `<input>` (except `hidden` and `file`), `<select>`, `<textarea>` and `<table>` elements, counted per file. | The named NSE control for each element. |
| `idiom.atmo-appearance` | A project stylesheet with 12 or more hard-coded colour literals, and any mention of the obsolete Atmo-Heritage or Atmo-Onyx raster themes. Every project stylesheet is checked, including those the host entry imports. | Atmo, which draws controls and chrome in light and dark, with semantic tokens. |
| `idiom.managed-lifecycle` | `requestAnimationFrame`, `new ResizeObserver`, `new IntersectionObserver` or `new Worker` inside a React effect. | `this.fx.animation.manageDisplayLink` or `manageRenderer`, and `managedTask`. |
| `idiom.document-state` | `preferences.set()` with a structured (non-literal) value. | A document type opened through `workspaceDocuments`. |

`idiomAudit.applications` summarises each application (`classAuthoring`, `stateHooks`, `rawControls`, `legacyThemeMentions`, `unmanagedLifecycle`, `preferenceDocumentWrites`, `filesScanned`), and `idiomAudit.stylesheets` the project stylesheets. The audit is static and conservative: it reads source and never runs it. Pass `idioms: false` to skip it.

Validation does not run package scripts or builds. TypeScript checks may write the compiler's incremental cache if the consumer enables it. The source repository's additional governed-source boundary audit is not applied to independent consumers.

### `scaffold`

Input: `{ projectRoot?, appsDirectory?, preferencesDirectory?, widgetsDirectory?, integrationsDirectory?, webspringEntry?, kind?: "application" | "preferencePane" | "widget" | "integration", organisation?, bundleIdentifier?, id?, name, route?, owners?, policy?, presentation?, contentApplicationMenu?, authoring?: "separate" | "inline" | "function" }`. `kind` defaults to `"application"`; `id` is only for non-application contributions. Integrations require nonempty owner bundle identifiers.

Output: `{ createdPaths: string[], nextSteps: string[] }`.

Creates a conventional project folder. By default (`authoring: "separate"`), `Name.app/Contents/index.tsx` default-exports an `NSEApplication` subclass whose `NSEViewController` holds `@observable` state, a binding and an `@action`, and `Contents/Views/` holds the view, built from NSE controls. `"inline"` keeps the view in `index.tsx`; `"function"` is an explicit opt-in for a function component. The CLI's `create-synware` uses the same templates. The required `Info.ts` contains explicit `bundleIdentifier`, `displayName` and `version: "1.0.0"`, typed as `SynWareInfo`. `organisation` defaults to `com.example`; the lowercased folder name is appended to form the identifier, unless an explicit `bundleIdentifier` is supplied. The display name splits folder-name words. Identity and version are never inferred during validation or taken from the project's package version. Other kinds create `Name.prefPane/index.tsx`, `Name.widget/index.tsx` or `Name.integration.ts` with the corresponding `define*` declaration; their unrelated IDs retain their names.

`policy` maps directly to `runtime.policy`, and `presentation` to `runtime.presentation`. Both are checked against the installed manifest schema before any files are written. Omitting `policy` preserves the normal private/default access behaviour; scaffolding never silently grants public access. With host authentication `"disabled"` or `"optional"`, the **primary** application must explicitly declare `policy: { public: true }`. The returned `nextSteps` flags this requirement whenever public access has not been requested. Do not apply it to private applications indiscriminately.

For example, scaffold a deliberate public primary with `{ bundleIdentifier: "org.example.notes", name: "Notes", route: "/notes", policy: { public: true }, contentApplicationMenu: true }`. `contentApplicationMenu: true` adds `applicationMenu: { trigger: "content" }` and an `ApplicationMenuButton` component that renders the `useApplicationMenuTrigger()` trigger as an `NSEPushButton`, with its anchor, open state, accessible menu semantics and toggle connected, placed in the view. This is required for a fullscreen primary under `"optional"` or `"required"` authentication, so people can reach Preferences, Account, Sign In and Log Out.

For a secondary windowed inspector, choose `presentation: "windowedView"` and declare only the access policy it actually needs. Omitting presentation also returns that windowed-secondary reminder; it is distinct from the desktop/tablet/mobile device presentations.

Names cannot contain path separators or Windows reserved device names. Targets must stay inside the project, cannot traverse symbolic links, and the entire target bundle must be absent. Existing bundles are never merged or overwritten. Review generated files and call `validate` before registering the app.

### `explain_error`

Input: `{ projectRoot?: string, query: string, limit?: number }` (`limit` defaults to 5, range 1–20).

Output: `{ version, classification: { kind, catalogue, message, codes? }, matches: [{ code, title, cause, fix, docs, appliesTo?, score }], sdkErrors: [{ entry, name, signature, jsDoc, file, score, docs }], related: [{ code, title, cause, fix, docs, appliesTo?, score }], relatedThreshold, nextSteps: string[], suggestedLookups: string[] }`.

`matches` contains **only whole error-code tokens** found in the installed global catalogue, at score `2`. Both `[NSE_CONTROLLER_DISPOSED]` and bare `AFX_LAYER_DISPOSED` work inside a pasted message; a code embedded in a longer identifier is not an exact match. A message without its canonical code is not treated as a confirmed diagnosis.

`classification.kind` is `catalogue`, `sdk-error`, `typescript`, `npm-warning` or `unclassified`. Exported SDK error classes such as `GFXColourParseError` are resolved through the installed public declarations and their re-exports; `sdkErrors` points to their signatures, typed fields and domain documentation. They need not have a global runtime code. `TS` diagnostics such as `TS2345` and npm warnings are explicitly outside that catalogue and receive tool-specific next steps. `suggestedLookups` lists symbol names from the input to try with `lookup_sdk`; it does not assert that those names are SDK exports.

Only an `unclassified` query receives fuzzy `related` suggestions. Their documented minimum score is `relatedThreshold: 0.3`; this is a retrieval threshold, **not diagnostic confidence**. Even a high similarity is never promoted into `matches`. Empty results and unrelated symptoms must not be interpreted as a login-session or other runtime failure. Documentation links are relative to the installed SDK package, with optional heading anchors.

## Maintaining the error catalogue

The framework source is `src/SynCloudOS/ErrorManager/errorCatalogue.ts`. Add a plain record with `code`, `title`, `cause` and `fix`, and optionally `docs` and `appliesTo`. The exported array and its records are frozen. Keep messages and fixes specific to the error, and point `docs` at a shipped framework guide. The build generates JSON from this data module, so there is no second hand-maintained MCP catalogue. A regression test requires all ErrorManager code literals, including conditional branches, to have entries.

## Check the packaged server

After a stable build, run:

```bash
node scripts/synware/check-developer-mcp-consumer.mjs
```

The acceptance script installs both actual archives into a temporary independent project, starts the installed server over stdio, lists all five tools, inspects the installed build receipt, looks up `SynWareInfo` from installed declarations and docs, scaffolds an app and validates it with the consumer's `tsc --noEmit`, and explains the canonical controller-disposal code. It removes the temporary consumer afterward.
