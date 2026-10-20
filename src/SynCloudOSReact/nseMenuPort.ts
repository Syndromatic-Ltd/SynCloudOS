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

import { useContext, useMemo } from "react";
import { nseActionCommandId } from "../NSE/Controls/Core/actionCommandId";
import { SynWareRuntimeContext, SynCloudOSRuntimeContext } from "./runtimeContext";

/**
 * Structural command-menu port. It intentionally lives in the React runtime layer
 * so NSE menus cannot acquire an ambient runtime or responder graph.
 */
export function useRuntimeNSEMenuPort() {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  return useMemo(() => {
    if (appRuntime) return {
      signal: appRuntime.signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validateMany: appRuntime.commands.validateMany.bind(appRuntime.commands),
        prepareDispatch: appRuntime.commands.prepareDispatch.bind(appRuntime.commands),
        dispatch: appRuntime.commands.dispatch.bind(appRuntime.commands),
      },
      scheduler: {
        setTimeout: appRuntime.platform.setTimeout.bind(appRuntime.platform),
        clearTimeout: appRuntime.platform.clearTimeout.bind(appRuntime.platform),
      },
      resolveAction: (action: string) => nseActionCommandId(appRuntime.app.id, action),
    };
    if (!kernelRuntime) throw new Error("useRuntimeNSEMenuPort must be used within SynCloudOSProvider or a mounted SynWare.");
    return {
      signal: kernelRuntime.signal,
      commands: {
        getPresentationGeneration: () => ({
          registryGeneration: kernelRuntime.commands.inspect().generation,
          responderGeneration: kernelRuntime.responders.generation,
        }),
        validateMany: kernelRuntime.commands.validateMany.bind(kernelRuntime.commands),
        prepareDispatch: kernelRuntime.commands.prepareDispatch.bind(kernelRuntime.commands),
        dispatch: kernelRuntime.commands.dispatch.bind(kernelRuntime.commands),
      },
      keyBindings: {
        claimKeyboardEvent: kernelRuntime.keyBindings.claimKeyboardEvent.bind(kernelRuntime.keyBindings),
        handleKeyboardEvent: kernelRuntime.keyBindings.handleKeyboardEvent.bind(kernelRuntime.keyBindings),
      },
      scheduler: {
        setTimeout: kernelRuntime.environment.setTimeout.bind(kernelRuntime.environment),
        clearTimeout: kernelRuntime.environment.clearTimeout.bind(kernelRuntime.environment),
      },
    };
  }, [appRuntime, kernelRuntime]);
}

/** Canonical command bridge for command-bound foundational controls. */
export function useRuntimeNSEControlPort() {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  return useMemo(() => {
    if (appRuntime) return {
      signal: appRuntime.signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validate: appRuntime.commands.validate.bind(appRuntime.commands),
        prepareDispatch: appRuntime.commands.prepareDispatch.bind(appRuntime.commands),
        dispatch: appRuntime.commands.dispatch.bind(appRuntime.commands),
      },
      scheduler: {
        setTimeout: appRuntime.platform.setTimeout.bind(appRuntime.platform),
        clearTimeout: appRuntime.platform.clearTimeout.bind(appRuntime.platform),
      },
    };
    if (!kernelRuntime) throw new Error("useRuntimeNSEControlPort must be used within SynCloudOSProvider or a mounted SynWare.");
    return {
      signal: kernelRuntime.signal,
      commands: {
        getPresentationGeneration: () => ({
          registryGeneration: kernelRuntime.commands.inspect().generation,
          responderGeneration: kernelRuntime.responders.generation,
        }),
        validate: kernelRuntime.commands.validate.bind(kernelRuntime.commands),
        prepareDispatch: kernelRuntime.commands.prepareDispatch.bind(kernelRuntime.commands),
        dispatch: kernelRuntime.commands.dispatch.bind(kernelRuntime.commands),
      },
      scheduler: {
        setTimeout: kernelRuntime.environment.setTimeout.bind(kernelRuntime.environment),
        clearTimeout: kernelRuntime.environment.clearTimeout.bind(kernelRuntime.environment),
      },
    };
  }, [appRuntime, kernelRuntime]);
}
