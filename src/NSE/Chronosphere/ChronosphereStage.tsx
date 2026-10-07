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
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
  type ReactNode,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  sortChronosphereEntriesNewestFirst
} from "./chronosphereStackLayout";
import { defaultChronosphereSubject, type ChronosphereCardShape, type ChronosphereSubject } from "./chronosphereSubject";
import type { ChronosphereVersion, ChronosphereDepthSlot } from "./chronosphereTypes";
import { VortexEffect } from "./Vortex/VortexEffect";
import { useChronosphereMotion } from "./useChronosphereMotion";
import { useChronosphereTravel } from "./useChronosphereTravel";
import { projectChronosphereDepth, significantChronosphereIndex } from "./chronosphereTravel";
import { ChronosphereTimeline } from "./ChronosphereTimeline";
import { ChronosphereReflection } from "./ChronosphereReflection";
import { ChronosphereArrow } from "./ChronosphereArrow";
import type { VortexImages } from "./Vortex/loadVortexImages";
import { defaultChronosphereLabels, type ChronosphereDetailRenderer, type ChronosphereFaceContext, type ChronosphereFaceRenderer, type ChronosphereLabels } from "./chronosphereViewTypes";
import "./chronosphere.css";

/** The Vortex view's stage: Time Machine's receding stack, or Lion's Versions beside the present. */
export interface ChronosphereStageProps<TDetail = unknown> {
  /** Runtime-owned platform capability supplied by the presenting app. */
  environment: ChronospherePlatformPort;
  DetailFocusScopeComponent: ComponentType<PropsWithChildren<{ scopeId: string }>>;
  /** Canonical NSE button supplied by the presenting SynWare. */
  PushButtonComponent: ComponentType<ChronospherePushButtonProps>;
  /**
   * What the archive is pointed at. Hosts supply the subject and history;
   * the empty fallback carries no website-specific archive.
   */
  subject?: ChronosphereSubject<TDetail>;
  /** Explicit entries override (defaults to subject.entries). */
  entries?: readonly ChronosphereVersion<TDetail>[];
  /** Called when the user leaves the archive (the exit control / Escape). */
  onExit?: () => void;
  /**
   * Document subjects: restore the chosen past version, then fly back to the present. The
   * control appears only while a past card is in front. Read-only histories leave it out.
   */
  onRestore?: (entry: ChronosphereVersion<TDetail>) => void;
  /**
   * Captured bitmap of the subject's live view (e.g. the Webspring desktop).
   * Becomes the face of the present ("Now") card — the real view that flew into
   * the vortex (Time Machine-style).
   */
  originImage?: string;
  /**
   * Captured bitmap of the complete launching foreground, independently of
   * the archived subject's present card. The presenter requires both captures.
   */
  curtainImage?: string;
  preparedImages?: VortexImages;
  /** Skip the entry/exit choreography (e.g. when the host already animated). */
  immediate?: boolean;
  /**
   * Draws a version's own page on its card, as Versions shows the document itself rather than a
   * picture of it. The face is laid out at the subject card's `faceWidth` and scaled to the card;
   * it cannot be focused or clicked. Faces need a subject `card` shape. Return null to fall back
   * to the entry's screenshot.
   */
  renderFace?: ChronosphereFaceRenderer<TDetail>;
  renderDetail?: ChronosphereDetailRenderer<TDetail>;
  /** The archive's words, for an app that localises them. */
  labels?: Partial<ChronosphereLabels>;
  /** Where the present page sat on screen, in viewport px; it lifts off from there. */
  originRect?: Readonly<{ x: number; y: number; width: number; height: number }>;
  className?: string;
  style?: CSSProperties;
}

/** Lion needed two pages side by side; narrower than this, the versions layout is the stack. */
const VERSIONS_MINIMUM_WIDTH = 760;
const DEFAULT_FACE_WIDTH = 800;

interface CardGeometry {
  readonly width: number;
  readonly height: number;
  /** Centre of the stack's front card, in px from the archive's top-left. */
  readonly stackX: number;
  readonly stackY: number;
  /** Centre of the present page in the versions layout. */
  readonly presentX: number;
}

