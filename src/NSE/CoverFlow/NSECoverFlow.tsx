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
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent
} from "react";
import { useNSEActionBinding } from "../Controls/Core/useNSEControlAction";
import { useNSEControlCommand } from "../Controls/Core/useNSEControlCommand";

export interface NSECoverFlowItem {
  /** Stable identity for the panel. */
  id: string;
  /** Source URL for the panel artwork. */
  image: string;
  /** Accessible name; also shown as the floating label when `showLabels`. */
  label?: string;
  /** Secondary line under the label when `showLabels`. */
  caption?: string;
  /** Fired when the panel is the centre item and is activated (click / Enter). */
  onActivate?: () => void;
  /** Sent when the centre panel is activated. Overrides the cover flow's default action. */
  action?: string;
  /** Defaults to this item's id; an explicitly present undefined sends no payload. */
  actionPayload?: unknown;
}

export interface NSECoverFlowProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: NSECoverFlowItem[];
  /** Controlled centre index. Omit for uncontrolled use. */
  activeIndex?: number;
  /** Initial centre index for uncontrolled use. Defaults to the middle item. */
  defaultActiveIndex?: number;
  /** Notified whenever the centre item changes. */
  onActiveChange?: (index: number) => void;
  /** Default action for centre-panel activation by click, Enter or Space. */
  action?: string;
  /** Defaults to the active item's id; an item-specific action uses its own payload override. */
  actionPayload?: unknown;
  /** Render mirrored reflections under each panel. Defaults to true. */
  reflection?: boolean;
  /** Show the floating label/caption for the centre item. Defaults to false. */
  showLabels?: boolean;
  /** Wrap around at the ends so the strip is an endless ring. Defaults to false. */
  loop?: boolean;
  /** Override the well background (any CSS background value). */
  background?: string;
}

type CoverFlowStyle = CSSProperties & Record<`--${string}`, string | number>;

/** Panels each side of the centre that hold full opacity before the fan fades out. */
const FAN_EACH_SIDE = 4;
/** Rings beyond the fan over which a panel fades from full to nothing. */
const FADE_SPAN = 1;
/** Extra rings kept mounted (at opacity 0) past the fade, so a fast multi-step jump never pops a
 *  panel into view mid-fan — it is already mounted and simply animates inwards. */
const RENDER_MARGIN = 2;
/** Horizontal pointer travel (px) that advances the centre by one panel. */
const DRAG_STEP_PX = 78;
/** Pointer travel below this is treated as a click, not a drag. */
const CLICK_SLOP_PX = 6;
/** Minimum gap (ms) between wheel-driven steps. */
const WHEEL_COOLDOWN_MS = 320;

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

function panelTransform(offset: number) {
  if (offset === 0) {
    // Centre item pops forward and reads largest (cf. the jh3y reference's centre scale bump).
    return "translate(-50%, -50%) translateZ(46px) rotateY(0deg) scale(1)";
  }
  const sign = offset < 0 ? -1 : 1;
  const distance = Math.abs(offset);
  // translateX is a percentage of the panel's own width, so the fan stays responsive.
  const x = sign * (52 + (distance - 1) * 34);
  const z = -(150 + (distance - 1) * 72);
  const rotate = -sign * 52;
  const scale = Math.max(0.5, 1 - distance * 0.14);
  return `translate(-50%, -50%) translateX(${x}%) translateZ(${z}px) rotateY(${rotate}deg) scale(${scale})`;
}

/**
 * NSECoverFlow — a tactile, 3D cover-flow strip for software / media showcases.
 *
 * Generic and self-contained: feed it `items` and it renders a centre-facing panel with angled
 * side panels, reflections and depth. Navigable by click (side panels recentre, the centre panel
 * activates), drag / swipe, horizontal wheel, and Left/Right/Home/End keys. Honours
 * `prefers-reduced-motion` (handled in CSS).
 *
 * Seamless looping: the strip is laid out by *position*, not by item. The centre is a monotonic
 * ring coordinate that never wraps, so stepping past the last item just advances it by one and every
 * panel slides a single notch — no rewind at the seam. Each rendered slot is a stable, sliding card
 * whose artwork is the ring index for that position; near the seam an item simply appears in two
 * slots at once and the depart/arrive pair cross-fades.
 */
