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

import type { GFXImage } from "../GFXImage";

export class GFXPDFRenderTask {
    readonly #controller = new AbortController();
    readonly #result: Promise<GFXImage>;
    #status: "running" | "completed" | "failed" | "cancelled" = "running";
    constructor(run: (signal: AbortSignal) => Promise<GFXImage>) {
        const signal = this.#controller.signal;
        let rejectAbort!: (reason: unknown) => void;
        const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
        const onAbort = () => rejectAbort(signal.reason ?? new DOMException("PDF render task cancelled.", "AbortError"));
        signal.addEventListener("abort", onAbort, { once: true });
        const work = Promise.resolve().then(() => {
            signal.throwIfAborted();
            return run(signal);
        });
        work.catch(() => undefined);
        this.#result = Promise.race([work, aborted]).then(image => {
            signal.throwIfAborted();
            this.#status = "completed";
            return image;
        }, error => {
            this.#status = signal.aborted || (error instanceof Error && error.name === "AbortError") ? "cancelled" : "failed";
            throw error;
        }).finally(() => {
            signal.removeEventListener("abort", onAbort);
        });
        this.#result.catch(() => undefined);
        Object.freeze(this);
    }
    get status(): "running" | "completed" | "failed" | "cancelled" {
        return this.#status;
    }
    cancel(): void {
        if (this.#status === "running") {
            this.#status = "cancelled";
            this.#controller.abort(new DOMException("PDF render task cancelled.", "AbortError"));
        }
    }
    waitUntilCompleted(): Promise<GFXImage> {
        return this.#result;
    }
}
