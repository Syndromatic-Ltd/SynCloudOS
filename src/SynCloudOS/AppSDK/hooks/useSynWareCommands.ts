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

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import type { KeyBindingDeclaration } from "../../SynCloudOS";
import { useSynWare } from "../SynWareContext";
import type {
  SynWareCommandExecutionContext,
  SynWareCommandPayloadSchema,
  SynWareCommandQueryContext,
  SynWareCommandScope,
  SynWareCommandTitle,
  SynWareCommandUndoPolicy,
  SynWareCommandValidation,
} from "../appRuntimeTypes";
import type { AppCommandClient } from "../appClientTypes";

/** A declarative command definition for the current mounted SynWare session.
 * It intentionally omits kernel-only registry and responder graph concepts;
 * the default responder is the mounted presentation's own responder. */
export interface SynWareCommandDefinition {
  readonly id: string;
  readonly title: string | SynWareCommandTitle | ((context: SynWareCommandQueryContext<unknown>) => SynWareCommandTitle);
  readonly responderId?: string;
  readonly icon?: string;
  readonly menuCategory?: string;
  readonly payload?: SynWareCommandPayloadSchema<unknown>;
  readonly defaultKeyBindings?: readonly KeyBindingDeclaration[];
  readonly allowReservedBrowserShortcut?: boolean;
  readonly scope?: SynWareCommandScope;
  readonly undo?: SynWareCommandUndoPolicy<unknown, unknown>;
  readonly telemetry?: { readonly category: string; readonly sensitivePayload: boolean };
  validate?(context: SynWareCommandQueryContext<unknown>): SynWareCommandValidation | Promise<SynWareCommandValidation>;
  execute(context: SynWareCommandExecutionContext<unknown>): unknown | Promise<unknown>;
}

type CurrentDefinitions = ReadonlyMap<string, SynWareCommandDefinition>;

const noPayload: SynWareCommandPayloadSchema<unknown> = Object.freeze({
  description: "No payload",
  parse(value: unknown) {
    return value === undefined
      ? { ok: true as const, value }
      : { ok: false as const, issues: ["This command does not accept a payload."] };
  },
});

function mountedResponderId(appId: string, sessionId: string): string {
  const prefix = `${appId}:`;
  if (!sessionId.startsWith(prefix) || sessionId.length === prefix.length) {
    throw new Error("The SynWare session does not identify its mounted responder.");
  }
  return sessionId.slice(prefix.length);
}

