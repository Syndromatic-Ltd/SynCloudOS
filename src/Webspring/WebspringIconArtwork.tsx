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

import "./WebspringIconArtwork.css";

export interface WebspringIconArtworkProps {
  src: string;
  draggable?: boolean;
}

export function WebspringIconArtwork({
  src,
  draggable = false
}: WebspringIconArtworkProps) {
  return (
    <span className="webspring-icon-artwork" aria-hidden="true">
      <img
        className="webspring-icon-artwork__glow"
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="webspring-icon-artwork__image"
        src={src}
        alt=""
        aria-hidden="true"
        draggable={draggable}
      />
    </span>
  );
}
