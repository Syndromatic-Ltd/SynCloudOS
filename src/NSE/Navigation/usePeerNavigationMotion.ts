import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useNSEVisualEnvironment } from "../Appearance";
import { useNSEAnimationEnvironment } from "../Animation/NSEAnimationEnvironment";
import { compileNSEPresentation, type NSEPresentationSpec, type NSEPresentationOrigin } from "../Animation/NSEPresentation";
import type { AFXAnimationHandle } from "../../FX/AnimationFX/animationTypes";

const reducedQuery = "(prefers-reduced-motion: reduce)";
const systemReduced = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(reducedQuery).matches);
const serverReduced = () => false;
function subscribeReduced(listener: () => void) {
  const media = typeof window !== "undefined" ? window.matchMedia?.(reducedQuery) : undefined;
  if (media?.addEventListener) {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  media?.addListener?.(listener);
  return () => media?.removeListener?.(listener);
}

/** Cosmetic coordination only: semantic selection takes effect immediately.
 * Neither navigation promises nor retained content lifetime await animation. */
export function usePeerNavigationMotion({ host, panels, selectedId, destinationIds, enabled, reducedMotion }: {
  readonly host: RefObject<HTMLDivElement | null>;
  readonly panels: RefObject<Map<string, HTMLDivElement>>;
  readonly selectedId: string;
  readonly destinationIds: readonly string[];
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
}) {
  const { theme } = useNSEVisualEnvironment();
  const { animator, reducedMotion: environmentReduced } = useNSEAnimationEnvironment();
  const systemReducedMotion = useSyncExternalStore(subscribeReduced, systemReduced, serverReduced);
  const motion = theme.presentation.motion?.peerNavigation;
  const kind = motion?.kind ?? "none";
  const durationMs = motion?.durationMs ?? 0;
  const easing = motion?.easing ?? "ease-out";
  const previous = useRef(selectedId);
  const latestSelection = useRef(selectedId);
  latestSelection.current = selectedId;
  const interruptedOrigins = useRef(new Map<HTMLElement, NSEPresentationOrigin>());
  const sequence = useRef(0);
  const viewId = `nse-peer-transition:${useId()}`;
  const [transition, setTransition] = useState<null | { from: string; to: string; direction: number; sequence: number }>(null);
  const canAnimate = enabled && Boolean(animator) && kind !== "none" && durationMs > 0 && !reducedMotion && !environmentReduced && !systemReducedMotion;

  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = selectedId;
    if (!canAnimate || from === selectedId) { setTransition(null); return; }
    const logicalDirection = destinationIds.indexOf(selectedId) >= destinationIds.indexOf(from) ? 1 : -1;
    const direction = host.current && (host.current.getAttribute("dir") ?? getComputedStyle(host.current).direction);
    setTransition({ from, to: selectedId, direction: logicalDirection * (direction === "rtl" ? -1 : 1), sequence: ++sequence.current });
  }, [selectedId, canAnimate, kind, durationMs, easing, host]);

  useLayoutEffect(() => {
    if (!transition || transition.to !== selectedId || !canAnimate || !animator) return;
    const outgoing = panels.current.get(transition.from), incoming = panels.current.get(transition.to);
    if (!outgoing || !incoming) { setTransition(null); return; }
    const handles: AFXAnimationHandle[] = [];
    let live = true;
    let lease: ReturnType<typeof animator.animations.acquireOwner> | null = null;
    const finish = () => { if (live) setTransition(current => current === transition ? null : current); };
    try {
      lease = animator.animations.acquireOwner({ appId: animator.ownerAppId, viewId });
      for (const [element, entering] of [[outgoing, false], [incoming, true]] as const) {
        const spec: NSEPresentationSpec = {
          duration: durationMs / 1000,
          timing: easing === "decelerate" ? { kind: "cubic-bezier", x1: 0.1, y1: 0.9, x2: 0.2, y2: 1 } : easing,
          tracks: kind === "slide" ? [{ keyPath: "transform", unit: "%", values: entering
            ? [{ x: 100 * transition.direction }, { x: 0 }]
            : [{ x: 0 }, { x: -100 * transition.direction }] }]
            : [{ keyPath: "opacity", values: entering ? [0, 1] : [1, 0] }],
        };
        const definition = compileNSEPresentation(spec, `${viewId}:${entering ? "in" : "out"}`, entering ? "enter" : "exit", interruptedOrigins.current.get(element));
        // Unlike removed exit surfaces, destination panels stay mounted. A
        // forwards-filled completed exit would displace them on later visits.
        handles.push(animator.animations.animate(element,
          { ...definition, fill: "backwards" }, lease, transition.sequence));
      }
      interruptedOrigins.current.clear();
      void Promise.all(handles.map(handle => handle.finished)).then(finish, finish);
    } catch { finish(); }
    return () => {
      live = false;
      if (latestSelection.current !== transition.to && handles.some(handle => handle.state === "running" || handle.state === "paused")) {
        for (const element of [outgoing, incoming]) {
          const style = getComputedStyle(element);
          interruptedOrigins.current.set(element, kind === "slide"
            ? (style.transform && style.transform !== "none" ? { transform: style.transform } : {})
            : { opacity: Number.isFinite(Number.parseFloat(style.opacity)) ? Number.parseFloat(style.opacity) : 1 });
        }
      } else interruptedOrigins.current.clear();
      for (const handle of handles) handle.cancel("peer presentation completed or superseded");
      lease?.release("peer presentation completed or superseded");
    };
  }, [transition, selectedId, canAnimate, animator, panels, viewId, kind, durationMs, easing]);

  return transition && canAnimate && transition.to === selectedId ? transition : null;
}
