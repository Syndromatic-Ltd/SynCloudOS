/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { createContext, useContext, type DOMAttributes } from "react";
import { useNSEThemeInteraction } from "../../Theme/contract/useThemeInteraction";
import { nseControlHooks } from "../../Theme/contract/hooks";
import type { NSEDatePickerStyle } from "./datePickerTypes";

/** @internal Drawing metadata crosses portals without adding a layout element. */
export const NSEDatePickerDrawingContext = createContext<{ readonly style: NSEDatePickerStyle; readonly enabled: boolean } | null>(null);
export function useNSEDatePickerDrawing(mode: "date" | "time" | "date-time" | "date-range", enabled: boolean, style?: NSEDatePickerStyle, handlers: DOMAttributes<HTMLElement> = {}) {
  const inherited = useContext(NSEDatePickerDrawingContext);
  const available = enabled && inherited?.enabled !== false;
  const interaction = useNSEThemeInteraction<HTMLElement>(available, false, handlers);
  return { events: interaction.events, attributes: { ...nseControlHooks({ control: "date-picker", enabled: available, hovered: interaction.hovered, focused: interaction.focused,
    variants: { "picker-mode": mode, "date-picker-style": style ?? inherited?.style ?? "textFieldAndStepper" } }), "data-nse-part": "bezel" } };
}
