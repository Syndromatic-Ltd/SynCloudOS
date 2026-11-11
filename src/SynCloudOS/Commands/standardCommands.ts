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

import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { commandOperationResult, type CommandDeclaration, type CommandPayloadSchema, type CommandRegistration } from "./commandTypes";
import type { ResponderRegistrationHandle } from "../Responders/responderTypes";
import { DocumentUnavailableError } from "../Documents/DocumentErrors";

export interface StandardCommandDeclaration {
  readonly id: string;
  readonly defaultTitle: string;
}

export const documentCommands = [
  { id: "document.new", defaultTitle: "New" },
  { id: "document.open", defaultTitle: "Open…" },
  { id: "document.save", defaultTitle: "Save" },
  { id: "document.save-as", defaultTitle: "Save As…" },
  { id: "document.revert", defaultTitle: "Revert to Saved" },
  { id: "document.close", defaultTitle: "Close" },
  { id: "document.show-versions", defaultTitle: "Browse All Versions…" },
] as const satisfies readonly StandardCommandDeclaration[];

export const windowCommands = [
  { id: "window.close", defaultTitle: "Close Window" },
  { id: "window.minimise", defaultTitle: "Minimise" },
  { id: "window.zoom", defaultTitle: "Zoom" },
  { id: "window.move-by", defaultTitle: "Move Window" },
  { id: "window.resize-by", defaultTitle: "Resize Window" },
  { id: "window.cycle-forward", defaultTitle: "Bring Next Window to Front" },
  { id: "window.cycle-backward", defaultTitle: "Bring Previous Window to Front" },
] as const satisfies readonly StandardCommandDeclaration[];

const noPayload: CommandPayloadSchema<undefined> = {
  description: "No payload.",
  parse: (value) => value === undefined
    ? { ok: true, value: undefined }
    : { ok: false, issues: ["This command does not accept a payload."] },
};

const appPayload: CommandPayloadSchema<{ appId: string }> = {
  description: "A registered SynCloudOS application identifier.",
  parse: (value) => typeof (value as { appId?: unknown } | null)?.appId === "string"
    ? { ok: true, value: { appId: (value as { appId: string }).appId } }
    : { ok: false, issues: ["appId must be a string."] },
};

const optionalAppPayload: CommandPayloadSchema<{ appId?: string; pane?: string }> = {
  description: "An optional SynCloudOS application identifier and preferences pane.",
  parse(value) {
    if (value === undefined) return { ok: true, value: {} };
    if (!value || typeof value !== "object") return { ok: false, issues: ["The payload must be an object."] };
    const candidate = value as { appId?: unknown; pane?: unknown };
    if (candidate.appId !== undefined && typeof candidate.appId !== "string") return { ok: false, issues: ["appId must be a string."] };
    if (candidate.pane !== undefined && typeof candidate.pane !== "string") return { ok: false, issues: ["pane must be a string."] };
    return { ok: true, value: { appId: candidate.appId as string | undefined, pane: candidate.pane as string | undefined } };
  },
};

const localePayload: CommandPayloadSchema<{ locale: string }> = {
  description: "A supported SynCloudOS locale code.",
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: ["The payload must be an object."] };
    const locale = (value as { locale?: unknown }).locale;
    if (typeof locale !== "string" || !locale.trim()) return { ok: false, issues: ["locale must be a non-empty string."] };
    return { ok: true, value: { locale: locale.trim() } };
  },
};

interface WindowTargetPayload { readonly windowControllerId?: string }
interface WindowDeltaPayload extends WindowTargetPayload {
  readonly inlineDelta: number;
  readonly blockDelta: number;
}

