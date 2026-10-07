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

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const MATRIX_PROJECTS = Object.freeze([
  "chromium",
  "firefox",
  "webkit",
  "mobile-webkit",
  "mobile-chromium",
  "chromium-high-dpr",
  "chromium-reduced-motion",
]);

export const DEFAULT_MATRIX_WORKERS = 1;

export function discoverMatrixCases(report, projects = MATRIX_PROJECTS) {
  if (report.errors?.length) throw new Error(`Browser discovery failed: ${report.errors.map(error => error.message).join("\n")}`);
  const counts = new Map(projects.map(project => [project, 0]));
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (counts.has(test.projectName)) counts.set(test.projectName, counts.get(test.projectName) + 1);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  for (const [project, count] of counts) if (count === 0) throw new Error(`Browser matrix project ${project} selected no tests.`);
  return counts;
}

export function assertMatrixProjectComplete(summary, expected) {
  const total = summary.passed + summary.skipped + summary.failed;
  if (summary.failed > 0 || total !== expected) {
    throw new Error(`Browser matrix project ${summary.project} reported ${total} cases (${summary.failed} failed); expected ${expected}.`);
  }
}

const targetedOptions = new Set([
  "--browser",
  "--config",
  "--debug",
  "--device",
  "--fully-parallel",
  "--grep",
  "--grep-invert",
  "--last-failed",
  "--last-failed-file",
  "--list",
  "--max-failures",
  "--no-deps",
  "--only-changed",
  "--pass-with-no-tests",
  "--project",
  "--repeat-each",
  "--run-agents",
  "--shard",
  "--test-list",
  "--test-list-invert",
  "--ui",
  "-G",
  "-c",
  "-g",
  "-x",
]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = path.join(repoRoot, "node_modules", "playwright", "cli.js");

const activeChildren = new Set();
let interrupted = false;
const matrixValueOptions = new Set(["--workers", "-j", "--reporter", "--timeout", "--global-timeout", "--output", "--retries"]);

export function isFullMatrixInvocation(args) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith("-")) return false;
    const option = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (targetedOptions.has(option) || option === "--headed") return false;
    if (arg.startsWith("-g") || arg.startsWith("-G") || arg.startsWith("-c")) return false;
    if (!arg.includes("=") && matrixValueOptions.has(option) && args[index + 1] && !args[index + 1].startsWith("-")) index++;
  }
  return true;
}

export function buildProjectArguments(project, forwardedArgs) {
  const hasWorkerLimit = forwardedArgs.some(
    (argument) =>
      argument === "--workers" ||
      argument.startsWith("--workers=") ||
      argument === "-j" ||
      (argument.startsWith("-j") && argument.length > 2),
  );
  // The framework fixture server is a shared transform authority for
  // one browser project. More than one worker can exhaust it mid-project, so
  // the canonical matrix has a bounded worker owner by default. A caller may
  // still opt into a different limit explicitly for focused diagnostics.
  const workerArguments = !isFullMatrixInvocation(forwardedArgs) || hasWorkerLimit
    ? []
    : [`--workers=${DEFAULT_MATRIX_WORKERS}`];

  return ["test", "--config=playwright.config.ts", `--project=${project}`, ...workerArguments, ...forwardedArgs];
}

export function parsePlaywrightSummary(output) {
  const lastNumber = (pattern) => {
    const matches = [...output.matchAll(pattern)];
    const match = matches.at(-1);
    return match ? Number(match[1]) : 0;
  };

  return {
    passed: lastNumber(/\b(\d+)\s+passed\b/g),
    skipped: lastNumber(/\b(\d+)\s+skipped\b/g),
    failed: lastNumber(/\b(\d+)\s+failed\b/g),
  };
}

export function aggregateProjectResults(projectResults) {
  const totals = projectResults.reduce(
    (accumulator, result) => ({
      passed: accumulator.passed + result.passed,
      skipped: accumulator.skipped + result.skipped,
      failed: accumulator.failed + result.failed,
    }),
    { passed: 0, skipped: 0, failed: 0 },
  );

  return { ...totals, total: totals.passed + totals.skipped + totals.failed };
}

