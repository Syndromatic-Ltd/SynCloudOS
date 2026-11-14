#!/usr/bin/env node
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

import assert from "node:assert/strict";
import { parseConsumerArgs, runInstalledAppBrowserCheck } from "./check-fx-app-browser-harness.mjs";

const appInfoSource = `export default {
  bundleIdentifier: "org.example.dispatch-probe",
  displayName: "Dispatch Probe",
  version: "1.0.0",
  routes: [{ path: "/dispatch-probe", primary: true }],
};
`;

const appSource = `import { NSEApplication } from "@syndromatic/syncloudos";
import { NSEData } from "@syndromatic/syncloudos/foundation";
import {
  DFXGroup,
  DFXQoSClass,
  DFXQueue,
  DFXSemaphore,
  DFXWorkItem,
  dispatchPrecondition,
  DFXPredicate,
} from "@syndromatic/syncloudos/fx/dispatch";

export { DFXQueue };

export async function runDispatchChecks() {
  const win = window as Window & { fxDispatchStage?: string };
  win.fxDispatchStage = "precondition";
  const main = DFXQueue.main;
  const preconditionMatched = await new Promise<boolean>((resolve) => {
    main.async(() => {
      dispatchPrecondition(DFXPredicate.onQueue(main));
      resolve(true);
    });
  });

  win.fxDispatchStage = "worker";
  const globalQueue = DFXQueue.global(DFXQoSClass.userInitiated);
  const factor = 21;
  const workerCheck = await new Promise<{
    onWorker: boolean;
    computed: number;
    workerSum: number;
    callerByteLength: number;
    frozenCloneRejected: boolean;
  }>((resolve) => {
    const raw = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const data = NSEData.from(raw);
    const bytes = data.bytes;
    const bag = { nested: { count: 1 } };
    globalQueue.async(() => {
      const onWorker = typeof self !== "undefined" && typeof (globalThis as { window?: unknown }).window === "undefined";
      const computed = factor * 2;
      const workerSum = new Uint8Array(bytes).reduce((acc, value) => acc + value, 0);
      let frozenCloneRejected = false;
      try {
        (bag.nested as { count: number }).count = 99;
      } catch (error) {
        frozenCloneRejected = error instanceof TypeError;
      }
      DFXQueue.main.async(() => {
        resolve({
          onWorker,
          computed,
          workerSum,
          callerByteLength: data.count,
          frozenCloneRejected,
        });
      });
    });
  });

  win.fxDispatchStage = "serial";
  const serial = new DFXQueue("org.example.dispatch-probe.serial");
  const serialOrder: number[] = [];
  const group = new DFXGroup();
  const semaphore = new DFXSemaphore(1);
  for (const step of [1, 2, 3]) {
    group.enter();
    serial.async(() => {
      const observed = step;
      DFXQueue.main.async(() => {
        semaphore.wait();
        serialOrder.push(observed);
        semaphore.signal();
        group.leave();
      });
    });
  }
  await new Promise<void>((resolve) => {
    group.notify(DFXQueue.main, () => resolve());
  });

  win.fxDispatchStage = "workItem";
  const itemOrder: string[] = [];
  const workItem = new DFXWorkItem(() => {
    itemOrder.push("ran");
  });
  await new Promise<void>((resolve) => {
    workItem.notify(DFXQueue.main, () => {
      itemOrder.push("notified");
      resolve();
    });
    main.async(workItem);
  });

  win.fxDispatchStage = "concurrentPerform";

  const baseQueueCount = (() => {
    let concurrentHits = 0;
    DFXQueue.concurrentPerform(4, () => {
      concurrentHits += 1;
    });
    return concurrentHits;
  })();

  return {
    label: main.label,
    preconditionMatched,
    workerCheck,
    serialOrder,
    itemOrder,
    concurrentHits: baseQueueCount,
    verifyEnded() {
      try {
        main.sync(() => {});
        return false;
      } catch (error) {
        return /ended|disposed|cancelled/iu.test(String(error));
      }
    },
  };
}

export default class DispatchProbe extends NSEApplication {}
`;

