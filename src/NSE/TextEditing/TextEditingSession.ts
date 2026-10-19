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
  attributedContent, paragraph, textRun, nseGraphemeDeletionRange, inheritedNSETextAttributes, isNSEUTF16Boundary,
  normaliseNSEParagraphAttributes, normaliseNSETextAttributes,
  type NSEAttributedTextAttributes, type NSEParagraphAttributes, type NSETextChangeReceipt,
  type NSETextEditOperation, type NSETextRange, type NSETextSnapshot,
} from "../Text";
import { nseListLevelOperations, nseParagraphSpansInRange } from "./textStructureCommands";
import type { NSETextEditingSessionOptions, NSETextSelectionTarget, NSETextSessionSnapshot, NSETextSessionSettlement } from "./textSessionTypes";
import { declareSynCloudOSLifecycleSignal, SynCloudOSLifecycleRecord, synCloudOSLifecycleSignalReason } from "../../SynCloudOS/nseRuntimeContracts";

/** Per-view transient editing state. The supplied owner is the only content authority. */
export class TextEditingSession {
  readonly #options: NSETextEditingSessionOptions;
  readonly #listeners = new Set<() => void>();
  readonly #changes = new Map<number, NSETextChangeReceipt>();
  readonly #lifetime = new AbortController();
  readonly #lifecycle: SynCloudOSLifecycleRecord;
  readonly #ownerAbort = (event: Event): void => {
    const reason = synCloudOSLifecycleSignalReason(event.target as AbortSignal);
    this.#lifecycle.markDisposed(reason);
    declareSynCloudOSLifecycleSignal(this.#lifetime.signal, reason);
    this.dispose();
  };
  #observerErrors: readonly unknown[] = Object.freeze([]);
  #snapshot: NSETextSessionSnapshot;
  #unsubscribe: () => void;
  #committingMarked = false;
  /** The open typing run: contiguous insertions, or contiguous deletions, undo as one "Typing". */
  #typingRun: { readonly key: string; readonly kind: "insert" | "delete"; readonly end: number } | null = null;
  #typingRuns = 0;

