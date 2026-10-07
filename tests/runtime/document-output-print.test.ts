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

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { chromium } from "playwright";
import { createDocumentOutputPreparation } from "../../src/SynCloudOS/Documents/DocumentOutputPreparation";
import type { DocumentOutputPDFArtifact } from "../../src/SynCloudOS/Documents/documentOutputTypes";

async function printing() {
  const module = await import("../../src/SynCloudOS/Documents/documentOutputPrint").catch(() => null);
  expect(module?.requestDocumentOutputPrint, "C07 printing needs a separate synchronous activation gate").toBeTypeOf("function");
  return module!.requestDocumentOutputPrint;
}
async function artifact(): Promise<DocumentOutputPDFArtifact> {
  const prepared = await createDocumentOutputPreparation({ settle: () => ({ status: "settled" }), capture: () => ({ documentId: "print", revision: 3, model: {} }) })
    .prepare({ purpose: "print", engine: () => ({ pages: [{ geometry: { width: 72, height: 144 }, draw() {} }] }) });
  if (prepared.status !== "prepared") throw new Error("print fixture failed");
  const result = await prepared.output.exportPDF();
  if (result.status !== "exported") throw new Error("print PDF failed");
  return result;
}

describe("document output print activation", () => {
  it("leaves an artifact prepared when asynchronous preparation has lost activation", async () => {
    const print = await printing();
    const pdf = await artifact();
    let dialogs = 0;
    const result = print(pdf, { isUserActivationActive: () => false, requestDialog: () => { dialogs++; return "dialog-requested"; } });
    expect(result.status).toBe("prepared");
    expect(result.receipt.revision).toBe(3);
    expect(dialogs).toBe(0);
  });
  it("requests the dialog synchronously during a fresh user gesture without claiming physical completion", async () => {
    const print = await printing();
    const pdf = await artifact();
    const order: string[] = [];
    const result = print(pdf, { isUserActivationActive: () => true, requestDialog: value => { expect(value).toBe(pdf); order.push("dialog"); return "dialog-requested"; } });
    order.push("return");
    expect(order).toEqual(["dialog", "return"]);
    expect(result.status).toBe("dialog-requested");
  });
  it.each(["canceled", "failed"] as const)("reports a %s dialog request honestly", async status => {
    const print = await printing();
    const result = print(await artifact(), { isUserActivationActive: () => true, requestDialog: () => {
      if (status === "failed") throw new Error("host request failed");
      return "canceled";
    } });
    expect(result.status).toBe(status);
  });

  it("uses actual Chromium user activation and requests nothing before a user click", async () => {
    const source = readFileSync("src/SynCloudOS/Documents/documentOutputPrint.ts", "utf8");
    // Transpile only the owned print module; no server, application or package build.
    const script = transformSync(source, { loader: "ts", format: "iife", globalName: "OutputPrint" }).code;
    const pdf = await artifact();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto('data:text/html,<button id="print">Print prepared output</button>');
      const session = await page.context().newCDPSession(page);
      // Playwright evaluate/addScriptTag grant a user gesture in Chromium. CDP explicitly avoids that.
      await session.send("Runtime.evaluate", { expression: script, userGesture: false });
      const setup = (artifact: DocumentOutputPDFArtifact) => {
        const scope = window as typeof window & {
          OutputPrint: typeof import("../../src/SynCloudOS/Documents/documentOutputPrint");
          outputPrintStates: string[]; outputPrintDialogs: number;
        };
        scope.outputPrintStates = [];
        scope.outputPrintDialogs = 0;
        const host = scope.OutputPrint.createBrowserDocumentOutputPrintHost({ navigator, print() { scope.outputPrintDialogs++; } });
        scope.outputPrintStates.push(scope.OutputPrint.requestDocumentOutputPrint(artifact, host).status);
        document.querySelector("#print")!.addEventListener("click", () => {
          scope.outputPrintStates.push(scope.OutputPrint.requestDocumentOutputPrint(artifact, host).status);
        });
        return { active: navigator.userActivation.isActive, states: scope.outputPrintStates, dialogs: scope.outputPrintDialogs };
      };
      const initial = await session.send("Runtime.evaluate", { expression: `(${setup.toString()})(${JSON.stringify(pdf)})`, userGesture: false, returnByValue: true });
      expect(initial.exceptionDetails).toBeUndefined();
      expect(initial.result.value).toEqual({ active: false, states: ["prepared"], dialogs: 0 });
      await page.click("#print");
      const read = () => {
        const scope = window as typeof window & { outputPrintStates: string[]; outputPrintDialogs: number };
        return { states: scope.outputPrintStates, dialogs: scope.outputPrintDialogs };
      };
      const clicked = await session.send("Runtime.evaluate", { expression: `(${read.toString()})()`, userGesture: false, returnByValue: true });
      expect(clicked.result.value).toEqual({ states: ["prepared", "dialog-requested"], dialogs: 1 });
    } finally { await browser.close(); }
  }, 20_000);
});
