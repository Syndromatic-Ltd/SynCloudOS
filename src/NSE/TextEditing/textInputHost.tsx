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

import { useId, useImperativeHandle, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode, type Ref } from "react";
import type { NSETextCompositionToken, NSETextInputClient, NSETextInputResult } from "./NSETextInputClient";
import { isNSEUTF16Boundary } from "../Text/textPositions";
import type { NSETextSelectionTarget } from "./textSessionTypes";

export interface NSETextInputHostHandle { focus(): void; element(): HTMLTextAreaElement | null }
export interface NSETextInputHostProps {
  readonly client: NSETextInputClient;
  readonly label: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly spellCheck?: boolean;
  readonly children?: ReactNode;
  readonly ref?: Ref<NSETextInputHostHandle>;
  readonly onInputError?: (error: unknown) => void;
}

/** Native input + one logical accessible reading source. Children are a decorative custom surface. */
export function NSETextInputHost({ client, label, className, style, spellCheck = true, children, ref, onInputError }: NSETextInputHostProps) {
  const element = useRef<HTMLTextAreaElement>(null);
  const initialText = useRef(client.getSnapshot().projection.text);
  const errorCallback = useRef(onInputError); errorCallback.current = onInputError;
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const descriptionId = useId();
  useImperativeHandle(ref, () => ({ focus: () => element.current?.focus(), element: () => element.current }), []);
  useLayoutEffect(() => {
    const host = element.current;
    if (!host) return;
    let disposed = false, composing = false, syncing = false;
    let token: NSETextCompositionToken | null = null;
    let recoveryToken: NSETextCompositionToken | null = null;
    let pendingEnd: { data: string; native: boolean } | null = null;
    let endTask: ReturnType<typeof setTimeout> | null = null;
    // An empty end may precede its final input in another task. Keep only a
    // revision-fenced replacement ticket after canceling the provisional draft.
    type ReplacementTicket = { text: string; revision: number; target: NSETextSelectionTarget };
    let compositionBase: ReplacementTicket | null = null;
    let lateFinal: ReplacementTicket | null = null;
    let projected = client.getSnapshot();
    const clearEndTask = () => { if (endTask !== null) clearTimeout(endTask); endTask = null; };
    const errors = (result: NSETextInputResult) => {
      if (result.status === "rejected") errorCallback.current?.(new Error(result.reason));
      return result;
    };
    const sync = () => {
      if (disposed) return;
      projected = client.getSnapshot();
      if (projected.disposed) {
        clearEndTask(); pendingEnd = null; token = null; recoveryToken = null; lateFinal = null; composing = false;
      }
      if (composing || pendingEnd) return; // Never rewrite the native IME host mid-composition.
      syncing = true;
      try {
        if (host.value !== projected.projection.text) host.value = projected.projection.text;
        const range = projected.selectedRange;
        const direction = projected.selectionDirection;
        if (host.selectionStart !== range.location || host.selectionEnd !== range.location + range.length || host.selectionDirection !== direction) host.setSelectionRange(range.location, range.location + range.length, direction);
      } finally { syncing = false; }
    };
    const select = () => {
      if (syncing || disposed) return;
      errors(client.setSelectedRange({ location: host.selectionStart, length: host.selectionEnd - host.selectionStart }, { direction: host.selectionDirection === "backward" ? "backward" : "forward" }));
    };
    const start = () => {
      if (disposed || client.getSnapshot().disposed) return;
      finalize(); lateFinal = null;
      select();
      const state = client.getSnapshot().session;
      compositionBase = { text: state.model.text, revision: state.model.revision, target: state.selection };
      try { token = client.beginComposition(); composing = true; }
      catch (error) { errorCallback.current?.(error); }
    };
    const update = (event: CompositionEvent) => {
      if (!token || disposed || pendingEnd) return;
      errors(client.setMarkedText(event.data, { composition: token }));
    };
    const captureNativeMarked = () => {
      if (!token) return false;
      const state = client.getSnapshot().session, marked = state.marked;
      if (!marked) return false;
      const prefix = state.model.text.slice(0, marked.range.location), suffix = state.model.text.slice(marked.range.location + marked.range.length);
      if (!host.value.startsWith(prefix) || !host.value.endsWith(suffix) || host.value.length < prefix.length + suffix.length) {
        errorCallback.current?.(new Error("Native marked input conflicts with the canonical projection; draft preserved.")); return false;
      }
      const text = host.value.slice(prefix.length, host.value.length - suffix.length);
      const start = host.selectionStart - prefix.length, finish = host.selectionEnd - prefix.length;
      return errors(client.setMarkedText(text, { composition: token, selectedRange: { location: start, length: finish - start }, selectionDirection: host.selectionDirection === "backward" ? "backward" : "forward" })).status === "applied";
    };
    const finalize = () => {
      if (!pendingEnd || !token) return;
      clearEndTask();
      const ended = pendingEnd, captured = token;
      // Stop native synchronization suppression only after the draft operation.
      // Pending end input has priority over event.data, which can be empty/stale.
      let result: NSETextInputResult;
      if (ended.native) result = errors(client.unmarkText(captured));
      else if (ended.data !== "") {
        result = errors(client.setMarkedText(ended.data, { composition: captured }));
        if (result.status === "applied") result = errors(client.unmarkText(captured));
      } else if (compositionBase && host.value !== compositionBase.text) {
        result = captureNativeMarked() ? errors(client.unmarkText(captured)) : { status: "rejected", reason: "Native composition projection conflicts with its owner." };
      } else {
        result = errors(client.cancelMarkedText(captured));
        if (result.status === "applied") lateFinal = compositionBase;
      }
      pendingEnd = null; token = null; composing = false;
      // A rejected settlement keeps its marked draft available for explicit recovery.
      if (result.status !== "applied") {
        lateFinal = null;
        if (client.getSnapshot().session.marked && !client.getSnapshot().disposed) recoveryToken = captured;
      }
      sync();
    };
    const end = (event: CompositionEvent) => {
      if (!token || disposed || pendingEnd) { sync(); return; }
      pendingEnd = { data: event.data, native: false }; composing = false;
      endTask = setTimeout(finalize, 0);
    };
    const isCompositionInput = (event: InputEvent) => event.isComposing || event.inputType === "insertFromComposition" || event.inputType === "insertCompositionText" || event.inputType === "deleteCompositionText";
    const beforeInput = (event: InputEvent) => {
      if (disposed) return;
      if (composing || pendingEnd) return;
      if (isCompositionInput(event)) { if (!lateFinal) { event.preventDefault(); sync(); } return; }
      lateFinal = null;
      select();
      let result: NSETextInputResult | undefined;
      if ((event.inputType === "insertText" || event.inputType === "insertReplacementText") && event.data !== null) result = client.insertText(event.data);
      else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") result = client.insertText("\n");
      else if (event.inputType === "deleteContentBackward") result = client.doCommand("deleteBackward");
      else if (event.inputType === "deleteContentForward") result = client.doCommand("deleteForward");
      if (result) { event.preventDefault(); errors(result); sync(); }
    };
    const input = (event: InputEvent) => {
      if (disposed) return;
      if ((composing || pendingEnd) && token) {
        const captured = captureNativeMarked();
        if (pendingEnd) { pendingEnd.native = captured; finalize(); }
        return;
      }
      if (isCompositionInput(event)) {
        const ticket = lateFinal; lateFinal = null;
        if (ticket && !client.getSnapshot().disposed && client.getSnapshot().session.model.revision === ticket.revision) {
          const range = ticket.target.range;
          const prefix = ticket.text.slice(0, range.location), suffix = ticket.text.slice(range.location + range.length);
          if (host.value.startsWith(prefix) && host.value.endsWith(suffix) && host.value.length >= prefix.length + suffix.length) {
            const selection = { location: host.selectionStart, length: host.selectionEnd - host.selectionStart };
            const direction = host.selectionDirection === "backward" ? "backward" : "forward";
            const result = errors(client.insertText(host.value.slice(prefix.length, host.value.length - suffix.length), { target: ticket.target }));
            if (result.status === "applied") errors(client.setSelectedRange(selection, { direction }));
          }
        }
        sync(); return;
      }
      lateFinal = null;
      const before = projected.projection.text, after = host.value;
      if (before === after) { select(); return; }
      if (projected.session.model.revision !== client.getSnapshot().session.model.revision || projected.composing) {
        errorCallback.current?.(new Error("Native input belongs to a stale revision; canonical text preserved.")); sync(); return;
      }
      // Data-less native replacement: widen the minimal diff to valid UTF-16 boundaries.
      let start = 0;
      while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
      while (!isNSEUTF16Boundary(before, start) || !isNSEUTF16Boundary(after, start)) start--;
      let previousEnd = before.length, nextEnd = after.length;
      while (previousEnd > start && nextEnd > start && before[previousEnd - 1] === after[nextEnd - 1]) { previousEnd--; nextEnd--; }
      while (!isNSEUTF16Boundary(before, previousEnd) || !isNSEUTF16Boundary(after, nextEnd)) { previousEnd++; nextEnd++; }
      const selection = { location: host.selectionStart, length: host.selectionEnd - host.selectionStart };
      errors(client.insertText(after.slice(start, nextEnd), { replacementRange: { location: start, length: previousEnd - start } }));
      errors(client.setSelectedRange(selection, { direction: host.selectionDirection === "backward" ? "backward" : "forward" }));
      sync();
    };
    const paste = (event: ClipboardEvent) => {
      if (disposed || !event.clipboardData) return;
      finalize(); lateFinal = null;
      event.preventDefault(); select(); errors(client.insertText(event.clipboardData.getData("text/plain"))); sync();
    };
    const keydown = (event: KeyboardEvent) => {
      if (disposed) return;
      if (pendingEnd) { finalize(); lateFinal = null; }
      if (event.key === "Escape" && (token || recoveryToken)) {
        event.preventDefault(); const captured = (token ?? recoveryToken)!; token = null; recoveryToken = null; composing = false; lateFinal = null;
        errors(client.cancelMarkedText(captured)); sync(); return;
      }
      if (composing || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      lateFinal = null;
      const command = ({ ArrowLeft: "moveBackward", ArrowRight: "moveForward", Home: "moveToBeginning", End: "moveToEnd", Backspace: "deleteBackward", Delete: "deleteForward" } as const)[event.key as "ArrowLeft"];
      if (command) { event.preventDefault(); select(); errors(client.doCommand(command, event.shiftKey)); sync(); }
    };
    const removeHost = client.attachInputHost(() => {
      const rect = host.getBoundingClientRect();
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, space: { name: "css-client", units: "css-pixels" }, transformRevision: 0 };
    });
    const unsubscribe = client.subscribe(sync);
    const listeners: [string, EventListener][] = [
      ["select", select], ["compositionstart", start], ["compositionupdate", event => update(event as CompositionEvent)],
      ["compositionend", event => end(event as CompositionEvent)], ["beforeinput", event => beforeInput(event as InputEvent)],
      ["input", event => input(event as InputEvent)], ["paste", event => paste(event as ClipboardEvent)], ["keydown", event => keydown(event as KeyboardEvent)],
    ];
    for (const [name, listener] of listeners) host.addEventListener(name, listener);
    sync();
    return () => {
      finalize(); clearEndTask(); lateFinal = null;
      disposed = true;
      for (const [name, listener] of listeners) host.removeEventListener(name, listener);
      unsubscribe(); removeHost();
      if (token || recoveryToken) client.cancelMarkedText((token ?? recoveryToken)!);
    };
  }, [client]);
  return <div className={className} style={style}>
    {children ? <div aria-hidden="true" inert>{children}</div> : null}
    <textarea ref={element} defaultValue={initialText.current} aria-label={label} aria-multiline="true" aria-readonly={!snapshot.session.editable || snapshot.disposed} readOnly={!snapshot.session.editable || snapshot.disposed} aria-disabled={snapshot.disposed || undefined} aria-describedby={snapshot.projection.description ? descriptionId : undefined} spellCheck={spellCheck} />
    {snapshot.projection.description ? <span id={descriptionId} hidden>{snapshot.projection.description}</span> : null}
  </div>;
}
