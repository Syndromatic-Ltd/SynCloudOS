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
import { isHiddenCommandAcceptance } from "../../../SynCloudOS/nseRuntimeContracts";

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
  const bindingGeneration = useRef(0);
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
      const current = !lease.signal.aborted && currentGeneration === generation.current;
      if (validationLease.current === lease) validationLease.current = null;
      lease.dispose();
      if (current) setValidating(false);
    });
  }, [binding, port]);

  useEffect(() => {
    refresh();
    return () => {
      bindingGeneration.current += 1;
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
    // Cached presentation draws availability; it cannot decide a new intent.
    // A custom sender can fire between a model/focus change and React's next
    // validation paint. Prepare both bound and event payloads canonically.
    dispatchLease.current?.dispose();
    const lease = createAbortLease(port.signal);
    dispatchLease.current = lease;
    const dispatchGeneration = bindingGeneration.current;
    const acceptedAuthority = currentAuthority;
    setFailure(null);
    try {
      const dispatchedPayload = hasPayload ? payload : binding.payload;
      const availability = await port.commands.validate(binding.id, dispatchedPayload, { signal: lease.signal, source: "api" });
      if (!availability?.enabled || availability.denied || availability.hidden || availability.stale) return null;
      if (lease.signal.aborted || dispatchLease.current !== lease || dispatchGeneration !== bindingGeneration.current) return null;
      const preparation = await port.commands.prepareDispatch(binding.id, dispatchedPayload, {
        signal: lease.signal,
        source: "api",
      });
      if (preparation.status !== "accepted" || isHiddenCommandAcceptance(preparation.acceptance)) return null;
      const latestAuthority = port.commands.getPresentationGeneration();
      // A popup can restore focus while its choice is being prepared. The
      // one-shot canonical acceptance owns exact responder/registration checks;
      // a coarse focus generation change alone must not cancel the same target.
      if (lease.signal.aborted || dispatchLease.current !== lease || dispatchGeneration !== bindingGeneration.current
        || latestAuthority.registryGeneration !== acceptedAuthority.registryGeneration
        || preparation.acceptance.responderId !== availability.responderId) return null;
      const result = await port.commands.dispatch(binding.id, dispatchedPayload, {
        signal: lease.signal,
        source: "api",
        acceptance: preparation.acceptance,
      });
      // Execution can settle after this sender has unmounted, rebound or lost
      // its runtime. The command owns its work; the obsolete control must not
      // apply a late selection/value commit through its old callbacks.
      if (lease.signal.aborted || dispatchLease.current !== lease || dispatchGeneration !== bindingGeneration.current) return null;
      refresh();
      return result;
    } catch {
      if (!lease.signal.aborted && dispatchLease.current === lease && dispatchGeneration === bindingGeneration.current) {
        setFailure({ commandId: binding.id, stage: "dispatch" });
      }
      return null;
    } finally {
      if (dispatchLease.current === lease) dispatchLease.current = null;
      lease.dispose();
    }
  }, [binding, port, refresh]);

  return useMemo(() => ({ presentation, validating, failure, refresh, dispatch }), [dispatch, failure, presentation, refresh, validating]);
}
