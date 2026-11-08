/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** A Dispatch closure returns synchronously, including when R is inferred. */
export type DFXWork<R> = () => R & (R extends PromiseLike<unknown> ? never : unknown);
export type DFXIterationWork<R> = (index: number) => R & (R extends PromiseLike<unknown> ? never : unknown);
const synchronousMessage = "DispatchFX work items are synchronous. Use DFXGroup enter() and leave() around asynchronous work.";
interface ConsoleTask { run<T>(callback: () => T): T; }
function captureTask(label: string): ConsoleTask | null {
  const taskConsole = console as Console & { createTask?: (name: string) => ConsoleTask };
  try { return typeof taskConsole.createTask === "function" ? taskConsole.createTask(`DFX ${label}`) : null; }
  catch { return null; }
}
/** Capture the submitting call site for DevTools' asynchronous task trace. */
export function prepareWork(work: () => unknown, label: string): () => void {
  const task = captureTask(label);
  return () => executeWork(work, label, task);
}

export function reportDispatchError(error: unknown): void {
  if (typeof globalThis.reportError === "function") globalThis.reportError(error);
  else console.error(error);
}
/** Contain an item's failure and consume a forbidden thenable's rejection once. */
export function executeWork(work: () => unknown, label: string, task: ConsoleTask | null = captureTask(label)): void {
  const start = performance.now();
  try {
    const value = task ? task.run(work) : work();
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      const then = (value as { then?: unknown }).then;
      if (typeof then === "function") {
        reportDispatchError(new Error(synchronousMessage));
        // Access `then` only once. A rejected Promise must not also become an
        // unhandled rejection, and hostile thenables must not double-report.
        try { then.call(value, () => {}, () => {}); } catch { /* already reported */ }
      }
    }
  } catch (cause) {
    reportDispatchError(new Error(`DispatchFX queue "${label}": work item threw`, { cause }));
  } finally {
    if ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV && typeof performance.measure === "function") {
      try { performance.measure(`DFX ${label}`, { start, end: performance.now() }); } catch { /* instrumentation cannot stop a queue */ }
    }
  }
}
