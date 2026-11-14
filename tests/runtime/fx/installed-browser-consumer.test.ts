import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { expect, it } from "vitest";

it.each([
  { label: "failed", source: 'const value: number = "wrong"; export { value };', keep: false },
  { label: "kept", source: "export const value = 42;", keep: true },
])("leaves an installed browser consumer available after a $label run", ({ label, source, keep }) => {
  const prefix = "synware-fx-retention-test-";
  const receiptFileName = `fx-browser-retention-${process.pid}-${label}.json`;
  const receiptPath = resolve(".artifacts/synapp-sdk", receiptFileName);
  const options = {
    prefix,
    receiptFileName,
    keep,
    files: {
      "src/main.tsx": 'import { value } from "./SynWare/specimen"; document.body.textContent = String(value);',
      "src/SynWare/specimen.ts": source,
    },
  };
  const environment = { ...process.env };
  delete environment.VITEST;
  delete environment.SYNWARE_KEEP_CONSUMERS;
  try {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { runInstalledAppBrowserCheck } from "./scripts/synware/check-fx-app-browser-harness.mjs";
      await runInstalledAppBrowserCheck({
        ...${JSON.stringify(options)},
        verifyPage: async ({ page }) => {
          await page.getByText("42", { exact: true }).waitFor();
          return { rendered: true };
        },
      });
    `], { cwd: process.cwd(), env: environment, encoding: "utf8" });
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    if (keep) {
      expect(child.status, child.stderr).toBe(0);
      expect(receipt).toMatchObject({ passed: true, browsers: {
        chromium: { rendered: true }, firefox: { rendered: true }, webkit: { rendered: true },
      } });
    } else {
      expect(child.status).toBe(1);
      expect(receipt).toMatchObject({ passed: false, typecheck: false });
      expect(receipt.error).toContain("TS2322");
    }
    expect(receipt.retainedConsumer).toEqual(expect.any(String));
    expect(existsSync(resolve(receipt.retainedConsumer, "typecheck.log"))).toBe(true);
  } finally {
    if (existsSync(receiptPath)) {
      const { retainedConsumer } = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (typeof retainedConsumer === "string" &&
          dirname(retainedConsumer) === realpathSync.native(tmpdir()) &&
          basename(retainedConsumer).startsWith(prefix)) {
        rmSync(retainedConsumer, { recursive: true, force: true });
      }
      rmSync(receiptPath, { force: true });
    }
  }
}, 180_000);
