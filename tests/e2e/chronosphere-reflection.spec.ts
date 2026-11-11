import { expect, test } from "playwright/test";
import type { ReflectionFixture } from "../fixtures/chronosphere-reflection-browser";

declare global { interface Window { __reflectionFixture?: ReflectionFixture; } }

for (const ratio of [1, 2]) test.describe(`Chronosphere reflection DPR ${ratio}`, () => {
  test.use({ deviceScaleFactor: ratio, viewport: { width: 900, height: 1000 } });

  test("crops the captured page foot at its measured density, including resize and a short page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Keep the existing Vite HTML/React preamble without starting the unrelated shell fixture.
    await page.route("**/tests/e2e/framework-host.tsx", route => route.fulfill({ contentType: "text/javascript", body: "" }));
    await page.goto("/tests/e2e/framework-host.html");
    await page.evaluate(async () => {
      const fixture = await import("/tests/fixtures/chronosphere-reflection-browser.tsx");
      window.__reflectionFixture = fixture.mountReflectionFixture();
    });
    const read = () => page.evaluate(() => window.__reflectionFixture!.read());
    const expectTall = (result: Awaited<ReturnType<typeof read>>, width: number) => {
      expect(result.backend).toBe("webgl2");
      expect(result.failure).toBeNull();
      expect([result.width, result.height, result.ratio]).toEqual([width * ratio, 54 * ratio, ratio]);
      expect(result.error).toBe(0);
      // Ten source CSS pixels remain ten reflected CSS pixels; no full-page squeeze.
      for (const [y, channel] of [[5, 0], [15, 1], [25, 2]] as const) {
        const pixel = result.column[y]!;
        expect(pixel[channel]).toBeGreaterThan(15);
        for (let other = 0; other < 3; other++) if (other !== channel)
          expect(pixel[channel]).toBeGreaterThan(pixel[other] * 3);
      }
      expect(result.column[5]![3]).toBeGreaterThan(100);
      expect(result.column[5]![3]).toBeGreaterThan(result.column[15]![3]);
      expect(result.column[15]![3]).toBeGreaterThan(result.column[25]![3]);
      expect(result.column[25]![3]).toBeGreaterThan(result.column[45]![3]);
      const magenta = result.column.filter(([r, g, b, a]) => a > 0 && r > 2 * g && b > 2 * g && r > 0 && b > 0);
      expect(magenta).toHaveLength(0); // The page's top marker must never be flattened into the shelf.
      expect(result.outside[3]).toBe(0);
      expect(result.resources).toBe(0);
      expect(result.leases).toBe(0);
    };
    try {
      await expect.poll(async () => (await read()).status).toBe("ready");
      const first = await read();
      expectTall(first, 400);
      expect(first.captures).toHaveLength(1);
      expect(first.captures[0]!.bytes).toBeGreaterThan(100);
      expect(first.captures[0]!.height).toBeGreaterThan(first.captures[0]!.width * 3);

      await page.evaluate(() => window.__reflectionFixture!.resize(600));
      await expect.poll(async () => (await read()).width).toBe(600 * ratio);
      const resized = await read();
      expectTall(resized, 600);
      expect(resized.captures).toEqual(first.captures);

      await page.evaluate(() => window.__reflectionFixture!.show(24));
      await expect.poll(async () => {
        const result = await read();
        return result.status === "ready" && result.captures.length === 2 && result.column[5]![3] > 100;
      }).toBe(true);
      const short = await read();
      expect(short.failure).toBeNull();
      expect(short.error).toBe(0);
      expect(short.column[5]![0]).toBeGreaterThan(short.column[5]![1] * 3);
      expect(short.column[15]![1]).toBeGreaterThan(short.column[15]![0] * 3);
      expect(short.column[5]![3]).toBeGreaterThan(short.column[15]![3]);
      expect(short.column.slice(24).every(pixel => pixel[3] === 0)).toBe(true);
      expect(short.captures[1]).toMatchObject({ width: 200, height: 24 });
      expect(short.resources).toBe(0);
      expect(short.leases).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      const cleanup = await page.evaluate(() => {
        const result = window.__reflectionFixture?.dispose();
        delete window.__reflectionFixture;
        return result;
      });
      expect(cleanup).toEqual({ disposed: true, frames: 0, resources: 0, leases: 0 });
    }
  });
});
