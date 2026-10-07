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

import { useEffect, useRef } from "react";
import type { CommandDeclaration, CommandPayloadSchema, CommandRegistration } from "../SynCloudOS/SynCloudOS";
import { useKernelSynCloudOS } from "../SynCloudOSReact";

export interface WebspringResponderOptions {
  readonly onNotificationCentreRequest?: (notificationId?: string) => void;
  readonly onApplicationMenuToggle?: () => void;
}

interface NotificationCentrePayload {
  readonly notificationId?: string;
}

const noPayload: CommandPayloadSchema<undefined> = {
  description: "No payload.",
  parse: (value) => value === undefined
    ? { ok: true, value: undefined }
    : { ok: false, issues: ["This command does not accept a payload."] },
};

const notificationCentrePayload: CommandPayloadSchema<NotificationCentrePayload> = {
  description: "An optional notification identifier to focus in Notification Centre.",
  parse(value) {
    if (value === undefined) return { ok: true, value: {} };
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, issues: ["The payload must be an object."] };
    }
    const notificationId = (value as { readonly notificationId?: unknown }).notificationId;
    if (notificationId !== undefined && (typeof notificationId !== "string" || !notificationId.trim())) {
      return { ok: false, issues: ["notificationId must be a non-empty string when supplied."] };
    }
    return {
      ok: true,
      value: notificationId === undefined ? {} : { notificationId: notificationId.trim() },
    };
  },
};

const shellCommands = {
  notificationCentreOpen: "webspring.notificationCentre.open",
  applicationMenuToggle: "webspring.applicationMenu.toggle",
} as const;

function hasCommand(runtime: ReturnType<typeof useKernelSynCloudOS>, commandId: string) {
  return runtime.commands.inspect().registrations.some((registration) => (
    registration.commandId === commandId && registration.responderId === "webspring"
  ));
}

/**
 * Publishes the live Webspring shell anchor and owns shell-only command
 * declarations. Window and document responders stay in the runtime graph and
 * therefore continue to win command resolution when a window is focused.
 */
export function useWebspringResponder(options: WebspringResponderOptions = {}) {
  const runtime = useKernelSynCloudOS();
  const notificationCentreRequestRef = useRef(options.onNotificationCentreRequest);
  const applicationMenuToggleRef = useRef(options.onApplicationMenuToggle);
  notificationCentreRequestRef.current = options.onNotificationCentreRequest;
  applicationMenuToggleRef.current = options.onApplicationMenuToggle;

  useEffect(() => {
    const previous = runtime.focus.getActiveAnchors();
    runtime.focus.setActiveAnchors({
      ...previous,
      runtimeResponderId: "runtime",
      webspringResponderId: "webspring",
      workspaceResponderId: "workspace",
    });

    const registrations: CommandRegistration[] = [];
    if (!hasCommand(runtime, shellCommands.notificationCentreOpen)) {
      const declaration: CommandDeclaration<NotificationCentrePayload, void> = {
        id: shellCommands.notificationCentreOpen,
        responderId: "webspring",
        title: { key: "command.webspring.notificationCentre.open", fallback: "Open Notification Centre" },
        payload: notificationCentrePayload,
        scope: "webspring",
        defaultKeyBindings: [],
        undo: { kind: "none" },
        validate: () => ({
          enabled: runtime.disposalState === "running",
          disabledReason: "Notification Centre is not available right now.",
        }),
        execute: ({ payload }) => { notificationCentreRequestRef.current?.(payload.notificationId); },
      };
      registrations.push(runtime.commands.register(declaration));
    }
    if (!hasCommand(runtime, shellCommands.applicationMenuToggle)) {
      const declaration: CommandDeclaration<undefined, void> = {
        id: shellCommands.applicationMenuToggle,
        responderId: "webspring",
        title: { key: "command.webspring.applicationMenu.toggle", fallback: "Toggle Application Menu" },
        payload: noPayload,
        scope: "webspring",
        defaultKeyBindings: [],
        undo: { kind: "none" },
        validate: () => ({
          enabled: runtime.disposalState === "running",
          disabledReason: "The application menu is not available right now.",
        }),
        execute: () => { applicationMenuToggleRef.current?.(); },
      };
      registrations.push(runtime.commands.register(declaration));
    }

    return () => {
      for (const registration of registrations) registration.dispose();
      const current = runtime.focus.getActiveAnchors();
      if (current.webspringResponderId === "webspring" && current.workspaceResponderId === "workspace") {
        runtime.focus.setActiveAnchors(previous);
      }
    };
  }, [runtime]);
}

export { shellCommands as webspringShellCommands };
