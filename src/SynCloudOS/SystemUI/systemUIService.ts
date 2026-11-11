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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";

export interface SystemUIState {
  preferencesPane: string | null;
  aboutAppId: string | null;
  logOutOpen: boolean;
  /** Interactive return-to-Webspring decision pending for this app. */
  returnDecision: { readonly appId: string } | null;
}

export interface SystemUIService {
  readonly runtimeId: SynCloudOSRuntimeId;
  getSnapshot(): SystemUIState;
  subscribe(listener: () => void): () => void;
  readonly preferences: {
    open(pane?: string): void;
    close(): void;
    isOpen(): boolean;
  };
  readonly about: {
    open(appId: string): void;
    close(): void;
  };
  readonly session: {
    requestLogOut(): void;
    dismissLogOut(): void;
  };
  readonly navigation: {
    requestReturnDecision(appId: string): void;
    dismissReturnDecision(): void;
  };
  dispose(): void;
}

const initialSystemUIState = (): SystemUIState => ({
  preferencesPane: null,
  aboutAppId: null,
  logOutOpen: false,
  returnDecision: null,
});

export function createSystemUIService(runtimeId: SynCloudOSRuntimeId): SystemUIService {
  const listeners = new Set<() => void>();
  let state = initialSystemUIState();
  let disposed = false;
  const commit = (next: Partial<SystemUIState>) => {
    if (disposed) return;
    const merged = { ...state, ...next };
    if (
      merged.preferencesPane === state.preferencesPane &&
      normalizeBundleIdentifier(merged.aboutAppId) === normalizeBundleIdentifier(state.aboutAppId) &&
      merged.logOutOpen === state.logOutOpen &&
      normalizeBundleIdentifier(merged.returnDecision?.appId) === normalizeBundleIdentifier(state.returnDecision?.appId)
    ) return;
    state = merged;
    listeners.forEach((listener) => listener());
  };

  return {
    runtimeId,
    getSnapshot: () => state,
    subscribe(listener) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    preferences: {
      open: (pane = "") => commit({ preferencesPane: pane }),
      close: () => commit({ preferencesPane: null }),
      isOpen: () => state.preferencesPane !== null
    },
    about: {
      open: (appId) => commit({ aboutAppId: appId }),
      close: () => commit({ aboutAppId: null })
    },
    session: {
      requestLogOut: () => commit({ logOutOpen: true }),
      dismissLogOut: () => commit({ logOutOpen: false })
    },
    navigation: {
      requestReturnDecision: (appId) => commit({ returnDecision: Object.freeze({ appId }) }),
      dismissReturnDecision: () => commit({ returnDecision: null })
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      state = initialSystemUIState();
      listeners.clear();
    }
  };
}
