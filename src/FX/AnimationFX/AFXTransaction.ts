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

import type { GFXRect } from "../GraphicsFX/GFXGeometry";
import type {
  AFXAnimationDefinition,
  AFXAnimationHandle,
  AFXAnimationKeyPath,
  AFXAnimationScalar,
  AFXAnimationTiming,
  AFXAnimationSettlement,
} from "./animationTypes";
import { AFXAnimation } from "./AFXAnimation";
import { afxAnimationDataRecord, afxAnimationScalar } from "./animationValues";
import type { AFXAnimationExecutor } from "./AFXAnimationGroup";
export interface AFXAnimatableTarget {
  readonly id: string;
  readonly target: object;
  readonly frame: GFXRect;
  readonly opacity: number;
  readonly transform?: string;
  readonly backgroundColour?: string;
  readonly boxShadow?: string;
  readonly scrollPosition?: Readonly<{ x: number; y: number }>;
}
export interface AFXTransactionOptions {
  readonly duration?: number;
  readonly timing?: AFXAnimationTiming;
  readonly delay?: number;
  readonly disableActions?: boolean;
  readonly completion?: (settlement: AFXAnimationSettlement) => void;
}
interface Frame {
  readonly disableActions: boolean;
  readonly options: AFXAnimation;
  readonly writes: Map<
    AFXAnimationKeyPath,
    Readonly<{ from: AFXAnimationScalar; to: AFXAnimationScalar }>
  >;
  target: AFXAnimatableTarget | null;
}
export interface AFXTransactionActionContext {
  readonly disableActions: boolean;
  readonly duration: number;
  readonly delay: number;
  readonly timing: AFXAnimationTiming;
}
const activeActionContexts: AFXTransactionActionContext[] = [];
export function currentAFXTransactionActionContext(): AFXTransactionActionContext | null {
  return activeActionContexts.at(-1) ?? null;
}

interface LayerTransactionFrame {
  context: AFXTransactionActionContext;
  readonly displays: Map<object, () => void>;
  readonly starts: Array<() => Promise<AFXAnimationSettlement>>;
  readonly animations: Set<Promise<AFXAnimationSettlement>>;
  completion: (() => void) | null;
}
const layerTransactions: LayerTransactionFrame[] = [];
let publishingDisplays = false;

/** Defer layer projection until the outer transaction publishes the complete model tree. */
export function captureAFXTransactionDisplay(layer: object, display: () => void): boolean {
  if (publishingDisplays) return false;
  const frame = layerTransactions.at(-1);
  if (!frame) return false;
  frame.displays.set(layer, display);
  return true;
}
export function captureAFXTransactionAnimationStart(start: () => Promise<AFXAnimationSettlement>): boolean {
  const frame = layerTransactions.at(-1);
  if (!frame) return false;
  frame.starts.push(start);
  return true;
}
const emptyHandle: AFXAnimationHandle = Object.freeze({
  id: "afx-transaction:empty",
  progress: 1,
  state: "completed",
  finished: Promise.resolve(
    Object.freeze({ state: "completed", reduced: false }),
  ),
  cancel() {},
  pause() {},
  resume() {},
  seek(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError("Invalid seek time.");
  },
});
/** An instance-local transaction stack; the supplied executor holds the rendering authority. */
export class AFXTransaction {
  static begin(): void {
    const inherited = currentAFXTransactionActionContext();
    const context = Object.freeze({
      disableActions: inherited?.disableActions ?? false,
      duration: inherited?.duration ?? .25,
      delay: inherited?.delay ?? 0,
      timing: inherited?.timing ?? "ease" as AFXAnimationTiming,
    });
    layerTransactions.push({ context, displays: new Map(), starts: [], animations: new Set(), completion: null });
    activeActionContexts.push(context);
  }

  static commit(): void {
    const frame = layerTransactions.pop();
    if (!frame) throw new Error("An active layer transaction is required.");
    activeActionContexts.pop();
    const parent = layerTransactions.at(-1);
    if (parent) {
      for (const [layer, display] of frame.displays) parent.displays.set(layer, display);
      parent.starts.push(...frame.starts);
      for (const animation of frame.animations) parent.animations.add(animation);
      if (frame.completion) {
        const prior = parent.completion;
        parent.completion = () => { prior?.(); frame.completion?.(); };
      }
      return;
    }
    for (const start of frame.starts) frame.animations.add(start());
    for (const display of frame.displays.values()) display();
    if (frame.completion) {
      void Promise.allSettled([...frame.animations]).then(() => {
        try { frame.completion?.(); }
        catch { /* Completion errors cannot change committed layer state. */ }
      });
    }
  }

  static flush(): void {
    const frame = layerTransactions.at(-1);
    if (!frame) throw new Error("An active layer transaction is required.");
    const starts = frame.starts.splice(0);
    for (const start of starts) frame.animations.add(start());
    const displays = [...frame.displays.values()];
    frame.displays.clear();
    publishingDisplays = true;
    try { for (const display of displays) display(); }
    finally { publishingDisplays = false; }
  }

