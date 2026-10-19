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

import { Component, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { NSEPushButton } from "@syndromatic/syncloudos/nse/controls";
import { useKernelSynCloudOS } from "../SynCloudOSReact";
import { useWebspringLocale } from "./webspringLocale";
import { webspringSurfaceStyle } from "./webspringSurface";
import { WebspringWidgetController, type WebspringWidgetState } from "./webspringWidget";
import type { WebspringSurface, WebspringWidgetEntry } from "./webspringTypes";
import "./WebspringWidgetShelf.css";

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

function isHidden(entry: WebspringWidgetEntry, state: WebspringWidgetState | undefined) {
  return state?.status === "empty" && entry.widget.whenEmpty === "hide";
}

/**
 * The widgets beneath a view's icons, on the `shelf` surface. It loads each widget, draws the
 * framework's loading, empty, error and timeout states around the developer's `view`, and renders
 * nothing at all, background included, when no widget is showing.
 */
export function WebspringWidgetShelf({ entries, surface }: {
  readonly entries: readonly WebspringWidgetEntry[];
  /** The shelf's background, from `model.background.shelf`. */
  readonly surface: WebspringSurface;
}) {
  const runtime = useKernelSynCloudOS();
  const locale = useWebspringLocale();
  const stableEntries = useStableList(entries);
  const widgets = useMemo(() => stableEntries.map((entry) => entry.widget), [stableEntries]);
  const controller = useMemo(() => new WebspringWidgetController(widgets, runtime.environment), [runtime, widgets]);
  const states = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  if (stableEntries.every((entry, index) => isHidden(entry, states[index]))) return null;

  const retry = locale.t("widgets.retry", "Retry");
  const panels = stableEntries.map((entry, index) => {
    const state = states[index];
    if (!state || isHidden(entry, state)) return null;
    const { widget } = entry;
    const failure = (reason: "failed" | "timeout") => <>
      <p className="webspring-widget-status" role="alert">
        {reason === "timeout"
          ? locale.t("widgets.timeout", "This is taking too long to load.")
          : locale.t("widgets.error", "This could not be loaded.")}
      </p>
      <NSEPushButton tone="dark" onClick={() => controller.refresh(widget.id)}>{retry}</NSEPushButton>
    </>;
    let body: ReactNode;
    if (state.status === "loading") {
      body = <p className="webspring-widget-status" role="status">{locale.t("widgets.loading", "Loading…")}</p>;
    } else if (state.status === "error") {
      body = failure(state.reason);
    } else if (state.status === "empty") {
      body = <p className="webspring-widget-status">{entry.emptyMessage}</p>;
    } else {
      const View = widget.view;
      body = <WidgetViewBoundary onFailure={failure("failed")}>
        <View data={state.data} refresh={() => controller.refresh(widget.id)} />
      </WidgetViewBoundary>;
    }
    return <section key={widget.id} className="webspring-widget" data-widget-id={widget.id} data-widget-state={state.status} aria-busy={state.status === "loading"} aria-labelledby={`webspring-widget-${widget.id}-title`}>
      <header className="webspring-widget-header">
        {entry.iconUrl ? <img src={entry.iconUrl} alt="" aria-hidden="true" /> : null}
        <h2 id={`webspring-widget-${widget.id}-title`}>{entry.title}</h2>
      </header>
      {body}
    </section>;
  });

  return <div className="webspring-widget-shelf" style={webspringSurfaceStyle(surface, "--webspring-shelf")} aria-label={locale.t("widgets.ariaLabel", "Widgets")} role="region">
    <div className="webspring-widget-shelf-overlay" aria-hidden="true" />
    <div className="webspring-widget-list">{panels}</div>
  </div>;
}
