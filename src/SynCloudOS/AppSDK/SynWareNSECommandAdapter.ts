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

import type { NSEDragCommandPort } from "../../NSE/Drag";
import type { NSEFontPanelCommandPort, NSEFontPanelCommandResult } from "../../NSE/Typography";
import type { AppCommandClient } from "./appClientTypes";

/** Bridges the two drag-command operations NSE controls require. This keeps
 * AppSDK's broader command presentation client from becoming an NSE manager
 * escape hatch. */
export function createSynWareNSEDragCommandPort(commands: AppCommandClient): NSEDragCommandPort {
  return Object.freeze({
    register(declaration: object) {
      const registration = commands.register(declaration);
      return Object.freeze({
        dispose() { return registration.dispose() ?? true; },
      });
    },
    async dispatch(commandId: string, payload?: unknown, options?: unknown) {
      const result = await commands.dispatch<Readonly<{ status: string }>>(commandId, payload, options as Readonly<Record<string, unknown>> | undefined);
      return Object.freeze({ status: result.status });
    },
  });
}

/** Font-panel actions are dispatch-only from an app's point of view. The
 * command responder, validation, and acceptance records stay host-owned. */
export function createSynWareNSEFontPanelCommandPort(commands: AppCommandClient): NSEFontPanelCommandPort {
  const port: NSEFontPanelCommandPort = {
    async execute(commandId, payload, signal) {
      signal.throwIfAborted();
      const result = await commands.dispatch<NSEFontPanelCommandResult>(
        commandId,
        payload,
        { source: "toolbar", signal },
      );
      signal.throwIfAborted();
      return Object.freeze({ status: result.status });
    },
  };
  return Object.freeze(port);
}
