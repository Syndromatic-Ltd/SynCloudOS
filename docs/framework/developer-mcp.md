# Developer MCP

The SynCloudOS Developer MCP server gives AI coding agents tools to inspect your project, look up the SDK, validate and scaffold code, and explain errors, over stdio. It reads the SDK installed in your project, not a framework checkout or an online documentation service. It doesn't inspect a running application, act as a WebMCP server or audit resource lifetimes.

## Install the matching companion

You need Node.js 22.23.4 or later on the 22 line, 24.22.1 or later on the 24 line, or 26.12.1 or later. Install `@syndromatic/syncloudos` and the matching `@syndromatic/syncloudos-developer-mcp` companion from npm:

```bash
npm install @syndromatic/syncloudos@beta
npm install --save-dev @syndromatic/syncloudos-developer-mcp@beta
```

The companion has an **exact-version** peer dependency on the SDK, and its server checks the installed version and refuses to run against a different one, so update both together.

If you're testing an unreleased framework checkout instead of npm, build the framework with `npm ci --ignore-scripts && npm run build`. The build writes two packages to `.artifacts/synapp-sdk/packages/` and two content-addressed `.tgz` archives to `.artifacts/synapp-sdk/archives/`:

- `syncloudos`: `@syndromatic/syncloudos`, the application SDK.
- `syncloudos-developer-mcp`: `@syndromatic/syncloudos-developer-mcp`, the developer server.

The exact local archive paths are in `.artifacts/synapp-sdk/build-manifest.json` (`archive` and `developerMcp.archive`). Install both local archives from the same build in your consumer project:

```bash
npm install /absolute/path/to/the-sdk-archive.tgz
npm install --save-dev /absolute/path/to/the-mcp-archive.tgz
```

Only the companion depends on `@modelcontextprotocol/sdk`, TypeScript, Zod and Ajv, so the browser SDK gains no MCP dependency. The SDK itself contains `docs/framework/`, `tooling/manifest.schema.json`, a generated `tooling/error-catalogue.json` and `tooling/build-receipt.json`. The receipt records the source commit and fingerprint, and the build manifest also records the archives' integrity. Once dependencies are installed, the tools need no network access.

