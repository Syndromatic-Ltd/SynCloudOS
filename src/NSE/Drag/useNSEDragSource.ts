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

import { useEffect, useRef, type DragEventHandler, type FocusEventHandler, type KeyboardEventHandler } from "react";
import type { PasteboardRepresentation } from "../../SynCloudOS/SynCloudOS";
import { writeNSEDataTransfer } from "./browserDragBridge";
import { dragCommandSucceeded, nseDragCommandIds, nseDragNoPayload, type NSEDragCommandPort } from "./dragCommandPort";

/** Native drag interop lives here; canonical state remains in the runtime manager. */
export function useNSEDragSource(options: {
  readonly disabled?: boolean;
  readonly begin: () => Readonly<{
    readonly representations: readonly PasteboardRepresentation[];
    cancel(reason: string): void;
    end?(reason: string): void;
  }>;
  readonly onError?: (error: unknown) => void;
  /** When supplied, keyboard alternatives are admitted by the runtime command
   * system instead of calling the local drag operation directly. */
  readonly command?: { readonly port: NSEDragCommandPort; readonly responderId: string };
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const ownership = useRef<ReturnType<typeof options.begin> | null>(null);
  const cancel = (reason: string) => {
    const current = ownership.current;
    ownership.current = null;
    current?.cancel(reason);
  };
  const end = (reason: string) => {
    const current = ownership.current;
    ownership.current = null;
    if (current?.end) current.end(reason);
    else current?.cancel(reason);
  };
  const begin = (reason: string) => {
    cancel(reason);
    const current = optionsRef.current.begin();
    ownership.current = current;
    return current;
  };
  useEffect(() => () => cancel("drag source unmounted"), []);
  const commandPort = options.command?.port;
  const commandResponderId = options.command?.responderId;
  useEffect(() => {
    if (!commandPort || !commandResponderId) return;
    const beginRegistration = commandPort.register({
      id: nseDragCommandIds.begin,
      responderId: commandResponderId,
      title: { key: "command.drag.begin", fallback: "Begin Drag" },
      payload: nseDragNoPayload,
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => ({ enabled: !optionsRef.current.disabled, disabledReason: "This drag source is unavailable." }),
      execute: () => {
        if (optionsRef.current.disabled) return false;
        begin("new keyboard drag replaced the active source");
        return true;
      },
    });
    const cancelRegistration = commandPort.register({
      id: nseDragCommandIds.cancel,
      responderId: commandResponderId,
      title: { key: "command.drag.cancel", fallback: "Cancel Drag" },
      payload: nseDragNoPayload,
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => ({ enabled: ownership.current !== null, disabledReason: "There is no active drag to cancel." }),
      execute: () => { cancel("keyboard cancellation"); return true; },
    });
    return () => { cancelRegistration.dispose(); beginRegistration.dispose(); };
  }, [commandPort, commandResponderId]);
  const onDragStart: DragEventHandler<HTMLElement> = (event) => {
    if (optionsRef.current.disabled) { event.preventDefault(); return; }
    try {
      const current = begin("new drag source replaced the active source");
      try { writeNSEDragRepresentations(event, current.representations); }
      catch (error) {
        cancel("native drag payload write failed");
        event.preventDefault();
        optionsRef.current.onError?.(error);
      }
    } catch (error) {
      event.preventDefault();
      optionsRef.current.onError?.(error);
    }
  };
  const onKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    const currentOptions = optionsRef.current;
    if (!currentOptions.disabled && event.altKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      if (currentOptions.command) {
        void currentOptions.command.port.dispatch(nseDragCommandIds.begin, undefined, { source: "keyboard" }).then((result) => {
          if (!dragCommandSucceeded(result)) currentOptions.onError?.(new DOMException("Keyboard drag command was not admitted.", "AbortError"));
        }).catch((error) => currentOptions.onError?.(error));
      } else {
        try { begin("new keyboard drag replaced the active source"); }
        catch (error) { currentOptions.onError?.(error); }
      }
    } else if (event.key === "Escape") {
      if (currentOptions.command) {
        void currentOptions.command.port.dispatch(nseDragCommandIds.cancel, undefined, { source: "keyboard" }).catch((error) => currentOptions.onError?.(error));
      } else cancel("drag source cancelled with Escape");
    }
  };
  const onDragEnd: DragEventHandler<HTMLElement> = () => end("native drag ended");
  const onBlur: FocusEventHandler<HTMLElement> = (event) => {
    if (event.relatedTarget === null) cancel("drag source lost its owner window");
  };
  return { draggable: !optionsRef.current.disabled, onDragStart, onDragEnd, onKeyDown, onBlur } as const;
}

export function writeNSEDragRepresentations(
  event: Parameters<DragEventHandler<HTMLElement>>[0],
  values: readonly PasteboardRepresentation[],
  effectAllowed: DataTransfer["effectAllowed"] = "copyMove",
): void {
  writeNSEDataTransfer(event.dataTransfer, values, effectAllowed);
}
