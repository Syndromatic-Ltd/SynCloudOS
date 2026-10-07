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

import { type RangeValue, type TFXLogicalTextInput, type TFXTextFragment, type TFXTextLayoutResult, type TFXTextLayoutService } from "../../SynCloudOS/SynCloudOS";
import { attributedContent, attributedContentLayoutText, parseAttributedContent, textRun, type NSEAttributedContent } from "../Text/attributedContent";
import { TFXLayoutCache } from "../../FX/TextFX/TFXLayoutCache";
import { normaliseTFXTextLayoutRecord, snapshotTFXTextContainers, type TFXTextContainer } from "../../FX/TextFX/TFXTextContainer";

export type NSETextLayoutInvalidation =
  | { readonly kind: "graphemes"; readonly range: RangeValue }
  | { readonly kind: "layout"; readonly fromCharacter: number };

type NSETextLayoutService = Pick<TFXTextLayoutService, "layout" | "segment"> &
  Partial<Pick<TFXTextLayoutService, "subscribeFontReadiness" | "fontReadinessGeneration">> & {
    subscribeAttachmentReadiness?(listener: (change: { readonly state?: "ready" | "released" }) => void): () => void;
  };

function normaliseInvalidationRange(value: unknown): RangeValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError("Invalidation range must be a plain data-only object.");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError("Invalidation range must not contain symbols.");
  for (const key of Object.keys(descriptors)) {
    if (key !== "location" && key !== "length") throw new TypeError(`Invalidation range contains unsupported property ${key}.`);
    if (!("value" in descriptors[key]!)) throw new TypeError("Invalidation range must not contain accessors.");
  }
  const location = descriptors.location?.value;
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(location) || location < 0 || !Number.isSafeInteger(length) || length < 0 || location + length > 1_000_000) throw new RangeError("Invalidation range must be finite and bounded.");
  return Object.freeze({ location, length });
}

function sameContainers(left: readonly TFXTextContainer[], right: readonly TFXTextContainer[]): boolean {
  return left.length === right.length && left.every((container, index) => container === right[index]);
}

function paragraphDependencyStart(text: string, location: number, fragmentStart: number): number {
  const paragraphStart = location === 0
    ? 0
    : Math.max(text.lastIndexOf("\n", location - 1), text.lastIndexOf("\r", location - 1), text.lastIndexOf("\u2029", location - 1)) + 1;
  const nextBreaks = [
    text.indexOf("\n", location),
    text.indexOf("\r", location),
    text.indexOf("\u2029", location),
  ].filter((index) => index >= 0);
  const paragraphEnd = nextBreaks.length ? Math.min(...nextBreaks) : text.length;
  const paragraph = text.slice(paragraphStart, paragraphEnd);
  const requiresParagraphContext = /[\u0590-\u08ff\u200c\u200d\u202a-\u202e\u2066-\u2069]/u.test(paragraph);
  return requiresParagraphContext ? paragraphStart : fragmentStart;
}

/**
 * `replaceCharacters` is a text-level API.  It may preserve rich content only
 * when the edit has an unambiguous owner: one text run in one paragraph.  A
 * caller making a structural edit must provide its newly canonical attributed
 * document to `layout(input, containers)` instead of allowing an old style tree
 * to be attached to new text.
 */
function replaceInCanonicalTextRun(
  value: unknown,
  ownedText: string,
  range: RangeValue,
  replacement: string,
): NSEAttributedContent {
  if (replacement.includes("\r") || replacement.includes("\n")) {
    throw new TypeError("A structured attributed replacement must be supplied for paragraph edits.");
  }
  const content = parseAttributedContent(value);
  if (attributedContentLayoutText(content) !== ownedText) {
    throw new TypeError("Owned attributed content does not describe the current layout text.");
  }
  const end = range.location + range.length;
  let offset = 0;
  let match: { readonly blockIndex: number; readonly runIndex: number; readonly start: number; readonly end: number } | null = null;
  for (let blockIndex = 0; blockIndex < content.blocks.length && !match; blockIndex += 1) {
    const block = content.blocks[blockIndex]!;
    for (let runIndex = 0; runIndex < block.runs.length; runIndex += 1) {
      const run = block.runs[runIndex]!;
      const runLength = run.kind === "text" ? run.text.length : 1;
      const runEnd = offset + runLength;
      if (run.kind === "text" && range.location >= offset && end <= runEnd) {
        match = Object.freeze({ blockIndex, runIndex, start: offset, end: runEnd });
        break;
      }
      offset = runEnd;
    }
    if (blockIndex + 1 < content.blocks.length) offset += 1;
  }
  if (!match) {
    throw new TypeError("A structured attributed replacement may not cross run, attachment, or paragraph boundaries.");
  }
  const run = content.blocks[match.blockIndex]!.runs[match.runIndex]!;
  if (run.kind !== "text") throw new TypeError("Attributed replacement did not resolve to text.");
  const replacementStart = range.location - match.start;
  const replacementEnd = end - match.start;
  const nextRun = textRun(`${run.text.slice(0, replacementStart)}${replacement}${run.text.slice(replacementEnd)}`, run.attributes);
  return attributedContent(content.blocks.map((block, blockIndex) => blockIndex === match!.blockIndex
    ? { ...block, runs: block.runs.map((candidate, runIndex) => runIndex === match!.runIndex ? nextRun : candidate) }
    : block));
}

