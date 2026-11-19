/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readThemeBundle } from "../../scripts/synware/theme-bundles.mjs";
import { themeModuleSource } from "../../scripts/synware/theme-loading.mjs";
import { sampleSpring, springParameters, springSettlingDuration } from "../../src/FX/AnimationFX/AFXTimingFunction";
import { atmoTheme } from "../../src/NSE/Appearance/atmoTheme";
import { nseThemeMotionProperties, nseThemeMotionRoles } from "../../src/NSE/Theme/contract/motion";
import { nseThemeMotionStyle, nseThemeMotionTiming } from "../../src/NSE/Theme/themeMotionStyle";

const valid = resolve(import.meta.dirname, "../fixtures/themes/Valid.scostheme");
const atmoResources = resolve(import.meta.dirname, "../../src/Themes/Atmo.scostheme/Contents/Resources");
let directory: string, bundle: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "scos-motion-")); bundle = join(directory, "Paper.scostheme"); cpSync(valid, bundle, { recursive: true }); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

const definitionPath = () => join(bundle, "Contents/Theme.json");
const withMotion = (motion: unknown) => {
  const definition = JSON.parse(readFileSync(definitionPath(), "utf8"));
  writeFileSync(definitionPath(), JSON.stringify({ ...definition, motion }));
};
const css = (source: string) => writeFileSync(join(bundle, "Contents/Resources/theme.css"), source);
const easingPoints = (easing: string) => easing.slice("linear(".length, -1).split(",").map(Number);

describe("motion timing", () => {
  it("writes a timing curve as milliseconds and cubic-bezier()", () => {
    expect(nseThemeMotionTiming({ duration: 0.18, timingFunction: [0.22, 0.75, 0.28, 1] }))
      .toEqual({ duration: "180ms", easing: "cubic-bezier(0.22, 0.75, 0.28, 1)" });
  });

  it("samples a spring over its settling time and ends exactly at rest", () => {
    const { mass, stiffness, damping } = springParameters(0.4, 0.3);
    const settle = springSettlingDuration(mass, stiffness, damping);
    const timing = nseThemeMotionTiming({ duration: 0.4, bounce: 0.3 });
    expect(timing.duration).toBe(`${Number((settle * 1000).toFixed(4))}ms`);
    const points = easingPoints(timing.easing);
    expect(points).toHaveLength(49);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(points[12]).toBeCloseTo(sampleSpring(settle * 12 / 48, mass, stiffness, damping), 4);
    expect(Math.max(...points)).toBeGreaterThan(1);
  });

  it("never overshoots a critically damped or overdamped spring", () => {
    for (const bounce of [0, -0.5]) expect(Math.max(...easingPoints(nseThemeMotionTiming({ duration: 0.4, bounce }).easing))).toBeLessThanOrEqual(1);
  });

  it("publishes both properties for every role on Atmo", () => {
    const style = nseThemeMotionStyle(atmoTheme);
    for (const role of nseThemeMotionRoles) {
      expect(style[nseThemeMotionProperties[role].duration]).toMatch(/ms$/u);
      expect(style[nseThemeMotionProperties[role].easing]).toMatch(/^(?:cubic-bezier|linear)\(/u);
    }
    expect(nseThemeMotionProperties.scrollBoundary.duration).toBe("--nse-motion-scroll-boundary-duration");
    expect(nseThemeMotionStyle(atmoTheme)).toBe(style);
  });
});

describe("Theme.json motion", () => {
  it("accepts springs and timing curves for some roles", () => {
    withMotion({ control: { duration: 0.3, bounce: 0.15 }, dismissal: { duration: 0.2, timingFunction: [0.42, 0, 1, 1] } });
    expect(readThemeBundle(bundle).theme.motion.control).toEqual({ duration: 0.3, bounce: 0.15 });
  });

  it.each([
    ["an unknown role", { wobble: { duration: 0.3, bounce: 0 } }, /unsupported field wobble/u],
    ["a spring with a curve", { control: { duration: 0.3, bounce: 0, timingFunction: [0, 0, 1, 1] } }, /unsupported field timingFunction/u],
    ["bounce of 1", { control: { duration: 0.3, bounce: 1 } }, /bounce must be between -1 and 1/u],
    ["a spring under 0.07s", { control: { duration: 0.05, bounce: 0 } }, /duration must be seconds/u],
    ["a zero-length curve", { control: { duration: 0, timingFunction: [0, 0, 1, 1] } }, /duration must be seconds/u],
    ["three control points", { control: { duration: 0.2, timingFunction: [0, 0, 1] } }, /four control points/u],
    ["an x outside 0 to 1", { control: { duration: 0.2, timingFunction: [1.2, 0, 1, 1] } }, /four control points/u],
    ["milliseconds", { control: { duration: 180, timingFunction: [0, 0, 1, 1] } }, /duration must be seconds/u],
  ])("rejects %s", (_name, motion, message) => {
    withMotion(motion);
    expect(() => readThemeBundle(bundle)).toThrow(message);
  });

  it("gives omitted roles Atmo's timing in the theme module", () => {
    withMotion({ control: { duration: 0.3, bounce: 0.15 } });
    const source = themeModuleSource([readThemeBundle(bundle)], new Set(), (file: string) => file, "virtual:theme/");
    expect(source).toContain('motion:{...builtInAtmo.motion,...{"control":{"duration":0.3,"bounce":0.15}}}');
  });
});

describe("theme transitions", () => {
  it("accepts transitions timed by motion tokens", () => {
    css('[data-nse-control="button"] [data-nse-part="bezel"] { transition: opacity var(--nse-motion-control-duration) var(--nse-motion-control-easing), transform var(--nse-motion-scroll-boundary-duration) var(--nse-motion-scroll-boundary-easing); }');
    expect(() => readThemeBundle(bundle)).not.toThrow();
  });

  it.each([
    ["a literal duration", "transition: opacity 180ms var(--nse-motion-control-easing)"],
    ["a literal delay", "transition: opacity var(--nse-motion-control-duration) var(--nse-motion-control-easing) 40ms"],
    ["a keyword easing", "transition: opacity var(--nse-motion-control-duration) ease"],
    ["a cubic-bezier() easing", "transition-timing-function: cubic-bezier(0.2, 0, 0, 1)"],
    ["an unknown token", "transition: opacity var(--nse-motion-wobble-duration)"],
    ["a var() fallback", "transition: opacity var(--nse-motion-control-duration, 2s)"],
    ["another custom property", "transition-duration: var(--slow)"],
    ["a redefined token", "--nse-motion-control-duration: 2s"],
    ["an animation", "animation: spin var(--nse-motion-control-duration)"],
  ])("rejects %s", (_name, declaration) => {
    css(`[data-nse-control="button"] [data-nse-part="bezel"] { ${declaration}; }`);
    expect(() => readThemeBundle(bundle)).toThrow(/theme.css.*motion/u);
  });

  it("leaves no literal transition timing in Atmo", () => {
    for (const name of readdirSync(atmoResources).filter(file => file.endsWith(".css"))) {
      const source = readFileSync(join(atmoResources, name), "utf8");
      for (const [, value] of source.matchAll(/transition(?:-[a-z]+)?\s*:\s*([^;]+);/gu)) {
        if (value!.trim() === "none") continue;
        expect(value!.replace(/var\(--nse-motion-[a-z-]+\)/gu, ""), `${name}: ${value}`).not.toMatch(/\d|ease|linear|cubic|steps/u);
      }
    }
  });
});
