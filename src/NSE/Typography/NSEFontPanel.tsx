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

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { GFXColour } from "../../FX/GraphicsFX/public";
import { useNSEColourPanelContextCarrier, useOptionalNSEColourPanelController, useOptionalNSEColourPanelResponderId } from "../Colour/ColourPanel/NSEColourPanelProvider";
import { NSEToolButton, NSEToolButtonGroup } from "../Controls/Buttons/NSEButtonFamilies";
import { NSEPushButton } from "../Controls/Buttons/NSEButtons";
import { NSETextField } from "../Controls/Fields/NSEFields";
import { NSESearchField } from "../Controls/Fields/NSESearchField";
import { NSECircularSlider } from "../Controls/Values/NSECircularSlider";
import { NSESlider } from "../Controls/Values/NSESlider";
import { useNSEArrayController } from "../Controllers";
import { NSETable, type NSEDataViewAdapter, type NSETableColumn } from "../DataViews";
import type { NSEFontFamily, NSEFontPreset } from "../Text/fontDescriptors";
import { useNSEDeferredDisposal, type NSEDisposalScheduler } from "../interactionLifecycle";
import { NSEMenu } from "../Menus/NSEMenu";
import type { NSEMenuItemDefinition } from "../Menus/menuTypes";
import { useNSEOverlayProvider } from "../Overlays/NSEOverlayProvider";
import { NSEUtilityPanel } from "../Overlays/NSEUtilityPanel";
import { NSEToolbar } from "../Toolbars/NSEToolbar";
import { DocumentColourGlyph, GearGlyph, MinusGlyph, PlusGlyph, ShadowGlyph, StrikethroughGlyph, TextColourGlyph, UnderlineGlyph } from "./fontPanelIcons";
import type { NSEFontLibrary, NSEFontLibrarySnapshot } from "./NSEFontLibrary";
import { NSEFontManager } from "./NSEFontManager";
import { NSERuler } from "./NSERuler";
import {
  cssForTextShadow,
  normaliseParagraphStyle,
  normaliseParagraphStyleMutation,
  type NSEFontCommandPayload,
  type NSEParagraphAlignment,
  type NSEParagraphStyle,
  type NSETextAttributesMutation,
  type NSETextShadow,
} from "./typographyTypes";

export type NSEFontPanelCommandId = "format.font" | "format.paragraph" | "format.attributes";
export interface NSEFontPanelCommandResult { readonly status: "executed" | "cancelled" | "disabled" | "denied" | "unhandled" | "invalid-payload" | "failed" | "unknown" }
export interface NSEFontPanelCommandPort {
  execute(commandId: NSEFontPanelCommandId, payload: NSEFontCommandPayload | NSEParagraphStyle | NSETextAttributesMutation, signal: AbortSignal): Promise<NSEFontPanelCommandResult>;
}

export interface NSEFontPanelProps {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly manager: NSEFontManager;
  readonly commandPort: NSEFontPanelCommandPort;
  /** Fallback responder for the action menu when its overlay has no default. */
  readonly parentResponderId?: string;
  readonly parentWindowControllerId?: string;
  readonly initialFontId?: string;
  readonly initialSize?: number;
  readonly paragraphStyle?: NSEParagraphStyle;
  /** Opens with the paragraph ruler showing; the action menu toggles it. */
  readonly showsRuler?: boolean;
  readonly direction?: "ltr" | "rtl";
  readonly readOnly?: boolean;
  /** The window title; "Font", as NSFontPanel's. */
  readonly title?: string;
  readonly "aria-label"?: string;
  onOpenChange(open: boolean): void;
}

/* Alignment glyphs: four rules, ragged to the aligned edge (logical, so they mirror in RTL). */
const alignmentRules: Readonly<Record<NSEParagraphAlignment, readonly (readonly [number, number])[]>> = {
  start: [[2, 14], [2, 10], [2, 13], [2, 8]],
  centre: [[2, 14], [4, 12], [3, 13], [5, 11]],
  end: [[2, 14], [6, 14], [3, 14], [8, 14]],
  justify: [[2, 14], [2, 14], [2, 14], [2, 10]],
};
const alignmentLabels: ReadonlyArray<readonly [NSEParagraphAlignment, string]> = [["start", "Start paragraph"], ["centre", "Centre paragraph"], ["end", "End paragraph"], ["justify", "Justify paragraph"]];

function AlignmentGlyph({ alignment }: { readonly alignment: NSEParagraphAlignment }): ReactNode {
  return <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" data-nse-part="alignment-glyph">
    {alignmentRules[alignment].map(([from, to], index) => <path key={index} d={`M${from} ${3.5 + index * 3}H${to}`} />)}
  </svg>;
}

