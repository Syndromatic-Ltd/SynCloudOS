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

/**
 * One item's attributes at `offset` from the scroll position: 0 is the centre, ±1 the first side position.
 * Offsets between whole positions blend continuously, so the layout can follow a drag or a scroll animation.
 */
export function coverFlowItemAttributes(id: string, offset: number, centreWidth: number): NSECoverFlowLayoutAttributes {
  if (!Number.isFinite(offset)) throw new RangeError("Cover Flow offset must be finite.");
  if (!Number.isFinite(centreWidth) || centreWidth <= 0) throw new RangeError("Cover Flow centre width must be positive.");
  const distance = Math.abs(offset);
  const sign = Math.sign(offset);
  // Inside the first position the item turns, slides and recedes together; beyond it the fan only spreads.
  const turn = Math.min(1, distance);
  const beyond = Math.max(0, distance - 1);
  return Object.freeze({
    id,
    offset,
    x: distance === 0 ? 0 : sign * centreWidth * (.99 * turn + beyond * .29),
    z: centreWidth * (.42 * turn + beyond * .10),
    yawRadians: distance === 0 ? 0 : -sign * SIDE_YAW_RADIANS * turn,
    scale: Math.max(.72, 1 - distance * .04),
  });
}

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
  return Object.freeze(ids.map((id, index) => coverFlowItemAttributes(id, index - selectedIndex, centreWidth)));
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

/**
 * The collection view's Cover Flow layout (a custom `NSCollectionViewLayout`). Its properties are the layout's
 * geometry, as `NSCollectionViewFlowLayout` exposes `itemSize`: the item shape, the camera and wrapping.
 */
export interface NSECollectionViewCoverFlowLayout {
  readonly kind: "coverFlow";
  /** Width over height of every item (default 16:10). */
  readonly itemAspectRatio: number;
  /** The selected item's height as a fraction of the view's height (default 0.62). */
  readonly itemHeightFraction: number;
  /** The selected item's centre, as a fraction of the view's height from the top (default 0.47). */
  readonly itemCentreFraction: number;
  /** The camera's distance from the selected item, in item widths. Nearer is more dramatic (default 4). */
  readonly cameraDistance: number;
  /** How far the camera looks down on the items, in radians (default 0.335, AnimationFX's showcase). */
  readonly cameraPitch: number;
  /** Whether the items form an endless ring, so the last item is followed by the first (default false). */
  readonly isWrapped: boolean;
  /** Items kept at full opacity each side of the selected one before the fan fades out (default 4). */
  readonly visibleItemsEachSide: number;
}

export type NSECollectionViewCoverFlowLayoutOptions = Partial<Omit<NSECollectionViewCoverFlowLayout, "kind">>;

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Cover Flow ${name} must be a positive finite number.`);
  return value;
}

/** Makes a Cover Flow layout. With no options it is AnimationFX's showcase camera and geometry. */
export function createCoverFlowCollectionLayout(options: NSECollectionViewCoverFlowLayoutOptions = {}): NSECollectionViewCoverFlowLayout {
  const cameraPitch = options.cameraPitch ?? .335;
  if (!Number.isFinite(cameraPitch) || Math.abs(cameraPitch) >= Math.PI / 2) throw new RangeError("Cover Flow camera pitch must be finite and less than a quarter turn.");
  const fraction = (value: number, name: string) => {
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new RangeError(`Cover Flow ${name} must be in (0, 1].`);
    return value;
  };
  const visibleItemsEachSide = options.visibleItemsEachSide ?? 4;
  if (!Number.isSafeInteger(visibleItemsEachSide) || visibleItemsEachSide < 1) throw new RangeError("Cover Flow visible items must be a positive integer.");
  return Object.freeze({
    kind: "coverFlow" as const,
    itemAspectRatio: positive(options.itemAspectRatio ?? 16 / 10, "item aspect ratio"),
    itemHeightFraction: fraction(options.itemHeightFraction ?? .62, "item height fraction"),
    itemCentreFraction: fraction(options.itemCentreFraction ?? .47, "item centre fraction"),
    cameraDistance: positive(options.cameraDistance ?? 4, "camera distance"),
    cameraPitch,
    isWrapped: options.isWrapped ?? false,
    visibleItemsEachSide,
  });
}