  constructor(options: NSETextEditingSessionOptions) {
    if (!options.id.trim()) throw new TypeError("A text session requires a stable identity.");
    this.#options = options;
    this.#lifecycle = new SynCloudOSLifecycleRecord({ kind: "TextEditingSession", id: options.id });
    const model = options.owner.getSnapshot();
    const selection = Object.freeze({ sessionId: options.id, ...(options.documentId ? { documentId: options.documentId } : {}), flowId: model.flowId, ownerGeneration: model.ownerGeneration, modelRevision: model.revision, selectionGeneration: 0, range: Object.freeze({ location: 0, length: 0 }), anchor: 0, focus: 0, affinity: "downstream" as const });
    this.#snapshot = Object.freeze({ model, selection, typingAttributes: this.#typingAt(model, 0), marked: null, editable: options.editable ?? true, disposed: false });
    this.#unsubscribe = options.owner.subscribe((receipt) => this.#accept(receipt));
    options.signal?.addEventListener("abort", this.#ownerAbort, { once: true });
    options.owner.signal?.addEventListener("abort", this.#ownerAbort, { once: true });
    const aborted = options.signal?.aborted ? options.signal : options.owner.signal?.aborted ? options.owner.signal : undefined;
    if (aborted) {
      const reason = synCloudOSLifecycleSignalReason(aborted);
      this.#lifecycle.markDisposed(reason); declareSynCloudOSLifecycleSignal(this.#lifetime.signal, reason); this.dispose();
    }
  }

  getSnapshot = (): NSETextSessionSnapshot => this.#snapshot;
  get signal(): AbortSignal { return this.#lifetime.signal; }
  get observerErrors(): readonly unknown[] { return this.#observerErrors; }
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  captureTarget(): NSETextSelectionTarget { return this.#snapshot.selection; }

  resolveTarget(target: NSETextSelectionTarget): NSETextSelectionTarget | null {
    const current = this.#snapshot.selection;
    if (this.#snapshot.disposed || target.sessionId !== current.sessionId || target.documentId !== current.documentId || target.flowId !== current.flowId || target.ownerGeneration !== current.ownerGeneration || target.selectionGeneration !== current.selectionGeneration) return null;
    let result = target;
    while (result.modelRevision < this.#snapshot.model.revision) {
      const change = this.#changes.get(result.modelRevision);
      if (!change) return null;
      const range = change.changeMap.mapRange(result.range, result.modelRevision, "after", "before");
      if (!range || (result.range.length > 0 && change.before.text.slice(result.range.location, result.range.location + result.range.length) !== change.snapshot.text.slice(range.location, range.location + range.length))) return null;
      const forward = result.anchor <= result.focus;
      result = Object.freeze({ ...result, modelRevision: change.snapshot.revision, range, anchor: forward ? range.location : range.location + range.length, focus: forward ? range.location + range.length : range.location });
    }
    return result.modelRevision === this.#snapshot.model.revision ? result : null;
  }

  select(anchor: number, focus = anchor, affinity: "upstream" | "downstream" = "downstream"): void {
    this.#assertLive("select");
    if (![anchor, focus].every((value) => isNSEUTF16Boundary(this.#snapshot.model.text, value))) throw new RangeError("Selection is outside the text owner or splits a surrogate pair.");
    const previous = this.#snapshot.selection;
    if (anchor === previous.anchor && focus === previous.focus && affinity === previous.affinity) return;
    this.#publish({ selection: Object.freeze({ ...previous, anchor, focus, affinity, range: Object.freeze({ location: Math.min(anchor, focus), length: Math.abs(anchor - focus) }), selectionGeneration: previous.selectionGeneration + 1 }), ...(anchor === focus ? { typingAttributes: this.#typingAt(this.#snapshot.model, anchor) } : {}) });
  }

  /** Attributes typed at an offset: the preceding run's, without custom keys that do not extend there. */
  typingAttributesAt(offset: number): NSEAttributedTextAttributes { return this.#typingAt(this.#snapshot.model, offset); }

  /** Enter. An empty list item leaves its innermost list; otherwise the paragraph splits and the new one
   *  takes `nextParagraphAttributes`, or a copy without keys that do not carry across a split. */
  splitParagraph(range: NSETextRange = this.#snapshot.selection.range): NSETextChangeReceipt {
    this.#assertEditable("splitParagraph");
    const model = this.#snapshot.model;
    const span = nseParagraphSpansInRange(model, { location: range.location, length: 0 })[0];
    if (!span) throw new RangeError("Split position is outside the text owner.");
    const attributes = span.attributes;
    if (!range.length && span.range.length === 0 && attributes.textLists?.length) {
      return this.commit(nseListLevelOperations(model, span.range, -1), undefined, { actionName: "Typing" });
    }
    const typing = this.#snapshot.typingAttributes;
    const following = this.#followingParagraph(attributes);
    const content = attributedContent([paragraph([], attributes), paragraph([], following.paragraph)]);
    const receipt = this.commit([{ kind: "replace", range, content }], undefined, { actionName: "Typing" });
    this.select(range.location + 1);
    // Cocoa keeps the typing attributes across a new, empty paragraph.
    const nextSpan = this.#snapshot.model.paragraphSpans.find(candidate => candidate.range.location === range.location + 1);
    if (following.typing) this.setTypingAttributes(following.typing);
    else if (nextSpan && nextSpan.range.length === 0) this.setTypingAttributes(this.#withoutStaleCustom(typing, null));
    return receipt;
  }

  /** Tab / Shift-Tab in a list: indent or outdent the items in the range. */
  changeListLevel(delta: 1 | -1, range: NSETextRange = this.#snapshot.selection.range): NSETextChangeReceipt | null {
    this.#assertEditable("changeListLevel");
    const operations = nseListLevelOperations(this.#snapshot.model, range, delta);
    return operations.length ? this.commit(operations, undefined, { actionName: "Paragraph Formatting" }) : null;
  }

  setEditable(editable: boolean): void { this.#assertLive("setEditable"); this.#publish({ editable }); }
  setTypingAttributes(attributes: NSEAttributedTextAttributes): void {
    this.#assertEditable("setTypingAttributes");
    const validated = textRun("", attributes).attributes ?? Object.freeze({});
    this.#publish({ typingAttributes: validated });
  }
  commit(operations: readonly NSETextEditOperation[], target?: NSETextSelectionTarget, metadata?: { readonly actionName?: string; readonly coalescingKey?: string }): NSETextChangeReceipt {
    this.#assertEditable("commit");
    if (this.#snapshot.marked && !this.#committingMarked) throw new Error("Finish or cancel composition before changing canonical text.");
    if (target && !this.resolveTarget(target)) throw new Error("Text target is stale or revoked.");
    const actionName = operations.some(operation => operation.kind === "replace") ? "Typing" : operations.some(operation => operation.kind === "paragraph-attributes") ? "Paragraph Formatting" : "Formatting";
    // Commits that name their own action are deliberate edits and end any typing run.
    if (metadata) this.#typingRun = null;
    const coalescingKey = metadata?.coalescingKey ?? (metadata ? undefined : this.#continueTypingRun(operations));
    return this.#options.owner.commit({ expectedRevision: this.#snapshot.model.revision, expectedGeneration: this.#snapshot.model.ownerGeneration, operations, actionName: metadata?.actionName ?? actionName, ...(coalescingKey ? { coalescingKey } : {}) });
  }
  async requestHistory(direction: "undo" | "redo"): Promise<unknown> {
    this.#assertEditable("requestHistory");
    if (this.#snapshot.marked) throw new Error("Finish or cancel composition before undo or redo.");
    if (!this.#options.history) throw new Error("Text history is unavailable for this owner.");
    this.#typingRun = null;
    return this.#options.history[direction]();
  }
  insertText(text: string, range = this.#snapshot.selection.range): NSETextChangeReceipt {
    this.#assertLive("insertText");
    const attributes = this.#snapshot.typingAttributes;
    const content = attributedContent(text.split("\n").map((line) => paragraph([textRun(line, attributes)])));
    const receipt = this.commit([{ kind: "replace", range, content }]);
    this.select(range.location + text.length);
    return receipt;
  }
  delete(direction: "backward" | "forward"): NSETextChangeReceipt | null {
    const selected = this.#snapshot.selection.range;
    const range = selected.length ? selected : nseGraphemeDeletionRange(this.#snapshot.model.text, selected.location, direction);
    if (!range.length) return null;
    this.#assertLive("delete");
    return this.insertText("", range);
  }
  applyAttributes(attributes: NSEAttributedTextAttributes, target = this.captureTarget()): NSETextChangeReceipt | null {
    const resolved = this.resolveTarget(target);
    if (!resolved) throw new Error("Text target is stale or revoked.");
    if (!resolved.range.length) { this.setTypingAttributes({ ...this.#snapshot.typingAttributes, ...attributes }); return null; }
    return this.commit([{ kind: "apply-attributes", range: resolved.range, attributes }], target);
  }
  removeAttributes(keys: readonly (keyof NSEAttributedTextAttributes)[], target = this.captureTarget()): NSETextChangeReceipt | null {
    const resolved = this.resolveTarget(target);
    if (!resolved) throw new Error("Text target is stale or revoked.");
    if (!resolved.range.length) {
      const next = { ...this.#snapshot.typingAttributes }; for (const key of keys) delete next[key]; this.setTypingAttributes(next); return null;
    }
    return this.commit([{ kind: "remove-attributes", range: resolved.range, keys }], target);
  }
  setMarkedText(text: string, range?: NSETextRange): void {
    this.#assertEditable("setMarkedText");
    const previous = this.#snapshot.marked;
    const replacement = range ?? previous?.range ?? this.#snapshot.selection.range;
    if (!Number.isSafeInteger(replacement.location) || !Number.isSafeInteger(replacement.length) || replacement.location < 0 || replacement.length < 0 || replacement.location + replacement.length > this.#snapshot.model.text.length) throw new RangeError("Marked range is outside the owner.");
    this.#publish({ marked: Object.freeze({ text, range: Object.freeze({ ...replacement }), baseRevision: previous?.baseRevision ?? this.#snapshot.model.revision, conflict: previous?.conflict ?? false }) });
  }
  unmarkText(): NSETextChangeReceipt | null {
    this.#assertLive("unmarkText");
    const marked = this.#snapshot.marked;
    if (!marked) return null;
    if (marked.conflict || marked.baseRevision !== this.#snapshot.model.revision) throw new Error("Composition conflicts with newer canonical text; preserve or cancel the marked draft.");
    this.#committingMarked = true;
    try { const receipt = this.insertText(marked.text, marked.range); this.#publish({ marked: null }); return receipt; }
    finally { this.#committingMarked = false; }
  }
  cancelMarkedText(): void { this.#assertLive("cancelMarkedText"); this.#publish({ marked: null }); }
  settleEditing(): NSETextSessionSettlement {
    if (this.#snapshot.disposed) return Object.freeze({ status: "revoked" });
    if (this.#snapshot.marked) return Object.freeze({ status: "refused", issues: Object.freeze([{ code: "text-composition-active", message: "Finish or cancel the current text composition." }]) });
    return Object.freeze({ status: "settled", revision: this.#snapshot.model.revision });
  }
  dispose = (): void => {
    if (this.#snapshot.disposed) return;
    this.#lifecycle.markDisposed("explicit");
    this.#unsubscribe(); this.#options.signal?.removeEventListener("abort", this.#ownerAbort); this.#options.owner.signal?.removeEventListener("abort", this.#ownerAbort); this.#changes.clear();
    this.#publish({ disposed: true, editable: false }); this.#lifetime.abort(); this.#listeners.clear();
  };

  #accept(receipt: NSETextChangeReceipt): void {
    if (this.#snapshot.disposed) return;
    this.#changes.set(receipt.before.revision, receipt);
    if (this.#changes.size > 256) this.#changes.delete(this.#changes.keys().next().value!);
    const previous = this.#snapshot.selection;
    const mapped = receipt.changeMap.mapRange(previous.range, previous.modelRevision, "after", "before");
    const range = mapped ?? Object.freeze({ location: Math.min(previous.range.location, receipt.snapshot.text.length), length: 0 });
    const forward = previous.anchor <= previous.focus;
    let marked = this.#snapshot.marked;
    if (marked && !this.#committingMarked) {
      const mappedMarked = receipt.changeMap.mapRange(marked.range, marked.baseRevision, "after", "before");
      const overlaps = receipt.changeMap.steps.some((step) => step.kind === "replace" && step.range.location <= marked!.range.location + marked!.range.length && step.range.location + step.range.length >= marked!.range.location);
      const unchanged = !overlaps && mappedMarked && receipt.before.text.slice(marked.range.location, marked.range.location + marked.range.length) === receipt.snapshot.text.slice(mappedMarked.location, mappedMarked.location + mappedMarked.length);
      marked = Object.freeze({ ...marked, ...(unchanged ? { range: mappedMarked, baseRevision: receipt.snapshot.revision } : { conflict: true }) });
    }
    this.#publish({ model: receipt.snapshot, selection: Object.freeze({ ...previous, flowId: receipt.snapshot.flowId, ownerGeneration: receipt.snapshot.ownerGeneration, modelRevision: receipt.snapshot.revision, range, anchor: forward ? range.location : range.location + range.length, focus: forward ? range.location + range.length : range.location }), marked });
  }
  /** TextEdit's typing undo: characters typed (or deleted) in one place undo together; moving the
   *  caret, a paragraph break, a paste or any formatting starts a new run. */
  #continueTypingRun(operations: readonly NSETextEditOperation[]): string | undefined {
    const [operation] = operations;
    const run = this.#typingRun;
    this.#typingRun = null;
    if (operations.length !== 1 || operation?.kind !== "replace") return undefined;
    const blocks = operation.content.blocks;
    const inserted = blocks.length === 1 && blocks[0]!.runs.every((item) => item.kind === "text") ? blocks[0]!.runs.reduce((length, item) => length + (item.kind === "text" ? item.text.length : 0), 0) : -1;
    const { location, length } = operation.range;
    let next: { kind: "insert" | "delete"; continues: boolean; end: number } | null = null;
    if (length === 0 && inserted > 0) next = { kind: "insert", continues: run?.kind === "insert" && run.end === location, end: location + inserted };
    else if (length > 0 && inserted === 0) next = { kind: "delete", continues: run?.kind === "delete" && (run.end === location + length || run.end === location), end: location };
    if (!next) return undefined;
    const key = next.continues && run ? run.key : `${this.#options.id}:typing-${++this.#typingRuns}`;
    this.#typingRun = { key, kind: next.kind, end: next.end };
    return key;
  }
  #followingParagraph(previous: NSEParagraphAttributes): { readonly paragraph: NSEParagraphAttributes; readonly typing?: NSEAttributedTextAttributes } {
    const hook = this.#options.nextParagraphAttributes;
    if (hook) {
      const result = hook(previous);
      if (result && typeof result === "object" && "paragraph" in result) return { paragraph: normaliseNSEParagraphAttributes(result.paragraph), typing: normaliseNSETextAttributes(result.typingAttributes ?? {}) };
      return { paragraph: normaliseNSEParagraphAttributes(result) };
    }
    const policies = this.#options.customAttributePolicies ?? {};
    const custom = Object.fromEntries(Object.entries(previous.custom ?? {}).filter(([key]) => policies[key]?.carriesAcrossParagraphSplit !== false));
    const { custom: _custom, ...rest } = previous;
    return { paragraph: normaliseNSEParagraphAttributes({ ...rest, ...(Object.keys(custom).length ? { custom } : {}) }) };
  }
  #typingAt(model: NSETextSnapshot, offset: number): NSEAttributedTextAttributes {
    const base = inheritedNSETextAttributes(model, offset);
    if (!base.custom) return base;
    const at = (index: number) => model.characterSpans.find(span => !span.attachment && index >= span.range.location && index < span.range.location + span.range.length);
    return this.#withoutStaleCustom(base, { before: at(offset - 1)?.attributes, after: at(offset)?.attributes });
  }
  /** Drops custom keys whose policy says they do not extend beyond the run they mark. */
  #withoutStaleCustom(attributes: NSEAttributedTextAttributes, neighbours: { before?: NSEAttributedTextAttributes; after?: NSEAttributedTextAttributes } | null): NSEAttributedTextAttributes {
    if (!attributes.custom) return attributes;
    const policies = this.#options.customAttributePolicies ?? {};
    const custom = Object.fromEntries(Object.entries(attributes.custom).filter(([key, value]) => policies[key]?.extendsWhenTyping !== false || (neighbours !== null && neighbours.before?.custom?.[key] === value && neighbours.after?.custom?.[key] === value)));
    const { custom: _custom, ...rest } = attributes;
    return normaliseNSETextAttributes(Object.keys(custom).length ? { ...rest, custom } : rest);
  }
  #publish(patch: Partial<NSETextSessionSnapshot>): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...patch });
    const errors: unknown[] = [];
    for (const listener of [...this.#listeners]) { if (this.#listeners.has(listener)) { try { listener(); } catch (error) { errors.push(error); } } }
    this.#observerErrors = Object.freeze(errors);
  }
  #assertLive(operation: string): void { if (this.#snapshot.disposed || this.#options.signal?.aborted) throw this.#lifecycle.error({ code: "NSE_TEXT_EDITING_SESSION_DISPOSED", operation }); }
  #assertEditable(operation: string): void { this.#assertLive(operation); if (!this.#snapshot.editable) throw new Error("Text session is read-only."); }
}
