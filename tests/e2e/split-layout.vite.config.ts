import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { hookMirrorJSX } from "../../scripts/synware/hook-mirror-jsx.mjs";
import { createDecoratorHooks } from "../../scripts/synware/decorators.mjs";
import { synWareSdkEntries, synWarePackageName } from "../../scripts/synware/sdk-entries.mjs";

const root = resolve(import.meta.dirname, "../..");
const baselineRef = process.env.SPLIT_BASELINE_REF;
const baseline = new Map(baselineRef ? [
  "src/NSE/DataViews/Split/splitViewControllerView.tsx",
  "src/NSE/DataViews/Split/splitViewController.css",
].map(file => [normalizePath(resolve(root, file)), execFileSync("git", ["show", `${baselineRef}:${file}`], { cwd: root, encoding: "utf8" })]) : []);

export default defineConfig({
  root,
  cacheDir: resolve(root, `.artifacts/split-layout-vite-${baselineRef ? "before" : "after"}`),
  optimizeDeps: { entries: ["tests/e2e/fixtures/split-layout/index.html"] },
  resolve: { alias: Object.entries(synWareSdkEntries).map(([entry, source]) => ({
    find: new RegExp("^" + synWarePackageName + (entry === "index" ? "" : "/" + entry) + "$"), replacement: resolve(root, source),
  })) },
  plugins: [
    { name: "split-layout-baseline", enforce: "pre", load(id) { return baseline.get(normalizePath(id.split("?")[0]!)); } },
    react(), hookMirrorJSX(), { name: "split-layout-decorators", ...createDecoratorHooks() },
    { name: "split-layout-page", configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url?.split("?")[0] === "/") request.url = "/tests/e2e/fixtures/split-layout/index.html" + (request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : "");
        next();
      });
    } },
  ],
  server: { host: "127.0.0.1", strictPort: true },
});
