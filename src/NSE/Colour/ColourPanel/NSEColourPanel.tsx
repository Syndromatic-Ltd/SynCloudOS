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

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useNSEOverlayProvider } from "../../Overlays";
import { NSEUtilityPanel } from "../../Overlays/NSEUtilityPanel";
import { GFXColour } from "../../../FX/GraphicsFX/public";
import { createNSEBrowserEyeDropper, type NSEEyeDropperAdapter } from "../Pickers";
import { NSEColourPanelController } from "./NSEColourPanelController";
import { useOptionalNSEColourPanelController } from "./NSEColourPanelProvider";
import { NSETextField } from "../../Controls/Fields/NSEFields";
import { NSESlider } from "../../Controls/Values/NSESlider";
import { NSETabView } from "../../Navigation/NSETabView";
import { NSEColourCrayonsMode, NSEColourImageMode, NSEColourPalettesMode, NSEColourSlidersMode, NSEColourWheelMode, nseColourPanelControlHeight } from "./NSEColourPanelModes";
import { NSEColourCrayonsModeIcon, NSEColourImageModeIcon, NSEColourMagnifierIcon, NSEColourPalettesModeIcon, NSEColourSlidersModeIcon, NSEColourWheelModeIcon } from "./colourPanelIcons";
import { NSEColourSwatchStrip, writeDraggedColour } from "./NSEColourSwatchStrip";

export interface NSEColourPanelProps {
  readonly controller?: NSEColourPanelController;
  readonly "aria-label"?: string;
  /** The window title, NSColorPanel's "Colors". */
  readonly title?: string;
  readonly contentState?: "ready" | "loading" | "empty" | "disabled" | "read-only" | "invalid" | "denied" | "interrupted" | "error";
  /** The magnifier's source: defaults to the browser's (the system eyedropper
   * where there is one, otherwise a loupe over a capture of the page). */
  readonly eyeDropper?: NSEEyeDropperAdapter;
}

const contentMessages = {
  loading: "Loading colour choices.",
  empty: "No colour choices are available.",
  disabled: "Colour editing is disabled.",
  "read-only": "Colour editing is read only.",
  invalid: "The current colour is invalid.",
  denied: "Permission to edit colours was denied.",
  interrupted: "Colour editing was interrupted.",
  error: "Colour choices could not be loaded.",
} as const;

const eyeDropperMessages = {
  denied: "This page can't be sampled.",
  unavailable: "The magnifier isn't available here.",
  error: "The colour couldn't be picked.",
} as const;

/** Hex digits as the panel shows them: uppercase, no "#" (the field wears it
 * as a prefix); alpha digits only when not opaque. */
