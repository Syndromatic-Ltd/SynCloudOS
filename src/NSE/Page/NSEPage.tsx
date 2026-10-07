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
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import { getNSEPageTearStubOutline, isNSEPageBookSurfaceActive, resolveNSEPageBookStripGeometry } from "./nsePageGeometry";
import { useNSEPage } from "./useNSEPage";
import { useNSEPageCurlSurface } from "./useNSEPageCurlSurface";
import type { NSEPageHandle, NSEPageProps } from "./nsePageTypes";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/** The most torn stubs a page keeps at its binding. */
const TEAR_STUB_LIMIT = 6;

/** A torn sheet's stub, left bound at the page's binding. */
interface TearStub {
  readonly key: string | number;
  readonly outline: string;
  readonly edge: string;
  readonly colour: string;
}

function svgPath(points: ReadonlyArray<{ x: number; y: number }>, close: boolean) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ") + (close ? " Z" : "");
}

export const NSEPage = forwardRef<NSEPageHandle, NSEPageProps>(function NSEPage(
  {
    children,
    front,
    back,
    inside,
    dogEar,
    dogEarLabel = "Peel the page",
    backGhost = false,
    curlUnderside = "print-through",
    tearStubs = true,
    turnSurface,
    as: Component = "div",
    preset,
    presetOverrides,
    progress,
    defaultProgress,
    open,
    defaultOpen,
    mode,
    edge,
    corner,
    direction,
    torn,
    disabled = false,
    interactive,
    durationMs,
    reducedMotion,
    className = "",
    sheetClassName = "",
    frontClassName = "",
    backClassName = "",
    insideClassName = "",
    shadowClassName = "",
    style,
    sheetStyle,
    frontStyle,
    backStyle,
    insideStyle,
    onProgressChange,
    onPhaseChange,
    onOpenChange,
    onTurnStart,
    onTurnEnd,
    onTear,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    role,
    ...props
  }: NSEPageProps,
  ref
) {
  // The curl surface is set up after the page hook it serves; turns reach it through this.
  const awaitSurfaceRef = useRef<() => Promise<void> | null>(() => null);
  const awaitSurface = useCallback(() => awaitSurfaceRef.current(), []);
  const surfacePendingRef = useRef<() => boolean>(() => false);
  const surfacePending = useCallback(() => surfacePendingRef.current(), []);
  const page = useNSEPage({
    preset,
    presetOverrides,
    progress,
    defaultProgress,
    open,
    defaultOpen,
    mode,
    edge,
    corner,
    direction,
    torn,
    disabled,
    interactive,
    durationMs,
    reducedMotion,
    onProgressChange,
    onPhaseChange,
    onOpenChange,
    onTurnStart,
    onTurnEnd,
    onTear,
    awaitSurface,
    surfacePending
  });
  const isCurl = page.geometry.mode === "curl";
  // A tear rolls its sheet off the page as a curl does, drawn by the same surface.
  const isTear = page.geometry.mode === "tear";
  const isRolled = isCurl || isTear;
  const frontFaceRef = useRef<HTMLDivElement>(null);
  const curlFlapRef = useRef<HTMLDivElement>(null);
  const insideRef = useRef<HTMLDivElement>(null);
  const curlSurface = useNSEPageCurlSurface({
    enabled: isRolled && !page.geometry.reduced,
    geometry: page.geometry,
    motion: page.preset.motion,
    frontRef: frontFaceRef,
    // A torn sheet's underside is its own paper, its print showing through.
    backRef: isTear ? frontFaceRef : curlFlapRef,
    insideRef,
    underside: isTear ? "print-through" : curlUnderside,
    subscribeFrame: page.subscribeFrame
  });
  awaitSurfaceRef.current = curlSurface.whenReady;
  surfacePendingRef.current = curlSurface.pending;
  const isBookTurn = page.geometry.bookTurn;
  const frontContent = front ?? children;
  const insideContent = inside;
  // The flap shows explicit `back` content, or, when asked for, a faint
  // mirrored ghost of the front read through the paper. A ReactNode ghost
  // stands in for the front so heavy fronts don't mount twice.
  const ghostContent = backGhost === true ? frontContent : backGhost === false || backGhost == null ? null : backGhost;
  const flapContent = back ?? (ghostContent != null ? (
    <div className="nse-page__curl-ghost" aria-hidden="true">
      {ghostContent}
    </div>
  ) : null);
  const insideVisible = page.geometry.insideInteractive;
  const showDogEar = isCurl && !disabled && (dogEar ?? page.preset.interaction.dogEar ?? true);
  const dogEarSize = page.preset.interaction.dogEarSizePx ?? 72;
  const openProgress = page.preset.interaction.openProgress ?? 1;
  const restProgress = page.preset.motion.restProgress ?? 0.06;
  const isOpen = page.geometry.progress >= openProgress * 0.98;
  const dogEarActive = page.geometry.dogEarOpacity > 0.05;
  const peekDelta = page.preset.motion.peekDelta ?? 0.045;
  // Past the hover peek the page is genuinely curling: it elevates above
  // surrounding chrome and the underside ghost wakes up.
  const isCurling = isTear
    ? !page.geometry.reduced && (page.geometry.progress > 0.001 || page.geometry.torn)
    : isCurl && !page.geometry.reduced && page.geometry.progress > restProgress + peekDelta + 0.03;
  const bookSurfaceActive = turnSurface != null &&
    (page.geometry.edge === "left" || page.geometry.edge === "right") &&
    isNSEPageBookSurfaceActive(page.geometry);
  const bookStrips = useMemo(() => {
    if (!bookSurfaceActive || turnSurface == null || (page.geometry.edge !== "left" && page.geometry.edge !== "right")) {
      return [];
    }
    return resolveNSEPageBookStripGeometry({
      progress: page.geometry.progress,
      edge: page.geometry.edge,
      direction: page.geometry.direction,
      size: page.geometry.size,
      stripCount: turnSurface.strips,
      rollWidth: page.preset.motion.rollWidth
    });
  }, [bookSurfaceActive, page.geometry.direction, page.geometry.edge, page.geometry.progress, page.geometry.size, page.preset.motion.rollWidth, turnSurface]);

  useImperativeHandle(ref, () => page.handle, [page.handle]);

  // Each sheet torn away leaves its ragged stub at the binding, over the
  // sheets beneath, as on a pad: the oldest on top.
  const [stubs, setStubs] = useState<readonly TearStub[]>([]);
  const stubShadowId = `nse-page-stub-${useId().replace(/:/g, "")}`;
  const tornPose = isTear && page.geometry.torn ? page.geometry.tear : null;
  const tornKey = tornPose && tearStubs ? page.snapshot.turnId : null;
  const tornPoseRef = useRef(tornPose);
  tornPoseRef.current = tornPose;
  useLayoutEffect(() => {
    const pose = tornPoseRef.current;
    if (tornKey === null || !pose) return;
    const { outline, edge } = getNSEPageTearStubOutline(pose, page.geometry.size);
    const face = frontFaceRef.current ? getComputedStyle(frontFaceRef.current).backgroundColor : "";
    const colour = curlSurface.stubColour(pose.binding) ?? (face && !/rgba\([^)]*,\s*0\)|transparent/.test(face) ? face : "#fffdf5");
    setStubs((current) => current.some((stub) => stub.key === tornKey) ? current : [
      ...current.slice(-(TEAR_STUB_LIMIT - 1)),
      { key: tornKey, outline: svgPath(outline, true), edge: svgPath(edge, false), colour }
    ]);
    // Only a new tear adds a stub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tornKey]);
  // The paper a tear's stub is made of, for the 2D tear's own stub.
  const [tearPaper, setTearPaper] = useState<string | null>(null);
  const tearStarting = isTear && page.geometry.phase !== "idle" && !page.geometry.torn;
  useLayoutEffect(() => {
    if (tearStarting) setTearPaper(curlSurface.stubColour(page.geometry.edge));
    // Read once as each tear starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tearStarting]);
  // Stubs are drawn at the size they tore at; a page that changes size, or
  // stops tearing, starts afresh.
  const { width: pageWidth, height: pageHeight } = page.geometry.size;
  useEffect(() => {
    setStubs((current) => current.length ? [] : current);
  }, [pageWidth, pageHeight, isTear, tearStubs]);

  const runPointerHandler = (
    userHandler: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined,
    nseHandler: ((event: ReactPointerEvent<HTMLElement>) => void) | undefined
  ) => (event: ReactPointerEvent<HTMLElement>) => {
    userHandler?.(event);
    if (!event.defaultPrevented) nseHandler?.(event);
  };

  const Root = Component;

  return (
    <Root
      {...props}
      ref={page.rootRef}
      role={role}
      className={classes("nse-page", page.preset.className, className)}
      data-nse-page="true"
      data-mode={page.geometry.mode}
      data-edge={page.geometry.edge}
      data-corner={page.geometry.corner}
      data-axis={page.geometry.axis}
      data-direction={page.geometry.direction}
      data-hinge-edge={page.geometry.hingeEdge}
      data-projection={page.geometry.projection}
      data-phase={page.geometry.phase}
      data-progress={page.geometry.progress.toFixed(3)}
      data-revealed={insideVisible ? "true" : "false"}
      data-curling={isCurling ? "true" : "false"}
      data-reduced={page.geometry.reduced ? "true" : "false"}
      data-torn={page.geometry.torn ? "true" : "false"}
      data-interactive={page.interactive ? "true" : "false"}
      data-controlled={progress != null || open != null ? "true" : "false"}
      data-book-turn={isBookTurn ? "true" : "false"}
      data-book-surface={bookSurfaceActive ? "true" : "false"}
      data-curl-renderer={isRolled && !page.geometry.reduced ? curlSurface.renderer : undefined}
      data-curl-surface={curlSurface.active ? "webgl" : "css"}
      data-curl-ready={isRolled ? (curlSurface.ready ? "true" : "false") : undefined}
      style={page.getStyle(tearPaper ? { ...style, "--nse-page-tear-paper": tearPaper } as CSSProperties : style)}
      onPointerDown={runPointerHandler(onPointerDown, page.pointerHandlers.onPointerDown)}
      onPointerMove={runPointerHandler(onPointerMove, page.pointerHandlers.onPointerMove)}
      onPointerUp={runPointerHandler(onPointerUp, page.pointerHandlers.onPointerUp)}
      onPointerCancel={runPointerHandler(onPointerCancel, page.pointerHandlers.onPointerCancel)}
      onLostPointerCapture={runPointerHandler(onLostPointerCapture, page.pointerHandlers.onLostPointerCapture)}
    >
      {insideContent != null ? (
        <div
          ref={insideRef}
          className={classes("nse-page__inside", insideClassName)}
          data-interactive={insideVisible ? "true" : "false"}
          aria-hidden={insideVisible ? undefined : true}
          style={insideStyle}
        >
          {insideContent}
        </div>
      ) : null}
      <div className={classes("nse-page__cast-shadow", shadowClassName)} aria-hidden="true"
        style={bookSurfaceActive ? {
          "--nse-page-book-shadow-x": `${page.geometry.edge === "right"
            ? Math.max(...bookStrips.map(strip => strip.outer.x))
            : Math.min(...bookStrips.map(strip => strip.outer.x))}px`,
          "--nse-page-book-shadow-opacity": Math.sin(Math.PI * page.geometry.progress) * 0.3
        } as CSSProperties : undefined}
      />
      {bookSurfaceActive && turnSurface != null ? (
        <div className="nse-page__book-surface" aria-hidden="true">
          {bookStrips.map((strip) => (
            <div
              key={strip.chainIndex}
              className="nse-page__book-strip"
              data-hinge={page.geometry.hingeEdge}
              style={{
                width: strip.width,
                transformOrigin: strip.transformOrigin,
                transform: strip.transform
              }}
            >
              <div
                className="nse-page__book-strip-face nse-page__book-strip-face--front"
                style={{
                  width: strip.renderWidth,
                  transform: strip.frontFaceTransform,
                  backgroundImage: `url("${turnSurface.front}")`,
                  backgroundPosition: `${strip.frontBackgroundOffsetX}px 0px`,
                  backgroundSize: `${page.geometry.size.width}px ${page.geometry.size.height}px`
                }}
              />
              <div
                className="nse-page__book-strip-face nse-page__book-strip-face--back"
                style={{
                  width: strip.renderWidth,
                  transform: strip.backFaceTransform,
                  backgroundImage: `url("${turnSurface.back}")`,
                  backgroundPosition: `${strip.backBackgroundOffsetX}px 0px`,
                  backgroundSize: `${page.geometry.size.width}px ${page.geometry.size.height}px`
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className={classes("nse-page__sheet", sheetClassName)} aria-hidden={bookSurfaceActive ? true : undefined} style={sheetStyle}>
        <div className="nse-page__backstop" aria-hidden="true" />
        <div ref={frontFaceRef} className={classes("nse-page__face", "nse-page__face--front", frontClassName)} style={frontStyle}>
          {frontContent}
        </div>
        {isRolled ? (
          <>
            <div className="nse-page__curl-shadow" aria-hidden="true" />
            <div className="nse-page__curl-carrier" aria-hidden="true" inert>
            <div
              ref={curlFlapRef}
              className={classes("nse-page__face", "nse-page__face--back", "nse-page__curl-flap", backClassName)}
              aria-hidden="true"
              style={backStyle}
            >
              {flapContent}
            </div>
            </div>
          </>
        ) : (
          <div className={classes("nse-page__face", "nse-page__face--back", backClassName)} aria-hidden="true" style={backStyle}>
            {back}
          </div>
        )}
        <div className="nse-page__edge" aria-hidden="true" />
        <div className="nse-page__curl" aria-hidden="true" />
        <div className="nse-page__crease" aria-hidden="true" />
        <div className="nse-page__grain" aria-hidden="true" />
      </div>
      {isTear ? <div className="nse-page__tear-stub" aria-hidden="true" /> : null}
      {isTear && stubs.length ? (
        <svg
          className="nse-page__tear-stubs"
          aria-hidden="true"
          viewBox={`0 0 ${pageWidth} ${pageHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <filter id={stubShadowId} x="-2%" y="-2%" width="104%" height="104%">
              <feDropShadow dx="0" dy="0.4" stdDeviation="0.7" floodColor="#000" floodOpacity="0.3" />
            </filter>
          </defs>
          {[...stubs].reverse().map((stub) => (
            <g key={stub.key} filter={`url(#${stubShadowId})`}>
              <path d={stub.outline} fill={stub.colour} />
              {/* The pale fibres of the torn edge. */}
              <path d={stub.edge} fill="none" stroke="rgba(255, 255, 255, 0.72)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
      ) : null}
      {isRolled && !page.geometry.reduced ? (
        <canvas
          ref={curlSurface.canvasRef}
          className="nse-page__curl-canvas"
          aria-hidden="true"
          style={{
            left: -curlSurface.margin.left,
            top: -curlSurface.margin.top,
            width: `calc(100% + ${curlSurface.margin.left + curlSurface.margin.right}px)`,
            height: `calc(100% + ${curlSurface.margin.top + curlSurface.margin.bottom}px)`
          }}
        />
      ) : null}
      {showDogEar ? (
        <button
          type="button"
          className="nse-page__dogear"
          data-corner={page.geometry.corner}
          data-active={dogEarActive ? "true" : "false"}
          aria-label={dogEarLabel}
          aria-expanded={isOpen}
          style={{ width: dogEarSize, height: dogEarSize }}
          onPointerEnter={page.dogEarHandlers.onPointerEnter}
          onPointerLeave={page.dogEarHandlers.onPointerLeave}
          onPointerDown={page.dogEarHandlers.onPointerDown}
          onClick={page.dogEarHandlers.onClick}
        />
      ) : null}
    </Root>
  );
});
