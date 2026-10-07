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

import { useEffect, useMemo, useRef } from "react";
import { NSEFontPanel, type NSEFontPanelCommandPort, type NSEFontPanelProps } from "../NSE/NSE";
import { useLocaleServicesSnapshot, useKernelSynCloudOS } from "./index";

export type SynCloudOSNSEFontPanelProps = Omit<NSEFontPanelProps, "commandPort">;

export function SynCloudOSNSEFontPanel(props: SynCloudOSNSEFontPanelProps) {
  const runtime = useKernelSynCloudOS();
  const hostDirection = useLocaleServicesSnapshot().direction;
  const lifecycle = useRef({ active: false, generation: 0, operations: new Set<AbortController>() });
  useEffect(() => {
    lifecycle.current.active = true;
    lifecycle.current.generation += 1;
    const abort = () => {
      lifecycle.current.active = false;
      lifecycle.current.generation += 1;
      for (const operation of lifecycle.current.operations) operation.abort(runtime.signal.reason);
      lifecycle.current.operations.clear();
    };
    if (runtime.signal.aborted) abort();
    else runtime.signal.addEventListener("abort", abort, { once: true });
    return () => {
      runtime.signal.removeEventListener("abort", abort);
      if (lifecycle.current.active) abort();
    };
  }, [runtime]);
  const commandPort = useMemo<NSEFontPanelCommandPort>(() => ({
    async execute(commandId, payload, signal) {
      if (!lifecycle.current.active) return { status: "cancelled" };
      const generation = lifecycle.current.generation;
      const operation = new AbortController();
      lifecycle.current.operations.add(operation);
      const intentAuthority = signal;
      const authority = AbortSignal.any([intentAuthority, operation.signal, runtime.signal]);
      try {
        authority.throwIfAborted();
        const prepared = await runtime.commands.prepareDispatch(commandId, payload, { source: "toolbar", signal: authority });
        authority.throwIfAborted();
        if (!lifecycle.current.active || lifecycle.current.generation !== generation) return { status: "cancelled" };
        if (prepared.status !== "accepted") return { status: prepared.status };
        intentAuthority.throwIfAborted();
        const result = await runtime.commands.dispatch(commandId, payload, { source: "toolbar", signal: authority, acceptance: prepared.acceptance });
        authority.throwIfAborted();
        if (!lifecycle.current.active || lifecycle.current.generation !== generation) return { status: "cancelled" };
        return { status: result.status };
      } finally {
        lifecycle.current.operations.delete(operation);
      }
    },
  }), [runtime]);
  return <NSEFontPanel {...props} direction={props.direction ?? hostDirection} commandPort={commandPort} />;
}