function waitForClose(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once("close", resolve));
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      killer.once("close", resolve);
      killer.once("error", resolve);
    });
    await waitForClose(child);
  } else {
    child.kill("SIGTERM");
    await waitForClose(child);
  }
}

function spawnChild(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: options.env ?? process.env,
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  activeChildren.add(child);

  return new Promise((resolve, reject) => {
    let output = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        output += text;
        if (!options.quiet) process.stdout.write(text);
      });
    }
    child.once("error", (error) => {
      activeChildren.delete(child);
      reject(error);
    });
    child.once("close", (code, signal) => {
      activeChildren.delete(child);
      resolve({ code: code ?? 1, signal, output });
    });
  });
}

async function runPlaywright(forwardedArgs, env = process.env, capture = false) {
  return spawnChild(process.execPath, [playwrightCli, ...forwardedArgs], { env, capture });
}

async function runMatrix(forwardedArgs) {
  const projectResults = [];

  // The inventory is produced by the same configuration and selected engines
  // as execution. Adding a regression must not leave a stale release count.
  const discoveryArgs = [];
  for (let index = 0; index < forwardedArgs.length; index++) {
    const argument = forwardedArgs[index];
    if (argument === "--reporter") { index++; continue; }
    if (argument.startsWith("--reporter=")) continue;
    discoveryArgs.push(argument);
  }
  const discovery = await spawnChild(process.execPath, [playwrightCli, "test", "--config=playwright.config.ts", "--list", "--reporter=json", ...discoveryArgs], { env: process.env, capture: true, quiet: true });
  if (discovery.code !== 0) throw new Error(`Browser matrix discovery failed: ${discovery.output}`);
  const inventory = discoverMatrixCases(JSON.parse(discovery.output));
  const expectedCases = [...inventory.values()].reduce((sum, count) => sum + count, 0);

  for (const project of MATRIX_PROJECTS) {
    if (interrupted) return 130;
    process.stdout.write(`\n[framework-e2e] starting isolated project ${project} (${inventory.get(project)} cases)\n`);
    // Let each Playwright child own exactly one Vite server. Reusing a live
    // server across browser engines can retain WebKit network workers after
    // the child test process has finished, so project isolation includes the
    // server lifecycle as well as the Playwright worker lifecycle.
    const childEnv = {
      ...process.env,
      CI: "1",
      PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? "5377",
    };
    delete childEnv.FRAMEWORK_E2E_SERVER_READY;
    const result = await runPlaywright(buildProjectArguments(project, forwardedArgs), childEnv, true);
    const summary = { project, ...parsePlaywrightSummary(result.output) };
    projectResults.push(summary);
    process.stdout.write(
      `[framework-e2e] ${project}: ${summary.passed} passed, ${summary.skipped} skipped, ${summary.failed} failed\n`,
    );
    if (result.code !== 0 || summary.failed > 0) {
      throw new Error(`Playwright project ${project} failed with exit code ${result.code}.`);
    }
    assertMatrixProjectComplete(summary, inventory.get(project));
  }

  const totals = aggregateProjectResults(projectResults);
  if (totals.total !== expectedCases) {
    throw new Error(`Framework browser matrix selected ${totals.total} cases; expected ${expectedCases}.`);
  }
  process.stdout.write(
    `[framework-e2e] complete: ${totals.passed} passed, ${totals.skipped} skipped, ${totals.failed} failed (${totals.total} total)\n`,
  );
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (!isFullMatrixInvocation(args)) {
    const hasExplicitConfig = args.some((arg) =>
      arg === "--config" ||
      arg.startsWith("--config=") ||
      arg === "-c" ||
      arg.startsWith("-c="),
    );
    const configArgument = hasExplicitConfig ? [] : ["--config=playwright.config.ts"];
    const result = await runPlaywright(["test", ...configArgument, ...args]);
    process.exitCode = result.code;
    return;
  }

  process.exitCode = await runMatrix(args);
}

const handleInterrupt = () => {
  interrupted = true;
  for (const child of activeChildren) void terminateProcess(child);
};

process.once("SIGINT", handleInterrupt);
process.once("SIGTERM", handleInterrupt);

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch(async (error) => {
    for (const child of activeChildren) await terminateProcess(child);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