/** Sizes a card to its subject's page within the room the layout leaves it. */
function cardGeometry(shape: ChronosphereCardShape, viewport: { width: number; height: number }, twoPane: boolean): CardGeometry {
  const { width, height } = viewport;
  const landscape = width >= VERSIONS_MINIMUM_WIDTH && width >= height;
  // Two panes share the width between the rail and each other; the stack leaves headroom for
  // the cards receding above the front one.
  const roomWidth = twoPane ? width * 0.34 : width * (landscape ? 0.46 : 0.74);
  const roomHeight = Math.min(height - 220, twoPane ? height * 0.60 : height * (landscape ? 0.60 : 0.53));
  const cardHeight = Math.max(80, Math.min(roomHeight, roomWidth / shape.aspectRatio));
  return {
    width: cardHeight * shape.aspectRatio, height: cardHeight,
    stackX: twoPane ? width * 0.655 : width / 2, stackY: height * 0.55,
    presentX: width * 0.285,
  };
}

export interface ChronosphereTravelImpulse {
  id: string | number;
  direction: "past" | "present";
  intensity?: number;
  durationMs?: number;
}

export interface ChronospherePushButtonProps extends PropsWithChildren<{
  tone?: "dark";
  disabled?: boolean;
  className?: string;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  "aria-label"?: string;
}> {}

/**
 * The archive view needs only timing and reduced-motion capabilities. Keeping
 * this port narrow lets any runtime-owned presenter supply it without handing
 * a product view the rest of the runtime's browser/storage authority.
 */
export interface ChronospherePlatformPort {
  matchMedia(query: string): {
    readonly matches: boolean;
    subscribe(listener: (matches: boolean) => void): () => void;
    dispose(): void;
  };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
}

/** Stable, static vortex tuning — hoisted so the FX layer never reconfigures on nav. */
const CHRONOSPHERE_VORTEX_OVERRIDES = {
  core: { anchorY: 0.15, glowRadius: 0.16 },
  swirl: { screenScale: 0.82 }
} as const;

/** One-frame reveal ceiling; scheduling remains owned by the injected platform port. */
const CHRONOSPHERE_ENTRY_FALLBACK_MS = 32;
function rgb(tint: readonly [number, number, number] = [0.31, 1, 0.85], alpha = 1): string {
  const to255 = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
  return `rgba(${to255(tint[0])}, ${to255(tint[1])}, ${to255(tint[2])}, ${alpha})`;
}

function prefersReducedMotion(environment: ChronospherePlatformPort): boolean {
  const media = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const matches = media.matches;
  media.dispose();
  return matches;
}

/** Faux phone status bar that evokes the Time Machine receding-window stack. */
function CardStatusBar({ entry }: { entry: ChronosphereVersion }) {
  return (
    <div className="chronosphere-card-statusbar">
      <span className="chronosphere-card-clock">{entry.dateLabel}</span>
      <span className="chronosphere-card-status-right" aria-hidden="true">
        <span className="chronosphere-signal">
          <i /><i /><i /><i />
        </span>
        <span className="chronosphere-version-chip">{entry.displayLabel}</span>
        <span className="chronosphere-battery" />
      </span>
    </div>
  );
}

function DocumentFaceContent<TDetail>({ entry, renderer, active, detail, pane, faceWidth, aspectRatio, width, fallbackImage }: {
  entry: ChronosphereVersion<TDetail>; renderer: ChronosphereFaceRenderer<TDetail>; active: boolean; detail: boolean;
  pane: "present" | "past"; faceWidth: number; aspectRatio: number; width: number; fallbackImage?: string;
}) {
  const content = renderer(entry, { active, detail, pane });
  if (content === null || content === undefined || content === false) return fallbackImage ?
    <span className="chronosphere-card-shot" aria-hidden="true" style={{ backgroundImage: `url(${fallbackImage})` }} /> : <span className="chronosphere-card-surface" aria-hidden="true" />;
  return <span className="chronosphere-card-face" inert aria-hidden="true" style={{ width: faceWidth, height: faceWidth / aspectRatio, transform: `scale(${width / faceWidth})` }}>{content}</span>;
}
const DocumentFace = memo(DocumentFaceContent) as typeof DocumentFaceContent;

