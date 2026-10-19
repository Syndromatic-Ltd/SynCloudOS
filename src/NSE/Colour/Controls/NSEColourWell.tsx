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

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { GFXColour } from "../../../FX/GraphicsFX/public";
import { nseAppearanceSlot, useNSEAppearanceSlot } from "../../Appearance";
import { useNSEColourPanelController, useNSEColourPanelService, useOptionalNSEColourPanelCommands, useOptionalNSEColourPanelDrag, useOptionalNSEColourPanelResponderId } from "../ColourPanel/NSEColourPanelProvider";
import type { NSEEyeDropperAdapter } from "../Pickers/NSEEyeDropperAdapter";
import type { NSEColourTransferAdapter } from "../Transfer";
import { parseNSEColourTransfer, serialiseNSEColourTransfer } from "../Transfer";
import { nseDragCommandIds, nseDragNoPayload, useNSEDragSource, useNSEDropTarget } from "../../Drag";
import { useNSEDeferredDisposal } from "../../interactionLifecycle";

export interface NSEColourWellProps {
  readonly id?: string;
  /** The focused responder that owns this concrete well when it is mounted
   * inside a command-capable application surface. */
  readonly responderId?: string;
  readonly name?: string;
  readonly value?: GFXColour;
  readonly defaultValue?: GFXColour;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly showAlpha?: boolean;
  readonly eyeDropper?: NSEEyeDropperAdapter;
  readonly transfer?: NSEColourTransferAdapter;
  readonly "aria-label": string;
  onValueChange?(colour: GFXColour, phase: "preview" | "commit"): void;
}

