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

import React, { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { GFXShadowValue } from "../../FX/GraphicsFX/public";
import { GFXShadow } from "../../FX/GraphicsFX/public";

export interface NSEShadowPreferenceSnapshot {
  readonly reducedTransparency: boolean;
  readonly forcedColours: boolean;
}

export interface NSEShadowPreferenceSource {
  getSnapshot(): NSEShadowPreferenceSnapshot;
  subscribe(listener: () => void): () => void;
}

const defaultPreferenceSnapshot = Object.freeze({ reducedTransparency: false, forcedColours: false });
const noPreferences: NSEShadowPreferenceSource = Object.freeze({
  getSnapshot: () => defaultPreferenceSnapshot,
  subscribe: () => () => undefined,
});

export function NSEShadowView({
  shadow,
  children,
  className,
  reducedTransparency,
  forcedColours,
  preferenceSource,
}: {
  readonly shadow: GFXShadowValue;
  readonly children: ReactNode;
  readonly className?: string;
  readonly reducedTransparency?: boolean;
  readonly forcedColours?: boolean;
  readonly preferenceSource?: NSEShadowPreferenceSource;
}) {
  const value = shadow instanceof GFXShadow ? shadow : new GFXShadow(shadow);
  const preferences = useSyncExternalStore(
    preferenceSource?.subscribe ?? noPreferences.subscribe,
    preferenceSource?.getSnapshot ?? noPreferences.getSnapshot,
    preferenceSource?.getSnapshot ?? noPreferences.getSnapshot,
  );
  const flatten = (reducedTransparency ?? preferences.reducedTransparency) || (forcedColours ?? preferences.forcedColours);
  const colour = value.colour.toCSS();
  const recipe = `${value.offset.x}px ${value.offset.y}px ${value.blur}px ${value.spread}px ${colour}`;
  const style = {
    "--nse-shadow-offset-x": `${value.offset.x}px`,
    "--nse-shadow-offset-y": `${value.offset.y}px`,
    "--nse-shadow-blur": `${value.blur}px`,
    "--nse-shadow-spread": `${value.spread}px`,
    "--nse-shadow-colour": colour,
    boxShadow: flatten ? "none" : recipe,
  } as CSSProperties;
  return (
    <div
      className={className}
      data-nse-shadow-recipe={flatten ? "suppressed" : "semantic"}
      data-nse-shadow-protect-focus="true"
      style={style}
    >
      {children}
    </div>
  );
}
