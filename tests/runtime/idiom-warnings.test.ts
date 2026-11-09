import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { inspectIdiomWarnings, inspectUnusedResources } from "../../scripts/synware/idiom-warnings.mjs";

const inspect = (text: string) => inspectIdiomWarnings({ file: "View.tsx", text });
const fixtures = [
  ["resampled-animation", 'new AFXKeyframeAnimation({ values: Array.from({ length: 61 }, (_, i) => curve.sample(i / 60)) });', 'new AFXKeyframeAnimation({ values: [0, 10, 0], keyTimes: [0, 0.5, 1] });'],
  ["reduced-motion", 'new AFXAnimation({ duration: 1, reducedMotion: "never" });', 'new AFXAnimation({ duration: 1, reducedMotion: "system" });'],
  ["backed-view-animation", 'class View { @outlet accessor floor!: NSEViewOutlet; run() { SCOS.animations.animate(this.floor.element, {}); } }', 'class View { @outlet accessor floor!: NSEViewOutlet; run() { this.floor.layer.addAnimation(new AFXBasicAnimation({})); } }'],
  ["animation-visibility", 'document.addEventListener("visibilitychange", () => animation.pause());', 'document.addEventListener("visibilitychange", () => saveDocument());'],
  ["pixel-sprite", 'function sprite() { const pixels = new Uint8Array(64 * 64 * 4); for (let i = 0; i < pixels.length; i++) pixels[i] = 255; return GFXImage.fromRGBA(pixels); }', 'function decode() { const bytes = new Uint8Array(4); for (let i = 0; i < bytes.length; i++) bytes[i] = stream.read(); return bytes; }'],
  ["full-circle", 'const path = new GFXPath(); path.arc({ x: 0, y: 0 }, 10, 0, Math.PI * 2 - 0.001);', 'const path = new GFXPath(); path.arc({ x: 0, y: 0 }, 10, 0, Math.PI);'],
  ["foundation-import", 'import { NSEUserDefaults as Defaults, NumberFormatter } from "@syndromatic/syncloudos/nse";', 'import { NSEUserDefaults, NSENumberFormatter, NSEData } from "@syndromatic/syncloudos/foundation";'],
  ["video", 'const view = <video src="movie.mp4" controls />;', 'import type { VFXVideoClient } from "@syndromatic/syncloudos/fx/video"; const client: VFXVideoClient = SCOS.video;'],
] as const;

