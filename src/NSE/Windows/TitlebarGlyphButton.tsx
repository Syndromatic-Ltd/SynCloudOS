/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { createContext, useCallback, useContext, useState, type CSSProperties, type MouseEvent, type Ref } from "react";
import { useNSEFeedback } from "../Feedback";

/** @internal The material of the title bar a control is drawn in. */
export type WindowTitlebarMaterial = "standard" | "cumulus" | "metal";
/** @internal Set by the title bar view, so its glyph buttons take that bar's art. */
export const WindowTitlebarMaterialContext = createContext<WindowTitlebarMaterial>("standard");

export interface TitlebarGlyphButtonProps {
  readonly label: string;
  /** The mask image's URL. */
  readonly glyph: string;
  readonly position?: "left" | "right";
  readonly selected?: boolean;
  readonly opensMenu?: boolean;
  readonly disabled?: boolean;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** @internal A title-bar glyph button: an inset well in Cumulus glass, a pill on Metal. */
export function TitlebarGlyphButton({ label, glyph, position = "left", selected = false, opensMenu = false, disabled, buttonRef, onClick }: TitlebarGlyphButtonProps) {
  // Toolbar items reach the bar through a portal, so the bar they land in decides when the context cannot.
  const contextMaterial = useContext(WindowTitlebarMaterialContext);
  const [placedMaterial, setPlacedMaterial] = useState<WindowTitlebarMaterial | null>(null);
  const place = useCallback((node: HTMLButtonElement | null) => {
    const found = node?.closest<HTMLElement>("[data-titlebar-material]")?.dataset.titlebarMaterial;
    setPlacedMaterial(found === "metal" || found === "cumulus" || found === "standard" ? found : null);
    if (typeof buttonRef === "function") buttonRef(node);
    else if (buttonRef) (buttonRef as { current: HTMLButtonElement | null }).current = node;
  }, [buttonRef]);
  const material = placedMaterial ?? contextMaterial;
  const feedback = useNSEFeedback();
  const glyphStyle = { "--nse-topbar-glyph": `url(${JSON.stringify(glyph)})` } as CSSProperties;
  const shared = {
    ref: place, type: "button" as const, title: label, "aria-label": label, disabled,
    "aria-haspopup": opensMenu ? "menu" as const : undefined, "aria-expanded": opensMenu ? selected : undefined,
    "data-position": position, "data-nse-part": "cell", "data-nse-style": "titlebar", "data-nse-selected": selected ? "" : undefined, "data-window-no-drag": "",
    onClick: (event: MouseEvent<HTMLButtonElement>) => { onClick?.(event); void feedback?.trigger("rigid"); },
  };
  if (material === "metal") {
    return <button {...shared} className="nse-app-topbar-metal-pill" data-nse-material="metal">
      <span className="nse-app-topbar-metal-pill-shell" data-nse-part="bezel" aria-hidden="true" />
      <span className="nse-app-topbar-metal-pill-glyph" data-nse-part="image" style={glyphStyle} aria-hidden="true"><span className="nse-app-topbar-glyph-shape" data-nse-part="indicator" /></span>
    </button>;
  }
  return <button {...shared} className="nse-app-topbar-button" data-nse-material="cumulus">
    <span className="nse-app-topbar-button-well" data-nse-part="bezel" aria-hidden="true"><span className="nse-app-topbar-button-well-selected" data-nse-part="fill" /></span>
    <span className="nse-app-topbar-button-icon" data-nse-part="image" style={glyphStyle} aria-hidden="true"><span className="nse-app-topbar-glyph-shape" data-nse-part="indicator" /></span>
  </button>;
}
