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

import { createContext, useContext, type ReactNode } from "react";
import type { AppWindowChromeProps } from "./appClientTypes";

export const AppWindowChromePropsContext = createContext<AppWindowChromeProps | null>(null);

export function AppWindowChromePropsProvider({ value, children }: {
  readonly value: AppWindowChromeProps;
  readonly children: ReactNode;
}) {
  return <AppWindowChromePropsContext.Provider value={value}>{children}</AppWindowChromePropsContext.Provider>;
}

/** Chrome capability for the component subtree it is rendered in. Returns
 * `null` outside a custom-chrome floating-window mount: appView content,
 * system-chrome windows, and frameless windows never receive chrome props.
 * The providing context and slot plumbing are host internals; applications
 * only ever see this hook and the props value. */
export function useWindowChrome(): AppWindowChromeProps | null {
  return useContext(AppWindowChromePropsContext);
}
