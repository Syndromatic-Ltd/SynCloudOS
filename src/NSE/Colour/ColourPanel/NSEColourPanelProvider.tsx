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

import { createContext, useCallback, useContext, useEffect, useInsertionEffect, useMemo, type PropsWithChildren, type ReactNode } from "react";

import type { ColourPanelService, CommandSystem, DragEndpoint } from "../../../SynCloudOS/SynCloudOS";
import type { NSEDragCommandPort } from "../../Drag";
import type { NSEDragSessionPort } from "../../Drag/dragSessionPort";
import { createReactOwnedColourPanelController, observeReactOwnedColourPanelController, type NSEColourPanelController } from "./NSEColourPanelController";
import type { NSEColourPanelControllerOptions } from "./colourPanelTypes";
import { nseUnowned } from "../../Controllers/ownership";
import { useNSEDeferredDisposal } from "../../interactionLifecycle";

export type ColourPanelServicePort = Pick<
  ColourPanelService,
  "ownerToken" | "getSnapshot" | "getPickers" | "subscribe" | "registerPicker" | "activateTarget" |
  "open" | "close" | "choosePicker" | "preview" | "commit" | "cancel" | "addRecent" | "setSwatches"
>;

const ColourPanelServiceContext = createContext<ColourPanelServicePort | null>(null);
const NSEColourPanelControllerContext = createContext<NSEColourPanelController | null>(null);
const ColourPanelResponderContext = createContext<string | null>(null);
const ColourPanelCommandsContext = createContext<NSEDragCommandPort | null>(null);
export interface ColourPanelDragPort {
  readonly manager: NSEDragSessionPort;
  readonly endpoint: DragEndpoint;
  /** Issues a distinct runtime-owned endpoint for a concrete control rather
   * than reconstructing one by copying caller-visible identity fields. */
  endpointForResponder?(responderId: string): DragEndpoint;
}
const ColourPanelDragContext = createContext<ColourPanelDragPort | null>(null);

export interface NSEColourPanelProviderProps extends PropsWithChildren {
  readonly service: ColourPanelServicePort;
  readonly options?: NSEColourPanelControllerOptions;
  readonly commands?: NSEDragCommandPort & Pick<CommandSystem, "register">;
  readonly responderId?: string;
  readonly drag?: ColourPanelDragPort;
}

export function NSEColourPanelProvider({ service, options, commands, responderId, drag, children }: NSEColourPanelProviderProps) {
  if (drag && service.ownerToken !== drag.manager.ownerToken) {
    throw new TypeError("NSE colour panel and drag authorities must belong to the same runtime.");
  }
  const controller = useMemo(() => createReactOwnedColourPanelController(service, { owner: nseUnowned, ...options }), [service, options?.owner, options?.ownerSignal, options?.preferences, options?.transferAdapter, options?.undoManager]);
  useInsertionEffect(() => observeReactOwnedColourPanelController(controller), [controller]);
  useNSEDeferredDisposal(controller);
  const commandResponderId = responderId ?? "colour-panel";
  // The panel's commands (Show Colours, …) belong to the one shared panel: a provider nested
  // inside another that already registered them over the same service leaves them there.
  const outerService = useContext(ColourPanelServiceContext);
  const outerCommands = useContext(ColourPanelCommandsContext);
  const registersCommands = Boolean(commands) && !(outerService === service && outerCommands);
  useEffect(() => registersCommands && commands ? controller.registerCommands(commands, commandResponderId) : undefined, [commands, commandResponderId, controller, registersCommands]);
  return <ColourPanelServiceContext.Provider value={service}><NSEColourPanelControllerContext.Provider value={controller}><ColourPanelResponderContext.Provider value={responderId ?? null}><ColourPanelCommandsContext.Provider value={commands ?? null}><ColourPanelDragContext.Provider value={drag ?? null}>{children}</ColourPanelDragContext.Provider></ColourPanelCommandsContext.Provider></ColourPanelResponderContext.Provider></NSEColourPanelControllerContext.Provider></ColourPanelServiceContext.Provider>;
}

export function useOptionalNSEColourPanelDrag(): ColourPanelDragPort | null {
  return useContext(ColourPanelDragContext);
}

/** The provider only supplies this when its caller established a concrete
 * responder boundary. Controls otherwise retain their standalone IDs. */
export function useOptionalNSEColourPanelResponderId(): string | null {
  return useContext(ColourPanelResponderContext);
}

export function useOptionalNSEColourPanelCommands(): NSEDragCommandPort | null {
  return useContext(ColourPanelCommandsContext);
}

export function useNSEColourPanelController(): NSEColourPanelController {
  const controller = useOptionalNSEColourPanelController();
  if (!controller) throw new Error("NSE colour controls require an NSEColourPanelProvider.");
  return controller;
}

export function useOptionalNSEColourPanelController(): NSEColourPanelController | null {
  return useContext(NSEColourPanelControllerContext);
}

export function useNSEColourPanelService(): ColourPanelServicePort {
  const service = useContext(ColourPanelServiceContext);
  if (!service) throw new Error("NSE colour controls require an NSEColourPanelProvider.");
  return service;
}

/**
 * Carries the colour panel's context into content presented somewhere React
 * context does not reach, such as a panel hosted in a bridged window: wrap
 * that content with the returned function, and its colour wells talk to the
 * same shared colour panel as the rest of the app. Without a provider it
 * returns the content unchanged.
 */
export function useNSEColourPanelContextCarrier(): (children: ReactNode) => ReactNode {
  const service = useContext(ColourPanelServiceContext);
  const controller = useContext(NSEColourPanelControllerContext);
  const responderId = useContext(ColourPanelResponderContext);
  const commands = useContext(ColourPanelCommandsContext);
  const drag = useContext(ColourPanelDragContext);
  return useCallback((children: ReactNode) => service && controller
    ? <ColourPanelServiceContext.Provider value={service}><NSEColourPanelControllerContext.Provider value={controller}><ColourPanelResponderContext.Provider value={responderId}><ColourPanelCommandsContext.Provider value={commands}><ColourPanelDragContext.Provider value={drag}>{children}</ColourPanelDragContext.Provider></ColourPanelCommandsContext.Provider></ColourPanelResponderContext.Provider></NSEColourPanelControllerContext.Provider></ColourPanelServiceContext.Provider>
    : children, [commands, controller, drag, responderId, service]);
}