  static animationDuration(): number { return layerTransactions.at(-1)?.context.duration ?? .25; }
  static disableActions(): boolean { return layerTransactions.at(-1)?.context.disableActions ?? false; }
  static setAnimationDuration(duration: number): void {
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Transaction duration must be non-negative and finite.");
    this.#updateContext({ duration });
  }
  static setDisableActions(disableActions: boolean): void {
    if (typeof disableActions !== "boolean") throw new TypeError("disableActions must be boolean.");
    this.#updateContext({ disableActions });
  }
  static setCompletionBlock(completion: (() => void) | null): void {
    const frame = layerTransactions.at(-1);
    if (!frame) throw new Error("An active layer transaction is required.");
    if (completion !== null && typeof completion !== "function") throw new TypeError("Completion must be callable.");
    frame.completion = completion;
  }
  static #updateContext(update: Partial<AFXTransactionActionContext>): void {
    const frame = layerTransactions.at(-1);
    if (!frame) throw new Error("An active layer transaction is required.");
    frame.context = Object.freeze({ ...frame.context, ...update });
    activeActionContexts[activeActionContexts.length - 1] = frame.context;
  }

  readonly #stack: Frame[] = [];
  readonly #execute: AFXAnimationExecutor;
  readonly #release: (() => void) | undefined;
  #disposed = false;
  constructor(execute: AFXAnimationExecutor, release?: () => void) {
    if (typeof execute !== "function")
      throw new TypeError("Transaction requires an animation executor.");
    this.#execute = execute;
    this.#release = release;
  }
  run(options: AFXTransactionOptions, changes: () => void): AFXAnimationHandle {
    if (this.#disposed) throw new Error("Transaction is disposed.");
    const requested = afxAnimationDataRecord(
        options,
        "transaction options",
      ) as typeof options,
      parentFrame = this.#stack.at(-1),
      parent = parentFrame?.options;
    if (
      requested.disableActions !== undefined &&
      typeof requested.disableActions !== "boolean"
    )
      throw new TypeError("disableActions must be boolean.");
    if (
      requested.completion !== undefined &&
      typeof requested.completion !== "function"
    )
      throw new TypeError("completion must be callable.");
    const disableActions =
      requested.disableActions ?? parentFrame?.disableActions ?? false;
    const frame: Frame = {
      disableActions,
      options: new AFXAnimation({
        duration: disableActions
          ? 0
          : (requested.duration ?? parent?.duration ?? 0.25),
        delay: requested.delay ?? parent?.delay ?? 0,
        timing: requested.timing ?? parent?.timing ?? "ease",
      }),
      writes: new Map(),
      target: null,
    };
    this.#stack.push(frame);
    const actionContext = Object.freeze({
      disableActions,
      duration: frame.options.duration,
      delay: frame.options.delay,
      timing: frame.options.timing,
    });
    activeActionContexts.push(actionContext);
    try {
      changes();
    } finally {
      activeActionContexts.pop();
      this.#stack.pop();
    }
    const observe = (handle: AFXAnimationHandle) => {
      if (requested.completion)
        void handle.finished.then((settlement) => {
          try {
            requested.completion!(settlement);
          } catch {
            /* Client completion cannot change playback settlement. */
          }
        });
      return handle;
    };
    if (!frame.target || !frame.writes.size) return observe(emptyHandle);
    const definition: AFXAnimationDefinition = Object.freeze({
      ...frame.options.definition(),
      animations: Object.freeze(
        [...frame.writes].map(([keyPath, values]) =>
          Object.freeze({ targetId: frame.target!.id, keyPath, ...values }),
        ),
      ),
    });
    return observe(this.#execute(frame.target.target, definition));
  }
  animator(target: AFXAnimatableTarget) {
    const frame = this.#stack.at(-1);
    if (!frame) throw new Error("An animator requires an active transaction.");
    const value = afxAnimationDataRecord(
      target,
      "animatable target",
    ) as unknown as AFXAnimatableTarget;
    if (frame.target && frame.target.target !== value.target)
      throw new Error("One transaction targets one rendering surface.");
    frame.target = Object.freeze(value);
    const capture = (
      keyPath: AFXAnimationKeyPath,
      from: AFXAnimationScalar,
      to: AFXAnimationScalar,
    ) => {
      if (this.#disposed || !this.#stack.includes(frame))
        throw new Error("The transaction capture has ended.");
      frame.writes.set(
        keyPath,
        Object.freeze({
          from:
            frame.writes.get(keyPath)?.from ??
            afxAnimationScalar(from, "transaction start"),
          to: afxAnimationScalar(to, "transaction end"),
        }),
      );
    };
    return {
      set opacity(next: number) {
        capture("opacity", value.opacity, next);
      },
      set frame(next: GFXRect) {
        capture("frame", value.frame, next);
      },
      set transform(next: string) {
        capture("transform", value.transform ?? "none", next);
      },
      set backgroundColour(next: string) {
        capture(
          "backgroundColour",
          value.backgroundColour ?? "transparent",
          next,
        );
      },
      set boxShadow(next: string) {
        capture("boxShadow", value.boxShadow ?? "none", next);
      },
      set scrollPosition(next: Readonly<{ x: number; y: number }>) {
        capture("scrollPosition", value.scrollPosition ?? { x: 0, y: 0 }, next);
      },
    };
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#release?.();
  }
}
