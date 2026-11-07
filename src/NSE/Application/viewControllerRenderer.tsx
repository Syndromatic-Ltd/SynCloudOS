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

import { createContext, useContext, type ComponentType } from "react";

import type { NSEViewController } from "./NSEViewController";
import { useObserve } from "../Objects/useObserve";
import { nseChildTransition, NSETransitionSlot } from "./viewControllerTransition";

/** The host component that mounts a view controller's view: attaches it, feeds it traits and activity. */
export type NSEViewControllerRenderer = ComponentType<{
  readonly controller: NSEViewController<unknown>;
  readonly className?: string;
}>;

const NSEViewControllerRendererContext = createContext<NSEViewControllerRenderer | null>(null);

/** @internal The application host provides its view controller renderer to every view it mounts. */
export const NSEViewControllerRendererProvider = NSEViewControllerRendererContext.Provider;

/**
 * Renders a child view controller's view through the application host, as a container view
 * controller (a split view controller's items) places its children's views in its own.
 */
export function NSEChildViewControllerView({ controller, className }: {
  readonly controller: NSEViewController<unknown>;
  readonly className?: string;
}) {
  const Renderer = useContext(NSEViewControllerRendererContext);
  const parent = useObserve(controller.parent);
  if (!Renderer) throw new Error(`${controller.constructor.name}'s view can only be shown inside a view an application hosts.`);
  const transition = parent?.[nseChildTransition](controller);
  if (transition) return <NSETransitionSlot transition={transition} Renderer={Renderer} className={className} />;
  return <Renderer controller={controller} className={className} />;
}
