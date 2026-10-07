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

import { vi } from "vitest";
import { MFXAttitude } from "../../../src/FX/MotionFX/public";
import {
  MFXSensors,
  type MFXMotionCapabilities,
} from "../../../src/FX/MotionFX/MFXMotionCapabilities";
import type {
  MFXMotionAdapter,
  MFXRawMotionSample,
} from "../../../src/SynCloudOS/MotionFX/motionAdapterTypes";
export function motionFixture() {
  const listeners = new Set<(sample: MFXRawMotionSample) => void>();
  const adapter: MFXMotionAdapter = {
    capabilities: Object.freeze(
      Object.fromEntries(
        MFXSensors.map((key) => [
          key,
          {
            state: "available",
            apiPresent: true,
            samples: "no-samples",
            reason: null,
          },
        ]),
      ),
    ) as MFXMotionCapabilities,
    subscribe: (handler) => {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    requestAuthorization: vi.fn(async () => "available"),
  };
  return {
    adapter,
    listeners,
    emit: (
      timestamp: number,
      attitude: MFXAttitude | null = MFXAttitude.fromEuler(0, 0, 0),
    ) => {
      for (const listener of listeners)
        listener({
          timestamp,
          attitude,
          rotationRate: null,
          gravity: null,
          userAcceleration: null,
          accelerationIncludingGravity: null,
        });
    },
  };
}