const optionalWindowPayload: CommandPayloadSchema<WindowTargetPayload> = {
  description: "An optional runtime window-controller identifier.",
  parse(value) {
    if (value === undefined) return { ok: true, value: {} };
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: ["The payload must be an object."] };
    const windowControllerId = (value as { windowControllerId?: unknown }).windowControllerId;
    if (windowControllerId !== undefined && (typeof windowControllerId !== "string" || !windowControllerId.trim())) {
      return { ok: false, issues: ["windowControllerId must be a non-empty string when supplied."] };
    }
    return { ok: true, value: windowControllerId === undefined ? {} : { windowControllerId: windowControllerId.trim() } };
  },
};

const windowDeltaPayload: CommandPayloadSchema<WindowDeltaPayload> = {
  description: "Finite logical inline and block window deltas, with an optional controller identifier.",
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: ["The payload must be an object."] };
    const input = value as { windowControllerId?: unknown; inlineDelta?: unknown; blockDelta?: unknown };
    const issues: string[] = [];
    if (input.windowControllerId !== undefined && (typeof input.windowControllerId !== "string" || !input.windowControllerId.trim())) {
      issues.push("windowControllerId must be a non-empty string when supplied.");
    }
    if (typeof input.inlineDelta !== "number" || !Number.isFinite(input.inlineDelta)) issues.push("inlineDelta must be finite.");
    if (typeof input.blockDelta !== "number" || !Number.isFinite(input.blockDelta)) issues.push("blockDelta must be finite.");
    if (issues.length > 0) return { ok: false, issues };
    const windowControllerId = typeof input.windowControllerId === "string"
      ? input.windowControllerId.trim()
      : undefined;
    return {
      ok: true,
      value: {
        ...(windowControllerId === undefined ? {} : { windowControllerId }),
        inlineDelta: input.inlineDelta as number,
        blockDelta: input.blockDelta as number,
      },
    };
  },
};

const declaration = <P, R>(value: CommandDeclaration<P, R>) => value;

