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

import { createContext, useContext, type PropsWithChildren } from "react";

/**
 * A deliberately narrow, mount-injected channel for trusted NSE developer
 * surfaces. It accepts only bounded category facts and never exposes a
 * runtime, snapshot, manager, or inspector read capability to the surface.
 */
export interface NSEConformanceEvidencePort {
  registerAppearanceFact(fact: {
    readonly slot: string;
    readonly status: "covered" | "unresolved" | "provenance-violation";
  }): () => void;
  registerAccessibilityFinding(finding: {
    readonly code: string;
    readonly severity: "info" | "warning" | "error";
  }): () => void;
}

const NSEConformanceEvidenceContext = createContext<NSEConformanceEvidencePort | null>(null);

export interface NSEConformanceEvidenceProviderProps extends PropsWithChildren {
  readonly port: NSEConformanceEvidencePort | null;
}

/**
 * The application mount supplies this only to the trusted NSE control
 * gallery. Ordinary SynWare observe `null`, so they cannot mutate Inspector
 * evidence through the public app runtime.
 */
export function NSEConformanceEvidenceProvider({ port, children }: NSEConformanceEvidenceProviderProps) {
  return <NSEConformanceEvidenceContext.Provider value={port}>{children}</NSEConformanceEvidenceContext.Provider>;
}

export function useNSEConformanceEvidence(): NSEConformanceEvidencePort | null {
  return useContext(NSEConformanceEvidenceContext);
}
