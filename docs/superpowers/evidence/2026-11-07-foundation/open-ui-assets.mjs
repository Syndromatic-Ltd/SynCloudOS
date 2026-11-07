/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const target = "src/NSE/Themes/Atmo/Resources/workspace";
const inputs = {
  "folder-documents": "DocumentsSyn.png", "folder-downloads": "DownloadsSyn.png", "folder-music": "musicSyn.png",
  "folder-ordinary": "DocumentsSyn.png", "document-generic": "DocumentsSyn.png",
};
await mkdir(target, { recursive: true });
const provenance = [];
const imports = [], entries = [];
for (const [slot, filename] of Object.entries(inputs)) {
  const sourcePath = path.join("E:/Cirrus Icons/Folders", filename);
  const source = await readFile(sourcePath);
  for (const size of [24, 48, 96]) for (const scale of [1, 2]) {
    const name = `${slot}-${size}${scale === 2 ? "@2x" : ""}.png`;
    const pixels = size * scale;
    const output = await sharp(source).resize(pixels, pixels, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
    await writeFile(path.join(target, name), output);
    const key = `${slot}:${size}:${scale}`;
    const variable = `image${entries.length}`;
    imports.push(`const ${variable} = new URL("./Resources/workspace/${name}", import.meta.url).href;`);
    entries.push(`  "${key}": ${variable},`);
    provenance.push({ slot, sourcePath, sourceSha256: createHash("sha256").update(source).digest("hex"), size, scale, pixels, name,
      sha256: createHash("sha256").update(output).digest("hex"), provisional: slot === "folder-ordinary" || slot === "document-generic" });
  }
}
const header = (await readFile("src/NSE/Themes/Atmo/appearance.ts", "utf8")).split("import ")[0];
await writeFile("src/NSE/Themes/Atmo/workspaceArtwork.ts", `${header}${imports.join("\n")}\n\n/** @internal Atmo owns these replaceable artwork slots. */\nexport const atmoWorkspaceArtwork: Readonly<Record<string, string>> = {\n${entries.join("\n")}\n};\n`);
await writeFile("docs/superpowers/evidence/2026-11-07-foundation/open-ui-assets.json", JSON.stringify({ kernel: "Lanczos3", provisional: "Ordinary folder and generic document await owner artwork; both temporarily use DocumentsSyn.png, without newly drawn icons.", assets: provenance }, null, 2));