function stableValue(value: unknown, visited = new WeakSet<object>()): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "function") return "[callback]";
  if (typeof value === "symbol" || typeof value === "bigint") return `[${typeof value}]`;
  if (typeof value !== "object") return "[unsupported]";
  if (visited.has(value)) return "[cycle]";
  visited.add(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableValue(entry, visited)).join(",")}]`;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return `[identity:${Object.prototype.toString.call(value)}]`;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort((left, right) => left.localeCompare(right));
  return `{${keys.map((key) => {
    const descriptor = descriptors[key];
    return descriptor && "value" in descriptor
      ? `${JSON.stringify(key)}:${stableValue(descriptor.value, visited)}`
      : `${JSON.stringify(key)}:[accessor]`;
  }).join(",")}}`;
}

function structuralSignature(definitions: readonly SynWareCommandDefinition[]): string {
  return definitions.map((definition) => stableValue({
    id: definition.id,
    title: typeof definition.title === "string" || typeof definition.title === "object" ? definition.title : "[callback]",
    responderId: definition.responderId,
    icon: definition.icon,
    menuCategory: definition.menuCategory,
    payload: definition.payload ? { description: definition.payload.description } : null,
    defaultKeyBindings: definition.defaultKeyBindings ?? [],
    allowReservedBrowserShortcut: definition.allowReservedBrowserShortcut ?? false,
    scope: definition.scope ?? "application",
    undo: definition.undo ? { kind: definition.undo.kind, hasCompensate: definition.undo.kind === "register" && Boolean(definition.undo.compensate) } : { kind: "none" },
    telemetry: definition.telemetry,
    hasValidation: Boolean(definition.validate),
  })).join("\u0001");
}

function currentDefinition(current: MutableRefObject<CurrentDefinitions>, id: string): SynWareCommandDefinition {
  const definition = current.current.get(id);
  if (!definition) throw new DOMException(`SynWare command ${id} is no longer declared.`, "AbortError");
  return definition;
}

function titleFor(definition: SynWareCommandDefinition, current: MutableRefObject<CurrentDefinitions>) {
  if (typeof definition.title === "string") {
    return Object.freeze({ key: `commands.${definition.id}.title`, fallback: definition.title });
  }
  if (typeof definition.title === "function") {
    return (context: SynWareCommandQueryContext<unknown>) => {
      const title = currentDefinition(current, definition.id).title;
      return typeof title === "function" ? title(context) : title;
    };
  }
  return definition.title;
}

function undoFor(definition: SynWareCommandDefinition, current: MutableRefObject<CurrentDefinitions>): SynWareCommandUndoPolicy<unknown, unknown> {
  const undo = definition.undo;
  if (!undo || undo.kind === "none") return Object.freeze({ kind: "none" });
  const hasCompensate = Boolean(undo.compensate);
  return Object.freeze({
    kind: "register" as const,
    createAction(context: SynWareCommandExecutionContext<unknown>, result: unknown) {
      const latest = currentDefinition(current, definition.id).undo;
      if (!latest || latest.kind !== "register") throw new DOMException(`SynWare command ${definition.id} no longer has undo registration.`, "AbortError");
      return latest.createAction(context, result);
    },
    ...(hasCompensate ? {
      compensate(context: SynWareCommandExecutionContext<unknown>, result: unknown) {
        const latest = currentDefinition(current, definition.id).undo;
        if (!latest || latest.kind !== "register") throw new DOMException(`SynWare command ${definition.id} no longer has undo compensation.`, "AbortError");
        return latest.compensate?.(context, result);
      },
    } : {}),
  });
}

function createRegistrationDeclarations(
  definitions: readonly SynWareCommandDefinition[],
  responderId: string,
  current: MutableRefObject<CurrentDefinitions>,
): readonly object[] {
  const declared = new Set<string>();
  return definitions.map((definition) => {
    if (definition.id.trim().length === 0) throw new TypeError("SynWare command IDs must not be empty.");
    if (declared.has(definition.id)) throw new TypeError(`SynWare command IDs must be unique: ${definition.id}`);
    declared.add(definition.id);
    const initialPayload = definition.payload ?? noPayload;
    const hasValidation = Boolean(definition.validate);
    return Object.freeze({
      id: definition.id,
      responderId: definition.responderId ?? responderId,
      title: titleFor(definition, current),
      ...(definition.icon === undefined ? {} : { icon: definition.icon }),
      ...(definition.menuCategory === undefined ? {} : { menuCategory: definition.menuCategory }),
      payload: Object.freeze({
        description: initialPayload.description,
        parse(value: unknown) {
          return (currentDefinition(current, definition.id).payload ?? noPayload).parse(value);
        },
      }),
      defaultKeyBindings: definition.defaultKeyBindings ?? [],
      ...(definition.allowReservedBrowserShortcut === undefined ? {} : { allowReservedBrowserShortcut: definition.allowReservedBrowserShortcut }),
      scope: definition.scope ?? "application",
      undo: undoFor(definition, current),
      ...(definition.telemetry === undefined ? {} : { telemetry: definition.telemetry }),
      ...(hasValidation ? {
        validate(context: SynWareCommandQueryContext<unknown>) {
          return currentDefinition(current, definition.id).validate?.(context) ?? { enabled: true };
        },
      } : {}),
      execute(context: SynWareCommandExecutionContext<unknown>) {
        return currentDefinition(current, definition.id).execute(context);
      },
    });
  });
}

/** Registers declarative commands for exactly the declaring React subtree.
 * Equivalent inline arrays preserve their registrations; callback changes are
 * read from a current ref so dispatch never calls a stale closure. */
export function useSynWareCommands(definitions: readonly SynWareCommandDefinition[]): AppCommandClient {
  const app = useSynWare();
  const current = useRef<CurrentDefinitions>(new Map());
  const next = new Map<string, SynWareCommandDefinition>();
  for (const definition of definitions) {
    if (next.has(definition.id)) throw new TypeError(`SynWare command IDs must be unique: ${definition.id}`);
    next.set(definition.id, definition);
  }
  current.current = next;

  const signature = structuralSignature(definitions);
  const responderId = mountedResponderId(app.appId, app.sessionId);
  const registrations = useMemo(
    () => createRegistrationDeclarations(definitions, responderId, current),
    // `signature` deliberately replaces array identity: equivalent inline
    // definitions must not cause command churn on every React render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [responderId, signature],
  );

  useEffect(() => {
    if (app.signal.aborted) return;
    let disposed = false;
    const handles = registrations.map((registration) => app.commands.register(registration));
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const handle of handles) handle.dispose();
    };
    app.signal.addEventListener("abort", dispose, { once: true });
    return () => {
      app.signal.removeEventListener("abort", dispose);
      dispose();
    };
  }, [app.commands, app.signal, registrations]);

  return app.commands;
}
