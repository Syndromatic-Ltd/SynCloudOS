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
import type { IFXImageResource } from "../../FX/ImageFX/IFXImageResource";

/** Narrow presentation capabilities supplied by the composing host. */
export interface ChronosphereDisposable { dispose(): void; }
export interface ChronosphereImageClient {
  load(request: Readonly<Record<string, unknown>>): Pick<IFXImageResource, "pixelLease" | "release">;
}
export interface ChronosphereAnimationOwner extends ChronosphereDisposable { readonly viewId: string; }
export interface ChronosphereAnimationHandle extends ChronosphereDisposable {
  readonly progress: number;
  readonly finished: Promise<unknown>;
}
export interface ChronosphereEnvironment {
  readonly signal: AbortSignal;
  readonly images: ChronosphereImageClient;
  readonly scheduler: {
    setTimeout(callback: () => void, delayMs: number): ChronosphereDisposable;
    requestAnimationFrame(callback: (time: number) => void): ChronosphereDisposable;
  };
  readonly mediaQueries: {
    getSnapshot(query: string): boolean;
    subscribe(query: string, listener: () => void): () => void;
  };
  readonly animations: {
    acquireOwner(viewId: string): ChronosphereAnimationOwner;
    animate(target: object, definition: Readonly<Record<string, unknown>>, owner: ChronosphereAnimationOwner): ChronosphereAnimationHandle;
  };
}

const EnvironmentContext = createContext<ChronosphereEnvironment | null>(null);

export function ChronosphereEnvironmentProvider({ value, children }: PropsWithChildren<{ readonly value: ChronosphereEnvironment }>) {
  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useChronosphereEnvironment(): ChronosphereEnvironment {
  const value = useContext(EnvironmentContext);
  if (!value) throw new Error("Chronosphere presentation requires a host environment.");
  return value;
}
