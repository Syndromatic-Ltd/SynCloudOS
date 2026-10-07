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

import type { GFXImage } from "../GraphicsFX/GFXImage";
export interface IFXPeakBytes {
    readonly output: number;
    readonly scratch: number;
    readonly cache: number;
}
export interface IFXRenderInfo {
    readonly width: number;
    readonly height: number;
    readonly sampleEvaluations: number;
    readonly cacheHits: number;
    readonly backend: "cpu" | "worker-cpu" | "accelerated";
    readonly tileCount: number;
    readonly logicalOutputBytes: number;
    readonly peakBytes: IFXPeakBytes;
    readonly work: number;
    readonly globalPreparationCount: number;
    readonly tileCacheHits: number;
    readonly tileCacheEvictions: number;
}
export interface IFXRenderResult {
    readonly image: GFXImage;
    readonly info: IFXRenderInfo;
}
/** Output becomes observable only after the final cancellation and destination checks. */
export class IFXRenderTask {
    readonly #controller = new AbortController();
    readonly #result: Promise<IFXRenderResult>;
    #status: "running" | "completed" | "failed" | "cancelled" = "running";
    constructor(run: (signal: AbortSignal) => Promise<IFXRenderResult>) {
        this.#result = Promise.resolve().then(() => run(this.#controller.signal)).then(result => {
            this.#controller.signal.throwIfAborted();
            this.#status = "completed";
            return result;
        }, error => {
            this.#status = this.#controller.signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "failed";
            throw error;
        });
        this.#result.catch(() => undefined);
        Object.freeze(this);
    }
    get status() {
        return this.#status;
    }
    cancel(): void {
        if (this.#status === "running")
            this.#controller.abort(new DOMException("Render task cancelled.", "AbortError"));
    }
    waitUntilCompleted(): Promise<IFXRenderResult> {
        return this.#result;
    }
}
