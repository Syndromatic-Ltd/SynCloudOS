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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { LayoutView } from "../NSE/Animation";
import { FocusScope } from "../NSE/NSE";
import { webspringIconSprings } from "./Webspring.transitions";
import type { WebspringFolderPresentationComponent, WebspringFolderPresentationProps } from "./webspringTypes";
import { folderSplitPhaseMachine, type FolderSplitPhase } from "./folderSplitPhaseMachine";
import { nextState } from "../Foundation/internal/StateMachine";

const part = (phase: FolderSplitPhase) => nextState(folderSplitPhaseMachine.definition, phase, "part") ?? phase;
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
  readonly underlay: { readonly image: string | undefined; readonly size: string; readonly colour: string };
  readonly panelHeight: "content" | number;
  readonly notch: boolean;
  readonly edgeShadow: number;
  readonly duration: number;
}

/** Half the base of the underlay pointer cut out of the stage's upper seam. */
const NOTCH_HALF_BASE = 14;
/** How far the pointer projects above the seam. The lower half's matching tab fills it at rest. */
const TRIANGLE_DEPTH = 14;
const SEAM_GAP = 6;
/** Depth of the light caught along each cut edge, inside the stage. */
const EDGE_HIGHLIGHT = 1;
const STAGE_MARGIN = 24;
/** Marks an icon in a clone as the opened folder's own or as part of the backdrop. */
const BACKDROP_ATTRIBUTE = "data-webspring-folder-backdrop";


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
      // Unset means the framework linen, which the stylesheet supplies so the
      // package build can relocate it alongside the consumer's bundle.
      image: underlay.image,
      size: underlay.size ?? "cover",
      colour: underlay.colour ?? "#2b3038",
    }),
    panelHeight,
    notch: Boolean(notch),
    edgeShadow,
    duration,
  });
}

