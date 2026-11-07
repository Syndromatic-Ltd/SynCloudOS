// Use the exact site's existing founder-preview configuration, with an
// isolated cache so another preview process cannot replace its optimised
// dependencies. This changes no product source or shared preview config.
import { createServer } from "../../../../../site/node_modules/vite/dist/node/index.js";
import { fileURLToPath } from "node:url";
const site = fileURLToPath(new URL("../../../../../site/", import.meta.url));
const server = await createServer({
  root: site,
  configFile: fileURLToPath(new URL("../../../../../site/vite.claude-5199.config.mts", import.meta.url)),
  cacheDir: fileURLToPath(new URL("../../../../../site/node_modules/.vite-about-5199/", import.meta.url)),
  optimizeDeps: { force: true },
  server: { host: "127.0.0.1", port: 5199, strictPort: true },
});
await server.listen(); server.printUrls();
