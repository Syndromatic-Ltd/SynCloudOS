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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CommandDispatchResult, CommandPresentation } from "../../../SynCloudOS/SynCloudOS";
import type { NSEControlCommandBinding, NSEControlRuntimePort } from "./controlTypes";
import { subscribeNSEActionChanges } from "./actionChanges";

const NSEControlRuntimeContext = createContext<NSEControlRuntimePort | null>(null);

export interface NSEControlRuntimeProviderProps {
  readonly port: NSEControlRuntimePort;
  readonly children: ReactNode;
}

/** Supplies the canonical command authority to runtime-neutral NSE controls. */
export function NSEControlRuntimeProvider({ port, children }: NSEControlRuntimeProviderProps) {
  return <NSEControlRuntimeContext.Provider value={port}>{children}</NSEControlRuntimeContext.Provider>;
}

export function useOptionalNSEControlRuntimePort(): NSEControlRuntimePort | null {
  return useContext(NSEControlRuntimeContext);
}

export interface NSEControlCommandState<P> {
  readonly presentation: CommandPresentation | null;
  readonly validating: boolean;
  readonly failure: NSEControlCommandFailure | null;
  refresh(): void;
  /** No argument uses the bound payload; a supplied argument, including undefined, is freshly prepared. */
  dispatch(payload?: P): Promise<CommandDispatchResult<unknown> | null>;
}

/** Redacted control-facing indication that canonical command work failed. */
export interface NSEControlCommandFailure {
  readonly commandId: string;
  readonly stage: "validate" | "dispatch";
}

interface AbortLease {
  readonly signal: AbortSignal;
  dispose(): void;
}

/** Links control-owned cancellation to the owning runtime without ambient browser state. */
function createAbortLease(parent: AbortSignal): AbortLease {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      parent.removeEventListener("abort", abort);
      if (!controller.signal.aborted) controller.abort();
    },
  };
}

/**
 * Reads and dispatches the declared command through the active command
 * responder chain. The binding's responderId is descriptive for diagnostics and
 * must never be used to bypass that canonical resolver.
 */
export function useNSEControlCommand<P>(
  binding: NSEControlCommandBinding<P> | undefined,
  explicitPort?: NSEControlRuntimePort,
): NSEControlCommandState<P> {
  const contextPort = useContext(NSEControlRuntimeContext);
  const port = explicitPort ?? contextPort;
  const [presentation, setPresentation] = useState<CommandPresentation | null>(null);
  const [validating, setValidating] = useState(false);
  const [failure, setFailure] = useState<NSEControlCommandFailure | null>(null);
  const generation = useRef(0);
  const validationLease = useRef<AbortLease | null>(null);
  const dispatchLease = useRef<AbortLease | null>(null);
  const presentationGeneration = useRef<{ readonly registryGeneration: number; readonly responderGeneration: number } | null>(null);

  const refresh = useCallback((): void => {
    validationLease.current?.dispose();
    validationLease.current = null;
    generation.current += 1;
    const currentGeneration = generation.current;
    if (!binding || !port || port.signal.aborted) {
      setPresentation(null);
      setValidating(false);
      return;
    }
    const lease = createAbortLease(port.signal);
    const authorityGeneration = port.commands.getPresentationGeneration();
    validationLease.current = lease;
    setFailure(null);
    setValidating(true);
    void port.commands.validate(binding.id, binding.payload, {
      signal: lease.signal,
      source: "api",
      generation: currentGeneration,
    }).then((nextPresentation) => {
      if (lease.signal.aborted || currentGeneration !== generation.current) return;
      const currentAuthority = port.commands.getPresentationGeneration();
      if (currentAuthority.registryGeneration !== authorityGeneration.registryGeneration
        || currentAuthority.responderGeneration !== authorityGeneration.responderGeneration) {
        setPresentation(null);
        presentationGeneration.current = null;
        refresh();
        return;
      }
      presentationGeneration.current = authorityGeneration;
      setPresentation(nextPresentation);
    }).catch(() => {
      // Command diagnostics are captured by the canonical command system. A failed
      // validation must not publish an executable stale presentation.
      if (lease.signal.aborted || currentGeneration !== generation.current) return;
      setPresentation(null);
      setFailure({ commandId: binding.id, stage: "validate" });
    }).finally(() => {
      if (lease.signal.aborted || currentGeneration !== generation.current) return;
      if (validationLease.current === lease) validationLease.current = null;
      setValidating(false);
    });
  }, [binding, port]);

  useEffect(() => {
    refresh();
    return () => {
      generation.current += 1;
      validationLease.current?.dispose();
      validationLease.current = null;
      dispatchLease.current?.dispose();
      dispatchLease.current = null;
    };
  }, [refresh]);

  useEffect(() => binding ? subscribeNSEActionChanges(binding.id, refresh) : undefined, [binding, refresh]);
  useEffect(() => binding && port && !port.signal.aborted ? port.commands.subscribePresentation?.(refresh) : undefined, [binding, port, refresh]);
  const dispatch = useCallback(async function dispatch(payload?: P): Promise<CommandDispatchResult<unknown> | null> {
    if (!binding || !port || port.signal.aborted) return null;
    const hasPayload = arguments.length > 0;
    const currentAuthority = port.commands.getPresentationGeneration();
    // Presentation describes only the bound payload. An event override needs its
    // own canonical preparation, even when that bound payload is unavailable.
    if (!hasPayload) {
      if (!presentation?.enabled || presentation.denied || presentation.hidden || presentation.stale) return null;
      if (presentationGeneration.current?.registryGeneration !== currentAuthority.registryGeneration
        || presentationGeneration.current.responderGeneration !== currentAuthority.responderGeneration) return null;
    }
    dispatchLease.current?.dispose();
    const lease = createAbortLease(port.signal);
    dispatchLease.current = lease;
    const dispatchGeneration = generation.current;
    const acceptedAuthority = currentAuthority;
    setFailure(null);
    try {
      const dispatchedPayload = hasPayload ? payload : binding.payload;
      const preparation = await port.commands.prepareDispatch(binding.id, dispatchedPayload, {
        signal: lease.signal,
        source: "api",
      });
      if (preparation.status !== "accepted") return null;
      const latestAuthority = port.commands.getPresentationGeneration();
      if (lease.signal.aborted || dispatchLease.current !== lease || dispatchGeneration !== generation.current
        || latestAuthority.registryGeneration !== acceptedAuthority.registryGeneration
        || latestAuthority.responderGeneration !== acceptedAuthority.responderGeneration) return null;
      const result = await port.commands.dispatch(binding.id, dispatchedPayload, {
        signal: lease.signal,
        source: "api",
        acceptance: preparation.acceptance,
      });
      refresh();
      return result;
    } catch {
      if (!lease.signal.aborted && dispatchLease.current === lease && dispatchGeneration === generation.current) {
        setFailure({ commandId: binding.id, stage: "dispatch" });
      }
      return null;
    } finally {
      if (dispatchLease.current === lease) dispatchLease.current = null;
      lease.dispose();
    }
  }, [binding, port, presentation, refresh]);

  return useMemo(() => ({ presentation, validating, failure, refresh, dispatch }), [dispatch, failure, presentation, refresh, validating]);
}
