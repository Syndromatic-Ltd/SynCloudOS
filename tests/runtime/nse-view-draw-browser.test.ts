import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decoratorEsbuildOptions } from "../../scripts/synware/decorators.mjs";

let script: string;
let styles: string;
let browser: Awaited<ReturnType<typeof chromium.launch>>;

beforeAll(async () => {
  const bundle = await build({
    ...decoratorEsbuildOptions,
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { NSEView } from "./src/NSE/Views/NSEView";
      import { NSEAppearance } from "./src/NSE/Appearance/NSEAppearance";
      import { NSEViewDrawingEnvironmentContext } from "./src/NSE/Views/NSEViewDrawingEnvironment";
      import { createOwnedGFXIdentifierIssuer } from "./src/FX/GraphicsFX/identifierAuthority";
      import { GFXColour } from "./src/FX/GraphicsFX/GFXColour";
      import { GFXPath } from "./src/FX/GraphicsFX/GFXPath";
      import "./src/NSE/Views/nse-view.css";
      let sequence = 0;
      const environment = {
        createGraphicsIdentifierIssuer: () => createOwnedGFXIdentifierIssuer(() => () => "browserFigure" + ++sequence),
        geometry: {
          measure: element => ({ width: element.clientWidth, height: element.clientHeight }),
          observe: (element, listener) => { const observer = new ResizeObserver(listener); observer.observe(element); return () => observer.disconnect(); }
        }
      };
      window.drawnBounds = [];
      function Figures() {
        const [updated, setUpdated] = useState(false);
        return <NSEViewDrawingEnvironmentContext.Provider value={environment}>
          <button id="redraw" onClick={() => setUpdated(value => !value)}>Redraw</button>
          {['aqua', 'darkAqua'].map((name, index) => <NSEView key={name} id={name} className="figure" appearance={new NSEAppearance(name)}
            aria-label={name + ' figure'} style={{ top: 60 + index * 180 }} draw={(rect, context) => {
              window.drawnBounds.push({ name, ...rect });
              context.setFill(GFXColour.parse(updated ? '#008844' : '#0055aa')); context.fill(GFXPath.rect(rect));
            }}><span className="foreground">Subview</span></NSEView>)}
        </NSEViewDrawingEnvironmentContext.Provider>;
      }
      createRoot(document.getElementById('root')).render(<Figures />);
    ` },
    bundle: true, format: "iife", platform: "browser", jsx: "automatic", target: "es2022", write: false, outfile: "figure.js",
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
  });
  script = bundle.outputFiles!.find(file => file.path.endsWith(".js"))!.text;
  styles = bundle.outputFiles!.find(file => file.path.endsWith(".css"))!.text;
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => { await browser?.close(); });

describe("NSEView.draw browser composition", () => {
  it.each([1, 2])("keeps subviews above drawing, class positioning, resizing and accessible images at DPR %s", async (dpr) => {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: dpr });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.setContent(`<style>${styles}
        .figure { position:absolute; left:30px; width:300px; height:140px; background:white; }
        .foreground { display:inline-block; width:70px; height:40px; background:#cc2222; color:white; }
      </style><div id="root"></div>`);
      await page.addScriptTag({ content: script });
      for (const name of ["aqua", "darkAqua"]) {
        const figure = page.locator(`#${name}`);
        await page.getByRole("img", { name: `${name} figure`, exact: true }).waitFor();
        expect(await figure.evaluate(element => getComputedStyle(element).position)).toBe("absolute");
        expect(await figure.locator("svg").getAttribute("viewBox")).toBe("0 0 300 140");
        const png = await figure.screenshot();
        const pixels = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixel = (x: number, y: number) => [...pixels.data.subarray((y * pixels.info.width + x) * 3, (y * pixels.info.width + x) * 3 + 3)];
        // The span is in normal flow. Its opaque red background must paint above the blue drawing.
        expect(pixel(5 * dpr, 30 * dpr)).toEqual([204, 34, 34]);
        expect(pixel(200 * dpr, 80 * dpr)).toEqual([0, 85, 170]);
      }
      await page.locator("#aqua").evaluate(element => { element.style.width = "420px"; });
      await page.waitForFunction(() => document.querySelector("#aqua svg")?.getAttribute("viewBox") === "0 0 420 140");
      await page.getByRole("button", { name: "Redraw" }).click();
      await page.waitForFunction(() => document.querySelector("#aqua path")?.getAttribute("fill") === "rgb(0 136 68)");
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }, 30_000);
});
