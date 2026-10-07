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

import { nseGraphemeBoundaries, nseGraphemeDeletionRange, validateNSETextRange, isNSEUTF16Boundary } from "../Text/textPositions";
import type { NSETextRange } from "../Text/textTypes";
import type { NSETextChangeReceipt } from "../Text/textOwner";
import type { TextEditingSession } from "./TextEditingSession";
import type { NSETextSelectionTarget, NSETextSessionSnapshot } from "./textSessionTypes";
import { createNSETextAccessibilityProjection, type NSETextAccessibilityProjection } from "./textAccessibilityProjection";
import { sameNSETextGeometryRevision, snapshotNSETextGeometryRevision, type NSETextGeometryProvider, type NSETextGeometrySnapshot, type NSETextGeometryPosition, type NSETextSpatialPoint, type NSETextSpatialRect } from "../TextLayout/textGeometryTypes";
import { sameNSETextCoordinateSpace } from "../TextLayout/textCoordinateSpaces";
import { invertNSETextGeometryTransform, projectNSETextGeometryPoint, projectNSETextGeometryRect, type NSETextGeometryTransform } from "../TextLayout/textGeometryTransforms";
import { normaliseRect } from "../../FX/GraphicsFX/GFXGeometry";

export interface NSETextCompositionToken {
  readonly sessionId: string;
  readonly flowId: string;
  readonly ownerGeneration: number;
  readonly generation: number;
}
export type NSETextInputResult =
  | { readonly status: "applied"; readonly receipt: NSETextChangeReceipt | null }
  | { readonly status: "ignored"; readonly reason: "disposed" | "stale-composition" }
  | { readonly status: "rejected"; readonly reason: string };
export interface NSETextInputClientSnapshot {
  readonly session: NSETextSessionSnapshot;
  readonly projection: NSETextAccessibilityProjection;
  /** UTF-16 coordinates in projection.text; marked selection is local to the draft internally. */
  readonly selectedRange: NSETextRange;
  readonly selectionDirection: "forward" | "backward";
  readonly markedRange: NSETextRange | null;
  readonly composing: boolean;
  readonly disposed: boolean;
}
export interface NSETextInputClientOptions {
  readonly session: TextEditingSession;
  readonly geometry?: () => NSETextGeometryProvider | null;
  readonly transforms?: () => Readonly<{ client?: NSETextGeometryTransform; screen?: NSETextGeometryTransform }>;
  readonly provisionalRect?: () => NSETextSpatialRect | null;
  readonly signal?: AbortSignal;
}
export type NSETextInputPendingGeometry = { readonly status: "pending"; readonly reason: string; readonly provisional: boolean; readonly rect: NSETextSpatialRect | null };
export type NSETextInputRectangle = NSETextInputPendingGeometry | { readonly status: "ready"; readonly rect: NSETextSpatialRect; readonly actualRange: NSETextRange; readonly geometry: NSETextGeometrySnapshot };
export type NSETextInputPointResult = NSETextInputPendingGeometry | { readonly status: "ready"; readonly position: NSETextGeometryPosition; readonly geometry: NSETextGeometrySnapshot };
export type NSETextInputCommand = "moveBackward" | "moveForward" | "moveToBeginning" | "moveToEnd" | "deleteBackward" | "deleteForward";
type GeometryContext = { provider: NSETextGeometryProvider; snapshot: NSETextGeometrySnapshot };
const activeInputHosts = new WeakMap<TextEditingSession, NSETextInputClient>();

/** Platform input cooperation over a supplied canonical session; this class owns no content/history. */
export class NSETextInputClient {
  readonly #options: NSETextInputClientOptions;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #snapshot: NSETextInputClientSnapshot;
  #markedSelection: NSETextRange | undefined;
  #markedBackward = false;
  #token: NSETextCompositionToken | null = null;
  #generation = 0;
  #batch = 0;
  #disposed = false;
  #ownsMarked = false;
  #host: (() => NSETextSpatialRect | null) | null = null;

