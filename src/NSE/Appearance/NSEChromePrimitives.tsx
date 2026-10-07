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

import { useNSEAppearance } from "./NSEAppearanceProvider";
import type { NSEAppearanceSlotProjection } from "./appearanceProjection";
import "./nse-chrome-primitives.css";

export type NSEChromePrimitiveKind =
  | "surface"
  | "bevel"
  | "cap"
  | "splice"
  | "separator"
  | "gloss"
  | "inner-shadow";

export type NSEChromeVisualState =
  | "normal"
  | "hover"
  | "pressed"
  | "selected"
  | "focused"
  | "disabled";

export type NSEChromeSlot = NSEAppearanceSlotProjection;

export interface NSEChromePrimitiveProps {
  readonly slot: NSEChromeSlot;
  readonly state: NSEChromeVisualState;
  readonly className?: string;
  readonly id?: string;
  readonly "data-testid"?: string;
}

interface NSEChromeLayerProps extends NSEChromePrimitiveProps {
  readonly kind: NSEChromePrimitiveKind;
}

function classes(...values: readonly (string | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

/**
 * A non-interactive paint layer. It receives state and the selected recipe
 * from its semantic owner; it never manages selection, focus, routing,
 * overflow, commands, or pointer input.
 */
export function NSEChromePrimitive({
  kind,
  slot,
  state,
  className,
  ...attributes
}: NSEChromeLayerProps) {
  const appearance = useNSEAppearance();
  const active = slot.recipeId !== null;
  return (
    <span
      {...attributes}
      className={classes("nse-chrome-primitive", className)}
      aria-hidden="true"
      {...slot.attributes}
      data-nse-chrome-appearance={appearance.appearance.id}
      data-nse-chrome-primitive={kind}
      data-nse-chrome-state={state}
      data-nse-chrome-active={active ? "true" : "false"}
    />
  );
}

function layer(kind: NSEChromePrimitiveKind) {
  return function NSEChromeLayer(props: NSEChromePrimitiveProps) {
    return <NSEChromePrimitive {...props} kind={kind} />;
  };
}

export const NSEChromeSurface = layer("surface");
export const NSEChromeBevel = layer("bevel");
export const NSEChromeCap = layer("cap");
export const NSEChromeSplice = layer("splice");
export const NSEChromeSeparator = layer("separator");
export const NSEChromeGloss = layer("gloss");
export const NSEChromeInnerShadow = layer("inner-shadow");
