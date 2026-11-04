/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Launch smoke check: loads the project's host entry in a jsdom page through the project's own
// Vite configuration, so the production browser host launches the application exactly as a
// browser would. validate runs it in a child process; it never shares globals with the server.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "node:util";

const SETTLE_MS = 2000;
const TIMEOUT_MS = 60000;
const MARKER = "__SYNCLOUDOS_LAUNCH_CHECK__";
// jsdom reports browser features it does not implement (canvas contexts, layout, media) through
// console.error. They are limits of the check, not faults in the application.
/** What the check cannot see, so a passing launch is not read as more than it is. */
const LIMITS = Object.freeze(["No layout, canvas drawing or WebGL: visual problems are not detected.", "Workers start but never reply: work they do is not checked."]);
const ENVIRONMENT_NOISE =/^(?:Error: )?Not implemented:|^Could not parse CSS stylesheet/u;

/** The module script the project's index.html loads, as a root-relative URL. */
export function hostEntryFor(root) {
  const html = resolve(root, "index.html");
  if (!existsSync(html)) return null;
  const match = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/iu.exec(readFileSync(html, "utf8"))
    ?? /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/iu.exec(readFileSync(html, "utf8"));
  if (!match || /^[a-z]+:/iu.test(match[1])) return null;
  return match[1].startsWith("/") ? match[1] : `/${match[1].replace(/^\.\//u, "")}`;
}

