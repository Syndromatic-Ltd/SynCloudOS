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

import { createContext, useCallback, useContext, useEffect, useMemo, type PropsWithChildren, type ReactNode } from "react";

import type { ColourPanelService, CommandSystem, DragEndpoint } from "../../../SynCloudOS/SynCloudOS";
import type { NSEDragCommandPort } from "../../Drag";
import type { NSEDragSessionPort } from "../../Drag/dragSessionPort";
import { NSEColourPanelController } from "./NSEColourPanelController";
import type { NSEColourPanelControllerOptions } from "./colourPanelTypes";
import { nseUnowned } from "../../Controllers/ownership";
import { useNSEDeferredDisposal } from "../../interactionLifecycle";

export type NSEColourPanelServicePort = Pick<
  ColourPanelService,
  "ownerToken" | "getSnapshot" | "getPickers" | "subscribe" | "registerPicker" | "activateTarget" |
  "open" | "close" | "choosePicker" | "preview" | "commit" | "cancel" | "addRecent" | "setSwatches"
>;

const NSEColourPanelServiceContext = createContext<NSEColourPanelServicePort | null>(null);
const NSEColourPanelControllerContext = createContext<NSEColourPanelController | null>(null);
const NSEColourPanelResponderContext = createContext<string | null>(null);
const NSEColourPanelCommandsContext = createContext<NSEDragCommandPort | null>(null);
export interface NSEColourPanelDragPort {
  readonly manager: NSEDragSessionPort;
  readonly endpoint: DragEndpoint;
  /** Issues a distinct runtime-owned endpoint for a concrete control rather
   * than reconstructing one by copying caller-visible identity fields. */
  endpointForResponder?(responderId: string): DragEndpoint;
}
const NSEColourPanelDragContext = createContext<NSEColourPanelDragPort | null>(null);

export interface NSEColourPanelProviderProps extends PropsWithChildren {
  readonly service: NSEColourPanelServicePort;
  readonly options?: NSEColourPanelControllerOptions;
  readonly commands?: NSEDragCommandPort & Pick<CommandSystem, "register">;
  readonly responderId?: string;
  readonly drag?: NSEColourPanelDragPort;
}

export function NSEColourPanelProvider({ service, options, commands, responderId, drag, children }: NSEColourPanelProviderProps) {
  if (drag && service.ownerToken !== drag.manager.ownerToken) {
    throw new TypeError("NSE colour panel and drag authorities must belong to the same runtime.");
  }
  const controller = useMemo(() => new NSEColourPanelController(service, { owner: nseUnowned, ...options }), [service, options?.owner, options?.ownerSignal, options?.preferences, options?.transferAdapter, options?.undoManager]);
  useNSEDeferredDisposal(controller);
  const commandResponderId = responderId ?? "colour-panel";
  // The panel's commands (Show Colours, …) belong to the one shared panel: a
  // provider nested inside another over the same service leaves them there.
  const outerService = useContext(NSEColourPanelServiceContext);
  const registersCommands = Boolean(commands) && outerService !== service;
  useEffect(() => registersCommands && commands ? controller.registerCommands(commands, commandResponderId) : undefined, [commands, commandResponderId, controller, registersCommands]);
  return <NSEColourPanelServiceContext.Provider value={service}><NSEColourPanelControllerContext.Provider value={controller}><NSEColourPanelResponderContext.Provider value={responderId ?? null}><NSEColourPanelCommandsContext.Provider value={commands ?? null}><NSEColourPanelDragContext.Provider value={drag ?? null}>{children}</NSEColourPanelDragContext.Provider></NSEColourPanelCommandsContext.Provider></NSEColourPanelResponderContext.Provider></NSEColourPanelControllerContext.Provider></NSEColourPanelServiceContext.Provider>;
}

export function useOptionalNSEColourPanelDrag(): NSEColourPanelDragPort | null {
  return useContext(NSEColourPanelDragContext);
}

/** The provider only supplies this when its caller established a concrete
 * responder boundary. Controls otherwise retain their standalone IDs. */
export function useOptionalNSEColourPanelResponderId(): string | null {
  return useContext(NSEColourPanelResponderContext);
}

export function useOptionalNSEColourPanelCommands(): NSEDragCommandPort | null {
  return useContext(NSEColourPanelCommandsContext);
}

export function useNSEColourPanelController(): NSEColourPanelController {
  const controller = useOptionalNSEColourPanelController();
  if (!controller) throw new Error("NSE colour controls require an NSEColourPanelProvider.");
  return controller;
}

export function useOptionalNSEColourPanelController(): NSEColourPanelController | null {
  return useContext(NSEColourPanelControllerContext);
}

export function useNSEColourPanelService(): NSEColourPanelServicePort {
  const service = useContext(NSEColourPanelServiceContext);
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
  const service = useContext(NSEColourPanelServiceContext);
  const controller = useContext(NSEColourPanelControllerContext);
  const responderId = useContext(NSEColourPanelResponderContext);
  const commands = useContext(NSEColourPanelCommandsContext);
  const drag = useContext(NSEColourPanelDragContext);
  return useCallback((children: ReactNode) => service && controller
    ? <NSEColourPanelServiceContext.Provider value={service}><NSEColourPanelControllerContext.Provider value={controller}><NSEColourPanelResponderContext.Provider value={responderId}><NSEColourPanelCommandsContext.Provider value={commands}><NSEColourPanelDragContext.Provider value={drag}>{children}</NSEColourPanelDragContext.Provider></NSEColourPanelCommandsContext.Provider></NSEColourPanelResponderContext.Provider></NSEColourPanelControllerContext.Provider></NSEColourPanelServiceContext.Provider>
    : children, [commands, controller, drag, responderId, service]);
}
