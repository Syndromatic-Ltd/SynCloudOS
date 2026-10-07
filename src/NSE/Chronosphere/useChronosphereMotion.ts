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

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ChronosphereAnimationHandle, ChronosphereAnimationOwner } from "./chronosphereEnvironment";
import { useChronosphereEnvironment } from "./chronosphereEnvironment";

type Pose = { transform: string; opacity: number; filter: string };
const stackTiming = { kind: "cubic-bezier", x1: 0.26, y1: 0.64, x2: 0.2, y2: 1 } as const;
const enterTiming = { kind: "cubic-bezier", x1: 0.32, y1: 0.72, x2: 0.16, y2: 1 } as const;
const exitTiming = { kind: "cubic-bezier", x1: 0.5, y1: 0, x2: 0.2, y2: 1 } as const;

/** Retain the original DOM poses and curves, under the presenting app's owner. */
export function useChronosphereMotion(root: RefObject<HTMLDivElement | null>, enabled: boolean, stage: "entering" | "open" | "leaving", onExit?: () => void) {
  const app = useChronosphereEnvironment();
  const previous = useRef(new Map<HTMLElement, Pose>());
  const running = useRef(new Map<HTMLElement, ChronosphereAnimationHandle[]>());
  const targetIds = useRef(new WeakMap<HTMLElement, string>());
  const serial = useRef(0);
  const exitNotified = useRef(false);
  const owner = useRef<ChronosphereAnimationOwner | null>(null);
  const onExitRef = useRef(onExit);
  const lastStage = useRef(stage);
  onExitRef.current = onExit;

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    if (stage !== "leaving") exitNotified.current = false;
    const finishExit = () => { if (!exitNotified.current) { exitNotified.current = true; onExitRef.current?.(); } };
    const stageChanged = lastStage.current !== stage;
    lastStage.current = stage;
    const nodes = element.querySelectorAll<HTMLElement>(".chronosphere-card, .chronosphere-backframe, .chronosphere-curtain, .chronosphere-rail, .chronosphere-controls");
    if (!enabled) {
      for (const handles of running.current.values()) for (const handle of handles) handle.dispose();
      running.current.clear(); previous.current.clear();
      owner.current?.dispose(); owner.current = null;
      if (stage === "leaving") finishExit();
      return;
    }
    owner.current ??= app.animations.acquireOwner("chronosphere-presentation");
    const live = new Set(nodes);
    for (const node of previous.current.keys()) if (!live.has(node)) {
      for (const handle of running.current.get(node) ?? []) handle.dispose();
      running.current.delete(node); previous.current.delete(node);
    }
    for (const node of nodes) {
      const next: Pose = { transform: node.style.transform || "none", opacity: node.style.opacity === "" ? 1 : Number(node.style.opacity), filter: node.style.filter || "none" };
      const prior = previous.current.get(node);
      previous.current.set(node, next);
      // Camera travel supplies projected poses each frame. Only entrance/exit
      // choreography may animate these nodes independently.
      if (node.dataset.travelOwned === "true" && !stageChanged) {
        if (element.dataset.travelling === "true") {
          for (const handle of running.current.get(node) ?? []) handle.dispose();
          running.current.delete(node);
        }
        continue;
      }
      const curtain = node.classList.contains("chronosphere-curtain");
      // A page lifting off the window, or settling back on it, travels with the window.
      const lifting = stageChanged && node.dataset.originLift === "true";
      if (!prior) { if (curtain && stage === "leaving") finishExit(); continue; }
      if (!targetIds.current.has(node)) targetIds.current.set(node, `chronosphere-presentation-${++serial.current}`);
      const currentHandles = running.current.get(node) ?? [];
      let from = prior;
      if (currentHandles.some(handle => handle.progress < 1)) {
        // Read the live presentation while its scoped plays still override the
        // newly committed model style. Disposing first would lose this pose.
        const presentation = node.ownerDocument.defaultView?.getComputedStyle(node);
        if (presentation) from = {
          transform: presentation.transform || prior.transform,
          opacity: presentation.opacity === "" ? prior.opacity : Number(presentation.opacity),
          filter: presentation.filter || prior.filter,
        };
      }
      const animations = (["transform", "opacity", "filter"] as const).filter(key => prior[key] !== next[key]).map(keyPath => ({ targetId: targetIds.current.get(node)!, keyPath, from: from[keyPath], to: next[keyPath] }));
      if (!animations.length) { if (curtain && stage === "leaving" && !running.current.has(node)) finishExit(); continue; }
      for (const handle of currentHandles) handle.dispose();
      // CSS originally used a distinct curve for stack geometry and fading.
      // Each property shares its node's collision identity, not other cards'.
      const handles = animations.map(animation => app.animations.animate(node, {
        animations: [animation], duration: curtain || lifting ? (stage === "leaving" ? 0.62 : 0.9) : 0.52,
        timing: curtain || lifting ? (stage === "leaving" ? exitTiming : enterTiming) : animation.keyPath === "transform" ? stackTiming : "ease",
        fill: "none", reducedMotion: "system",
      }, owner.current!));
      running.current.set(node, handles);
      const settle = () => {
        if (running.current.get(node) !== handles) return;
        running.current.delete(node);
        for (const handle of handles) handle.dispose();
        // The committed model already holds the returned foreground. A failed
        // or cancelled current play must not leave the archive trapping input.
        if (curtain && stage === "leaving" && !app.signal.aborted) finishExit();
      };
      void Promise.all(handles.map(handle => handle.finished)).then(settle, settle);
    }
  });

  useLayoutEffect(() => () => {
    for (const handles of running.current.values()) for (const handle of handles) handle.dispose();
    running.current.clear(); previous.current.clear();
    owner.current?.dispose(); owner.current = null;
  }, [app.animations]);
}
