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

import { useCallback, useEffect, useState } from "react";
import type { SynCloudOSRuntime } from "../SynCloudOS/SynCloudOS";
import type { WebspringViewModel } from "./webspringTypes";

type EntranceClock = Pick<SynCloudOSRuntime["environment"], "setTimeout" | "clearTimeout">;

export function useWebspringEntrance(clock: EntranceClock, startupReady: boolean, gateRequested: boolean, reducedMotion: boolean, resumeLogin = false) {
  const [loginPresented, setLoginPresented] = useState(resumeLogin);
  const [restoringLogin, setRestoringLogin] = useState(resumeLogin);

  useEffect(() => {
    if (!startupReady || !gateRequested || loginPresented) return;
    // Allow the capped icon cascade and its spring catch to settle before presenting the placard.
    const handle = clock.setTimeout(() => setLoginPresented(true), reducedMotion ? 0 : 1000);
    return () => clock.clearTimeout(handle);
  }, [clock, gateRequested, loginPresented, reducedMotion, startupReady]);

  useEffect(() => {
    if (!startupReady || !restoringLogin) return;
    // Reconstruct the held scene after the provider redirect before dismissing it.
    const handle = clock.setTimeout(() => setRestoringLogin(false), reducedMotion ? 0 : 400);
    return () => clock.clearTimeout(handle);
  }, [clock, reducedMotion, restoringLogin, startupReady]);
  const onLoginExited = useCallback(() => {
    if (!gateRequested) setLoginPresented(false);
  }, [gateRequested]);

  const entrancePhase: WebspringViewModel["entrancePhase"] = !startupReady && !restoringLogin
    ? "waiting"
    : gateRequested || loginPresented ? "holding" : "ready";

  return { entrancePhase, loginReady: (startupReady || restoringLogin) && loginPresented, restoringLogin, onLoginExited };
}
