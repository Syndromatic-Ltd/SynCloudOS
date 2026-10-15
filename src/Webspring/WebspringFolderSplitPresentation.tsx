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

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { NSEFocusScope } from "../NSE/NSE";
import { warmNotificationCaptureEngine } from "./notificationScreenSliceCapture";
import {
  captureStage,
  keepStageSnapshot,
  prepareStageSnapshot,
  sameRect,
  takeStageSnapshot,
  visibleStageRect,
  type StageSnapshot,
} from "./webspringStageSnapshots";
import type { WebspringFolderPresentationComponent, WebspringFolderPresentationProps } from "./webspringTypes";
import "./WebspringFolderSplitPresentation.css";

/** How the default split presentation looks and moves. */
export interface WebspringFolderSplitOptions {
  /** The surface revealed between the halves. Defaults to the framework linen. */
  readonly underlay?: { readonly image?: string; readonly size?: string; readonly colour?: string };
  /** `content` (the default) fits the rows of icons; a number fixes the height in pixels. */
  readonly panelHeight?: "content" | number;
  /** A pointer from the panel to the folder icon. Defaults to true. */
  readonly notch?: boolean;
  /** Strength of the panel's inner edge shadows, 0 to 1. Defaults to 0.55. */
  readonly edgeShadow?: number;
  /** Seconds the split takes to open or close. Defaults to 0.42. */
  readonly duration?: number;
}

interface ResolvedSplitOptions {
  readonly underlay: { readonly image: string; readonly size: string; readonly colour: string };
  readonly panelHeight: "content" | number;
  readonly notch: boolean;
  readonly edgeShadow: number;
  readonly duration: number;
}

const NOTCH_SIZE = 14;
const SEAM_GAP = 6;
const STAGE_MARGIN = 24;

type CaptureState =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly canvas: HTMLCanvasElement }
  | { readonly status: "failed" };

/** A settled capture of the stage as it was at `rect`. */
type CaptureResult = { readonly rect: DOMRect } & Exclude<CaptureState, { status: "pending" }>;

type SplitPhase = "preparing" | "closed" | "open" | "closing";

function resolveOptions(options: WebspringFolderSplitOptions): ResolvedSplitOptions {
  const { underlay = {}, panelHeight = "content", notch = true, edgeShadow = 0.55, duration = 0.42 } = options;
  if (panelHeight !== "content" && (typeof panelHeight !== "number" || !Number.isFinite(panelHeight) || panelHeight <= 0)) {
    throw new TypeError("Webspring folder panelHeight must be content or a positive number of pixels.");
  }
  if (typeof edgeShadow !== "number" || !Number.isFinite(edgeShadow) || edgeShadow < 0 || edgeShadow > 1) {
    throw new TypeError("Webspring folder edgeShadow must be a number from 0 to 1.");
  }
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > 5) {
    throw new TypeError("Webspring folder duration must be a number of seconds from 0 to 5.");
  }
  return Object.freeze({
    underlay: Object.freeze({
      image: underlay.image ?? "/assets/textures/linen.webp",
      size: underlay.size ?? "cover",
      colour: underlay.colour ?? "#2b3038",
    }),
    panelHeight,
    notch: Boolean(notch),
    edgeShadow,
    duration,
  });
}

/** One half of the snapshot: the rows from `from` to `to` (stage pixels). */
function SplitHalf({ source, from, to, width, className, style, onClick }: {
  source: HTMLCanvasElement;
  from: number;
  to: number;
  width: number;
  className: string;
  style: CSSProperties;
  onClick(): void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || to <= from) return;
    const scaleX = source.width / width;
    const scaleY = scaleX;
    canvas.width = source.width;
    canvas.height = Math.max(1, Math.round((to - from) * scaleY));
    context.drawImage(source, 0, Math.round(from * scaleY), source.width, canvas.height, 0, 0, canvas.width, canvas.height);
  }, [source, from, to, width]);
  return <canvas ref={ref} className={className} style={style} aria-hidden="true" onClick={onClick} />;
}

