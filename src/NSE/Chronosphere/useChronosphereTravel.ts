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

import { useCallback, useEffect, useRef, useState } from "react";
import { AFXAnimation } from "../../FX/AnimationFX/AFXAnimation";
import { AFXBasicAnimation } from "../../FX/AnimationFX/AFXBasicAnimation";
import type { ChronospherePlatformPort } from "./ChronosphereStage";
import { chronosphereTravelDuration } from "./chronosphereTravel";

/** One interruptible camera journey, sampled with AFX rather than independent card tweens. */
export function useChronosphereTravel(count: number, animate: boolean, environment: ChronospherePlatformPort) {
  const [position, setPosition] = useState(0);
  const [target, setTarget] = useState(0);
  const [journey, setJourney] = useState<{ id: number; direction: "past" | "present"; durationMs: number; intensity: number }>();
  const current = useRef(0), wanted = useRef(0), serial = useRef(0);
  const frame = useRef<unknown>(null);
  const stop = useCallback(() => {
    if (frame.current !== null) environment.cancelAnimationFrame(frame.current);
    frame.current = null;
  }, [environment]);
  const jumpTo = useCallback((index: number) => {
    stop();
    const next = Math.max(0, Math.min(Math.max(0, count - 1), index));
    current.current = next; wanted.current = next;
    setTarget(next); setPosition(next); setJourney(undefined);
  }, [count, stop]);
  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(Math.max(0, count - 1), index));
    stop(); wanted.current = next; setTarget(next);
    const from = current.current, distance = Math.abs(next - from);
    if (!animate || distance < 0.001) { current.current = next; setPosition(next); setJourney(undefined); return; }
    const durationMs = chronosphereTravelDuration(distance);
    setJourney({ id: ++serial.current, direction: next > from ? "past" : "present", durationMs, intensity: 1 + Math.min(1.4, distance * 0.06) });
    const curve = new AFXBasicAnimation({ targetId: "chronosphere-camera", keyPath: "opacity", from: 0, to: 1,
      animation: new AFXAnimation({ duration: 1, timing: "ease-in-out", fill: "both" }) });
    let previousTime: number | undefined, elapsed = 0;
    const advance = (time: number) => {
      // A background tab or dropped frame must not teleport over years of history.
      if (previousTime !== undefined) elapsed += Math.min(64, Math.max(0, time - previousTime));
      previousTime = time;
      const progress = Number(curve.sample(Math.min(1, elapsed / durationMs)));
      current.current = from + (next - from) * progress;
      setPosition(current.current);
      if (elapsed < durationMs) frame.current = environment.requestAnimationFrame(advance);
      else { frame.current = null; current.current = next; setPosition(next); setJourney(undefined); }
    };
    frame.current = environment.requestAnimationFrame(advance);
  }, [animate, count, environment, stop]);
  const step = useCallback((delta: number) => goTo(wanted.current + delta), [goTo]);
  useEffect(() => {
    if (!animate || wanted.current >= count) goTo(Math.min(wanted.current, Math.max(0, count - 1)));
    return stop;
  }, [animate, count, goTo, stop]);
  return { position, target, goTo, jumpTo, step, journey, travelling: journey !== undefined };
}