describe("conservative authoring warnings", () => {
  it.each(fixtures)("reports %s with actionable guidance", (rule, failing) => {
    const warnings = inspect(failing);
    expect(warnings).toContainEqual(expect.objectContaining({ line: 1, rule: `idiom.${rule}`, severity: "warning" }));
    expect(warnings.every((finding: { message: string }) => finding.message.length > 30)).toBe(true);
  });
  it.each(fixtures)("accepts the %s alternative", (_rule, _failing, passing) => {
    expect(inspect(passing)).toEqual([]);
  });
  it("ignores comments and unrelated option names and typed arrays", () => {
    expect(inspect(fixtures.map(([, failing]) => `// ${failing}`).join("\n") + '\nconst reducedMotion = "never"; const options = { reducedMotion: "never" }; const bytes = new Uint8Array(12);')).toEqual([]);
  });
  it("follows local keyframe values without warning about ordinary numeric data maps", () => {
    expect(inspect('const values = Array.from({length: 61}, (_, i) => easingCurve.valueAt(i / 60)); new AFXKeyframeAnimation({ values });').map((f: { rule: string }) => f.rule)).toEqual(["idiom.resampled-animation"]);
    expect(inspect('new AFXKeyframeAnimation({ values: positions.map(point => point.x) });')).toEqual([]);
    expect(inspect('new AFXKeyframeAnimation({ values: curvePoints.map(point => point.x) });')).toEqual([]);
  });
  it("finds aliased animation constructors and the actual warning line", () => {
    expect(inspect('import { AFXAnimation as Motion } from "@syndromatic/syncloudos/fx/animation";\nnew Motion({duration: 1, reducedMotion: "never"});')).toEqual([expect.objectContaining({ line: 2, rule: "idiom.reduced-motion" })]);
  });
  it("only calls a view backed when an outlet declaration identifies the exact target", () => {
    expect(inspect('SCOS.animations.animate(element, {}); const other = { element: document.body, layer: {} }; SCOS.animations.animate(other.element, {});')).toEqual([]);
    expect(inspect('class A { floor!: NSEViewOutlet; } class B { floor!: Other; run() { SCOS.animations.animate(this.floor.element, {}); } }')).toEqual([]);
  });
  it("names the exact Foundation import for each obsolete import", () => {
    const warnings = inspect('import { NSEUserDefaults, NumberFormatter, NSEData } from "@syndromatic/syncloudos/nse";');
    expect(warnings).toHaveLength(3);
    for (const name of ["NSEUserDefaults", "NSENumberFormatter", "NSEData"]) expect(warnings.some((f: { message: string }) => f.message.includes(`import { ${name} } from "@syndromatic/syncloudos/foundation"`))).toBe(true);
    expect(inspect('import { NumberFormatter } from "some-other-library";')).toEqual([]);
  });
  it("handles incomplete calls while the editor is typing", () => {
    expect(inspect('document.addEventListener(); const path = new GFXPath(); path.arc();')).toEqual([]);
  });
  it("does not infer GraphicsFX ownership from comments", () => {
    expect(inspect('// GFXPath\nother.arc({ x: 0, y: 0 }, 10, 0, 2 * Math.PI - 0.001);')).toEqual([]);
  });
  it("recognises a constructed image from a manually filled sprite buffer", () => {
    expect(inspect('function sprite() { const pixels = new Uint8Array(64); for (let i = 0; i < pixels.length; i++) pixels[i] = 255; return new ImageData(pixels, 4, 4); }')).toContainEqual(expect.objectContaining({ rule: "idiom.pixel-sprite" }));
  });
});

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function resourceProject(source: string, resources: Record<string, string>) {
  const root = mkdtempSync(resolve(tmpdir(), "syncloudos-idiom-resources-")); roots.push(root);
  const directory = resolve(root, "src/SynWare/Example.app");
  const entry = resolve(directory, "Contents/index.tsx");
  mkdirSync(dirname(entry), { recursive: true }); writeFileSync(entry, source);
  for (const [name, text] of Object.entries(resources)) {
    const file = resolve(directory, "Contents/Resources", name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text);
  }
  return { root, applications: [{ directory }], files: [entry] };
}
describe("unused bundle resource warnings", () => {
  it("warns about an image mentioned only in a source comment", () => {
    const project = resourceProject('// "Images/unused.png"', { "Images/unused.png": "image" });
    expect(inspectUnusedResources(project)).toEqual([expect.objectContaining({ file: expect.stringContaining("unused.png"), line: 1, rule: "idiom.unused-resource", severity: "warning", message: expect.stringContaining("static reference") })]);
  });
  it("accepts literal references including extensionless resource names", () => {
    expect(inspectUnusedResources(resourceProject('const image = resource("Images/used");', { "Images/used.png": "image" }))).toEqual([]);
  });
  it("follows SVG references but ignores SVG comments", () => {
    const project = resourceProject('const art = resource("Images/scene.svg");', {
      "Images/scene.svg": '<svg><image href="./used.png" /><!-- unused.png --></svg>',
      "Images/used.png": "image", "Images/unused.png": "image",
    });
    expect(inspectUnusedResources(project).map((f: { file: string }) => f.file.replaceAll("\\", "/").split("/").pop())).toEqual(["unused.png"]);
  });
  it("does not call dynamic resource families unused or inspect framework-managed localisations", () => {
    expect(inspectUnusedResources(resourceProject('const art = resource(`Images/icon-${mode}.png`);', { "Images/icon-dark.png": "image", "Images/icon-light.png": "image", "Localised/Base.locale/Localisable.strings": "text" }))).toEqual([]);
  });
});
