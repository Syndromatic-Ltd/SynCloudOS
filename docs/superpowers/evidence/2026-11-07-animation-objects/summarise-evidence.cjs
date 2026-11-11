const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../../..");
const directory = path.join(root, ".artifacts/animation-objects");
// Visual inspection found these baseline images still in the shell's opening
// zoom/dim state. Keep the raw files, but never count them as settled parity.
const excludedBaselines = new Set([
  "memo-before-desktop-dark-no-preference-result.json",
  "dial-before-desktop-dark-reduce-result.json",
]);
const resultFiles = fs.readdirSync(directory).filter(name => /-(before|after|post-adoption)-.+-result\.json$/.test(name));
const results = resultFiles.map(name => {
  const evidence = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  const status = evidence.error || evidence.errors.length ? "failed"
    : evidence.result?.limitation ? "limited"
    : evidence.result?.skipped ? "not-applicable"
    : excludedBaselines.has(name) ? "excluded-baseline"
    : "passed";
  return { file: name, status, flow: evidence.flow, stage: evidence.stage,
    framework: evidence.framework, archive: evidence.archive,
    minimumVisibleOpacity: evidence.result?.minimumVisibleOpacity };
});
const summary = {
  stages: Object.fromEntries(["before", "after", "post-adoption"].map(stage => [stage,
    results.filter(result => result.stage === stage).reduce((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1; return counts;
    }, {})])),
  finalArchives: [...new Set(results.filter(result => result.stage === "after").map(result => result.archive))],
  postAdoptionArchives: [...new Set(results.filter(result => result.stage === "post-adoption").map(result => result.archive))],
  pngCount: fs.readdirSync(directory).filter(name => name.endsWith(".png")).length,
  results,
};
fs.writeFileSync(path.join(directory, "evidence-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ stages: summary.stages, finalArchives: summary.finalArchives, postAdoptionArchives: summary.postAdoptionArchives, pngCount: summary.pngCount }, null, 2));
if (results.some(result => result.status === "failed")) process.exitCode = 1;
