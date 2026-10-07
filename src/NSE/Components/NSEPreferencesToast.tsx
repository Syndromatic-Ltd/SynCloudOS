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

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import "./nsePreferencesToast.css";
import { NSEPresence, useNSEAnimationEnvironment, useNSEPresentation } from "../Animation";
import {
  resolveNSEPreferencesTransitions,
  type NSEPreferencesPaneDirection,
  type NSEPreferencesTransitions,
} from "./NSEPreferencesToast.transitions";
import { NSEListItem } from "../Controls/Selection/NSEListItem";
import { NSEFocusScope, resolveNSEFocusReturnTarget } from "../Focus";
import { NSEPageHeader } from "../Windows/Chrome/NSEPageHeader";
import { NSEToolButton } from "../Controls/Buttons/NSEButtonFamilies";
import { projectNSEAppearance, useNSEAppearance } from "../Appearance";

/**
 * Preferences, as a panel that glides up from the lower screen and settles in
 * the centre of a desk that dims and blurs behind it.
 *
 * Navigation is a push stack rather than a split view: the list slides out to
 * the left and the chosen pane comes in from the right, with a back control in
 * the header, which is what a panel this narrow wants.
 * The header is the real NSEPageHeader in its centred variant, so the plate,
 * the corner radius and the type come from the skin rather than from here.
 */

export interface NSEPreferencePane {
  id: string;
  label: ReactNode;
  /** Secondary line on the list row — usually the current value. */
  meta?: ReactNode;
  /**
   * A control shown on the ROOT list row, before the chevron — a master switch
   * for what the pane contains. Clicks inside it never navigate.
   */
  accessory?: ReactNode;
  render: () => ReactNode;
}

export interface NSEPreferencesToastProps {
  open: boolean;
  /** Runtime hosts can provide a stable logical scope identity. */
  focusScopeId?: string;
  title: ReactNode;
  panes: NSEPreferencePane[];
  /** Open straight onto this pane instead of the root list. */
  initialPane?: string;
  /** Accessible name for the circular back control. */
  backLabel: string;
  /** Appearance is projected onto the portal so each runtime keeps its theme. */
  appearance?: "auto" | "light" | "dark";
  resolvedMode?: "light" | "dark";
  runtimeOwner?: string;
  onClose: () => void;
}

const BackArrow = (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
    <path
      d="M15 4 L7 12 L15 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type PaneDirection = NSEPreferencesPaneDirection;

/** The way the pane stack last moved. A context rather than a prop, so a title
 * or pane already leaving takes its exit from the navigation that removed it
 * (as Framer Motion's AnimatePresence `custom` did). */
const PaneDirectionContext = createContext<PaneDirection>("forward");

function usePreferencesTransitions(): NSEPreferencesTransitions {
  return resolveNSEPreferencesTransitions(useNSEAnimationEnvironment().reducedMotion);
}

/** The desk's dim and blur, its own element so they ramp without dragging the
 * panel's opacity along. */
function PreferencesVeil() {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, usePreferencesTransitions().veil);
  return <div ref={ref} className="nse-prefs-veil" aria-hidden="true" />;
}

/** A header title, passing through the other one as the stack moves. */
function PaneTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useNSEPresentation(ref, usePreferencesTransitions().title(useContext(PaneDirectionContext)));
  return <span ref={ref} className="nse-prefs-title">{children}</span>;
}

/** A pane, pushed in and popped out as the stack moves. */
function PaneSlide({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, usePreferencesTransitions().pane(useContext(PaneDirectionContext)));
  return <div ref={ref} className="nse-prefs-pane">{children}</div>;
}

function BackSlot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useNSEPresentation(ref, usePreferencesTransitions().back);
  return <span ref={ref} className="nse-prefs-back-slot">{children}</span>;
}

/** The panel's body, at the height of the pane it shows, springing between
 * heights as panes swap or change size. */
function PreferencesBody({ height, children }: { height: number | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resize } = usePreferencesTransitions();
  useNSEPresentation(ref, {
    state: height === null ? "auto" : String(height),
    // The first measurement simply sets the height.
    enter: (previous) => previous === null || previous === "auto" || height === null ? null : {
      duration: resize.duration, timing: resize.timing,
      tracks: [{ keyPath: "height", values: [Number(previous), height] }],
    },
  });
  return <div ref={ref} className="nse-prefs-body" style={{ height: height ?? "auto" }}>{children}</div>;
}

/** The panel itself, gliding up from the lower screen. */
function PreferencesPanel({ panelRef, ...attributes }: HTMLAttributes<HTMLDivElement> & { panelRef: RefObject<HTMLDivElement | null> }) {
  useNSEPresentation(panelRef, usePreferencesTransitions().toast);
  return <div ref={panelRef} {...attributes} />;
}


