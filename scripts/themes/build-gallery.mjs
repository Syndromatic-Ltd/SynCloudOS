import { build } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { synWareSdkEntries, synWarePackageName } from "../synware/sdk-entries.mjs";
import { decoratorEsbuildOptions } from "../synware/decorators.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
await build({ root, configFile: false, base: "./",
  esbuild: { ...decoratorEsbuildOptions },
  resolve: { alias: Object.entries(synWareSdkEntries).map(([entry, source]) => ({
    find: new RegExp("^" + synWarePackageName + (entry === "index" ? "" : "/" + entry) + "$"), replacement: resolve(root, source),
  })) },
  build: { outDir: resolve(root, ".artifacts/theme-gallery"), emptyOutDir: true,
    rollupOptions: { input: resolve(root, "tests/e2e/fixtures/theme-gallery.html") } },
});
