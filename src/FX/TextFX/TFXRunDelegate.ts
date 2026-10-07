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

import { GFXImage } from "../GraphicsFX/GFXImage";

export interface TFXRunDelegateAttachment {
  readonly image: GFXImage;
  readonly accessibilityLabel: string;
}

export interface TFXRunDelegateOptions {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly attachment: TFXRunDelegateAttachment;
}

const MAX_METRIC = 32_768;
const MAX_TFX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function metric(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_METRIC) {
    throw new RangeError(`Attachment ${name} must be finite from 0 through ${MAX_METRIC}.`);
  }
  return value;
}

/**
 * Portable immutable adaptation of Core Text run-delegate metrics.
 *
 * Core Text invokes owner callbacks for these values and retains an opaque
 * refCon. TextFX snapshots the values and already-owned image instead: layout
 * never invokes application code and retains no resource lease or host handle.
 */
export class TFXRunDelegate {
  readonly width: number;
  readonly ascent: number;
  readonly descent: number;
  readonly attachment: TFXRunDelegateAttachment;

  constructor(options: TFXRunDelegateOptions) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Run-delegate options are required.");
    this.width = metric(options.width, "width");
    this.ascent = metric(options.ascent, "ascent");
    this.descent = metric(options.descent, "descent");
    const attachment = options.attachment;
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment) || !(attachment.image instanceof GFXImage)) {
      throw new TypeError("A run delegate requires an owned GFXImage attachment.");
    }
    if (typeof attachment.accessibilityLabel !== "string" || !attachment.accessibilityLabel.trim() || attachment.accessibilityLabel.length > 4096) {
      throw new TypeError("An attachment accessibility label is required and must not exceed 4096 UTF-16 units.");
    }
    const imageBytes = attachment.image.bytesPerRow * attachment.image.height;
    if (!Number.isSafeInteger(imageBytes) || imageBytes > MAX_TFX_ATTACHMENT_BYTES) {
      throw new RangeError("A TextFX attachment image must not exceed 8 MiB of owned pixels.");
    }
    this.attachment = Object.freeze({ image: attachment.image, accessibilityLabel: attachment.accessibilityLabel });
    Object.freeze(this);
  }
}
