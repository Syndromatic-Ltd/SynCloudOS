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

import type { TFXRunDelegate } from "../../FX/TextFX/TFXRunDelegate";
import type { TFXRunDelegateRequest } from "../../FX/TextFX/textLayoutTypes";
import type { NSEAttributedAttachmentRun } from "../Text/attributedContent";

export type NSEProjectedAttachmentSource = TFXRunDelegateRequest["source"];

export interface NSEAttachmentProjectionAuthority {
  /**
   * Converts a transient editor source (blob, remote URL or file) into the
   * mounted resource identity owned by the host. NSE never opens URLs or blob
   * registries itself.
   */
  acquireSource?(run: NSEAttributedAttachmentRun, signal?: AbortSignal): Promise<NSEProjectedAttachmentSource>;
  resolveRunDelegate(request: TFXRunDelegateRequest, signal?: AbortSignal): Promise<TFXRunDelegate>;
}

export interface NSEProjectedAttachment {
  readonly ownerId: string;
  readonly source: NSEProjectedAttachmentSource;
  readonly delegate: TFXRunDelegate;
}

export function isNSEProjectedAttachmentSource(source: NSEAttributedAttachmentRun["source"]): source is NSEProjectedAttachmentSource {
  return source.kind === "document-resource"
    && typeof source.documentId === "string"
    && typeof source.resourceId === "string"
    && typeof source.leaseId === "string"
    && Number.isSafeInteger(source.generation)
    && typeof source.mimeType === "string"
    && Number.isSafeInteger(source.byteLength);
}

function staleProjection(): DOMException {
  return new DOMException("Attachment projection was superseded by newer content.", "AbortError");
}

/**
 * The asynchronous NSE boundary between transferable attachment metadata and
 * TextFX's immutable TFXRunDelegate. A monotonically increasing owner revision
 * prevents a late decode from replacing newer editor content with the same id.
 */
export class NSEAttachmentProjection {
  readonly #authority: NSEAttachmentProjectionAuthority;
  readonly #revisions = new Map<string, number>();

  constructor(authority: NSEAttachmentProjectionAuthority) {
    if (!authority || typeof authority.resolveRunDelegate !== "function") throw new TypeError("Attachment projection requires scoped resolution authority.");
    this.#authority = authority;
  }

  invalidate(ownerId: string): void {
    this.#revisions.set(ownerId, (this.#revisions.get(ownerId) ?? 0) + 1);
  }

  async project(run: NSEAttributedAttachmentRun, signal?: AbortSignal): Promise<NSEProjectedAttachment> {
    signal?.throwIfAborted();
    const revision = (this.#revisions.get(run.id) ?? 0) + 1;
    this.#revisions.set(run.id, revision);
    const current = () => {
      signal?.throwIfAborted();
      if (this.#revisions.get(run.id) !== revision) throw staleProjection();
    };
    const source = isNSEProjectedAttachmentSource(run.source)
      ? run.source
      : await this.#acquire(run, signal);
    current();
    const delegate = await this.#authority.resolveRunDelegate(Object.freeze({
      attachmentKind: "image",
      source,
      accessibilityLabel: run.alt,
      ...(run.intrinsicSize ? { intrinsicSize: run.intrinsicSize } : {}),
    }), signal);
    current();
    if (delegate.attachment.accessibilityLabel !== run.alt) throw new TypeError("Attachment projection must preserve the attributed accessibility label.");
    return Object.freeze({ ownerId: run.id, source, delegate });
  }

  async #acquire(run: NSEAttributedAttachmentRun, signal?: AbortSignal): Promise<NSEProjectedAttachmentSource> {
    if (!this.#authority.acquireSource) {
      throw new DOMException("Transient attachment projection requires mounted document/image acquisition authority.", "NotSupportedError");
    }
    const source = await this.#authority.acquireSource(run, signal);
    signal?.throwIfAborted();
    if (!isNSEProjectedAttachmentSource(source)) throw new TypeError("Attachment acquisition must return a leased document resource.");
    return source;
  }
}
