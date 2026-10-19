# SynCloudOS Developer MCP

`@syndromatic/syncloudos-developer-mcp` is an offline Model Context Protocol server for AI coding agents. It reads the `@syndromatic/syncloudos` SDK installed in your project and offers project inspection, SDK lookup, validation, SynWare scaffolding and error explanations over stdio. It makes no network requests.

## Install

The public beta is not published to the npm registry. Install the companion from the archive built alongside your SDK archive, as a development dependency of your consumer project:

```bash
npm install /absolute/path/to/the-sdk-archive.tgz
npm install --save-dev /absolute/path/to/the-mcp-archive.tgz
```

The companion's version **must match** the installed SDK exactly. It declares an exact-version peer dependency on `@syndromatic/syncloudos`, and the server refuses to start against a different version. Update both together.

## Run

The package installs one bin, `syncloudos-mcp`:

```bash
npx --no-install syncloudos-mcp --project /absolute/project
```

`--project` is the consumer project root. Without it, the server starts from the process working directory. Protocol messages go to stdout; diagnostics go to stderr.

## Configure a client

Point your coding agent's MCP configuration at the installed entrypoint, replacing both paths with your absolute project path. Using `node` with the entrypoint avoids shell-specific `.cmd` wrappers and accidental `npx` downloads.

A client that reads MCP servers from a TOML file:

```toml
[mcp_servers.syncloudos]
command = "node"
args = ["/absolute/project/node_modules/@syndromatic/syncloudos-developer-mcp/scripts/developer-mcp/server.mjs", "--project", "/absolute/project"]
```

A client that reads a project-scoped `.mcp.json`:

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

On Windows, forward slashes work in these paths (`C:/Projects/my-site/...`).

## Tools and full guide

The tool reference, input schemas and troubleshooting are in the installed SDK's documentation: `node_modules/@syndromatic/syncloudos/docs/framework/developer-mcp.md`.
