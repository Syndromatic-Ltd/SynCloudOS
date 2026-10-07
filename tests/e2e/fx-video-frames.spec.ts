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

import { expect, test } from "playwright/test";

test("native VideoFrame clone, close and transfer semantics are observable when available", async ({ page, browserName }, testInfo) => {
  await page.goto("/tests/e2e/fixtures/fx-video-frames-browser.html");
  const result = await page.evaluate(async () => {
    if (typeof VideoFrame === "undefined") return { supported: false as const };

    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas context unavailable");
    context.fillStyle = "rgb(32, 96, 160)";
    context.fillRect(0, 0, 2, 2);

    const original = new VideoFrame(canvas, { timestamp: 1_000 });
    const clone = original.clone();
    original.close();

    let originalClosed = false;
    try { original.clone(); } catch (error) { originalClosed = error instanceof DOMException && error.name === "InvalidStateError"; }
    const cloneStillLive = clone.clone();
    cloneStillLive.close();

    let transferSupported = true;
    let senderInvalidated = false;
    let receiverLive = false;
    let receiver: VideoFrame | undefined;
    try {
      receiver = structuredClone(clone, { transfer: [clone] });
      try { clone.clone(); } catch (error) { senderInvalidated = error instanceof DOMException && error.name === "InvalidStateError"; }
      const receiverClone = receiver.clone();
      receiverClone.close();
      receiverLive = true;
    } catch (error) {
      transferSupported = false;
      clone.close();
    } finally {
      receiver?.close();
    }

    return {
      supported: true as const,
      originalClosed,
      cloneSurvivesOriginalClose: true,
      transferSupported,
      senderInvalidated,
      receiverLive,
    };
  });

  await testInfo.attach("video-frame-capability", {
    body: Buffer.from(JSON.stringify({ browser: testInfo.project.name, ...result }, null, 2)),
    contentType: "application/json",
  });

  if (!result.supported) {
    expect(browserName).toBe("webkit");
    testInfo.annotations.push({ type: "capability", description: "VideoFrame unavailable in Playwright WebKit" });
    return;
  }
  expect(result.originalClosed).toBe(true);
  expect(result.cloneSurvivesOriginalClose).toBe(true);
  expect(result.transferSupported).toBe(true);
  expect(result.senderInvalidated).toBe(true);
  expect(result.receiverLive).toBe(true);
});
