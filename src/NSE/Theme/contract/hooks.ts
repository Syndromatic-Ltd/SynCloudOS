/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { NSEControlStateValue } from "../../Controls/Buttons/NSEButton";
import { nseThemeControls, nseThemeParts, nseThemeVariants, type NSEThemeControlName, type NSEThemePartName } from "./vocabulary";

const controls = new Set<string>(nseThemeControls), parts = new Set<string>(nseThemeParts), variants = new Set<string>(nseThemeVariants);

export function nseControlHooks(input: {
  control: NSEThemeControlName;
  state?: NSEControlStateValue;
  highlighted?: boolean;
  enabled?: boolean;
  selected?: boolean;
  hovered?: boolean;
  focused?: boolean;
  keyWindow?: boolean;
  variants?: Readonly<Record<string, string>>;
}): Record<`data-nse-${string}`, string> {
  if (!controls.has(input.control)) throw new TypeError(`Unknown theme control: ${String(input.control)}.`);
  const attributes: Record<`data-nse-${string}`, string> = { "data-nse-control": input.control };
  if (input.state !== undefined) {
    if (!["on", "off", "mixed"].includes(input.state)) throw new TypeError(`Unknown control state: ${String(input.state)}.`);
    attributes["data-nse-state"] = input.state;
  }
  for (const state of ["highlighted", "selected", "hovered", "focused"] as const) if (input[state]) attributes[`data-nse-${state}`] = "";
  if (input.enabled === false) attributes["data-nse-enabled"] = "false";
  if (input.keyWindow === false) attributes["data-nse-key-window"] = "false";
  for (const [name, value] of Object.entries(input.variants ?? {})) {
    if (!variants.has(name) || typeof value !== "string" || !value) throw new TypeError(`Unknown or invalid theme variant: ${name}.`);
    attributes[`data-nse-${name}`] = value;
  }
  return attributes;
}

export function nsePartHooks(part: NSEThemePartName): { "data-nse-part": NSEThemePartName } {
  if (!parts.has(part)) throw new TypeError(`Unknown theme part: ${String(part)}.`);
  return { "data-nse-part": part };
}
