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
  Component,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { NSEButton } from "@syndromatic/syncloudos/nse/controls";
import { useObserve, type NSEOwner } from "../NSE/sdkPackageEntry";
import { useKernelSynCloudOS } from "../SynCloudOSReact";
import { useWebspringLocale } from "./webspringLocale";
import { WebspringSurface, webspringSurfaceStyle } from "./webspringSurface";
import {
  captureWSWidgetClass,
  isWSWidgetDescriptor,
  WSWidget,
  wsBindWidgetHost,
  wsStartWidgetLoad,
  type WSWidgetClass,
  type WSWidgetDescriptor,
  type WSWidgetState,
} from "./WSWidget";
import type { WSActionResult, WSWidgetEntry } from "./webspringTypes";
import "./WSWidgetShelfView.css";

/** Props accepted by `WSWidgetShelfView` until launcher controllers provide them via context. */
export interface WSWidgetShelfViewProps {
  readonly entries?: readonly WSWidgetEntry[];
  readonly widgets?: readonly (WSWidgetDescriptor | WSWidgetClass)[];
  /** The shelf's background, from `launcher.shelfSurface`. */
  readonly surface?: WebspringSurface;
  /** Optional owning controller whose disposal tears down live widgets. */
  readonly owner?: NSEOwner;
}

/** The widgets of a shelf, kept as the same list while its members are unchanged. */
function useStableList<T>(list: readonly T[]): readonly T[] {
  const stable = useRef(list);
  if (stable.current.length !== list.length || stable.current.some((item, index) => item !== list[index])) stable.current = list;
  return stable.current;
}

/** A widget whose view throws shows its error state; the rest of the Board is untouched. */
class WidgetViewBoundary extends Component<{ readonly onFailure: ReactNode; readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.onFailure : this.props.children; }
}

function WidgetContent({ widget }: { readonly widget: WSWidget }) {
  useObserve(widget);
  if (widget.isDisposed) return null;
  if (typeof widget.renderView === "function") return <>{widget.renderView()}</>;
  const View = (widget.constructor as { readonly view?: ComponentType<{ readonly controller: WSWidget }> }).view;
  if (!View) throw new TypeError(`${widget.constructor.name} has no static view or renderView; declare one rendering form.`);
  return <View controller={widget} />;
}

function isHidden(entry: WSWidgetEntry, state: WSWidgetState | undefined) {
  return state?.status === "empty" && entry.widget.whenEmpty === "hide";
}

/**
 * The widgets beneath a view's icons, on the `shelf` surface. It constructs each widget in
 * the shelf's ownership scope, draws the loading, empty, error and timeout states around
 * its view, and renders nothing at all when no widget is showing.
 */
