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

import { createContext, useContext, type ReactNode } from "react";
import type { NSEChromeScheme } from "../../Windows/Chrome/nseTopBarTypes";

/**
 * Carries the system-owned source-list rail state from `ApplicationStageView` (which renders the seam'd top
 * bar and owns the width) down to `NSESourceListScene` (which renders the sidebar + main + status in
 * the app subtree). The width lives in the system, so the bar seam and the sidebar can never disagree.
 */
export interface SourceListFrameContextValue {
  /** Current sidebar width in px (single source of truth — owned by the system frame). */
  railWidth: number;
  /** Set the sidebar width; `null` restores the responsive default. The frame clamps to bounds. */
  setRailWidth: (px: number | null) => void;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  /** Rail wordmark, already resolved from the app's override or its short name. */
  railLabel: string;
  scheme: NSEChromeScheme;
  /** Sets the dynamic centre title shown in the system bar (e.g. the active section); `null` reverts
   *  to the window title. Lets a source-list app drive its bar title without owning the bar. */
  setBarTitle: (title: string | null) => void;
}

const SourceListFrameContext = createContext<SourceListFrameContextValue | null>(null);

export function SourceListFrameProvider({
  value,
  children
}: {
  value: SourceListFrameContextValue | null;
  children: ReactNode;
}) {
  return <SourceListFrameContext.Provider value={value}>{children}</SourceListFrameContext.Provider>;
}

/** Returns the source-list frame state, or `null` when not inside a source-list window. */
export function useSourceListFrame(): SourceListFrameContextValue | null {
  return useContext(SourceListFrameContext);
}