  constructor(options: NSETextInputClientOptions) {
    this.#options = options;
    this.#snapshot = this.#makeSnapshot();
    this.#unsubscribe = options.session.subscribe(() => this.#refresh());
    options.signal?.addEventListener("abort", this.dispose, { once: true });
    options.session.signal.addEventListener("abort", this.dispose, { once: true });
    if (options.signal?.aborted || options.session.signal.aborted) this.dispose();
  }
  getSnapshot = (): NSETextInputClientSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => {};
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  setSelectedRange(range: NSETextRange, options: { direction?: "forward" | "backward"; affinity?: "upstream" | "downstream" } = {}): NSETextInputResult {
    return this.#perform(() => {
      const snapshot = this.#options.session.getSnapshot();
      const marked = snapshot.marked;
      validateNSETextRange(this.#snapshot.projection.text, range);
      if (marked) {
        if (range.location < marked.range.location || range.location + range.length > marked.range.location + marked.text.length) throw new Error("Finish or cancel composition before selecting outside the marked draft.");
        this.#markedSelection = validateNSETextRange(marked.text, { location: range.location - marked.range.location, length: range.length });
        this.#markedBackward = options.direction === "backward";
      } else {
        const start = range.location, end = start + range.length;
        this.#options.session.select(options.direction === "backward" ? end : start, options.direction === "backward" ? start : end, options.affinity);
      }
    });
  }
  insertText(text: string, options: { replacementRange?: NSETextRange; target?: NSETextSelectionTarget; composition?: NSETextCompositionToken } = {}): NSETextInputResult {
    return this.#perform(() => {
      const session = this.#options.session, snapshot = session.getSnapshot();
      const target = options.target ? session.resolveTarget(options.target) : null;
      if (options.target && !target) throw new Error("Text input target is stale or revoked.");
      if (options.target && options.replacementRange && options.target.modelRevision !== snapshot.model.revision) throw new Error("Explicit replacement range belongs to a stale input revision.");
      const range = validateNSETextRange(snapshot.model.text, options.replacementRange ?? snapshot.marked?.range ?? target?.range ?? snapshot.selection.range);
      if (snapshot.marked) {
        session.setMarkedText(text, range);
        this.#markedSelection = { location: text.length, length: 0 };
        this.#markedBackward = false;
        return this.#commitMarked();
      }
      return session.insertText(text, range);
    }, options.composition);
  }
  beginComposition(): NSETextCompositionToken {
    const snapshot = this.#options.session.getSnapshot();
    if (this.#disposed || snapshot.disposed) throw new Error("Text input client is disposed.");
    if (snapshot.marked) throw new Error("A marked draft is already active.");
    const range = snapshot.selection.range;
    const text = snapshot.model.text.slice(range.location, range.location + range.length);
    this.#token = this.#newToken();
    const result = this.setMarkedText(text, { selectedRange: { location: 0, length: text.length }, composition: this.#token });
    if (result.status !== "applied") { this.#token = null; throw new Error(result.reason); }
    return this.#token!;
  }
  setMarkedText(text: string, options: { replacementRange?: NSETextRange; selectedRange?: NSETextRange; selectionDirection?: "forward" | "backward"; composition?: NSETextCompositionToken } = {}): NSETextInputResult {
    return this.#perform(() => {
      if (typeof text !== "string") throw new TypeError("Marked input must be text.");
      const snapshot = this.#options.session.getSnapshot();
      const selected = validateNSETextRange(text, options.selectedRange ?? { location: text.length, length: 0 });
      const range = validateNSETextRange(snapshot.model.text, options.replacementRange ?? snapshot.marked?.range ?? snapshot.selection.range);
      this.#options.session.setMarkedText(text, range);
      this.#token ??= this.#newToken();
      this.#ownsMarked = true;
      this.#markedSelection = selected;
      this.#markedBackward = options.selectionDirection === "backward";
    }, options.composition);
  }
  unmarkText(token?: NSETextCompositionToken): NSETextInputResult {
    if (token && !this.#validToken(token)) return this.#ignored();
    if (!this.#options.session.getSnapshot().marked && token) return this.#ignored();
    return this.#perform(() => this.#commitMarked(), token);
  }
  cancelMarkedText(token?: NSETextCompositionToken): NSETextInputResult {
    return this.#perform(() => { this.#options.session.cancelMarkedText(); this.#token = null; this.#generation++; this.#markedSelection = undefined; this.#ownsMarked = false; }, token);
  }
  doCommand(command: NSETextInputCommand, extend = false): NSETextInputResult {
    return this.#perform(() => {
      const snapshot = this.#options.session.getSnapshot(), marked = snapshot.marked;
      const text = marked?.text ?? snapshot.model.text;
      const selected = marked ? this.#markedSelection ?? { location: text.length, length: 0 } : snapshot.selection.range;
      if (command === "deleteBackward" || command === "deleteForward") {
        if (!marked) return this.#options.session.delete(command === "deleteBackward" ? "backward" : "forward");
        const range = selected.length ? selected : nseGraphemeDeletionRange(text, selected.location, command === "deleteBackward" ? "backward" : "forward");
        this.#options.session.setMarkedText(text.slice(0, range.location) + text.slice(range.location + range.length), marked.range);
        this.#markedSelection = { location: range.location, length: 0 };
        this.#markedBackward = false;
        return;
      }
      const backward = command === "moveBackward" || command === "moveToBeginning";
      const boundaries = nseGraphemeBoundaries(text);
      const focus = marked ? selected.location + (this.#markedBackward ? 0 : selected.length) : snapshot.selection.focus;
      const next = command === "moveToBeginning" ? 0 : command === "moveToEnd" ? text.length : !extend && selected.length ? selected.location + (backward ? 0 : selected.length) : backward ? [...boundaries].reverse().find(offset => offset < focus) ?? 0 : boundaries.find(offset => offset > focus) ?? text.length;
      if (!["moveBackward", "moveForward", "moveToBeginning", "moveToEnd"].includes(command)) throw new Error("Unsupported text input command.");
      if (marked) {
        const anchor = extend ? selected.location + (this.#markedBackward ? selected.length : 0) : next;
        this.#markedSelection = { location: Math.min(anchor, next), length: Math.abs(anchor - next) };
        this.#markedBackward = next < anchor;
      } else this.#options.session.select(extend ? snapshot.selection.anchor : next, next, backward ? "upstream" : "downstream");
    });
  }

  firstRectForRange(range: NSETextRange, destination: "client" | "screen" = "client"): NSETextInputRectangle {
    try {
      if (this.#snapshot.composing) return this.#pending("Marked draft geometry has not been shaped.");
      validateNSETextRange(this.#snapshot.session.model.text, range);
      const context = this.#geometry();
      if (!context) return this.#pending("Text geometry is unavailable, incomplete or stale.");
      const transform = this.#options.transforms?.()[destination];
      const query = { flowId: context.snapshot.flowId, revision: context.snapshot.revision };
      const geometry = range.length ? context.provider.selection({ ...query, ...range })[0] : context.provider.caret({ ...query, offset: range.location, affinity: this.#snapshot.session.selection.affinity });
      if (!geometry || !this.#geometryCurrent(context) || geometry.flowId !== query.flowId || !sameNSETextGeometryRevision(geometry.revision, query.revision)) return this.#pending("Text geometry changed during the query or the range is unavailable.");
      if ("offset" in geometry && geometry.offset !== range.location) return this.#pending("Caret geometry belongs to another text position.");
      const spatial = "primary" in geometry ? geometry.primary : geometry;
      let rect: NSETextSpatialRect;
      if (transform) {
        if (spatial.transformRevision !== 0 && spatial.transformRevision !== transform.revision) return this.#pending("Text presentation transform is stale.");
        rect = projectNSETextGeometryRect({ ...spatial, transformRevision: transform.revision }, transform);
        if (!this.#transformCurrent(destination, transform)) return this.#pending("Text presentation transform changed during the query.");
      } else {
        const expected = destination === "screen" ? "screen" : "css-client";
        if (spatial.space.name !== expected || spatial.space.units !== "css-pixels") return this.#pending("A text presentation transform is required.");
        rect = spatial;
      }
      const actualRange = "location" in geometry ? validateNSETextRange(this.#snapshot.session.model.text, { location: geometry.location, length: geometry.length }) : Object.freeze({ ...range });
      return Object.freeze({ status: "ready", rect, actualRange, geometry: context.snapshot });
    } catch (error) { return this.#pending(error instanceof Error ? error.message : String(error)); }
  }
  characterIndexForPoint(point: NSETextSpatialPoint): NSETextInputPointResult {
    try {
      if (this.#snapshot.composing) return this.#pending("Marked draft geometry has not been shaped.");
      const context = this.#geometry();
      if (!context) return this.#pending("Text geometry is unavailable, incomplete or stale.");
      const transforms = this.#options.transforms?.();
      const destination = transforms?.client && sameNSETextCoordinateSpace(point.space, transforms.client.to) ? "client" : transforms?.screen && sameNSETextCoordinateSpace(point.space, transforms.screen.to) ? "screen" : null;
      const transform = destination ? transforms?.[destination] : undefined;
      const projected = transform ? projectNSETextGeometryPoint(point, invertNSETextGeometryTransform(transform)) : point;
      const position = context.provider.positionAt({ ...projected, transformRevision: transform ? 0 : projected.transformRevision, flowId: context.snapshot.flowId, revision: context.snapshot.revision });
      if (!position || !this.#geometryCurrent(context) || position.flowId !== context.snapshot.flowId || !sameNSETextGeometryRevision(position.revision, context.snapshot.revision) || !isNSEUTF16Boundary(this.#snapshot.session.model.text, position.offset) || (transform && destination && !this.#transformCurrent(destination, transform))) return this.#pending("Text point geometry is unavailable or changed during the query.");
      return Object.freeze({ status: "ready", position, geometry: context.snapshot });
    } catch (error) { return this.#pending(error instanceof Error ? error.message : String(error)); }
  }
  attachInputHost(provisionalRect: () => NSETextSpatialRect | null): () => void {
    if (this.#disposed || this.#options.session.getSnapshot().disposed) throw new Error("Text input client is disposed.");
    if (this.#host || activeInputHosts.has(this.#options.session)) throw new Error("A text editing session already has an active input host.");
    this.#host = provisionalRect;
    activeInputHosts.set(this.#options.session, this);
    return () => {
      if (this.#host === provisionalRect) {
        this.#host = null;
        if (activeInputHosts.get(this.#options.session) === this) activeInputHosts.delete(this.#options.session);
      }
    };
  }
  dispose = (): void => {
    if (this.#disposed) return;
    if (this.#ownsMarked && !this.#options.session.getSnapshot().disposed) this.#options.session.cancelMarkedText();
    this.#disposed = true; this.#generation++; this.#token = null; this.#host = null;
    if (activeInputHosts.get(this.#options.session) === this) activeInputHosts.delete(this.#options.session);
    this.#unsubscribe(); this.#options.signal?.removeEventListener("abort", this.dispose);
    this.#options.session.signal.removeEventListener("abort", this.dispose);
    this.#refresh(); this.#listeners.clear();
  };

  #commitMarked(): NSETextChangeReceipt | null {
    const marked = this.#options.session.getSnapshot().marked;
    if (!marked) return null;
    const selected = this.#markedSelection ?? { location: marked.text.length, length: 0 };
    const receipt = this.#options.session.unmarkText();
    const start = marked.range.location + selected.location, end = start + selected.length;
    this.#options.session.select(this.#markedBackward ? end : start, this.#markedBackward ? start : end);
    this.#token = null; this.#generation++; this.#ownsMarked = false; this.#markedSelection = undefined;
    return receipt;
  }
  #newToken(): NSETextCompositionToken {
    const state = this.#options.session.getSnapshot();
    return Object.freeze({ sessionId: state.selection.sessionId, flowId: state.model.flowId, ownerGeneration: state.model.ownerGeneration, generation: ++this.#generation });
  }
  #validToken(token: NSETextCompositionToken): boolean {
    const snapshot = this.#options.session.getSnapshot();
    return !this.#disposed && !snapshot.disposed && !!this.#token && token.generation === this.#token.generation && token.sessionId === snapshot.selection.sessionId && token.flowId === snapshot.model.flowId && token.ownerGeneration === snapshot.model.ownerGeneration;
  }
  #ignored(): NSETextInputResult { return Object.freeze({ status: "ignored", reason: this.#disposed || this.#options.session.getSnapshot().disposed ? "disposed" : "stale-composition" }); }
  #perform(action: () => NSETextChangeReceipt | null | void, token?: NSETextCompositionToken): NSETextInputResult {
    if (this.#disposed || this.#options.session.getSnapshot().disposed) return this.#ignored();
    if (token && !this.#validToken(token)) return this.#ignored();
    this.#batch++;
    try { return Object.freeze({ status: "applied", receipt: action() ?? null }); }
    catch (error) { return Object.freeze({ status: "rejected", reason: error instanceof Error ? error.message : String(error) }); }
    finally { this.#batch--; this.#refresh(); }
  }
  #makeSnapshot(): NSETextInputClientSnapshot {
    const session = this.#options.session.getSnapshot();
    const projection = createNSETextAccessibilityProjection(session, this.#markedSelection);
    const backward = session.marked ? this.#markedBackward : session.selection.anchor > session.selection.focus;
    return Object.freeze({ session, projection, selectedRange: projection.selection, selectionDirection: backward ? "backward" : "forward", markedRange: projection.markedRange, composing: !!session.marked, disposed: this.#disposed || session.disposed });
  }
  #refresh(): void {
    if (this.#batch) return;
    if (!this.#options.session.getSnapshot().marked) { this.#markedSelection = undefined; this.#markedBackward = false; this.#ownsMarked = false; this.#token = null; }
    this.#snapshot = this.#makeSnapshot();
    for (const listener of [...this.#listeners]) listener();
  }
  #geometry(): GeometryContext | null {
    if (this.#snapshot.disposed) return null;
    const provider = this.#options.geometry?.();
    if (!provider) return null;
    const snapshot = provider.snapshot();
    const model = this.#options.session.getSnapshot().model;
    if (!snapshot.current || !snapshot.complete || snapshot.flowId !== model.flowId || snapshot.textLength !== model.text.length || snapshot.revision.modelRevision !== model.revision || snapshot.revision.ownerGeneration !== model.ownerGeneration) return null;
    return { provider, snapshot: Object.freeze({ ...snapshot, revision: snapshotNSETextGeometryRevision(snapshot.revision) }) };
  }
  #geometryCurrent(context: GeometryContext): boolean {
    const current = this.#geometry();
    return !!current && current.provider === context.provider && sameNSETextGeometryRevision(current.snapshot.revision, context.snapshot.revision);
  }
  #transformCurrent(destination: "client" | "screen", transform: NSETextGeometryTransform): boolean {
    const current = this.#options.transforms?.()[destination];
    return !!current && current.revision === transform.revision && sameNSETextCoordinateSpace(current.from, transform.from) && sameNSETextCoordinateSpace(current.to, transform.to) && (["a", "b", "c", "d", "tx", "ty"] as const).every(key => current.matrix[key] === transform.matrix[key]);
  }
  #pending(reason: string): NSETextInputPendingGeometry {
    let rect: NSETextSpatialRect | null = null;
    try {
      const candidate = !this.#snapshot.disposed ? (this.#host ?? this.#options.provisionalRect)?.() : null;
      if (candidate) rect = Object.freeze({ ...candidate, rect: normaliseRect(candidate.rect) });
    } catch { /* An unavailable provisional host cannot provide measured candidate geometry. */ }
    return Object.freeze({ status: "pending", reason, provisional: !!rect, rect });
  }
}
