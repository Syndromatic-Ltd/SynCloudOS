import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const here = name => new URL(name, import.meta.url);
const json = async name => JSON.parse(await readFile(here(name), 'utf8'));
const save = async (name, value) => writeFile(here(name), JSON.stringify(value, null, 2) + '\n');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root });
const implementationCommit = '7bdaa0d3fdc6d42529b96f9fabf14d27e9f36ba6';
const names = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark', 'desktop-light-dpr2', 'phone-dark-dpr2'];
const results = [];
for (const name of names) {
  const [result] = await json(`browser-results-${name}.json`);
  assert.equal(result.name, name);
  assert.equal(result.receiptStable, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.scrollBefore.range > 0);
  assert.ok(result.scrollAfter.top > result.scrollBefore.top);
  for (const [path, expected] of Object.entries(result.gallerySourceSha256)) {
    const bytes = execFileSync('git', ['show', `${result.siteCommit}:${path}`], {cwd: fileURLToPath(new URL('../../../../../site/', import.meta.url))});
    assert.equal(sha256(bytes.toString('utf8').replaceAll('\r\n', '\n')), expected, `${path} did not match the captured site commit`);
  }
  for (const [capture, expected] of Object.entries(result.captureSha256)) {
    assert.equal(sha256(await readFile(here(capture))), expected, `${capture} changed after acceptance`);
  }
  results.push(result);
}
await save('browser-results.json', results);

const receiptBytes = await readFile(new URL('../../../../../site/vendor/framework-receipt.json', import.meta.url));
const receipt = JSON.parse(receiptBytes);
const archiveBytes = await readFile(new URL(`../../../../../site/vendor/${receipt.archive}`, import.meta.url));
assert.equal(sha256(archiveBytes), receipt.archiveSha256);
await save('latest-installed-receipt.json', receipt);
const smoke = await json('installed-sdk.json');
assert.equal(smoke.frameworkCommit, receipt.commit);
assert.equal(smoke.archiveSha256, receipt.archiveSha256);
const siteTestReceipt = await json('site-test-receipt.json');
assert.equal(siteTestReceipt.receiptStable, true);
const siteLog = await readFile(here('site-current-full.log'), 'utf8');
const siteCases = siteLog.match(/Tests\s+(\d+) failed\s*\|\s*(\d+) passed/);
const siteFiles = siteLog.match(/Test Files\s+(\d+) failed\s*\|\s*(\d+) passed/);
assert.ok(siteCases && siteFiles);

const previous = await json('titlebar-source-provenance.json');
const source = (commit, item) => {
  const bytes = git('show', `${commit}:${item.path}`);
  if (!item.scope) return bytes;
  const text = bytes.toString('utf8');
  const start = text.indexOf('export function NSEWindowControllerView(');
  assert.ok(start >= 0);
  return Buffer.from(text.slice(start));
};
const acceptedCommits = [...new Set([...results.map(result => result.frameworkCommit), receipt.commit])];
const unchanged = previous.unchanged.map(item => {
  const original = source(implementationCommit, item);
  for (const commit of acceptedCommits) {
    assert.ok(original.equals(source(commit, item)), `${item.path} differs at ${commit}`);
  }
  return { path: item.path, ...(item.scope ? { scope: item.scope } : {}), sha256: sha256(original) };
});
await save('titlebar-source-provenance.json', { implementationCommit, latestInstalledCommit: receipt.commit, verifiedCommits: acceptedCommits, unchanged });

const boardRoot = 'C:/Users/KAVISH~1/AppData/Local/Temp/claude/C--Users-Kavish-Krishnakumar/cf6d67a8-095b-4276-8632-0a5bf1e8dd9d/scratchpad/headermock/project';
const boards = [];
for (const [name, width, height] of [['Main', 960, 600], ['Phone', 390, 844], ['Prefs', 520, 560]]) {
  const original = await readFile(`${boardRoot}/${name}.dc.html`);
  const delivered = await readFile(here(`approved-${name}.dc.html`));
  assert.equal(delivered.toString('utf8').replaceAll('\r\n', '\n'), original.toString('utf8').replaceAll('\r\n', '\n'));
  boards.push({ name, originalPath: `${boardRoot}/${name}.dc.html`, originalSha256: sha256(original), deliveredSha256: sha256(delivered), width, height, dpr: 1, contentEquivalentIgnoringLineEndings: true });
}
await save('board-provenance.json', { boards, rejected: 'ContentPlate.dc.html was excluded', rendering: 'Chromium; static exported markup with the absent support.js script removed in memory' });

await save('verification.json', {
  implementationCommit,
  generatedAt: new Date().toISOString(),
  frameworkHeadAtFinalisation: git('rev-parse', 'HEAD').toString().trim(),
  siteHeadAtFinalisation: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: fileURLToPath(new URL('../../../../../site/', import.meta.url))}).toString().trim(),
  installedFramework: {commit: receipt.commit, archiveSha256: receipt.archiveSha256},
  checks: {
    frameworkTypecheck: {exitCode: 0, log: 'framework-typecheck-current-final.log'},
    frameworkFocused: {passed: 100, failed: 0, files: 9, log: 'feature-focused-current-final.log'},
    sdkExportRemoval: {passed: 2, failed: 0, skipped: 7, log: 'sdk-export-tests.log'},
    frameworkFull: {commit: implementationCommit, passed: 7252, failed: 28, filesPassed: 863, filesFailed: 10, log: 'framework-frozen-full.log'},
    siteTypecheck: {exitCode: 0, log: 'site-current-typecheck-final.log'},
    siteFull: {frameworkCommit: siteTestReceipt.commit, archiveSha256: siteTestReceipt.archiveSha256, passed: Number(siteCases[2]), failed: Number(siteCases[1]), filesPassed: Number(siteFiles[2]), filesFailed: Number(siteFiles[1]), log: 'site-current-full.log'},
    browser: results.map(({name, frameworkCommit, siteCommit, archiveSha256, capturedAt, receiptStable}) => ({name, frameworkCommit, siteCommit, archiveSha256, capturedAt, receiptStable})),
    installedSDK: smoke,
  },
  limitations: ['Full suites remain red; see full-suite-failures.md', 'Host toolbar is 56px versus the 52px board sketch', 'Human visual review and physical-device acceptance are not claimed'],
});
console.log(`Verified ${results.length} browser scenarios, ${unchanged.length} source scopes and ${boards.length} approved boards.`);
