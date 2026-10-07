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

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  commandValidationRequestKey,
  isCommandValidationStale,
  type CommandDeclaration,
  type CommandDispatchOptions,
  type CommandDispatchResult,
  type CommandId,
  type CommandPresentation,
  type CommandValidationOptions,
} from "../SynCloudOS/SynCloudOS";
import { SynWareRuntimeContext, SynCloudOSRuntimeContext } from "./runtimeContext";
import type { SynWareCommandDeclaration } from "./appRuntimeTypes";

function useCommandRuntime() {
  const appRuntime = useContext(SynWareRuntimeContext);
  const kernelRuntime = useContext(SynCloudOSRuntimeContext);
  if (appRuntime) return { appRuntime, kernelRuntime: null, runtime: appRuntime } as const;
  if (kernelRuntime) return { appRuntime: null, kernelRuntime, runtime: kernelRuntime } as const;
  throw new Error("Command hooks must be used within SynCloudOSProvider or a mounted SynWare.");
}

export function useCommandRegistration<P, R>(declaration: CommandDeclaration<P, R> | SynWareCommandDeclaration<P, R> | null) {
  const { appRuntime, kernelRuntime } = useCommandRuntime();
  useEffect(() => {
    if (!declaration) return;
    const registration = appRuntime
      ? appRuntime.commands.register(declaration as unknown as SynWareCommandDeclaration<P, R>)
      : kernelRuntime!.commands.register(declaration as CommandDeclaration<P, R>);
    return () => { registration.dispose(); };
  }, [appRuntime, declaration, kernelRuntime]);
}

export function useCommandDispatch() {
  const { runtime } = useCommandRuntime();
  return useCallback(<R,>(id: CommandId, payload?: unknown, options?: CommandDispatchOptions) => runtime.commands.dispatch<R>(id, payload, options), [runtime]);
}

export function useCommandPresentation(id: CommandId, payload?: unknown, options?: CommandValidationOptions) {
  const { runtime } = useCommandRuntime();
  const [presentation, setPresentation] = useState<CommandPresentation | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void runtime.commands.validate(id, payload, { ...options, signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setPresentation(value);
    });
    return () => controller.abort();
  }, [id, options, payload, runtime]);
  return presentation;
}

export interface CommandMenuItem {
  readonly key: string;
  readonly commandId?: CommandId;
  readonly payload?: unknown;
  readonly label?: ReactNode;
  readonly icon?: ReactNode;
  readonly separator?: boolean;
  readonly children?: readonly CommandMenuItem[];
}

export interface PresentedCommandMenuItem {
  readonly value: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly separator?: boolean;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly checked?: boolean;
  readonly children?: PresentedCommandMenuItem[];
}

function indexItems(items: readonly CommandMenuItem[]) {
  const byKey = new Map<string, CommandMenuItem>();
  const leaves: CommandMenuItem[] = [];
  const visit = (entries: readonly CommandMenuItem[]) => {
    for (const item of entries) {
      if (!item.key.trim()) throw new Error("Command menu item keys must not be empty.");
      if (byKey.has(item.key)) throw new Error(`Duplicate command menu item key: ${item.key}`);
      byKey.set(item.key, item);
      if (item.children?.length) visit(item.children);
      else if (!item.separator && item.commandId) leaves.push(item);
    }
  };
  visit(items);
  return { byKey, leaves };
}

function menuTupleSignature(items: readonly CommandMenuItem[]): string {
  const encode = (value: unknown): string => {
    if (value === undefined) return "undefined";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return `[identity:${String(value)}]`;
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${encode(entry)}`).join(",")}}`;
  };
  const visit = (entries: readonly CommandMenuItem[]): string => entries.map((item) => `${item.key}\0${item.commandId ?? ""}\0${encode(item.payload)}\0${item.children ? visit(item.children) : ""}`).join("\u0001");
  return visit(items);
}

function presentItems(items: readonly CommandMenuItem[], presentations: ReadonlyMap<string, CommandPresentation>): PresentedCommandMenuItem[] {
  return items.flatMap((item) => {
    const presentation = presentations.get(item.key);
    if (presentation?.hidden) return [];
    const children = item.children ? presentItems(item.children, presentations) : undefined;
    return [{
      value: item.key,
      label: presentation?.title ?? item.label ?? item.commandId ?? item.key,
      icon: item.icon,
      separator: item.separator,
      disabled: item.commandId ? !presentation?.enabled : false,
      disabledReason: presentation?.disabledReason,
      checked: presentation?.state === "on" ? true : undefined,
      children,
    }];
  });
}

