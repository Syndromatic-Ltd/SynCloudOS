/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createInstalledConsumer, runNode } from "../../scripts/synware/installed-consumer.mjs";

it("uses Foundation and CPFX from an independent SDK installation in a worker and strict worker-lib consumer", () => {
  const consumer = createInstalledConsumer(process.cwd(), "synware-foundation-packed-");
  writeFileSync(join(consumer.root, "worker.mjs"), `
import assert from "node:assert/strict";
import { parentPort } from "node:worker_threads";
import { NSEData, NSEUserDefaults, NSEIndexSet, NSEDateFormatter, NSEDecimalNumber, NSEDecimalNumberHandler, NSEValueTransformer, NSEUndoManager } from "@syndromatic/syncloudos/foundation";
import { CPFXCapabilities, CPFXCompress, CPFXDecompress, CPFXInputFilter } from "@syndromatic/syncloudos/fx/compression";
assert.equal(typeof window, "undefined");
assert.equal(typeof document, "undefined");
const original = NSEData.from(new TextEncoder().encode("Foundation in a worker ".repeat(100)));
const copied = original.bytes;
copied[0] = 0;
assert.notEqual(original.bytes[0], 0);
assert.equal(NSEData.fromBase64(original.base64EncodedString()).isEqual(original), true);
const capabilities = CPFXCapabilities.query();
assert.ok(capabilities.algorithms.includes("gzip"));
assert.equal((await CPFXDecompress(await CPFXCompress(original, "gzip"), "gzip")).isEqual(original), true);
const defaults = new NSEUserDefaults(); defaults.set("worker", "name"); assert.equal(defaults.object("name"), "worker");
assert.equal(NSEIndexSet.fromIndexes([1, 2, 4]).count, 3);
const dates = new NSEDateFormatter({ locale: "en-GB", timeZone: "UTC", dateFormat: "yyyy-MM-dd" });
assert.equal(dates.date(dates.string(new Date("2026-11-07T00:00:00Z"))).toISOString(), "2026-11-07T00:00:00.000Z");
assert.equal(NSEDecimalNumber.fromString("0.1").adding(NSEDecimalNumber.fromString("0.2")).toString(), "0.3");
assert.equal(NSEDecimalNumber.one.dividing(NSEDecimalNumber.fromString("8"), new NSEDecimalNumberHandler({scale:2,roundingMode:"bankers"})).toString(), "0.12");
class Twice extends NSEValueTransformer { transformedValue(value) { return value * 2; } }
NSEValueTransformer.setValueTransformer(new Twice(), "worker-twice");
assert.equal(NSEValueTransformer.valueTransformerForName("worker-twice").transformedValue(3), 6);
const undo = new NSEUndoManager(), target = { value: 1 };
function change(object, value) { const old = object.value; undo.registerUndo(object, next => change(next, old)); object.value = value; }
change(target, 2); undo.undo(); assert.equal(target.value, 1); undo.redo(); assert.equal(target.value, 2);
parentPort.postMessage("Foundation and CPFX installed worker passed");
`);
  writeFileSync(join(consumer.root, "specimen.mjs"), `
import { Worker } from "node:worker_threads";
const worker = new Worker(new URL("./worker.mjs", import.meta.url));
worker.on("message", message => console.log(message));
worker.on("error", error => { console.error(error); process.exitCode = 1; });
`);
  expect(runNode(["specimen.mjs"], consumer.root)).toContain("Foundation and CPFX installed worker passed");
  writeFileSync(join(consumer.root, "consumer.ts"), `
import { NSEData, NSEUserDefaults, NSEIndexSet, NSENumberFormatter, NSEDateFormatter, NSEDecimalNumber, NSEDecimalNumberHandler, NSEUndoManager, NSEValueTransformer, type NSEDataConvertible, type NSERange } from "@syndromatic/syncloudos/foundation";
import { CPFXCompress, CPFXInputFilter, CPFXOutputFilter, CPFXAlgorithm } from "@syndromatic/syncloudos/fx/compression";
const range: NSERange = { location: 0, length: 1 };
const data: NSEDataConvertible = NSEData.from(new Uint8Array([1]));
void NSEData.from(data).subdata(range).compressed(CPFXAlgorithm.gzip);
void [NSEUserDefaults, NSEIndexSet, NSENumberFormatter, CPFXCompress, CPFXInputFilter, CPFXOutputFilter];
void [NSEDateFormatter, NSEDecimalNumber, NSEDecimalNumberHandler, NSEUndoManager, NSEValueTransformer];
// @ts-expect-error NSEData byte views do not allow index assignment.
NSEData.from(data).bytes[0] = 1;
`);
  writeFileSync(join(consumer.root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "WebWorker"], types: [], strict: true, noEmit: true, skipLibCheck: false,
  }, files: ["consumer.ts"] }));
  expect(() => runNode(["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--pretty", "false"], consumer.root)).not.toThrow();
}, 180_000);
