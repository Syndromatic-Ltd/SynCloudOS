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
import type { NSEMenuRuntimePort } from "../../NSE/Menus";
import { nseActionCommandId } from "../../NSE/Controls/Core/actionCommandId";
import { useSCOS } from "./scos/useSCOS"
import type { AppClientHandle } from "./appClientTypes";
import type { CommandDispatchResult } from "../SynCloudOS";
import type { SynWareContextValue } from "./appContextTypes";

/**
 * Adapts the mounted app's narrow command and scheduler clients to the menu
 * control contract. The adapter deliberately has no key-binding or responder
 * manager escape hatch: those remain host-owned when a menu is presented.
 */
export function createSynWareMenuRuntime(app: Pick<SynWareContextValue, "appId" | "signal" | "commands" | "scheduler">): NSEMenuRuntimePort {
  return Object.freeze<NSEMenuRuntimePort>({
    signal: app.signal,
    commands: {
      getPresentationGeneration: app.commands.getPresentationGeneration.bind(app.commands),
      validateMany: app.commands.validateMany.bind(app.commands),
      prepareDispatch: app.commands.prepareDispatch.bind(app.commands),
      dispatch: (id, payload, options) => app.commands.dispatch<CommandDispatchResult<unknown>>(id, payload, options),
    },
    scheduler: {
      setTimeout: app.scheduler.setTimeout.bind(app.scheduler),
      clearTimeout(handle: unknown) {
        (handle as AppClientHandle).dispose();
      },
    },
    resolveAction: (action) => nseActionCommandId(app.appId, action),
  });
}

export function useNSEMenuPort(): NSEMenuRuntimePort {
  const app = useSCOS();
  return useMemo(() => createSynWareMenuRuntime({ appId: app.app.bundleIdentifier, signal: app.signal, commands: app.commands, scheduler: app.scheduler }),
    [app.app.bundleIdentifier, app.commands, app.scheduler, app.signal]);
}
