/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { createContext, useContext } from "react";
import { useObserve } from "../Objects/useObserve";
import type { NSEApplication } from "./NSEApplication";
import type { NSEAnyWindowController, NSEWindow } from "./NSEWindowController";

/** @internal Shared by the window's class and function content. */
export const MountedWindowContext = createContext<NSEAnyWindowController | null>(null);

export function useNSEWindow(): NSEWindow {
  const controller = useObserve(useContext(MountedWindowContext));
  if (!controller) throw new Error("useNSEWindow requires a mounted application window.");
  return controller.window;
}

export function useNSEApplication(): NSEApplication {
  const controller = useContext(MountedWindowContext);
  const app = useObserve(controller?.app);
  if (!app) throw new Error("useNSEApplication requires a mounted application.");
  return app;
}
