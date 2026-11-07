/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../scripts/synware/installed-consumer.mjs";

it("exports usable path items and workspace artwork from an independently installed SDK", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-file-browser-packed-");
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import assert from "node:assert/strict";
import { NSEPathControl, NSEPathControlItem, NSEWorkspace } from "@syndromatic/syncloudos/nse";
import { NSEPathControl as ControlEntry } from "@syndromatic/syncloudos/nse/controls";
assert.equal(NSEPathControl, ControlEntry);
assert.equal(typeof NSEPathControl.render, "function");
const image = NSEWorkspace.shared.iconForFile({ name: "Downloads", kind: "directory" });
assert.equal(typeof image, "string"); assert.ok(image.length > 10);
const item = new NSEPathControlItem({ title: "Downloads", image, url: "file:///Downloads" });
assert.equal(item.title, "Downloads"); assert.equal(item.image, image);
console.log("Installed path control and workspace passed");
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("Installed path control and workspace passed");
});