const previewMaximumSize = 48;
/** NSFontPanel's standard sizes. */
const standardSizes = [9, 10, 11, 12, 13, 14, 18, 24, 36, 48, 64, 72, 96, 144, 288] as const;
const minimumSize = 1;
const maximumSize = 512;
/* The size slider runs on a logarithmic scale from 6 to 288 points, as the
   eye reads type sizes: a step at 9pt is as visible as one at 144pt. */
const sliderFloor = 6;
const sliderCeiling = 288;
const sizeToSlider = (size: number) => Math.round(100 * Math.log(Math.max(sliderFloor, Math.min(sliderCeiling, size)) / sliderFloor) / Math.log(sliderCeiling / sliderFloor));
const sliderToSize = (value: number) => Math.round(sliderFloor * (sliderCeiling / sliderFloor) ** (value / 100));

type CollectionId = "all" | "favourites" | "recents" | "mine";
const collections: readonly { readonly id: CollectionId; readonly label: string }[] = [
  { id: "all", label: "All Fonts" },
  { id: "favourites", label: "Favourites" },
  { id: "recents", label: "Recently Used" },
  { id: "mine", label: "My Fonts" },
];

interface ShadowSettings {
  readonly enabled: boolean;
  /** 0–100 per cent. */
  readonly opacity: number;
  readonly blur: number;
  readonly offset: number;
  /** Degrees anticlockwise from the right, as the Mac reads it: 315° falls
   * down and to the right. */
  readonly angle: number;
}

const defaultShadow: ShadowSettings = { enabled: false, opacity: 50, blur: 3, offset: 2, angle: 315 };

function textShadowFor(settings: ShadowSettings): NSETextShadow {
  const radians = settings.angle * Math.PI / 180;
  const round = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  const alpha = Math.round(Math.max(0, Math.min(100, settings.opacity)) * 2.55).toString(16).padStart(2, "0");
  return { colour: `#000000${alpha}`, blur: settings.blur, offsetX: round(Math.cos(radians) * settings.offset), offsetY: round(-Math.sin(radians) * settings.offset) };
}

/* The dial turns clockwise from the top; the shadow's angle runs anticlockwise
   from the right. */
const angleToDial = (angle: number) => ((90 - angle) % 360 + 360) % 360;
const dialToAngle = (dial: number) => ((90 - dial) % 360 + 360) % 360;