export function WSWidgetShelfView({ entries, widgets, surface, owner }: WSWidgetShelfViewProps = {}) {
  const runtime = useKernelSynCloudOS();
  const locale = useWebspringLocale();

  const resolvedEntries = useMemo((): readonly WSWidgetEntry[] => {
    if (entries) return entries;
    return (widgets ?? []).map((candidate) => {
      const widget = isWSWidgetDescriptor(candidate) ? candidate : captureWSWidgetClass(candidate);
      return {
        widget,
        title: locale.t(widget.title.key, widget.title.fallback ?? widget.title.key),
        iconUrl: null,
        emptyMessage: widget.whenEmpty === "hide"
          ? null
          : locale.t(widget.whenEmpty.message.key, widget.whenEmpty.message.fallback ?? widget.whenEmpty.message.key),
      };
    });
  }, [entries, locale, widgets]);

  const stableEntries = useStableList(resolvedEntries);
  const navigate = useCallback(async (route: string): Promise<WSActionResult> => {
    const result = await runtime.routes.openRoute(route, { source: "webspring-widget" }).result;
    if (result.status === "completed") return { status: "completed" };
    if (result.status === "cancelled") return { status: "cancelled" };
    return { status: "failed", message: result.error.message };
  }, [runtime]);

  const [liveWidgets, setLiveWidgets] = useState<readonly WSWidget[]>([]);

  useLayoutEffect(() => {
    if (stableEntries.length === 0 || owner?.ownerSignal?.aborted) {
      setLiveWidgets([]);
      return;
    }
    const lifetime = new AbortController();
    const onOwnerAbort = () => lifetime.abort();
    owner?.ownerSignal?.addEventListener("abort", onOwnerAbort, { once: true });

    const created = stableEntries.map((entry) => {
      const widget = owner
        ? new entry.widget.WidgetClass({ owner })
        : new entry.widget.WidgetClass({ ownerSignal: lifetime.signal });
      widget[wsBindWidgetHost]({ timers: runtime.environment, navigate });
      widget[wsStartWidgetLoad]();
      return widget;
    });
    setLiveWidgets(created);

    return () => {
      owner?.ownerSignal?.removeEventListener("abort", onOwnerAbort);
      lifetime.abort();
      for (const widget of created) {
        if (!widget.isDisposed) widget.dispose();
      }
    };
  }, [navigate, owner, runtime, stableEntries]);

  const statesRef = useRef<{ widgets: readonly WSWidget[]; states: readonly WSWidgetState[] }>({
    widgets: [],
    states: Object.freeze([]),
  });

  const subscribe = useCallback((listener: () => void) => {
    if (liveWidgets.length === 0) return () => undefined;
    const unsubscribes = liveWidgets.map((widget) => widget.subscribe(listener));
    return () => {
      for (const stop of unsubscribes) stop();
    };
  }, [liveWidgets]);

  const getSnapshot = useCallback((): readonly WSWidgetState[] => {
    const current = statesRef.current;
    if (
      current.widgets === liveWidgets
      && current.states.length === liveWidgets.length
      && liveWidgets.every((widget, index) => Object.is(current.states[index], widget.state))
    ) {
      return current.states;
    }
    const next = Object.freeze(liveWidgets.map((widget) => widget.state));
    statesRef.current = { widgets: liveWidgets, states: next };
    return next;
  }, [liveWidgets]);

  const states = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (stableEntries.length === 0 || liveWidgets.length !== stableEntries.length) return null;
  if (stableEntries.every((entry, index) => isHidden(entry, states[index]))) return null;

  const retry = locale.t("widgets.retry", "Retry");
  const shelfSurface = surface ?? WebspringSurface.plain("#0b0d11");

  const panels = stableEntries.map((entry, index) => {
    const widget = liveWidgets[index];
    const state = states[index];
    if (!widget || !state || isHidden(entry, state)) return null;
    const descriptor = entry.widget;
    const failure = (reason: "failed" | "timeout") => <>
      <p data-nse-part="status" className="webspring-widget-status" role="alert">
        {reason === "timeout"
          ? locale.t("widgets.timeout", "This is taking too long to load.")
          : locale.t("widgets.error", "This could not be loaded.")}
      </p>
      <NSEButton appearance="darkAqua" title={retry} onClick={() => widget.refresh()} />
    </>;
    let body: ReactNode;
    if (state.status === "loading") {
      body = <p data-nse-part="status" className="webspring-widget-status" role="status">{locale.t("widgets.loading", "Loading…")}</p>;
    } else if (state.status === "error") {
      body = failure(state.reason);
    } else if (state.status === "empty") {
      body = <p data-nse-part="status" className="webspring-widget-status">{entry.emptyMessage}</p>;
    } else {
      body = <WidgetViewBoundary onFailure={failure("failed")}>
        <WidgetContent widget={widget} />
      </WidgetViewBoundary>;
    }
    return <section key={descriptor.id} data-nse-part="item" className="webspring-widget" data-widget-id={descriptor.id} data-widget-state={state.status} aria-busy={state.status === "loading"} aria-labelledby={`webspring-widget-${descriptor.id}-title`}>
      <header data-nse-part="header" className="webspring-widget-header">
        {entry.iconUrl ? <img data-nse-part="image" src={entry.iconUrl} alt="" aria-hidden="true" /> : null}
        <h2 data-nse-part="title" id={`webspring-widget-${descriptor.id}-title`}>{entry.title}</h2>
      </header>
      {body}
    </section>;
  });

  return <div data-nse-control="view" data-nse-part="background" data-nse-role="widget-shelf" className="webspring-widget-shelf" style={webspringSurfaceStyle(shelfSurface, "--webspring-shelf")} aria-label={locale.t("widgets.ariaLabel", "Widgets")} role="region">
    <div data-nse-part="decoration" data-nse-role="material" className="webspring-widget-shelf-overlay" aria-hidden="true" />
    <div data-nse-part="content" className="webspring-widget-list">{panels}</div>
  </div>;
}
