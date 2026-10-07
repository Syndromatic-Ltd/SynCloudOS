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
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { NSESplitView } from "./NSESplitView";
import { dataViewAllowsMutation, dataViewIsBusy, dataViewPresentsContent } from "../Core";
import type { NSEDataViewState } from "../Core";
import type { NSESplitViewController } from "./NSESplitViewController";
import type {
  NSESplitViewAdapterAuthority,
  NSESplitViewAdapterPane,
} from "./splitViewTypes";

export interface NSESplitViewAdapterProps extends HTMLAttributes<HTMLDivElement>, NSESplitViewAdapterAuthority {
  readonly controller: NSESplitViewController;
  readonly panes: readonly NSESplitViewAdapterPane[];
  readonly state?: NSEDataViewState;
}

export function NSESplitViewAdapter({
  controller,
  panes,
  responsiveState,
  windowBounds,
  dir = "ltr",
  "aria-label": ariaLabel = "Split view",
  className = "",
  state = { kind: "ready" },
  ...props
}: NSESplitViewAdapterProps) {
  const allowsMutation = dataViewAllowsMutation(state);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const paneNodes = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<{ divider: number; coordinate: number } | null>(null);
  const previousPresentation = useRef(snapshot.presentation);

  useLayoutEffect(() => {
    controller.setAvailablePaneIds(new Set(panes.map(({ id }) => id)));
    controller.resize(snapshot.orientation === "horizontal" ? windowBounds.width : windowBounds.height);
    controller.setPresentation(responsiveState.mode === "mobile" ? "single-pane" : "split");
  }, [controller, panes, responsiveState.mode, snapshot.orientation, windowBounds.height, windowBounds.width]);

  useEffect(() => {
    if (previousPresentation.current === "single-pane" && snapshot.presentation === "split") {
      paneNodes.current.get(snapshot.activePaneId)?.focus();
    }
    previousPresentation.current = snapshot.presentation;
  }, [snapshot.activePaneId, snapshot.presentation]);

  const definitions = new Map(panes.map((pane) => [pane.id, pane]));
  const visible = snapshot.panes.filter(({ collapsed, id }) => !collapsed && definitions.has(id));
  const presentsContent = dataViewPresentsContent(state);
  const stateFeedback = state.kind === "ready" ? null : <>
    <span role="status">{state.message}</span>
    {(state.kind === "denied" || state.kind === "error") && state.retry && <button type="button" aria-disabled={state.kind === "denied" ? false : undefined} onClick={state.retry}>Retry</button>}
    {state.kind === "interrupted" && state.resume && <button type="button" onClick={state.resume}>Resume</button>}
  </>;
  const recoveryAvailable = ((state.kind === "denied" || state.kind === "error") && state.retry !== undefined) || (state.kind === "interrupted" && state.resume !== undefined);
  const hostDisabled = state.kind === "denied" || (!allowsMutation && !recoveryAvailable);

  if (!presentsContent) {
    return <div {...props} className={`nse-split-view-adapter ${className}`.trim()} dir={dir} aria-label={ariaLabel} aria-busy={dataViewIsBusy(state) || undefined} aria-disabled={hostDisabled || undefined} data-nse-control="split-view" data-state={state.kind} data-presentation={snapshot.presentation} tabIndex={-1}>
      {stateFeedback}
    </div>;
  }

  if (snapshot.presentation === "single-pane") {
    const active = definitions.get(snapshot.activePaneId) ?? definitions.get(visible[0]?.id ?? "");
    return (
      <div {...props} className={`nse-split-view-adapter ${className}`.trim()} dir={dir} aria-label={ariaLabel} aria-disabled={hostDisabled || undefined} data-nse-control="split-view" data-state={state.kind} data-presentation="single-pane">
        <div role="tablist" aria-label={`${ariaLabel} panes`}>
          {visible.map((pane) => (
            <button
              key={pane.id}
              type="button"
              role="tab"
              aria-selected={pane.id === snapshot.activePaneId}
              disabled={!allowsMutation}
              onClick={() => { if (allowsMutation) controller.setActivePane(pane.id); }}
            >
              {definitions.get(pane.id)!.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" data-pane-id={snapshot.activePaneId}>{active?.content}</div>
        {stateFeedback}
      </div>
    );
  }

  if (visible.length === 2 && snapshot.orientation === "horizontal") {
    const first = visible[0]!;
    const second = visible[1]!;
    return (
      <NSESplitView
        {...props}
        className={`nse-split-view-adapter ${className}`.trim()}
        aria-label={ariaLabel}
        aria-disabled={hostDisabled || undefined}
        data-nse-control="split-view"
        data-state={state.kind}
        dir={dir}
        sidebar={(
          <div
            ref={(node) => { if (node) paneNodes.current.set(first.id, node); else paneNodes.current.delete(first.id); }}
            tabIndex={-1}
            data-pane-id={first.id}
          >
            {definitions.get(first.id)!.content}
          </div>
        )}
        sidebarWidth={first.size}
        minSidebarWidth={0}
        maxSidebarWidth={snapshot.availableSize}
        label={`Resize ${definitions.get(first.id)!.label} and ${definitions.get(second.id)!.label}`}
        onSidebarWidthChange={(width) => { if (allowsMutation) width === null ? controller.resetSizes() : controller.moveDivider(0, width - first.size); }}
      >
        <div
          ref={(node) => { if (node) paneNodes.current.set(second.id, node); else paneNodes.current.delete(second.id); }}
          tabIndex={-1}
          data-pane-id={second.id}
        >
          {definitions.get(second.id)!.content}
          {stateFeedback}
        </div>
      </NSESplitView>
    );
  }

  const coordinate = (event: ReactPointerEvent) => snapshot.orientation === "horizontal" ? event.clientX : event.clientY;
  const logicalDelta = (delta: number) => snapshot.orientation === "horizontal" && dir === "rtl" ? -delta : delta;
  const handleDividerKey = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    if (!allowsMutation) return;
    const backwards = snapshot.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const forwards = snapshot.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (event.key === backwards) controller.moveDivider(index, logicalDelta(-16));
    else if (event.key === forwards) controller.moveDivider(index, logicalDelta(16));
    else if (event.key === "Home") controller.moveDividerTo(index, "minimum");
    else if (event.key === "End") controller.moveDividerTo(index, "maximum");
    else return;
    event.preventDefault();
  };

  return (
    <div
      {...props}
      className={`nse-split-view-adapter ${className}`.trim()}
      dir={dir}
      aria-label={ariaLabel}
      aria-disabled={hostDisabled || undefined}
      data-nse-control="split-view"
      data-state={state.kind}
      data-presentation="split"
      data-orientation={snapshot.orientation}
      style={{ display: "flex", flexDirection: snapshot.orientation === "horizontal" ? "row" : "column" }}
    >
      {visible.map((pane, index) => {
        const definition = definitions.get(pane.id)!;
        const next = visible[index + 1];
        return (
          <div key={pane.id} style={{ display: "contents" }}>
            <div
              ref={(node) => { if (node) paneNodes.current.set(pane.id, node); else paneNodes.current.delete(pane.id); }}
              tabIndex={-1}
              data-pane-id={pane.id}
              style={{ flex: `0 0 ${pane.size}px` }}
            >
              {definition.content}
            </div>
            {next ? (
              <div
                role="separator"
                tabIndex={allowsMutation ? 0 : -1}
                aria-label={`Resize ${definition.label} and ${definitions.get(next.id)!.label}`}
                aria-orientation={snapshot.orientation === "horizontal" ? "vertical" : "horizontal"}
                onKeyDown={(event) => handleDividerKey(event, index)}
                onPointerDown={(event) => {
                  if (!allowsMutation || event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { divider: index, coordinate: coordinate(event) };
                }}
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag || drag.divider !== index) return;
                  const nextCoordinate = coordinate(event);
                  controller.moveDivider(index, logicalDelta(nextCoordinate - drag.coordinate));
                  drag.coordinate = nextCoordinate;
                }}
                onPointerUp={(event) => {
                  dragRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => { dragRef.current = null; }}
              />
            ) : null}
          </div>
        );
      })}
      {stateFeedback}
    </div>
  );
}
