import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../scripts/synware/installed-consumer.mjs";

it.each([false, true])("bundles an installed browser host with discovery plugin=%s", plugin => {
  const consumer = createInstalledConsumer(process.cwd(), "scos-project-packed-");
  try {
    mkdirSync(join(consumer.root, "src/SynWare/Notes.app/Contents"), { recursive: true });
    writeFileSync(join(consumer.root, "src/SynWare/Notes.app/Contents/Info.ts"), 'export default { bundleIdentifier: "com.example.notes", displayName: "Notes", version: "1.0.0" };');
    writeFileSync(join(consumer.root, "src/SynWare/Notes.app/Contents/index.tsx"), "import React from \"react\"; import { SCOS } from \"@syndromatic/syncloudos\"; export default function Notes() { return <p>{SCOS.app.displayName}</p>; }");
    writeFileSync(join(consumer.root, "src/main.tsx"), `import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
      const composition = { bundles: [], preferences: [], widgets: [], contributions: [], shell: null, shellResources: {} };
      window.startHost = () => mountSynCloudOS({ element: document.body, application: { bundleIdentifier: "com.example.notes" }, ${plugin ? "" : "composition,"} authentication: "disabled" });`);
    writeFileSync(join(consumer.root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.tsx"></script>');
    writeFileSync(join(consumer.root, "vite.config.mjs"), plugin
      ? 'import { synCloudOS } from "@syndromatic/syncloudos/vite"; export default {plugins:[synCloudOS({webspringEntry:false})]};'
      : 'export default {};');
    const output = runNode([join(consumer.root, "node_modules/vite/bin/vite.js"), "build"], consumer.root);
    expect(output).toContain("built in");
  } finally { rmSync(consumer.root, { recursive: true, force: true }); }
}, 120_000);