export function ChronosphereStage<TDetail = unknown>({
  environment,
  DetailFocusScopeComponent,
  PushButtonComponent,
  subject = { ...defaultChronosphereSubject, entries: [] },
  entries,
  onExit,
  onRestore,
  originImage,
  curtainImage,
  preparedImages,
  immediate = false,
  renderFace,
  renderDetail,
  labels: labelOverrides,
  originRect,
  className = "",
  style
}: ChronosphereStageProps<TDetail>) {
  const curtainShot = curtainImage;
  const labels = { ...defaultChronosphereLabels, ...labelOverrides };
  const sorted = useMemo(
    () => sortChronosphereEntriesNewestFirst(entries ?? subject.entries),
    [entries, subject.entries]
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      setViewport((current) => current && current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    // The element's own window observes it: no browser global, and the right realm in a frame.
    const Observer = node.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return undefined;
    const observer = new Observer(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Versions puts the present page beside the stack, which then holds only the past.
  const present = subject.layout === "versions" && (viewport?.width ?? 0) >= VERSIONS_MINIMUM_WIDTH
    ? sorted.find((entry) => entry.isCurrent) : undefined;
  const past = useMemo(() => sorted.filter((entry) => !entry.isCurrent), [sorted]);
  const twoPane = Boolean(present) && past.length > 0;
  const browsed = twoPane ? past : sorted;
  const shape = subject.card;
  const geometry = shape && viewport ? cardGeometry(shape, viewport, twoPane) : null;
  const faceWidth = shape?.faceWidth ?? DEFAULT_FACE_WIDTH;
  const [detailOpen, setDetailOpen] = useState(false);
  const [currentElement, setCurrentElement] = useState<HTMLElement | null>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [reflectionReady, setReflectionReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion(environment));
  // The full foreground recedes while cards rise, then returns before onExit.
  const [stage, setStage] = useState<"entering" | "open" | "leaving">(
    immediate || prefersReducedMotion(environment) ? "open" : "entering"
  );
  const [restoredId, setRestoredId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const navLockRef = useRef(0);
  const detailTitleId = useId();
  const detailBodyId = useId();
  useChronosphereMotion(containerRef, !reducedMotion && !immediate, stage, onExit);

  const travel = useChronosphereTravel(browsed.length, !reducedMotion && !immediate && stage === "open", environment);
  const previousBrowsed = useRef(browsed);
  useLayoutEffect(() => {
    if (previousBrowsed.current === browsed) return;
    const selectedId = previousBrowsed.current[Math.round(travel.position)]?.id;
    previousBrowsed.current = browsed;
    if (selectedId) travel.jumpTo(Math.max(0, browsed.findIndex(entry => entry.id === selectedId)));
  }, [browsed, travel.position, travel.jumpTo]);
  const goTo = useCallback((next: number) => { if (stage !== "open") return; setDetailOpen(false); travel.goTo(next); }, [stage, travel.goTo]);
  const step = useCallback((delta: number) => { if (stage !== "open") return; setDetailOpen(false); travel.step(delta); }, [stage, travel.step]);

  const requestExit = useCallback(() => {
    setStage((current) => (current === "leaving" ? current : "leaving"));
  }, []);

  useEffect(() => {
    setReflectionReady(false);
    if (stage !== "open") return;
    if (reducedMotion || immediate) { setReflectionReady(true); return; }
    const timer = environment.setTimeout(() => setReflectionReady(true), 950);
    return () => environment.clearTimeout(timer);
  }, [stage, reducedMotion, immediate, environment]);

  // Entry waits one app-owned frame; AnimationFX completion owns the exit.
  useEffect(() => {
    if (stage === "entering") {
      const raf = environment.requestAnimationFrame(() => setStage("open"));
      const fallback = environment.setTimeout(
        () => setStage("open"),
        CHRONOSPHERE_ENTRY_FALLBACK_MS
      );
      return () => {
        environment.cancelAnimationFrame(raf);
        environment.clearTimeout(fallback);
      };
    }
    return undefined;
  }, [environment, stage, onExit]);

  useEffect(() => {
    const media = environment.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const unsubscribe = media.subscribe((matches) => setReducedMotion(matches));
    return () => {
      unsubscribe();
      media.dispose();
    };
  }, [environment]);

  useEffect(() => {
    const node = containerRef.current;
    if (node) node.focus({ preventScroll: true });
  }, []);

  // Move focus into the detail dialog when it opens; restore it on close.
  useEffect(() => {
    if (detailOpen) {
      detailRef.current?.focus({ preventScroll: true });
    } else {
      containerRef.current?.focus({ preventScroll: true });
    }
  }, [detailOpen]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (stage !== "open" && event.key !== "Escape") return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        step(-1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        step(1);
        break;
      case "Home":
        event.preventDefault();
        goTo(0);
        break;
      case "End":
        event.preventDefault();
        goTo(browsed.length - 1);
        break;
      case "Enter":
      case " ":
        // Only the application root toggles detail — let focused cards/ticks
        // keep their own native button activation.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          setDetailOpen((open) => !open);
        }
        break;
      case "Escape":
        event.preventDefault();
        if (detailOpen) setDetailOpen(false);
        else requestExit();
        break;
      default:
        break;
    }
  }, [stage, detailOpen, goTo, requestExit, browsed.length, step]);

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (stage !== "open") return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - navLockRef.current < 260) return;
    if (Math.abs(event.deltaY) < 8) return;
    navLockRef.current = now;
    step(event.deltaY > 0 ? 1 : -1);
  }, [stage, step]);

  const shownIndex = Math.max(0, Math.min(browsed.length - 1, Math.round(travel.position)));
  const front = { x: geometry?.stackX ?? (viewport?.width ?? 1000) / 2, y: geometry?.stackY ?? (viewport?.height ?? 800) * 0.58 };
  const core = { x: (viewport?.width ?? 1000) * 0.5, y: (viewport?.height ?? 800) * CHRONOSPHERE_VORTEX_OVERRIDES.core.anchorY };
  // Keep real pages throughout the visible archive. Beyond 24 planes they are
  // subpixel; the decorative tail begins only after the actual oldest version.
  const slots: ChronosphereDepthSlot<TDetail>[] = [];
  for (let index = Math.max(0, Math.floor(travel.position) - 1); index < Math.min(browsed.length, Math.floor(travel.position) + 24); index++) {
    const depth = index - travel.position;
    slots.push({ entry: browsed[index], index, relativeIndex: depth, translateY: 0, translateZ: 0, scale: 1,
      opacity: depth < 0 ? Math.max(0, 1 + depth) : Math.exp(-Math.max(0, depth - 3) * 0.19), blur: 0, zIndex: 1000 - Math.floor(depth),
      isActive: index === shownIndex, isPlaceholder: depth > 6 });
  }
  const tailStart = Math.max(1, browsed.length - travel.position);
  const backFrames = Array.from({ length: Math.max(0, 28 - Math.ceil(tailStart)) }, (_, k) => ({ key: `tail-${k}`, depth: tailStart + k }));
  const depthTransform = (depth: number, introY = 0) => {
    const projected = projectChronosphereDepth(depth, front, core);
    return `translate(-50%, -50%) translate3d(${projected.x - front.x}px, ${projected.y - front.y + introY}px, 0) scale(${projected.scale})`;
  };

  const activeEntry = browsed[shownIndex];
  const geometryStyle = (x: number, y: number): CSSProperties => geometry ? {
    left: `${x}px`, top: `${y}px`, width: `${geometry.width}px`, height: `${geometry.height}px`, aspectRatio: "auto",
    borderRadius: `${shape?.cornerRadius ?? 22}px`,
  } : {};
  // The present page on its way in or out: its own card, moved and scaled onto the page as it
  // sat in the window. Without a known origin it rises from below, as before.
  const offOrigin = (x: number, y: number, rise: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!originRect || !geometry || !bounds) return `translate(-50%, -50%) translate3d(0, ${rise}px, 0)`;
    const dx = originRect.x - bounds.left + originRect.width / 2 - x;
    const dy = originRect.y - bounds.top + originRect.height / 2 - y;
    return `translate(-50%, -50%) translate3d(${dx}px, ${dy}px, 0) scale(${originRect.width / geometry.width})`;
  };
  const away = (stage === "entering" || stage === "leaving") && !reducedMotion && !immediate;
  const face = (entry: ChronosphereVersion<TDetail>, context: ChronosphereFaceContext) => geometry && renderFace && shape ?
    <DocumentFace entry={entry} renderer={renderFace} active={context.active} detail={context.detail} pane={context.pane}
      faceWidth={faceWidth} aspectRatio={shape.aspectRatio} width={geometry.width}
      fallbackImage={entry.isCurrent ? originImage : entry.screenshotSrc} /> : null;
  const entering = stage === "entering";
  const motion = !reducedMotion && !immediate;
  const restoring = stage === "leaving" && restoredId !== null;

  const renderCard = (slot: ChronosphereDepthSlot<TDetail>) => {
    const { entry, isActive, isPlaceholder } = slot;
    // A captured live view (e.g. the Webspring dial) shows clean, as the window
    // itself — no overlaid chrome, Leopard-style. Details appear only on click.
    const cardShot = entry.isCurrent ? originImage : entry.screenshotSrc;
    const drawn = face(entry, { active: isActive, detail: !isPlaceholder, pane: entry.isCurrent ? "present" : "past" });
    const showShot = Boolean(cardShot);
    // During the entrance the live subject (front card) rises up into the stack
    // from below, like the Leopard window flying into the Time Machine vortex.
    const introY = entering && motion ? (isActive ? 120 : 60) : 0;
    // The stack's present card lifts off the window too, when its page's place is known.
    const restoredCard = restoring && entry.id === restoredId;
    const lifts = Boolean(originRect && geometry) && (restoredCard || (entry.isCurrent && !restoring));
    const transform = away && (restoredCard || (lifts && isActive))
      ? offOrigin(geometry?.stackX ?? front.x, geometry?.stackY ?? front.y, 0)
      : depthTransform(slot.relativeIndex, introY);
    const cardStyle: CSSProperties = {
      transform,
      opacity: restoring && entry.isCurrent ? 0 : entering && motion && !isActive ? 0 : slot.opacity,
      zIndex: restoredCard ? 1002 : slot.zIndex,
      filter: slot.blur > 0 ? `blur(${slot.blur}px)` : undefined,
      ...(geometry ? geometryStyle(geometry.stackX, geometry.stackY) : {}),
      "--chronosphere-tint": rgb(entry.tint),
      "--chronosphere-tint-soft": rgb(entry.tint, 0.22),
      "--chrono-depth-light": `rgba(205, 230, 215, ${Math.min(0.5, Math.max(0, slot.relativeIndex - 2) * 0.045)})`
    } as CSSProperties;

    return (
      <button
        key={entry.id}
        ref={isActive ? setSelectedElement : undefined}
        type="button"
        className="chronosphere-card"
        data-travel-owned="true"
        data-depth={slot.relativeIndex.toFixed(3)}
        data-active={isActive ? "true" : "false"}
        data-status={entry.isCurrent ? "current" : "saved"}
        data-material={shape?.material}
        data-origin-lift={lifts ? "true" : undefined}
        data-restore-flight={restoredCard ? "true" : undefined}
        style={cardStyle}
        aria-label={`${entry.title}, ${entry.dateLabel}`}
        aria-current={isActive ? "true" : undefined}
        tabIndex={isActive ? 0 : -1}
        onClick={() => (isActive && !travel.travelling ? setDetailOpen((open) => !open) : goTo(slot.index))}
      >
        {drawn ?? (showShot ? (
          <span
            className="chronosphere-card-shot"
            aria-hidden="true"
            style={{ backgroundImage: `url(${cardShot})` }}
          />
        ) : (
          <>
            <span className="chronosphere-card-surface" aria-hidden="true" />
            <CardStatusBar entry={entry} />
            {isPlaceholder ? null : (
              <span className="chronosphere-card-body">
                <span className="chronosphere-card-label">{entry.displayLabel}</span>
                <span className="chronosphere-card-title">{entry.title}</span>
                {isActive ? <span className="chronosphere-card-summary">{entry.summary}</span> : null}
                {entry.isCurrent ? (
                  <span className="chronosphere-card-live">{labels.present}</span>
                ) : null}
              </span>
            )}
          </>
        ))}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      className={["chronosphere", className].filter(Boolean).join(" ")}
      style={style}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-stage={stage}
      data-travelling={travel.travelling ? "true" : "false"}
      data-position={travel.position.toFixed(3)}
      data-target={travel.target}
      role="application"
      aria-label={`Chronosphere — ${subject.label}`}
      data-layout={twoPane ? "versions" : "stack"}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
    >
      <VortexEffect
        preparedImages={preparedImages}
        active={!detailOpen}
        eager
        preset="chronosphere"
        presetOverrides={CHRONOSPHERE_VORTEX_OVERRIDES}
        reducedMotion={reducedMotion ? "static" : "system"}
        className="chronosphere-vortex"
        travelImpulse={travel.journey}
      />

      <div className="chronosphere-scrim" aria-hidden="true" />

      {/* Keep the same selected DOM node while its return crosses the foreground. */}
      <div className="chronosphere-stage" inert={stage !== "open"} style={{ zIndex: restoring ? 61 : undefined }} data-restoring={restoring ? "true" : undefined}>
        {backFrames.map((frame) => (
          <div
            key={frame.key}
            className="chronosphere-backframe"
            data-depth={frame.depth.toFixed(3)}
            data-travel-owned="true"
            aria-hidden="true"
            data-material={shape?.material}
            style={{
              transform: depthTransform(frame.depth),
              opacity: entering && motion ? 0 : Math.exp(-Math.max(0, frame.depth - 3) * 0.19),
              "--chrono-depth-light": `rgba(205, 230, 215, ${Math.min(0.5, Math.max(0, frame.depth - 2) * 0.045)})`,
              zIndex: 800 - Math.floor(frame.depth),
              ...(geometry ? geometryStyle(geometry.stackX, geometry.stackY) : {}),
            } as CSSProperties}
          />
        ))}
        {slots.map(renderCard)}
      </div>

      <ChronosphereTimeline entries={browsed} activeIndex={shownIndex} onSelect={goTo} reducedMotion={reducedMotion}
        visible={stage === "open"} label={labels.timeline} />

      {/* Detail overlay for the active version */}
      {detailOpen && activeEntry ? (
        <DetailFocusScopeComponent scopeId={`chronosphere:version-detail:${activeEntry.id}`}>
        <div
          className="chronosphere-detail"
          role="dialog"
          aria-modal="true"
          aria-labelledby={detailTitleId}
          aria-describedby={detailBodyId}
          ref={detailRef}
          tabIndex={-1}
        >
          <div className="chronosphere-detail-card" style={{ "--chronosphere-tint": rgb(activeEntry.tint) } as CSSProperties}>
            {renderDetail ? renderDetail(activeEntry, { titleId: detailTitleId, bodyId: detailBodyId }) : <>
            <header className="chronosphere-detail-head">
              <h2 className="chronosphere-detail-title" id={detailTitleId}>{activeEntry.title}</h2>
              <span className="chronosphere-detail-date">{[activeEntry.displayLabel, activeEntry.dateLabel].filter(Boolean).join(" · ")}</span>
            </header>
            <p className="chronosphere-detail-body" id={detailBodyId}>{activeEntry.summary}</p>
            </>}
            <button type="button" className="chronosphere-detail-close" onClick={() => setDetailOpen(false)}>
              {labels.close}
            </button>
          </div>
        </div>
        </DetailFocusScopeComponent>
      ) : null}

      {twoPane && present && geometry ? <div className="chronosphere-pane-caption" style={{ left: geometry.presentX, top: geometry.stackY + geometry.height / 2 + 16 }}>
        <strong>{labels.now}</strong><span>{present.dateLabel}</span>
      </div> : null}
      {activeEntry && geometry ? <div className="chronosphere-pane-caption" style={{ left: geometry.stackX, top: geometry.stackY + geometry.height / 2 + 16 }}>
        <strong>{activeEntry.dateLabel}</strong><span>{activeEntry.summary}</span>
      </div> : null}
      <div className="chronosphere-controls chronosphere-navigation" inert={stage !== "open"}
        style={{ opacity: stage === "open" ? 1 : 0, ...(twoPane && geometry ? {
          left: `max(${geometry.stackX + geometry.width / 2 + 12}px, calc(100% - clamp(110px, 12vw, 240px) - 122px))`, right: "auto",
        } : {}) }} role="group" aria-label={labels.timeline}>
        <button type="button" className="chronosphere-time-arrow chronosphere-time-arrow-past" aria-label="Previous significant change"
          title="Previous significant change" disabled={travel.target >= browsed.length - 1}
          onClick={() => goTo(significantChronosphereIndex(browsed, travel.target, 1))}>
          <ChronosphereArrow direction="past" />
        </button>
        <button type="button" className="chronosphere-time-arrow chronosphere-time-arrow-present" aria-label="Next significant change"
          title="Next significant change" disabled={travel.target <= 0}
          onClick={() => goTo(significantChronosphereIndex(browsed, travel.target, -1))}>
          <ChronosphereArrow direction="present" />
        </button>
      </div>
      <div className="chronosphere-controls chronosphere-floor" inert={stage !== "open"} style={{ opacity: stage === "open" ? 1 : 0 }} role="group" aria-label={labels.controls}>
        <div className="chronosphere-floor-glass" aria-hidden="true">
          <ChronosphereReflection currentElement={currentElement} selectedElement={selectedElement}
            active={stage === "open"} settledKey={reflectionReady && !travel.travelling ? `${activeEntry?.id}:${viewport?.width}:${viewport?.height}` : null}
            style={{ position: "absolute", inset: 0, height: "100%" }} />
        </div>
        <PushButtonComponent tone="dark" className="chronosphere-floor-action chronosphere-floor-exit" onClick={requestExit}>{twoPane ? labels.done : labels.exit}</PushButtonComponent>
        <button className="chronosphere-floor-date" type="button" onClick={() => goTo(0)} aria-label={labels.jumpToPresent}>
          <strong>{activeEntry?.dateLabel ?? labels.now}</strong>
          <span>{travel.travelling ? `${shownIndex + 1} / ${browsed.length}` : activeEntry?.displayLabel ?? activeEntry?.title ?? ""}</span>
        </button>
        {onRestore ? <PushButtonComponent tone="dark" className="chronosphere-floor-action chronosphere-floor-restore"
          disabled={!activeEntry || activeEntry.isCurrent || travel.travelling}
          onClick={() => {
            if (!activeEntry || activeEntry.isCurrent || travel.travelling || stage !== "open") return;
            onRestore(activeEntry);
            setRestoredId(activeEntry.id);
            requestExit();
          }}>{labels.restore}</PushButtonComponent>
          : <PushButtonComponent tone="dark" className="chronosphere-floor-action chronosphere-floor-restore" onClick={() => setDetailOpen(open => !open)}>{labels.details}</PushButtonComponent>}
      </div>

      {/* The complete launching foreground recedes down and into the galaxy,
          then returns to its original plane once on exit. */}
      {motion ? (
        <div
          className="chronosphere-curtain"
          aria-hidden="true"
          data-captured={curtainShot ? "true" : "false"}
          // The window glides straight down out of the way, full size, as Lion's did; depth comes
          // from what lifts off it, not from shrinking it.
          style={{ transform: stage === "open" ? "translate3d(0, 104%, 0)" : "translate3d(0, 0, 0)", ...(curtainShot ? { backgroundImage: `url(${curtainShot})` } : {}) }}
        />
      ) : null}

      {twoPane && present && geometry ? (
        // The present stands flat on the left, as Lion's live document did beside its past. It is
        // its own layer above the window, so the page is seen lifting off as the window glides away.
        <div
          className="chronosphere-card chronosphere-present"
          ref={setCurrentElement}
          data-origin-lift={originRect ? "true" : undefined}
          role="img"
          aria-label={`${labels.now}, ${present.title}`}
          data-active="true"
          data-status="current"
          data-material={shape?.material}
          style={{
            ...geometryStyle(geometry.presentX, geometry.stackY),
            transform: away && !restoring ? offOrigin(geometry.presentX, geometry.stackY, 120) : "translate(-50%, -50%) translate3d(0, 0, 0)",
            opacity: restoring || (away && !originRect) ? 0 : 1,
            zIndex: 1001,
          }}
        >
          {face(present, { active: true, detail: true, pane: "present" }) ?? (originImage
            ? <span className="chronosphere-card-shot" aria-hidden="true" style={{ backgroundImage: `url(${originImage})` }} />
            : <span className="chronosphere-card-surface" aria-hidden="true" />)}
        </div>
      ) : null}
    </div>
  );
}
