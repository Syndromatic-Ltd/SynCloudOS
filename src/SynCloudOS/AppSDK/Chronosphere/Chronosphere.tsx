/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useMemo } from "react";
import {
  Chronosphere as NSEChronosphere,
  ChronosphereGridView as NSEChronosphereGridView,
  ChronosphereVortexView as NSEChronosphereVortexView,
  VortexEffect as NSEVortexEffect,
  ChronosphereEnvironmentProvider,
  loadVortexImages as loadNSEVortexImages,
  type ChronosphereEnvironment,
  type ChronosphereProps as NSEChronosphereProps,
  type ChronospherePreparationContext as NSEPreparationContext,
  type ChronosphereViewComponent as NSEViewComponent,
  type ChronosphereViewProps,
  type VortexLayerProps,
  type VortexImages,
} from "../../../NSE/Chronosphere/hostComposition";
import { useSCOS } from "../scos/useSCOS"
import type { AppImageClient } from "../appEnvironmentClientTypes";

/** App-facing preparation retains the full scoped image client. */
export interface ChronospherePreparationContext extends Omit<NSEPreparationContext, "images"> {
  readonly images: AppImageClient;
}
export type ChronosphereViewComponent<TPrepared = unknown, TDetail = unknown> = {
  bivariantView(props: ChronosphereViewProps<TPrepared, TDetail>): ReturnType<NSEViewComponent<TPrepared, TDetail>>;
}["bivariantView"] & {
  prepare?(context: ChronospherePreparationContext): Promise<TPrepared>;
};
export interface ChronosphereProps<TPrepared = unknown, TDetail = unknown> extends Omit<NSEChronosphereProps<TPrepared, TDetail>, "view"> {
  readonly view?: ChronosphereViewComponent<TPrepared, TDetail>;
}

/** The app mount remains the authority for every service supplied to NSE. */
function useAppPresentationEnvironment(): ChronosphereEnvironment {
  const app = useSCOS();
  return useMemo(() => Object.freeze({
    signal: app.signal,
    images: app.images,
    scheduler: app.scheduler,
    mediaQueries: app.mediaQueries,
    animations: app.animations,
  }), [app.signal, app.images, app.scheduler, app.mediaQueries, app.animations]);
}

export function Chronosphere<TPrepared = unknown, TDetail = unknown>({ view = ChronosphereVortexView as unknown as ChronosphereViewComponent<TPrepared, TDetail>, ...props }: ChronosphereProps<TPrepared, TDetail>) {
  const environment = useAppPresentationEnvironment();
  const { images } = useSCOS();
  const presentation = useMemo<NSEViewComponent<TPrepared, TDetail>>(() => {
    const View = view;
    return Object.assign(
      (viewProps: ChronosphereViewProps<TPrepared, TDetail>) => <View {...viewProps} />,
      view.prepare ? { prepare: ({ signal }: NSEPreparationContext) => view.prepare!({ images, signal }) } : {},
    );
  }, [view, images]);
  return <ChronosphereEnvironmentProvider value={environment}>
    <NSEChronosphere {...props} view={presentation} />
  </ChronosphereEnvironmentProvider>;
}

export const ChronosphereVortexView = Object.assign(
  function ChronosphereVortexView<TDetail>(props: ChronosphereViewProps<VortexImages, TDetail>) {
    const environment = useAppPresentationEnvironment();
    return <ChronosphereEnvironmentProvider value={environment}><NSEChronosphereVortexView {...props} /></ChronosphereEnvironmentProvider>;
  },
  { prepare: ({ images, signal }: ChronospherePreparationContext) => loadNSEVortexImages(images, signal) },
);

export function ChronosphereGridView<TDetail>(props: ChronosphereViewProps<unknown, TDetail>) {
  const environment = useAppPresentationEnvironment();
  return <ChronosphereEnvironmentProvider value={environment}><NSEChronosphereGridView {...props} /></ChronosphereEnvironmentProvider>;
};

export function VortexEffect(props: VortexLayerProps) {
  const environment = useAppPresentationEnvironment();
  return <ChronosphereEnvironmentProvider value={environment}><NSEVortexEffect {...props} /></ChronosphereEnvironmentProvider>;
}

export function loadVortexImages(client: AppImageClient, signal: AbortSignal): Promise<VortexImages> {
  return loadNSEVortexImages(client, signal);
}
