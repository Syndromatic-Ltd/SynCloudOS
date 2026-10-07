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

import type { MFXAttitude, MFXVector3 } from "../../FX/MotionFX/MFXAttitude";
import type {
  MFXAvailability,
  MFXMotionCapabilities,
} from "../../FX/MotionFX/MFXMotionCapabilities";
export interface MFXRawMotionSample {
  readonly timestamp: number;
  readonly attitude: MFXAttitude | null;
  readonly rotationRate: MFXVector3 | null;
  readonly gravity: MFXVector3 | null;
  readonly userAcceleration: MFXVector3 | null;
  readonly accelerationIncludingGravity: MFXVector3 | null;
}
/** Private host seam. All values are SI units and monotonic seconds. */
export interface MFXMotionAdapter {
  readonly capabilities: MFXMotionCapabilities;
  subscribe(handler: (sample: MFXRawMotionSample) => void): () => void;
  requestAuthorization(): Promise<MFXAvailability>;
}
