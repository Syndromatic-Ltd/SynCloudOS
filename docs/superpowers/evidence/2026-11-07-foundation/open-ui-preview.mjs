/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
// The named site's founder preview, with a port-specific cache so concurrent
// previews cannot replace each other's optimised dependencies. No product config changes.
import { createServer } from "../../../../../site/node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../../../../../site/", import.meta.url));
const server = await createServer({
  root: site,
  configFile: fileURLToPath(new URL("../../../../../site/vite.claude-5199.config.mts", import.meta.url)),
  cacheDir: fileURLToPath(new URL("../../../../../site/node_modules/.vite-open-panel-5199/", import.meta.url)),
  optimizeDeps: { force: true, include: ["@syndromatic/syncloudos/foundation"] },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
await server.listen();
server.printUrls();
