import { useNSEVisualEnvironment } from "../Appearance";
import { useNSEAnimationEnvironment } from "../Animation";
/** Shared declarative duration for visual retention and focus restoration. */
export function useNSEOverlayMotionPolicy(explicitExitDuration?: number) {
  const { theme } = useNSEVisualEnvironment();
  const { reducedMotion } = useNSEAnimationEnvironment();
  const policy = theme.presentation.motion?.overlay;
  const kind = reducedMotion ? "none" : policy?.kind ?? "none";
  const duration = reducedMotion ? 0 : Math.max(0, explicitExitDuration ?? (kind === "none" ? 0 : policy?.durationMs ?? 0));
  const easing = policy?.easing === "decelerate" ? "cubic-bezier(.1,.9,.2,1)" : policy?.easing ?? "ease-out";
  return { kind, duration, easing };
}
