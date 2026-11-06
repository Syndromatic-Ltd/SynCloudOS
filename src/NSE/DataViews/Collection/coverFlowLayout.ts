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
