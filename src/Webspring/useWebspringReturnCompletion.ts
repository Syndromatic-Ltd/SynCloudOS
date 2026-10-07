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

import { useCallback, useLayoutEffect, useRef } from "react";
import { useKernelSynCloudOS } from "../SynCloudOSReact";
import { WEBSPRING_RETURN_ROLES } from "../SynCloudOS/SynCloudOS";

interface ReturnTrackSettlement {
  returnTransitionId: string | null;
  required: Set<string>;
  completed: Set<string>;
  settled: boolean;
}

export function useWebspringReturnCompletion(
  returnTransitionId: string | null,
  requiredTracks: readonly string[]
) {
  const runtime = useKernelSynCloudOS();
  const requiredTracksKey = requiredTracks.join("\u0000");
  const settlementRef = useRef<ReturnTrackSettlement>({
    returnTransitionId: null,
    required: new Set(),
    completed: new Set(),
    settled: false
  });

  useLayoutEffect(() => {
    settlementRef.current = {
      returnTransitionId,
      required: new Set(requiredTracks),
      completed: new Set(),
      settled: false
    };
  }, [requiredTracksKey, returnTransitionId]);

  const completeTrack = useCallback((track: string) => {
    const settlement = settlementRef.current;
    if (
      !settlement.returnTransitionId ||
      settlement.settled ||
      !settlement.required.has(track)
    ) {
      return;
    }

    settlement.completed.add(track);
    if (Array.from(settlement.required).some((requiredTrack) => !settlement.completed.has(requiredTrack))) {
      return;
    }

    const transitionId = settlement.returnTransitionId;
    if (runtime.webspring.completeReturnRole(transitionId, WEBSPRING_RETURN_ROLES[1])) {
      settlement.settled = true;
    }
  }, [runtime]);

  return {
    resetKey: returnTransitionId,
    completeTrack
  };
}
