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

import type { SynCloudOSLifecycleHook, SynCloudOSLifecycleStage } from "./lifecycleTypes";

/**
 * The lifecycle behaviour of an application written as an `NSEApplication`
 * class. The application module registers it against the definition's root
 * component, so the kernel finds it for lazily loaded bundles without the
 * bundle declaring hook maps of its own.
 */
export interface ApplicationLifecycle {
  /** The hook for `stage` and `phase`, or `null` when the application has none there. */
  hookFor(stage: SynCloudOSLifecycleStage, phase: "will" | "did"): SynCloudOSLifecycleHook | null;
}

const lifecycleByRoot = new WeakMap<object, ApplicationLifecycle>();

export function registerApplicationLifecycle(root: object, lifecycle: ApplicationLifecycle): void {
  lifecycleByRoot.set(root, lifecycle);
}

export function applicationLifecycleFor(root: unknown): ApplicationLifecycle | null {
  return (typeof root === "function" || (typeof root === "object" && root !== null))
    ? lifecycleByRoot.get(root as object) ?? null
    : null;
}
