import { createServer } from "vite";
import { resolve } from "node:path";

const baseline = "C:/Users/Kavish Krishnakumar/.codex/worktrees/window-transfer-spike/framework";
const server = await createServer({
  configFile: resolve(baseline, "tests/e2e/vite.config.ts"),
  root: baseline,
  cacheDir: resolve(process.cwd(), ".artifacts/window-titlebar-baseline-vite"),
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { noDiscovery: false, entries: [resolve(baseline, "tests/e2e/fixtures/theme-baseline/index.html")], include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "linebreak", "bidi-js"] },
  server: { host: "127.0.0.1", port: 5422, strictPort: true, hmr: false },
});
await server.listen();
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
