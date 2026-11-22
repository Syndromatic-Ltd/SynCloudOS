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

import { useEffect, type CSSProperties, type TransitionEvent } from "react";
import { NSEButton, NSESegmentedControl } from "@syndromatic/syncloudos/nse/controls";
import { WSIconView } from "../../../WSIconView";
import { WSLauncherViewController, type WSLauncherRootProps } from "../../../WSLauncherViewController";
import { WSWidgetShelfView } from "../../../WSWidgetShelfView";
import { webspringSurfaceStyle } from "../../../WSSurface";
import { createWebspringBoardProjection } from "../../../webspringLayout";
import type { WebspringViewModel } from "../../../webspringTypes";
import { createWebspringBoardLaunchExits, webspringBoardLaunchTiming, type WebspringBoardLaunchExits } from "./WSBoardViewController.transitions";
import "../../../WebspringPresentation.css";
import "./WSBoardViewController.css";

/** The visitor layout's stored page size, which the Board shows as four rows of four. */
const STORED_DEFAULT_PAGE_SIZE = 20;

/**
 * The Webspring Board, after the iOS home screen: a paged grid of icons with the site's
 * branding, edit controls and, when the site declares widgets, the widget shelf.
 */
export class WSBoardViewController extends WSLauncherViewController {
  static override returnTracks: readonly ("material" | "icons")[] = ["material"];
  static override launchZoom = webspringBoardLaunchTiming.appZoom;
  /** Icons on a page; a subclass that declares its own replaces the visitor's stored size. */
  static pageSize = 16;
  static columns = 4;

  #page = 0;
  #iconExits: WebspringBoardLaunchExits | null = null;

  /** Icons on one page. */
  override get pageSize(): number {
    const declared = (this.constructor as typeof WSBoardViewController).pageSize;
    if (declared !== WSBoardViewController.pageSize) return declared;
    const stored = super.pageSize;
    return stored === STORED_DEFAULT_PAGE_SIZE ? this.columns * 4 : stored;
  }

  get columns(): number {
    return (this.constructor as typeof WSBoardViewController).columns;
  }

  /** The pages of top-level entries. */
  get pages() {
    return createWebspringBoardProjection(this.items, { pageSize: this.pageSize, dockSize: 0 }).pages;
  }

