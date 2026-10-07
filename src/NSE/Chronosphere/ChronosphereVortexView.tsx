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

import { useMemo, type PropsWithChildren } from "react";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { NSEFocusScope } from "../Focus/NSEFocusPort";
import type { ChronosphereDisposable } from "./chronosphereEnvironment";
import { useChronosphereEnvironment } from "./chronosphereEnvironment";
import { ChronosphereStage, type ChronospherePlatformPort } from "./ChronosphereStage";
import type { ChronosphereViewComponent, ChronosphereViewProps } from "./chronosphereViewTypes";
import { loadVortexImages, type VortexImages } from "./Vortex/loadVortexImages";

function DetailScope({ scopeId, children }: PropsWithChildren<{ scopeId: string }>) {
  return <NSEFocusScope options={{ scopeId, kind: "modal", modal: true, trapFocus: true, asChild: true }}>{children}</NSEFocusScope>;
}

/**
 * Time Machine's archive: the history recedes into the Vortex, a timeline runs down the edge and
 * the present flies in from the window. A document subject with the `versions` layout gets Lion's
 * Versions instead, the present page beside its past.
 */
function VortexView<TDetail>({ model, actions, renderFace, renderDetail }: ChronosphereViewProps<VortexImages, TDetail>) {
  const app = useChronosphereEnvironment();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const environment = useMemo<ChronospherePlatformPort>(() => ({
    matchMedia(query) {
      if (query === "(prefers-reduced-motion: reduce)") return {
        matches: reducedMotion,
        subscribe() { return () => {}; },
        dispose() {},
      };
      let disposed = false;
      const releases = new Set<() => void>();
      return {
        get matches() { return app.mediaQueries.getSnapshot(query); },
        subscribe(listener) {
          if (disposed) return () => {};
          const unsubscribe = app.mediaQueries.subscribe(query, () => listener(app.mediaQueries.getSnapshot(query)));
          let active = true;
          const release = () => { if (!active) return; active = false; unsubscribe(); releases.delete(release); };
          releases.add(release); return release;
        },
        dispose() { disposed = true; for (const release of [...releases]) release(); },
      };
    },
    setTimeout: app.scheduler.setTimeout.bind(app.scheduler),
    clearTimeout(handle) { (handle as ChronosphereDisposable).dispose(); },
    requestAnimationFrame: app.scheduler.requestAnimationFrame.bind(app.scheduler),
    cancelAnimationFrame(handle) { (handle as ChronosphereDisposable).dispose(); },
  }), [app.mediaQueries, app.scheduler, reducedMotion]);
  return <ChronosphereStage subject={model.subject} entries={[...model.entries]} originImage={model.presentImage ?? undefined}
    curtainImage={model.foregroundImage ?? undefined} preparedImages={model.prepared} environment={environment}
    DetailFocusScopeComponent={DetailScope} PushButtonComponent={NSEPushButton} onExit={actions.exit} onRestore={actions.restore}
    renderFace={renderFace} renderDetail={renderDetail} labels={model.labels} originRect={model.presentRect ?? undefined} />;
}

/** The Vortex view decodes its four plates while Chronosphere shows its wait. */
export const ChronosphereVortexView = Object.assign(VortexView, {
  prepare: ({ images, signal }: { readonly images: Parameters<typeof loadVortexImages>[0]; readonly signal: AbortSignal }) => loadVortexImages(images, signal),
});