function fontPanelAbort(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

const disposalScheduler: NSEDisposalScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

interface FontListItem {
  readonly id: string;
  readonly label: string;
  readonly style?: CSSProperties;
}

const listRowHeight = 18;
const listHeaderHeight = 19;
/** The size list ends level with the other lists (a header and six rows):
 * the size caption and the mini field take the rest, so a row shows in part,
 * as on the Mac. */
const sizeListRows = 4.1;
/* The column the scroller takes, so a list's one column fills beside it. */
const scrollerGutter = 15;

/** One of the panel's lists: an NSETable of a single, fixed column. */
function FontPanelList({ title, label, items, selectedId, width, rows, headerHidden = false, readOnly, onSelect }: {
  readonly title: string;
  readonly label: string;
  readonly items: readonly FontListItem[];
  readonly selectedId: string | null;
  readonly width: number;
  readonly rows: number;
  readonly headerHidden?: boolean;
  readonly readOnly: boolean;
  onSelect(id: string): void;
}) {
  const instanceId = useId().replace(/:/g, "");
  // The controller lives as long as the list; content follows in the effect.
  const controller = useNSEArrayController<FontListItem, string>({
    id: `font-panel-list-${instanceId}`,
    content: items,
    getId: (item) => item.id,
    selection: { mode: "single", allowsEmpty: true, preservesSelection: true },
  });
  useEffect(() => {
    controller.setContent(items);
    controller.select(selectedId !== null && items.some((item) => item.id === selectedId) ? [selectedId] : []);
  }, [controller, items, selectedId]);
  const adapter = useMemo<NSEDataViewAdapter<FontListItem, string>>(() => ({ controller, idForItem: (item) => item.id, labelForItem: (item) => item.label }), [controller]);
  const columnWidth = width - scrollerGutter;
  const columns = useMemo<readonly NSETableColumn<FontListItem, string, unknown>[]>(() => [{
    id: "name",
    title,
    value: (item) => item.label,
    width: { min: columnWidth, ideal: columnWidth, max: columnWidth },
    render: (_value, item) => <span data-nse-part="font-list-label" style={item.style}>{item.label}</span>,
  }], [columnWidth, title]);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  return <NSETable
    aria-label={label}
    adapter={adapter}
    columns={columns}
    selectionMode="single"
    rowHeight={listRowHeight}
    headerHeight={listHeaderHeight}
    headerHidden={headerHidden}
    viewportBlockSize={rows * listRowHeight}
    state={readOnly ? { kind: "read-only", message: "Fonts can't be changed here." } : undefined}
    data-nse-part="font-list"
    style={{ inlineSize: `${width}px` }}
    onSelectionChange={(event) => {
      if (event.reason === "controller-change" || readOnly) return;
      const next = [...event.snapshot.selectedIds][0];
      if (next !== undefined && next !== selectedRef.current) onSelect(next);
    }}
  />;
}

/**
 * A colour button of the effects bar: a tool button showing its colour in a
 * chip, which makes itself the shared colour panel's target and opens it, as
 * NSFontPanel's colour buttons set NSColorPanel's target. The panel previews
 * into the chip as it moves and commits to the text when it settles. With no
 * colour panel in the app the button is unavailable. Until a colour is chosen
 * the colour is automatic, the document's own ink or ground, and the chip
 * shows that.
 */
function EffectColourButton({ id, label, glyph, value, automatic, disabled, onPreview, onCommit }: { readonly id: string; readonly label: string; readonly glyph: ReactNode; readonly value: GFXColour | null; readonly automatic: "ink" | "ground"; readonly disabled: boolean; onPreview(colour: GFXColour | null): void; onCommit(colour: GFXColour): void }) {
  const controller = useOptionalNSEColourPanelController();
  // An app's Colours panel may only target a responder the app owns: the
  // provider's scoped one, as a colour well targets.
  const targetResponderId = useOptionalNSEColourPanelResponderId() ?? `${id}:responder`;
  const [preview, setPreview] = useState<GFXColour | null>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const showPreview = (colour: GFXColour | null) => { setPreview(colour); previewRef.current(colour); };
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const releaseRef = useRef<(() => void) | null>(null);
  // The target is released when the button goes, not when React replays its
  // effects (a window reordered in development moves, and so replays, its
  // content), which would close the Colours panel under the user.
  const target = useMemo(() => ({ dispose: () => { releaseRef.current?.(); releaseRef.current = null; } }), []);
  useNSEDeferredDisposal(target, disposalScheduler);
  const shown = preview ?? value;
  // The Colours panel places itself beside the element bearing its target's
  // id, and presents only once it finds it.
  return <NSEToolButton
    id={id}
    label={label}
    title={controller ? label : `${label}: this app has no colour panel`}
    disabled={disabled || !controller}
    data-nse-part="effect-colour"
    icon={<span data-nse-part="effect-colour-face">{glyph}<span ref={chipRef} data-nse-part="colour-chip" data-automatic={shown ? undefined : automatic} style={shown ? { "--nse-font-panel-chip": shown.toCSS() } as CSSProperties : undefined} /></span>}
    onClick={() => {
      if (!controller) return;
      releaseRef.current?.();
      releaseRef.current = controller.activateTarget({
        id,
        responderId: targetResponderId,
        showsAlpha: false,
        // An automatic colour opens the panel on the colour the chip shows.
        read: () => valueRef.current ?? GFXColour.parse(chipRef.current ? getComputedStyle(chipRef.current).backgroundColor : automatic === "ink" ? "#000" : "#fff"),
        preview: ({ current }) => showPreview(current),
        commit: ({ current }) => { showPreview(null); commitRef.current(current); },
        cancel: () => showPreview(null),
      });
      controller.open();
    }}
  />;
}

/**
 * The action (gear) menu. Its popup's parent is the window hosting the
 * panel, whose overlay host names it; outside a window host it falls back to
 * the panel's own parent responder.
 */
function FontActionsMenu({ fallbackParentResponderId, items, onSelect }: { readonly fallbackParentResponderId?: string; readonly items: readonly NSEMenuItemDefinition[]; onSelect(value: string): void }) {
  const overlays = useNSEOverlayProvider();
  return <NSEMenu label={<GearGlyph />} trigger="tool" triggerLabel="Font actions" controlSize="small" parentResponderId={overlays.defaultParentResponderId ?? fallbackParentResponderId} items={items} data-nse-part="action-menu" onSelect={onSelect} />;
}

function familyMatchesQuery(family: NSEFontFamily, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle.length === 0 || family.label.toLocaleLowerCase().includes(needle) || family.presets.some((preset) => `${family.label} ${preset.label}`.toLocaleLowerCase().includes(needle));
}

const emptyLibrarySnapshot: NSEFontLibrarySnapshot = Object.freeze({ userFamilies: Object.freeze([]), favourites: Object.freeze([]), recents: Object.freeze([]) });
const noSubscription = () => () => undefined;

function useLibrarySnapshot(library: NSEFontLibrary | null): NSEFontLibrarySnapshot {
  return useSyncExternalStore(library?.subscribe ?? noSubscription, library?.getSnapshot ?? (() => emptyLibrarySnapshot), library?.getSnapshot ?? (() => emptyLibrarySnapshot));
}

/**
 * NSFontPanel, after Mac OS X 10.3: a preview of the chosen face over the
 * chequered sample ground; the effects bar (underline, strikethrough, text
 * and document colours, and a shadow with its opacity, blur, offset and
 * angle); and Collections, Family, Typeface and Size columns. Choosing
 * applies at once, as on the Mac; there is no Apply button.
 *
 * + adds fonts from files to My Fonts (see NSEFontLibrary); − takes the
 * chosen face out of Favourites, or removes a font the user added. The
 * action menu keeps favourites and shows or hides the preview, the effects
 * and the paragraph ruler.
 */
export function NSEFontPanel({ open, anchor, manager, commandPort, parentResponderId, parentWindowControllerId = "font-panel-window", initialFontId, initialSize = 12, paragraphStyle, showsRuler: initiallyShowsRuler = false, direction = "ltr", readOnly = false, title = "Font", "aria-label": label = "Font panel", onOpenChange }: NSEFontPanelProps) {
  const library = manager.library;
  const librarySnapshot = useLibrarySnapshot(library);
  useEffect(() => { void library?.restore(); }, [library]);
  const allFamilies = useMemo(() => [...manager.availableFamilies, ...librarySnapshot.userFamilies], [manager.availableFamilies, librarySnapshot.userFamilies]);
  const firstFamily = allFamilies[0];
  const initialPreset = manager.getPreset(initialFontId ?? "") ?? manager.getPreset(firstFamily?.defaultPresetId ?? "");
  const [collection, setCollection] = useState<CollectionId>("all");
  const [query, setQuery] = useState("");
  const [familyId, setFamilyId] = useState(initialPreset?.familyId ?? "");
  const [fontId, setFontId] = useState(initialPreset?.id ?? "");
  useEffect(() => {
    if (manager.getPreset(fontId)) return;
    const first = allFamilies[0];
    const next = manager.getPreset(first?.defaultPresetId ?? "") ?? first?.presets[0];
    setFamilyId(next?.familyId ?? "");
    setFontId(next?.id ?? "");
  }, [manager, allFamilies, fontId]);
  const [size, setSize] = useState(initialSize);
  const [sizeText, setSizeText] = useState(String(initialSize));
  const [underline, setUnderline] = useState(false);
  const [strike, setStrike] = useState(false);
  // Null is automatic: the document's own ink and ground.
  const [textColour, setTextColour] = useState<GFXColour | null>(null);
  const [documentColour, setDocumentColour] = useState<GFXColour | null>(null);
  const [colourPreview, setColourPreview] = useState<{ readonly text?: GFXColour | null; readonly document?: GFXColour | null }>({});
  const shownTextColour = colourPreview.text ?? textColour;
  const shownDocumentColour = colourPreview.document ?? documentColour;
  const [shadow, setShadow] = useState<ShadowSettings>(defaultShadow);
  const [showsPreview, setShowsPreview] = useState(true);
  const [showsEffects, setShowsEffects] = useState(true);
  const [showsRuler, setShowsRuler] = useState(initiallyShowsRuler);
  const [style, setStyle] = useState(() => normaliseParagraphStyle(paragraphStyle ?? { alignment: "start" }));
  const [status, setStatus] = useState<NSEFontPanelCommandResult["status"] | "idle">("idle");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carryColourPanel = useNSEColourPanelContextCarrier();
  const lifecycle = useRef({
    active: false,
    sessionOpen: false,
    sessionGeneration: 0,
    intentGenerations: new Map<NSEFontPanelCommandId, number>(),
    operations: new Map<NSEFontPanelCommandId, AbortController>(),
  });
  const instanceId = useId().replace(/:/g, "");
  // The anchor only places the panel as it opens: Show Fonts from a menu has
  // none, and the panel stays open when the control that opened it goes.
  const effectiveOpen = open;
  const endSession = (reason: Error) => {
    const current = lifecycle.current;
    if (!current.sessionOpen && current.operations.size === 0) return;
    current.sessionOpen = false;
    current.sessionGeneration += 1;
    for (const operation of current.operations.values()) operation.abort(reason);
    current.operations.clear();
  };
  useLayoutEffect(() => {
    lifecycle.current.active = true;
    return () => {
      lifecycle.current.active = false;
      endSession(fontPanelAbort("Font panel was unmounted."));
    };
  }, []);
  useLayoutEffect(() => {
    const current = lifecycle.current;
    if (effectiveOpen) {
      if (!current.sessionOpen) {
        current.sessionOpen = true;
        current.sessionGeneration += 1;
      }
      return;
    }
    endSession(fontPanelAbort("Font panel session was closed."));
  }, [effectiveOpen]);

  const execute = (commandId: NSEFontPanelCommandId, payload: NSEFontCommandPayload | NSEParagraphStyle | NSETextAttributesMutation) => {
    const current = lifecycle.current;
    if (readOnly || !current.active || !current.sessionOpen || !effectiveOpen) return;
    current.operations.get(commandId)?.abort(fontPanelAbort(`A newer ${commandId} intent superseded this operation.`));
    const sessionGeneration = current.sessionGeneration;
    const intentGeneration = (current.intentGenerations.get(commandId) ?? 0) + 1;
    current.intentGenerations.set(commandId, intentGeneration);
    const operation = new AbortController();
    current.operations.set(commandId, operation);
    setStatus("idle");
    void commandPort.execute(commandId, payload, operation.signal).then((result) => {
      const latest = lifecycle.current;
      if (latest.active && latest.sessionOpen && latest.sessionGeneration === sessionGeneration && latest.intentGenerations.get(commandId) === intentGeneration && !operation.signal.aborted) setStatus(result.status);
    }).catch(() => {
      const latest = lifecycle.current;
      if (latest.active && latest.sessionOpen && latest.sessionGeneration === sessionGeneration && latest.intentGenerations.get(commandId) === intentGeneration && !operation.signal.aborted) setStatus("failed");
    }).finally(() => {
      if (lifecycle.current.operations.get(commandId) === operation) lifecycle.current.operations.delete(commandId);
    });
  };

  // Applying: a choice in any column changes the selection's font at once.
  const applyFont = (nextFontId: string, nextSize: number) => {
    if (!manager.getPreset(nextFontId)) return;
    try {
      execute("format.font", manager.fontCommand(nextFontId, nextSize));
      library?.noteUsed(nextFontId);
    } catch {
      setStatus("invalid-payload");
    }
  };
  const applyAttributes = (mutation: NSETextAttributesMutation) => execute("format.attributes", mutation);
  const updateParagraph = (next: NSEParagraphStyle) => {
    if (readOnly) return;
    const mutation = normaliseParagraphStyleMutation(next);
    setStyle(mutation);
    execute("format.paragraph", mutation);
  };

  // What each column lists follows the collection and the search.
  const presetIdsInCollection = collection === "favourites" ? new Set(librarySnapshot.favourites) : collection === "recents" ? new Set(librarySnapshot.recents) : null;
  const collectionFamilies = allFamilies
    .filter((family) => collection !== "mine" || librarySnapshot.userFamilies.includes(family))
    .map((family) => presetIdsInCollection ? { ...family, presets: family.presets.filter((preset) => presetIdsInCollection.has(preset.id)) } : family)
    .filter((family) => family.presets.length > 0 && familyMatchesQuery(family, query));
  const family: NSEFontFamily | undefined = collectionFamilies.find((candidate) => candidate.id === familyId);
  const typefaces: readonly NSEFontPreset[] = family?.presets ?? [];
  const preset = manager.getPreset(fontId);
  const presetFamily = manager.getFamily(preset?.familyId ?? "") ?? family;

  const chooseFamily = (nextFamilyId: string) => {
    const next = collectionFamilies.find((candidate) => candidate.id === nextFamilyId);
    if (!next) return;
    setFamilyId(next.id);
    // Keep the face across families where the new one has it ("Bold" stays
    // bold), as the Mac does; otherwise take the family's own default.
    const sameFace = next.presets.find((candidate) => candidate.label === preset?.label);
    const nextFont = sameFace ?? next.presets.find((candidate) => candidate.id === next.defaultPresetId) ?? next.presets[0]!;
    setFontId(nextFont.id);
    applyFont(nextFont.id, size);
  };
  const chooseTypeface = (nextFontId: string) => {
    setFontId(nextFontId);
    applyFont(nextFontId, size);
  };
  const chooseSize = (nextSize: number) => {
    if (!Number.isFinite(nextSize)) return;
    const bounded = Math.max(minimumSize, Math.min(maximumSize, Math.round(nextSize * 10) / 10));
    setSize(bounded);
    setSizeText(String(bounded));
    applyFont(fontId, bounded);
  };

  const shadowPayload = (settings: ShadowSettings): NSETextAttributesMutation => ({ shadow: settings.enabled ? textShadowFor(settings) : null });
  const changeShadow = (patch: Partial<ShadowSettings>, phase: "preview" | "commit") => {
    const next = { ...shadow, ...patch };
    setShadow(next);
    if (phase === "commit" && next.enabled) applyAttributes(shadowPayload(next));
  };

  const addFonts = async (files: readonly File[]) => {
    if (!library || files.length === 0) return;
    const result = await library.addFonts(files);
    const first = result.added[0];
    if (first) {
      setCollection("mine");
      setQuery("");
      const added = library.userPreset(first.id);
      if (added) {
        setFamilyId(added.familyId);
        setFontId(added.id);
      }
    }
    const addedText = result.added.length === 0 ? "" : result.added.length === 1 ? `Added ${result.added[0]!.familyName} ${result.added[0]!.styleName}.` : `Added ${result.added.length} fonts.`;
    const rejectedText = result.rejected.map((entry) => `${entry.fileName}: ${entry.reason}`).join(" ");
    setNotice([addedText, rejectedText].filter(Boolean).join(" "));
  };
  const removable: "favourite" | "font" | null = readOnly ? null
    : collection === "favourites" && librarySnapshot.favourites.includes(fontId) ? "favourite"
      : manager.isUserFont(fontId) ? "font" : null;
  const remove = async () => {
    if (!library || !removable) return;
    if (removable === "favourite") {
      library.removeFavourite(fontId);
      return;
    }
    const face = library.userFace(fontId);
    if (await library.removeFont(fontId)) {
      const fallback = manager.allFamilies()[0];
      setNotice(face ? `Removed ${face.familyName} ${face.styleName}.` : "Removed the font.");
      setFamilyId(fallback?.id ?? "");
      setFontId(fallback?.defaultPresetId ?? "");
    }
  };

  const previewStyle = (() => {
    if (!preset) return undefined;
    const css = manager.cssForDescriptor(manager.descriptorForPreset(preset.id, Math.max(1, Math.min(previewMaximumSize, size))));
    return {
      fontFamily: css.fontFamily,
      fontSize: css.fontSize,
      fontWeight: css.fontWeight,
      fontStyle: css.fontStyle,
      color: shownTextColour?.toCSS(),
      textDecorationLine: [underline ? "underline" : "", strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
      textShadow: shadow.enabled ? cssForTextShadow(textShadowFor(shadow)) : "none",
    } satisfies CSSProperties;
  })();
  const faceName = preset?.label ?? "";
  const familyName = presetFamily?.label ?? "";
  // A face named for its family is named once.
  const description = `${faceName && faceName !== familyName ? `${familyName} ${faceName}` : familyName} ${size.toFixed(1)} pt`;

  const collectionItems = useMemo(() => collections.map(({ id, label: text }) => ({ id, label: text })), []);
  const familyItems = useMemo(() => collectionFamilies.map((candidate) => ({ id: candidate.id, label: candidate.label })), [collectionFamilies.map((candidate) => candidate.id).join("|")]);
  const typefaceItems = useMemo(() => typefaces.map((candidate) => ({ id: candidate.id, label: candidate.label })), [typefaces.map((candidate) => candidate.id).join("|")]);
  const sizeItems = useMemo(() => standardSizes.map((value) => ({ id: String(value), label: String(value) })), []);
  const isFavourite = librarySnapshot.favourites.includes(fontId);
  const effectsDisabled = readOnly;
  const menuItems = [
    { value: "favourite", label: isFavourite ? "Remove from Favourites" : "Add to Favourites", disabled: readOnly || !library || !preset },
    { value: "separator-1", label: "", separator: true },
    { value: "preview", label: showsPreview ? "Hide Preview" : "Show Preview" },
    { value: "effects", label: showsEffects ? "Hide Effects" : "Show Effects" },
    { value: "ruler", label: showsRuler ? "Hide Ruler" : "Show Ruler" },
    { value: "separator-2", label: "", separator: true },
    { value: "add-fonts", label: "Add Fonts…", disabled: readOnly || !library?.canAddFonts },
  ];

  // An inspector (NSFontPanel): it floats beside the document and stays open
  // while the user keeps typing; its close control ends the session.
  return <NSEUtilityPanel id={`font-panel-${instanceId}`} open={effectiveOpen} title={title} anchor={anchor} parentWindowControllerId={parentWindowControllerId} contentInset="none" onClose={() => {
    endSession(fontPanelAbort("Font panel session was closed."));
    onOpenChange(false);
  }} onDismissRefused={() => onOpenChange(true)}>
    {carryColourPanel(<section data-nse-control="font-panel" data-state={readOnly ? "read-only" : !preset ? "unavailable" : status === "idle" || status === "executed" ? "ready" : status} dir={direction} aria-label={label}>
      {showsPreview ? <div data-nse-part="preview" style={shownDocumentColour ? { "--nse-font-panel-document": shownDocumentColour.toCSS() } as CSSProperties : undefined}>
        <output data-nse-part="preview-sample" aria-label={`Preview: ${description}`} style={previewStyle}>{familyName}</output>
        <p data-nse-part="preview-description" aria-hidden="true">{description}</p>
      </div> : null}

      {showsEffects ? <div role="toolbar" aria-label="Text effects" data-nse-part="effects">
        <NSEToolButtonGroup controlSize="small" label="Lines">
          <NSEToolButton label="Underline" icon={<UnderlineGlyph />} selected={underline} aria-pressed={underline} disabled={effectsDisabled} onClick={() => { const next = !underline; setUnderline(next); applyAttributes({ underline: next }); }} />
          <NSEToolButton label="Strikethrough" icon={<StrikethroughGlyph />} selected={strike} aria-pressed={strike} disabled={effectsDisabled} onClick={() => { const next = !strike; setStrike(next); applyAttributes({ strike: next }); }} />
        </NSEToolButtonGroup>
        <NSEToolButtonGroup controlSize="small" label="Colours">
          <EffectColourButton id={`font-panel-${instanceId}-text-colour`} label="Text colour" glyph={<TextColourGlyph />} value={textColour} automatic="ink" disabled={effectsDisabled} onPreview={(colour) => setColourPreview((current) => ({ ...current, text: colour }))} onCommit={(colour) => { setTextColour(colour); applyAttributes({ foregroundColour: colour.toHex({ includeAlpha: colour.components.a < 1 }) }); }} />
          <EffectColourButton id={`font-panel-${instanceId}-document-colour`} label="Document colour" glyph={<DocumentColourGlyph />} value={documentColour} automatic="ground" disabled={effectsDisabled} onPreview={(colour) => setColourPreview((current) => ({ ...current, document: colour }))} onCommit={(colour) => { setDocumentColour(colour); applyAttributes({ documentColour: colour.toHex({ includeAlpha: colour.components.a < 1 }) }); }} />
        </NSEToolButtonGroup>
        <NSEToolButtonGroup controlSize="small" label="Shadow">
          <NSEToolButton label="Text shadow" icon={<ShadowGlyph />} selected={shadow.enabled} aria-pressed={shadow.enabled} disabled={effectsDisabled} onClick={() => {
            const next = { ...shadow, enabled: !shadow.enabled };
            setShadow(next);
            applyAttributes(shadowPayload(next));
          }} />
        </NSEToolButtonGroup>
        <NSESlider controlSize="mini" length={36} aria-label="Shadow opacity" value={shadow.opacity} minimum={0} maximum={100} step={1} disabled={effectsDisabled || !shadow.enabled} tooltip={(value) => `Opacity ${value}%`} onValueChange={(value, phase) => changeShadow({ opacity: value }, phase)} />
        <NSESlider controlSize="mini" length={36} aria-label="Shadow blur" value={shadow.blur} minimum={0} maximum={20} step={1} disabled={effectsDisabled || !shadow.enabled} tooltip={(value) => `Blur ${value}`} onValueChange={(value, phase) => changeShadow({ blur: value }, phase)} />
        <NSESlider controlSize="mini" length={36} aria-label="Shadow offset" value={shadow.offset} minimum={0} maximum={20} step={1} disabled={effectsDisabled || !shadow.enabled} tooltip={(value) => `Offset ${value}`} onValueChange={(value, phase) => changeShadow({ offset: value }, phase)} />
        <NSECircularSlider controlSize="small" aria-label="Shadow angle" value={angleToDial(shadow.angle)} minimum={0} maximum={360} step={5} wraps disabled={effectsDisabled || !shadow.enabled} valueText={(dial) => `${dialToAngle(dial)} degrees`} onValueChange={(dial, phase) => changeShadow({ angle: dialToAngle(dial) }, phase)} />
        <output data-nse-part="shadow-angle" aria-hidden="true">{shadow.angle}°</output>
      </div> : null}

      <div data-nse-part="columns">
        <FontPanelList title="Collections" label="Collections" items={collectionItems} selectedId={collection} width={112} rows={6} readOnly={false} onSelect={(id) => setCollection(id as CollectionId)} />
        <FontPanelList title="Family" label="Font family" items={familyItems} selectedId={family ? family.id : null} width={124} rows={6} readOnly={readOnly} onSelect={chooseFamily} />
        <FontPanelList title="Typeface" label="Typeface" items={typefaceItems} selectedId={typefaces.some((candidate) => candidate.id === fontId) ? fontId : null} width={118} rows={6} readOnly={readOnly} onSelect={chooseTypeface} />
        <div data-nse-part="size-column" role="group" aria-label="Size">
          <span data-nse-part="column-caption" aria-hidden="true">Size</span>
          <NSETextField controlSize="mini" aria-label="Font size" type="number" inputMode="decimal" min={minimumSize} max={maximumSize} disabled={readOnly || !preset} value={sizeText}
            onChange={(event) => setSizeText(event.currentTarget.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); chooseSize(Number(sizeText)); } }}
            onBlur={() => { if (Number(sizeText) !== size) chooseSize(Number(sizeText)); }} />
          <div data-nse-part="size-list">
            <FontPanelList title="Size" label="Font sizes" items={sizeItems} selectedId={standardSizes.includes(size as typeof standardSizes[number]) ? String(size) : null} width={42} rows={sizeListRows} headerHidden readOnly={readOnly || !preset} onSelect={(id) => chooseSize(Number(id))} />
            <NSESlider controlSize="mini" orientation="vertical" length={sizeListRows * listRowHeight} aria-label="Font size slider" value={sizeToSlider(size)} minimum={0} maximum={100} step={1} disabled={readOnly || !preset}
              onValueChange={(value, phase) => {
                const next = sliderToSize(value);
                setSize(next);
                setSizeText(String(next));
                if (phase === "commit") applyFont(fontId, next);
              }} />
          </div>
        </div>
      </div>

      <div data-nse-part="footer">
        <NSEToolButtonGroup controlSize="small" label="Add or remove fonts">
          <NSEToolButton label="Add fonts" icon={<PlusGlyph />} disabled={readOnly || !library?.canAddFonts} onClick={() => fileInputRef.current?.click()} />
          <NSEToolButton label={removable === "favourite" ? "Remove from Favourites" : "Remove font"} icon={<MinusGlyph />} disabled={removable === null} onClick={() => { void remove(); }} />
        </NSEToolButtonGroup>
        <FontActionsMenu fallbackParentResponderId={parentResponderId} items={menuItems} onSelect={(value) => {
          if (value === "favourite" && library) { if (isFavourite) library.removeFavourite(fontId); else library.addFavourite(fontId); }
          else if (value === "preview") setShowsPreview((shown) => !shown);
          else if (value === "effects") setShowsEffects((shown) => !shown);
          else if (value === "ruler") setShowsRuler((shown) => !shown);
          else if (value === "add-fonts") fileInputRef.current?.click();
        }} />
        <NSESearchField controlSize="small" aria-label="Search fonts" placeholder="Search" value={query} onValueChange={setQuery} />
        <input ref={fileInputRef} type="file" multiple hidden accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" data-nse-part="font-file-input" onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = "";
          void addFonts(files);
        }} />
      </div>

      {showsRuler ? <fieldset data-nse-part="paragraph" disabled={readOnly}>
        <legend className="nse-control-visually-hidden">Paragraph</legend>
        <NSEToolbar composition="children" position="inline" grouped aria-label="Paragraph alignment" aria-disabled={readOnly || undefined}>
          {alignmentLabels.map(([alignment, text]) => <NSEPushButton key={alignment} tone="dark" selected={style.alignment === alignment} disabled={readOnly} aria-label={text} title={text.replace(" paragraph", "")} aria-pressed={style.alignment === alignment} onClick={() => updateParagraph(normaliseParagraphStyleMutation({ ...style, alignment }))}><AlignmentGlyph alignment={alignment} /></NSEPushButton>)}
        </NSEToolbar>
        <NSERuler value={style} direction={direction} readOnly={readOnly} onChange={updateParagraph} />
      </fieldset> : null}
      <p role="status" data-nse-part="notice">{!preset ? "No fonts available." : notice}</p>
      {status !== "idle" && status !== "executed" ? <p role="alert">Typography command {status}.</p> : null}
    </section>)}
  </NSEUtilityPanel>;
}
