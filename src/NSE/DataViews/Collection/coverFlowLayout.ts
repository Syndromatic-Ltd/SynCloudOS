import { GFXImage } from "../../../FX/GraphicsFX/GFXImage";

/**
 * The Cover Flow collection layout: a frontal centre item, inward-facing neighbours, dense overlap and
 * progressive recession. AppKit's Cover Flow was the private `IKImageFlowView`; here it is a layout of the
 * collection view, after a custom `NSCollectionViewLayout`, and AnimationFX draws it in one retained layer
 * hierarchy whose reflections are a replicator layer.
 */

/** One item's attributes, after `NSCollectionViewLayoutAttributes` with a 3D transform. */
export interface NSECoverFlowLayoutAttributes {
  readonly id: string;
  /** The item's position relative to the selected item: 0 is the centre. */
  readonly offset: number;
  /** Horizontal offset from the centre, in the centre item's width units. */
  readonly x: number;
  /** Recession behind the centre plane, in the centre item's width units. */
  readonly z: number;
  readonly yawRadians: number;
  readonly scale: number;
}

const SIDE_YAW_RADIANS = 68 * Math.PI / 180;

/** Lays out every item around `selectedIndex`; `centreWidth` is the selected item's width. */
export function coverFlowLayoutAttributes(
  ids: readonly string[],
  selectedIndex: number,
  centreWidth: number,
): readonly NSECoverFlowLayoutAttributes[] {
  if (!Number.isFinite(centreWidth) || centreWidth <= 0) throw new RangeError("Cover Flow centre width must be positive.");
  if (!Number.isSafeInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= ids.length)
    throw new RangeError("Cover Flow selected index is outside the result set.");
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id))
    throw new TypeError("Cover Flow result IDs must be unique nonempty strings.");
  return Object.freeze(ids.map((id, index) => {
    const offset = index - selectedIndex;
    const distance = Math.abs(offset);
    const sign = Math.sign(offset);
    return Object.freeze({
      id,
      offset,
      x: distance === 0 ? 0 : sign * centreWidth * (.99 + (distance - 1) * .29),
      z: distance === 0 ? 0 : centreWidth * (.42 + (distance - 1) * .10),
      yawRadians: offset === 0 ? 0 : offset < 0 ? SIDE_YAW_RADIANS : -SIDE_YAW_RADIANS,
      scale: distance === 0 ? 1 : Math.max(.72, 1 - distance * .04),
    });
  }));
}

// Reflections: a replicator layer (CAReplicatorLayer) mirrors each item, darkened by colour modulation
// and faded by an alpha mask, as AnimationFX draws them.

/** Reflection brightness is colour modulation, leaving alpha available only for the physical fade. */
export const coverFlowReflectionBrightness = .28;
export const coverFlowReflectionOpacity = 1;

/**
 * Place a vertically-flipped result reflection so its transformed near edge
 * stays a fixed gap below the transformed source card at every Cover Flow scale.
 */
export function coverFlowReflectionFrameY(
  cardCentreY: number,
  height: number,
  scale: number,
  gap = 8,
): number {
  if (![cardCentreY, height, scale, gap].every(Number.isFinite) || height <= 0 || scale <= 0 || gap < 0)
    throw new RangeError("Cover Flow reflection geometry must be finite and positive.");
  return cardCentreY + height * scale + gap - height / 2;
}

export function coverFlowReflectionFadeMask(height = 64): GFXImage {
  if (!Number.isSafeInteger(height) || height < 2 || height > 512)
    throw new RangeError("Reflection fade-mask height must be a bounded integer.");
  const bytes = new Uint8Array(height * 4);
  for (let row = 0; row < height; row++) {
    const t = row / (height - 1);
    const smooth = t * t * (3 - 2 * t);
    // The mask is transformed with the reflection layer. Cover Flow mirrors
    // that layer vertically, so its local alpha ramp must run in the opposite
    // direction: after the mirror, the edge touching the card is strongest
    // and the reflection fades as it travels away from the source.
    const alpha = Math.round(255 * Math.pow(smooth, 1.5));
    const offset = row * 4;
    bytes[offset] = 255;
    bytes[offset + 1] = 255;
    bytes[offset + 2] = 255;
    bytes[offset + 3] = alpha;
  }
  return new GFXImage({ width: 1, height, alpha: "straight", colourSpace: "srgb", data: bytes });
}
