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

import { useMemo } from "react";
import type { NSETraitCollection } from "../Application/NSEViewController";
import { useNSEAnimationEnvironment } from "./NSEAnimationEnvironment";

/** Read-only animation traits for React views. Framework hosts and controllers
 * consume the same system setting; applications cannot override it per subtree. */
export function useNSETraitCollection(): Pick<NSETraitCollection, "reducedMotion"> {
  const { reducedMotion } = useNSEAnimationEnvironment();
  return useMemo(() => Object.freeze({ reducedMotion }), [reducedMotion]);
}
