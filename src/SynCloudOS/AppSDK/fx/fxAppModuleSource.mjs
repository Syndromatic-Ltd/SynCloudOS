import { readFileSync } from "node:fs";
import ts from "typescript";

const families = Object.freeze({
  dispatch: "DispatchFX", animation: "AnimationFX", graphics: "GraphicsFX", image: "ImageFX", text: "TextFX",
  audio: "AudioFX", haptics: "HapticsFX", motion: "MotionFX", media: "MediaFX", video: "VideoFX",
  midi: "MIDIFX", location: "LocationFX", lumina: "LuminaFX", compression: "CompressionFX",
  network: "NetworkFX", crypto: "CryptoFX", bluetooth: "BluetoothFX", nfc: "NFCFX",
  speech: "SpeechFX", contacts: "ContactsFX", pass: "PassFX", xr: "XRFX",
});
const entryRoot = new URL("../../../FX/", import.meta.url);
const entryName = "public.ts";

export function isFXFamily(family) { return Object.hasOwn(families, family); }

/** Public FX entries contain explicit re-exports. Type-only exports remain on
 * export-star; runtime values are selected through the private class binder. */
export function createFXAppModuleSource(appID, family, runtimeImport) {
  if (!isFXFamily(family)) throw new Error(`Unknown FX family: ${family}`);
  const path = new URL(`${families[family]}/${entryName}`, entryRoot);
  const source = ts.createSourceFile(path.pathname, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const names = [];
  for (const node of source.statements) {
    if (!ts.isExportDeclaration(node) || node.isTypeOnly) continue;
    if (!node.exportClause || !ts.isNamedExports(node.exportClause)) throw new Error(`FX entry ${family} must use explicit named re-exports.`);
    for (const item of node.exportClause.elements) if (!item.isTypeOnly) names.push(item.name.text);
  }
  const specifier = JSON.stringify(`@syndromatic/syncloudos/fx/${family}`);
  return `export * from ${specifier};\nimport * as family from ${specifier};\nimport { bindFXFamily } from ${JSON.stringify(runtimeImport)};\nconst bound = bindFXFamily(family, ${JSON.stringify(appID)});\n${names.map(name => `export const ${name} = bound.${name};`).join("\n")}\n`;
}
