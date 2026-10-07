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

import { useId, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";

import type { HFXFeedbackRequest } from "../Feedback";
import { NSEListboxPopup, useOptionalNSEOverlayProvider } from "../Overlays";
import { useNSEControlCommand, useNSEControlFeedback } from "../Controls/Core";
import { useNSETooltip, useOptionalNSETooltipProvider } from "../Tooltips";

/**
 * How the tabs are drawn. "capsule" is the joined segmented capsule; "icons"
 * is the toolbar form AppKit uses for the colour panel's modes and a
 * Preferences window's panes: a row of icons whose chosen one sits in a
 * recessed well, named by a tooltip or, with captions, beneath each icon.
 */
export type NSETabStyle = "capsule" | "icons";

export interface NSETabStripItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly accessibleLabel?: string;
  /** The tab's picture in the icons style. */
  readonly icon?: ReactNode;
  readonly panelId?: string;
  readonly disabled?: boolean;
  readonly commandId?: string;
  readonly commandPayload?: unknown;
  readonly closable?: boolean;
}

export interface NSETabStripRenderState {
  readonly instanceId: string;
  readonly enabled: readonly NSETabStripItem[];
  readonly selected?: NSETabStripItem;
}

export interface NSETabStripPresentation {
  readonly tabListClassName?: string;
  readonly directTabButtons?: boolean;
  readonly tabStyle?: NSETabStyle;
  /** Icons style: name each tab beneath its icon rather than in a tooltip. */
  readonly showsCaptions?: boolean;
}

export interface NSETabStripProps {
  readonly "aria-label": string;
  readonly items: readonly NSETabStripItem[];
  readonly tone?: "medium" | "light" | "dark" | "affirmative" | "negative";
  readonly selectedId?: string;
  readonly defaultSelectedId?: string;
  readonly maximumVisibleTabs?: number;
  readonly parentResponderId?: string;
  readonly panelIdentity?: boolean;
  readonly presentation?: NSETabStripPresentation;
  readonly selectionHaptic?: HFXFeedbackRequest;
  onSelectedIdChange?(id: string, reason: "pointer" | "keyboard"): void;
  onRequestClose?(id: string): void;
  onRequestReorder?(id: string, toIndex: number): void;
  children?(state: NSETabStripRenderState): ReactNode;
}

