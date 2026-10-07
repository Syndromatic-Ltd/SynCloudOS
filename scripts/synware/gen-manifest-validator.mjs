#!/usr/bin/env node
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

// Precompiles the SynApp manifest schema into a standalone validator module.
//
// Compiling the schema with Ajv at runtime cost 20-31 ms of main-thread time
// on every boot (Chromium CPU profile), and it kept Ajv's whole compiler in
// the entry chunk. The generated module is the same code Ajv's compile() would
// build, with the same options, so validation results and error objects are
// identical.
//
//   node scripts/synware/gen-manifest-validator.mjs          write the module
//   node scripts/synware/gen-manifest-validator.mjs --check  fail if stale
//
// tests/runtime/synapp-manifest-validator-generated.test.ts runs the check.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const manifestDirectory = resolve(root, "src/SynCloudOS/AppSDK/manifest");
export const manifestSchemaPath = resolve(manifestDirectory, "synapp-manifest.schema.json");
export const manifestValidatorPath = resolve(manifestDirectory, "synappManifestValidator.generated.mjs");

// Keep these in step with the options validation has always used.
const validatorOptions = Object.freeze({
  allErrors: true,
  allowUnionTypes: false,
  strict: true,
  validateFormats: true,
});

/**
 * Inlines the CommonJS modules the validator requires (Ajv's small runtime
 * helpers and what they require), innermost first, each in its own function
 * scope. Importing them instead would depend on how each bundler interoperates
 * with a CommonJS default export, which Vite and Node answer differently.
 */
function inlineCommonJS(specifiers) {
  const modules = new Map();
  const visit = (specifier, from) => {
    const path = createRequire(from).resolve(specifier);
    if (modules.has(path)) return modules.get(path).name;
    const source = readFileSync(path, "utf8").replace(/\/\/# sourceMappingURL=.*$/m, "").trim();
    const requires = new Map();
    // Real calls only: Ajv's helpers also carry require() inside string
    // literals (their own code-generation references).
    for (const [, nested] of source.matchAll(/(?<!['"])\brequire\("([^"]+)"\)/g)) requires.set(nested, visit(nested, path));
    const name = `__cjs${modules.size}`;
    const label = relative(resolve(root, "node_modules"), path).replaceAll("\\", "/");
    const requireMap = [...requires].map(([nested, nestedName]) => `${JSON.stringify(nested)}: ${nestedName}`).join(", ");
    modules.set(path, {
      name,
      code: `// ${label}\nconst ${name} = __commonJS(${requireMap ? `{ ${requireMap} }` : "{}"}, function (module, exports, require) {\n${source}\n});`,
    });
    return name;
  };
  const names = specifiers.map((specifier) => visit(specifier, resolve(root, "package.json")));
  const code = [
    "function __commonJS(requires, factory) {",
    "  const module = { exports: {} };",
    "  factory(module, module.exports, (specifier) => requires[specifier]);",
    "  return module.exports;",
    "}",
    ...[...modules.values()].map((entry) => entry.code),
  ].join("\n");
  return { code, names };
}

/** The generated module's source for the given schema. */
export function generateManifestValidatorSource(schema) {
  const ajv = new Ajv2020({ ...validatorOptions, code: { source: true, esm: true, lines: true } });
  addFormats(ajv);
  const code = standaloneCode(ajv, ajv.compile(schema));
  // Ajv's ESM output still require()s its runtime helpers
  // (https://github.com/ajv-validator/ajv/issues/2209).
  const helpers = [];
  const body = code
    .replace(/^"use strict";\s*/, "")
    .replace(/const (\w+) = require\("([^"]+)"\)\.default;?/g, (_match, name, specifier) => {
      helpers.push({ name, specifier });
      return "";
    });
  if (/\brequire\(/.test(body)) throw new Error("The generated manifest validator still contains require().");
  const inlined = inlineCommonJS(helpers.map((helper) => helper.specifier));
  return [
    "// @generated by scripts/synware/gen-manifest-validator.mjs from",
    "// synapp-manifest.schema.json. Do not edit; regenerate instead.",
    "// SynWare SDK schema validator; generated helpers include Ajv and ajv-formats (MIT).",
    "// Their copyright notices and licence texts are in licenses/ajv-MIT.txt and licenses/ajv-formats-MIT.txt.",
    "/* eslint-disable */",
    inlined.code,
    ...helpers.map((helper, index) => `const ${helper.name} = ${inlined.names[index]}.default;`),
    body.trim(),
    "",
  ].join("\n");
}

function currentSource() {
  return generateManifestValidatorSource(JSON.parse(readFileSync(manifestSchemaPath, "utf8")));
}

/** Whether the checked-in module matches the checked-in schema. */
export function manifestValidatorIsCurrent() {
  let written;
  try {
    written = readFileSync(manifestValidatorPath, "utf8").replaceAll("\r\n", "\n");
  } catch {
    return false;
  }
  return written === currentSource();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    if (!manifestValidatorIsCurrent()) {
      console.error("synappManifestValidator.generated.mjs is stale: run node scripts/synware/gen-manifest-validator.mjs");
      process.exit(1);
    }
    console.log("Manifest validator is current.");
  } else {
    writeFileSync(manifestValidatorPath, currentSource());
    console.log(`Wrote ${manifestValidatorPath}`);
  }
}
