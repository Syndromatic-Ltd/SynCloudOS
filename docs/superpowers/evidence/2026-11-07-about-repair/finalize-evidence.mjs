import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const directory = fileURLToPath(new URL("./", import.meta.url));
const framework = resolve(directory, "../../../.."), site = resolve(framework, "../site");
const json = name => JSON.parse(readFileSync(resolve(directory, name), "utf8"));
const text = name => readFileSync(resolve(directory, name), "utf8");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const browser = json("browser.json"), controlled = json("controlled-motion.json"), live = json("motion.json"), consumers = json("consumer-probe.json");
const visibility = json("visibility.json");
const inspection = json("about-final-inspection.json");
const rapid = json("rapid-selection.json");
assert.equal(browser.errors.length, 0); assert.equal(controlled.errors.length, 0); assert.equal(live.errors.length, 0);
assert.equal(inspection.errors.length, 0);
assert.equal(controlled.standard.length, 20);
assert(controlled.standard.every((frame, index) => frame.time === index * 80));
assert(controlled.reduced.every(frame => frame.panes.every(pane => Math.abs(pane.x) < 0.01)));
assert(controlled.reduced.some(frame => frame.panes.some(pane => pane.opacity > 0 && pane.opacity < 1)));
assert.equal(browser.viewports.desktop.length, 3); assert.equal(browser.viewports.phone.length, 3);
assert.equal(browser.floor.before.native[0].iterations, "Infinity");
assert.equal(visibility.errors.length, 0);
assert.equal(visibility.hidden.native[0].time, visibility.hiddenLater.native[0].time);
assert(visibility.resumed.native[0].time > visibility.hiddenLater.native[0].time);
assert.equal(visibility.reduced.native.length, 0);
assert(live.standard.samples.length > 10); assert(live.reduced.samples.length > 10);
assert(live.standard.samples.some(frame => frame.panes.some(pane => pane.native.some(animation => animation.state === "running" && animation.frames.length === 2))));
assert(live.reduced.samples.some(frame => frame.panes.some(pane => pane.native.some(animation => animation.state === "running" && animation.frames.length === 2 && "opacity" in animation.frames[0]))));
assert.equal(rapid.errors.length, 0);
const rapidBefore = rapid.before.find(pane => pane.section === "framework"), rapidAfter = rapid.after.find(pane => pane.section === "framework");
assert(rapidAfter.sameLeavingElement && Math.abs(rapidBefore.x - rapidAfter.x) < 0.01 && Math.abs(rapidBefore.opacity - rapidAfter.opacity) < 0.001);
assert.equal(rapid.settled.length, 1); assert.equal(rapid.settled[0].section, "team");
assert(consumers.every(consumer => consumer.errors.length === 0));
const portfolio = consumers.find(consumer => consumer.route === "/portfolio");
assert(portfolio.springSamples.length >= 3);
const receipt = JSON.parse(readFileSync(resolve(site, "vendor/framework-receipt.json"), "utf8"));
const receiptSummary = Object.fromEntries(["package", "commit", "archive", "archiveSha256", "integrity", "sourceSha256"].map(key => [key, receipt[key]]));
writeFileSync(resolve(directory, "adopted-framework-receipt.json"), JSON.stringify(receiptSummary, null, 2));
const suite = text("site-suite-final.log");
const failures = [...suite.matchAll(/^ FAIL\s+(.+)$/gm)].map(match => match[1].trim());
function summary(name) {
  const log = text(name), tests = log.match(/^\s*Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed \((\d+)\)/m), files = log.match(/^\s*Test Files\s+(?:(\d+) failed \|\s*)?(\d+) passed \((\d+)\)/m);
  assert(tests && files, `Missing summary in ${name}`);
  return { files: Number(files[3]), passed: Number(tests[2]), failed: Number(tests[1] ?? 0), total: Number(tests[3]), log: name };
}
const verification = {
  recordedAt: new Date().toISOString(),
  branches: { framework: git(framework, "branch", "--show-current"), site: git(site, "branch", "--show-current") },
  heads: { framework: git(framework, "rev-parse", "HEAD"), site: git(site, "rev-parse", "HEAD") },
  cleanSdkVerified: { commit: "772d20bb3449e657cd3042fea84dc1deab58518e", archiveSha256: "9e54b613c727c3d8e7b09674570a1e5382daac259706a3bde8407dea39d2aa8e", log: "adoption-current-final.log" },
  currentSharedSdk: receiptSummary,
  adoptionNote: "Other sessions continued adopting/restarting 5199. Their later vendor changes were preserved. Captures freeze each page's loaded module graph; the current receipt is a separate snapshot.",
  preview: { url: "http://127.0.0.1:5199/about", worktree: site, launcher: "../2026-11-07-foundation/open-ui-preview.mjs (concurrent session)", configuration: "site/vite.claude-5199.config.mts (unchanged)", cache: "site/node_modules/.vite-open-panel-5199", inspection: "about-final-inspection.json", errors: inspection.errors.length, startupRetries: inspection.startupRetries.length },
  typechecks: {
    framework: { passed: /exitCode: 0/.test(text("framework-shared-typecheck-final.log")), log: "framework-shared-typecheck-final.log" },
    site: { passed: /exitCode: 0/.test(text("site-typecheck-final.log")), log: "site-typecheck-final.log" },
  },
  tests: {
    frameworkAnimationAndTransitions: { ...summary("framework-animation-suites-final.log"), revision: "772d20b" },
    siteAboutAndArtworkConsumers: summary("site-consumers-final.log"),
    sharedSiteSuite: { ...summary("site-suite-final.log"), failures, note: "Remaining Gallery and Publisher failures in the concurrent shared source. These files were not edited by this task." },
  },
  browser: { errors: 0, desktop: "1440x900 DPR 1", phone: "390x844 DPR 1", comparisons: 6,
    controlledFrames: 20, controlledStepMs: 80, controlledDurationMs: 1520,
    reducedStepMs: 40, liveTrace: "motion.json", visibility: browser.floor.visibilityProbe,
    rapidSelection: "rapid-selection.json",
    physicalGpuOrOwnerAcceptance: false,
    consumerLimits: consumers.filter(consumer => consumer.actions.some(action => /no |without|not exposed/.test(action))).map(consumer => ({ route: consumer.route, actions: consumer.actions })),
  },
};
assert(verification.typechecks.framework.passed); assert(verification.typechecks.site.passed);
assert.equal(failures.length, verification.tests.sharedSiteSuite.failed);
assert(failures.every(failure => failure.startsWith("tests/runtime/gallery-") || failure.startsWith("tests/runtime/publisher/")));
assert.equal(verification.tests.frameworkAnimationAndTransitions.failed, 0); assert.equal(verification.tests.siteAboutAndArtworkConsumers.failed, 0);
writeFileSync(resolve(directory, "verification.json"), JSON.stringify(verification, null, 2));
console.log(JSON.stringify({ typechecks: verification.typechecks, tests: verification.tests, browserErrors: 0, currentSdk: receipt.commit }, null, 2));
