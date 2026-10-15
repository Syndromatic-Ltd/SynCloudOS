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

export const WEBSPRING_LAYOUT_PREFERENCE_VERSION = 4;

export type SynCloudOSWebspringLayoutPreferenceSource = "seed" | "persisted" | "user" | "reset";

export interface SynCloudOSWebspringLayoutPreference {
  version: typeof WEBSPRING_LAYOUT_PREFERENCE_VERSION;
  /** Top-level entry IDs: app IDs and folder IDs. */
  order: string[];
  /** Folder ID to its ordered member app IDs. */
  folders: Record<string, { apps: string[] }>;
  board: { version: 1; pageSize: number; dockSize: number };
  updatedAt: number | null;
  source: SynCloudOSWebspringLayoutPreferenceSource;
}

/** A folder the shell seeds; the runtime view of a manifest folder. */
export interface SynCloudOSWebspringFolderDefinition {
  readonly id: string;
  readonly order: number;
  readonly apps: readonly string[];
}

/** The shell's folder declaration, threaded into the runtime by the Webspring host. */
export interface SynCloudOSWebspringFolderConfiguration {
  readonly editable: boolean;
  readonly initial: readonly SynCloudOSWebspringFolderDefinition[];
}

export interface SynCloudOSWebspringLayoutState {
  preference: SynCloudOSWebspringLayoutPreference;
  folderConfiguration: SynCloudOSWebspringFolderConfiguration;
  isEditing: boolean;
  /** The app or folder being dragged. */
  draggingItemId: string | null;
  /** The entry a dragged app hovers over, to merge into a folder. */
  dropTargetId: string | null;
  keyboardAppId: string | null;
  launchSuppressedUntil: number | null;
  lastCommittedAt: number | null;
}

export interface SynCloudOSWebspringState {
  hoveredAppId: string | null;
  openFolderId: string | null;
  selectedAppId: string | null;
  focusedAppId: string | null;
  launchingAppId: string | null;
  launchTransitionId: string | null;
  presentationSettlementId: string | null;
  launchPhase: "idle" | "staging" | "launching" | "covered" | "returning";
  returningAppId: string | null;
  returnTransitionId: string | null;
  activeIndicatorId: string | null;
  selectorAngle: number;
  selectorPosition: { x: number; y: number } | null;
  lowerShelfMode: "news" | "preview" | "launching" | "error";
  previewAppId: string | null;
  hoverLabelAppId: string | null;
  isBooted: boolean;
  isAnimating: boolean;
  isAppContainerOpen: boolean;
  focusIndex: number;
  layout: SynCloudOSWebspringLayoutState;
  lastRefreshAt: number;
}