export function registerStandardCommands(runtime: SynCloudOSRuntime): { dispose(): void } {
  const registrations: CommandRegistration[] = [];
  const documentResponders = new Map<string, {
    readonly responder: ResponderRegistrationHandle;
    readonly commands: readonly CommandRegistration[];
  }>();
  let activeDocumentResponderId: string | null = null;
  let documentAnchorDeferred = false;
  let documentAnchorTimer: ReturnType<SynCloudOSRuntime["environment"]["setTimeout"]> | null = null;
  const register = <P, R>(command: CommandDeclaration<P, R>) => registrations.push(runtime.commands.register(command));
  const resolveWindow = (payload: WindowTargetPayload) => {
    if (payload.windowControllerId) {
      return runtime.windows.list().find(({ id }) => id === payload.windowControllerId) ?? null;
    }
    const focusedResponderId = runtime.focus.getFocusedResponderId();
    const responderWindowId = runtime.responders
      .resolveChain(focusedResponderId ?? undefined)
      .map(({ id }) => id.startsWith("window:") ? id.slice("window:".length) : null)
      .find((id): id is string => Boolean(id));
    const windowControllerId = responderWindowId ?? runtime.windows.snapshot().keyWindowControllerId;
    return windowControllerId
      ? runtime.windows.list().find(({ id }) => id === windowControllerId) ?? null
      : null;
  };
  const isBlocked = (windowControllerId: string) => runtime.windows.snapshot().blockedWindowControllerIds.includes(windowControllerId);
  const windowValidation = (
    payload: WindowTargetPayload,
    style?: "closable" | "minimisable" | "resizable" | "zoomable",
  ) => {
    const controller = resolveWindow(payload);
    if (!controller) return { enabled: false, disabledReason: "No window is available." };
    if (controller.record.state !== "open") return { enabled: false, disabledReason: "The target window is not open." };
    if (isBlocked(controller.id)) return { enabled: false, disabledReason: "The target window is blocked by a modal window." };
    if (style && !controller.record.style.includes(style)) return { enabled: false, disabledReason: `The target window is not ${style}.` };
    if ((style === "resizable" || style === "zoomable") && runtime.windows.isCompactPresentation(controller.id)) {
      return { enabled: false, disabledReason: "Compact window presentation owns its geometry." };
    }
    return { enabled: true };
  };
  register(declaration({
    id: "edit.undo", responderId: "runtime", title: { key: "command.edit.undo", fallback: "Undo" }, payload: noPayload,
    scope: "focused", defaultKeyBindings: [{ key: "z", modifiers: ["primary"], scope: "focused", repeat: "ignore", allowInEditable: true }], undo: { kind: "none" },
    validate: () => {
      const manager = runtime.undo.resolveForResponder();
      return { enabled: Boolean(manager?.canUndo) && !manager?.isExecuting, title: { key: "command.edit.undo", fallback: manager?.undoTitle ?? "Undo" }, disabledReason: manager?.isExecuting ? "An undo operation is already running." : "There is nothing to undo." };
    },
    execute: async () => runtime.undo.resolveForResponder()?.undo(),
  }));
  register(declaration({
    id: "edit.redo", responderId: "runtime", title: { key: "command.edit.redo", fallback: "Redo" }, payload: noPayload,
    scope: "focused", defaultKeyBindings: [
      { key: "z", modifiers: ["primary", "shift"], scope: "focused", repeat: "ignore", allowInEditable: true },
      { key: "y", modifiers: ["primary"], scope: "focused", platform: "windows", repeat: "ignore", allowInEditable: true },
      { key: "y", modifiers: ["primary"], scope: "focused", platform: "linux", repeat: "ignore", allowInEditable: true },
    ], undo: { kind: "none" },
    validate: () => {
      const manager = runtime.undo.resolveForResponder();
      return { enabled: Boolean(manager?.canRedo) && !manager?.isExecuting, title: { key: "command.edit.redo", fallback: manager?.redoTitle ?? "Redo" }, disabledReason: manager?.isExecuting ? "An undo operation is already running." : "There is nothing to redo." };
    },
    execute: async () => runtime.undo.resolveForResponder()?.redo(),
  }));
  register(declaration({
    id: "workspace.openApp", responderId: "workspace", title: ({ payload }) => ({ key: "command.workspace.openApp", fallback: `Open ${runtime.apps.getApp(payload.appId)?.displayName ?? payload.appId}` }), payload: appPayload,
    scope: "workspace", defaultKeyBindings: [], undo: { kind: "none" },
    validate: ({ payload }) => { const app = runtime.apps.getApp(payload.appId); return { enabled: Boolean(app && !app.isDisabled), disabledReason: "This app is not currently available." }; },
    execute: async ({ payload, signal, correlationId }) => commandOperationResult(await runtime.routes.openRoute(runtime.apps.getApp(payload.appId)!.route, {
      source: "command",
      context: { launcher: "workspace.openApp" },
      signal,
      correlationId,
    }).result),
  }));
  register(declaration({
    id: "workspace.returnToWebspring", responderId: "workspace", title: { key: "command.workspace.returnToWebspring", fallback: "Return to Webspring" }, payload: noPayload,
    scope: "workspace", defaultKeyBindings: [], undo: { kind: "none" },
    execute: async ({ signal, correlationId }) => {
      const activeAppId = runtime.store.getSnapshot().application.activeAppId;
      // Panels, HUDs, sheets, popovers and modals are the app's auxiliary
      // surfaces, not windows it can keep: an inspector such as Colours or
      // Fonts belongs to the app's stage and goes with it, as an NSPanel hides
      // when its application deactivates. Only standalone windows ask.
      const ownedOpenWindows = activeAppId
        ? runtime.windows.list({ applicationId: activeAppId }).filter(({ record }) => (
          record.state === "open" && (record.role === "standard" || record.role === "borderless")
        ))
        : [];
      if (activeAppId && ownedOpenWindows.length > 0) {
        // Interactive return only: ask before quitting an app that owns open
        // floating windows. Programmatic route opens bypass this command and
        // keep the established keep-windows behaviour.
        runtime.systemUI.navigation.requestReturnDecision(activeAppId);
        return commandOperationResult({ status: "cancelled", committed: false, reason: "return-decision-pending" });
      }
      return commandOperationResult(await runtime.routes.openRoute("/", { source: "command", signal, correlationId }).result);
    },
  }));
  register(declaration({
    id: "webspring.quickSwitch.toggle", responderId: "webspring", title: { key: "command.webspring.quickSwitch.toggle", fallback: "Toggle QuickSwitch" }, payload: noPayload,
    scope: "webspring", defaultKeyBindings: [{ key: "k", modifiers: ["primary"], scope: "webspring", repeat: "ignore" }], undo: { kind: "none" },
    validate: () => ({ enabled: runtime.disposalState === "running", disabledReason: "QuickSwitch is not available right now." }),
    execute: () => { runtime.events.publish("webspring.quickSwitch.toggle", { source: "command" }, "QuickSwitch"); },
  }));
  register(declaration({
    id: "window.close", responderId: "runtime", title: { key: "command.window.close", fallback: "Close Window" }, payload: optionalWindowPayload,
    scope: "window", defaultKeyBindings: [{ key: "w", modifiers: ["primary"], scope: "window", repeat: "ignore" }], undo: { kind: "none" },
    validate: ({ payload }) => {
      const validation = windowValidation(payload, "closable");
      if (!validation.enabled) return validation;
      const documentId = resolveWindow(payload)?.record.documentId;
      if (documentId && runtime.documents.getDocument(documentId)?.hasTerminalReconciliationLease) {
        return { enabled: false, disabledReason: "The window document is under terminal reconciliation." };
      }
      return validation;
    },
    execute: async ({ payload, signal }) => {
      const controller = resolveWindow(payload);
      return controller ? runtime.windows.requestClose(controller.id, { reason: "command", signal }) : null;
    },
  }));
  register(declaration({
    id: "window.minimise", responderId: "runtime", title: { key: "command.window.minimise", fallback: "Minimise" }, payload: optionalWindowPayload,
    scope: "window", defaultKeyBindings: [{ key: "m", modifiers: ["primary"], scope: "window", repeat: "ignore" }], undo: { kind: "none" },
    validate: ({ payload }) => windowValidation(payload, "minimisable"),
    execute: ({ payload }) => { const controller = resolveWindow(payload); if (controller) runtime.windows.minimise(controller.id); },
  }));
  register(declaration({
    id: "window.zoom", responderId: "runtime", title: { key: "command.window.zoom", fallback: "Zoom" }, payload: optionalWindowPayload,
    scope: "window", defaultKeyBindings: [], undo: { kind: "none" },
    validate: ({ payload }) => windowValidation(payload, "zoomable"),
    execute: ({ payload }) => { const controller = resolveWindow(payload); if (controller) runtime.windows.zoom(controller.id); },
  }));
  register(declaration({
    id: "window.move-by", responderId: "runtime", title: { key: "command.window.moveBy", fallback: "Move Window" }, payload: windowDeltaPayload,
    scope: "window", defaultKeyBindings: [], undo: { kind: "none" },
    validate: ({ payload }) => windowValidation(payload),
    execute: ({ payload }) => {
      const controller = resolveWindow(payload);
      if (!controller) return;
      const inlineDirection = runtime.locale.getSnapshot().direction === "rtl" ? -1 : 1;
      runtime.windows.scheduleBoundsChange(controller.id, {
        kind: "delta",
        delta: { x: payload.inlineDelta * inlineDirection, y: payload.blockDelta, width: 0, height: 0 },
        reason: "keyboard-move",
      });
    },
  }));
  register(declaration({
    id: "window.resize-by", responderId: "runtime", title: { key: "command.window.resizeBy", fallback: "Resize Window" }, payload: windowDeltaPayload,
    scope: "window", defaultKeyBindings: [], undo: { kind: "none" },
    validate: ({ payload }) => windowValidation(payload, "resizable"),
    execute: ({ payload }) => {
      const controller = resolveWindow(payload);
      if (!controller) return;
      const inlineDirection = runtime.locale.getSnapshot().direction === "rtl" ? -1 : 1;
      runtime.windows.scheduleBoundsChange(controller.id, {
        kind: "delta",
        delta: { x: 0, y: 0, width: payload.inlineDelta * inlineDirection, height: payload.blockDelta },
        reason: "keyboard-resize",
      });
    },
  }));
  register(declaration({
    id: "window.cycle-forward", responderId: "runtime", title: { key: "command.window.cycleForward", fallback: "Bring Next Window to Front" }, payload: noPayload,
    scope: "window", defaultKeyBindings: [{ key: "`", modifiers: ["primary"], scope: "window", repeat: "ignore" }], undo: { kind: "none" },
    validate: () => ({ enabled: runtime.windows.list().filter(({ record, id }) => record.state === "open" && !isBlocked(id)).length > 1, disabledReason: "No other window is available." }),
    execute: () => runtime.windows.cycle("forward")?.record ?? null,
  }));
  register(declaration({
    id: "window.cycle-backward", responderId: "runtime", title: { key: "command.window.cycleBackward", fallback: "Bring Previous Window to Front" }, payload: noPayload,
    scope: "window", defaultKeyBindings: [{ key: "`", modifiers: ["primary", "shift"], scope: "window", repeat: "ignore" }], undo: { kind: "none" },
    validate: () => ({ enabled: runtime.windows.list().filter(({ record, id }) => record.state === "open" && !isBlocked(id)).length > 1, disabledReason: "No other window is available." }),
    execute: () => runtime.windows.cycle("backward")?.record ?? null,
  }));
  register(declaration({
    id: "application.showAbout", responderId: "runtime", title: { key: "command.application.showAbout", fallback: "About This App" }, payload: optionalAppPayload,
    scope: "application", defaultKeyBindings: [], undo: { kind: "none" },
    validate: ({ payload }) => { const appId = payload.appId ?? runtime.store.getSnapshot().application.activeAppId; return { enabled: Boolean(appId && runtime.apps.getApp(appId)), disabledReason: "No application is available for About." }; },
    execute: ({ payload }) => { const appId = payload.appId ?? runtime.store.getSnapshot().application.activeAppId!; runtime.systemUI.about.open(appId); },
  }));
  register(declaration({
    id: "system.showPreferences", responderId: "runtime", title: { key: "system.preferences", fallback: "System Preferences" }, payload: noPayload,
    scope: "runtime", defaultKeyBindings: [{ key: ",", modifiers: ["primary"], scope: "runtime", repeat: "ignore" }], undo: { kind: "none" },
    validate: () => ({ enabled: runtime.disposalState === "running", disabledReason: "System Preferences is not available." }),
    execute: () => { runtime.systemUI.preferences.open(); },
  }));
  register(declaration({
    id: "system.setLocale", responderId: "runtime", title: { key: "command.system.setLocale", fallback: "Set System Language" }, payload: localePayload,
    scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" },
    validate: ({ payload }) => ({
      enabled: runtime.disposalState === "running" && runtime.locale.getSupportedLocales().some((entry) =>
        Boolean(entry && typeof entry === "object" && (entry as { readonly code?: unknown }).code === payload.locale)),
      disabledReason: runtime.disposalState !== "running"
        ? "System language settings are not available."
        : "That system language is not supported.",
    }),
    execute: ({ payload }) => {
      const snapshot = runtime.locale.setLocale(payload.locale);
      runtime.systemUI.preferences.open("language");
      return snapshot;
    },
  }));
  register(declaration({
    id: "session.requestLogOut", responderId: "runtime", title: { key: "command.session.requestLogOut", fallback: "Log Out" }, payload: noPayload,
    scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" },
    validate: () => ({ enabled: runtime.disposalState === "running", disabledReason: "The session is not available." }),
    execute: () => { runtime.systemUI.session.requestLogOut(); },
  }));
  register(declaration({
    id: "session.logOut", responderId: "runtime", title: { key: "command.session.logOut", fallback: "Log Out" }, payload: noPayload,
    scope: "runtime", defaultKeyBindings: [], undo: { kind: "none" },
    validate: () => ({ enabled: runtime.disposalState === "running", disabledReason: "The session is not available." }),
    execute: async ({ signal }) => commandOperationResult(await runtime.logOut({ reason: "command", signal }).result),
  }));

  for (const action of ["new", "open"] as const) {
    register(declaration({
      id: `document.${action}`, responderId: "runtime", title: { key: `command.document.${action}`, fallback: action === "new" ? "New" : "Open…" },
      payload: noPayload, scope: "application", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => ({ enabled: false, disabledReason: runtime.documents.activeDocumentId && runtime.documents.getDocument(runtime.documents.activeDocumentId)?.hasTerminalReconciliationLease
        ? "The active document is under terminal reconciliation."
        : `No document-${action} provider is registered.` }),
      execute: () => { throw new DocumentUnavailableError(`No document-${action} provider is registered.`, { retryable: false }); },
    }));
  }

  const registerDocumentResponder = (documentId: string) => {
    const responderId = `document:${documentId}`;
    const applicationId = runtime.documents.getDocument(documentId)?.applicationId;
    const applicationResponderId = applicationId ? `application:${applicationId}` : null;
    const responder = runtime.responders.register({
      id: responderId,
      kind: "document",
      // Restoration may establish documents before their application mounts.
      // Keep the semantic parent so a later app provider joins the same chain.
      parentId: applicationResponderId ?? "workspace",
      scopeId: "root",
      undoOwner: { kind: "document", id: documentId },
      diagnosticsLabel: `Document ${documentId}`,
    });
    const documentRegistrations: CommandRegistration[] = [];
    const registerDocument = <P, R>(command: CommandDeclaration<P, R>) => {
      const registration = runtime.commands.register(command);
      registrations.push(registration);
      documentRegistrations.push(registration);
    };
    const liveDocument = () => runtime.documents.getDocument(documentId);
    const isEditable = () => {
      const state = liveDocument()?.state;
      return state === "clean" || state === "dirty" || state === "conflicted";
    };
    registerDocument(declaration({
      id: "document.save", responderId, title: { key: "command.document.save", fallback: "Save" }, payload: noPayload,
      scope: "document", defaultKeyBindings: [{ key: "s", modifiers: ["primary"], scope: "document", repeat: "ignore", allowInEditable: true }], undo: { kind: "none" },
      validate: () => {
        const document = liveDocument();
        if (document?.hasTerminalReconciliationLease) {
          return { enabled: false, disabledReason: "The active document is under terminal reconciliation." };
        }
        return { enabled: document?.state === "dirty", disabledReason: "The active document has no changes that can be saved." };
      },
      execute: async ({ signal }) => runtime.documents.saveDocument(documentId, { reason: "explicit", signal }),
    }));
    registerDocument(declaration({
      id: "document.save-as", responderId, title: { key: "command.document.saveAs", fallback: "Save As…" }, payload: noPayload,
      scope: "document", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => {
        const document = liveDocument();
        if (document?.hasTerminalReconciliationLease) {
          return { enabled: false, disabledReason: "The active document is under terminal reconciliation." };
        }
        return { enabled: isEditable() && runtime.documents.hasSaveDestinationProvider, disabledReason: "No save destination is available." };
      },
      execute: async ({ signal }) => {
        const selection = await runtime.documents.chooseSaveDestination(documentId, "save-as", signal);
        if (!selection) return null;
        return runtime.documents.saveAsDocument({ documentId, ...selection, signal });
      },
    }));
    registerDocument(declaration({
      id: "document.revert", responderId, title: { key: "command.document.revert", fallback: "Revert to Saved" }, payload: noPayload,
      scope: "document", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => {
        const document = liveDocument();
        if (document?.hasTerminalReconciliationLease) {
          return { enabled: false, disabledReason: "The active document is under terminal reconciliation." };
        }
        return { enabled: Boolean(document?.currentVersion), disabledReason: "The active document has no saved version." };
      },
      execute: async ({ signal }) => runtime.documents.revertDocument(documentId, undefined, signal),
    }));
    registerDocument(declaration({
      id: "document.close", responderId, title: { key: "command.document.close", fallback: "Close" }, payload: noPayload,
      scope: "document", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => {
        const document = liveDocument();
        if (document?.hasTerminalReconciliationLease) {
          return { enabled: false, disabledReason: "The active document is under terminal reconciliation." };
        }
        const state = document?.state;
        return { enabled: Boolean(state && state !== "closing" && state !== "closed" && state !== "deleted"), disabledReason: "The active document is already closing." };
      },
      execute: async ({ signal }) => runtime.documents.closeDocument(documentId, "window-command", signal),
    }));
    registerDocument(declaration({
      id: "document.show-versions", responderId, title: { key: "command.document.showVersions", fallback: "Browse All Versions…" }, payload: noPayload,
      scope: "document", defaultKeyBindings: [], undo: { kind: "none" },
      validate: () => ({ enabled: Boolean(liveDocument()?.currentVersion), disabledReason: "The active document has no saved versions." }),
      execute: async ({ signal }) => runtime.documents.listDocumentVersions(documentId, signal),
    }));
    documentResponders.set(documentId, { responder, commands: Object.freeze(documentRegistrations) });
  };

  const synchroniseDocumentResponders = () => {
    const openIds = new Set(runtime.documents.openDocuments.map(({ id }) => id));
    for (const documentId of openIds) {
      if (!documentResponders.has(documentId)) registerDocumentResponder(documentId);
    }
    for (const [documentId, registration] of [...documentResponders]) {
      if (openIds.has(documentId)) continue;
      for (const command of registration.commands) command.dispose();
      registration.responder.dispose();
      documentResponders.delete(documentId);
    }
    // New/Open intentionally activate another document. Publish that focus
    // anchor after the command's commitment admission has completed, so its
    // own result does not revoke the responder chain that admitted the chooser.
    if (runtime.operations.inspectPending().some(({ kind }) =>
      kind === "command:document.new" || kind === "command:document.open")) {
      documentAnchorDeferred = true;
      return;
    }
    if (documentAnchorDeferred) {
      if (documentAnchorTimer === null) documentAnchorTimer = runtime.environment.setTimeout(() => {
        documentAnchorTimer = null;
        documentAnchorDeferred = false;
        synchroniseDocumentResponders();
      }, 0);
      return;
    }
    const nextResponderId = runtime.documents.activeDocumentId
      ? documentResponders.get(runtime.documents.activeDocumentId)?.responder.id ?? null
      : null;
    if (nextResponderId !== activeDocumentResponderId) {
      activeDocumentResponderId = nextResponderId;
      runtime.focus.setActiveAnchors({
        ...runtime.focus.getActiveAnchors(),
        documentResponderId: nextResponderId,
      });
    }
  };
  const unsubscribeDocuments = runtime.documents.subscribe(synchroniseDocumentResponders);
  const unsubscribeOperations = runtime.operations.subscribe(() => {
    if (documentAnchorDeferred) synchroniseDocumentResponders();
  });
  synchroniseDocumentResponders();

  return { dispose() {
    unsubscribeDocuments();
    unsubscribeOperations();
    if (documentAnchorTimer !== null) runtime.environment.clearTimeout(documentAnchorTimer);
    for (const registration of registrations.splice(0)) registration.dispose();
    for (const registration of documentResponders.values()) registration.responder.dispose();
    documentResponders.clear();
  } };
}
