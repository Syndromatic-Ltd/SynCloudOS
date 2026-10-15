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

import type { WebspringFolderItem } from "./webspringTypes";
import "./WebspringFolderTile.css";

export interface WebspringFolderTileProps {
  readonly folder: WebspringFolderItem;
  /** Lit while a dragged app hovers to merge into this folder. */
  readonly dropTarget?: boolean;
  readonly className?: string;
}

/** A folder's icon: a recessed tile showing up to nine member icons. */
export function WebspringFolderTile({ folder, dropTarget = false, className }: WebspringFolderTileProps) {
  return <span
    className={`webspring-folder-tile${className ? ` ${className}` : ""}`}
    data-drop-target={dropTarget ? "true" : undefined}
    aria-hidden="true"
  >
    {folder.apps.slice(0, 9).map((app) => <span key={app.id} className="webspring-folder-tile-member">
      {app.iconUrl ? <img src={app.iconUrl} alt="" draggable={false} /> : <span>{app.title.slice(0, 1)}</span>}
    </span>)}
  </span>;
}
