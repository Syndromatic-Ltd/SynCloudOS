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

import type { AFXTransform3D } from "./AFXTransform3D";
import type { GFXColour } from "../GraphicsFX/GFXColour";
export type AFXReplicationProjectionMode = "planar" | "projective";
export interface AFXReplicaPresentation {
  readonly transform: AFXTransform3D;
  readonly opacity: number;
}
export interface AFXReplication {
  readonly projectionMode: AFXReplicationProjectionMode;
  readonly instanceCount: number;
  readonly instanceTransform: AFXTransform3D;
  readonly instanceColour: GFXColour;
  readonly instanceRedOffset: number;
  readonly instanceGreenOffset: number;
  readonly instanceBlueOffset: number;
  readonly instanceAlphaOffset: number;
  readonly instanceDelay: number;
  readonly instances: readonly AFXReplicaPresentation[];
}
