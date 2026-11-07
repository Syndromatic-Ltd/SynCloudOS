/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createContext, useContext, type PropsWithChildren } from "react";
import type { SynWareContextValue } from "./appContextTypes";

const SynWareContext = createContext<SynWareContextValue | null>(null);

export interface SynWareProviderProps extends PropsWithChildren {
  readonly value: SynWareContextValue;
}

export function SynWareProvider({ value, children }: SynWareProviderProps) {
  return <SynWareContext.Provider value={value}>{children}</SynWareContext.Provider>;
}

/** Internal framework consumer for components which can also be hosted by a
 * kernel surface. Public app code should use useSCOS(), which makes the
 * active mount requirement explicit. */
export function useSynWareContext(): SynWareContextValue | null {
  return useContext(SynWareContext);
}