export class NSELayoutManager {
  readonly #service: NSETextLayoutService;
  readonly #unsubscribeFontReadiness: () => void;
  readonly #unsubscribeAttachmentReadiness: () => void;
  #invalidatedRange: RangeValue | null = null;
  #layoutFrom: number | null = null;
  #dirtyFrom: number | null = null;
  #ownedInput: TFXLogicalTextInput | null = null;
  #ownedAttributedContent: unknown = null;
  #ownedText = "";
  #ownedContainers: readonly TFXTextContainer[] = Object.freeze([]);
  #fragments: readonly TFXTextFragment[] = Object.freeze([]);
  #result: TFXTextLayoutResult | null = null;
  readonly #layoutCache = new TFXLayoutCache();
  #contentRevision = 0;
  #attributedRevision = 0;
  #generation = 0;
  #layoutController: AbortController | null = null;
  #disposed = false;

  constructor(options: { readonly service: NSETextLayoutService }) {
    const data = normaliseTFXTextLayoutRecord(options, "Layout-manager options", ["service"]);
    if (!data.service || typeof data.service !== "object") throw new TypeError("Layout-manager service is required.");
    this.#service = data.service as NSETextLayoutService;
    this.#unsubscribeFontReadiness = this.#service.subscribeFontReadiness?.(() => this.#invalidateForReadiness("Text font readiness changed.")) ?? (() => {});
    this.#unsubscribeAttachmentReadiness = this.#service.subscribeAttachmentReadiness?.((change) => {
      // A ready result is already awaited by the layout that requested it.
      // Release is the transition that invalidates previously published geometry.
      if (change.state === "released") this.#invalidateForReadiness("Text attachment resource changed.");
    }) ?? (() => {});
  }

  get invalidations(): readonly NSETextLayoutInvalidation[] {
    if (!this.#invalidatedRange || this.#layoutFrom === null) return Object.freeze([]);
    return Object.freeze([
      Object.freeze({ kind: "graphemes" as const, range: this.#invalidatedRange }),
      Object.freeze({ kind: "layout" as const, fromCharacter: this.#layoutFrom }),
    ]);
  }

  get fragments(): readonly TFXTextFragment[] {
    return this.#fragments;
  }

  get text(): string {
    return this.#ownedText;
  }

  get attributedContent(): unknown {
    return this.#ownedAttributedContent;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#unsubscribeFontReadiness();
    this.#unsubscribeAttachmentReadiness();
    this.#layoutController?.abort(new DOMException("Text layout manager disposed.", "AbortError"));
    this.#layoutController = null;
    this.#layoutCache.dispose();
  }

  #invalidateForReadiness(reason: string): void {
    if (!this.#ownedInput) return;
    this.#contentRevision += 1;
    this.#generation += 1;
    this.#layoutController?.abort(new DOMException(reason, "AbortError"));
    this.#invalidatedRange = Object.freeze({ location: 0, length: this.#ownedText.length });
    this.#layoutFrom = 0;
    this.#dirtyFrom = 0;
  }

  layout(): Promise<TFXTextLayoutResult>;
  layout(input: TFXLogicalTextInput, containers: readonly TFXTextContainer[]): Promise<TFXTextLayoutResult>;
  layout(input?: TFXLogicalTextInput, containers?: readonly TFXTextContainer[]): Promise<TFXTextLayoutResult> {
    if (this.#disposed) return Promise.reject(new DOMException("Text layout manager disposed.", "AbortError"));
    if (input !== undefined || containers !== undefined) {
      if (input === undefined || containers === undefined) throw new TypeError("Layout requires both content and containers.");
      const snapshot = snapshotTFXTextContainers(containers);
      const attributedContent = input.attributedContent;
      const sameOwned = this.#ownedInput !== null
        && input.text === this.#ownedText
        && (attributedContent ?? null) === this.#ownedAttributedContent
        && input.font === this.#ownedInput.font
        && input.locale === this.#ownedInput.locale
        && input.direction === this.#ownedInput.direction
        && sameContainers(this.#ownedContainers, containers);
      const previousAttributedContent = this.#ownedAttributedContent;
      this.#ownedInput = input;
      this.#ownedText = input.text;
      this.#ownedAttributedContent = attributedContent ?? null;
      this.#ownedContainers = Object.freeze([...containers]);
      if (!sameOwned) {
        this.#contentRevision += 1;
        if (attributedContent !== previousAttributedContent) this.#attributedRevision += 1;
        this.#layoutFrom = 0;
        this.#dirtyFrom = 0;
      }
      void snapshot;
    } else if (!this.#ownedInput) {
      throw new TypeError("Layout manager has no owned content.");
    }
    this.#layoutController?.abort(new DOMException("A newer text layout superseded this layout.", "AbortError"));
    const generation = ++this.#generation;
    const controller = new AbortController();
    this.#layoutController = controller;
    const signal = this.#ownedInput?.signal ? AbortSignal.any([controller.signal, this.#ownedInput.signal]) : controller.signal;
    return this.#layoutOwned(generation, signal).finally(() => {
      if (this.#layoutController === controller) this.#layoutController = null;
    });
  }

  replaceCharacters(range: RangeValue, replacement: string): void {
    const canonical = normaliseInvalidationRange(range);
    if (typeof replacement !== "string") throw new TypeError("Replacement must be text.");
    if (new TextEncoder().encode(replacement).byteLength > 1_048_576) throw new RangeError("Replacement exceeds the text-layout byte limit.");
    if (this.#ownedInput) {
      if (canonical.location + canonical.length > this.#ownedText.length) throw new RangeError("Replacement range exceeds owned content.");
      const attributedContent = this.#ownedInput.attributedContent === undefined
        ? undefined
        : replaceInCanonicalTextRun(this.#ownedInput.attributedContent, this.#ownedInput.text, canonical, replacement);
      const nextText = `${this.#ownedText.slice(0, canonical.location)}${replacement}${this.#ownedText.slice(canonical.location + canonical.length)}`;
      this.#ownedText = nextText;
      this.#ownedAttributedContent = attributedContent ?? null;
      this.#ownedInput = Object.freeze({ ...this.#ownedInput, text: this.#ownedText, ...(attributedContent === undefined ? {} : { attributedContent }) });
    }
    this.#generation += 1;
    this.#contentRevision += 1;
    if (this.#ownedInput?.attributedContent !== undefined) this.#attributedRevision += 1;
    this.#layoutController?.abort(new DOMException("Text layout content changed.", "AbortError"));
    const current = this.#invalidatedRange;
    const start = current ? Math.min(current.location, canonical.location) : canonical.location;
    const end = current ? Math.max(current.location + current.length, canonical.location + canonical.length) : canonical.location + canonical.length;
    this.#invalidatedRange = Object.freeze({ location: start, length: end - start });
    this.#layoutFrom = this.#layoutFrom === null ? canonical.location : Math.min(this.#layoutFrom, canonical.location);
    const lineStart = paragraphDependencyStart(this.#ownedText, canonical.location, this.#fragmentStart(canonical.location));
    this.#dirtyFrom = this.#dirtyFrom === null ? lineStart : Math.min(this.#dirtyFrom, lineStart);
  }

  #fragmentStart(location: number): number {
    for (const fragment of this.#fragments) {
      const end = fragment.range.location + fragment.range.length;
      if (location >= fragment.range.location && location < end) return fragment.range.location;
    }
    return location;
  }

  #continuationFor(fromCharacter: number): {
    readonly base: TFXTextFragment;
    readonly continuation: { readonly containerIndex: number; readonly lineIndex: number; readonly blockOffset: number; readonly textOffset: number };
  } | null {
    const base = this.#fragments.find((fragment) => fragment.range.location === fromCharacter && fragment.range.length > 0);
    if (!base) return null;
    const container = this.#ownedContainers[base.containerIndex];
    if (!container) return null;
    const lineIndex = this.#fragments.filter((fragment) => fragment !== base && fragment.containerIndex === base.containerIndex &&
      fragment.range.location + fragment.range.length <= fromCharacter).length;
    let blockOffset: number;
    if (container.writingMode === "horizontal-tb") {
      blockOffset = base.rect.y - container.insets.blockStart;
    } else if (container.writingMode === "vertical-rl") {
      blockOffset = container.size.width - container.insets.blockStart - base.rect.x - base.rect.width;
    } else {
      blockOffset = base.rect.x - container.insets.blockStart;
    }
    if (!Number.isFinite(blockOffset) || blockOffset < 0) return null;
    return Object.freeze({
      base,
      continuation: Object.freeze({ containerIndex: base.containerIndex, lineIndex, blockOffset, textOffset: fromCharacter }),
    });
  }

  async #layoutOwned(generation: number, signal: AbortSignal): Promise<TFXTextLayoutResult> {
    const input = this.#ownedInput!;
    const containers = this.#ownedContainers;
    const fromCharacter = this.#dirtyFrom ?? this.#layoutFrom ?? 0;
    const cacheKey = {
      revision: this.#contentRevision,
      attributedRevision: this.#attributedRevision,
      fontGeneration: this.#service.fontReadinessGeneration ?? 0,
      text: this.#ownedText,
      font: input.font,
      locale: input.locale,
      direction: input.direction,
      containers,
    };
    if (fromCharacter === 0) {
      const cached = this.#layoutCache.lookup(cacheKey);
      if (cached) {
        this.#fragments = cached.fragments;
        this.#result = cached;
        this.#invalidatedRange = null;
        this.#layoutFrom = null;
        this.#dirtyFrom = null;
        return cached;
      }
    }
    const context = fromCharacter > 0 ? this.#continuationFor(fromCharacter) : null;
    if (context) {
      const kept = this.#fragments.filter((fragment) => fragment.range.location + fragment.range.length <= fromCharacter);
      const suffix = this.#ownedText.slice(fromCharacter);
      const suffixResult = await this.#service.layout({
        ...input,
        text: suffix,
        continuation: context.continuation,
        signal,
      }, snapshotTFXTextContainers(containers));
      if (generation !== this.#generation || signal.aborted) throw new DOMException("Text layout result became stale.", "AbortError");
      const prefixGraphemes = graphemeCount(this.#service, this.#ownedInput?.locale ?? input.locale, this.#ownedText.slice(0, fromCharacter), signal);
      const remapped = suffixResult.fragments.map((fragment) => Object.freeze({
        ...fragment,
        range: Object.freeze({ location: fragment.range.location + fromCharacter, length: fragment.range.length }),
        graphemeRange: Object.freeze({ location: fragment.graphemeRange.location + prefixGraphemes, length: fragment.graphemeRange.length }),
      }));
      const fragments = Object.freeze([...kept, ...remapped]);
      const result = Object.freeze({
        fragments,
        laidOutRange: Object.freeze({ location: 0, length: Math.max(fromCharacter, fromCharacter + suffixResult.laidOutRange.length) }),
        truncated: suffixResult.truncated,
        ...(suffixResult.geometry ? { geometry: suffixResult.geometry } : {}),
      });
      this.#fragments = fragments;
      this.#result = result;
      this.#invalidatedRange = null;
      this.#layoutFrom = null;
      this.#dirtyFrom = null;
      this.#layoutCache.store(cacheKey, result);
      return result;
    }
    const result = await this.#service.layout({ ...input, text: this.#ownedText, signal }, snapshotTFXTextContainers(containers));
    if (generation !== this.#generation || signal.aborted) throw new DOMException("Text layout result became stale.", "AbortError");
    this.#fragments = result.fragments;
    this.#result = result;
    this.#invalidatedRange = null;
    this.#layoutFrom = null;
    this.#dirtyFrom = null;
    this.#layoutCache.store(cacheKey, result);
    return result;
  }
}

function graphemeCount(service: Pick<TFXTextLayoutService, "segment">, locale: string, value: string, signal: AbortSignal): number {
  return service.segment({ text: value, granularity: "grapheme", locale, signal }).length;
}
