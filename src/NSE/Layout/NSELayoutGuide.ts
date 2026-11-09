/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { NSEScrollRect } from "../Scroll/scrollTypes";

export interface NSELayoutGuide {
  readonly frame: NSEScrollRect;
  observe(listener: (frame: NSEScrollRect) => void): () => void;
}

export const nseEmptyLayoutRect: NSEScrollRect = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
export const nseEqualRects = (a: NSEScrollRect, b: NSEScrollRect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** @internal A guide retains its identity for its owning window's lifetime. */
export class NSELayoutGuideStore implements NSELayoutGuide {
  #frame: NSEScrollRect;
  readonly #observers = new Set<(frame: NSEScrollRect) => void>();
  constructor(frame: NSEScrollRect = nseEmptyLayoutRect) { this.#frame = Object.freeze({ ...frame }); }
  get frame(): NSEScrollRect { return this.#frame; }
  observe(listener: (frame: NSEScrollRect) => void): () => void {
    this.#observers.add(listener);
    return () => { this.#observers.delete(listener); };
  }
  setFrame(frame: NSEScrollRect): void {
    if (nseEqualRects(this.#frame, frame)) return;
    this.#frame = Object.freeze({ ...frame });
    for (const observer of [...this.#observers]) observer(this.#frame);
  }
  dispose(): void { this.#observers.clear(); }
}
