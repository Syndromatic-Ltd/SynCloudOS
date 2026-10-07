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

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GFXPDFRenderSource } from "../../../src/FX/GraphicsFX/pdf/pdfTypes";

const controls = vi.hoisted(() => ({ constructorThrows: false, teardownThrows: false, rawThrows: false, hangingDestroy: false, rawTerminates: 0, workerDestroys: 0, loadingDestroys: 0, renderCancels: 0 }));

vi.mock("pdfjs-dist", () => ({
    PDFWorker: class {
        constructor() {
            if (controls.constructorThrows)
                throw new Error("worker bridge failed");
        }
        destroy() {
            controls.workerDestroys++;
            if (controls.teardownThrows)
                throw new Error("worker destroy failed");
        }
    },
    getDocument: () => ({
        promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
                userUnit: 1,
                getViewport: () => ({ width: 1, height: 1 }),
                render: () => ({
                    promise: Promise.resolve(),
                    cancel: () => {
                        controls.renderCancels++;
                        if (controls.teardownThrows)
                            throw new Error("render cancel failed");
                    },
                }),
            }),
        }),
        destroy: () => {
            controls.loadingDestroys++;
            return controls.hangingDestroy ? new Promise<void>(() => undefined) : Promise.resolve();
        },
    }),
}));

class WorkerFixture {
    terminate() {
        controls.rawTerminates++;
        if (controls.rawThrows)
            throw new Error("raw terminate failed");
    }
}

class CanvasFixture {
    constructor(readonly width: number, readonly height: number) {}
    getContext() {
        return { getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) }) };
    }
}

const source: GFXPDFRenderSource = Object.freeze({ bytes: new Uint8Array(8), pageIndex: 0, box: "crop", viewBox: { x: 0, y: 0, width: 1, height: 1 }, rotation: 0, scale: 1, width: 1, height: 1, maximumPixels: 1 });

describe("browser PDF renderer teardown", () => {
    beforeEach(() => {
        Object.assign(controls, { constructorThrows: false, teardownThrows: false, rawThrows: false, hangingDestroy: false, rawTerminates: 0, workerDestroys: 0, loadingDestroys: 0, renderCancels: 0 });
        vi.stubGlobal("Worker", WorkerFixture);
        vi.stubGlobal("OffscreenCanvas", CanvasFixture);
    });

    it("terminates the raw worker if PDFWorker construction throws", async () => {
        controls.constructorThrows = true;
        controls.rawThrows = true;
        const { renderPDFPageInBrowser } = await import("../../../src/FX/GraphicsFX/pdf/browserPDFRenderer");
        await expect(renderPDFPageInBrowser(source, new AbortController().signal)).rejects.toThrow("worker bridge failed");
        expect(controls.rawTerminates).toBe(1);
    });

    it("attempts every teardown and does not await a hanging loading destroy", async () => {
        controls.teardownThrows = true;
        controls.hangingDestroy = true;
        const { renderPDFPageInBrowser } = await import("../../../src/FX/GraphicsFX/pdf/browserPDFRenderer");
        await expect(Promise.race([renderPDFPageInBrowser(source, new AbortController().signal), new Promise((_, reject) => setTimeout(() => reject(new Error("teardown timeout")), 25))])).resolves.toMatchObject({ width: 1, height: 1 });
        expect(controls).toMatchObject({ rawTerminates: 1, workerDestroys: 1, loadingDestroys: 1, renderCancels: 1 });
    });
});
