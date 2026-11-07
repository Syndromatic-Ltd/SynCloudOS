import { GFXColour } from "../../FX/GraphicsFX/GFXColour";

/** NSShadow's properties. shadowOffset is an NSSize: positive height points upwards. */
export interface NSEShadowOptions {
  readonly shadowColor?: string | GFXColour;
  readonly shadowOffset?: { readonly width: number; readonly height: number };
  readonly shadowBlurRadius?: number;
}

/** Internal validation shared by NSBox and NSShadow; never accepts CSS declarations. */
export function nseCSSValue(value: string, property: string, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512 || /[;{}]/u.test(value)) {
    throw new TypeError(`${name} must be one CSS ${property} value.`);
  }
  const result = value.trim();
  if (globalThis.CSS?.supports && !globalThis.CSS.supports(property, result)) {
    throw new TypeError(`${name} is not a supported CSS ${property} value.`);
  }
  return result;
}

/** NSShadow: an immutable shadow value assigned to NSView.shadow, with no extra view. */
export class NSEShadow {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowBlurRadius: number;

  constructor(options: NSEShadowOptions = {}) {
    const colour = options.shadowColor ?? "rgba(0, 0, 0, 0.333333)";
    this.shadowColor = nseCSSValue(colour instanceof GFXColour ? colour.toCSS() : colour, "color", "NSEShadow shadowColor");
    const offset = options.shadowOffset ?? { width: 0, height: 0 };
    if (!Number.isFinite(offset.width) || !Number.isFinite(offset.height)) {
      throw new RangeError("NSEShadow shadowOffset must have finite width and height.");
    }
    const blur = options.shadowBlurRadius ?? 0;
    if (!Number.isFinite(blur) || blur < 0) throw new RangeError("NSEShadow shadowBlurRadius must be finite and non-negative.");
    this.shadowOffset = Object.freeze({ width: offset.width, height: offset.height });
    this.shadowBlurRadius = blur;
    Object.freeze(this);
  }
}
