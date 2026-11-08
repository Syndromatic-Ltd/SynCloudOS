import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { synCloudOS } from "../../../scripts/synware/vite-plugin.mjs";
import { synWareSdkEntries } from "../../../scripts/synware/sdk-entries.mjs";
const root = fileURLToPath(new URL(".", import.meta.url));
const repository = resolve(root, "../../..");
export default defineConfig({ root, plugins: [synCloudOS({ webspringEntry: false }), {
  name: "private-attribution-fixture",
  enforce: "pre",
  resolveId(id) {
    if (id === "private:fx-attribution-contracts") return resolve(repository, "src/SynCloudOS/fxRuntimeContracts.ts");
    if (id === "@syndromatic/syncloudos" || id.startsWith("@syndromatic/syncloudos/")) {
      const name = id === "@syndromatic/syncloudos" ? "index" : id.slice("@syndromatic/syncloudos/".length);
      if (synWareSdkEntries[name]) return resolve(repository, synWareSdkEntries[name]);
    }
  },
}], test: { environment: "jsdom", include: ["consumer.test.tsx"], setupFiles: [resolve(repository, "tests/setup/runtimeEnvironment.ts")] } });
