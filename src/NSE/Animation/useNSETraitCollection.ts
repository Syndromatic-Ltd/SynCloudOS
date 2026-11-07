import { useMemo } from "react";
import type { NSETraitCollection } from "../Application/NSEViewController";
import { useNSEAnimationEnvironment } from "./NSEAnimationEnvironment";

/** Read-only animation traits for React views. Framework hosts and controllers
 * consume the same system setting; applications cannot override it per subtree. */
export function useNSETraitCollection(): Pick<NSETraitCollection, "reducedMotion"> {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return useMemo(() => Object.freeze({ reducedMotion }), [reducedMotion]);
}