export function NSECoverFlow(props: NSECoverFlowProps) {
  const {
    items,
    activeIndex,
    defaultActiveIndex,
    onActiveChange,
    action,
    actionPayload,
    reflection = true,
    showLabels = false,
    loop = false,
    background,
    className = "",
    style,
    onPointerDown,
    onKeyDown,
    ...rest
  } = props;
  const isControlled = activeIndex !== undefined;
  const n = items.length;
  const labelId = useId();

  // Map a (possibly out-of-range) ring coordinate to a real item index.
  const wrapIndex = useCallback(
    (i: number) => {
      if (n <= 0) return 0;
      return loop ? ((i % n) + n) % n : clampIndex(i, n);
    },
    [n, loop]
  );

  // Monotonic centre: an unbounded position on the ring. It never wraps, so advancing from the last
  // item to the first is a +1 step (not a jump back across the whole list) and the deck slides by one.
  const [centre, setCentre] = useState(() =>
    clampIndex((isControlled ? activeIndex : defaultActiveIndex) ?? Math.floor(n / 2), n)
  );

  const current = wrapIndex(centre);
  const currentItem = items[current];
  const itemHasAction = currentItem?.action !== undefined;
  const payloadSource = itemHasAction ? currentItem : props;
  const activationPayload = payloadSource && Object.prototype.hasOwnProperty.call(payloadSource, "actionPayload") ? (itemHasAction ? currentItem?.actionPayload : actionPayload) : currentItem?.id;
  const actionBinding = useNSEActionBinding(currentItem?.action ?? action, activationPayload);
  const actionCommand = useNSEControlCommand(actionBinding);
  const actionPresentation = actionCommand.presentation;
  const actionAvailable = !actionBinding || Boolean(actionPresentation?.enabled && !actionPresentation.denied && !actionPresentation.hidden && !actionPresentation.stale);
  const activate = () => {
    if (!actionAvailable) return;
    currentItem?.onActivate?.();
    if (actionBinding) void actionCommand.dispatch();
  };

  // Controlled mode: keep the monotonic centre in step with the parent's item index, moving by the
  // shortest signed amount so a wrap still animates as a single step.
  useEffect(() => {
    if (!isControlled) return;
    setCentre((prev) => {
      const target = activeIndex as number;
      if (!loop || n <= 0) return clampIndex(target, n);
      const cur = ((prev % n) + n) % n;
      let delta = (((target - cur) % n) + n) % n;
      if (delta > n / 2) delta -= n;
      return prev + delta;
    });
  }, [activeIndex, isControlled, loop, n]);

  // Keep an uncontrolled centre valid if the list shrinks (only matters without looping).
  useEffect(() => {
    if (isControlled || loop) return;
    if (centre > n - 1) setCentre(clampIndex(centre, n));
  }, [centre, isControlled, loop, n]);

  const goTo = useCallback(
    (nextCentre: number) => {
      const next = loop ? nextCentre : clampIndex(nextCentre, n);
      const nextCurrent = wrapIndex(next);
      if (isControlled) {
        if (nextCurrent !== current) onActiveChange?.(nextCurrent);
        return;
      }
      if (next === centre) return;
      setCentre(next);
      if (nextCurrent !== current) onActiveChange?.(nextCurrent);
    },
    [loop, n, wrapIndex, isControlled, current, centre, onActiveChange]
  );

  // Jump to a specific item by the shortest path (used by Home/End and side-panel clicks resolve via
  // their own position instead).
  const goToItem = useCallback(
    (targetIndex: number) => {
      if (!loop || n <= 0) {
        goTo(targetIndex);
        return;
      }
      const cur = wrapIndex(centre);
      let delta = (((targetIndex - cur) % n) + n) % n;
      if (delta > n / 2) delta -= n;
      goTo(centre + delta);
    },
    [loop, n, wrapIndex, centre, goTo]
  );

  // --- Pointer drag / swipe -------------------------------------------------
  const drag = useRef({ active: false, startX: 0, baseCentre: 0, moved: 0, pointerId: -1, captured: false });
  const suppressClick = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.button !== 0) return;
    drag.current = {
      active: true,
      startX: event.clientX,
      baseCentre: centre,
      moved: 0,
      pointerId: event.pointerId,
      captured: false
    };
    suppressClick.current = false;
    // Do NOT capture the pointer yet: capturing on pointerdown retargets the follow-up `click` to
    // this container, so a plain click would never reach a panel. We only capture once the gesture
    // is unmistakably a drag (past the slop), which is also when we start suppressing the click.
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const delta = event.clientX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(delta));
    if (Math.abs(delta) > CLICK_SLOP_PX) {
      suppressClick.current = true;
      if (!drag.current.captured) {
        event.currentTarget.setPointerCapture?.(drag.current.pointerId);
        drag.current.captured = true;
      }
    }
    goTo(drag.current.baseCentre + Math.round(-delta / DRAG_STEP_PX));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.captured && event.currentTarget.hasPointerCapture?.(drag.current.pointerId)) {
      event.currentTarget.releasePointerCapture?.(drag.current.pointerId);
    }
    drag.current.captured = false;
  };

  // --- Wheel ----------------------------------------------------------------
  const lastWheel = useRef(0);
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    // Only act on horizontally-dominant gestures so vertical page scroll is never hijacked.
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const now = Date.now();
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    goTo(centre + (event.deltaX > 0 ? 1 : -1));
  };

  // --- Keyboard -------------------------------------------------------------
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        goTo(centre - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        goTo(centre + 1);
        break;
      case "Home":
        event.preventDefault();
        goToItem(0);
        break;
      case "End":
        event.preventDefault();
        goToItem(items.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        activate();
        break;
      default:
        break;
    }
  };

  // Clicking a panel recentres to *that slot* (shortest path, since it is the visible one); clicking
  // the centre activates it.
  const handlePanelClick = (position: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (position === centre) {
      activate();
    } else {
      goTo(position);
    }
  };

  if (n === 0) return null;

  // Full-opacity extent is capped when looping so a wrap-around twin (which lives at offset n − d)
  // never overlaps a still-opaque panel — otherwise an item would briefly render twice over.
  const fullExtent = loop ? Math.min(FAN_EACH_SIDE, Math.max(0, Math.floor((n - 1) / 2))) : FAN_EACH_SIDE;
  const fadeEnd = fullExtent + FADE_SPAN;
  const renderMax = fadeEnd + RENDER_MARGIN;

  const opacityFor = (distance: number) => {
    if (distance <= fullExtent) return 1;
    if (distance >= fadeEnd) return 0;
    return (fadeEnd - distance) / (fadeEnd - fullExtent);
  };

  // One panel per ring position in the mounted window. Keyed by absolute position, so as the centre
  // advances each panel keeps its identity and simply slides one notch (offset = position − centre).
  type CoverFlowPanel = { position: number; offset: number; index: number; item: NSECoverFlowItem };
  const panels: CoverFlowPanel[] = [];
  for (let position = centre - renderMax; position <= centre + renderMax; position += 1) {
    if (!loop && (position < 0 || position > n - 1)) continue;
    const index = wrapIndex(position);
    panels.push({ position, offset: position - centre, index, item: items[index] });
  }

  // The slot nearest the centre is each item's canonical (aria) instance; any wrap twin is decorative.
  const primaryByIndex = new Map<number, number>();
  for (const panel of panels) {
    const best = primaryByIndex.get(panel.index);
    if (best === undefined || Math.abs(panel.offset) < Math.abs(best - centre)) {
      primaryByIndex.set(panel.index, panel.position);
    }
  }

  const wellStyle: CoverFlowStyle = {
    ...(style as CoverFlowStyle),
    ...(background ? { ["--nse-coverflow-bg"]: background } : {})
  };

  const activeItem = items[current];

  return (
    <div
      className={`nse-coverflow ${className}`.trim()}
      role="listbox"
      aria-label={(rest["aria-label"] as string) ?? "Showcase"}
      aria-activedescendant={`${labelId}-${current}`}
      data-reflection={reflection ? "true" : "false"}
      tabIndex={0}
      style={wellStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <div className="nse-coverflow-stage">
        {panels.map(({ position, offset, index, item }) => {
          const distance = Math.abs(offset);
          const active = offset === 0;
          const primary = primaryByIndex.get(index) === position;
          const interactive = distance < fadeEnd;
          const panelStyle: CoverFlowStyle = {
            transform: panelTransform(offset),
            zIndex: 100 - Math.round(distance),
            opacity: opacityFor(distance),
            pointerEvents: interactive ? "auto" : "none",
            ["--cf-shade"]: Math.min(0.6, distance * 0.22)
          };
          return (
            <div
              key={`pos-${position}`}
              id={primary ? `${labelId}-${index}` : undefined}
              className="nse-coverflow-panel"
              data-active={active ? "true" : "false"}
              role={primary ? "option" : undefined}
              aria-selected={primary ? active : undefined}
              aria-disabled={primary && active && !actionAvailable ? true : undefined}
              data-action-state={active ? actionPresentation?.state : undefined}
              aria-hidden={primary ? undefined : "true"}
              aria-label={primary ? item.label : undefined}
              style={panelStyle}
              onClick={() => handlePanelClick(position)}
            >
              <div className="nse-coverflow-card">
                <img
                  src={item.image}
                  alt={primary ? item.label ?? "" : ""}
                  draggable={false}
                  loading="eager"
                  decoding="async"
                />
                <span className="nse-coverflow-shade" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      {showLabels && activeItem?.label ? (
        <div className="nse-coverflow-caption" aria-hidden="true">
          <span className="nse-coverflow-caption-title">{activeItem.label}</span>
          {activeItem.caption ? (
            <span className="nse-coverflow-caption-sub">{activeItem.caption}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
