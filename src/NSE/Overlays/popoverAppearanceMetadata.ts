/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { EffectiveAppearance } from "../Appearance/nseAppearanceTypes";

/** In-memory metadata for the host that mounts a popover in a separate React tree. */
export const popoverAppearance = Symbol("NSEPopover.appearance");

export interface PopoverAppearanceMetadata {
  readonly [popoverAppearance]?: EffectiveAppearance;
}