export function useCommandMenuItems(items: readonly CommandMenuItem[], open: boolean): {
  items: readonly PresentedCommandMenuItem[];
  dispatch(value: string): Promise<CommandDispatchResult<unknown>>;
  validating: boolean;
} {
  const { appRuntime, kernelRuntime, runtime } = useCommandRuntime();
  const tupleSignature = menuTupleSignature(items);
  // The signature intentionally stabilises equivalent inline menu arrays.
  // Payload changes still create a new indexed tuple and validation opening.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const indexed = useMemo(() => indexItems(items), [tupleSignature]);
  const getPresentationGeneration = () => appRuntime
    ? { registryGeneration: 0, responderGeneration: 0 }
    : { registryGeneration: kernelRuntime!.commands.inspect().generation, responderGeneration: kernelRuntime!.responders.generation };
  const registryGeneration = getPresentationGeneration().registryGeneration;
  const [presentations, setPresentations] = useState<ReadonlyMap<string, CommandPresentation>>(() => new Map());
  const presentationsRef = useRef(presentations);
  presentationsRef.current = presentations;
  const validatedSnapshot = useRef<{ tupleSignature: string; registryGeneration: number; responderGeneration: number } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const [validating, setValidating] = useState(false);
  const openingGeneration = useRef(0);

  useEffect(() => {
    if (!open) return;
    const generation = ++openingGeneration.current;
    const controller = new AbortController();
    const captured = indexed;
    const capturedTupleSignature = tupleSignature;
    validatedSnapshot.current = null;
    setValidating(true);
    const requests = captured.leaves.map((item) => ({ key: commandValidationRequestKey(item.key), commandId: item.commandId!, payload: item.payload }));
    const validateOpening = async () => {
      let result: ReadonlyMap<string, CommandPresentation> | null = null;
      // A portal moves logical focus as it opens. If that movement lands while
      // the first batch is awaiting a validator, the command kernel correctly
      // rejects the captured responder generation as stale. Re-run only for
      // this still-current opening; never publish the stale batch.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const validated = await runtime.commands.validateMany(requests, { source: "menu", generation, signal: controller.signal });
        if (controller.signal.aborted || generation !== openingGeneration.current) return;
        result = new Map(Array.from(validated, ([key, value]) => [String(key), value]));
        if (![...result.values()].some(isCommandValidationStale)) break;
      }
      if (!result || controller.signal.aborted || generation !== openingGeneration.current) return;
      validatedSnapshot.current = {
        tupleSignature: capturedTupleSignature,
        ...getPresentationGeneration(),
      };
      setPresentations(result);
      setValidating(false);
    };
    void validateOpening().catch(() => {
      if (!controller.signal.aborted && generation === openingGeneration.current) setValidating(false);
    });
    return () => controller.abort();
  }, [indexed, open, registryGeneration, runtime, tupleSignature]);

  const dispatch = useCallback(async (value: string) => {
    const item = indexed.byKey.get(value);
    if (!item?.commandId || item.separator || item.children?.length) return { status: "unhandled", commandId: item?.commandId ?? value } as const;
    // A menu owns its presentation while open. Revalidating through the
    // dispatcher after this point can race a disabled item into an enabled
    // command, so never use a menu value to bypass the displayed decision.
    const presentation = presentationsRef.current.get(value);
    const snapshot = validatedSnapshot.current;
    if (!openRef.current || !snapshot || snapshot.tupleSignature !== tupleSignature
      || snapshot.registryGeneration !== getPresentationGeneration().registryGeneration
      || snapshot.responderGeneration !== getPresentationGeneration().responderGeneration) {
      return { status: "cancelled", commandId: item.commandId, operationId: "", reason: "The menu command presentation became stale." } as const;
    }
    if (!presentation || presentation.hidden || presentation.denied || !presentation.enabled) {
      return {
        status: presentation?.denied ? "denied" : "disabled",
        commandId: item.commandId,
        responderId: presentation?.responderId ?? "runtime",
        reason: presentation?.disabledReason ?? (
          presentation?.hidden
            ? "This command is hidden in this menu."
            : presentation?.denied
              ? "This command is not permitted."
              : presentation
                ? "This command is not currently available."
                : "Command validation is still pending."
        ),
      } as const;
    }
    const prepared = await runtime.commands.prepareDispatch(item.commandId, item.payload, { source: "menu" });
    if (prepared.status !== "accepted") {
      if (prepared.status === "unhandled") return { status: "unhandled", commandId: item.commandId } as const;
      if (prepared.status === "invalid-payload") return { status: "invalid-payload", commandId: item.commandId, issues: [prepared.reason] } as const;
      if (prepared.status === "cancelled") return { status: "cancelled", commandId: item.commandId, operationId: "", reason: prepared.reason } as const;
      return { status: prepared.status, commandId: item.commandId, responderId: presentation.responderId ?? "runtime", reason: prepared.reason } as const;
    }
    return runtime.commands.dispatch(item.commandId, item.payload, { source: "menu", acceptance: prepared.acceptance });
  }, [indexed, runtime, tupleSignature]);

  return { items: useMemo(() => presentItems(items, presentations), [items, presentations]), dispatch, validating };
}
