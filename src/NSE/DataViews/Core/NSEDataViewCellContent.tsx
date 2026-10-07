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

import type { NSEDataViewCellContentProps } from "./dataViewTypes";

export function NSEDataViewCellContent({
  image,
  primary,
  secondary,
  badge,
  accessory,
}: NSEDataViewCellContentProps) {
  return (
    <span data-nse-part="cell-content">
      {image ? <img data-nse-part="image" src={image.src} alt={image.alt} /> : null}
      <span data-nse-part="text-content">
        <span data-nse-part="primary-text">{primary}</span>
        {secondary === undefined ? null : <span data-nse-part="secondary-text">{secondary}</span>}
      </span>
      {badge === undefined ? null : <span data-nse-part="badge">{badge}</span>}
      {accessory === undefined ? null : <span data-nse-part="accessory">{accessory}</span>}
    </span>
  );
}