export function NSEPreferencesToast({ open, focusScopeId, title, panes, initialPane, backLabel, appearance, resolvedMode, runtimeOwner, onClose }: NSEPreferencesToastProps) {
  const inheritedAppearance = useNSEAppearance();
  const requestedAppearance = appearance ?? inheritedAppearance.requestedColourScheme;
  const projectedMode = resolvedMode ?? inheritedAppearance.resolvedColourScheme;
  const appearanceProjection = projectNSEAppearance({
    ...inheritedAppearance,
    requestedColourScheme: requestedAppearance,
    resolvedColourScheme: projectedMode,
  });
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [direction, setDirection] = useState<PaneDirection>("forward");

  // The panel grows and shrinks to the pane it is showing, the way a System
  // Preferences window does.
  //
  // The height is DRIVEN rather than left to the content, because the two panes
  // overlap during a swap and an auto height would track whichever is taller
  // instead of where it is heading.
  //
  // What is measured is the pane's CONTENT wrapper, never the pane itself: the
  // pane is stretched to the animated height, so measuring it would feed its own
  // output back in as its next input.
  //
  // A ResizeObserver rather than a measure-on-swap, because a pane also changes
  // height in place — turning the notifications master switch off adds a line of
  // explanation under the list.
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);

  // Only ever remembers a node, never forgets one. React hands the outgoing
  // pane's ref callback a null AFTER the incoming pane has already registered,
  // so honouring that null would drop the live node and leave the panel
  // measuring something no longer in the document.
  const trackContent = useCallback((node: HTMLDivElement | null) => {
    if (node) setContentNode(node);
  }, []);

  useLayoutEffect(() => {
    if (!contentNode) return;
    const measure = () => {
      // A detached node reports offsetHeight 0. Reading one is what collapsed
      // the panel to its header and never recovered: the observer outlived the
      // element it was watching.
      if (contentNode.isConnected) setBodyHeight(contentNode.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [contentNode]);

  const goToPane = useCallback((id: string | null) => {
    setDirection(id === null ? "back" : "forward");
    setActiveId(id);
  }, []);

  // Opening lands wherever the CALLER asked for, not wherever the panel was
  // last left. Nothing resets on close: the panel is still on screen playing its
  // exit, and swapping its contents mid-flight would show the wrong pane sliding
  // away. The presence's onExitComplete does the reset instead.
  useEffect(() => {
    if (!open) return;
    setDirection("forward");
    setActiveId(initialPane ?? null);
  }, [initialPane, open]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = resolveNSEFocusReturnTarget(document.activeElement);
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      restoreFocusRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = null;
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  const active = panes.find((pane) => pane.id === activeId) ?? null;

  // Mounted whether or not it is open: returning null on close would unmount the
  // panel on the same frame the flag flips, and the exit would never play.
  return createPortal(
    <NSEPresence onExitComplete={() => setActiveId(null)}>
      {open ? (
        <NSEFocusScope options={{ scopeId: focusScopeId ?? "nse-preferences-toast", kind: "modal", modal: true, trapFocus: true, asChild: true }}>
          <div
            className="nse-prefs-backdrop"
            {...appearanceProjection}
            data-appearance={requestedAppearance}
            data-mode={projectedMode}
            data-syncloudos-runtime-owner={runtimeOwner}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
          <PreferencesVeil />
          <PreferencesPanel
            panelRef={dialogRef}
            className="nse-prefs-toast"
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : undefined}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              if (activeId) goToPane(null);
              else onClose();
            }}
          >
            <PaneDirectionContext.Provider value={direction}>
            {/* No data-corners="all": only the TOP two corners are round, and they
                carry the same radius as the panel's own bottom two, so the header
                reads as the cap of one shape rather than a rounded box stacked on
                another. */}
            <NSEPageHeader
              className="nse-prefs-header"
              align="center"
              title={(
                // Clipped and relatively positioned so the two titles can pass
                // through each other without either escaping the plate or
                // changing the header's height while it happens.
                <span className="nse-prefs-title-clip">
                  <NSEPresence initial={false}>
                    <PaneTitle key={active ? active.id : "__root"}>
                      {active ? active.label : title}
                    </PaneTitle>
                  </NSEPresence>
                </span>
              )}
              leading={(
                <NSEPresence initial={false}>
                  {active ? (
                    <BackSlot key="back">
                      <NSEToolButton
                        className="nse-prefs-back"
                        icon={BackArrow}
                        label={backLabel}
                        onClick={() => goToPane(null)}
                      />
                    </BackSlot>
                  ) : null}
                </NSEPresence>
              )}
            />
            <PreferencesBody height={bodyHeight}>
              {/* No mode="wait": the two panes cross at the same time, stacked
                  in one grid cell. Waiting made the swap a two-beat — content
                  changed, THEN the box resized — and doubled how long the whole
                  move took. */}
              <div className="nse-prefs-panes">
                <NSEPresence initial={false}>
                <PaneSlide key={active ? active.id : "__list"}>
                  <div className="nse-prefs-pane-content" ref={trackContent}>
                  {active ? active.render() : (
                    <div className="nse-prefs-list">
                      {panes.map((pane) => (
                        <NSEListItem
                          key={pane.id}
                          meta={pane.meta}
                          trailing={(
                            <span className="nse-prefs-row-tail">
                              {pane.accessory ? (
                                // The switch is a control in its own right, not
                                // part of the row's hit area — tapping it must
                                // not also push the pane it belongs to.
                                <span
                                  className="nse-prefs-row-accessory"
                                  onClick={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                >
                                  {pane.accessory}
                                </span>
                              ) : null}
                              <span className="nse-prefs-chevron" aria-hidden="true">›</span>
                            </span>
                          )}
                          onClick={() => goToPane(pane.id)}
                        >
                          {pane.label}
                        </NSEListItem>
                      ))}
                    </div>
                  )}
                  </div>
                </PaneSlide>
                </NSEPresence>
              </div>
            </PreferencesBody>
            </PaneDirectionContext.Provider>
          </PreferencesPanel>
          </div>
        </NSEFocusScope>
      ) : null}
    </NSEPresence>,
    document.body
  );
}
