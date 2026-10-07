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

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { useChronosphereEnvironment } from "./chronosphereEnvironment";
import type { ChronosphereDisposable } from "./chronosphereEnvironment";
import type { ChronosphereVersion } from "./chronosphereTypes";
import type { ChronosphereViewComponent, ChronosphereViewProps } from "./chronosphereViewTypes";
import "./chronosphere-grid.css";

const TILE_WIDTH = 208;
const NARROW = 520;
const DEFAULT_FACE_WIDTH = 800;
const LEAVE_MS = 200;

/**
 * Every version laid out at once, as a grid of its pages: the quiet way to browse an archive.
 * Choose a version to see it larger; Restore brings a past one back, Done returns to the app.
 */
function GridView<TDetail>({ model, actions, renderFace }: ChronosphereViewProps<unknown, TDetail>) {
  const app = useChronosphereEnvironment();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const { subject, entries, labels } = model;
  const [chosen, setChosen] = useState(0);
  const [stage, setStage] = useState<"entering" | "open" | "leaving">(reducedMotion ? "open" : "entering");
  const grid = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const shape = subject.card;
  const aspect = shape?.aspectRatio ?? 16 / 10;
  const faceWidth = shape?.faceWidth ?? DEFAULT_FACE_WIDTH;
  // Two to a row on a phone; a fixed page width elsewhere, so faces scale by one known factor.
  const [tileWidth, setTileWidth] = useState(TILE_WIDTH);
  const tileHeight = tileWidth / aspect;
  const entry = entries[Math.min(chosen, entries.length - 1)];
  const canRestore = Boolean(actions.restore && entry && !entry.isCurrent);

  useEffect(() => {
    if (stage !== "entering") return undefined;
    const frame = app.scheduler.requestAnimationFrame(() => setStage("open"));
    return () => { (frame as ChronosphereDisposable).dispose(); };
  }, [app.scheduler, stage]);
  useEffect(() => {
    if (stage !== "leaving") return undefined;
    if (reducedMotion) { actions.exit(); return undefined; }
    const timer = app.scheduler.setTimeout(() => actions.exit(), LEAVE_MS);
    return () => { (timer as ChronosphereDisposable).dispose(); };
  }, [actions, app.scheduler, reducedMotion, stage]);
  useLayoutEffect(() => {
    const node = grid.current;
    if (!node) return undefined;
    node.focus({ preventScroll: true });
    const measure = () => {
      const width = node.clientWidth;
      setTileWidth(width > 0 && width < NARROW ? Math.max(120, Math.floor((width - 24 - 14) / 2)) : TILE_WIDTH);
    };
    measure();
    // The element's own window observes it: no browser global, and the right realm in a frame.
    const Observer = node.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) return undefined;
    const observer = new Observer(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The chosen tile stays in view as the keyboard moves through a long history.
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-index="${chosen}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [chosen]);

  const leave = useCallback(() => setStage(current => current === "leaving" ? current : "leaving"), []);
  const restore = useCallback((target: ChronosphereVersion<TDetail>) => {
    if (!actions.restore || target.isCurrent) return;
    actions.restore(target);
    leave();
  }, [actions, leave]);

  const columns = () => {
    const node = grid.current;
    if (!node) return 1;
    const tiles = [...node.querySelectorAll<HTMLElement>(".chronosphere-grid-tile")];
    const top = tiles[0]?.offsetTop;
    const perRow = tiles.findIndex(tile => tile.offsetTop !== top);
    return perRow > 0 ? perRow : Math.max(1, tiles.length);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = entries.length - 1;
    const move = (to: number) => { event.preventDefault(); setChosen(Math.max(0, Math.min(last, to))); };
    switch (event.key) {
      case "ArrowRight": move(chosen + 1); break;
      case "ArrowLeft": move(chosen - 1); break;
      case "ArrowDown": move(chosen + columns()); break;
      case "ArrowUp": move(chosen - columns()); break;
      case "Home": move(0); break;
      case "End": move(last); break;
      case "Enter": if (entry && canRestore) { event.preventDefault(); restore(entry); } break;
      case "Escape": event.preventDefault(); leave(); break;
      default: break;
    }
  };

  const face = (item: ChronosphereVersion<TDetail>, active: boolean) => {
    const present = item.isCurrent;
    const drawn = shape && renderFace ? renderFace(item, { active, detail: true, pane: present ? "present" : "past" }) : null;
    if (drawn !== null && drawn !== undefined && drawn !== false) {
      return <span className="chronosphere-grid-face" inert aria-hidden="true" style={{
        width: `${faceWidth}px`, height: `${faceWidth / aspect}px`, transform: `scale(${tileWidth / faceWidth})`,
      }}>{drawn}</span>;
    }
    const shot = present ? model.presentImage : item.screenshotSrc;
    if (shot) return <span className="chronosphere-grid-shot" aria-hidden="true" style={{ backgroundImage: `url("${shot}")` }} />;
    return <span className="chronosphere-grid-card" aria-hidden="true">
      <span className="chronosphere-grid-card-label">{item.displayLabel}</span>
      <span className="chronosphere-grid-card-title">{item.title}</span>
    </span>;
  };

  return <div className="chronosphere-grid" data-stage={stage} data-material={shape?.material ?? "window"} role="application" aria-labelledby={titleId}>
    <header className="chronosphere-grid-bar">
      <span className="chronosphere-grid-bar-side" />
      <h2 className="chronosphere-grid-title" id={titleId}>{subject.label}</h2>
      <span className="chronosphere-grid-bar-side chronosphere-grid-bar-end">
        <NSEPushButton onClick={leave}>{labels.done}</NSEPushButton>
      </span>
    </header>
    <div ref={grid} className="chronosphere-grid-scroll" tabIndex={0} role="listbox" aria-label={labels.timeline}
      aria-activedescendant={entry ? `${titleId}-${chosen}` : undefined} onKeyDown={onKeyDown}>
      <div className="chronosphere-grid-tiles" style={{ "--chronosphere-tile-width": `${tileWidth}px`, "--chronosphere-tile-height": `${tileHeight}px`,
        "--chronosphere-tile-radius": `${Math.min(14, (shape?.cornerRadius ?? 22) * (tileWidth / 640))}px` } as CSSProperties}>
        {entries.map((item, index) => {
          const active = index === chosen;
          return <div key={item.id} id={`${titleId}-${index}`} className="chronosphere-grid-tile" data-index={index} role="option" aria-selected={active}
            aria-label={`${item.title}, ${item.dateLabel}`} data-active={active ? "true" : "false"} data-status={item.isCurrent ? "current" : "saved"}
            onClick={() => setChosen(index)} onDoubleClick={() => restore(item)}>
            <span className="chronosphere-grid-page">
              {face(item, active)}
              {item.isCurrent ? <span className="chronosphere-grid-now">{labels.now}</span> : null}
            </span>
            <span className="chronosphere-grid-date">{item.dateLabel}</span>
            <span className="chronosphere-grid-summary">{item.summary}</span>
          </div>;
        })}
      </div>
    </div>
    <footer className="chronosphere-grid-footer">
      <span className="chronosphere-grid-detail">{entry ? <><strong>{entry.title}</strong>{entry.dateLabel ? ` · ${entry.dateLabel}` : ""}</> : null}</span>
      {actions.restore ? <NSEPushButton tone="affirmative" disabled={!canRestore} onClick={() => entry && restore(entry)}>{labels.restore}</NSEPushButton> : null}
    </footer>
  </div>;
}

/** A grid of every version: no artwork to prepare. */
export const ChronosphereGridView = GridView;