The companion package also ships its own `README.md` with the install, `--project` and client-configuration steps on this page. If `npm install` reports blocked install scripts for `esbuild`, see [Install in Getting started](getting-started.md#install).

## Configure a TOML-configured client

For a coding agent that reads MCP servers from a TOML file, add this to its configuration file, replacing the two project paths with your absolute consumer-project path:

```toml
[mcp_servers.syncloudos]
command = "node"
args = ["/absolute/project/node_modules/@syndromatic/syncloudos-developer-mcp/scripts/developer-mcp/server.mjs", "--project", "/absolute/project"]
```

On Windows, forward slashes work in these paths (`C:/Projects/my-site/...`). Running the installed entry point with `node` avoids shell-specific `.cmd` wrappers and accidental `npx` downloads. The package also installs a `syncloudos-mcp` bin for terminal use:

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

The server writes only MCP protocol messages to stdout; configuration and startup messages go to stderr. Without `--project`, it starts from the working directory. Every tool accepts an optional `projectRoot`. The server looks upward for the nearest `package.json` and resolves the SDK from there, as your project would.

## Tool reference

Every successful call returns the result twice: as JSON text and as the same object in MCP `structuredContent`. A failure returns `isError: true` with a text explanation. Paths in findings and lists of created files are relative to the project, while SDK locations and the project root are absolute.

### `inspect_project`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false }`.

Output: `{ projectRoot, sdk: { version, path, buildReceipt }, vite: { config, pluginPresent, options, unresolved }, bundles: [{ directory, bundleIdentifier, displayName, manifest, resolvedManifest, entry, error }], folders: [{ directory, kind }], shell: { enabled, path, exists, info, infoExists }, dependencies, devDependencies }`.

Finds `*.app` bundles with the Vite plugin's own discovery rules: `src/SynWare` by default, bundle suffixes in any case, no names that differ only in case, no symbolic links, and both `Contents/Info.ts` and `Contents/index.tsx`. It reports incomplete bundles so you can fix them. The default shell is `src/Webspring/Contents/index.tsx`.

The Vite configuration is parsed **without running it**. Literal `synCloudOS({ appsDirectory, webspringEntry })` options are understood, even through an aliased import. If the options are computed, pass them to the tool explicitly; it won't guess a directory.

### `lookup_sdk`

Input: `{ projectRoot?: string, entry?: string, query?: string, limit?: number, full?: boolean }` (`limit` defaults to 8, range 1 to 100).

With neither `entry` nor `query`, output is `{ version, entries: string[] }`. Otherwise output is `{ version, symbols: [{ entry, entries, name, signature, outlined, jsDoc, file, line, score, appkitCounterpart?, usage?, galleryExample? }], retired?, concept?, docs: [{ file, heading, text, truncated, score }] }`.

Use entry names such as `sdk`, `nse` or `fx/animation`. An entry without a query lists its exports. A query fuzzy-matches exported names, follows re-exports, and returns signatures, their JSDoc and relevant sections of the installed framework docs. A query with no confident match returns no symbols instead of inventing one. Each symbol appears once: `entries` lists every package entry that exports it and `entry` is the one to import from. A class or interface longer than about 1,200 characters comes back as an outline, its header and public member signatures without bodies, with `outlined: true`; pass `full: true` for complete declarations. At most three documentation sections are returned, each capped at 1,500 characters with `truncated: true` when cut; read the named `file` for the rest.

Every NSE symbol carries `appkitCounterpart`, read from the installed `docs/framework/appkit-counterparts.json`. It's either the AppKit or Foundation name the symbol follows (such as `"NSPopUpButton"`), or `{ none, replacement? }` explaining why there's no counterpart and what to use instead. A type such as `NSEButtonProps` takes its class's counterpart. When an entry has a `replacement`, prefer it.

`lookup_sdk` also accepts those counterpart names (such as `NSPopUpButton`) and plain-English descriptions (such as `"circular slider"`, `"angle dial"`, `"knob"`, `"status bar"`, `"source list"` or `"application menu"`). It returns the matching NSE symbol, a `usage` hint (for example `NSESlider sliderType="circular"`) and, where there is one, the Control Gallery example name (such as `"Wrapping angle dial"`). Exact exported names always rank first.

### `validate`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false, typescript?: boolean, idioms?: boolean, launch?: boolean }` (`typescript`, `idioms` and `launch` default to `true`).

Output: `{ ok: boolean, findings: [{ file, line, column?, rule, severity?, message }], bundles: [{ directory, kind, bundleIdentifier, manifest, ok, error? }], typescript: { ran, exitCode, projects }, launch: { ran, entry?, reason?, limits? }, host: { status: "checked" | "unresolved" | "not-found", reason?, file?, line?, application?: { bundleIdentifier, frame } | null, authentication? }, idiomatic: boolean | null, idiomAudit: { applications: [...], stylesheets: {...}, errors, warnings, idiomatic, optOuts, rendererExemptions } | null }`. `ok` is false if there's any error, including idiom findings with `severity: "error"`; warnings alone don't fail validation. `idiomatic` is false if there's an idiom finding of either severity, and `null` when the audit is skipped.

It uses **the same static manifest parser, import checks and folder validator as `npm run synware:validate`**, checked against the installed SDK's manifest schema and exports, and never runs `Info.ts`. It then runs your project's TypeScript compiler with `--noEmit --pretty false`. Missing TypeScript or a compiler failure is a finding, never a pass. Set `typescript: false` only when you want manifest and bundle checks without type checking. Schema and import findings currently point at line 1 of the file; TypeScript findings keep the compiler's line and column.

An application must offer its application menu through `NSEApplication.mainMenu`, `NSEToolbarItem.applicationMenu("gear")` or a `useApplicationMenuTrigger` button of its own, unless it declares a reasoned `// syncloudos-allow idiom.application-menu: <reason>` exception or runs as a headless `backgroundService`. Validation reports a missing application menu as `idiom.application-menu`, duplicate window title bars or toolbars as `idiom.duplicate-chrome`, duplicate visible QuickSwitch title toggles as `idiom.duplicate-quickswitch`, hand-drawn controls that duplicate existing NSE controls (such as an angle/rotation dial instead of `NSESlider sliderType="circular"`) as `idiom.hand-drawn-control`, and duplicate Return to Webspring or application-menu buttons in a window as a warning (`idiom.duplicate-window-action`).

With `authentication: "disabled"` (the default), nobody can sign in, so the host opens the primary application publicly whatever its manifest says. A primary application that declares `runtime: { policy: { requiresLogin: true } }` contradicts that and fails to mount, and validation reports it as `synware.public-policy` on its `Info.ts`.

`host.status` says how far the host check got. `"checked"` means the options of a single top-level `mountSynCloudOS` call were read. `"unresolved"` comes with a reason, such as computed options, spreads, duplicate properties, nested or ambiguous calls, or a missing primary application. `"not-found"` means no directly imported mount call was found. The scanner reads your TypeScript and JavaScript source, skipping dependency, hidden, generated (`dist`, `build`, `coverage`), test, script and `.app` directories. It recognises named imports (including aliases) and namespace imports from `@syndromatic/syncloudos/browser`, but doesn't run code, follow re-exports or evaluate wrappers and control flow, and it skips host-policy checks for a host it couldn't resolve. Static checks read declarations rather than whether your own component renders its menu button at runtime, so verify interactive chrome in the running application.

#### Launch check

A project that builds can still fail to start. A capability can be denied, a document might not exist yet, a launch hook can throw, or a view can throw on first render. Type checking cannot see any of these, so `validate` also launches the application.

It finds the module script that `index.html` loads (the host entry, usually `src/main.tsx`) and runs it in a jsdom page through your project's own Vite configuration and plugins, so the browser host launches the primary application as it would in a browser. The check runs in a child process with a 60-second limit and reports:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `launch.failed` | error | The host entry threw, or the launch did not commit. The message carries the cause, for example `APP_LAUNCH_FAILED: The workspace could not be opened`. |
| `launch.stopped` | error | The launch finished, but the page ended on a system alert. The message gives the alert text, its technical details (error code, message, where it was caught) and any errors logged. |
| `launch.error` | warning | Something was logged through `console.error` or thrown after launch, and the page did not end on an alert. |

The check needs `vite` and `jsdom` installed in the project. If either is missing, or `index.html` has no module script, `launch.ran` is `false`, `launch.reason` says why, and nothing is reported as passing. Pass `launch: false` to skip it.

`launch.limits` lists what the page cannot show:

- There is no layout, canvas drawing or WebGL, so visual problems are not detected.
- Workers start but never reply, so work done in a worker is not checked.

A passing launch check means the application starts and renders without an error, not that it looks or behaves right; check that in a browser.

#### Idiom audit

The audit follows the imports of your applications, host and Webspring, including relative imports outside bundles, and checks your CSS. It reports at two levels: **error** for definite misuse where a public replacement exists, and **warning** for heuristics. Every error names its replacement and the exact import path. `ok: false` means at least one validation error, and `idiomatic: false` also counts unresolved idiom warnings.

[Idiom rules](developer-mcp/idiom-rules.md) lists every rule identifier and its limits. Definite checks cover raw controls, system images/artwork and glyph titles, UI colour overrides, raw preferences/device APIs, forced system appearances, private NSE class selectors and all-caps eyebrows directly above titles. Overflow in CSS or inline styles is a warning, and code samples and document content don't fail validation. Static tables of content are fine, but a table with interactive contents, row selection or click handlers should be an `NSETableView`. Other heuristics cover animation curves, reduced motion, layer ownership, visibility callbacks, pixel sprites, near-complete circles, resource references and imports that should now come from Foundation.

Appearance checks keep application styling theme-neutral. Atmo is the default theme, and your own theme is equally valid; colour literals are allowed in a theme's own values. There's no `NSEColor` or `NSEColour` class: interface content uses the semantic colour tokens, and graphics use `GFXColour` from `@syndromatic/syncloudos/fx/graphics`. A raw `<video>` is only a warning, because VideoFX has no complete player view with controls to replace it.

Only canvas, `Canvas` and `Stage` subtrees owned by a renderer, and renderer calls, are exempt. `idiomAudit.rendererExemptions` lists each one's file, UTF-16 start and end offsets, `line` and `endLine`, and kind (`surface` or `call`). Ordinary interface code is still checked, even a raw HUD button in the same file as a Three.js `WebGLRenderer`. APIs the framework has no equivalent for, such as `fetch` and maths or utility libraries, are fine.

Use a reasoned inline opt-out for deliberate exceptions:

```tsx
// syncloudos-allow idiom.nse-controls: native bridge requires this element
const bridge = <button>Open native panel</button>;
```

The comment suppresses only the named rule, on its own line or the next. In CSS, write `/* // syncloudos-allow idiom.rule-id: reason */`. The reason is required, and a missing one is an error. `idiomAudit.optOuts` lists every directive with its location, whether it's valid and how many findings it suppressed, including unused ones. Strings and other comments can't opt out. Pass `idioms: false` to skip the audit.

Validation never runs package scripts or builds. The TypeScript check may write the compiler's incremental cache if your project enables it. The framework repository's own source boundary checks don't apply to your project.

### `scaffold`

Input: `{ projectRoot?, appsDirectory?, preferencesDirectory?, widgetsDirectory?, integrationsDirectory?, webspringEntry?, kind?: "application" | "preferencePane" | "widget" | "integration" | "webspring", organisation?, bundleIdentifier?, id?, name, route?, owners?, policy?, presentation?: "stage" | "window" | "systemSheet" | "backgroundService", applicationMenuToolbar?: boolean, authoring?: "separate" | "inline" | "function" }`. `kind` defaults to `"application"`, and `id` is only for contributions other than applications. Integrations need at least one owner bundle identifier.

Output: `{ createdPaths: string[], nextSteps: string[] }`.

Creates a project folder in the standard layout. By default (`authoring: "separate"`), `Name.app/Contents/index.tsx` default-exports an `NSEApplication` subclass whose `NSEViewController` holds `@observable` state, a binding and an `@action`, and `Contents/Views/` holds a view built from NSE controls. `"inline"` keeps the view in `index.tsx`, and `"function"` creates a function component instead. `create-synware` uses the same templates. The `Info.ts` declares `bundleIdentifier`, `displayName` and `version: "1.0.0"`, typed as `SynWareInfo`. Unless you pass `bundleIdentifier`, the identifier is `organisation` (default `com.example`) followed by the lowercased folder name, and the display name is the folder name split into words. Identity and version are never guessed during validation or taken from the project's package version.

The other kinds create `Name.prefPane/index.tsx` with an `NSEPreferencePane` subclass, `Name.widget/index.tsx` with a `WSWidget` subclass, `Name.integration.ts` with a `defineIntegration` declaration, or the shell's `Info.ts` and `WSApplication` subclass for `"webspring"`.

`policy` becomes the manifest's `runtime.policy`, and `presentation` its `runtime.presentation`; both are checked against the installed manifest schema before anything is written. Without `policy`, the application keeps the default private access, because scaffolding never makes anything public on its own. With host authentication `"disabled"`, the host opens the primary application publicly; with `"optional"`, set `policy: { public: true }` on the **primary** application if it must open before anyone signs in, and `nextSteps` reminds you whenever you didn't ask for public access. Don't add it to private applications.

For example, scaffold a public primary application with `{ bundleIdentifier: "org.example.notes", name: "Notes", route: "/notes", policy: { public: true }, applicationMenuToolbar: true }`. `applicationMenuToolbar` adds an application-menu item to the main window's toolbar.

For a secondary application that opens in a window, such as an inspector, pass `presentation: "window"` and only the access policy it needs. If you leave out `presentation`, `nextSteps` reminds you that `"stage"`, the default, is for the primary application.

Names can't contain path separators or Windows reserved device names. The target must be inside the project, can't pass through a symbolic link, and mustn't exist yet; existing bundles are never merged or overwritten. Review the generated files and run `validate` afterwards.

### `scaffold_theme`

Input: `{ projectRoot?: string, bundleIdentifier: string, displayName: string, directory?: string }`.

Creates `<directory>/<displayName>.scostheme` (default directory `src/Themes`), a complete theme bundle:

- `Contents/Info.ts`: the bundle identifier, display name, version and theme contract version. It's read as data, since a theme contains no code.
- `Contents/Theme.json`: every contract colour in light and dark, starting from Atmo's values and marked for replacement, with Atmo's navigation and presentation choices.
- `Contents/Resources/theme.css`: an empty rule for every control and every paintable part in the installed contract (excluding `structuralParts`), grouped by control, with each control's states noted.

It refuses existing bundles, paths outside the project and symbolic links, and never overwrites anything. The new bundle validates with no errors, and lists every part as undrawn until you draw it.

### `validate_theme`

Input: `{ projectRoot?: string, path: string }`, naming a `.scostheme` bundle.

Returns `{ ok, errors, warnings, coverage }`:

- `errors`: bundle rule violations (unknown hooks, classes or tags, forbidden animations or literal transition timings, executable code or non-WOFF2 fonts in the bundle, invalid colours or images) and hard-limit violations (`idiom.theme-limit`, `idiom.theme-private-class`). Any error makes `ok` false.
- `warnings`: paintable contract parts the theme does not draw, as `control.part`. Atmo draws them instead, so they never make `ok` false.
- `coverage`: drawn and total paintable parts.

Both tools read the installed `tooling/nse-theme-contract.json`, which is generated from the rendered controls, and read CSS, JSON and `Info.ts` without running anything. The SDK's own `themes/Atmo.scostheme` validates with no errors and no undrawn parts.

### `explain_error`

Input: `{ projectRoot?: string, query: string, limit?: number }` (`limit` defaults to 5, range 1 to 20).

Output: `{ version, classification: { kind, catalogue, message, codes? }, matches: [{ code, title, cause, fix, docs, diagnosis, appliesTo?, score }], sdkErrors: [{ entry, name, signature, jsDoc, file, score, docs }], related: [{ code, title, cause, fix, docs, appliesTo?, score }], relatedThreshold, nextSteps: string[], suggestedLookups: string[] }`.

`matches` contains **only whole error codes** from the installed catalogue, at score `2`. Both `[NSE_CONTROLLER_DISPOSED]` and a bare `AFX_LAYER_DISPOSED` are found inside a pasted message, but a code inside a longer identifier isn't. A message without its code is never treated as a confirmed diagnosis.

`classification.kind` is `catalogue`, `sdk-error`, `typescript`, `npm-warning` or `unclassified`. Exported SDK error classes such as `GFXColourParseError` are found through the installed declarations and their re-exports, and `sdkErrors` points to their signatures, typed fields and documentation; they don't need a catalogue code. TypeScript diagnostics such as `TS2345` and npm warnings aren't in the catalogue and get their own next steps. `suggestedLookups` lists names from the input to try with `lookup_sdk`, without claiming they're SDK exports.

Only an `unclassified` query gets fuzzy `related` suggestions, with a minimum score of `relatedThreshold: 0.3`. That's a search threshold, **not diagnostic confidence**, and even a close match never moves into `matches`. Don't read empty results or unrelated suggestions as a login-session or other runtime failure. Documentation links are relative to the installed SDK package, sometimes with a heading anchor.

## Maintaining the error catalogue

This section is for framework contributors. The catalogue's source is `src/SynCloudOS/ErrorManager/errorCatalogue.ts`. Add a plain record with `code`, `title`, `cause` and `fix`, and optionally `docs` and `appliesTo`; the exported array and its records are frozen. Keep the message and fix specific to the error, and point `docs` at a guide that ships with the SDK. The build generates the JSON from this module, so there's no separate MCP catalogue to maintain. A test requires every error code literal in the error manager, including those in conditional branches, to have an entry.

## Check the packaged server

In a framework checkout, after a build, run:

```bash
node scripts/synware/check-developer-mcp-consumer.mjs
```

The script installs both archives into a temporary project, starts the installed server over stdio, lists all seven tools, reads the build receipt, looks up `SynWareInfo` in the installed declarations and docs, scaffolds an application and validates it with the project's `tsc --noEmit`, and explains the controller-disposal code. It also checks theme scaffolding and validation, an authoring error and a reasoned opt-out, then removes the temporary project.
