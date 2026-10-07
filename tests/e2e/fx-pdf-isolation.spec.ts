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

import { expect, test, type Worker as PlaywrightWorker } from "playwright/test";

test("GraphicsFX isolates PDF parsing, scanning and embedding in real browser workers", async ({ page, browserName }) => {
  const workerRequests: string[] = [];
  const pageErrors: string[] = [];
  const workers = new Set<PlaywrightWorker>();
  const closedWorkers = new Set<PlaywrightWorker>();
  page.on("pageerror", error => pageErrors.push(error.stack ?? error.message));
  page.on("worker", worker => {
    if (!/pdf-document\.worker/u.test(worker.url())) return;
    workers.add(worker);
    worker.on("close", () => closedWorkers.add(worker));
  });
  page.on("request", request => {
    if (/pdf-document\.worker|pdf\.worker\.min/u.test(request.url())) workerRequests.push(request.url());
  });
  // Record native worker construction and termination without replacing either
  // behaviour: the construct trap returns the real Worker, and the prototype
  // wrapper calls the real terminate (the cancellation probe below chains it).
  await page.addInitScript(() => {
    const state = { constructed: 0, live: new Set<Worker>() };
    (window as typeof window & { __pdfWorkerLifecycle: typeof state }).__pdfWorkerLifecycle = state;
    const nativeTerminate = Worker.prototype.terminate;
    Worker.prototype.terminate = function() {
      state.live.delete(this);
      nativeTerminate.call(this);
    };
    window.Worker = new Proxy(Worker, {
      construct(target, args, newTarget) {
        const worker = Reflect.construct(target, args, newTarget) as Worker;
        if (/pdf-document\.worker/u.test(String(args[0]))) { state.constructed++; state.live.add(worker); }
        return worker;
      },
    });
  });
  await page.goto("/tests/e2e/fixtures/fx-pdf-isolation-browser.html");
  const result = await page.evaluate(async () => {
    const graphics = await import("/src/FX/GraphicsFX/public.ts");
    const writer = new graphics.GFXPDFContext({ title: "FX-08 isolated fixture" });
    writer.beginPage({ width: 40, height: 30 });
    writer.fill(graphics.GFXPath.rect({ x: 2, y: 3, width: 10, height: 8 }), graphics.GFXColour.rgba(1, 0, 0));
    writer.endPage();
    const bytes = await writer.finish();
    const document = await graphics.GFXPDFDocument.open(bytes, {
      maximumEncodedBytes: bytes.length + 1024,
      maximumDecodedBytes: 4 * 1024 * 1024,
      maximumOperationMilliseconds: 10000,
    });
    const scanner = new graphics.GFXPDFScanner(document, 1024 * 1024);
    const objects = scanner.objects();
    const first = objects[0] ? scanner.object(objects[0].reference) : null;

    const destination = new graphics.GFXPDFContext({ title: "FX-08 embedded fixture" });
    destination.beginPage({ width: 80, height: 60 });
    destination.drawPDFPage(document, 0, { x: 0, y: 0, width: 80, height: 60 });
    destination.endPage();
    const embeddedBytes = await destination.finish();
    const embedded = await graphics.GFXPDFDocument.open(embeddedBytes, { maximumOperationMilliseconds: 10000 });
    const embeddedGeometry = embedded.page(0).mediaBox;
    embedded.dispose();

    let malformed: { name: string; code?: string } | null = null;
    try {
      const unexpected = await graphics.GFXPDFDocument.open(bytes.slice(0, Math.max(8, bytes.length - 128)), { maximumOperationMilliseconds: 10000 });
      unexpected.dispose();
    } catch (error) {
      malformed = { name: error instanceof Error ? error.name : "unknown", code: (error as { code?: string })?.code };
    }
    let bounded: { name: string; code?: string } | null = null;
    try {
      const unexpected = await graphics.GFXPDFDocument.open(bytes, { maximumEncodedBytes: bytes.length - 1 });
      unexpected.dispose();
    } catch (error) {
      bounded = { name: error instanceof Error ? error.name : "unknown", code: (error as { code?: string })?.code };
    }
    let decodedBounded: { name: string; code?: string } | null = null;
    try {
      const unexpected = await graphics.GFXPDFDocument.open(bytes, { maximumDecodedBytes: 1, maximumOperationMilliseconds: 10000 });
      unexpected.dispose();
    } catch (error) {
      decodedBounded = { name: error instanceof Error ? error.name : "unknown", code: (error as { code?: string })?.code };
    }

    const controller = new AbortController();
    let cancelled: { name: string; code?: string } | null = null;
    let cancellationTransferred = false;
    let cancellationTerminated = false;
    let didPost!: () => void;
    const requestPosted = new Promise<void>(resolve => { didPost = resolve; });
    const nativePostMessage = Worker.prototype.postMessage;
    const nativeTerminate = Worker.prototype.terminate;
    // Observe native dispatch rather than aborting before the lazy worker
    // backend has started. No worker method or parser response is mocked.
    Worker.prototype.postMessage = function(message, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
      const transfer = Array.isArray(transferOrOptions) ? transferOrOptions : transferOrOptions?.transfer;
      const transferred = message?.bytes instanceof ArrayBuffer && transfer?.includes(message.bytes);
      Reflect.apply(nativePostMessage, this, [message, transferOrOptions]);
      if (message?.operation === "open") {
        cancellationTransferred = transferred === true && message.bytes.byteLength === 0;
        didPost();
      }
    };
    Worker.prototype.terminate = function() {
      cancellationTerminated = true;
      nativeTerminate.call(this);
    };
    try {
      const cancelledOpen = graphics.GFXPDFDocument.open(bytes, { maximumOperationMilliseconds: 10000 }, controller.signal).then(
        unexpected => { unexpected.dispose(); return null; },
        error => ({ name: error instanceof Error ? error.name : "unknown", code: (error as { code?: string })?.code }),
      );
      await Promise.race([
        requestPosted,
        cancelledOpen.then(() => { throw new Error("PDF open settled before native worker dispatch."); }),
      ]);
      controller.abort(new DOMException("browser cancellation fixture", "AbortError"));
      cancelled = await cancelledOpen;
    } finally {
      Worker.prototype.postMessage = nativePostMessage;
      Worker.prototype.terminate = nativeTerminate;
    }
    const recovered = await graphics.GFXPDFDocument.open(bytes, { maximumOperationMilliseconds: 10000 });
    const recoveredPageCount = recovered.pageCount;
    recovered.dispose();
    const value = {
      worker: typeof Worker === "function",
      pageCount: document.pageCount,
      title: document.metadata.title,
      permissions: document.permissions.raw,
      objectCount: objects.length,
      firstKind: first?.kind ?? null,
      embeddedBytes: embeddedBytes.length,
      embeddedGeometry,
      malformed,
      bounded,
      decodedBounded,
      cancelled,
      cancellationTransferred,
      cancellationTerminated,
      recoveredPageCount,
    };
    document.dispose();
    return value;
  });

  expect(result.worker, `${browserName} Worker support`).toBe(true);
  expect(result.pageCount).toBe(1);
  expect(result.title).toBe("FX-08 isolated fixture");
  expect(result.permissions).toBeNull();
  expect(result.objectCount).toBeGreaterThan(0);
  expect(result.firstKind).not.toBeNull();
  expect(result.embeddedBytes).toBeGreaterThan(100);
  expect(result.embeddedGeometry).toMatchObject({ width: 80, height: 60 });
  expect(result.malformed?.code).toBe("malformed");
  expect(result.bounded?.code).toBe("limit");
  expect(result.decodedBounded?.code).toBe("limit");
  expect(result.cancelled?.name).toBe("AbortError");
  expect(result.cancellationTransferred, `${browserName} cancellation follows native byte transfer`).toBe(true);
  expect(result.cancellationTerminated, `${browserName} cancelled parser is terminated`).toBe(true);
  expect(result.recoveredPageCount).toBe(1);
  expect(workerRequests.some(url => /pdf-document\.worker/u.test(url)), `${browserName} isolated PDF worker request`).toBe(true);
  expect(workers.size, `${browserName} native PDF worker lifecycle`).toBeGreaterThan(0);
  const lifecycle = await page.evaluate(() => {
    const state = (window as typeof window & { __pdfWorkerLifecycle: { constructed: number; live: Set<Worker> } }).__pdfWorkerLifecycle;
    return { constructed: state.constructed, live: state.live.size };
  });
  // Playwright can miss the `worker` event for a worker terminated in the task
  // that constructed it, so it may observe fewer workers than were constructed.
  expect(lifecycle.constructed, `${browserName} constructed PDF workers`).toBeGreaterThanOrEqual(workers.size);
  expect(lifecycle.live, `${browserName} PDF workers left unterminated`).toBe(0);
  // Playwright Firefox does not reliably report `close` for a worker terminated
  // in the task that constructed it (the cancellation case), so Playwright's
  // close events are a complete witness only in Chromium and WebKit; Firefox
  // relies on the in-page record of native construction and termination above.
  if (browserName !== "firefox")
    await expect.poll(() => closedWorkers.size, { message: `${browserName} PDF workers terminate after settling` }).toBe(workers.size);
  expect(pageErrors, `${browserName} uncaught page/worker errors`).toEqual([]);
  console.log(`FX-08 ${browserName}: objects=${result.objectCount} embedded=${result.embeddedBytes} workerRequests=${workerRequests.length} closedWorkers=${closedWorkers.size}/${workers.size} cancellationTransferred=${result.cancellationTransferred} cancellationTerminated=${result.cancellationTerminated} decodedLimit=${result.decodedBounded?.code}`);
});