interface TabButtonProps {
  readonly item: NSETabStripItem;
  readonly selected: boolean;
  readonly instanceId: string;
  readonly tone: NonNullable<NSETabStripProps["tone"]>;
  readonly panelIdentity: boolean;
  readonly tabStyle: NSETabStyle;
  readonly showsCaptions: boolean;
  readonly tabRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  readonly onActivate: () => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

function tabName(item: NSETabStripItem): string {
  return item.accessibleLabel ?? (typeof item.label === "string" ? item.label : item.id);
}

/** An icon tab named only by its picture carries its name in a tooltip. */
function IconTabButton(props: TabButtonProps) {
  const tooltips = useOptionalNSETooltipProvider();
  return !props.showsCaptions && tooltips ? <TooltipTabButton {...props} /> : <TabButton {...props} title={props.showsCaptions ? undefined : tabName(props.item)} />;
}

function focusIsVisible(element: HTMLElement) {
  try { return element.matches(":focus-visible"); }
  catch { return true; }
}

function TooltipTabButton(props: TabButtonProps) {
  const binding = useNSETooltip({ content: tabName(props.item), placement: "block-end-inline-start" });
  // A toolbar names its items on hover, or to the keyboard; clicking one
  // (which focuses it) does not pop its name up over the content.
  const anchorProps = {
    ...binding.anchorProps,
    onFocus: (event: React.FocusEvent<HTMLElement>) => { if (focusIsVisible(event.currentTarget)) binding.anchorProps.onFocus?.(event); },
  };
  return <>{<TabButton {...props} anchorProps={anchorProps} />}{binding.tooltip}</>;
}

function TabButton({ item, selected, instanceId, tone, panelIdentity, tabStyle, showsCaptions, tabRefs, onActivate, onKeyDown, title, anchorProps }: TabButtonProps & { readonly title?: string; readonly anchorProps?: React.HTMLAttributes<HTMLElement> }) {
  const binding = useMemo(() => item.commandId ? { id: item.commandId, payload: item.commandPayload } : undefined, [item.commandId, item.commandPayload]);
  const command = useNSEControlCommand(binding);
  const commandEnabled = !item.commandId || Boolean(command.presentation?.enabled && !command.presentation.denied && !command.presentation.hidden && !command.presentation.stale);
  const panelId = item.panelId ?? (panelIdentity ? `tab-panel-${instanceId}-${item.id}` : undefined);

  const icons = tabStyle === "icons";
  return <button
    {...anchorProps}
    className={icons ? "nse-icon-tab" : "nse-control-button"}
    title={title}
    type="button"
    role="tab"
    id={`tab-${instanceId}-${item.id}`}
    ref={(node) => { if (node) tabRefs.current.set(item.id, node); else tabRefs.current.delete(item.id); }}
    aria-label={item.accessibleLabel}
    aria-selected={selected}
    aria-controls={panelId}
    tabIndex={selected ? 0 : -1}
    disabled={item.disabled || !commandEnabled}
    data-command-id={item.commandId}
    data-tone={tone}
    data-selected={selected ? "true" : "false"}
    data-pressed="false"
    data-loading="false"
    onClick={() => {
      if (!item.commandId) {
        onActivate();
        return;
      }
      void command.dispatch().then((result) => { if (result?.status === "executed") onActivate(); });
    }}
    onKeyDown={onKeyDown}
  >
    {icons
      ? <>
        <span data-nse-part="tab-icon" aria-hidden="true">{item.icon}</span>
        {showsCaptions ? <span data-nse-part="tab-caption">{item.label}</span> : null}
      </>
      : <span className="nse-control-button-label">{item.label}</span>}
  </button>;
}

export function NSETabStrip({
  "aria-label": ariaLabel,
  items,
  tone = "dark",
  selectedId: suppliedSelectedId,
  defaultSelectedId,
  maximumVisibleTabs,
  parentResponderId,
  panelIdentity = false,
  presentation,
  selectionHaptic,
  onSelectedIdChange,
  onRequestClose,
  onRequestReorder,
  children,
}: NSETabStripProps) {
  const { triggerNSEControlHaptic } = useNSEControlFeedback();
  const instanceId = useId().replace(/:/g, "");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const overflowRef = useRef<HTMLButtonElement>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [storedSelectedId, setStoredSelectedId] = useState(() => defaultSelectedId ?? suppliedSelectedId ?? items.find((item) => !item.disabled)?.id ?? "");
  const overlay = useOptionalNSEOverlayProvider();
  const enabled = items.filter((item) => !item.disabled);
  const selectedId = suppliedSelectedId ?? storedSelectedId;
  const selected = enabled.find((item) => item.id === selectedId) ?? enabled[0];
  const maximumVisible = Math.max(1, Math.floor(maximumVisibleTabs ?? items.length));
  const initialVisible = items.slice(0, maximumVisible);
  const visible = selected && !initialVisible.some((item) => item.id === selected.id)
    ? [...initialVisible.slice(0, -1), selected]
    : initialVisible;
  const visibleIds = new Set(visible.map((item) => item.id));
  const overflow = items.filter((item) => !visibleIds.has(item.id));
  if (overflow.length && !overlay) throw new Error("Tab overflow requires an NSEOverlayProvider.");

  const publishSelection = (id: string, reason: "pointer" | "keyboard") => {
    if (id === selected?.id) return;
    if (suppliedSelectedId === undefined) setStoredSelectedId(id);
    if (selectionHaptic !== undefined) void triggerNSEControlHaptic(selectionHaptic);
    onSelectedIdChange?.(id, reason);
  };
  const select = (id: string) => {
    publishSelection(id, "keyboard");
    queueMicrotask(() => tabRefs.current.get(id)?.focus({ preventScroll: true }));
  };
  const move = (id: string, direction: 1 | -1) => {
    if (enabled.length === 0) return;
    const index = enabled.findIndex((item) => item.id === id);
    const next = enabled[(Math.max(0, index) + direction + enabled.length) % enabled.length];
    if (next) select(next.id);
  };
  const close = (id: string) => {
    const index = enabled.findIndex((item) => item.id === id);
    const next = enabled[index + 1] ?? enabled[index - 1];
    if (id === selected?.id && next) publishSelection(next.id, "keyboard");
    onRequestClose?.(id);
    queueMicrotask(() => next && tabRefs.current.get(next.id)?.focus({ preventScroll: true }));
  };
  const tabStyle = presentation?.tabStyle ?? "capsule";
  const TabElement = tabStyle === "icons" ? IconTabButton : TabButton;
  const tabButton = (item: NSETabStripItem) => (
    <TabElement
      key={item.id}
      item={item}
      selected={item.id === selected?.id}
      instanceId={instanceId}
      tone={tone}
      panelIdentity={panelIdentity}
      tabStyle={tabStyle}
      showsCaptions={presentation?.showsCaptions === true}
      tabRefs={tabRefs}
      onActivate={() => publishSelection(item.id, "pointer")}
      onKeyDown={(event) => {
        if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
          event.preventDefault();
          const index = items.findIndex((candidate) => candidate.id === item.id);
          const nextIndex = Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
          if (nextIndex !== index) onRequestReorder?.(item.id, nextIndex);
        } else if ((event.key === "Delete" || event.key === "Backspace") && item.closable) {
          event.preventDefault();
          close(item.id);
        } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          move(item.id, 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          move(item.id, -1);
        } else if (event.key === "Home" && enabled[0]) {
          event.preventDefault();
          select(enabled[0].id);
        } else if (event.key === "End" && enabled.at(-1)) {
          event.preventDefault();
          select(enabled.at(-1)!.id);
        }
      }}
    />
  );
  const overflowButton = overflow.length ? <button ref={overflowRef} type="button" aria-label={`More ${ariaLabel}`} aria-expanded={overflowOpen} onClick={() => setOverflowOpen((open) => !open)}>…</button> : null;
  const directTabButtons = presentation?.directTabButtons === true;
  // The icons style is not a toolbar capsule and takes none of its skin.
  const tabListClassName = [tabStyle === "icons" ? "nse-icon-tabs" : "nse-control-toolbar", presentation?.tabListClassName].filter(Boolean).join(" ");
  const renderState: NSETabStripRenderState = { instanceId, enabled, selected };
  return <>
    <div className={tabListClassName} role="tablist" aria-label={ariaLabel} data-position="inline" data-grouped={tabStyle === "icons" ? undefined : "true"} data-tab-style={tabStyle} data-captions={tabStyle === "icons" && presentation?.showsCaptions ? "true" : undefined}>
      {directTabButtons ? visible.map(tabButton) : visible.map((item) => (
        <span key={item.id} role="presentation" data-nse-part="tab-item">
          {tabButton(item)}
          {item.closable ? <button type="button" aria-label={`Close ${item.accessibleLabel ?? (typeof item.label === "string" ? item.label : item.id)}`} disabled={item.disabled} onClick={() => close(item.id)}>×</button> : null}
        </span>
      ))}
      {directTabButtons ? null : overflowButton}
    </div>
    {directTabButtons && (visible.some((item) => item.closable) || overflowButton) ? <div role="presentation" data-nse-part="tab-accessories">
      {visible.filter((item) => item.closable).map((item) => <button key={item.id} type="button" aria-label={`Close ${item.accessibleLabel ?? (typeof item.label === "string" ? item.label : item.id)}`} disabled={item.disabled} onClick={() => close(item.id)}>×</button>)}
      {overflowButton}
    </div> : null}
    {overflow.length ? <NSEListboxPopup id={`tab-overflow-${instanceId}`} open={overflowOpen} anchor={overflowRef.current} parentResponderId={parentResponderId} options={overflow.map((item) => ({ id: item.id, label: item.label, value: item.id, disabled: item.disabled }))} selectedId={selected?.id} onOpenChange={setOverflowOpen} onSelect={(option) => { if (option.value) publishSelection(option.value, "pointer"); }} /> : null}
    {children?.(renderState)}
  </>;
}