const mainSource = `import "@syndromatic/syncloudos/nse/styles.css";
import "@syndromatic/syncloudos/browser/styles.css";
import { mountSynCloudOS } from "@syndromatic/syncloudos/browser";
import { DFXQueue as BaseQueue } from "@syndromatic/syncloudos/fx/dispatch";
import { DFXQueue as BoundQueue, runDispatchChecks } from "./SynWare/DispatchProbe.app/Contents/index";

declare global {
  interface Window {
    fxDispatch?: Record<string, unknown>;
  }
}

async function run() {
  const unattributedFailed = (() => {
    try {
      new BaseQueue("outside.unattributed");
      return false;
    } catch {
      return true;
    }
  })();

  const host = await mountSynCloudOS({
    element: document.getElementById("root")!,
    application: { bundleIdentifier: "org.example.dispatch-probe" },
    authentication: "disabled",
    deploymentBasePath: import.meta.env.BASE_URL,
  });

  const runtime = await runDispatchChecks();
  await host.dispose("DFX-installed browser consumer verification");
  const endedAfterDispose = runtime.verifyEnded();

  window.fxDispatch = {
    ready: true,
    base: import.meta.env.BASE_URL,
    separateBoundClass: BoundQueue !== BaseQueue,
    unattributedFailed,
    ...runtime,
    endedAfterDispose,
  };
}

run().catch(error => {
  window.fxDispatch = {
    ready: false,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
});
`;

async function main() {
  const { base, keep } = parseConsumerArgs();
  const evidence = await runInstalledAppBrowserCheck({
    prefix: "synware-fx-dispatch-",
    receiptFileName: base === "/" ? "fx-dispatch-consumer.json" : "fx-dispatch-nested-consumer.json",
    base,
    keep,
    files: {
      "src/SynWare/DispatchProbe.app/Contents/Info.ts": appInfoSource,
      "src/SynWare/DispatchProbe.app/Contents/index.tsx": appSource,
      "src/main.tsx": mainSource,
    },
    async verifyPage({ engine, page, pageErrors, consoleErrors, failedRequests }) {
      try {
        await page.waitForFunction(() => Boolean(window.fxDispatch?.ready || window.fxDispatch?.error), { timeout: 30_000 });
      } catch (waitError) {
        const snapshot = await page.evaluate(() => ({
          stage: window.fxDispatchStage ?? null,
          fxDispatch: window.fxDispatch ?? null,
        })).catch(() => null);
        throw new Error(
          `${engine} Dispatch probe timed out (${JSON.stringify({ snapshot, pageErrors, consoleErrors, failedRequests })})`,
          { cause: waitError },
        );
      }
      const result = await page.evaluate(() => window.fxDispatch);
      assert.equal(result.error ?? null, null, `${engine} Dispatch probe failed: ${result.error}`);
      assert.equal(result.ready, true, `${engine} Dispatch probe did not reach ready state.`);
      assert.equal(result.preconditionMatched, true, `${engine} dispatchPrecondition(onQueue(main)) failed.`);
      assert.equal(result.base, base, `${engine} served unexpected BASE_URL.`);
      assert.equal(result.separateBoundClass, true, `${engine} must bind a per-app DFXQueue subclass.`);
      assert.equal(result.unattributedFailed, true, `${engine} must reject unattributed DFXQueue construction outside .app bundles.`);
      assert.deepEqual(
        result.workerCheck,
        {
          onWorker: true,
          computed: 42,
          workerSum: 36,
          callerByteLength: 8,
          frozenCloneRejected: true,
        },
        `${engine} worker closure conversion or captured data verification failed.`,
      );
      assert.deepEqual(result.serialOrder, [1, 2, 3]);
      assert.deepEqual(result.itemOrder, ["ran", "notified"]);
      assert.equal(result.concurrentHits, 4);
      assert.equal(result.endedAfterDispose, true, `${engine} mounted DFXQueue.main must reject work after host disposal.`);
      return result;
    },
  });
  console.log(`FX Dispatch installed browser consumer passed (${Object.keys(evidence.browsers).join(", ")}) at base ${evidence.base}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
