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


import "./nse-chrome-primitives.css";
import { nseStateHooks } from "../Theme/contract/hooks";

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


export interface NSEChromePrimitiveProps {
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
  state,
  className,
  ...attributes
}: NSEChromeLayerProps) {

  return (
    <span
      {...attributes}
      className={classes("nse-chrome-primitive", className)}
      aria-hidden="true"
      data-nse-chrome-primitive={kind}
      data-nse-chrome-state={state}
      data-nse-chrome-active="true"
      data-nse-style={kind}
      {...nseStateHooks({ hovered: state === "hover", highlighted: state === "pressed", selected: state === "selected", focused: state === "focused", enabled: state !== "disabled" })}
      data-nse-part={kind === "surface" ? "background" : kind === "bevel" || kind === "cap" ? "border" : kind === "splice" || kind === "separator" ? "separator" : kind === "gloss" ? "highlight" : "shadow"}
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
