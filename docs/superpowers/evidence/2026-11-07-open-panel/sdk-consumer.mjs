import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(directory, "../../../../../site");
const virtualFile = path.join(site, "__open-panel-sdk-consumer.ts");
const source = `
import { NSEOpenPanel, NSEModalResponse, type NSEOpenPanelURL } from "@syndromatic/syncloudos/nse";
import { SCOS } from "@syndromatic/syncloudos/sdk";
// @ts-expect-error The separate media panel has been removed, with no alias.
import { NSEMediaPanel } from "@syndromatic/syncloudos/nse";
// @ts-expect-error The JSX Open-panel contract has been removed.
import type { NSEOpenPanelProps } from "@syndromatic/syncloudos/nse";
declare const window: Parameters<NSEOpenPanel["beginSheetModal"]>[0];
export async function pick() {
  const panel = new NSEOpenPanel();
  panel.canChooseFiles = true; panel.canChooseDirectories = true;
  panel.allowsMultipleSelection = true; panel.allowedContentTypes = ["image/*"];
  panel.prompt = "Open"; panel.message = "Choose document images.";
  const [support] = await SCOS.fileManager.urls("applicationSupportDirectory", "userDomainMask");
  if (support) {
    const scratch = await support.getDirectoryHandle("Scratch Disk", { create: true });
    panel.directoryURL = scratch;
    const working = await scratch.getFileHandle("working.bin", { create: true });
    const writable = await working.createWritable(); await writable.write(new Uint8Array([1])); await writable.close();
  }
  panel.mediaSources = [{ id: "pictures", label: "Pictures", query: async (_query, signal) => {
    signal.throwIfAborted(); return { items: [{ id: "one", providerId: "pictures", kind: "image", name: "One", mimeType: "image/png", source: "/one.png" }], nextCursor: null };
  } }];
  const response = await panel.beginSheetModal(window);
  const values: readonly NSEOpenPanelURL[] = panel.urls;
  if (response === NSEModalResponse.OK) for (const value of values) {
    if ("read" in value) { await value.read(); value.release("caller-finished"); }
  }
  panel.usesSystemFileChooser = true; await panel.runModal();
  await panel.begin(response => { const code: number = response; void code; });
  panel.dispose();
}
`;
const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"] };
const host = ts.createCompilerHost(options);
const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host);
const isVirtual = file => path.resolve(file).toLowerCase() === virtualFile.toLowerCase();
host.readFile = file => isVirtual(file) ? source : originalRead(file);
host.fileExists = file => isVirtual(file) || originalExists(file);
const originalSource = host.getSourceFile.bind(host);
host.getSourceFile = (file, languageVersion, onError, fresh) => isVirtual(file) ? ts.createSourceFile(file, source, languageVersion, true) : originalSource(file, languageVersion, onError, fresh);
const program = ts.createProgram([virtualFile], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const receipt = JSON.parse(readFileSync(path.join(site, "vendor/framework-receipt.json"), "utf8"));
const result = { commit: receipt.commit, archiveSha256: receipt.archiveSha256, diagnostics: diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")) };
writeFileSync(path.join(directory, "sdk-consumer.json"), JSON.stringify(result, null, 2));
assert.equal(diagnostics.length, 0, result.diagnostics.join("\n"));
console.log(JSON.stringify(result, null, 2));
