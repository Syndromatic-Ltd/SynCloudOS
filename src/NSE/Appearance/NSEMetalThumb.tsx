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

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type PropsWithChildren,
} from "react";
import { useNSEVisualEnvironment } from "./useNSEVisualEnvironment";
import {
  staticNSEMaterialLight,
  type NSEMaterialLightingPort,
} from "./NSEMaterialLighting";
import "./metal-thumb.css";
export type NSEThumbMaterial = "standard" | "metal";
const LightingContext = createContext<NSEMaterialLightingPort | null>(null);
const subscribeStatic = () => () => {};
const getStatic = () => staticNSEMaterialLight;
export function NSEMaterialLightingProvider({
  value,
  children,
}: PropsWithChildren<{ value: NSEMaterialLightingPort | null }>) {
  return (
    <LightingContext.Provider value={value}>
      {children}
    </LightingContext.Provider>
  );
}
export function NSEMetalThumb({ disabled = false }: { disabled?: boolean }) {
  const lighting = useContext(LightingContext),
    appearance = useNSEVisualEnvironment();
  const active =
    !disabled &&
    appearance.contrast !== "forced";
  const light = useSyncExternalStore(
    active && lighting ? lighting.subscribe : subscribeStatic,
    active && lighting ? lighting.getSnapshot : getStatic,
    getStatic,
  );
  return (
    <span
      className="nse-metal-thumb"
      aria-hidden="true"
      data-lighting={light.active ? "reactive" : "static"}
      style={{ "--nse-metal-angle": light.angle + "rad" } as CSSProperties}
    >
      <span className="nse-metal-thumb-sheen" />
      <span className="nse-metal-thumb-texture" />
      <span className="nse-metal-thumb-rim" />
    </span>
  );
}
