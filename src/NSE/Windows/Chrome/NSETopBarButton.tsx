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

import { useNSEFeedback } from "../../Feedback";
import type { NSETopBarItem, NSETopBarItemPosition, NSETopBarStyleDefinition } from "./nseTopBarTypes";

export function NSETopBarButton({
  item,
  position,
  styleDefinition
}: {
  item: NSETopBarItem;
  position: NSETopBarItemPosition;
  styleDefinition: NSETopBarStyleDefinition;
}) {
  const feedback = useNSEFeedback();

  const isSelected = Boolean(item.selected);
  // A kind without art in this style (settings on Cumulus) draws the item's own icon.
  const iconSet = (item.kind === "custom" ? undefined : styleDefinition.icons[item.kind])
    ?? { normal: item.icon ?? "", selected: item.selectedIcon ?? item.icon ?? "" };

  return (
    <button
      ref={item.onElementChange}
      className="nse-app-topbar-button"
      type="button"
      aria-label={item.label}
      aria-haspopup={item.opensMenu ? "menu" : undefined}
      aria-expanded={item.opensMenu ? Boolean(item.selected) : undefined}
      title={item.label}
      data-position={position}
      data-selected={isSelected ? "true" : "false"}
      disabled={item.disabled}
      onClick={() => {
        item.onClick?.();
        void feedback?.trigger(item.haptic ?? "rigid");
      }}
    >
      {/* An inset tool button cut into the Cumulus glass: a dark ring, a
          glazed well, and a blue pressed-in fill for the held/selected state. */}
      <span className="nse-app-topbar-button-well" aria-hidden="true">
        <span className="nse-app-topbar-button-well-selected" />
      </span>
      {iconSet?.normal ? (
        <img className="nse-app-topbar-button-icon nse-app-topbar-button-icon-normal" src={iconSet.normal} alt="" aria-hidden="true" draggable={false} />
      ) : null}
      {iconSet?.selected ? (
        <img className="nse-app-topbar-button-icon nse-app-topbar-button-icon-selected" src={iconSet.selected} alt="" aria-hidden="true" draggable={false} />
      ) : null}
    </button>
  );
}
