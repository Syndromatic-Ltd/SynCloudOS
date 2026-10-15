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
  captureScreenSlice,
  clearNotificationCanvasMarks,
  collectNotificationCanvasReplacements,
  screenSliceIgnoredSelectors,
  shouldUseNotificationSnapdomCapture,
} from "./notificationScreenSliceCapture";

/** Snapshots stay sharp enough for a moving split without paying for full retina density. */
const STAGE_CAPTURE_MAX_SCALE = 1.5;
/** How long a snapshot held for an opening ignores the stage changing under it. */
const SNAPSHOT_HOLD_MS = 4000;
/** The stage must stop changing for this long before it is snapshotted in the background. */
const BACKGROUND_QUIET_MS = 300;
/** Background snapshots of a stage that keeps changing are at least this far apart. */
const BACKGROUND_MIN_INTERVAL_MS = 2000;
/** The capture's own marks on live canvases, which change nothing drawn. */
const CAPTURE_MARK_ATTRIBUTE = "data-syncloudos-notification-capture";

export function sameRect(left: DOMRect, right: DOMRect) {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

/** The stage's visible rect in viewport coordinates. */
export function visibleStageRect(stage: HTMLElement) {
  const rect = stage.getBoundingClientRect();
  const view = stage.ownerDocument.defaultView;
  const right = Math.min(rect.right, view?.innerWidth ?? rect.right);
  const bottom = Math.min(rect.bottom, view?.innerHeight ?? rect.bottom);
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

/** Captures the stage's visible rect; content outside it is pruned before it is drawn. */
export async function captureStage(stage: HTMLElement, strip: DOMRect) {
  if (!shouldUseNotificationSnapdomCapture() || strip.width < 1 || strip.height < 1) throw new Error("Screen capture is unavailable.");
  const scale = Math.min(STAGE_CAPTURE_MAX_SCALE, stage.ownerDocument.defaultView?.devicePixelRatio ?? 1);
  // SnapDOM is loaded on first use, as for the notification banner, to keep it out of the entry chunk.
  const { snapdom } = await import("@zumer/snapdom");
  const replacements = collectNotificationCanvasReplacements(strip, screenSliceIgnoredSelectors);
  try {
    return await captureScreenSlice(snapdom, stage, replacements, scale, strip, screenSliceIgnoredSelectors);
  } finally {
    clearNotificationCanvasMarks();
  }
}

export interface StageSnapshot {
  readonly rect: DOMRect;
  readonly canvas: Promise<HTMLCanvasElement>;
}

interface Snapshot extends StageSnapshot {
  /** Held for an opening the user has reached for: changes are its own until the hold lapses. */
  held: boolean;
  changedWhileHeld: boolean;
}

/*
 * One stage's snapshot, kept current. Any change to the stage's content, text
 * or attributes (other than ARIA state), any scroll and any resize make it
 * stale. While a view keeps the stage prepared, a stale snapshot is retaken
 * at idle once the stage has been quiet for a moment and no finite animation
 * is running in it; that invalidation is complete for what a view draws from
 * its DOM, so a background snapshot has no expiry. A snapshot taken or found
 * for a user's reach (hover, press, focus) is held instead: the press and the
 * opening change the stage themselves, so changes are ignored for a short
 * hold, after which a changed snapshot is dropped.
 */
class StageSnapshots {
  #snapshot: Snapshot | null = null;
  #keepers = 0;
  #lastBackgroundCapture = Number.NEGATIVE_INFINITY;
  #holdTimer = 0;
  #quietTimer = 0;
  #idleHandle = 0;
  readonly #observer: MutationObserver;
  readonly #stage: HTMLElement;
  readonly #view: Window & typeof globalThis;
  readonly #release: () => void;

  constructor(stage: HTMLElement, view: Window & typeof globalThis, release: () => void) {
    this.#stage = stage;
    this.#view = view;
    this.#release = release;
    this.#observer = new view.MutationObserver((records) => {
      if (records.some((record) => record.type !== "attributes" || !ignoredAttribute(record.attributeName))) this.#changed();
    });
    this.#observer.observe(stage, { attributes: true, childList: true, characterData: true, subtree: true });
    view.addEventListener("scroll", this.#changed, true);
    view.addEventListener("resize", this.#changed);
  }

  /** A user is reaching for a folder: hold a current snapshot, taking one if there is none. */
  prepare() {
    const rect = visibleStageRect(this.#stage);
    const snapshot = this.#snapshot && sameRect(this.#snapshot.rect, rect) ? this.#snapshot : this.#capture(rect);
    if (snapshot.held) return;
    snapshot.held = true;
    this.#holdTimer = this.#view.setTimeout(() => this.#lapse(snapshot), SNAPSHOT_HOLD_MS);
  }

  /** Keeps a snapshot ready while the view is at rest; returns the function that stops. */
  keep() {
    this.#keepers += 1;
    if (!this.#snapshot) this.#schedule();
    let kept = true;
    return () => {
      if (!kept) return;
      kept = false;
      this.#keepers -= 1;
      if (this.#keepers === 0) this.#cancelSchedule();
      this.#disposeIfIdle();
    };
  }

  /** The snapshot for an opening at `rect`, used once. */
  take(rect: DOMRect): StageSnapshot | null {
    // Changes not yet delivered are the opening's own (its layer, the folder's expanded state).
    this.#observer.takeRecords();
    const snapshot = this.#snapshot;
    this.#drop();
    this.#disposeIfIdle();
    return snapshot && sameRect(snapshot.rect, rect) ? snapshot : null;
  }

  #capture(rect: DOMRect) {
    this.#drop();
    const snapshot: Snapshot = { rect, canvas: captureStage(this.#stage, rect), held: false, changedWhileHeld: false };
    this.#snapshot = snapshot;
    // A failed snapshot is dropped so the next reach retries.
    snapshot.canvas.catch(() => {
      if (this.#snapshot !== snapshot) return;
      this.#drop();
      this.#disposeIfIdle();
    });
    return snapshot;
  }

  #drop() {
    this.#view.clearTimeout(this.#holdTimer);
    this.#snapshot = null;
  }

  #lapse(snapshot: Snapshot) {
    if (this.#snapshot !== snapshot) return;
    snapshot.held = false;
    if (!snapshot.changedWhileHeld) return;
    this.#drop();
    if (this.#keepers > 0) this.#schedule();
    else this.#disposeIfIdle();
  }

  readonly #changed = () => {
    const snapshot = this.#snapshot;
    if (snapshot?.held) snapshot.changedWhileHeld = true;
    else if (snapshot) this.#drop();
    if (this.#keepers > 0 && !this.#snapshot) this.#schedule();
    else this.#disposeIfIdle();
  };

  #schedule() {
    this.#cancelSchedule();
    const wait = Math.max(BACKGROUND_QUIET_MS, this.#lastBackgroundCapture + BACKGROUND_MIN_INTERVAL_MS - this.#view.performance.now());
    this.#quietTimer = this.#view.setTimeout(() => {
      const run = () => {
        this.#idleHandle = 0;
        if (this.#keepers === 0 || this.#snapshot) return;
        if (this.#animating()) {
          this.#schedule();
          return;
        }
        this.#lastBackgroundCapture = this.#view.performance.now();
        this.#capture(visibleStageRect(this.#stage));
      };
      this.#idleHandle = typeof this.#view.requestIdleCallback === "function"
        ? this.#view.requestIdleCallback(run, { timeout: 2000 })
        : this.#view.setTimeout(run, 0);
    }, wait);
  }

  #cancelSchedule() {
    this.#view.clearTimeout(this.#quietTimer);
    if (typeof this.#view.cancelIdleCallback === "function") this.#view.cancelIdleCallback(this.#idleHandle);
    else this.#view.clearTimeout(this.#idleHandle);
    this.#idleHandle = 0;
  }

  /** Finite animations (transitions, entrances) still running in the stage; endless ambient ones do not count. */
  #animating() {
    if (typeof this.#stage.getAnimations !== "function") return false;
    return this.#stage.getAnimations({ subtree: true }).some((animation) =>
      animation.playState === "running" && Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
  }

  #disposeIfIdle() {
    if (this.#keepers > 0 || this.#snapshot) return;
    this.#cancelSchedule();
    this.#observer.disconnect();
    this.#view.removeEventListener("scroll", this.#changed, true);
    this.#view.removeEventListener("resize", this.#changed);
    this.#release();
  }
}

function ignoredAttribute(name: string | null) {
  return name === null || name.startsWith("aria-") || name === CAPTURE_MARK_ATTRIBUTE;
}

const stages = new WeakMap<HTMLElement, StageSnapshots>();

function stageSnapshots(stage: HTMLElement) {
  const existing = stages.get(stage);
  if (existing) return existing;
  const view = stage.ownerDocument.defaultView;
  if (!view) return null;
  const created = new StageSnapshots(stage, view, () => stages.delete(stage));
  stages.set(stage, created);
  return created;
}

/** Holds a current snapshot of `stage` for an opening the user is reaching for. */
export function prepareStageSnapshot(stage: HTMLElement) {
  stageSnapshots(stage)?.prepare();
}

/** Keeps a snapshot of `stage` ready while its view is at rest; returns the function that stops. */
export function keepStageSnapshot(stage: HTMLElement): () => void {
  return stageSnapshots(stage)?.keep() ?? (() => undefined);
}

/** The prepared snapshot of `stage` if it is still good for `rect`; it is used once. */
export function takeStageSnapshot(stage: HTMLElement, rect: DOMRect): StageSnapshot | null {
  return stages.get(stage)?.take(rect) ?? null;
}