export function NSEColourWell(props: NSEColourWellProps) {
  const service = useNSEColourPanelService();
  const generatedId = useId();
  const id = props.id ?? `colour-well-${generatedId}`;
  const initial = props.defaultValue ?? GFXColour.rgba(0, 0, 0);
  const [uncontrolled, setUncontrolled] = useState(initial);
  const current = props.value ?? uncontrolled;
  const currentRef = useRef(current);
  currentRef.current = current;
  const controller = useNSEColourPanelController();
  const runtimeDrag = useOptionalNSEColourPanelDrag();
  const dragCommands = useOptionalNSEColourPanelCommands();
  const scopedResponderId = useOptionalNSEColourPanelResponderId();
  const targetResponderId = props.responderId ?? scopedResponderId ?? `${id}:responder`;
  const panel = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const transferRequestRef = useRef<AbortController | null>(null);
  const claimedSessionRef = useRef<string | null>(null);
  const [transferAnnouncement, setTransferAnnouncement] = useState("");
  const [focused, setFocused] = useState(false);
  const transferValues = () => serialiseNSEColourTransfer(current);
  const targetEndpoint = useMemo(() => runtimeDrag
    ? runtimeDrag.endpointForResponder?.(targetResponderId) ?? runtimeDrag.endpoint
    : null, [runtimeDrag, targetResponderId]);
  const nativeSourceEndpoint = useMemo(() => runtimeDrag
    ? runtimeDrag.endpointForResponder?.(targetResponderId) ?? runtimeDrag.endpoint
    : null, [runtimeDrag, targetResponderId]);
  // The transfer endpoint may intentionally remain the mount root (for an
  // issued shared board), while command routing must still honour the focused
  // concrete control responder.
  const commandResponderId = props.responderId ?? targetEndpoint?.responderId ?? targetResponderId;
  const change = (colour: GFXColour, phase: "preview" | "commit") => {
    if (props.value === undefined) setUncontrolled(colour);
    props.onValueChange?.(colour, phase);
  };
  const activateTarget = (open: boolean) => {
    if (props.disabled || props.readOnly) return false;
    releaseRef.current?.();
    releaseRef.current = controller.activateTarget({ id, responderId: targetResponderId, showsAlpha: props.showAlpha === true, read: () => currentRef.current, preview: ({ current }) => change(current, "preview"), commit: ({ current }) => change(current, "commit"), cancel: ({ current }) => change(current, "preview") });
    if (open) controller.open();
    return true;
  };
  const claimRuntimeDrop = (nativeValues?: ReturnType<typeof transferValues>) => {
    if (!runtimeDrag || !targetEndpoint || props.disabled || props.readOnly) return false;
    let session = runtimeDrag.manager.snapshot().active;
    if (!session && nativeValues && nativeSourceEndpoint) {
      session = runtimeDrag.manager.begin({
        source: nativeSourceEndpoint,
        representations: nativeValues,
        operations: ["copy"],
      });
    }
    if (!session) return false;
    const sessionId = session.id;
    runtimeDrag.manager.claimDrop(sessionId);
    claimedSessionRef.current = sessionId;
    return sessionId;
  };
  const cancelClaimedDrop = (reason: string) => {
    const sessionId = claimedSessionRef.current;
    claimedSessionRef.current = null;
    if (sessionId) runtimeDrag?.manager.cancel(sessionId, reason);
  };
  const performRuntimeDrop = async (signal: AbortSignal, nativeValues?: ReturnType<typeof transferValues>) => {
    if (!runtimeDrag || !targetEndpoint || props.disabled || props.readOnly) return false;
    const sessionId = claimedSessionRef.current ?? claimRuntimeDrop(nativeValues);
    if (!sessionId) return false;
    const abort = () => runtimeDrag.manager.cancel(sessionId, "colour drop owner cancelled");
    signal.addEventListener("abort", abort, { once: true });
    try {
      const negotiated = await runtimeDrag.manager.updateDestination(sessionId, {
        endpoint: targetEndpoint,
        operations: ["copy"],
        accept: async (droppingSession, commitSignal) => {
          commitSignal.throwIfAborted();
          const values = runtimeDrag.manager.readPayload(droppingSession.id, [
            "application/x-syncloudos-colour",
            "text/plain",
          ], commitSignal);
          const colour = parseNSEColourTransfer(values);
          if (!colour || !activateTarget(false)) return false;
          controller.commit(colour, "paste");
          return true;
        },
      });
      if (negotiated.operation === "none" || signal.aborted) {
        runtimeDrag.manager.cancel(sessionId, "colour drop denied");
        return false;
      }
      return (await runtimeDrag.manager.performDrop(sessionId)).accepted;
    } catch (error) {
      runtimeDrag.manager.cancel(sessionId, "colour drop failed");
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      if (claimedSessionRef.current === sessionId) claimedSessionRef.current = null;
    }
  };
  const startRuntimeDrop = async (outerSignal?: AbortSignal) => {
    transferRequestRef.current?.abort(new DOMException("A newer colour drop replaced this request.", "AbortError"));
    const request = new AbortController();
    transferRequestRef.current = request;
    const signal = outerSignal ? AbortSignal.any([request.signal, outerSignal]) : request.signal;
    try {
      const accepted = await performRuntimeDrop(signal);
      setTransferAnnouncement(accepted ? "Colour drop accepted." : "Colour drop denied.");
      return accepted;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Colour drop failed.";
      setTransferAnnouncement(/denied|policy|authoris/i.test(message) ? "Colour drop denied." : "Colour drop failed.");
      throw error;
    } finally {
      if (transferRequestRef.current === request) transferRequestRef.current = null;
    }
  };
  const startRuntimeDropRef = useRef(startRuntimeDrop);
  startRuntimeDropRef.current = startRuntimeDrop;
  const canDropThroughCommand = () => Boolean(runtimeDrag && targetEndpoint && !props.disabled && !props.readOnly && runtimeDrag.manager.snapshot().active);
  const canDropThroughCommandRef = useRef(canDropThroughCommand);
  canDropThroughCommandRef.current = canDropThroughCommand;
  useEffect(() => {
    if (!dragCommands || !runtimeDrag || !targetEndpoint) return;
    const registration = dragCommands.register({
      id: nseDragCommandIds.drop,
      responderId: commandResponderId,
      title: { key: "command.drag.drop", fallback: "Drop Colour" },
      payload: nseDragNoPayload,
      defaultKeyBindings: [],
      scope: "focused",
      undo: { kind: "none" },
      validate: () => ({ enabled: canDropThroughCommandRef.current(), disabledReason: "There is no accepted colour drag to drop." }),
      execute: ({ signal }: { readonly signal: AbortSignal }) => startRuntimeDropRef.current(signal),
    });
    return () => { registration.dispose(); };
  }, [commandResponderId, dragCommands, runtimeDrag, targetEndpoint]);
  const dragSource = useNSEDragSource({
    disabled: props.disabled || props.readOnly,
    begin: () => {
      const representations = transferValues();
      const typed = representations[0]!;
      const session = runtimeDrag && targetEndpoint ? runtimeDrag.manager.begin({
        source: targetEndpoint,
        representations,
        operations: ["copy"],
      }) : null;
      let release: void | (() => void);
      try { release = props.transfer?.beginDrag?.(
        { type: "application/x-syncloudos-colour", value: typed.value as string },
        { sourceId: id },
      ); } catch (error) {
        if (session) runtimeDrag?.manager.cancel(session.id, "local colour drag bridge failed");
        throw error;
      }
      return {
        representations,
        cancel: (reason: string) => {
          if (session) runtimeDrag?.manager.cancel(session.id, reason);
          release?.();
        },
        end: (reason: string) => {
          if (session) runtimeDrag?.manager.cancelUnclaimed(session.id, reason);
          release?.();
        },
      };
    },
    ...(dragCommands && runtimeDrag && targetEndpoint
      ? { command: { port: dragCommands, responderId: commandResponderId } }
      : {}),
  });
  const dropTarget = useNSEDropTarget({
    claim: (values) => {
      const sessionId = claimRuntimeDrop(values as ReturnType<typeof transferValues>);
      return sessionId ? { cancel: cancelClaimedDrop } : undefined;
    },
    accept: (types, signal) => {
      if (props.disabled || props.readOnly ||
        (!types.includes("application/x-syncloudos-colour") && !types.includes("text/plain"))) return false;
      return props.transfer?.authoriseDrop?.(types, signal) ?? Boolean(runtimeDrag);
    },
    drop: async (values, signal) => {
      signal.throwIfAborted();
      await performRuntimeDrop(signal, values as ReturnType<typeof transferValues>);
    },
  });
  const activate = () => {
    activateTarget(true);
  };

  useEffect(() => () => {
    transferRequestRef.current?.abort(new DOMException("Colour well unmounted.", "AbortError"));
    transferRequestRef.current = null;
    cancelClaimedDrop("Colour well unmounted.");
  }, []);
  // The panel target is released when the well goes, not when React replays
  // its effects (moved content replays them in development), which would
  // close the Colours panel under the user.
  const panelTarget = useMemo(() => ({ dispose: () => { releaseRef.current?.(); releaseRef.current = null; } }), []);
  useNSEDeferredDisposal(panelTarget);

  useEffect(() => {
    const form = hiddenRef.current?.form;
    if (!form || props.value !== undefined) return;
    const reset = () => setUncontrolled(initial);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initial, props.value]);

  const appearanceState = props.disabled ? "disabled" : focused || panel.activeTargetId === id ? "focused" : "normal";
  const appearance = useNSEAppearanceSlot(nseAppearanceSlot("colour-well", "well", appearanceState));
  return <span data-nse-control="colour-well" data-state={props.disabled ? "disabled" : panel.activeTargetId === id ? "active" : "normal"} {...appearance.attributes} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <button {...dragSource} {...dropTarget} type="button" id={id} aria-label={props["aria-label"]} aria-pressed={panel.activeTargetId === id && panel.open} disabled={props.disabled} aria-readonly={props.readOnly || undefined} onClick={activate} onKeyDown={(event) => {
      if (runtimeDrag && event.altKey && event.key === "Enter") {
        event.preventDefault();
        if (dragCommands && targetEndpoint) {
          void dragCommands.dispatch(nseDragCommandIds.drop, undefined, { source: "keyboard" }).then((result) => {
            if (result.status !== "executed") setTransferAnnouncement("Colour drop denied.");
          }).catch(() => setTransferAnnouncement("Colour drop failed."));
        } else void startRuntimeDrop().catch(() => undefined);
      } else dragSource.onKeyDown(event);
    }}><span data-nse-part="colour-sample" aria-hidden="true" style={{ backgroundColor: current.toCSS() }} /><span data-nse-part="colour-value">{current.toHex({ includeAlpha: props.showAlpha })}</span></button>
    {props.name ? <input ref={hiddenRef} type="hidden" name={props.name} value={current.toCSS()} /> : null}
    <span role="status" aria-live="polite">{transferAnnouncement}</span>
  </span>;
}
