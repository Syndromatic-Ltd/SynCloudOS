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

import { useMemo, type PropsWithChildren } from "react";
import {
  NSEColourPanelProvider,
  type NSEColourPanelProviderProps,
} from "../../NSE/Colour/ColourPanel/NSEColourPanelProvider";
import type { NSEColourPanelControllerOptions } from "../../NSE/Colour/ColourPanel/colourPanelTypes";
import type { AppColourPanelClient, AppCommandClient, AppDragClient, AppUndoHistory } from "./appClientTypes";
import { createSynWareNSEColourPanelDragPort } from "./SynWareNSEDragAdapter";

/** Public UI adapter for the colour controls. Its inputs are the mounted
 * AppSDK projections; only this boundary adapts them to NSE's host-owned
 * controller implementation. */
export interface SynWareColourPanelProviderProps extends PropsWithChildren {
  readonly service: AppColourPanelClient;
  readonly commands?: AppCommandClient;
  readonly undoManager?: AppUndoHistory;
  readonly responderId?: string;
  readonly drag?: AppDragClient;
}

/** One NSE service per app client, however many providers wrap it: the
 * colour panel is shared, and NSE recognises it by this identity. */
const nseServices = new WeakMap<AppColourPanelClient, NSEColourPanelProviderProps["service"]>();

function nseServiceFor(service: AppColourPanelClient): NSEColourPanelProviderProps["service"] {
  let adapted = nseServices.get(service);
  if (!adapted) {
    adapted = Object.freeze({
      ...service,
      // NSE verifies this opaque marker against its internal drag adapter. The
      // public AppSDK client never exposes a colour-panel manager.
      ownerToken: service.authorityToken,
    }) as unknown as NSEColourPanelProviderProps["service"];
    nseServices.set(service, adapted);
  }
  return adapted;
}

export function SynWareColourPanelProvider({
  service,
  commands,
  undoManager,
  responderId,
  drag,
  children,
}: SynWareColourPanelProviderProps) {
  const nseService = useMemo(() => nseServiceFor(service), [service]);
  const nseDrag = useMemo(
    () => drag ? createSynWareNSEColourPanelDragPort(drag, service.authorityToken) : undefined,
    [drag, service.authorityToken],
  );
  const options = undoManager
    ? { undoManager: undoManager as unknown as NonNullable<NSEColourPanelControllerOptions["undoManager"]> }
    : undefined;
  return (
    <NSEColourPanelProvider
      service={nseService}
      commands={commands as unknown as NSEColourPanelProviderProps["commands"]}
      options={options}
      responderId={responderId}
      drag={nseDrag}
    >
      {children}
    </NSEColourPanelProvider>
  );
}
