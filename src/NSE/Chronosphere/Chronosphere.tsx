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

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LoadingSpinner } from "../Components/LoadingSpinner";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { NSEFocusScope } from "../Focus/NSEFocusPort";
import { useNSEOverlayProvider } from "../Overlays/NSEOverlayProvider";
import { useChronosphereEnvironment } from "./chronosphereEnvironment";
import { ChronosphereVortexView } from "./ChronosphereVortexView";
import { sortChronosphereEntriesNewestFirst } from "./chronosphereStackLayout";
import type { ChronosphereSubject } from "./chronosphereSubject";
import type { ChronosphereVersion } from "./chronosphereTypes";
import {
  defaultChronosphereLabels,
  type ChronosphereFaceRenderer,
  type ChronosphereDetailRenderer,
  type ChronosphereLabels,
  type ChronosphereRect,
  type ChronosphereViewActions,
  type ChronosphereViewComponent,
  type ChronosphereViewModel,
} from "./chronosphereViewTypes";
import "./chronosphere.css";

/** Draws a surface to an image URL; resolves null when it cannot. */
export type ChronosphereCapture = (signal: AbortSignal) => Promise<string | null>;

// A cancelled SnapDOM request can still be running in the host. Serialize its
// replacement as well as distinct surfaces; keep only a settled void tail.
let captureTail: Promise<void> = Promise.resolve();
function captureInOrder(capture: ChronosphereCapture, signal: AbortSignal) {
  const result = captureTail.then(() => { signal.throwIfAborted(); return capture(signal); });
  captureTail = result.then(() => {}, () => {});
  return result;
}

export interface ChronospherePreparation {
  readonly loading: boolean;
  readonly error?: Error;
  retry(): void;
}

export interface ChronosphereProps<TPrepared = unknown, TDetail = unknown> {
  /** What the archive is pointed at, and its history. */
  readonly subject: ChronosphereSubject<TDetail>;
  /**
   * How the archive is drawn: `ChronosphereVortexView` (the default), `ChronosphereGridView`, or
   * the app's own view.
   */
  readonly view?: ChronosphereViewComponent<TPrepared, TDetail>;
  /** The live subject, for the present card. A view that shows no present can do without. */
  readonly capturePresent?: ChronosphereCapture;
  /** Omit, or reuse capturePresent, when both views are the same surface. */
  readonly captureForeground?: ChronosphereCapture;
  /** Called once the archive has gone. */
  readonly onReturn: () => void;
  /** Restores a past version of a document subject. Leave it out for a read-only history. */
  readonly onRestore?: (entry: ChronosphereVersion<TDetail>) => void;
  /** Replaces the wait bezel, e.g. with a button that shows its own progress. */
  readonly renderPreparation?: (state: ChronospherePreparation) => ReactNode;
  readonly renderFace?: ChronosphereFaceRenderer<TDetail>;
  readonly renderDetail?: ChronosphereDetailRenderer<TDetail>;
  readonly labels?: Partial<ChronosphereLabels>;
  /**
   * Where the subject's page sits on screen, in viewport px, when the archive opens. The present
   * page lifts off from exactly there and floats to its place, and flies back on the way out,
   * while the rest of the window glides down beneath it: Lion's depth. Leave the page out of
   * `captureForeground` (snapshotNSEView's `exclude`) so it is not drawn twice.
   */
  readonly presentOrigin?: () => ChronosphereRect | null;
}

type Ready<TPrepared> = { readonly present: string | null; readonly foreground: string | null; readonly prepared: TPrepared; readonly rect: ChronosphereRect | null };

/**
 * Chronosphere, the version archive. Any app presents its history through it: the archive takes
 * over the screen above the app, in the view the app chose, and returns when the person is done.
 */