/** The stage's visible rect in viewport coordinates. */
function visibleStageRect(stage: HTMLElement) {
  const rect = stage.getBoundingClientRect();
  const view = stage.ownerDocument.defaultView;
  const right = Math.min(rect.right, view?.innerWidth ?? rect.right);
  const bottom = Math.min(rect.bottom, view?.innerHeight ?? rect.bottom);
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

/**
 * Copies canvas pixels across two elements of the same shape. A clone carries
 * none of its own.
 */
function copyCanvasPixels(sources: NodeListOf<HTMLCanvasElement>, copies: NodeListOf<HTMLCanvasElement>) {
  for (let index = 0; index < copies.length; index += 1) {
    const source = sources[index];
    const copy = copies[index];
    if (!source || source.width < 1 || source.height < 1) continue;
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
  }
}

/**
 * A still copy of `stage` for one half of the split. A clone carries no canvas
 * pixels, so they are drawn across. The split's own overlays are dropped, every
 * icon is marked as the opened folder's own or as backdrop, and the copy takes
 * no pointer input and is not announced. The split covers the stage's visible
 * rect, so an edge outside the viewport shifts the copy back into line.
 */
function cloneStage(stage: HTMLElement, folderId: string) {
  const clone = stage.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  for (const element of clone.querySelectorAll("[id]")) element.removeAttribute("id");
  // The copy is made before anything is dropped, so canvases pair up by order.
  copyCanvasPixels(stage.querySelectorAll("canvas"), clone.querySelectorAll("canvas"));
  for (const overlay of clone.querySelectorAll(".webspring-drag-proxy, .webspring-launch-dim")) overlay.remove();
  const split = clone.querySelector(".webspring-folder-split");
  if (split) {
    let parent = split.parentElement;
    split.remove();
    // Only the split lived in the view's folder layer.
    while (parent && parent !== clone && parent.childNodes.length === 0) {
      const next = parent.parentElement;
      parent.remove();
      parent = next;
    }
  }
  for (const icon of clone.querySelectorAll<HTMLElement>("[data-webspring-item-id]")) {
    icon.setAttribute(BACKDROP_ATTRIBUTE, icon.dataset.webspringItemId === folderId ? "anchor" : "backdrop");
  }
  clone.classList.add("webspring-folder-split-clone");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  const start = stage.getBoundingClientRect();
  Object.assign(clone.style, {
    position: "absolute",
    top: `${Math.min(0, start.top)}px`,
    left: `${Math.min(0, start.left)}px`,
    width: `${start.width}px`,
    height: `${start.height}px`,
    margin: "0",
    pointerEvents: "none",
  });
  clone.style.transform = "none";
  clone.style.animation = "none";
  clone.style.transition = "none";
  return clone;
}

function FolderSplit({ folder, stage, anchor, reducedMotion, renderApp, onClose, options }: WebspringFolderPresentationProps & { options: ResolvedSplitOptions }) {
  const titleId = useId();
  const scopeId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const topHostRef = useRef<HTMLDivElement>(null);
  const bottomHostRef = useRef<HTMLDivElement>(null);
  const tabHostRef = useRef<HTMLDivElement>(null);
  const [stageRect, setStageRect] = useState(() => visibleStageRect(stage));
  const [phase, setPhase] = useState<FolderSplitPhase>(folderSplitPhaseMachine.definition.initial);
  const [contentHeight, setContentHeight] = useState(0);
  const closeTimer = useRef(0);
  const closed = useRef(false);

  // The overlay, the panel's limits and the halves all follow the stage's visible rect.
  useEffect(() => {
    const view = stage.ownerDocument.defaultView;
    const update = () => setStageRect((current) => {
      const next = visibleStageRect(stage);
      return current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height
        ? current
        : next;
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

  // The split needs no capture: it copies the stage into each half in the same
  // pass that mounts them, which costs about 30 ms rather than a capture's wait.
  // The other copies are made from the first, which already has the split dropped.
  useLayoutEffect(() => {
    const top = topHostRef.current;
    const bottom = bottomHostRef.current;
    if (!top || !bottom) return;
    const prepared = cloneStage(stage, folder.id);
    const copy = () => {
      const next = prepared.cloneNode(true) as HTMLElement;
      copyCanvasPixels(prepared.querySelectorAll("canvas"), next.querySelectorAll("canvas"));
      return next;
    };
    const tab = tabHostRef.current;
    tab?.replaceChildren(copy());
    bottom.replaceChildren(copy());
    top.replaceChildren(prepared);
    return () => {
      top.replaceChildren();
      bottom.replaceChildren();
      tab?.replaceChildren();
    };
  }, [folder.id, stage, stageRect, options.notch]);

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

  // Rest closed for a frame so the parting transitions from there, then part.
  useEffect(() => {
    if (phase !== "closed") return;
    const view = stage.ownerDocument.defaultView;
    if (!view) {
      setPhase(part);
      return;
    }
    let second = 0;
    const first = view.requestAnimationFrame(() => {
      second = view.requestAnimationFrame(() => setPhase(part));
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
    const closing = nextState(folderSplitPhaseMachine.definition, phase, "beginClose");
    const view = stage.ownerDocument.defaultView;
    // A folder that has not parted yet, or has no window to time against, closes at once.
    if (!closing || !view) {
      finish();
      return;
    }
    setPhase(closing);
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
  const triangle = options.notch ? TRIANGLE_DEPTH : 0;
  const panelHeight = Math.min(
    Math.max(0, height - STAGE_MARGIN),
    options.panelHeight === "content" ? contentHeight : options.panelHeight,
  );
  const overflow = Math.max(0, seam + panelHeight - height);
  const panelTop = seam - overflow;
  const notchX = Math.max(NOTCH_HALF_BASE, Math.min(stageRect.width - NOTCH_HALF_BASE, anchor.left + anchor.width / 2 - stageRect.left));
  // Reduced motion crossfades in place; otherwise the halves part and rejoin.
  const fade = reducedMotion;
  const reorder = reducedMotion ? null : webspringIconSprings.reorder;
  const parted = phase === "open" || (fade && phase === "closing");
  // The halves fit together like jigsaw pieces: the upper edge has the pointer
  // cut out of it, and the piece of the stage that filled the cutout rides on
  // the lower half. Opening, that piece glides down with the lower half and
  // sinks out of sight below its straight edge; closing, it rises back out of
  // that edge and plugs the cutout as the straight edges meet. The lower
  // half's box starts at the pointer's tip, and its own copy is cut straight
  // along the seam, so no part of the stage is drawn twice.
  const bottomTop = Math.max(0, seam - triangle);
  const bottomHeight = Math.max(0, height - bottomTop);
  const bottomShift = parted ? panelHeight - overflow : 0;
  // The stage's lower edge cuts upwards, so the shared underlay projects
  // towards the originating folder rather than the stage pointing into it.
  const topClip = triangle > 0
    ? `polygon(0 0, 100% 0, 100% ${seam}px, ${notchX + NOTCH_HALF_BASE}px ${seam}px, ${notchX}px ${seam - triangle}px, ${notchX - NOTCH_HALF_BASE}px ${seam}px, 0 ${seam}px)`
    : undefined;
  const bottomClip = triangle > 0 ? `polygon(0 ${seam}px, 100% ${seam}px, 100% 100%, 0 100%)` : undefined;
  const tabLeft = notchX - NOTCH_HALF_BASE;
  // Each cut edge catches the light just inside the stage: a band along the
  // upper edge, around the cutout, and a line along the lower straight edge.
  const lit = seam - EDGE_HIGHLIGHT;
  const topEdgeClip = triangle > 0
    ? `polygon(0 ${lit}px, ${notchX - NOTCH_HALF_BASE}px ${lit}px, ${notchX}px ${lit - triangle}px, ${notchX + NOTCH_HALF_BASE}px ${lit}px, 100% ${lit}px, 100% ${seam}px, ${notchX + NOTCH_HALF_BASE}px ${seam}px, ${notchX}px ${seam - triangle}px, ${notchX - NOTCH_HALF_BASE}px ${seam}px, 0 ${seam}px)`
    : `polygon(0 ${lit}px, 100% ${lit}px, 100% ${seam}px, 0 ${seam}px)`;

  const style = {
    left: `${stageRect.left}px`,
    top: `${stageRect.top}px`,
    width: `${stageRect.width}px`,
    height: `${height}px`,
    "--webspring-folder-duration": `${options.duration}s`,
    "--webspring-folder-edge-shadow": options.edgeShadow,
    ...(options.underlay.image === undefined ? {} : {
      "--webspring-folder-underlay-image": options.underlay.image ? `url("${options.underlay.image}")` : "none",
    }),
    "--webspring-folder-underlay-size": options.underlay.size,
    "--webspring-folder-underlay-colour": options.underlay.colour,
  } as CSSProperties;

  return <FocusScope options={{ scopeId: `webspring-folder:${scopeId}`, kind: "modal", modal: true, trapFocus: true, restoreFocus: true, asChild: true }}>
    <div
      data-nse-control="folder-presentation" data-nse-part="background" className="webspring-folder-split"
      data-phase={phase}
      data-motion={fade ? "fade" : "split"}
      style={style}
      onKeyDownCapture={onKeyDown}
    >
      <div data-nse-part="backdrop" className="webspring-folder-split-backdrop" aria-hidden="true" onClick={close} />
      <div
        ref={panelRef}
        data-nse-part="bezel" className="webspring-folder-split-panel"
        data-webspring-folder-panel={folder.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ top: `${panelTop}px`, height: `${panelHeight}px` }}
      >
        <div ref={contentRef} data-nse-part="content" className="webspring-folder-split-content">
          <h2 id={titleId} data-nse-part="title" className="webspring-folder-split-title">{folder.title}</h2>
          <div data-nse-part="group" className="webspring-folder-split-apps">
            {/* Apps spring to their new places as they reorder, as on the stage. */}
            {folder.apps.map((app, index) => <LayoutView key={app.bundleIdentifier} data-nse-part="cell" className="webspring-folder-split-cell" layoutTransition={reorder}>{renderApp(app, index)}</LayoutView>)}
          </div>
        </div>
      </div>
      <div
        data-nse-part="background" className="webspring-folder-split-half is-top"
        style={{
          height: `${seam}px`,
          transform: parted ? `translate3d(0, ${-overflow}px, 0)` : undefined,
        }}
        aria-hidden="true"
        onClick={close}
      >
        <div
          ref={topHostRef}
          data-nse-part="preview" className="webspring-folder-split-clone-host"
          style={{ top: 0, height: `${height}px`, clipPath: topClip }}
        />
        <div data-nse-part="border" className="webspring-folder-split-edge is-top" style={{ clipPath: topEdgeClip }} />
      </div>
      <div
        data-nse-part="background" className="webspring-folder-split-half is-bottom"
        style={{
          top: `${bottomTop}px`,
          height: `${bottomHeight}px`,
          transform: parted ? `translate3d(0, ${bottomShift}px, 0)` : undefined,
        }}
        aria-hidden="true"
        onClick={close}
      >
        <div
          ref={bottomHostRef}
          data-nse-part="preview" className="webspring-folder-split-clone-host"
          style={{ top: `${-bottomTop}px`, height: `${height}px`, clipPath: bottomClip }}
        />
        <div data-nse-part="border" className="webspring-folder-split-edge is-bottom" style={{ top: `${seam - bottomTop}px`, height: `${EDGE_HIGHLIGHT}px` }} />
        {triangle > 0 ? <div
          data-nse-part="indicator" className="webspring-folder-split-tab"
          style={{ left: `${tabLeft}px`, width: `${NOTCH_HALF_BASE * 2}px`, height: `${triangle}px` }}
        >
          <div
            data-nse-part="image" className="webspring-folder-split-tab-piece"
            style={{ transform: parted ? `translate3d(0, ${triangle}px, 0)` : undefined }}
          >
            <div
              ref={tabHostRef}
              data-nse-part="preview" className="webspring-folder-split-clone-host"
              style={{ top: `${-bottomTop}px`, left: `${-tabLeft}px`, width: `${stageRect.width}px`, height: `${height}px` }}
            />
          </div>
        </div> : null}
      </div>
    </div>
  </FocusScope>;
}

/**
 * The iOS 6 folder: the stage is copied into two halves that part just below the
 * folder's cell to reveal the folder's apps on an underlay. The copy is a clone
 * of the stage's DOM, so there is nothing to capture and nothing to wait for;
 * every icon but the opened folder's own fades back as the halves part, and the
 * triangle cut from the top seam is filled by a matching tab on the bottom half
 * until they part.
 * Reduced motion crossfades instead. Escape, a tap on either half, or a tap on
 * the folder icon closes it.
 */
export function createWebspringFolderSplitPresentation(options: WebspringFolderSplitOptions = {}): WebspringFolderPresentationComponent {
  const resolved = resolveOptions(options);
  return function WebspringFolderSplitPresentation(props: WebspringFolderPresentationProps) {
    return <FolderSplit {...props} options={resolved} />;
  };
}
