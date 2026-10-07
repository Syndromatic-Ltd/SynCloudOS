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

import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorView, type EditorProps } from "@tiptap/pm/view";
import { DOMSerializer, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { nseTextListPlugin } from "./domTextLists";
import { nseAttachmentUpdateOperations, nseParagraphSpansInRange } from "../textStructureCommands";
import type { NSEAttributedAttachmentRun, NSEAttributedTextAttributes } from "../../Text";
import type { NSETextAttachmentResolver, NSETextFileDropHandler, NSETextFontResolver, NSETextResolvedFont } from "../textViewTypes";
import { nseAttachmentNodeViews, type NSEAttachmentCellEditing } from "./attachmentCell";
import { keymap } from "@tiptap/pm/keymap";
import { baseKeymap } from "@tiptap/pm/commands";
import type { TextEditingSession } from "../TextEditingSession";
import { createBackendPositionMap } from "./backendPositionMap";
import { translateBackendContent } from "./backendChangeTranslator";
import { backendDocumentFromContent, contentFromBackendDocument, domTextSchema } from "./domTextSchema";
import type { NSETextSnapshot } from "../../Text";
import type { NSETextSelectionTarget } from "../textSessionTypes";
import { sameNSETextGeometryRevision, type NSETextGeometryProvider, type NSETextGeometryRevision, type NSETextGeometryPosition, type NSETextGeometryRange, type NSETextGeometryPoint } from "../../TextLayout/textGeometryTypes";

export interface DOMTextBackendOptions {
  readonly session: TextEditingSession;
  readonly label: string;
  readonly spellCheck?: boolean;
  readonly attachmentResolver?: NSETextAttachmentResolver;
  readonly fontResolver?: NSETextFontResolver;
  readonly onDropFiles?: NSETextFileDropHandler;
  readonly onError?: (error: unknown) => void;
}

const cssFamilyList = /^[A-Za-z0-9 "',._-]{1,256}$/;
/** Character runs drawn through the host's font catalogue, so a face (Prelude Bold) keeps its weight. */
function attributeMarkViews(doc: Document, resolver: () => NSETextFontResolver | undefined): NonNullable<EditorProps["markViews"]> {
  return {
    attributes(mark) {
      const { dom, contentDOM } = DOMSerializer.renderSpec(doc, domTextSchema.marks.attributes.spec.toDOM!(mark, true));
      const attributes = mark.attrs.value as NSEAttributedTextAttributes;
      const font = attributes.font;
      let resolved: NSETextResolvedFont | null = null;
      try { resolved = font ? resolver()?.(font) ?? null : null; } catch { resolved = null; }
      const span = (contentDOM ?? dom) as HTMLElement;
      if (resolved && cssFamilyList.test(resolved.family)) {
        span.style.fontFamily = resolved.family;
        if (resolved.weight !== undefined && !attributes.bold) span.style.fontWeight = String(resolved.weight);
        if (resolved.style && !attributes.italic) span.style.fontStyle = resolved.style;
      }
      return { dom, ...(contentDOM ? { contentDOM } : {}) };
    },
  };
}

/** Private fixed-grammar adapter. No backend history or canonical model lives here. */
export function mountDOMTextBackend(host: HTMLElement, options: DOMTextBackendOptions) {
  const session = options.session;
  let label = options.label, spellCheck = options.spellCheck, attachmentResolver = options.attachmentResolver, fontResolver = options.fontResolver;
  let fileDropHandler = options.onDropFiles;
  let disposed = false, reconciling = false, accepting = false, composing = false;
  let finalization: ReturnType<typeof setTimeout> | undefined;
  let composition: { base: NSETextSnapshot; target: NSETextSelectionTarget; replacement: NSETextSelectionTarget | null } | null = null;
  let layoutGeneration = 0;
  const revision = (): NSETextGeometryRevision => ({ modelRevision: session.getSnapshot().model.revision, ownerGeneration: session.getSnapshot().model.ownerGeneration, layoutGeneration, fontGeneration: 0, resourceGeneration: 0, containerGeneration: 0 });
  const current = () => !disposed && !session.getSnapshot().disposed && !composing && createBackendPositionMap(view.state.doc).text === session.getSnapshot().model.text;
  const validQuery = (query: { flowId: string; revision: NSETextGeometryRevision }) => current() && query.flowId === session.getSnapshot().model.flowId && sameNSETextGeometryRevision(query.revision, revision());
  const fail = (error: unknown) => { options.onError?.(error); };
  const reconcile = () => {
    if (disposed || accepting || composing || session.getSnapshot().marked) return;
    reconciling = true;
    try {
      const snapshot = session.getSnapshot();
      const document = backendDocumentFromContent(snapshot.model.attributedContent);
      let transaction = view.state.tr;
      if (!view.state.doc.eq(document)) transaction = transaction.replaceWith(0, view.state.doc.content.size, document.content);
      const map = createBackendPositionMap(transaction.doc);
      const anchor = map.toBackend(snapshot.selection.anchor), head = map.toBackend(snapshot.selection.focus);
      // A selection of exactly one attachment selects the attachment itself, so it shows its handles.
      const start = Math.min(anchor, head), atom = Math.abs(head - anchor) === 1 ? transaction.doc.nodeAt(start) : null;
      transaction = transaction.setSelection(atom?.type === domTextSchema.nodes.attachment ? NodeSelection.create(transaction.doc, start) : TextSelection.create(transaction.doc, anchor, head));
      transaction = transaction.setStoredMarks(Object.keys(snapshot.typingAttributes).length ? [domTextSchema.mark("attributes", { value: snapshot.typingAttributes })] : []);
      view.updateState(view.state.apply(transaction));
      view.setProps({ editable: () => session.getSnapshot().editable && !session.getSnapshot().disposed, attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, "aria-readonly": String(!snapshot.editable), spellcheck: String(spellCheck ?? true) } });
      layoutGeneration++;
    } finally { reconciling = false; }
  };
  const finishComposition = () => {
    if (disposed || !composition) return;
    const draft = composition;
    composition = null;
    composing = false;
    try {
      if (!draft.replacement) session.cancelMarkedText();
      else {
        if (!session.resolveTarget(draft.replacement)) throw new Error("Composition target was revoked; preserve or cancel the marked draft.");
        session.unmarkText();
      }
      reconcile();
    } catch (error) { fail(error); }
  };
  const startComposition = () => {
    if (composition) return;
    if (finalization) clearTimeout(finalization);
    const snapshot = session.getSnapshot();
    composition = { base: snapshot.model, target: session.captureTarget(), replacement: null };
    composing = true;
    session.setMarkedText("", snapshot.selection.range);
  };
  // Paragraph structure goes through the session, so Enter honours its split policies
  // and list keys edit NSTextList membership rather than backend nodes.
  // The browser reports caret moves (End, Ctrl+End, clicks) with an asynchronous selectionchange;
  // a key pressed straight after one can arrive first. Structural keys act where the caret is now.
  const syncSelectionFromDOM = () => {
    const selection = host.ownerDocument.getSelection();
    if (!selection?.anchorNode || !selection.focusNode || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return;
    const map = createBackendPositionMap(view.state.doc);
    const anchor = map.toSemantic(view.posAtDOM(selection.anchorNode, selection.anchorOffset));
    const focus = map.toSemantic(view.posAtDOM(selection.focusNode, selection.focusOffset));
    const current = session.getSnapshot().selection;
    if (current.anchor !== anchor || current.focus !== focus) session.select(anchor, focus);
  };
  const structural = (action: () => unknown): boolean => {
    const state = session.getSnapshot();
    if (disposed || composing || view.composing || state.marked || !state.editable) return false;
    try { syncSelectionFromDOM(); action(); } catch (error) { fail(error); }
    return true;
  };
  const currentParagraph = () => {
    const state = session.getSnapshot();
    return nseParagraphSpansInRange(state.model, { location: state.selection.range.location, length: 0 })[0];
  };
  const inList = () => {
    try { syncSelectionFromDOM(); } catch { return false; }
    const state = session.getSnapshot();
    return nseParagraphSpansInRange(state.model, state.selection.range).some(span => span.attributes.textLists?.length);
  };
  const structureKeys = {
    Enter: () => structural(() => session.splitParagraph()),
    Tab: () => inList() && structural(() => session.changeListLevel(1)),
    "Shift-Tab": () => inList() && structural(() => session.changeListLevel(-1)),
    Backspace: () => {
      try { syncSelectionFromDOM(); } catch (error) { fail(error); return true; }
      const state = session.getSnapshot(), span = currentParagraph();
      if (state.selection.range.length || !span?.attributes.textLists?.length || span.range.location !== state.selection.range.location) return false;
      return structural(() => session.changeListLevel(-1, span.range));
    },
  };
  const attachmentEditing: NSEAttachmentCellEditing = {
    editable: () => !disposed && session.getSnapshot().editable && !session.getSnapshot().disposed,
    resize(position, bounds, actionName) {
      if (!attachmentEditing.editable() || composing || session.getSnapshot().marked) return;
      try {
        const location = createBackendPositionMap(view.state.doc).toSemantic(position);
        session.commit(nseAttachmentUpdateOperations(session.getSnapshot().model, { location, length: 1 }, { bounds }), undefined, { actionName });
        // The resized image stays selected, handles and all.
        session.select(location, location + 1);
      }
      catch (error) { fail(error); }
    },
    beginMove: (position, event, grab) => beginMove(position, event, grab),
  };
  // Moving an attachment: each pointer step re-anchors it where the pointer is in the text and
  // aligns it to the side of the column the pointer is over, so the text re-wraps around it live,
  // as Pages' Move with Text does. The steps commit under one coalescing key: one Undo puts it back.
  let commitMetadata: { readonly actionName: string; readonly coalescingKey: string } | null = null;
  let moves = 0;
  let moving: { pointerId: number; id: string; startX: number; startY: number; grab: { x: number; y: number }; started: boolean; frame: number | null; x: number; y: number; key: string } | null = null;
  const attachmentPosition = (id: string): number | null => {
    let found: number | null = null;
    view.state.doc.descendants((node, position) => {
      if (found !== null) return false;
      if (node.type === domTextSchema.nodes.attachment && (node.attrs.value as NSEAttributedAttachmentRun).id === id) { found = position; return false; }
      return true;
    });
    return found;
  };
  const moveStep = () => {
    if (!moving) return;
    moving.frame = null;
    const from = attachmentPosition(moving.id);
    if (from === null) return;
    const node = view.state.doc.nodeAt(from)!;
    const run = node.attrs.value as NSEAttributedAttachmentRun;
    // The image's top-left follows the pointer as it was grabbed; the line under that corner anchors it.
    const target = view.posAtCoords({ left: moving.x - moving.grab.x + 2, top: moving.y - moving.grab.y + 2 }) ?? view.posAtCoords({ left: moving.x, top: moving.y });
    if (!target) return;
    const column = view.dom.getBoundingClientRect();
    const rightToLeft = host.ownerDocument.defaultView?.getComputedStyle(view.dom).direction === "rtl";
    const across = Math.min(1, Math.max(0, (moving.x - column.left) / Math.max(1, column.width)));
    const fraction = rightToLeft ? 1 - across : across;
    const wrap = run.placement?.wrap ?? "inline";
    const alignment = wrap === "around" ? (fraction < 0.5 ? "start" as const : "end" as const)
      : wrap === "above-and-below" ? (fraction < 1 / 3 ? "start" as const : fraction > 2 / 3 ? "end" as const : "centre" as const) : undefined;
    const sameSpot = target.pos === from || target.pos === from + 1;
    if (sameSpot && (alignment === undefined || alignment === run.placement?.alignment)) return;
    const value = alignment === undefined ? run : Object.freeze({ ...run, placement: Object.freeze({ ...run.placement!, alignment }) });
    const transaction = view.state.tr.delete(from, from + 1);
    const position = sameSpot ? from : transaction.mapping.map(target.pos);
    if (!transaction.doc.resolve(position).parent.inlineContent) return;
    transaction.insert(position, domTextSchema.nodes.attachment.create({ value }));
    transaction.setSelection(NodeSelection.create(transaction.doc, position));
    commitMetadata = { actionName: "Move Image", coalescingKey: moving.key };
    try { view.dispatch(transaction); } finally { commitMetadata = null; }
  };
  const onMovePointer = (event: PointerEvent) => {
    if (!moving || event.pointerId !== moving.pointerId) return;
    event.preventDefault();
    moving.x = event.clientX; moving.y = event.clientY;
    if (!moving.started) {
      if (Math.hypot(event.clientX - moving.startX, event.clientY - moving.startY) < 4) return;
      moving.started = true;
      view.dom.dataset.attachmentMoving = "true";
    }
    moving.frame ??= requestAnimationFrame(moveStep);
  };
  const endMove = (event: PointerEvent) => {
    if (!moving || event.pointerId !== moving.pointerId) return;
    const finished = moving; moving = null;
    host.ownerDocument.removeEventListener("pointermove", onMovePointer, true);
    host.ownerDocument.removeEventListener("pointerup", endMove, true);
    host.ownerDocument.removeEventListener("pointercancel", endMove, true);
    if (finished.frame !== null) cancelAnimationFrame(finished.frame);
    if (finished.started && event.type === "pointerup") { moving = finished; moveStep(); moving = null; }
    delete view.dom.dataset.attachmentMoving;
  };
  const beginMove = (position: number, event: PointerEvent, grab: { readonly x: number; readonly y: number }) => {
    if (!attachmentEditing.editable() || composing || moving) return;
    const node = view.state.doc.nodeAt(position);
    if (node?.type !== domTextSchema.nodes.attachment) return;
    try {
      const location = createBackendPositionMap(view.state.doc).toSemantic(position);
      session.select(location, location + 1);
      // The press was the image's, not the text's: give the text the keyboard so Undo and Delete reach it.
      view.focus();
    } catch (error) { fail(error); return; }
    moving = { pointerId: event.pointerId, id: (node.attrs.value as NSEAttributedAttachmentRun).id, startX: event.clientX, startY: event.clientY,
      grab: { ...grab }, started: false, frame: null, x: event.clientX, y: event.clientY, key: `nse-attachment-move:${++moves}` };
    host.ownerDocument.addEventListener("pointermove", onMovePointer, true);
    host.ownerDocument.addEventListener("pointerup", endMove, true);
    host.ownerDocument.addEventListener("pointercancel", endMove, true);
  };

  // Files dropped or pasted into the text go to the owner, which decides what
  // to insert (NSTextView's registered drag types, answered by its delegate).
  const offerFiles = (files: FileList | null | undefined, location: () => number | null, event: Event): boolean => {
    if (!files?.length || !fileDropHandler || !attachmentEditing.editable() || composing) return false;
    const offset = location();
    if (offset === null) return false;
    let accepted = false;
    try { accepted = fileDropHandler([...files], offset) !== false; } catch (error) { fail(error); return true; }
    if (accepted) event.preventDefault();
    return accepted;
  };
  const view = new EditorView(host, {
    state: EditorState.create({ schema: domTextSchema, doc: backendDocumentFromContent(session.getSnapshot().model.attributedContent), plugins: [keymap(structureKeys), keymap(baseKeymap), nseTextListPlugin()] }),
    nodeViews: nseAttachmentNodeViews(host.ownerDocument, () => attachmentResolver, attachmentEditing),
    markViews: attributeMarkViews(host.ownerDocument, () => fontResolver),
    editable: () => session.getSnapshot().editable && !session.getSnapshot().disposed,
    attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, "aria-readonly": String(!session.getSnapshot().editable), spellcheck: String(spellCheck ?? true) },
    dispatchTransaction(transaction) {
      if (disposed || reconciling) return;
      const next = view.state.apply(transaction);
      view.updateState(next);
      if (transaction.docChanged) {
        try {
          const content = contentFromBackendDocument(next.doc);
          if (composing || view.composing || session.getSnapshot().marked) {
            startComposition();
            const draft = composition!;
            // The native projection remains at its composition-start revision. Diffing
            // against a newer owner would mistake unrelated external edits for input.
            const changes = translateBackendContent(draft.base, content);
            const replacement = changes.find(operation => operation.kind === "replace");
            draft.replacement = null;
            if (replacement?.kind === "replace") {
              const text = createBackendPositionMap(next.doc).text;
              const length = text.length - draft.base.text.length + replacement.range.length;
              const target = Object.freeze({ ...draft.target, range: replacement.range, anchor: replacement.range.location, focus: replacement.range.location + replacement.range.length });
              draft.replacement = target;
              const resolved = session.resolveTarget(target);
              if (!resolved) throw new Error("Composition overlaps a newer edit; preserve or cancel the marked draft.");
              session.setMarkedText(text.slice(replacement.range.location, replacement.range.location + length), resolved.range);
            } else {
              // Native cancellation may restore the original projection after an
              // earlier provisional edit. Do not commit that obsolete marked text.
              const target = session.resolveTarget(draft.target);
              if (target) session.setMarkedText("", target.range);
            }
          } else {
            accepting = true;
            const operations = translateBackendContent(session.getSnapshot().model, content);
            if (operations.length) session.commit(operations, undefined, commitMetadata ?? undefined);
          }
        } catch (error) { fail(error); }
        finally { accepting = false; }
      }
      if (!composing && !session.getSnapshot().marked) {
        try { const map = createBackendPositionMap(next.doc); session.select(map.toSemantic(next.selection.anchor), map.toSemantic(next.selection.head)); }
        catch (error) { fail(error); }
        reconcile();
      }
    },
    handleDOMEvents: {
      compositionstart() {
        if (disposed || !session.getSnapshot().editable) return false;
        try { startComposition(); } catch (error) { fail(error); }
        return false;
      },
      compositionend() { if (finalization) clearTimeout(finalization); finalization = setTimeout(finishComposition, 0); return false; },
    },
    handleDrop(dropView, event) {
      return offerFiles(event.dataTransfer?.files, () => {
        const position = dropView.posAtCoords({ left: event.clientX, top: event.clientY });
        return position ? createBackendPositionMap(dropView.state.doc).toSemantic(position.pos) : null;
      }, event);
    },
    handlePaste(_view, event) {
      return offerFiles(event.clipboardData?.files, () => { syncSelectionFromDOM(); return session.getSnapshot().selection.range.location; }, event);
    },
    handleKeyDown(_view, event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
        event.preventDefault();
        void session.requestHistory(event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo").catch(fail);
        return true;
      }
      return false;
    },
  });
  const provider: NSETextGeometryProvider = Object.freeze({
    snapshot: () => Object.freeze({ flowId: session.getSnapshot().model.flowId, revision: Object.freeze(revision()), kind: "logical-dom" as const, complete: current(), current: current(), textLength: session.getSnapshot().model.text.length, units: "css-pixels" as const }),
    caret(query: NSETextGeometryPosition) {
      if (!validQuery(query)) return null;
      try { const rect = view.coordsAtPos(createBackendPositionMap(view.state.doc).toBackend(query.offset), query.affinity === "upstream" ? -1 : 1); return Object.freeze({ ...query, containerId: "dom", visibility: "visible" as const, primary: { rect: { x: rect.left, y: rect.top, width: Math.max(1, rect.right - rect.left), height: rect.bottom - rect.top }, space: { name: "client", units: "css-pixels" as const }, transformRevision: layoutGeneration }, secondary: null }); } catch { return null; }
    },
    selection(query: NSETextGeometryRange) {
      if (!validQuery(query)) return [];
      try {
        const map = createBackendPositionMap(view.state.doc);
        const start = view.domAtPos(map.toBackend(query.location)), end = view.domAtPos(map.toBackend(query.location + query.length));
        const range = host.ownerDocument.createRange(); range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
        return [...range.getClientRects()].map(rect => ({ ...query, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, containerId: "dom", space: { name: "client", units: "css-pixels" as const }, transformRevision: layoutGeneration }));
      } catch { return []; }
    },
    positionAt(query: NSETextGeometryPoint) {
      if (!validQuery(query) || query.space.name !== "client" || query.space.units !== "css-pixels" || query.transformRevision !== layoutGeneration) return null;
      const position = view.posAtCoords({ left: query.x, top: query.y });
      return position ? { flowId: query.flowId, revision: query.revision, offset: createBackendPositionMap(view.state.doc).toSemantic(position.pos), affinity: "downstream" as const } : null;
    },
  });
  const unsubscribe = session.subscribe(reconcile);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => layoutGeneration++);
  observer?.observe(host);
  reconcile();
  return Object.freeze({
    geometry: provider,
    updatePresentation(next: { readonly label: string; readonly spellCheck?: boolean; readonly attachmentResolver?: NSETextAttachmentResolver; readonly fontResolver?: NSETextFontResolver; readonly onDropFiles?: NSETextFileDropHandler }) {
      if (disposed) return;
      label = next.label; spellCheck = next.spellCheck; fileDropHandler = next.onDropFiles;
      if (next.attachmentResolver !== attachmentResolver) { attachmentResolver = next.attachmentResolver; view.setProps({ nodeViews: nseAttachmentNodeViews(host.ownerDocument, () => attachmentResolver, attachmentEditing) }); }
      if (next.fontResolver !== fontResolver) { fontResolver = next.fontResolver; view.setProps({ markViews: attributeMarkViews(host.ownerDocument, () => fontResolver) }); }
      view.setProps({ attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, "aria-readonly": String(!session.getSnapshot().editable), spellcheck: String(spellCheck ?? true) } });
    },
    focus: () => { if (!disposed && !session.getSnapshot().disposed) view.focus(); },
    dispose() {
      if (disposed) return;
      if (moving) {
        if (moving.frame !== null) cancelAnimationFrame(moving.frame);
        moving = null;
        host.ownerDocument.removeEventListener("pointermove", onMovePointer, true);
        host.ownerDocument.removeEventListener("pointerup", endMove, true);
        host.ownerDocument.removeEventListener("pointercancel", endMove, true);
      }
      disposed = true; if (finalization) clearTimeout(finalization); observer?.disconnect(); unsubscribe(); if (composition && !session.getSnapshot().disposed) session.cancelMarkedText(); composition = null; view.destroy(); },
  });
}