export function Chronosphere<TPrepared = unknown, TDetail = unknown>({ subject, view = ChronosphereVortexView as unknown as ChronosphereViewComponent<TPrepared, TDetail>, capturePresent, captureForeground, onReturn, onRestore, renderPreparation, renderFace, renderDetail, labels: labelOverrides, presentOrigin }: ChronosphereProps<TPrepared, TDetail>) {
  const app = useChronosphereEnvironment();
  const { portalHost } = useNSEOverlayProvider();
  const scopeId = useId();
  const labels = useMemo(() => ({ ...defaultChronosphereLabels, ...labelOverrides }), [labelOverrides]);
  const [attempt, setAttempt] = useState(0);
  // Callers pass captures inline. Preparation must not restart because the presenting app
  // re-rendered (an autosave tick would otherwise throw the archive away and load it again);
  // it reads the latest captures when it runs, and restarts only on retry, a new subject or view.
  const captures = useRef({ present: capturePresent, foreground: captureForeground, origin: presentOrigin });
  captures.current = { present: capturePresent, foreground: captureForeground, origin: presentOrigin };
  const request = useMemo(() => ({
    present: captures.current.present ? (signal: AbortSignal) => captures.current.present!(signal) : null,
    foreground: (signal: AbortSignal) => (captures.current.foreground ?? captures.current.present)!(signal),
    distinct: captureForeground !== undefined && captureForeground !== capturePresent,
    prepare: view.prepare,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- captures are read through the ref
  }), [attempt, subject.id, view, app.images, app.signal]);
  const [preparation, setPreparation] = useState<{ request: typeof request; ready?: Ready<TPrepared>; error?: Error }>();
  const returned = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const returnAction = useRef(onReturn); returnAction.current = onReturn;
  const restoreAction = useRef(onRestore); restoreAction.current = onRestore;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const finishReturn = useCallback(() => {
    if (returned.current) return;
    returned.current = true; setDismissed(true); returnAction.current();
  }, []);
  const restore = useCallback((entry: ChronosphereVersion<TDetail>) => restoreAction.current?.(entry), []);
  const actions = useMemo<ChronosphereViewActions<TDetail>>(() => onRestore ? { exit: finishReturn, restore } : { exit: finishReturn },
    [Boolean(onRestore), finishReturn, restore]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort(app.signal.reason);
    app.signal.addEventListener("abort", abort, { once: true });
    if (app.signal.aborted) abort();
    setPreparation({ request });
    void (async () => {
      controller.signal.throwIfAborted();
      let present: string | null = null, foreground: string | null = null, rect: ChronosphereRect | null = null;
      if (request.present) {
        // SnapDOM has shared capture state. Never overlap the two surface captures.
        present = await captureInOrder(request.present, controller.signal);
        controller.signal.throwIfAborted();
        if (!present) throw new Error("The present surface could not be captured.");
        // Measured with the capture, so the page lifts off from where it was drawn.
        rect = captures.current.origin?.() ?? null;
        foreground = request.distinct ? await captureInOrder(request.foreground, controller.signal) : present;
        controller.signal.throwIfAborted();
        if (!foreground) throw new Error("The launching foreground could not be captured.");
      }
      const prepared = (request.prepare ? await request.prepare({ images: app.images, signal: controller.signal }) : undefined) as TPrepared;
      controller.signal.throwIfAborted();
      setPreparation({ request, ready: { present, foreground, prepared, rect } });
    })().catch(cause => {
      if (controller.signal.aborted) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      // Preparation owns this recoverable failure and its inline retry UI.
      // Publishing host recovery here would obscure that retry with a modal.
      setPreparation({ request, error });
    });
    return () => { controller.abort(); app.signal.removeEventListener("abort", abort); };
  }, [request, app.images, app.signal]);

  const entries = useMemo(() => sortChronosphereEntriesNewestFirst(subject.entries), [subject.entries]);
  const current = preparation?.request === request ? preparation : undefined;
  const ready = current?.ready;
  const model = useMemo<ChronosphereViewModel<TPrepared, TDetail> | null>(() => ready ? {
    subject, entries, presentImage: ready.present, foregroundImage: ready.foreground, presentRect: ready.rect, labels, prepared: ready.prepared,
  } : null, [ready, subject, entries, labels]);

  if (dismissed) return null;
  if (!model || !portalHost) {
    const state = { loading: !current?.error, error: current?.error, retry };
    if (renderPreparation) return renderPreparation(state);
    // A HUD bezel over the window, as OS X shows a short wait: the document stays in view. It
    // lives in the overlay layer, outside the app, so the window capture never contains it.
    const bezel = <div className="chronosphere-preparation" role={state.error ? "alert" : "status"} data-state={state.error ? "error" : "loading"}>
      <div className="chronosphere-preparation-bezel">
        {state.error ? <><p className="chronosphere-preparation-title">{labels.couldNotOpen}</p><p className="chronosphere-preparation-error">{state.error.message}</p>
          <div className="chronosphere-preparation-actions"><NSEPushButton onClick={finishReturn}>{labels.cancel}</NSEPushButton><NSEPushButton onClick={retry}>{labels.retry}</NSEPushButton></div></>
          : <><LoadingSpinner variant="dark" label="" ariaLabel={labels.opening} className="chronosphere-preparation-spinner" /><p className="chronosphere-preparation-title">{labels.opening}</p></>}
      </div>
    </div>;
    return portalHost ? createPortal(bezel, portalHost) : bezel;
  }
  const View = view;
  return createPortal(<NSEFocusScope options={{ scopeId: `chronosphere:${scopeId}`, kind: "modal", modal: true, trapFocus: true }}>
    <div className="chronosphere-presentation" role="dialog" aria-modal="true" aria-label={`Chronosphere — ${subject.label}`}>
      <View model={model} actions={actions} renderFace={renderFace} renderDetail={renderDetail} />
    </div>
  </NSEFocusScope>, portalHost);
}