function FolderSplit({ folder, stage, anchor, reducedMotion, renderApp, onClose, options }: WebspringFolderPresentationProps & { options: ResolvedSplitOptions }) {
  const titleId = useId();
  const scopeId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [stageRect, setStageRect] = useState(() => visibleStageRect(stage));
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  // A capture of the stage at another size no longer fits it.
  const capture: CaptureState = captureResult?.rect === stageRect ? captureResult : { status: "pending" };
  const [phase, setPhase] = useState<SplitPhase>("preparing");
  const [contentHeight, setContentHeight] = useState(0);
  const closeTimer = useRef(0);
  const closed = useRef(false);
  // Taken once, so a remounted effect (StrictMode) keeps the prepared snapshot.
  const prepared = useRef<StageSnapshot | null>(null);

  // The overlay, the panel's limits and the snapshot all follow the stage's visible rect.
  useEffect(() => {
    const view = stage.ownerDocument.defaultView;
    const update = () => setStageRect((current) => {
      const next = visibleStageRect(stage);
      return sameRect(current, next) ? current : next;
    });
    update();
    if (!view) return;
    view.addEventListener("resize", update);
    const observer = view.ResizeObserver ? new view.ResizeObserver(update) : null;
    observer?.observe(stage);
    return () => {
      view.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [stage]);

  useEffect(() => {
    let cancelled = false;
    prepared.current ??= takeStageSnapshot(stage, stageRect);
    const ready = prepared.current && sameRect(prepared.current.rect, stageRect) ? prepared.current.canvas : null;
    (ready ?? captureStage(stage, stageRect)).then(
      (canvas) => { if (!cancelled) setCaptureResult({ rect: stageRect, status: "ready", canvas }); },
      () => { if (!cancelled) setCaptureResult({ rect: stageRect, status: "failed" }); },
    );
    return () => { cancelled = true; };
  }, [stage, stageRect]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setContentHeight(Math.ceil(content.scrollHeight));
    measure();
    const Observer = stage.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return;
    const observer = new Observer(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [stage]);

  // The first capture settling, either way, shows the split at rest.
  const settled = capture.status !== "pending";
  useEffect(() => {
    if (settled && phase === "preparing") setPhase("closed");
  }, [phase, settled]);

  // Rest closed for a frame so the parting transitions from there, then part.
  useEffect(() => {
    if (phase !== "closed") return;
    const view = stage.ownerDocument.defaultView;
    if (!view) {
      setPhase("open");
      return;
    }
    let second = 0;
    const first = view.requestAnimationFrame(() => {
      second = view.requestAnimationFrame(() => setPhase((current) => current === "closed" ? "open" : current));
    });
    return () => {
      view.cancelAnimationFrame(first);
      view.cancelAnimationFrame(second);
    };
  }, [phase, stage]);

  useEffect(() => {
    if (phase !== "open") return;
    const first = panelRef.current?.querySelector<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])");
    first?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => () => stage.ownerDocument.defaultView?.clearTimeout(closeTimer.current), [stage]);

  const finish = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);

  const close = useCallback(() => {
    if (closed.current || phase === "closing") return;
    if (phase !== "open") {
      finish();
      return;
    }
    const view = stage.ownerDocument.defaultView;
    if (!view) {
      finish();
      return;
    }
    setPhase("closing");
    closeTimer.current = view.setTimeout(finish, options.duration * 1000 + 60);
  }, [finish, options.duration, phase, stage]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  const height = stageRect.height;
  const seam = Math.max(0, Math.min(height, anchor.bottom + SEAM_GAP - stageRect.top));
  const panelHeight = Math.min(
    Math.max(0, height - STAGE_MARGIN),
    options.panelHeight === "content" ? contentHeight : options.panelHeight,
  );
  const overflow = Math.max(0, seam + panelHeight - height);
  const panelTop = seam - overflow;
  const notchX = Math.max(NOTCH_SIZE, Math.min(stageRect.width - NOTCH_SIZE, anchor.left + anchor.width / 2 - stageRect.left));
  // Reduced motion and a missing snapshot crossfade; otherwise the halves part and rejoin.
  const fade = reducedMotion || capture.status === "failed";
  const parted = phase === "open" || (fade && phase === "closing");
  const notchDepth = options.notch && parted ? NOTCH_SIZE : 0;
  const topClip = `polygon(0 0, 100% 0, 100% 100%, ${notchX + NOTCH_SIZE}px 100%, ${notchX}px calc(100% - ${notchDepth}px), ${notchX - NOTCH_SIZE}px 100%, 0 100%)`;

  const style = {
    left: `${stageRect.left}px`,
    top: `${stageRect.top}px`,
    width: `${stageRect.width}px`,
    height: `${height}px`,
    "--webspring-folder-duration": `${options.duration}s`,
    "--webspring-folder-edge-shadow": options.edgeShadow,
    "--webspring-folder-underlay-image": options.underlay.image ? `url("${options.underlay.image}")` : "none",
    "--webspring-folder-underlay-size": options.underlay.size,
    "--webspring-folder-underlay-colour": options.underlay.colour,
  } as CSSProperties;

  return <NSEFocusScope options={{ scopeId: `webspring-folder:${scopeId}`, kind: "modal", modal: true, trapFocus: true, restoreFocus: true, asChild: true }}>
    <div
      className="webspring-folder-split"
      data-phase={phase}
      data-capture={capture.status}
      data-motion={fade ? "fade" : "split"}
      style={style}
      onKeyDownCapture={onKeyDown}
    >
      <div className="webspring-folder-split-backdrop" aria-hidden="true" onClick={close} />
      <div
        ref={panelRef}
        className="webspring-folder-split-panel"
        data-webspring-folder-panel={folder.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ top: `${panelTop}px`, height: `${panelHeight}px` }}
      >
        <div ref={contentRef} className="webspring-folder-split-content">
          <h2 id={titleId} className="webspring-folder-split-title">{folder.title}</h2>
          <div className="webspring-folder-split-apps">
            {folder.apps.map((app, index) => <div key={app.id} className="webspring-folder-split-cell">{renderApp(app, index)}</div>)}
          </div>
        </div>
      </div>
      {capture.status === "ready" ? <>
        <SplitHalf
          source={capture.canvas}
          from={0}
          to={seam}
          width={stageRect.width}
          className="webspring-folder-split-half is-top"
          style={{
            top: 0,
            height: `${seam}px`,
            clipPath: topClip,
            transform: parted ? `translate3d(0, ${-overflow}px, 0)` : undefined,
          }}
          onClick={close}
        />
        <SplitHalf
          source={capture.canvas}
          from={seam}
          to={height}
          width={stageRect.width}
          className="webspring-folder-split-half is-bottom"
          style={{
            top: `${seam}px`,
            height: `${height - seam}px`,
            transform: parted ? `translate3d(0, ${panelHeight - overflow}px, 0)` : undefined,
          }}
          onClick={close}
        />
      </> : null}
    </div>
  </NSEFocusScope>;
}

/**
 * The iOS 6 folder: the stage is snapshotted and split just below the folder's
 * cell, and the halves part to reveal the folder's apps on an underlay. Reduced
 * motion crossfades instead. Without a snapshot the panel opens over a dimmed
 * backdrop. Escape, a tap on either half, or a tap on the folder icon closes it.
 * `keepPrepared` keeps a snapshot of the stage ready while the view is at
 * rest, `prepare` holds one as the user reaches for a folder, and `warm` loads
 * the capture engine; views reach them through useWebspringFolderPreparation.
 */
export function createWebspringFolderSplitPresentation(options: WebspringFolderSplitOptions = {}): WebspringFolderPresentationComponent {
  const resolved = resolveOptions(options);
  return Object.assign(function WebspringFolderSplitPresentation(props: WebspringFolderPresentationProps) {
    return <FolderSplit {...props} options={resolved} />;
  }, { prepare: prepareStageSnapshot, keepPrepared: keepStageSnapshot, warm: warmNotificationCaptureEngine });
}
