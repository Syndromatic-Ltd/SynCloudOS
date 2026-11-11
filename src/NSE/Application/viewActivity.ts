import { getNSEObjectLifetime } from "./objectLifetime";

export type NSETaskLifetime = "owner" | "mounted" | "visible";
export interface NSEActivityEpoch {
  readonly signal: AbortSignal;
  readonly generation: number;
}
export interface NSEActivitySnapshot extends NSEActivityEpoch { readonly active: boolean; }

const views = new WeakMap<object, NSEViewActivity>();
const ownerEpochs = new WeakMap<object, NSEActivitySnapshot>();
const ended: NSEActivitySnapshot = Object.freeze({ signal: AbortSignal.abort(new DOMException("The lifetime is inactive.", "AbortError")), active: false, generation: 0 });

/** @internal Capture a stable current lifetime. Inactive work must not start. */
export function getNSETaskLifetime(owner: object, lifetime: NSETaskLifetime): NSEActivitySnapshot {
  const record = getNSEObjectLifetime(owner);
  if (!record) throw new TypeError("Task lifetimes require an NSE application, window or view controller.");
  if (lifetime === "owner") {
    if (record.scope.authoritySignal.aborted) return ended;
    let epoch = ownerEpochs.get(owner);
    if (!epoch) { epoch = Object.freeze({ signal: record.scope.authoritySignal, generation: 1, active: true }); ownerEpochs.set(owner, epoch); }
    return epoch;
  }
  const view = views.get(owner);
  if (!view) throw new TypeError("Mounted/visible lifetimes require a view controller.");
  return view.snapshot(lifetime);
}

/** @internal Active epoch projection for integrations that do not admit inactive work. */
export function getNSEActivityEpoch(owner: object, lifetime: NSETaskLifetime): NSEActivityEpoch | null {
  const snapshot = getNSETaskLifetime(owner, lifetime);
  return snapshot.active ? snapshot : null;
}

/** @internal Subscribe to epochs, not controller state; never starts application work. */
export function subscribeNSEActivity(owner: object, listener: () => void): () => void {
  const view = views.get(owner);
  if (view) return view.subscribe(listener);
  const signal = getNSEObjectLifetime(owner)?.scope.authoritySignal;
  if (!signal) throw new TypeError("Activity requires an NSE lifetime owner.");
  signal.addEventListener("abort", listener, { once: true });
  return () => signal.removeEventListener("abort", listener);
}

/** @internal One registry entry per view, with mount replay normalized by its controller. */
export class NSEViewActivity {
  readonly #listeners = new Set<() => void>();
  readonly #authority: AbortSignal;
  #mounted: NSEActivitySnapshot = ended;
  #visible: NSEActivitySnapshot = ended;
  #mountAbort: AbortController | null = null;
  #visibleAbort: AbortController | null = null;
  #generation = 0;
  #presented = false;
  #active = true;

  constructor(owner: object) {
    views.set(owner, this);
    this.#authority = getNSEObjectLifetime(owner)!.scope.authoritySignal;
    this.#authority.addEventListener("abort", () => { this.unmount(); this.#listeners.clear(); }, { once: true });
  }

  snapshot(lifetime: "mounted" | "visible"): NSEActivitySnapshot { return lifetime === "mounted" ? this.#mounted : this.#visible; }
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }

  mount(): void {
    if (this.#mounted.active || this.#authority.aborted) return;
    this.#mountAbort = new AbortController();
    this.#mounted = Object.freeze({ signal: this.#mountAbort.signal, generation: ++this.#generation, active: true });
  }

  /** @internal Mounted observations start after refs and viewDidLoad are ready. */
  didLoad(): void { this.#publish(); }

  present(active: boolean): void { this.#presented = true; this.setActive(active); }

  setActive(active: boolean): void {
    this.#active = active;
    const visible = this.#mounted.active && this.#presented && active && !this.#authority.aborted;
    if (visible === this.#visible.active) return;
    if (visible) {
      this.#visibleAbort = new AbortController();
      this.#visible = Object.freeze({ signal: this.#visibleAbort.signal, generation: ++this.#generation, active: true });
    } else {
      const abort = this.#visibleAbort;
      this.#visible = Object.freeze({ signal: this.#visible.signal, generation: this.#visible.generation, active: false });
      this.#visibleAbort = null;
      abort?.abort(new DOMException("The view activity epoch ended.", "AbortError"));
    }
    this.#publish();
  }

  unmount(): void {
    this.#presented = false;
    this.setActive(this.#active);
    if (!this.#mounted.active) { if (this.#authority.aborted) this.#publish(); return; }
    const abort = this.#mountAbort;
    this.#mounted = Object.freeze({ signal: this.#mounted.signal, generation: this.#mounted.generation, active: false });
    this.#mountAbort = null;
    abort?.abort(new DOMException("The view unmounted.", "AbortError"));
    this.#publish();
  }

  #publish(): void {
    const failures: unknown[] = [];
    for (const listener of [...this.#listeners]) { try { listener(); } catch (error) { failures.push(error); } }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "View activity observers failed.");
  }
}
