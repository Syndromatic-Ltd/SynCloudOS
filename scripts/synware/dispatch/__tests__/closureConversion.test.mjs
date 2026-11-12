/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseAst } from "rollup/parseAst";
import { convertDispatchClosures } from "../closureConversion.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "__fixtures__");

const workerSafeModules = new Set([
  "@syndromatic/syncloudos/fx/dispatch",
  "@syndromatic/syncloudos/fx/crypto",
  "@syndromatic/syncloudos/fx/compression",
  "@syndromatic/syncloudos/foundation",
  "./workerSafeHelper.js",
]);

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function runConvert(name, options = {}) {
  const code = readFixture(name);
  return convertDispatchClosures(code, `/app/src/${name}`, {
    parse: source => parseAst(source),
    isWorkerSafe: specifier => workerSafeModules.has(specifier),
    strict: false,
    ...options,
  });
}

describe("DispatchFX closure conversion", () => {
  const accepted = [
    ["accept-01-imports-only.js", { closures: 1, captures: [], imports: 1 }],
    ["accept-02-const-local.js", { closures: 1, captures: ["factor"] }],
    ["accept-03-parameter.js", { closures: 1, captures: ["input"] }],
    ["accept-04-nested-main-async.js", { closures: 1, captures: ["seed"], continuations: 1, workerValues: ["computed"] }],
    ["accept-05-nested-notify-main.js", { closures: 1, captures: ["seed"], continuations: 1, workerValues: ["summary"] }],
    ["accept-06-concurrent-perform.js", { closures: 1, captures: ["scale"], params: ["i"] }],
    ["accept-07-work-item.js", { closures: 2, captures: ["offset"] }],
    ["accept-08-async-with-options.js", { closures: 2, captures: ["limit"] }],
    ["accept-09-module-literal-const.js", { closures: 1, captures: [], constants: ["LABEL", "THRESHOLD"] }],
    ["accept-10-worker-globals.js", { closures: 1, captures: ["payload"] }],
    ["accept-11-foundation-nsedata.js", { closures: 1, captures: ["raw"] }],
    ["accept-12-multiple-captures.js", { closures: 1, captures: ["a", "b", "c"] }],
    ["accept-13-shadowed-local.js", { closures: 1, captures: [] }],
    ["accept-14-inner-closure-scope.js", { closures: 1, captures: ["items", "factor"] }],
    ["accept-15-destructured-capture.js", { closures: 1, captures: ["width", "height"] }],
    ["accept-16-destructured-worker-local.js", { closures: 1, captures: ["pair"] }],
    ["accept-17-for-of-local.js", { closures: 1, captures: ["list"] }],
    ["accept-18-try-catch-local.js", { closures: 1, captures: ["raw"] }],
    ["accept-19-function-expression.js", { closures: 1, captures: ["a", "b"] }],
    ["accept-20-multiple-continuations.js", { closures: 1, captures: ["n"], continuations: 2 }],
    ["accept-21-outer-main-queue-skipped.js", { closures: 0 }],
    ["accept-22-typedarray-method.js", { closures: 1, captures: ["bytes", "arr"] }],
    ["accept-23-receiver-agnostic.js", { closures: 1, captures: ["x"] }],
    ["accept-24-group-notify-worker.js", { closures: 1, captures: ["seed"] }],
    ["accept-25-compression-import.js", { closures: 1, captures: ["data"] }],
  ];

  for (const [file, expectation] of accepted) {
    it(`accepts ${file}`, () => {
      const result = runConvert(file);
      assert.equal(result.diagnostics.length, 0, JSON.stringify(result.diagnostics));
      assert.equal(result.closures.length, expectation.closures);
      if (expectation.closures > 0) {
        assert.match(result.code, /__dfxSendable\(/);
        const first = result.closures[0];
        if (expectation.captures) assert.deepEqual(first.captures, expectation.captures);
        if (expectation.params) assert.deepEqual(first.params, expectation.params);
        if (expectation.constants) assert.deepEqual(first.constants.map(c => c.local), expectation.constants);
        if (expectation.imports !== undefined) assert.equal(first.imports.length, expectation.imports);
        if (expectation.continuations !== undefined) assert.equal(first.continuations.length, expectation.continuations);
        if (expectation.workerValues) assert.deepEqual(first.continuations[0].workerValues, expectation.workerValues);
      }
    });
  }

  const rejected = [
    ["reject-01-this.js", "references `this`, which is not sendable to a worker"],
    ["reject-02-assign-captured-let.js", "assigns to captured variable `x`; captures are read-only"],
    ["reject-03-update-captured-let.js", "assigns to captured variable `x`; captures are read-only"],
    ["reject-04-document.js", "references non-worker global `document`; move UI work into DFXQueue.main.async"],
    ["reject-05-window.js", "references non-worker global `window`; move UI work into DFXQueue.main.async"],
    ["reject-06-local-storage.js", "references non-worker global `localStorage`; move UI work into DFXQueue.main.async"],
    ["reject-07-unsafe-import.js", 'imports `uiHelper` from non-worker-safe module "./ui"'],
    ["reject-08-foundation-userdefaults.js", 'imports `NSEUserDefaults` from non-worker-safe module "@syndromatic/syncloudos/foundation"'],
    ["reject-09-class-instance-method.js", "captures class instance `svc` used by method call; structured clone drops prototypes and methods"],
    ["reject-10-param-method-call.js", "captures class instance `ctrl` used by method call; structured clone drops prototypes and methods"],
    ["reject-11-async-closure.js", "async or generator closure cannot be sent to a worker"],
    ["reject-12-generator-closure.js", "async or generator closure cannot be sent to a worker"],
    ["reject-13-arguments.js", "references `arguments`, which is not sendable to a worker"],
    ["reject-14-non-literal-module-const.js", "references non-literal module binding `state`; move creation inside the closure or pass as a capture"],
    ["reject-15-module-let.js", "references non-literal module binding `counter`; move creation inside the closure or pass as a capture"],
    ["reject-16-continuation-assigns-worker-local.js", "continuation assigns to worker local `v`"],
    ["reject-17-nested-main-document-outside-continuation.js", "references non-worker global `document`; move UI work into DFXQueue.main.async"],
  ];

  for (const [file, exactReason] of rejected) {
    it(`rejects ${file} with exact reason`, () => {
      const result = runConvert(file);
      assert.equal(result.closures.length, 0);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0].reason, exactReason);
      assert.equal(result.diagnostics[0].severity, "warning");
      assert.doesNotMatch(result.code, /__dfxSendable\(/);
    });
  }

  it("receiver-agnostic annotation executes callback identically when invoked directly", () => {
    const result = runConvert("accept-23-receiver-agnostic.js");
    const stripped = result.code
      .replace(/^import .*?;\r?\n/gmu, "")
      .replace("export function run(someOther, x) {", "return function run(someOther, x) {");
    const runFactory = new Function(
      "__dfxSendable",
      "__dfxContinuation",
      stripped,
    );
    const seen = [];
    const run = runFactory((fn, id, getCaptures) => {
      seen.push({ id, captures: getCaptures() });
      return fn;
    }, (_id, fn) => fn);

    const directCalls = [];
    const someOther = { async(fn) { directCalls.push(fn()); } };
    run(someOther, 7);
    assert.deepEqual(directCalls, [21]);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].captures, [7]);
  });

  it("turns diagnostics into errors and throws in strict mode", () => {
    assert.throws(
      () => runConvert("reject-04-document.js", { strict: true }),
      error => error instanceof Error && error.message.includes("references non-worker global `document`; move UI work into DFXQueue.main.async"),
    );
  });

  it("emits a valid v3 source map when closures are converted", () => {
    const result = runConvert("accept-02-const-local.js");
    assert.ok(result.map);
    assert.equal(result.map.version, 3);
    assert.ok(Array.isArray(result.map.sources));
  });
});