  /** The page on screen. */
  get page(): number {
    return Math.max(0, Math.min(this.#page, this.pages.length - 1));
  }

  set page(value: number) {
    const next = Math.max(0, Math.min(value, this.pages.length - 1));
    if (next === this.#page) return;
    this.#page = next;
    this.notifyObservers();
  }

  /** Where each on-screen icon flies while an app is open. */
  get iconExits(): WebspringBoardLaunchExits | null {
    return this.#iconExits;
  }

  override get dragLayoutKey(): unknown {
    return this.page;
  }

  override launcherRootProps(): WSLauncherRootProps {
    return {
      as: "main",
      "data-nse-control": "board",
      "data-nse-part": "background",
      className: "webspring-board",
      style: webspringSurfaceStyle(this.launcherSurface, "--webspring-launcher"),
      "data-nse-presentation": this.launchPhase,
      "data-nse-state": this.entrancePhase,
      "data-reduced-motion": this.presentationTraits.reducedMotion ? "true" : "false",
    };
  }

  override launchCompletionDelay(): number {
    const { appZoom, iconExitDuration } = webspringBoardLaunchTiming;
    return Math.max(iconExitDuration, appZoom.delay + appZoom.duration);
  }

  override revealItem(itemId: string): void {
    const index = this.items.findIndex((item) => item.id === itemId);
    if (index >= 0) this.page = Math.floor(index / this.pageSize);
  }

  override dragDidReachEdge(edge: "start" | "end"): boolean {
    const target = edge === "end" ? this.page + 1 : this.page - 1;
    if (target < 0 || target >= this.pages.length) return false;
    this.page = target;
    return true;
  }

  override launcherDidSwipe(direction: "previous" | "next"): boolean {
    this.page = this.page + (direction === "next" ? 1 : -1);
    return true;
  }

  override launcherWillOpenApp(_appId: string, root: HTMLElement): void {
    this.#setIconExits(createWebspringBoardLaunchExits(root));
  }

  override launcherDidNotOpenApp(): void {
    this.#setIconExits(null);
  }

  override launchPhaseDidChange(previous: WebspringViewModel["launchPhase"], current: WebspringViewModel["launchPhase"]): void {
    if (current === "idle" && previous !== "idle") this.#setIconExits(null);
  }

  #setIconExits(exits: WebspringBoardLaunchExits | null): void {
    if (this.#iconExits === exits) return;
    this.#iconExits = exits;
    this.notifyObservers();
  }

  override renderView() {
    return <WSBoardView board={this} />;
  }
}

function WSBoardView({ board }: { readonly board: WSBoardViewController }) {
  const columns = board.columns;
  const pageSize = board.pageSize;
  const pages = board.pages;
  const activePage = board.page;
  const rows = Math.max(1, Math.ceil(pageSize / columns));
  const pagesStyle = { "--webspring-board-columns": String(columns), "--webspring-board-rows": String(rows) } as CSSProperties;
  const { launchPhase, presentationTraits, items } = board;

  useEffect(() => {
    if (launchPhase === "returning" && (presentationTraits.reducedMotion || items.length === 0)) board.completeReturnTrack("material");
  }, [board, items.length, launchPhase, presentationTraits.reducedMotion]);

  return <>
    <section data-nse-part="content" data-nse-role="launcher" className="webspring-board-launcher" aria-label="Webspring">
      <div data-nse-part="background" data-nse-role="launcher" className="webspring-board-material" aria-hidden="true" onTransitionEnd={(event: TransitionEvent<HTMLDivElement>) => {
        if (board.launchPhase === "returning" && event.target === event.currentTarget && event.propertyName === "transform") board.completeReturnTrack("material");
      }} />
      <header data-nse-part="header" className="webspring-board-brand">
        {board.branding.logoUrl
          ? <img data-nse-part="image" className="webspring-board-logo" src={board.branding.logoUrl} alt={board.branding.logoAlt} />
          : <span>{board.branding.name}</span>}
      </header>
      <div className={`webspring-board-controls ${board.isEditing ? "is-editing" : ""}`}>
        {board.isEditing ? <NSESegmentedControl
          segmentStyle="texturedRounded"
          aria-label="Webspring edit controls"
          haptic="success"
          items={[{ id: "done", label: "Done" }, { id: "reset", label: "Reset" }]}
          selection={{ mode: "momentary", selectedIds: new Set() }}
          onSelectionChange={({ selectedIds }) => { if (selectedIds.has("done")) board.finishEditing(true); else if (selectedIds.has("reset")) board.resetOrder(); }}
        /> : <NSEButton
          appearance="dark"
          title="Reorder applications"
          onClick={() => board.beginEditing(null)}
          aria-describedby="webspring-board-keyboard-help"
        />}
      </div>
      <p id="webspring-board-keyboard-help" className="webspring-reorder-announcement">
        {board.folders.editable
          ? "Hold an application to reorder. Rest it on another application or a folder to group them. Use arrow keys to move it. Press Escape when finished."
          : "Hold an application to reorder. Use arrow keys to move it. Press Escape when finished."}
      </p>
      <section data-nse-part="content" className="webspring-board-pages" style={pagesStyle} aria-label="Applications">
        <div data-nse-part="group" className="webspring-board-page" data-page={activePage}>
          {pages[activePage]?.map((item, index) => <WSIconView
            key={item.id}
            item={item}
            index={activePage * pageSize + index}
            columns={columns}
            radialExit={board.iconExits?.get(item.id)}
          />)}
        </div>
      </section>
      {pages.length > 1 ? <nav data-nse-part="accessory" data-nse-role="page-controls" className="webspring-board-page-controls" aria-label="Application pages">
        {pages.map((_items, index) => <button key={index} type="button" data-nse-part="button" data-nse-selected={index === activePage ? "" : undefined} aria-label={`Show application page ${index + 1}`} aria-current={index === activePage ? "page" : undefined} onClick={() => { board.page = index; }} onPointerEnter={() => { if (board.draggingItemId) board.page = index; }} />)}
      </nav> : null}
    </section>
    {board.widgets.length > 0 ? <WSWidgetShelfView /> : null}
  </>;
}
