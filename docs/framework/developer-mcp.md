# Developer MCP

The SynCloudOS Developer MCP server gives AI coding agents local project inspection, SDK lookup, validation, scaffolding and error explanations over stdio. It reads the SDK installed in your project, not a checkout or a remote documentation service. It does not inspect a running application, expose AgentKit/WebMCP, or audit resource lifetimes.

## Install the matching companion

Use Node.js 22.12 or later. Build the framework with `npm ci --ignore-scripts && npm run build`. The build writes two packages to `.artifacts/synapp-sdk/packages/` and two content-addressed `.tgz` archives to `.artifacts/synapp-sdk/archives/`:

- `syncloudos`: `@syndromatic/syncloudos`, the application SDK.
- `syncloudos-developer-mcp`: `@syndromatic/syncloudos-developer-mcp`, the developer server.

The exact archive paths are in `.artifacts/synapp-sdk/build-manifest.json`: `archive` is the SDK archive and `developerMcp.archive` is the companion archive. Install both archives from the same build in your consumer project:

```bash
npm install /absolute/path/to/the-sdk-archive.tgz
npm install --save-dev /absolute/path/to/the-mcp-archive.tgz
```

These paths stand for the actual filenames from that build manifest; the beta packages are not assumed to be published to npm. The companion has an **exact-version** peer dependency on the SDK. Its server also checks the installed version and refuses a mismatch. Update both together.

Only the companion depends on the official `@modelcontextprotocol/sdk`, TypeScript, Zod and the validator's Ajv runtime. Adding MCP does not add an MCP runtime dependency to the browser SDK. The SDK contains `docs/framework/`, `tooling/manifest.schema.json`, a generated `tooling/error-catalogue.json` and `tooling/build-receipt.json`. The receipt records the source commit and source fingerprint; the external build manifest additionally records archive integrity. No network access is needed for the tools once dependencies are installed.

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

### `syncloudos.inspect_project`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false }`.

Output: `{ projectRoot, sdk: { version, path, buildReceipt }, vite: { config, pluginPresent, options, unresolved }, bundles: [{ directory, id, manifest, entry, error }], shell: { enabled, path, exists }, dependencies, devDependencies }`.

Discovers direct `*.app` bundles using the Vite plugin's shared discovery rules: default `src/SynWare`, case-insensitive bundle suffixes, no case-colliding names or symbolic links, and `Contents/Info.ts` plus `Contents/index.tsx`. It reports incomplete bundles so they can be repaired. The default shell is `src/Webspring/Contents/index.tsx`.

Vite configuration is parsed **without executing it**. Literal `synCloudOS({ appsDirectory, webspringEntry })` options, including an aliased named import, are understood. Computed options require explicit tool overrides rather than guessing a directory. This is inspection of configuration hints, not execution of Vite's configuration pipeline.

### `syncloudos.lookup_sdk`

Input: `{ projectRoot?: string, entry?: string, query?: string, limit?: number }` (`limit` defaults to 20, range 1–100).

With neither `entry` nor `query`, output is `{ version, entries: string[] }`. Otherwise output is `{ version, symbols: [{ entry, name, signature, jsDoc, file, score }], docs: [{ file, heading, text, score }] }`.

Use entry names such as `sdk`, `nse` or `fx/animation`. An entry without a query lists its exports. Queries fuzzy-match exported names, follow declaration re-exports and return declaration signatures, attached JSDoc and relevant sections of the installed framework docs. A low-confidence query can return no symbols; it does not invent an API. Returned documentation sections are capped at 6,000 characters each.

### `syncloudos.validate`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false, typescript?: boolean }` (`typescript` defaults to `true`).

Output: `{ ok: boolean, findings: [{ file, line, column?, rule, message }], bundles: [{ directory, id, ok, error }], typescript: { ran, exitCode } }`.

Uses the **same static manifest parser, import checks and directory validator as the repository's `validate-synware.mjs`**, compiled against the installed SDK's manifest schema and exports. It does not evaluate `Info.ts`. It then invokes the consumer's installed TypeScript compiler with `--noEmit --pretty false`; missing TypeScript or compiler failure is a finding, never a passing check. Set `typescript: false` only when intentionally requesting manifest/bundle checks without project type checking. Schema/import findings currently identify the containing file at line 1; TypeScript findings preserve the compiler's line and column.

Validation does not run package scripts or builds. TypeScript checks may write the compiler's incremental cache if the consumer enables it. The source repository's additional governed-source boundary audit is not applied to independent consumers.

### `syncloudos.scaffold`

Input: `{ projectRoot?: string, appsDirectory?: string, webspringEntry?: string | false, id: string, name: string, route: string }`.

Output: `{ createdPaths: string[] }`.

Creates the existing SynWare bundle shape demonstrated by `examples/TextSystem.app`: `Name.app/Contents/Info.ts`, `Contents/index.tsx` exporting a real `createSynWare` definition, and `Contents/Resources/Localised/Base.locale/Localisable.strings`. The app has the requested id, title and route and supports desktop/tablet/mobile presentations. It does not copy the Text System demo's private document model or font requirements into unrelated apps.

Names cannot contain path separators or Windows reserved device names. Targets must stay inside the project, cannot traverse symbolic links, and the entire target bundle must be absent. Existing bundles are never merged or overwritten. Review generated files and call `syncloudos.validate` before registering the app.

### `syncloudos.explain_error`

Input: `{ projectRoot?: string, query: string, limit?: number }` (`limit` defaults to 5, range 1–20).

Output: `{ version, matches: [{ code, title, cause, fix, docs, appliesTo?, score }] }`.

Accepts a stable error code or a pasted message. Exact code matches rank first; fuzzy message matches are suggestions, not evidence that a particular failure occurred. Documentation links are paths relative to the installed SDK package, with optional heading anchors.

## Maintaining the error catalogue

The framework source is `src/SynCloudOS/ErrorManager/errorCatalogue.ts`. Add a plain record with `code`, `title`, `cause` and `fix`, and optionally `docs` and `appliesTo`. The exported array and its records are frozen. Keep messages and fixes specific to the error, and point `docs` at a shipped framework guide. The build generates JSON from this data module, so there is no second hand-maintained MCP catalogue. A regression test requires all ErrorManager code literals, including conditional branches, to have entries.

## Check the packaged server

After a stable build, run:

```bash
node scripts/synware/check-developer-mcp-consumer.mjs
```

The acceptance script installs both actual archives into a temporary independent project, starts the installed server over stdio, lists all five tools, inspects the installed build receipt, looks up `createSynWare` from installed declarations and docs, scaffolds an app and validates it with the consumer's `tsc --noEmit`, and explains a pasted controller-disposal message. It removes the temporary consumer afterward.
