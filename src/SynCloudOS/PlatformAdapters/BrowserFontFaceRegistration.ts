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

import type { TFXFontFaceRegistrationRequest } from "../../FX/TextFX/textLayoutTypes";
import type { BrowserTextLayoutPlatform } from "./browserTextLayoutAdapterTypes";

type BrowserFontFace = {
  load(): Promise<BrowserFontFace>;
};

type BrowserFontFaceSet = {
  add(face: BrowserFontFace): unknown;
  delete(face: BrowserFontFace): boolean;
  load(font: string, text?: string): Promise<readonly BrowserFontFace[]>;
};

type BrowserFontFaceConstructor = new (
  family: string,
  source: ArrayBuffer,
  descriptors?: Readonly<Record<string, string>>,
) => BrowserFontFace;

function waitForFontReadiness<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: (value: T | unknown) => void, value: T | unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => finish(reject, signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve as (value: T | unknown) => void, value),
      (error: unknown) => finish(reject, error),
    );
  });
}

export function createBrowserFontFaceRegistrationPort(
  fontSet: BrowserFontFaceSet,
  FontFaceConstructor: BrowserFontFaceConstructor,
): Pick<BrowserTextLayoutPlatform, "registerFontFace"> {
  return Object.freeze({
    async registerFontFace(request: TFXFontFaceRegistrationRequest) {
      request.signal.throwIfAborted();
      const variationSettings = Object.entries(request.descriptor.variations)
        .map(([tag, value]) => `"${tag}" ${value}`)
        .join(", ");
      const face = new FontFaceConstructor(request.familyName, request.bytes.slice().buffer, variationSettings ? { variationSettings } : undefined);
      let added = false;
      try {
        await waitForFontReadiness(face.load(), request.signal);
        request.signal.throwIfAborted();
        added = true;
        fontSet.add(face);
        request.signal.throwIfAborted();
        await waitForFontReadiness(fontSet.load(`${request.descriptor.size}px "${request.familyName}"`), request.signal);
        request.signal.throwIfAborted();
      } catch (error) {
        if (added) fontSet.delete(face);
        throw error;
      }
      let released = false;
      return Object.freeze({
        familyName: request.familyName,
        release() {
          if (released) return;
          released = true;
          fontSet.delete(face);
        },
      });
    },
  });
}
