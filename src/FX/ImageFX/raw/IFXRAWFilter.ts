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

import {
  IFXPortableDNGRAWBackend,
  type IFXRAWBackend,
  type IFXRAWBackendCapabilities,
  type IFXRAWDevelopmentOptions,
  type IFXRAWDevelopmentResult,
} from "./IFXRAWBackend";
import type { IFXRAWMetadata } from "./IFXRAWMetadata";

export interface IFXRAWSourceDescriptor {
  readonly format: "dng";
  readonly byteLength: number;
  readonly sensorIFDOffset: number;
  readonly embeddedPreviewCount: number;
}

export class IFXRAWFilter {
  readonly metadata: IFXRAWMetadata;
  readonly source: IFXRAWSourceDescriptor;
  readonly capabilities: IFXRAWBackendCapabilities;
  readonly #encoded: Uint8Array;
  readonly #backend: IFXRAWBackend;

  constructor(encoded: Uint8Array, backend: IFXRAWBackend = new IFXPortableDNGRAWBackend()) {
    if (!(encoded instanceof Uint8Array)) throw new TypeError("IFXRAWFilter requires owned encoded RAW bytes.");
    this.#encoded = encoded.slice();
    this.#backend = backend;
    this.metadata = backend.inspect(this.#encoded);
    this.capabilities = backend.capabilities;
    this.source = Object.freeze({
      format: "dng",
      byteLength: this.#encoded.byteLength,
      sensorIFDOffset: this.metadata.sensorIFDOffset,
      embeddedPreviewCount: this.metadata.embeddedPreviewCount,
    });
    Object.freeze(this);
  }

  develop(options: IFXRAWDevelopmentOptions = {}): Promise<IFXRAWDevelopmentResult> {
    return this.#backend.develop(this.#encoded, options);
  }
}
