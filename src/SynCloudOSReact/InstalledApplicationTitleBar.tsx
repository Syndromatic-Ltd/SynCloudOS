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

import { useEffect, useState } from "react";
import { WindowTitleBar } from "../NSE/hostComposition";
import { useKernelSynCloudOS } from "./SynCloudOSProvider";
interface WindowControlsOverlay extends EventTarget { readonly visible: boolean; getTitlebarAreaRect(): DOMRect }
/** The browser owns native window buttons; Atmo paints the declared draggable title area. */
export function InstalledApplicationTitleBar() {
  const runtime = useKernelSynCloudOS();
  const document = runtime.environment.browser.getDocument();
  const browserWindow = document?.defaultView;
  const overlay = (browserWindow?.navigator as (Navigator & { windowControlsOverlay?: WindowControlsOverlay }) | undefined)?.windowControlsOverlay;
  const [geometry, setGeometry] = useState<{ x: number; y: number; width: number; height: number; active: boolean } | null>(null);
  useEffect(() => {
    if (!overlay || !browserWindow) return;
    const update = () => { const rect = overlay.getTitlebarAreaRect(); setGeometry(overlay.visible ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, active: document?.hasFocus() ?? false } : null); };
    update(); overlay.addEventListener("geometrychange", update); browserWindow.addEventListener("focus", update); browserWindow.addEventListener("blur", update);
    return () => { overlay.removeEventListener("geometrychange", update); browserWindow.removeEventListener("focus", update); browserWindow.removeEventListener("blur", update); };
  }, [overlay, browserWindow, document]);
  if (!geometry) return null;
  return <div data-syncloudos-window-controls-overlay="" style={{ position: "fixed", zIndex: 10000, left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height, "--nse-window-titlebar-height": `${geometry.height}px`, overflow: "hidden", WebkitAppRegion: "drag" } as import("react").CSSProperties}>
    <WindowTitleBar title={document?.title ?? "Webspring"} isKeyWindow={geometry.active} />
  </div>;
}