function hexText(colour: GFXColour | null) {
  return colour ? colour.toHex({ includeAlpha: colour.components.a < 1 }).replace(/^#/, "").toUpperCase() : "";
}

/** A hex code with or without "#" (3, 4, 6 or 8 digits), or any CSS colour. */
function parseHexEntry(text: string): GFXColour | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try { return GFXColour.parse(/^#?[0-9a-f]{3,4}$|^#?[0-9a-f]{6}$|^#?[0-9a-f]{8}$/i.test(trimmed) ? `#${trimmed.replace(/^#/, "")}` : trimmed); }
  catch { return null; }
}

/**
 * NSColorPanel is one shared window, however many views ask for it. Every
 * mounted NSEColourPanel in a runtime joins that panel's roster; the earliest
 * mounted one (the system's, mounted by Webspring before any app) draws it,
 * and a later one (an app's) stands by, taking over only if the earlier goes.
 */
interface SharedPanelRoster {
  readonly members: Map<symbol, number>;
  readonly listeners: Set<() => void>;
}

const sharedPanelRosters = new Map<string, SharedPanelRoster>();
let panelMountSequence = 0;

function sharedPanelRoster(key: string): SharedPanelRoster {
  let roster = sharedPanelRosters.get(key);
  if (!roster) {
    roster = { members: new Map(), listeners: new Set() };
    sharedPanelRosters.set(key, roster);
  }
  return roster;
}

function useSharedPanelPresenter(key: string): boolean {
  const [member] = useState(() => ({ token: Symbol("nse-colour-panel"), sequence: ++panelMountSequence }));
  const roster = sharedPanelRoster(key);
  useEffect(() => {
    roster.members.set(member.token, member.sequence);
    for (const listener of [...roster.listeners]) listener();
    return () => {
      roster.members.delete(member.token);
      for (const listener of [...roster.listeners]) listener();
    };
  }, [member, roster]);
  const subscribe = useMemo(() => (listener: () => void) => {
    roster.listeners.add(listener);
    return () => { roster.listeners.delete(listener); };
  }, [roster]);
  const presenter = () => {
    let first: symbol | null = null;
    let lowest = Infinity;
    for (const [token, sequence] of roster.members) {
      if (sequence < lowest) { lowest = sequence; first = token; }
    }
    return first === member.token;
  };
  return useSyncExternalStore(subscribe, presenter, presenter);
}

/** The colour a fresh panel shows, NSColorPanel's white. */
const initialPanelColour = GFXColour.parse("#ffffff");

const defaultSwatches = ["#000000", "#ffffff", "#ff3b30", "#ffcc00", "#34c759", "#007aff", "#5856d6"];

/**
 * The shared colour panel, NSColorPanel's layout in Atmo: a bar of mode icons,
 * the magnifier beside the colour being edited, the mode itself, the hex code
 * (and opacity, for a target that takes it), and the saved colours along the
 * foot. There is no Apply: each finished gesture is the change (one undo step),
 * and closing the panel keeps what is shown.
 */
export function NSEColourPanel({ controller: supplied, "aria-label": label = "Colour panel", title = "Colours", contentState = "ready", eyeDropper: suppliedEyeDropper }: NSEColourPanelProps) {
  const shared = useOptionalNSEColourPanelController();
  const controller = supplied ?? shared;
  if (!controller) throw new Error("NSEColourPanel requires a supplied controller or NSEColourPanelProvider.");
  const { runtime } = useNSEOverlayProvider();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [hexError, setHexError] = useState(false);
  const [eyeDropperState, setEyeDropperState] = useState<"idle" | "picking" | keyof typeof eyeDropperMessages>("idle");
  const pickAbort = useRef<AbortController | null>(null);
  const instanceId = useId().replace(/:/g, "");
  const view = runtime.environment.browser.getWindow();
  const eyeDropper = useMemo(() => suppliedEyeDropper ?? (view ? createNSEBrowserEyeDropper(view) : null), [suppliedEyeDropper, view]);
  const presents = useSharedPanelPresenter(controller.sharedPanelKey);  useEffect(() => {
    if (!presents) return;
    const unregister = [
      controller.registerPicker({ id: "wheel", label: "Colour Wheel", icon: <NSEColourWheelModeIcon />, order: 0, supportedSpaces: ["srgb", "display-p3"], render: (context) => <NSEColourWheelMode {...context} /> }),
      controller.registerPicker({ id: "sliders", label: "Colour Sliders", icon: <NSEColourSlidersModeIcon />, order: 10, supportedSpaces: ["srgb", "display-p3"], render: (context) => <NSEColourSlidersMode {...context} /> }),
      controller.registerPicker({ id: "palettes", label: "Colour Palettes", icon: <NSEColourPalettesModeIcon />, order: 20, supportedSpaces: ["srgb", "display-p3"], render: (context) => <NSEColourPalettesMode {...context} recents={controller.getSnapshot().recents} /> }),
      controller.registerPicker({ id: "image", label: "Image Palettes", icon: <NSEColourImageModeIcon />, order: 30, supportedSpaces: ["srgb", "display-p3"], render: (context) => <NSEColourImageMode {...context} /> }),
      controller.registerPicker({ id: "crayons", label: "Crayons", icon: <NSEColourCrayonsModeIcon />, order: 40, supportedSpaces: ["srgb", "display-p3"], render: (context) => <NSEColourCrayonsMode {...context} /> }),
    ];
    return () => { for (const release of unregister.reverse()) release(); };
  }, [controller, presents]);
  useEffect(() => { setHexError(false); }, [snapshot.current, snapshot.revision]);
  useEffect(() => {
    if (controller.getSnapshot().swatches.length > 0) return;
    controller.setSwatches(defaultSwatches.map(GFXColour.parse));
  }, [controller]);
  // A pick still running when the panel closes (or goes) is abandoned.
  useEffect(() => {
    if (snapshot.open) return;
    pickAbort.current?.abort();
  }, [snapshot.open]);
  useEffect(() => () => pickAbort.current?.abort(), []);
  const ownerDocument = runtime.environment.browser.getDocument();
  const targetElement = snapshot.activeTargetId ? ownerDocument?.getElementById(snapshot.activeTargetId) ?? null : null;
  // The target places the panel when it opens. The panel then stays where
  // it is while targets come and go (a page of wells can be left behind), so
  // it keeps the last target it was placed from while that is still there.
  const lastAnchor = useRef<HTMLElement | null>(null);
  if (targetElement) lastAnchor.current = targetElement;
  else if (!snapshot.open || !lastAnchor.current?.isConnected) lastAnchor.current = null;
  const anchor = targetElement ?? lastAnchor.current;
  // Before any colour has been chosen the panel shows white, as NSColorPanel
  // does: the wheel at full brightness, every control live. It is a colour
  // chooser even with nothing to apply the colour to.
  const current = snapshot.current ?? initialPanelColour;
  const disabled = contentState !== "ready" || snapshot.status === "disposed";
  const currentHex = current.toHex({ includeAlpha: current.components.a < 1 });
  const showsAlpha = controller.targetShowsAlpha(snapshot.activeTargetId);
  const opacity = Math.round(current.components.a * 100);
  const pickerContext = {
    colour: current,
    preview: (colour: GFXColour, reason: Parameters<NSEColourPanelController["preview"]>[1]) => controller.preview(colour, reason),
    commit: (colour: GFXColour, reason: Parameters<NSEColourPanelController["commit"]>[1]) => controller.commit(colour, reason),
  };
  const pick = async () => {
    if (!eyeDropper) return;
    if (pickAbort.current) {
      pickAbort.current.abort();
      return;
    }
    const abort = new AbortController();
    pickAbort.current = abort;
    setEyeDropperState("picking");
    const result = await eyeDropper.pick(abort.signal);
    if (pickAbort.current === abort) pickAbort.current = null;
    const live = controller.getSnapshot();
    if (result.kind === "accepted" && live.open) {
      setEyeDropperState("idle");
      // The sample carries no opacity of its own; the colour keeps the target's.
      controller.commit(result.colour.withAlpha(showsAlpha ? (live.current ?? initialPanelColour).components.a : 1), "pointer");
    } else {
      setEyeDropperState(result.kind === "denied" || result.kind === "unavailable" || result.kind === "error" ? result.kind : "idle");
    }
  };
  return (
    // An inspector: it stays open while the user works elsewhere, and its
    // close control keeps the colour shown, as NSColorPanel does.
    <NSEUtilityPanel id={`colour-panel-${instanceId}`} open={presents && snapshot.open} title={title} anchor={anchor} contentInset="none" onClose={() => { if (controller.getSnapshot().open) controller.close("commit"); }}>
    <section data-nse-control="colour-panel" data-state={hexError ? "invalid" : contentState === "ready" ? snapshot.status : contentState} data-appearance-recipe="colour-panel" aria-label={label} aria-busy={contentState === "loading" || undefined}>
      {contentState !== "ready" ? <p role={contentState === "loading" || contentState === "empty" || contentState === "disabled" || contentState === "read-only" ? "status" : "alert"} data-nse-part="content-message">{contentMessages[contentState]}</p> : null}
      <fieldset disabled={disabled}>
        <NSETabView
          aria-label="Colour pickers"
          keepAlive
          presentation={{ tabStyle: "icons", directTabButtons: true }}
          selectedId={snapshot.activePickerId ?? undefined}
          onSelectedIdChange={(id) => controller.choosePicker(id)}
          items={controller.getPickers().map((picker) => ({ id: picker.id, label: picker.label, accessibleLabel: picker.label, icon: picker.icon, render: () => picker.render(pickerContext) }))}
        />
        <div data-nse-part="sample-row">
          <button type="button" data-nse-part="eyedropper" aria-label="Pick a colour from the screen" aria-pressed={eyeDropperState === "picking"} disabled={disabled || !eyeDropper || eyeDropper.availability() !== "available"} onClick={() => { void pick(); }}>
            <NSEColourMagnifierIcon />
          </button>
          <div data-nse-part="current-colour" role="img" aria-label={`Current colour ${currentHex}`} title="Drag to a colour well or a saved-colour slot" draggable={!disabled} style={{ "--nse-colour-sample": current.toCSS() } as CSSProperties} onDragStart={(event) => { writeDraggedColour(event, current); }} />
        </div>
        {eyeDropperState !== "idle" && eyeDropperState !== "picking" ? <p role="status" data-nse-part="eyedropper-status">{eyeDropperMessages[eyeDropperState]}</p> : null}
        {showsAlpha ? <div data-nse-part="opacity-row" style={{ "--nse-colour-channel-track": `linear-gradient(to right, ${current.withAlpha(0).toCSS()}, ${current.withAlpha(1).toCSS()})` } as CSSProperties}>
          <span data-nse-part="row-label" aria-hidden="true">Opacity</span>
          <NSESlider controlSize="mini" aria-label="Opacity" minimum={0} maximum={100} disabled={disabled} value={opacity} onValueChange={(value, phase) => {
            const live = controller.getSnapshot().current ?? initialPanelColour;
            const next = live.withAlpha(value / 100);
            if (phase === "commit") controller.commit(next, "pointer");
            else if (value !== Math.round(live.components.a * 100)) controller.preview(next, "pointer");
          }} />
          <span data-nse-part="opacity-value" aria-hidden="true">{opacity}%</span>
        </div> : null}
        <div data-nse-part="hex-row">
          <span data-nse-part="row-label" aria-hidden="true">Hex</span>
          <NSETextField height={nseColourPanelControlHeight} data-nse-part="hex-entry" aria-label="Hex colour" prefix="#" spellCheck={false} autoComplete="off" autoCapitalize="characters" maxLength={40} value={hexText(current)} validation={hexError ? { kind: "invalid", code: "colour-parse", message: "Enter a hex code such as 3366CC, or a CSS colour." } : undefined} onValueChange={(text, phase) => {
            if (phase !== "commit") { setHexError(false); return; }
            const next = parseHexEntry(text);
            if (!next) { setHexError(true); return; }
            controller.commit(next, "text");
          }} />
        </div>
        <NSEColourSwatchStrip swatches={snapshot.swatches} current={current} disabled={disabled} onChoose={(colour) => controller.commit(colour, "swatch")} onChange={(next) => controller.setSwatches(next)} />
      </fieldset>
    </section>
    </NSEUtilityPanel>
  );
}