/** Runs the launch check for `root` in a child process and returns findings. */
export async function runLaunchCheck(root) {
  const require = createRequire(resolve(root, "package.json"));
  const missing = ["vite", "jsdom"].filter(name => { try { require.resolve(name); return false; } catch { return true; } });
  if (missing.length) return { ran: false, reason: `Install ${missing.join(" and ")} in the project to run the launch check.`, findings: [] };
  const entry = hostEntryFor(root);
  if (!entry) return { ran: false, reason: "No module script in index.html names the host entry.", findings: [] };
  const report = await new Promise(done => {
    execFile(process.execPath, [fileURLToPath(import.meta.url), root, entry], { cwd: root, timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      const line = stdout.split(/\r?\n/u).find(value => value.startsWith(MARKER));
      if (line) { done(JSON.parse(line.slice(MARKER.length))); return; }
      done({ problems: [{ kind: "load", message: error?.killed ? `The launch did not settle within ${TIMEOUT_MS / 1000} seconds.` : String(error?.message ?? "The launch check process failed.") }], stopped: false });
    });
  });
  const findings = [];
  const file = entry.replace(/^\//u, "");
  for (const problem of report.problems) {
    const fatal = problem.kind === "load";
    findings.push({ file, line: 1, rule: fatal ? "launch.failed" : "launch.error", ...(fatal ? {} : { severity: "warning" }), message: fatal ? `The application did not launch: ${problem.message}` : `${problem.kind === "console.error" ? "Logged during launch" : "Thrown during launch"}: ${problem.message}` });
  }
  if (report.stopped) {
    // The errors logged while it failed say why; fold them into the one finding.
    const logged = findings.filter(finding => finding.rule === "launch.error").map(finding => finding.message.replace(/^Logged during launch: |^Thrown during launch: /u, ""));
    findings.splice(0, findings.length, ...findings.filter(finding => finding.rule !== "launch.error"));
    findings.push({ file, line: 1, rule: "launch.stopped", message: `The application showed a system alert during launch: "${report.text}"${logged.length ? ` Errors logged: ${logged.join(" ; ")}` : ""}` });
  }
  return { ran: true, entry, limits: LIMITS, findings };
}

function describe(error) {
  const parts = [];
  for (let value = error, depth = 0; value && depth < 4; value = value.cause ?? value.error, depth++) {
    let part;
    if (value instanceof Error) part = `${value.name}: ${value.message}`;
    else if (typeof value === "object") {
      // A captured SynCloudOS error report or operation result: its code, then what went wrong.
      part = [value.code, value.technicalMessage ?? value.message, value.technicalDetails].filter(item => typeof item === "string" && item).join(": ");
      if (!part && !value.error && !value.cause) part = JSON.stringify(value).slice(0, 300);
    } else part = String(value);
    // Wrapped errors repeat their cause's message; keep a link only when it adds something.
    const message = part?.replace(/^[\w-]+: /u, "");
    if (part && !parts.some(previous => message && previous.includes(message))) parts.push(part);
  }
  return parts.join(" <- caused by ").replace(/\u001b\[[0-9;]*m/gu, "").slice(0, 1200);
}

async function child(root, entry) {
  const require = createRequire(resolve(root, "package.json"));
  const { JSDOM } = require("jsdom");
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: "http://localhost/", pretendToBeVisual: true });
  const page = dom.window;
  for (const key of Object.getOwnPropertyNames(page)) {
    if (key in globalThis) continue;
    try { Object.defineProperty(globalThis, key, { value: page[key], configurable: true, writable: true }); } catch {}
  }
  page.matchMedia ??= () => ({ matches: false, media: "", onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
  for (const key of ["window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "matchMedia"]) {
    try { Object.defineProperty(globalThis, key, { value: page[key], configurable: true, writable: true }); } catch {}
  }
  // jsdom runs no workers. A worker that accepts messages and never answers lets an application
  // that starts one finish launching; work it hands to the worker simply stays pending.
  class LaunchCheckWorker extends page.EventTarget {
    constructor() { super(); this.onmessage = null; this.onerror = null; this.onmessageerror = null; }
    postMessage() {}
    terminate() {}
  }
  for (const key of ["Worker", "SharedWorker"]) {
    if (globalThis[key] === undefined) { page[key] = LaunchCheckWorker; globalThis[key] = LaunchCheckWorker; }
  }
  const problems = [];
  const note =(kind, message) => { const text = message.replace(/\u001b\[[0-9;]*m/gu, "").trim(); if (text && !ENVIRONMENT_NOISE.test(text) && !text.includes("Error when evaluating SSR module")) problems.push({ kind, message: text.split(/\r?\n/u).slice(0, 4).join(" | ").slice(0, 1200) }); };
  const write = process.stdout.write.bind(process.stdout);
  console.error = (...args) => note("console.error", format(...args.map(value => value instanceof Error ? describe(value) : value)));
  console.warn = () => {};
  console.log = () => {};
  process.on("unhandledRejection", reason => note("uncaught", describe(reason)));
  process.on("uncaughtException", error => note("uncaught", describe(error)));
  page.addEventListener("error", event => note("uncaught", describe(event.error ?? event.message)));
  // Browser module namespaces hold data properties, which SynCloudOS requires of a lazy SynWare
  // entry; Vite's module runner exposes getters. Snapshot the project module's lazy imports.
  const browserNamespaces = {
    name: "syncloudos-launch-check",
    enforce: "post",
    transform(code, id, options) {
      if (!options?.ssr || !id.includes("virtual:syncloudos") || !code.includes("import(")) return null;
      return { code: "const __scosNamespace = (module) => module.then((value) => Object.freeze({ ...value }));\n" + code.replace(/\bimport\(([^()]*)\)/gu, "__scosNamespace(import($1))"), map: null };
    },
  };
  let server;
  try {
    server = await createServer({ root, logLevel: "silent", appType: "custom", plugins: [browserNamespaces], server: { middlewareMode: true, hmr: false, ws: false }, ssr: { noExternal: [/^@syndromatic\//u] } });
    await server.ssrLoadModule(entry);
    await new Promise(done => setTimeout(done, SETTLE_MS));
  } catch (error) {
    problems.push({ kind: "load", message: describe(error) });
  }
  // A launch that commits can still end on a system alert (a render failure, a crash after
  // launch). Report the alert's own words, plus its technical details when it rendered them.
  const alert = page.document.querySelector(".syncloudos-system-alert");
  const squash = value => (value ?? "").replace(/\s+/gu, " ").trim();
  let text = squash(page.document.body.textContent);
  if (alert) {
    alert.querySelector(".nse-alert-disclosure")?.click();
    await new Promise(done => setTimeout(done, 100));
    const copy = [...alert.querySelectorAll("h1,h2,h3,p")].map(node => squash(node.textContent)).filter(Boolean).join(" ");
    const details = squash(alert.querySelector(".nse-alert-details-text")?.textContent);
    text = `${copy}${details ? `" Technical details: "${details}` : ""}`;
  }
  const stopped = Boolean(alert);
  write(MARKER + JSON.stringify({ problems, stopped, text: text.slice(0, 600) }) + "\n");
  try { await server?.close(); } catch {}
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await child(resolve(process.argv[2]), process.argv[3]);
